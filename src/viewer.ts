import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns the pre-built self-contained viewer HTML.
 *
 * Previously this generated an HTML string with an importmap pointing to
 * esm.sh for React and @excalidraw/excalidraw. Now it serves dist/viewer.html,
 * which was built by vite.config.viewer.ts with everything bundled from
 * node_modules — no external network calls needed at runtime.
 *
 * The checkpoint ID is NOT injected here. viewer-entry.tsx reads it directly
 * from window.location.pathname (/view/<id>), so the HTML is truly static
 * and can be cached by the browser.
 */
export function viewerHtml(_checkpointId: string): string {
  const viewerPath = path.resolve(__dirname, "../dist/src/viewer.html");
  if (!fs.existsSync(viewerPath)) {
    // Fallback message if the viewer hasn't been built yet
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;color:#666">
      <h2>Viewer not built</h2>
      <p>Run <code>pnpm run build:viewer</code> to build the offline viewer.</p>
    </body></html>`;
  }
  return fs.readFileSync(viewerPath, "utf-8");
}
