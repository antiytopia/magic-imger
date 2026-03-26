import type { MagicImgerBridge } from "../preload.js";

declare global {
  interface Window {
    magicImger: MagicImgerBridge;
  }
}

export {};
