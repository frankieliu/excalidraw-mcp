/**
 * Entry point for running the MCP server.
 * Run with: npx @mcp-demos/excalidraw-server
 * Or: node dist/index.js [--stdio]
 */

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import type { CheckpointStore } from "./checkpoint-store.js";
import { FileCheckpointStore } from "./checkpoint-store.js";
import { createServer } from "./server.js";
import { viewerHtml } from "./viewer.js";

/**
 * Starts an MCP server with Streamable HTTP transport in stateless mode.
 *
 * @param createServer - Factory function that creates a new McpServer instance per request.
 */
export async function startStreamableHTTPServer(
  createServer: () => McpServer,
  store: CheckpointStore,
): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3847", 10);

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // --- Browser viewer routes ---

  app.get("/api/checkpoint/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const data = await store.load(id);
      if (!data) {
        res.status(404).json({ error: "Checkpoint not found" });
        return;
      }
      res.json(data);
    } catch {
      res.status(400).json({ error: "Invalid checkpoint id" });
    }
  });

  app.post("/api/checkpoint/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!/^[a-zA-Z0-9]{1,36}$/.test(id)) {
        res.status(400).json({ error: "Invalid checkpoint id format" });
        return;
      }
      const { elements } = req.body;
      if (!Array.isArray(elements)) {
        res.status(400).json({ error: "elements must be an array" });
        return;
      }
      const serialized = JSON.stringify({ elements });
      if (serialized.length > 5 * 1024 * 1024) {
        res.status(413).json({ error: "Payload too large" });
        return;
      }
      await store.save(id, { elements });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Invalid request" });
    }
  });

  app.get("/view/:id", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const data = await store.load(id);
      if (!data) {
        res.status(404).send("Checkpoint not found");
        return;
      }
      res.type("html").send(viewerHtml(id));
    } catch {
      res.status(400).send("Invalid checkpoint id");
    }
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`MCP server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Starts an MCP server with stdio transport.
 *
 * @param createServer - Factory function that creates a new McpServer instance.
 */
export async function startStdioServer(
  createServer: () => McpServer,
): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

async function main() {
  const store = new FileCheckpointStore();
  if (process.argv.includes("--stdio")) {
    const factory = () => createServer(store);
    await startStdioServer(factory);
  } else {
    const port = parseInt(process.env.PORT ?? "3847", 10);
    const baseUrl = `http://localhost:${port}`;
    const factory = () => createServer(store, { baseUrl });
    await startStreamableHTTPServer(factory, store);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
