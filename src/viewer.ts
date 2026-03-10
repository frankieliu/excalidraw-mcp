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
  <link rel="stylesheet" href="https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/prod/index.css">
  <style>
    @font-face {
      font-family: "Excalifont";
      src: url("https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/prod/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2") format("woff2");
      font-display: swap;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100%; font-family: system-ui, sans-serif; color: #666; font-size: 18px; }
    #error { display: none; align-items: center; justify-content: center; height: 100%; font-family: system-ui, sans-serif; color: #ef4444; font-size: 16px; padding: 20px; text-align: center; }
    #save-status { position: fixed; bottom: 12px; right: 16px; font-family: system-ui, sans-serif; font-size: 13px; color: #888; z-index: 1000; pointer-events: none; opacity: 0; transition: opacity 0.3s; }
    #save-status.visible { opacity: 1; }
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
  <div id="save-status"></div>
  <script type="module">
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { Excalidraw, convertToExcalidrawElements, FONT_FAMILY } from "@excalidraw/excalidraw";

    const CHECKPOINT_ID = ${JSON.stringify(checkpointId)};
    const PSEUDO_TYPES = new Set(["cameraUpdate", "delete", "restoreCheckpoint"]);

    let saveTimer = null;
    let lastSavedJson = "";
    const statusEl = document.getElementById("save-status");

    function showStatus(text, duration) {
      statusEl.textContent = text;
      statusEl.classList.add("visible");
      if (duration) {
        setTimeout(() => statusEl.classList.remove("visible"), duration);
      }
    }

    function scheduleSave(elements) {
      const filtered = elements.filter(el => !el.isDeleted);
      const json = JSON.stringify(filtered);
      if (json === lastSavedJson) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        showStatus("Saving\u2026");
        try {
          const res = await fetch("/api/checkpoint/" + encodeURIComponent(CHECKPOINT_ID), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ elements: filtered }),
          });
          if (res.ok) {
            lastSavedJson = json;
            showStatus("Saved", 2000);
          } else {
            showStatus("Save failed", 3000);
          }
        } catch {
          showStatus("Save failed", 3000);
        }
      }, 2000);
    }

    const INVISIBLE_COLORS = new Set(["transparent", "#ffffff", "#fff", "white", ""]);

    function convertRawElements(els) {
      const real = els.filter(el => !PSEUDO_TYPES.has(el.type));
      const withDefaults = real.map(el => {
        let mapped = el.label ? { ...el, label: { textAlign: "center", verticalAlign: "middle", ...el.label } } : { ...el };
        // If label has no explicit strokeColor and parent has invisible stroke, default label to readable color
        if (mapped.label && !mapped.label.strokeColor && INVISIBLE_COLORS.has((mapped.strokeColor || "").toLowerCase())) {
          mapped.label = { ...mapped.label, strokeColor: "#1e1e1e" };
        }
        // Convert startBinding/endBinding to start/end for skeleton API
        if (mapped.type === "arrow" || mapped.type === "line") {
          if (mapped.startBinding?.elementId) {
            mapped.start = { id: mapped.startBinding.elementId };
            delete mapped.startBinding;
          }
          if (mapped.endBinding?.elementId) {
            mapped.end = { id: mapped.endBinding.elementId };
            delete mapped.endBinding;
          }
        }
        return mapped;
      });
      return convertToExcalidrawElements(withDefaults, { regenerateIds: false })
        .map(el => el.type === "text" ? { ...el, fontFamily: FONT_FAMILY?.Excalifont ?? 1 } : el);
    }

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
        const elements = convertRawElements(rawElements);

        const rootEl = document.getElementById("root");
        rootEl.innerHTML = "";
        const root = createRoot(rootEl);
        root.render(
          createElement(Excalidraw, {
            initialData: { elements },
            viewModeEnabled: false,
            onChange: (els) => scheduleSave(els),
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
