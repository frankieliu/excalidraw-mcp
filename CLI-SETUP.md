# Excalidraw MCP — CLI Setup

Quick setup for using Excalidraw MCP with Claude Code or any CLI-based MCP client.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

## Setup

```bash
git clone https://github.com/excalidraw/excalidraw-mcp.git
cd excalidraw-mcp
pnpm install
pnpm run build
```

## Start the server

```bash
node dist/index.js
```

Runs on `http://localhost:3001/mcp` by default. Override with `PORT=8080 node dist/index.js`.

## Connect Claude Code

In a separate terminal:

```bash
claude mcp add excalidraw --transport http --url http://localhost:3001/mcp
```

Use `--transport http` — the browser viewer requires HTTP mode.

## Draw something

```
> Draw an architecture diagram of a web app with a load balancer, API server, and database
```

Claude calls `read_me` then `create_view`. The response includes a browser link:

```
View in browser: http://localhost:3001/view/<checkpointId>
```

Open that URL to see and edit the diagram.

## Edit in browser, feed back to Claude

1. Open the `/view/<id>` link — it's a full Excalidraw editor
2. Make your edits (move things, add shapes, delete elements)
3. Edits auto-save after 2 seconds
4. Ask Claude to pick up your changes:

```
> Get the edits I made to that diagram and refine it
```

Claude calls `get_edits` to read your changes, then `create_view` to produce an updated diagram.

## Available tools

| Tool | Purpose |
|------|---------|
| `read_me` | Returns a cheat sheet — Claude should call this first |
| `create_view` | Renders a diagram from Excalidraw JSON elements |
| `get_edits` | Reads checkpoint state including any browser edits |

## Endpoints (HTTP mode only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/view/:id` | Interactive diagram editor |
| GET | `/api/checkpoint/:id` | Raw checkpoint JSON |
| POST | `/api/checkpoint/:id` | Save edits (used by the viewer) |
