import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";

import { readInputAssets } from "../../core/intake.js";
import { processBatch } from "../../core/pipeline.js";
import { planBatch } from "../../core/planner.js";
import { listDeviceProfiles } from "../../core/screenshots/device-profiles.js";
import { runShotBatch } from "../../core/screenshots/run-shot-batch.js";
import { createClipboardTempImage } from "./clipboard.js";
import { RendererPlanBatchPayload, RendererScreenshotBatchPayload } from "./preload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 720,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: "#f3efe7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  const menu = Menu.buildFromTemplate([
    { label: "File", submenu: [{ role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "copy" }, { role: "paste" }] },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools", accelerator: "F12" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    { label: "Help", submenu: [{ role: "about" }] }
  ]);
  Menu.setApplicationMenu(menu);

  if (process.env.MAGIC_IMGER_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
  return win;
}

ipcMain.handle("assets:read", async (_event, inputPaths: string[]) => readInputAssets(inputPaths));
ipcMain.handle("dialog:pick-files", async () => {
  const result = await dialog.showOpenDialog({
    title: "Add image files",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "jfif", "png", "webp", "avif", "svg"]
      }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});
ipcMain.handle("clipboard:import", async () => {
  const image = clipboard.readImage();

  if (image.isEmpty()) {
    return [];
  }

  const pngBuffer = image.toPNG();
  const tempPath = await createClipboardTempImage(pngBuffer);

  return readInputAssets([tempPath]);
});
ipcMain.handle("batch:plan", async (_event, payload: RendererPlanBatchPayload) => {
  const planned = await planBatch({
    inputs: payload.inputPaths,
    outputDir: payload.outputDir,
    targetFormat: payload.targetFormat,
    profile: payload.profile,
    itemOverrides: payload.itemOverrides,
    resize: payload.resize,
    compress: payload.compress
  });

  return planned.estimate;
});
ipcMain.handle("batch:run", async (_event, payload: RendererPlanBatchPayload) => {
  const planned = await planBatch({
    inputs: payload.inputPaths,
    outputDir: payload.outputDir,
    targetFormat: payload.targetFormat,
    profile: payload.profile,
    itemOverrides: payload.itemOverrides,
    resize: payload.resize,
    compress: payload.compress
  });
  const results = await processBatch(planned.jobs, planned.concurrency);

  return {
    estimate: planned.estimate,
    results
  };
});
ipcMain.handle("screenshots:run", async (_event, payload: RendererScreenshotBatchPayload) =>
  runShotBatch({
    urls: payload.urls,
    outDir: payload.outDir,
    shots: payload.shots,
    copiesPerScreen: payload.copiesPerScreen,
    mobile: payload.mobile,
    deviceProfileName: payload.deviceProfileName,
    viewport: payload.viewport,
    browserMode: payload.browserMode,
    executablePath: payload.executablePath,
    cdpEndpoint: payload.cdpEndpoint,
    channel: payload.channel,
    proxy: payload.proxy,
    headless: payload.headless,
    waitAfterNavigationMs: payload.waitAfterNavigationMs,
    betweenSegmentWaitMs: payload.betweenSegmentWaitMs,
    maxImageBytes: payload.maxImageBytes
  })
);
ipcMain.handle("screenshots:device-profiles", async () => listDeviceProfiles());
ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Path is required.");
  }

  const error = await shell.openPath(targetPath);
  if (error) {
    throw new Error(error);
  }
});
ipcMain.handle("shell:show-item-in-folder", async (_event, targetPath: string) => {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Path is required.");
  }

  shell.showItemInFolder(targetPath);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
