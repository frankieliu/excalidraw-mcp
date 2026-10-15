import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Viewer build — bundles React, ReactDOM, and @excalidraw/excalidraw
 * directly from node_modules (no esm.sh dependency at runtime).
 *
 * Difference from vite.config.ts (mcp-app build):
 *   mcp-app:  marks React/Excalidraw as `external`, references esm.sh at runtime
 *   viewer:   no externals — everything inlined into a single self-contained HTML
 *
 * The output (dist/viewer.html) is served by viewer.ts instead of the
 * dynamically-generated HTML string that used importmaps pointing to esm.sh.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    // No externals — bundle React and Excalidraw from node_modules
    rollupOptions: {
      input: path.resolve(__dirname, "src/viewer.html"),
    },
    outDir: "dist",
    emptyOutDir: false,
    // Allow the large bundle (Excalidraw + React inlined ≈ 5–8 MB uncompressed)
    chunkSizeWarningLimit: 10000,
  },
});
