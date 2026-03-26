import type { MagicImgerBridge } from "../../preload.js";

export function getBridge(): MagicImgerBridge {
  if (!window.magicImger) {
    throw new Error("Desktop bridge failed to load. Restart the app after rebuilding the GUI.");
  }

  return window.magicImger;
}

