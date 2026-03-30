import { useMemo, useState } from "react";

import type { MagicImgerBridge } from "../../preload.js";
import type { ScreenshotBatchResult, ScreenshotBrowserMode } from "../../../../shared/types.js";
import { getErrorMessage } from "../lib/errors.js";
import { openLocalPath, showItemInFolder } from "../lib/fs-links.js";
import { useScreenshotDeviceProfiles } from "../hooks/use_screenshot_device_profiles.js";

export function ScreenshotsPanel(props: {
  bridge: MagicImgerBridge;
  className?: string;
}) {
  const { bridge } = props;
  const [screenshotUrls, setScreenshotUrls] = useState("");
  const [screenshotOutDir, setScreenshotOutDir] = useState("D:/magic-imger/screenshots");
  const [screenshotBrowserMode, setScreenshotBrowserMode] =
    useState<ScreenshotBrowserMode>("bundled-chromium");
  const [screenshotBrowserPath, setScreenshotBrowserPath] = useState("");
  const [screenshotCdpEndpoint, setScreenshotCdpEndpoint] = useState("");
  const [screenshotProxy, setScreenshotProxy] = useState("");
  const [screenshotDeviceName, setScreenshotDeviceName] = useState("");
  const [screenshotViewportWidth, setScreenshotViewportWidth] = useState("");
  const [screenshotViewportHeight, setScreenshotViewportHeight] = useState("");
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

  const { grouped: screenshotDeviceOptions } = useScreenshotDeviceProfiles(bridge);

  const screenshotUrlsList = useMemo(
    () =>
      screenshotUrls
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [screenshotUrls]
  );

  const screenshotViewportOverride = useMemo(() => {
    const width = Number.parseInt(screenshotViewportWidth, 10);
    const height = Number.parseInt(screenshotViewportHeight, 10);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }

    return { width, height };
  }, [screenshotViewportHeight, screenshotViewportWidth]);

  const screenshotRunDisabled =
    screenshotUrlsList.length === 0 || !screenshotOutDir.trim() || isScreenshotRunning;

  async function handleRunScreenshots() {
    if (screenshotUrlsList.length === 0 || !screenshotOutDir.trim()) {
      setScreenshotNotice("Add URLs and set an output folder before running screenshots.");
      return;
    }

    setIsScreenshotRunning(true);

    try {
      const result = await bridge.runScreenshotBatch({
        urls: screenshotUrlsList,
        outDir: screenshotOutDir.trim(),
        shots: Number.parseInt(screenshotShots, 10) || undefined,
        copiesPerScreen: Number.parseInt(screenshotCopies, 10) || undefined,
        mobile: screenshotMobile,
        deviceProfileName: screenshotDeviceName.trim() || null,
        viewport: screenshotViewportOverride,
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
    <section className={`content screenshots-content ${props.className ?? ""}`.trim()}>
      <section className="panel screenshots-panel">
        <div className="panel-header">
          <div>
            <h3>Screenshot Batch</h3>
            <p className="subtle queue-subtitle">1) Paste one URL per line · 2) Set Output folder (required) · 3) Choose browser mode · 4) Run</p>
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
            <span>Output folder (required)</span>
            <input value={screenshotOutDir} onChange={(event) => setScreenshotOutDir(event.target.value)} />
            <span className="subtle">Where to save screenshots. The folder is created automatically if it doesn’t exist.</span>
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
            <span>Device (Playwright)</span>
            <select value={screenshotDeviceName} onChange={(event) => setScreenshotDeviceName(event.target.value)}>
              <option value="">(auto)</option>
              {screenshotDeviceOptions.tablets.length > 0 ? (
                <optgroup label="Tablets (iPad)">
                  {screenshotDeviceOptions.tablets.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.viewport
                        ? `${entry.name} (${entry.viewport.width}x${entry.viewport.height})`
                        : entry.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {screenshotDeviceOptions.phones.length > 0 ? (
                <optgroup label="Phones">
                  {screenshotDeviceOptions.phones.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.viewport
                        ? `${entry.name} (${entry.viewport.width}x${entry.viewport.height})`
                        : entry.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {screenshotDeviceOptions.other.length > 0 ? (
                <optgroup label="Other">
                  {screenshotDeviceOptions.other.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.viewport
                        ? `${entry.name} (${entry.viewport.width}x${entry.viewport.height})`
                        : entry.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <label>
            <span>Viewport width</span>
            <input
              value={screenshotViewportWidth}
              onChange={(event) => setScreenshotViewportWidth(event.target.value)}
              placeholder="820"
            />
          </label>

          <label>
            <span>Viewport height</span>
            <input
              value={screenshotViewportHeight}
              onChange={(event) => setScreenshotViewportHeight(event.target.value)}
              placeholder="1180"
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
              placeholder="4000"
            />
          </label>

          <label>
            <span>Between segment wait ms</span>
            <input
              value={screenshotBetweenSegmentWaitMs}
              onChange={(event) => setScreenshotBetweenSegmentWaitMs(event.target.value)}
              placeholder="500"
            />
          </label>

          <label>
            <span>Max image bytes</span>
            <input
              value={screenshotMaxImageBytes}
              onChange={(event) => setScreenshotMaxImageBytes(event.target.value)}
              placeholder="(optional)"
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
              onClick={() => openLocalPath(bridge, screenshotResult.batchDir, setScreenshotNotice)}
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
                  {entry.status === "success" ? (
                    <>
                      {entry.artifacts.length} file(s){" "}
                      <button
                        type="button"
                        className="path-link"
                        onClick={() => showItemInFolder(bridge, entry.artifacts[0]?.path ?? "", setScreenshotNotice)}
                      >
                        Reveal
                      </button>
                    </>
                  ) : (
                    `failed - ${entry.error ?? "unknown error"}`
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty">Run a screenshot batch to see the summary here.</p>
        )}
      </section>
    </section>
  );
}
