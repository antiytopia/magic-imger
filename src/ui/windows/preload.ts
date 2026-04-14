import * as electron from "electron";

const { contextBridge, ipcRenderer, webUtils } = electron;

import {
  BatchJobResult,
  InputAsset,
  JobConfigPatch,
  PreflightEstimate,
  ScreenshotBatchResult,
  ScreenshotBrowserMode,
  ScreenshotViewportOverride
} from "../../shared/types.js";

export interface RendererPlanBatchPayload {
  inputPaths: string[];
  outputDir: string;
  targetFormat?: "jpg" | "png" | "webp" | "avif";
  profile: "safe" | "balanced";
  itemOverrides?: Record<string, JobConfigPatch>;
  resize?: {
    width: number;
    height: number;
    fit: "contain" | "cover";
    crop?: "center";
  };
  compress?: {
    quality?: number;
    lossless?: boolean;
  };
}

export interface RendererScreenshotBatchPayload {
  urls: string[];
  outDir: string;
  shots?: number;
  copiesPerScreen?: number;
  mobile?: boolean;
  deviceProfileName?: string | null;
  viewport?: ScreenshotViewportOverride;
  browserMode: ScreenshotBrowserMode;
  executablePath?: string;
  cdpEndpoint?: string | null;
  channel?: "chrome" | "msedge";
  proxy?: string | null;
  headless?: boolean;
  waitAfterNavigationMs?: number;
  betweenSegmentWaitMs?: number;
  maxImageBytes?: number;
}

export interface RendererDeviceProfileSummary {
  name: string;
  viewport: { width: number; height: number } | null;
  isMobile: boolean | null;
}

export interface MagicImgerBridge {
  pickFiles: () => Promise<string[]>;
  readInputAssets: (inputPaths: string[]) => Promise<InputAsset[]>;
  importClipboardImage: () => Promise<InputAsset[]>;
  getPathForFile: (file: File) => string;
  planBatch: (payload: RendererPlanBatchPayload) => Promise<PreflightEstimate>;
  runBatch: (payload: RendererPlanBatchPayload) => Promise<{
    estimate: PreflightEstimate;
    results: BatchJobResult[];
  }>;
  runScreenshotBatch: (payload: RendererScreenshotBatchPayload) => Promise<ScreenshotBatchResult>;
  openPath: (targetPath: string) => Promise<void>;
  showItemInFolder: (targetPath: string) => Promise<void>;
  listScreenshotDeviceProfiles: () => Promise<RendererDeviceProfileSummary[]>;
}

const api: MagicImgerBridge = {
  pickFiles: () => ipcRenderer.invoke("dialog:pick-files"),
  readInputAssets: (inputPaths) => ipcRenderer.invoke("assets:read", inputPaths),
  importClipboardImage: () => ipcRenderer.invoke("clipboard:import"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  planBatch: (payload) => ipcRenderer.invoke("batch:plan", payload),
  runBatch: (payload) => ipcRenderer.invoke("batch:run", payload),
  runScreenshotBatch: (payload) => ipcRenderer.invoke("screenshots:run", payload),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("shell:show-item-in-folder", targetPath),
  listScreenshotDeviceProfiles: () => ipcRenderer.invoke("screenshots:device-profiles")
};

contextBridge.exposeInMainWorld("magicImger", api);
