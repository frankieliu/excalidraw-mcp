/**
 * Returns self-contained HTML for viewing an Excalidraw diagram in the browser.
 * Fetches checkpoint data from /api/checkpoint/:id and renders it using
 * the Excalidraw component in view mode (pan/zoom enabled).
 */
export function viewerHtml(checkpointId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Excalidraw Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100%; font-family: system-ui, sans-serif; color: #666; font-size: 18px; }
    #error { display: none; align-items: center; justify-content: center; height: 100%; font-family: system-ui, sans-serif; color: #ef4444; font-size: 16px; padding: 20px; text-align: center; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19.0.0",
      "react-dom/client": "https://esm.sh/react-dom@19.0.0/client?deps=react@19.0.0",
      "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
      "@excalidraw/excalidraw": "https://esm.sh/@excalidraw/excalidraw@0.18.0?deps=react@19.0.0,react-dom@19.0.0"
    }
  }
  </script>
</head>
<body>
  <div id="root">
    <div id="loading">Loading diagram\u2026</div>
    <div id="error"></div>
  </div>
  <script type="module">
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";

    const CHECKPOINT_ID = ${JSON.stringify(checkpointId)};
    const PSEUDO_TYPES = new Set(["cameraUpdate", "delete", "restoreCheckpoint"]);

    async function main() {
      const loadingEl = document.getElementById("loading");
      const errorEl = document.getElementById("error");

      try {
        const res = await fetch("/api/checkpoint/" + encodeURIComponent(CHECKPOINT_ID));
        if (!res.ok) {
          throw new Error(res.status === 404
            ? "Checkpoint not found. It may have expired."
            : "Failed to load checkpoint (HTTP " + res.status + ")");
        }
        const data = await res.json();
        const rawElements = (data.elements || []).filter(
          el => !PSEUDO_TYPES.has(el.type)
        );
        const elements = convertToExcalidrawElements(rawElements);

        loadingEl.style.display = "none";

        const root = createRoot(document.getElementById("root"));
        root.render(
          createElement(Excalidraw, {
            initialData: { elements },
            viewModeEnabled: true,
          })
        );
      } catch (err) {
        loadingEl.style.display = "none";
        errorEl.style.display = "flex";
        errorEl.textContent = err.message || "Failed to load diagram";
      }
    }

    main();
  </script>
</body>
</html>`;
}
