import { describe, expect, it } from "vitest";

import { getResourceProfile } from "../src/core/resources.js";

describe("resource profiles", () => {
  it("returns the default safe profile within the documented RAM budget", () => {
    const profile = getResourceProfile("safe");

    expect(profile.name).toBe("safe");
    expect(profile.maxRamMb).toBe(1024);
    expect(profile.processingJobs).toBe(1);
    expect(profile.previewJobs).toBe(1);
  });

  it("returns the balanced profile with higher throughput and higher RAM budget", () => {
    const profile = getResourceProfile("balanced");

    expect(profile.name).toBe("balanced");
    expect(profile.maxRamMb).toBe(1536);
    expect(profile.processingJobs).toBe(2);
    expect(profile.previewJobs).toBe(1);
  });
});
