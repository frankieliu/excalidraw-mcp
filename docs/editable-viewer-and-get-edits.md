# Editable Viewer + `get_edits` Tool + Checkpoint Reuse

## Overview

Three related changes that close the loop between the browser viewer and the model:

1. **Editable viewer** — the `/view/:id` page is now a full Excalidraw editor (was read-only), with auto-save back to the server.
2. **`get_edits` tool** — a model-visible MCP tool that reads checkpoint state, including any browser edits.
3. **Checkpoint ID reuse** — `create_view` with `restoreCheckpoint` reuses the same checkpoint ID instead of generating a new one.

## Files Modified

### `src/main.ts`

- Added `import express` and `app.use(express.json({ limit: "5mb" }))` for JSON body parsing.
- Added `POST /api/checkpoint/:id` route (lines 50–72):
  - Validates checkpoint ID format (`/^[a-zA-Z0-9]{1,36}$/`)
  - Validates `elements` is an array
  - Enforces 5MB size limit (HTTP 413 if exceeded)
  - Saves to the checkpoint store
  - Returns `{ ok: true }` on success

### `src/viewer.ts`

- Changed `viewModeEnabled: true` → `viewModeEnabled: false` so the Excalidraw component is fully editable.
- Added `onChange` handler to the Excalidraw component that calls `scheduleSave(els)`.
- Added `scheduleSave()` function:
  - Filters out deleted elements (`el.isDeleted`)
  - Debounces 2 seconds before POSTing to `POST /api/checkpoint/:id`
  - Skips save if JSON hasn't changed since last save (`lastSavedJson` comparison)
- Added `showStatus()` function and `#save-status` DOM element:
  - Fixed-position indicator at bottom-right
  - Shows "Saving..." during POST, "Saved" for 2s on success, "Save failed" for 3s on error
  - Fades in/out via CSS opacity transition

### `src/server.ts`

**New tool — `get_edits` (Tool 6):**
- Registered via `server.registerTool()` (not `registerAppTool`), so it's visible to the model/CLI — not restricted to the app iframe.
- Input: `{ id: z.string().describe("Checkpoint ID") }`
- Returns the full checkpoint data as JSON text
- Marked `readOnlyHint: true`
- Returns an error with `isError: true` if the checkpoint is not found

**Checkpoint ID reuse (line 495):**
- Changed from: `const checkpointId = crypto.randomUUID().replace(/-/g, "").slice(0, 18);`
- Changed to: `const checkpointId = restoreEl?.id ?? crypto.randomUUID().replace(/-/g, "").slice(0, 18);`
- When `restoreCheckpoint` is present, the resolved state is saved back to the **same** checkpoint ID.
- Fresh diagrams (no `restoreCheckpoint`) still get a new UUID as before.
- This avoids orphaned checkpoints when iteratively editing a diagram.

## Data Flow

```
Browser viewer ──POST /api/checkpoint/:id──> CheckpointStore
                                                   │
Model (CLI) ──get_edits tool──────────────────────>│
                                                   │
Model (CLI) ──create_view (restoreCheckpoint)─────>│──save (same ID)──> CheckpointStore
Model (CLI) ──create_view (fresh)─────────────────>│──save (new ID)──> CheckpointStore
```

1. User opens `/view/:checkpointId` in browser → full Excalidraw editor loads
2. User draws/edits → after 2s idle, elements POST to `/api/checkpoint/:id` → store updated
3. Model calls `get_edits` with checkpoint ID → gets current elements (including browser edits)
4. Model calls `create_view` with `restoreCheckpoint` → merges base + new elements → saves to **same** ID
5. Model calls `create_view` without `restoreCheckpoint` → saves to **new** ID

## Design Decisions

### Why reuse checkpoint ID only with `restoreCheckpoint`?

If the model calls `create_view` without `restoreCheckpoint`, it's creating a fresh diagram — reusing an old ID would silently overwrite any user edits on that checkpoint. With `restoreCheckpoint`, the model is explicitly building on existing state, so reuse is safe and avoids accumulating orphaned checkpoints.

### Why debounce 2 seconds?

Matches the existing debounce in the MCP app's fullscreen edit sync (`edit-context.ts`). Fast enough to feel responsive, slow enough to avoid spamming the server on every keystroke/drag.

### Why filter `el.isDeleted`?

Excalidraw keeps deleted elements in its internal state (for undo). We strip them before saving to keep checkpoint data clean — same pattern used in `edit-context.ts`.

## Testing

1. `npm run build`
2. `npm run serve`
3. Call `create_view` via Claude CLI to generate a diagram — note the checkpoint ID
4. Open `http://localhost:3847/view/<checkpointId>` — confirm full editing (draw, move, delete)
5. Make edits, wait 2s — confirm "Saved" indicator appears at bottom-right
6. Call `get_edits` with the checkpoint ID — confirm it returns the edited elements
7. Call `create_view` with `restoreCheckpoint` referencing that ID — confirm the returned checkpoint ID is the **same** as before (not a new UUID)

## Status

- All three changes implemented and building cleanly (`npm run build` passes).
- Not yet tested end-to-end (requires running server + browser + CLI).
- Not yet committed.
