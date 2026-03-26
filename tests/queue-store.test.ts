import { describe, expect, it } from "vitest";

import { MAX_BATCH_FILES } from "../src/shared/config.js";
import { createQueueStore } from "../src/ui/windows/app/store/queue-store.js";

function createAsset(id: string, fileName: string) {
  return {
    id,
    inputPath: `D:/magic-imger/in/${fileName}`,
    fileName,
    baseName: fileName.replace(/\.[^.]+$/, ""),
    extension: "png" as const,
    format: "png" as const,
    width: 800,
    height: 600,
    fileSizeBytes: 250_000
  };
}

describe("queue store", () => {
  it("starts in safe mode and requires explicit opt-in for more resources", () => {
    const store = createQueueStore();

    expect(store.getState().resourceProfile).toBe("safe");
    expect(store.getState().allowMoreResources).toBe(false);

    store.getState().setAllowMoreResources(true);

    expect(store.getState().allowMoreResources).toBe(true);
    expect(store.getState().resourceProfile).toBe("balanced");

    store.getState().setAllowMoreResources(false);

    expect(store.getState().allowMoreResources).toBe(false);
    expect(store.getState().resourceProfile).toBe("safe");
  });

  it("adds queue items, selects an item, and supports per-item overrides", () => {
    const store = createQueueStore();
    const first = createAsset("1", "first.png");
    const second = createAsset("2", "second.png");

    store.getState().addAssets([first, second]);
    store.getState().selectAsset("2");
    store.getState().setItemOverride("2", {
      compress: {
        quality: 62
      }
    });

    expect(store.getState().items).toHaveLength(2);
    expect(store.getState().selectedAssetId).toBe("2");
    expect(store.getState().itemOverrides["2"]).toEqual({
      compress: {
        quality: 62
      }
    });

    store.getState().resetItemOverride("2");

    expect(store.getState().itemOverrides["2"]).toBeUndefined();
  });

  it("updates the global preset without mutating queue items", () => {
    const store = createQueueStore();

    store.getState().setGlobalPreset({
      targetFormat: "webp",
      resize: {
        width: 1200,
        height: 1200,
        fit: "contain"
      },
      compress: {
        quality: 80
      },
      outputDir: "D:/magic-imger/out"
    });

    expect(store.getState().globalPreset).toEqual({
      targetFormat: "webp",
      resize: {
        width: 1200,
        height: 1200,
        fit: "contain"
      },
      compress: {
        quality: 80
      },
      outputDir: "D:/magic-imger/out"
    });
    expect(store.getState().items).toHaveLength(0);
  });

  it("caps the queue at the documented batch limit", () => {
    const store = createQueueStore();
    const assets = Array.from({ length: MAX_BATCH_FILES + 5 }, (_, index) =>
      createAsset(String(index), `asset-${index}.png`)
    );

    store.getState().addAssets(assets);

    expect(store.getState().items).toHaveLength(MAX_BATCH_FILES);
    expect(store.getState().queueNotice).toBe(
      `Queue limit reached: only the first ${MAX_BATCH_FILES} files were kept.`
    );
  });
});
