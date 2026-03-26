import { useMemo, useState } from "react";

import { getBridge } from "./lib/bridge.js";
import { ImagesPanel } from "./components/ImagesPanel.js";
import { ScreenshotsPanel } from "./components/ScreenshotsPanel.js";

type AppMode = "images" | "screenshots";

export function App() {
  const bridge = useMemo(() => getBridge(), []);
  const [mode, setMode] = useState<AppMode>("images");

  return (
    <div className="shell">
      <main className="layout">
        <div className="mode-switch">
          <button className={`mode-chip ${mode === "images" ? "active" : ""}`} onClick={() => setMode("images")}>
            Images
          </button>
          <button
            className={`mode-chip ${mode === "screenshots" ? "active" : ""}`}
            onClick={() => setMode("screenshots")}
          >
            Screenshots
          </button>
        </div>

        {mode === "images" ? <ImagesPanel bridge={bridge} /> : <ScreenshotsPanel bridge={bridge} />}
      </main>
    </div>
  );
}
