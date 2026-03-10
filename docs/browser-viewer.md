# Browser Viewer for Excalidraw MCP Server

## Overview

The Excalidraw MCP server normally renders diagrams inside MCP client iframes (Claude Desktop, ChatGPT). In CLI environments like Claude Code, there is no iframe support, so diagrams are invisible.

The browser viewer adds the ability to view diagrams in a regular browser by adding two HTTP endpoints to the existing Express server, plus a browser URL in the `create_view` tool response.

## What Changed

### New file: `src/viewer.ts`

Exports a single function:

```ts
viewerHtml(checkpointId: string): string
```

Returns self-contained HTML that:
- Fetches the diagram's element JSON from `/api/checkpoint/:id`
- Loads React 19 and Excalidraw 0.18 from esm.sh CDN (same versions as the existing `mcp-app.html`)
- Filters out pseudo-elements (`cameraUpdate`, `delete`, `restoreCheckpoint`)
- Converts raw elements using `convertToExcalidrawElements`
- Renders an interactive `Excalidraw` component in view mode (`viewModeEnabled: true`) with full pan/zoom support

### Modified: `src/main.ts`

- `startStreamableHTTPServer` now accepts a `store: CheckpointStore` parameter so the new routes can read checkpoint data
- Added `GET /api/checkpoint/:id` — returns raw checkpoint JSON, or 404 if not found
- Added `GET /view/:id` — serves the viewer HTML page, or 404 if not found
- In HTTP mode (non-stdio), computes `baseUrl` (`http://localhost:<port>`) and passes it to `createServer` via options

### Modified: `src/server.ts`

- `registerTools` and `createServer` accept an optional `options?: { baseUrl?: string }` parameter
- When `baseUrl` is set, the `create_view` tool response text includes an extra line:
  ```
  View in browser: http://localhost:3847/view/<checkpointId>
  ```
- The Vercel entry point (`api/mcp.ts`) is unaffected since the parameter is optional

### Files NOT changed

- `mcp-app.tsx`, `mcp-app.html`, `vite.config.ts`, build scripts, `checkpoint-store.ts`

## New HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/checkpoint/:id` | Returns checkpoint JSON (`{ elements: [...] }`). Returns 404 for unknown IDs, 400 for invalid IDs. |
| `GET` | `/view/:id` | Serves a standalone HTML page that loads and renders the diagram interactively. Returns 404 for unknown IDs, 400 for invalid IDs. |

These endpoints are only available when running in HTTP mode (not `--stdio`).

## How to Run

### 1. Build

```bash
cd excalidraw-mcp
npm run build
```

### 2. Start the HTTP server

```bash
node dist/index.js
```

By default it listens on port 3847. Override with the `PORT` environment variable:

```bash
PORT=8080 node dist/index.js
```

You should see:

```
MCP server listening on http://localhost:3847/mcp
```

### 3. Connect Claude Code to the server

In a separate terminal:

```bash
claude mcp add excalidraw --transport http --url http://localhost:3847/mcp
```

**Important:** Use `--transport http` (not `--stdio`). The browser viewer only works in HTTP mode because it requires the Express server to be running and serving the `/view/:id` and `/api/checkpoint/:id` routes.

### 4. Use it

Start a Claude Code session and ask Claude to draw something:

```
> Draw an architecture diagram of a web app with a load balancer, API server, and database
```

Claude will call `read_me` then `create_view`. The tool response will include a line like:

```
View in browser: http://localhost:3847/view/a1b2c3d4e5f6g7h8i9
```

Open that URL in your browser to see the interactive diagram with pan and zoom.

### 5. Verify the API endpoint

```bash
curl http://localhost:3847/api/checkpoint/<checkpointId>
```

Returns the raw JSON with the diagram elements. Returns `{"error":"Checkpoint not found"}` with HTTP 404 for invalid or expired checkpoint IDs.

## Transport Modes Comparison

| Feature | HTTP mode (`node dist/index.js`) | stdio mode (`node dist/index.js --stdio`) |
|---------|----------------------------------|-------------------------------------------|
| MCP protocol | Streamable HTTP at `/mcp` | stdin/stdout |
| Browser viewer (`/view/:id`) | Yes | No |
| Checkpoint API (`/api/checkpoint/:id`) | Yes | No |
| `View in browser:` URL in `create_view` response | Yes | No |
| Works with Claude Desktop | Yes (via HTTP config) | Yes (via stdio config) |
| Works with Claude Code CLI | Yes (via `--transport http`) | Yes (default) |

## Notes

- Checkpoints are stored in a temp directory (`$TMPDIR/excalidraw-mcp-checkpoints/`) and are pruned after 100 entries. They do not persist across server restarts if the OS clears the temp directory.
- The viewer page loads Excalidraw from the esm.sh CDN, so a network connection is required for the browser.
- The `/mcp` endpoint returns a JSON-RPC error if opened directly in a browser — this is expected. It requires proper MCP client headers (`Accept: text/event-stream`).
