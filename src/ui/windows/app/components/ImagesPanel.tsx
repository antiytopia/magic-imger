import type { MagicImgerBridge } from "../../preload.js";
import type { BatchJobResult, JobConfigPatch } from "../../../../shared/types.js";

import { useMemo, useState } from "react";
import { useStore } from "zustand";

import { queueStore } from "../store/queue-store-singleton.js";
import { getErrorMessage } from "../lib/errors.js";
import { openLocalPath, showItemInFolder } from "../lib/fs-links.js";
import {
  getCompressFromPreset,
  getCompressionOptions,
  getCompressionPreset,
  type OutputFormat,
  resolveTargetFormat
} from "../lib/compression.js";
import { formatMeta } from "../lib/format.js";
import { hasStoredOverride, normalizeCompress, normalizeItemOverrides, normalizeResize } from "../lib/normalize.js";

type AppResourceProfile = "safe" | "balanced";

export function ImagesPanel(props: { bridge: MagicImgerBridge; className?: string }) {
  const { bridge } = props;
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

  const sanitizedOutputDir = globalPreset.outputDir?.trim() ?? "";
  const globalCompressionOptions = useMemo(
    () => getCompressionOptions(globalPreset.targetFormat ?? "webp"),
    [globalPreset.targetFormat]
  );
  const processDisabled = items.length === 0 || !sanitizedOutputDir || isProcessing;
  const lastRunSuccessCount = lastRunResults?.filter((result) => result.status === "success").length ?? 0;
  const lastRunFailureResults = lastRunResults?.filter((result) => result.status === "failed") ?? [];
  const lastRunSuccessResults = lastRunResults?.filter((result) => result.status === "success") ?? [];

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
      profile: resourceProfile as AppResourceProfile,
      itemOverrides: normalizeItemOverrides(itemOverrides),
      resize: normalizeResize(globalPreset.resize),
      compress: normalizeCompress(globalPreset.compress)
    };
  }

  async function readDroppedAssets(files: FileList | null) {
    if (!files || files.length === 0) {
      return [];
    }

    const paths = Array.from(files)
      .map((file) => bridge.getPathForFile(file))
      .filter((value): value is string => Boolean(value));

    if (paths.length === 0) {
      return [];
    }

    return bridge.readInputAssets(paths);
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
      const assets = await bridge.importClipboardImage();

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
      const estimate = await bridge.planBatch(buildBatchPayload());
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
      const result = await bridge.runBatch(buildBatchPayload());
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

  return (
    <section className={`content ${props.className ?? ""}`.trim()}>
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
              1) Add files (drop here / Add Files) · 2) Set Output folder (required) · 3) Pick Output format · 4) Process Queue
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
                    <span className="queue-meta">{formatMeta(item.width, item.height, item.format, item.fileSizeBytes)}</span>
                  </div>
                  <div className="queue-inline-settings">
                    <select
                      aria-label="Per-item output format"
                      value={itemOverride?.targetFormat ?? globalPreset.targetFormat ?? item.format}
                      onChange={(event) => {
                        const nextOverride = { ...(itemOverride ?? {}) };
                        const value = event.target.value as OutputFormat;

                        if (value === (globalPreset.targetFormat ?? item.format)) {
                          if (nextOverride.targetFormat) {
                            delete nextOverride.targetFormat;
                          }
                        } else {
                          nextOverride.targetFormat = value;
                        }

                        applyItemOverride(item.id, nextOverride);
                      }}
                    >
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
                        const nextPreset = event.target.value as ReturnType<typeof getCompressionPreset>;
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
                    targetFormat: event.target.value as OutputFormat
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
              <span>Output folder (required)</span>
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
              <span className="subtle">Where to save results. The folder is created automatically if it doesn’t exist.</span>
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
                    compress: getCompressFromPreset(event.target.value as any, globalPreset.targetFormat ?? "webp")
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
                {allowMoreResources ? "Balanced: up to 1.5 GB RAM, 2 active jobs" : "Safe: up to 1 GB RAM, 1 active job"}
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
          {!sanitizedOutputDir ? <p className="subtle">Processing is disabled until Output folder is set.</p> : null}
          {items.length === 0 ? <p className="subtle">Add at least one file to enable processing and planning.</p> : null}
        </section>

        <section className="panel batch-panel">
          <div className="panel-header">
            <h3>Batch Status</h3>
            <span>{preflightEstimate ? preflightEstimate.profile : "not planned"}</span>
          </div>

          {sanitizedOutputDir ? (
            <div className="path-row">
              <span>Output folder</span>
              <button type="button" className="path-link" onClick={() => openLocalPath(bridge, sanitizedOutputDir, setQueueNotice)}>
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
                Time: {preflightEstimate.estimatedDurationSeconds.min}-{preflightEstimate.estimatedDurationSeconds.max} sec
              </p>
              <p>Fits profile: {preflightEstimate.fitsProfileBudget ? "yes" : "no"}</p>
              {preflightEstimate.speedGainVsSafePercent ? (
                <p>
                  Estimated speed gain vs safe: {preflightEstimate.speedGainVsSafePercent.min}-{preflightEstimate.speedGainVsSafePercent.max}%
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
            <p className="empty">Set Output folder, then click Plan Batch to see RAM and time estimates.</p>
          )}

          {lastRunResults ? (
            <div className="batch-results">
              <strong>
                Last run: {lastRunSuccessCount} success, {lastRunFailureResults.length} failed
              </strong>
              {lastRunSuccessResults.length > 0 ? (
                <button type="button" className="path-link" onClick={() => showItemInFolder(bridge, lastRunSuccessResults[0].outputPath, setQueueNotice)}>
                  Reveal first result
                </button>
              ) : null}
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
  );
}
