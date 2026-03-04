# Future Enhancements

Prioritized list of potential improvements to the editable viewer, checkpoint system, and model workflow.

## Priority 1 — High Impact

### Checkpoint TTL / Cleanup

**Problem:** `FileCheckpointStore` accumulates JSON files in `$TMPDIR/excalidraw-mcp-checkpoints/` indefinitely. The Redis store has a 30-day TTL, but local dev does not.

**Implementation approach:**
- Add a `ttlMs` option to `FileCheckpointStore` (default 7 days)
- On `save()`, write a timestamp into the JSON (or use file mtime)
- On server startup, run a cleanup sweep: `fs.readdir` the checkpoint directory, `fs.stat` each file, delete any older than `ttlMs`
- Optionally run the sweep periodically (e.g. every hour via `setInterval`)
- For `MemoryCheckpointStore`, use a `Map` with a max size and LRU eviction

**Files to modify:**
- `src/checkpoint-store.ts` — add `ttlMs` to constructor, add `cleanup()` method
- `src/main.ts` — call `store.cleanup()` on startup and optionally on interval

---

### Conflict Resolution (Optimistic Concurrency)

**Problem:** Now that both the browser viewer and `create_view` (with `restoreCheckpoint`) write to the same checkpoint ID, simultaneous writes cause silent last-write-wins data loss.

**Implementation approach:**
- Add a `version: number` field to checkpoint data (starts at 1, increments on each save)
- `POST /api/checkpoint/:id` accepts an optional `expectedVersion` field; if provided and it doesn't match the stored version, return HTTP 409 Conflict
- The viewer's `scheduleSave()` tracks the current version and sends it with each POST; on 409, it reloads the checkpoint and re-applies local changes (or shows a warning)
- `create_view` in `server.ts` doesn't need version checks — it's authoritative when using `restoreCheckpoint` since it merges state server-side

**Files to modify:**
- `src/checkpoint-store.ts` — change `save()` signature to accept/return version, change stored data shape to `{ elements, version }`
- `src/main.ts` — update POST route to check `expectedVersion`
- `src/viewer.ts` — track version, send with POST, handle 409

**Trade-off:** Adds complexity for an edge case. A simpler alternative is to just add a `lastModified` timestamp and show a warning in the viewer if the checkpoint was modified externally since the page loaded.

---

### Change Detection on `get_edits`

**Problem:** `get_edits` returns the full element array, which can be huge. The model has to diff it manually against what it last sent. This wastes tokens and is error-prone.

**Implementation approach — option A (server-side diff):**
- Store a `baseElements` snapshot alongside `elements` when `create_view` saves a checkpoint
- `get_edits` compares current `elements` against `baseElements` and returns a structured diff:
  ```json
  {
    "added": [{ "id": "new1", "type": "rectangle", ... }],
    "moved": [{ "id": "body", "dx": -88.13, "dy": -149.32 }],
    "deleted": ["old1", "old2"],
    "modified": [{ "id": "r1", "changes": { "backgroundColor": "#ff0000" } }],
    "unchanged_count": 15
  }
  ```
- Diff logic: compare by element `id` — missing in current = deleted, missing in base = added, same id but different x/y = moved, same id but other field changes = modified

**Implementation approach — option B (simpler, version-based):**
- Track `lastModelVersion` (the version when `create_view` last saved)
- `get_edits` returns `{ hasEdits: boolean, editCount: number, elements: [...] }`
- Model can check `hasEdits` cheaply before requesting full elements

**Files to modify:**
- `src/checkpoint-store.ts` — store `baseElements` alongside `elements`
- `src/server.ts` — save `baseElements` in `create_view`, add diff logic to `get_edits`

---

## Priority 2 — Nice to Have

### Checkpoint Listing Tool

**Problem:** The model can only access checkpoints whose IDs it remembers from the conversation. If the conversation is long or resuming from a previous session, IDs may be lost.

**Implementation approach:**
- Add `list()` method to `CheckpointStore` interface returning `{ id, createdAt, elementCount }[]`
- `FileCheckpointStore`: `fs.readdir` + `fs.stat` for each file
- `MemoryCheckpointStore`: iterate the Map
- `RedisCheckpointStore`: use a Redis sorted set keyed by creation time
- Register a `list_checkpoints` MCP tool (model-visible, `readOnlyHint: true`)
- Optional: add `GET /api/checkpoints` HTTP endpoint for the viewer

**Files to modify:**
- `src/checkpoint-store.ts` — add `list()` to interface and all implementations
- `src/server.ts` — register `list_checkpoints` tool
- `src/main.ts` — optionally add GET route

---

### Viewer Export Buttons

**Problem:** The `/view/:id` page has no way to export the diagram. The export flow currently only works through the MCP app iframe's `export_to_excalidraw` tool.

**Implementation approach:**
- Add PNG and SVG export buttons to the viewer HTML (top-right, similar to fullscreen button pattern)
- Use Excalidraw's `exportToBlob()` for PNG and `exportToSvg()` for SVG — both available from the `@excalidraw/excalidraw` package
- Trigger browser download via `URL.createObjectURL` + temporary `<a>` element
- For excalidraw.com sharing: call `POST /api/checkpoint/:id/export` which proxies to the existing `export_to_excalidraw` logic in `server.ts`

**Files to modify:**
- `src/viewer.ts` — add export button UI and download logic
- `src/main.ts` — optionally add export proxy route

---

### Copy Link / Share Button

**Problem:** Users viewing a diagram at `/view/:id` have to manually copy the URL to share it.

**Implementation approach:**
- Add a "Copy link" button to the viewer (top-right toolbar area)
- Use `navigator.clipboard.writeText(window.location.href)` with a brief "Copied!" tooltip
- If the server is running on localhost, the link only works locally — could add a note about this

**Files to modify:**
- `src/viewer.ts` — add button and clipboard logic

---

### Checkpoint Diff Tool

**Problem:** When the model wants to understand what changed between two diagram states (e.g., before and after user edits, or between two iterations), it has to fetch both checkpoints and diff them manually.

**Implementation approach:**
- Register a `diff_checkpoints` MCP tool: `{ from: string, to: string }`
- Load both checkpoints, compute diff by element ID (same logic as change detection above)
- Return human-readable summary + structured diff

**Files to modify:**
- `src/server.ts` — register tool, implement diff logic (share with `get_edits` if change detection is also implemented)

---

## Priority 3 — Long Term

### Viewer as Standalone SPA

**Problem:** The viewer is a string template inside `viewer.ts` — no syntax highlighting, no hot reload, hard to maintain as it grows.

**Implementation approach:**
- Extract viewer to `src/viewer/index.html` + `src/viewer/main.ts`
- Add a Vite config for the viewer build (similar to `vite.config.dev.ts`)
- Build outputs a single HTML file (using `vite-plugin-singlefile`, same as the MCP app)
- `viewerHtml()` becomes a function that reads the built HTML and injects the checkpoint ID via string replacement or a `<script>` tag with `window.__CHECKPOINT_ID__`
- Dev mode: `vite dev` serves the viewer with HMR

**Files to modify/add:**
- `src/viewer/index.html` — new
- `src/viewer/main.ts` — new (move logic from current template)
- `vite.config.viewer.ts` — new
- `src/viewer.ts` — simplify to just read built HTML and inject checkpoint ID
- `scripts/build.mjs` — add viewer build step

**Trade-off:** More build complexity for better DX. Only worth it if the viewer grows significantly (e.g., adding export buttons, collaboration features, toolbar).

---

### Edit Notifications (Webhook / Polling)

**Problem:** The model has to manually call `get_edits` to check for user changes. No push mechanism exists.

**Implementation approach — option A (SSE stream):**
- Add `GET /api/checkpoint/:id/events` endpoint returning Server-Sent Events
- When the viewer saves, the POST handler emits an event to any connected SSE listeners
- The model (or a wrapper) subscribes to the SSE stream

**Implementation approach — option B (simple polling):**
- Add a `lastModified` timestamp to checkpoint data
- Add `GET /api/checkpoint/:id/status` returning just `{ lastModified, version, elementCount }`
- The model polls this lightweight endpoint periodically

**Option B is simpler and sufficient for most workflows.** SSE is only worth it if real-time collaboration becomes a goal.

**Files to modify:**
- `src/checkpoint-store.ts` — add `lastModified` to stored data
- `src/main.ts` — add status endpoint (option B) or SSE endpoint (option A)

---

### Undo Persistence Across Reloads

**Problem:** The viewer loses undo history on page refresh.

**Implementation approach:**
- Store Excalidraw's undo/redo history in `localStorage` keyed by checkpoint ID
- On load, restore history from localStorage if available
- On each change, persist the history stack

**Caveat:** Excalidraw's undo history is internal state and not easily serializable through the public API. This may require accessing internal APIs or maintaining a separate operation log. Low priority unless users specifically request it.
