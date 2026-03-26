import { useState } from "react";
import { useStore } from "zustand";

import { BatchJobResult, JobConfigPatch, ScreenshotBatchResult, ScreenshotBrowserMode } from "../../../shared/types.js";
import { createQueueStore } from "./store/queue-store.js";

const queueStore = createQueueStore();
type CompressionPreset =
  | "default"
  | "lossy_light"
  | "lossy_strong"
  | "lossy_max"
  | "lossless_max";
type OutputFormat = "jpg" | "png" | "webp" | "avif";
type AppMode = "images" | "screenshots";
type CompressionOption = {
  value: CompressionPreset;
  label: string;
};

function resolveTargetFormat(
  overrideTargetFormat?: JobConfigPatch["targetFormat"],
  globalTargetFormat?: OutputFormat,
  fallbackFormat: OutputFormat = "webp"
): OutputFormat {
  return overrideTargetFormat ?? globalTargetFormat ?? fallbackFormat;
}

function getCompressionOptions(targetFormat: OutputFormat): CompressionOption[] {
  const sharedLossyOptions: CompressionOption[] = [
    { value: "default", label: "default" },
    { value: "lossy_light", label: "lossy light" },
    { value: "lossy_strong", label: "lossy strong" },
    { value: "lossy_max", label: "lossy max" }
  ];

  if (targetFormat === "jpg") {
    return [...sharedLossyOptions, { value: "lossless_max", label: "max quality (jpg)" }];
  }

  return [...sharedLossyOptions, { value: "lossless_max", label: "lossless max" }];
}

function getCompressionPreset(
  compress?: JobConfigPatch["compress"],
  targetFormat: OutputFormat = "webp"
): CompressionPreset {
  if (!compress) {
    return "default";
  }

  if (compress.lossless || (targetFormat === "jpg" && (compress.quality ?? 0) >= 100)) {
    return "lossless_max";
  }

  const quality = compress.quality ?? 0;

  switch (targetFormat) {
    case "avif":
      if (quality >= 48) {
        return "lossy_light";
      }

      if (quality >= 34) {
        return "lossy_strong";
      }

      return "lossy_max";
    case "png":
      if (quality >= 92) {
        return "lossy_light";
      }

      if (quality >= 78) {
        return "lossy_strong";
      }

      return "lossy_max";
    case "jpg":
    case "webp":
    default:
      if (quality >= 88) {
        return "lossy_light";
      }

      if (quality >= 68) {
        return "lossy_strong";
      }

      return "lossy_max";
  }
}

function getCompressFromPreset(
  preset: CompressionPreset,
  targetFormat: OutputFormat
): JobConfigPatch["compress"] | undefined {
  switch (preset) {
    case "lossy_light":
      switch (targetFormat) {
        case "avif":
          return { quality: 48 };
        case "png":
          return { quality: 92 };
        case "jpg":
        case "webp":
        default:
          return { quality: 88 };
      }
    case "lossy_strong":
      switch (targetFormat) {
        case "avif":
          return { quality: 34 };
        case "png":
          return { quality: 78 };
        case "jpg":
        case "webp":
        default:
          return { quality: 68 };
      }
    case "lossy_max":
      switch (targetFormat) {
        case "avif":
          return { quality: 18 };
        case "png":
          return { quality: 55 };
        case "jpg":
        case "webp":
        default:
          return { quality: 38 };
      }
    case "lossless_max":
      return targetFormat === "jpg" ? { quality: 100 } : { quality: 100, lossless: true };
    case "default":
    default:
      return undefined;
  }
}

function getBridge() {
  if (!window.magicImger) {
    throw new Error("Desktop bridge failed to load. Restart the app after rebuilding the GUI.");
  }

  return window.magicImger;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unexpected error while loading files.";
}

async function openLocalPath(targetPath: string, setNotice: (message: string | null) => void) {
  if (!targetPath.trim()) {
    setNotice("Path is empty.");
    return;
  }

  try {
    await getBridge().openPath(targetPath);
  } catch (error) {
    setNotice(`Cannot open path: ${getErrorMessage(error)}`);
  }
}

function formatMeta(width: number, height: number, format: string, fileSizeBytes: number) {
  return `${width}x${height} | ${format} | ${(fileSizeBytes / 1024).toFixed(1)} KB`;
}

function hasStoredOverride(override?: JobConfigPatch): boolean {
  return Boolean(override?.targetFormat || override?.outputDir || override?.resize || override?.compress);
}

function normalizeResize(resize?: JobConfigPatch["resize"]) {
  if (!resize) {
    return undefined;
  }

  const width = Number(resize.width) || 0;
  const height = Number(resize.height) || 0;

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    width,
    height,
    fit: resize.fit
  };
}

function normalizeCompress(compress?: JobConfigPatch["compress"]) {
  if (!compress) {
    return undefined;
  }

  const quality =
    compress.quality !== undefined && Number.isFinite(compress.quality) && compress.quality > 0
      ? compress.quality
      : undefined;

  if (quality === undefined && !compress.lossless) {
    return undefined;
  }

  return {
    quality,
    lossless: compress.lossless
  };
}

function normalizeItemOverrides(itemOverrides: Record<string, JobConfigPatch>) {
  const entries = Object.entries(itemOverrides)
    .map(([assetId, override]) => {
      const nextOverride: JobConfigPatch = {};
      const resize = normalizeResize(override.resize);
      const compress = normalizeCompress(override.compress);

      if (override.targetFormat) {
        nextOverride.targetFormat = override.targetFormat;
      }

      if (override.outputDir?.trim()) {
        nextOverride.outputDir = override.outputDir.trim();
      }

      if (resize) {
        nextOverride.resize = resize;
      }

      if (compress) {
        nextOverride.compress = compress;
      }

      return hasStoredOverride(nextOverride) ? ([assetId, nextOverride] as const) : null;
    })
    .filter((entry): entry is readonly [string, JobConfigPatch] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function readDroppedAssets(files: FileList | null) {
  if (!files || files.length === 0) {
    return [];
  }

  const bridge = getBridge();
  const paths = Array.from(files)
    .map((file) => bridge.getPathForFile(file))
    .filter((value): value is string => Boolean(value));

  if (paths.length === 0) {
    return [];
  }

  return bridge.readInputAssets(paths);
}

export function App() {
  const items = useStore(queueStore, (state) => state.items);
  const itemOverrides = useStore(queueStore, (state) => state.itemOverrides);
  const globalPreset = useStore(queueStore, (state) => state.globalPreset);
  const allowMoreResources = useStore(queueStore, (state) => state.allowMoreResources);
  const resourceProfile = useStore(queueStore, (state) => state.resourceProfile);
  const queueNotice = useStore(queueStore, (state) => state.queueNotice);
  const preflightEstimate = useStore(queueStore, (state) => state.preflightEstimate);
  const addAssets = useStore(queueStore, (state) => state.addAssets);
  const setGlobalPreset = useStore(queueStore, (state) => state.setGlobalPreset);
  const setItemOverride = useStore(queueStore, (state) => state.setItemOverride);
  const resetItemOverride = useStore(queueStore, (state) => state.resetItemOverride);
  const setAllowMoreResources = useStore(queueStore, (state) => state.setAllowMoreResources);
  const clearQueue = useStore(queueStore, (state) => state.clearQueue);
  const setPreflightEstimate = useStore(queueStore, (state) => state.setPreflightEstimate);
  const setQueueNotice = useStore(queueStore, (state) => state.setQueueNotice);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<BatchJobResult[] | null>(null);
  const [mode, setMode] = useState<AppMode>("images");
  const [screenshotUrls, setScreenshotUrls] = useState("");
  const [screenshotOutDir, setScreenshotOutDir] = useState("D:/magic-imger/screenshots");
  const [screenshotBrowserMode, setScreenshotBrowserMode] =
    useState<ScreenshotBrowserMode>("bundled-chromium");
  const [screenshotBrowserPath, setScreenshotBrowserPath] = useState("");
  const [screenshotCdpEndpoint, setScreenshotCdpEndpoint] = useState("");
  const [screenshotProxy, setScreenshotProxy] = useState("");
  const [screenshotDeviceName, setScreenshotDeviceName] = useState("");
  const [screenshotShots, setScreenshotShots] = useState("3");
  const [screenshotCopies, setScreenshotCopies] = useState("1");
  const [screenshotWaitAfterNavMs, setScreenshotWaitAfterNavMs] = useState("4000");
  const [screenshotBetweenSegmentWaitMs, setScreenshotBetweenSegmentWaitMs] = useState("500");
  const [screenshotMaxImageBytes, setScreenshotMaxImageBytes] = useState("");
  const [screenshotMobile, setScreenshotMobile] = useState(false);
  const [screenshotHeadless, setScreenshotHeadless] = useState(false);
  const [isScreenshotRunning, setIsScreenshotRunning] = useState(false);
  const [screenshotNotice, setScreenshotNotice] = useState<string | null>(null);
  const [screenshotResult, setScreenshotResult] = useState<ScreenshotBatchResult | null>(null);

  const sanitizedOutputDir = globalPreset.outputDir?.trim() ?? "";
  const globalCompressionOptions = getCompressionOptions(globalPreset.targetFormat ?? "webp");
  const screenshotUrlsList = screenshotUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const processDisabled = items.length === 0 || !sanitizedOutputDir || isProcessing;
  const screenshotRunDisabled =
    screenshotUrlsList.length === 0 || !screenshotOutDir.trim() || isScreenshotRunning;
  const lastRunSuccessCount = lastRunResults?.filter((result) => result.status === "success").length ?? 0;
  const lastRunFailureResults = lastRunResults?.filter((result) => result.status === "failed") ?? [];

  function applyItemOverride(assetId: string, nextOverride: JobConfigPatch | undefined) {
    if (nextOverride && hasStoredOverride(nextOverride)) {
      setItemOverride(assetId, nextOverride);
      return;
    }

    resetItemOverride(assetId);
  }

  function buildBatchPayload() {
    return {
      inputPaths: items.map((item) => item.inputPath),
      outputDir: sanitizedOutputDir,
      targetFormat: globalPreset.targetFormat,
      profile: resourceProfile,
      itemOverrides: normalizeItemOverrides(itemOverrides),
      resize: normalizeResize(globalPreset.resize),
      compress: normalizeCompress(globalPreset.compress)
    };
  }

  async function handleFiles(files: FileList | null) {
    try {
      const assets = await readDroppedAssets(files);

      if (assets.length === 0) {
        setQueueNotice("No valid file paths were received from the dropped files.");
        return;
      }

      addAssets(assets);
      setQueueNotice(null);
    } catch (error) {
      setQueueNotice(getErrorMessage(error));
    }
  }

  async function handlePickFiles() {
    try {
      const bridge = getBridge();
      const paths = await bridge.pickFiles();

      if (paths.length === 0) {
        return;
      }

      const assets = await bridge.readInputAssets(paths);

      if (assets.length === 0) {
        setQueueNotice("No supported image files were selected.");
        return;
      }

      addAssets(assets);
      setQueueNotice(null);
    } catch (error) {
      setQueueNotice(getErrorMessage(error));
    }
  }

  async function handleClipboardImport() {
    try {
      const assets = await getBridge().importClipboardImage();

      if (assets.length === 0) {
        setQueueNotice("Clipboard does not contain an image.");
        return;
      }

      addAssets(assets);
      setQueueNotice(null);
    } catch (error) {
      setQueueNotice(getErrorMessage(error));
    }
  }

  async function handlePreflight() {
    if (items.length === 0 || !sanitizedOutputDir) {
      setQueueNotice("Add files and set an output folder before planning.");
      return;
    }

    try {
      const estimate = await getBridge().planBatch(buildBatchPayload());
      setPreflightEstimate(estimate);
      setQueueNotice(null);
    } catch (error) {
      setQueueNotice(getErrorMessage(error));
    }
  }

  async function handleProcessBatch() {
    if (items.length === 0 || !sanitizedOutputDir) {
      setQueueNotice("Add files and set an output folder before processing.");
      return;
    }

    setIsProcessing(true);

    try {
      const result = await getBridge().runBatch(buildBatchPayload());
      const successCount = result.results.filter((entry) => entry.status === "success").length;
      const failedCount = result.results.length - successCount;

      setPreflightEstimate(result.estimate);
      setLastRunResults(result.results);
      setQueueNotice(
        failedCount > 0
          ? `Processing finished: ${successCount} succeeded, ${failedCount} failed.`
          : `Processing finished: ${successCount} files saved to ${sanitizedOutputDir}.`
      );
    } catch (error) {
      setQueueNotice(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRunScreenshots() {
    if (screenshotUrlsList.length === 0 || !screenshotOutDir.trim()) {
      setScreenshotNotice("Add URLs and set an output folder before running screenshots.");
      return;
    }

    setIsScreenshotRunning(true);

    try {
      const result = await getBridge().runScreenshotBatch({
        urls: screenshotUrlsList,
        outDir: screenshotOutDir.trim(),
        shots: Number.parseInt(screenshotShots, 10) || undefined,
        copiesPerScreen: Number.parseInt(screenshotCopies, 10) || undefined,
        mobile: screenshotMobile,
        deviceProfileName: screenshotDeviceName.trim() || null,
        browserMode: screenshotBrowserMode,
        executablePath: screenshotBrowserPath.trim() || undefined,
        cdpEndpoint: screenshotCdpEndpoint.trim() || null,
        proxy: screenshotProxy.trim() || null,
        headless: screenshotHeadless,
        waitAfterNavigationMs: Number.parseInt(screenshotWaitAfterNavMs, 10) || undefined,
        betweenSegmentWaitMs: Number.parseInt(screenshotBetweenSegmentWaitMs, 10) || undefined,
        maxImageBytes: Number.parseInt(screenshotMaxImageBytes, 10) || undefined
      });

      const successCount = result.results.filter((entry) => entry.status === "success").length;
      const failedCount = result.results.length - successCount;

      setScreenshotResult(result);
      setScreenshotNotice(
        failedCount > 0
          ? `Screenshot batch finished: ${successCount} success, ${failedCount} failed.`
          : `Screenshot batch finished: ${successCount} URL(s) captured.`
      );
    } catch (error) {
      setScreenshotNotice(getErrorMessage(error));
    } finally {
      setIsScreenshotRunning(false);
    }
  }

  return (
    <div className="shell">
      <main className="layout">
        <div className="mode-switch">
          <button
            className={`mode-chip ${mode === "images" ? "active" : ""}`}
            onClick={() => setMode("images")}
          >
            Images
          </button>
          <button
            className={`mode-chip ${mode === "screenshots" ? "active" : ""}`}
            onClick={() => setMode("screenshots")}
          >
            Screenshots
          </button>
        </div>

        {mode === "images" ? (
        <section className="content">
          <div
            className={`panel queue-panel ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDragging(false);
              await handleFiles(event.dataTransfer.files);
            }}
          >
            <div className="panel-header">
              <div>
                <h3>Queue</h3>
                <p className="subtle queue-subtitle">
                  Drag files here or use the actions on the right.
                </p>
              </div>
              <div className="queue-header-actions">
                <button className="primary compact-action" onClick={handlePickFiles}>
                  Add Files
                </button>
                <button className="ghost compact-action" onClick={handleClipboardImport}>
                  Paste Clipboard
                </button>
                <span>{items.length} items</span>
                <button className="ghost compact" onClick={() => clearQueue()}>
                  Clear
                </button>
              </div>
            </div>
            {queueNotice ? <div className="notice">{queueNotice}</div> : null}
            <div className="queue-list">
              {items.map((item) => {
                const itemOverride = itemOverrides[item.id];
                const itemTargetFormat = resolveTargetFormat(
                  itemOverride?.targetFormat,
                  globalPreset.targetFormat,
                  item.format
                );
                const itemCompressionOptions = getCompressionOptions(itemTargetFormat);

                return (
                  <div key={item.id} className={`queue-item ${hasStoredOverride(itemOverride) ? "selected" : ""}`}>
                    <div className="queue-item-header">
                      <div className="queue-item-main">
                        <strong>{item.fileName}</strong>
                        <span className="queue-meta">
                          {formatMeta(item.width, item.height, item.format, item.fileSizeBytes)}
                        </span>
                      </div>
                      <div className="queue-inline-settings">
                        <select
                          aria-label="Per-item format"
                          value={itemOverride?.targetFormat ?? ""}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const nextOverride = { ...(itemOverride ?? {}) };

                            if (!nextValue) {
                              delete nextOverride.targetFormat;
                            } else {
                              nextOverride.targetFormat = nextValue as "jpg" | "png" | "webp" | "avif";
                            }

                            applyItemOverride(item.id, nextOverride);
                          }}
                        >
                          <option value="">inherit</option>
                          <option value="jpg">jpg</option>
                          <option value="png">png</option>
                          <option value="webp">webp</option>
                          <option value="avif">avif</option>
                        </select>

                        <input
                          aria-label="Per-item width"
                          type="number"
                          placeholder="W"
                          value={itemOverride?.resize?.width ?? ""}
                          onChange={(event) => {
                            const nextOverride = { ...(itemOverride ?? {}) };
                            const currentResize = nextOverride.resize;
                            const nextWidth = Number(event.target.value || 0);

                            if (!currentResize && nextWidth <= 0) {
                              applyItemOverride(item.id, nextOverride);
                              return;
                            }

                            nextOverride.resize = {
                              width: nextWidth,
                              height: currentResize?.height ?? 0,
                              fit: currentResize?.fit ?? globalPreset.resize?.fit ?? "contain"
                            };

                            applyItemOverride(item.id, nextOverride);
                          }}
                        />

                        <input
                          aria-label="Per-item height"
                          type="number"
                          placeholder="H"
                          value={itemOverride?.resize?.height ?? ""}
                          onChange={(event) => {
                            const nextOverride = { ...(itemOverride ?? {}) };
                            const currentResize = nextOverride.resize;
                            const nextHeight = Number(event.target.value || 0);

                            if (!currentResize && nextHeight <= 0) {
                              applyItemOverride(item.id, nextOverride);
                              return;
                            }

                            nextOverride.resize = {
                              width: currentResize?.width ?? 0,
                              height: nextHeight,
                              fit: currentResize?.fit ?? globalPreset.resize?.fit ?? "contain"
                            };

                            applyItemOverride(item.id, nextOverride);
                          }}
                        />

                        <select
                          aria-label="Per-item fit"
                          value={itemOverride?.resize?.fit ?? globalPreset.resize?.fit ?? "contain"}
                          onChange={(event) => {
                            const nextOverride = { ...(itemOverride ?? {}) };
                            const currentResize = nextOverride.resize;

                            nextOverride.resize = {
                              width: currentResize?.width ?? 0,
                              height: currentResize?.height ?? 0,
                              fit: event.target.value as "contain" | "cover"
                            };

                            applyItemOverride(item.id, nextOverride);
                          }}
                        >
                          <option value="contain">contain</option>
                          <option value="cover">cover</option>
                        </select>

                        <select
                          aria-label="Per-item compression"
                          value={getCompressionPreset(itemOverride?.compress, itemTargetFormat)}
                          onChange={(event) => {
                            const nextOverride = { ...(itemOverride ?? {}) };
                            const nextPreset = event.target.value as CompressionPreset;
                            const nextTargetFormat = resolveTargetFormat(
                              nextOverride.targetFormat,
                              globalPreset.targetFormat,
                              item.format
                            );
                            const nextCompress = getCompressFromPreset(nextPreset, nextTargetFormat);

                            if (!nextCompress) {
                              if (nextOverride.compress) {
                                delete nextOverride.compress;
                              }
                            } else {
                              nextOverride.compress = nextCompress;
                            }

                            applyItemOverride(item.id, nextOverride);
                          }}
                        >
                          {itemCompressionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.value === "default" ? "inherit" : option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="queue-item-tools">
                        {hasStoredOverride(itemOverride) ? <em className="override-chip">custom</em> : null}
                        <button className="ghost compact" onClick={() => resetItemOverride(item.id)}>
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 ? (
                <div className="queue-empty-state">
                  <p className="empty">No files in queue yet.</p>
                  <p className="subtle">Drop images into this panel or click Add Files.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="sidebar">
            <section className="panel global-preset-panel">
              <div className="panel-header">
                <h3>Global Preset</h3>
                <span>{resourceProfile}</span>
              </div>
              <div className="field-grid">
                <label>
                  <span>Output format</span>
                  <select
                    value={globalPreset.targetFormat ?? "webp"}
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        targetFormat: event.target.value as "jpg" | "png" | "webp" | "avif"
                      })
                    }
                  >
                    <option value="jpg">jpg</option>
                    <option value="png">png</option>
                    <option value="webp">webp</option>
                    <option value="avif">avif</option>
                  </select>
                </label>

                <label>
                  <span>Output folder</span>
                  <input
                    value={globalPreset.outputDir ?? ""}
                    placeholder="D:/magic-imger/out"
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        outputDir: event.target.value
                      })
                    }
                  />
                </label>

                <label>
                  <span>Width</span>
                  <input
                    type="number"
                    value={globalPreset.resize?.width ?? ""}
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        resize: {
                          width: Number(event.target.value || 0),
                          height: globalPreset.resize?.height ?? 0,
                          fit: globalPreset.resize?.fit ?? "contain"
                        }
                      })
                    }
                  />
                </label>

                <label>
                  <span>Height</span>
                  <input
                    type="number"
                    value={globalPreset.resize?.height ?? ""}
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        resize: {
                          width: globalPreset.resize?.width ?? 0,
                          height: Number(event.target.value || 0),
                          fit: globalPreset.resize?.fit ?? "contain"
                        }
                      })
                    }
                  />
                </label>

                <label>
                  <span>Fit</span>
                  <select
                    value={globalPreset.resize?.fit ?? "contain"}
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        resize: {
                          width: globalPreset.resize?.width ?? 0,
                          height: globalPreset.resize?.height ?? 0,
                          fit: event.target.value as "contain" | "cover"
                        }
                      })
                    }
                  >
                    <option value="contain">contain</option>
                    <option value="cover">cover</option>
                  </select>
                </label>

                <label>
                  <span>Compression</span>
                  <select
                    value={getCompressionPreset(globalPreset.compress, globalPreset.targetFormat ?? "webp")}
                    onChange={(event) =>
                      setGlobalPreset({
                        ...globalPreset,
                        compress: getCompressFromPreset(
                          event.target.value as CompressionPreset,
                          globalPreset.targetFormat ?? "webp"
                        )
                      })
                    }
                  >
                    {globalCompressionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={allowMoreResources}
                  onChange={(event) => setAllowMoreResources(event.target.checked)}
                />
                <div>
                  <strong>Allow more resources</strong>
                  <span>
                    {allowMoreResources
                      ? "Balanced: up to 1.5 GB RAM, 2 active jobs"
                      : "Safe: up to 1 GB RAM, 1 active job"}
                  </span>
                </div>
              </label>

              <div className="stack-actions">
                <button className="primary wide" onClick={handleProcessBatch} disabled={processDisabled}>
                  {isProcessing ? "Processing..." : "Process Queue"}
                </button>
                <button className="ghost wide" onClick={handlePreflight}>
                  Plan Batch
                </button>
              </div>
            </section>

            <section className="panel batch-panel">
              <div className="panel-header">
                <h3>Batch Status</h3>
                <span>{preflightEstimate ? preflightEstimate.profile : "not planned"}</span>
              </div>

              {sanitizedOutputDir ? (
                <div className="path-row">
                  <span>Output folder</span>
                  <button
                    type="button"
                    className="path-link"
                    onClick={() => openLocalPath(sanitizedOutputDir, setQueueNotice)}
                  >
                    {sanitizedOutputDir}
                  </button>
                </div>
              ) : null}

              {preflightEstimate ? (
                <div className="preflight">
                  <p>
                    RAM: {preflightEstimate.estimatedRamMb.min}-{preflightEstimate.estimatedRamMb.max} MB
                  </p>
                  <p>
                    Time: {preflightEstimate.estimatedDurationSeconds.min}-
                    {preflightEstimate.estimatedDurationSeconds.max} sec
                  </p>
                  <p>Fits profile: {preflightEstimate.fitsProfileBudget ? "yes" : "no"}</p>
                  {preflightEstimate.speedGainVsSafePercent ? (
                    <p>
                      Estimated speed gain vs safe: {preflightEstimate.speedGainVsSafePercent.min}-
                      {preflightEstimate.speedGainVsSafePercent.max}%
                    </p>
                  ) : null}
                  {preflightEstimate.warnings.length > 0 ? (
                    <ul>
                      {preflightEstimate.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="empty">Run planning to see RAM and time estimates.</p>
              )}

              {lastRunResults ? (
                <div className="batch-results">
                  <strong>
                    Last run: {lastRunSuccessCount} success, {lastRunFailureResults.length} failed
                  </strong>
                  {lastRunFailureResults.length > 0 ? (
                    <ul>
                      {lastRunFailureResults.map((result) => (
                        <li key={result.jobId}>
                          {result.jobId}: {result.error}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">All files processed successfully.</p>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </section>
        ) : (
          <section className="content screenshots-content">
            <section className="panel screenshots-panel">
              <div className="panel-header">
                <div>
                  <h3>Screenshot Batch</h3>
                  <p className="subtle queue-subtitle">Paste one URL per line, then choose browser mode and run.</p>
                </div>
                <div className="queue-header-actions">
                  <span>{screenshotUrlsList.length} urls</span>
                </div>
              </div>

              {screenshotNotice ? <div className="notice">{screenshotNotice}</div> : null}

              <div className="screenshots-grid">
                <label className="screenshots-wide">
                  <span>URL list</span>
                  <textarea
                    className="screenshots-textarea"
                    value={screenshotUrls}
                    onChange={(event) => setScreenshotUrls(event.target.value)}
                    placeholder={"https://example.com\nhttps://example.org"}
                  />
                </label>

                <label>
                  <span>Output folder</span>
                  <input value={screenshotOutDir} onChange={(event) => setScreenshotOutDir(event.target.value)} />
                </label>

                <label>
                  <span>Browser mode</span>
                  <select
                    value={screenshotBrowserMode}
                    onChange={(event) => setScreenshotBrowserMode(event.target.value as ScreenshotBrowserMode)}
                  >
                    <option value="bundled-chromium">bundled chromium</option>
                    <option value="system-default">system default</option>
                    <option value="chrome">chrome</option>
                    <option value="edge">edge</option>
                    <option value="firefox">firefox</option>
                    <option value="custom-executable">custom executable</option>
                    <option value="cdp">cdp</option>
                  </select>
                </label>

                <label>
                  <span>Browser path</span>
                  <input
                    value={screenshotBrowserPath}
                    onChange={(event) => setScreenshotBrowserPath(event.target.value)}
                    placeholder="C:/Path/To/browser.exe"
                  />
                </label>

                <label>
                  <span>CDP endpoint</span>
                  <input
                    value={screenshotCdpEndpoint}
                    onChange={(event) => setScreenshotCdpEndpoint(event.target.value)}
                    placeholder="http://127.0.0.1:9222"
                  />
                </label>

                <label>
                  <span>Proxy</span>
                  <input
                    value={screenshotProxy}
                    onChange={(event) => setScreenshotProxy(event.target.value)}
                    placeholder="http://proxy:3128"
                  />
                </label>

                <label>
                  <span>Device profile</span>
                  <input
                    value={screenshotDeviceName}
                    onChange={(event) => setScreenshotDeviceName(event.target.value)}
                    placeholder="iPhone 15 Pro"
                  />
                </label>

                <label>
                  <span>Shots</span>
                  <input value={screenshotShots} onChange={(event) => setScreenshotShots(event.target.value)} />
                </label>

                <label>
                  <span>Copies</span>
                  <input value={screenshotCopies} onChange={(event) => setScreenshotCopies(event.target.value)} />
                </label>

                <label>
                  <span>Wait after nav ms</span>
                  <input
                    value={screenshotWaitAfterNavMs}
                    onChange={(event) => setScreenshotWaitAfterNavMs(event.target.value)}
                  />
                </label>

                <label>
                  <span>Between segment ms</span>
                  <input
                    value={screenshotBetweenSegmentWaitMs}
                    onChange={(event) => setScreenshotBetweenSegmentWaitMs(event.target.value)}
                  />
                </label>

                <label>
                  <span>Max image bytes</span>
                  <input
                    value={screenshotMaxImageBytes}
                    onChange={(event) => setScreenshotMaxImageBytes(event.target.value)}
                    placeholder="disabled"
                  />
                </label>
              </div>

              <div className="screenshots-toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={screenshotMobile}
                    onChange={(event) => setScreenshotMobile(event.target.checked)}
                  />
                  <div>
                    <strong>Mobile mode</strong>
                    <span>Use mobile UA and viewport defaults.</span>
                  </div>
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={screenshotHeadless}
                    onChange={(event) => setScreenshotHeadless(event.target.checked)}
                  />
                  <div>
                    <strong>Headless</strong>
                    <span>Run browser in the background.</span>
                  </div>
                </label>
              </div>

              <div className="stack-actions">
                <button className="primary wide" onClick={handleRunScreenshots} disabled={screenshotRunDisabled}>
                  {isScreenshotRunning ? "Running..." : "Run Screenshot Batch"}
                </button>
              </div>
            </section>

            <section className="panel screenshots-result-panel">
              <div className="panel-header">
                <h3>Result</h3>
                {screenshotResult ? (
                  <button
                    type="button"
                    className="path-link"
                    onClick={() => openLocalPath(screenshotResult.batchDir, setScreenshotNotice)}
                  >
                    {screenshotResult.batchDir}
                  </button>
                ) : (
                  <span>not started</span>
                )}
              </div>

              {screenshotResult ? (
                <div className="batch-results">
                  <strong>
                    {screenshotResult.results.filter((entry) => entry.status === "success").length} success,{" "}
                    {screenshotResult.results.filter((entry) => entry.status === "failed").length} failed
                  </strong>
                  <ul>
                    {screenshotResult.results.map((entry) => (
                      <li key={entry.url}>
                        {entry.url}:{" "}
                        {entry.status === "success"
                          ? `${entry.artifacts.length} file(s)`
                          : `failed - ${entry.error ?? "unknown error"}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="empty">Run a screenshot batch to see the summary here.</p>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
