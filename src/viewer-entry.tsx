import { createElement, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, convertToExcalidrawElements, FONT_FAMILY } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const PSEUDO_TYPES = new Set(["cameraUpdate", "delete", "restoreCheckpoint"]);
const INVISIBLE_COLORS = new Set(["transparent", "#ffffff", "#fff", "white", ""]);

// Checkpoint ID comes from the URL path: /view/<id>
const checkpointId = window.location.pathname.split("/").filter(Boolean).pop() ?? "";

function convertRawElements(els: any[]): any[] {
  const real = els.filter(el => !PSEUDO_TYPES.has(el.type));
  const withDefaults = real.map(el => {
    let mapped = el.label
      ? { ...el, label: { textAlign: "center", verticalAlign: "middle", ...el.label } }
      : { ...el };
    if (mapped.label && !mapped.label.strokeColor &&
        INVISIBLE_COLORS.has((mapped.strokeColor || "").toLowerCase())) {
      mapped.label = { ...mapped.label, strokeColor: "#1e1e1e" };
    }
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

function ViewerApp() {
  const [elements, setElements] = useState<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef("");

  useEffect(() => {
    if (!checkpointId) {
      setError("No checkpoint ID in URL.");
      setStatus("error");
      return;
    }
    fetch(`/api/checkpoint/${encodeURIComponent(checkpointId)}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404
          ? "Checkpoint not found. It may have expired."
          : `HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setElements(convertRawElements(data.elements || []));
        setStatus("ready");
      })
      .catch(e => { setError(e.message); setStatus("error"); });
  }, []);

  function scheduleSave(els: any[]) {
    const filtered = els.filter(el => !el.isDeleted);
    const json = JSON.stringify(filtered);
    if (json === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("Saving…");
      try {
        const res = await fetch(`/api/checkpoint/${encodeURIComponent(checkpointId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ elements: filtered }),
        });
        if (res.ok) {
          lastSaved.current = json;
          setSaveStatus("Saved");
          setTimeout(() => setSaveStatus(""), 2000);
        } else {
          setSaveStatus("Save failed");
          setTimeout(() => setSaveStatus(""), 3000);
        }
      } catch {
        setSaveStatus("Save failed");
        setTimeout(() => setSaveStatus(""), 3000);
      }
    }, 2000);
  }

  if (status === "loading") return createElement("div", {
    style: { display:"flex", alignItems:"center", justifyContent:"center",
             height:"100%", fontFamily:"system-ui", color:"#666", fontSize:18 }
  }, "Loading diagram…");

  if (status === "error") return createElement("div", {
    style: { display:"flex", alignItems:"center", justifyContent:"center",
             height:"100%", fontFamily:"system-ui", color:"#ef4444", fontSize:16,
             padding:20, textAlign:"center" }
  }, error);

  return createElement("div", { style: { width:"100%", height:"100%", position:"relative" } },
    createElement(Excalidraw, {
      initialData: { elements },
      viewModeEnabled: false,
      onChange: (els: any[]) => scheduleSave(els),
    }),
    saveStatus ? createElement("div", {
      style: { position:"fixed", bottom:12, right:16, fontFamily:"system-ui",
               fontSize:13, color:"#888", zIndex:1000, pointerEvents:"none" }
    }, saveStatus) : null
  );
}

createRoot(document.getElementById("root")!).render(createElement(ViewerApp));

