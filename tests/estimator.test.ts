import { describe, expect, it } from "vitest";

import { createPreflightEstimate } from "../src/core/estimator.js";
import { ImageAssetMetadata } from "../src/shared/types.js";

const assets: ImageAssetMetadata[] = [
  {
    id: "1",
    format: "jpg",
    width: 3000,
    height: 2000,
    fileSizeBytes: 4_500_000
  },
  {
    id: "2",
    format: "png",
    width: 4000,
    height: 3000,
    fileSizeBytes: 12_000_000
  },
  {
    id: "3",
    format: "webp",
    width: 2400,
    height: 1600,
    fileSizeBytes: 2_800_000
  }
];

describe("preflight estimator", () => {
  it("creates a safe estimate that stays within the documented safe RAM ceiling", () => {
    const estimate = createPreflightEstimate({
      assets,
      targetFormat: "webp",
      profile: "safe"
    });

    expect(estimate.profile).toBe("safe");
    expect(estimate.assetCount).toBe(3);
    expect(estimate.estimatedRamMb.max).toBeLessThanOrEqual(1024);
    expect(estimate.estimatedDurationSeconds.min).toBeGreaterThan(0);
    expect(estimate.fitsProfileBudget).toBe(true);
    expect(estimate.speedGainVsSafePercent).toBeNull();
    expect(estimate.warnings).toContain("PNG-heavy batches tend to use more CPU and memory.");
  });

  it("creates a balanced estimate with a higher RAM budget and shorter runtime than safe", () => {
    const safeEstimate = createPreflightEstimate({
      assets,
      targetFormat: "webp",
      profile: "safe"
    });
    const balancedEstimate = createPreflightEstimate({
      assets,
      targetFormat: "webp",
      profile: "balanced"
    });

    expect(balancedEstimate.profile).toBe("balanced");
    expect(balancedEstimate.estimatedRamMb.max).toBeGreaterThan(safeEstimate.estimatedRamMb.max);
    expect(balancedEstimate.estimatedRamMb.max).toBeLessThanOrEqual(1536);
    expect(balancedEstimate.estimatedDurationSeconds.max).toBeLessThan(
      safeEstimate.estimatedDurationSeconds.max
    );
    expect(balancedEstimate.fitsProfileBudget).toBe(true);
    expect(balancedEstimate.speedGainVsSafePercent).toEqual({
      min: 20,
      max: 50
    });
  });

  it("warns that AVIF is slower and offers only limited speed gain", () => {
    const estimate = createPreflightEstimate({
      assets,
      targetFormat: "avif",
      profile: "balanced"
    });

    expect(estimate.warnings).toContain("AVIF encoding is slower and may have limited speed gain.");
    expect(estimate.speedGainVsSafePercent).toEqual({
      min: 10,
      max: 40
    });
  });

  it("marks oversized safe batches as exceeding the safe RAM budget", () => {
    const oversizedAssets: ImageAssetMetadata[] = [
      {
        id: "huge-1",
        format: "png",
        width: 20000,
        height: 20000,
        fileSizeBytes: 120_000_000
      },
      {
        id: "huge-2",
        format: "png",
        width: 20000,
        height: 20000,
        fileSizeBytes: 120_000_000
      }
    ];

    const estimate = createPreflightEstimate({
      assets: oversizedAssets,
      targetFormat: "png",
      profile: "safe"
    });

    expect(estimate.fitsProfileBudget).toBe(false);
    expect(estimate.estimatedRamMb.max).toBeGreaterThan(1024);
  });
});
