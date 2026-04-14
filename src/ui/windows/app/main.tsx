import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

function renderFatal(error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  rootElement.innerHTML = `
    <div style="padding:16px;font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;">
      <h2 style="margin:0 0 8px 0;">Magic Imger: UI failed to start</h2>
      <div style="margin:0 0 12px 0;color:#444;">Try: close the app, run <code>repair-win.bat</code>, then start again.</div>
      <pre style="white-space:pre-wrap;background:#111;color:#ddd;padding:12px;border-radius:8px;overflow:auto;">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  renderFatal(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  renderFatal(event.reason);
});

try {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  renderFatal(error);
}
