import { PreflightEstimate, ResourceProfile, ResourceProfileName } from "../shared/types.js";

const RESOURCE_PROFILES: Record<ResourceProfileName, ResourceProfile> = {
  safe: {
    name: "safe",
    maxRamMb: 1024,
    processingJobs: 1,
    previewJobs: 1
  },
  balanced: {
    name: "balanced",
    maxRamMb: 1536,
    processingJobs: 2,
    previewJobs: 1
  }
};

export function getResourceProfile(name: ResourceProfileName): ResourceProfile {
  return RESOURCE_PROFILES[name];
}

export class ResourceBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBudgetExceededError";
  }
}

export function assertEstimateFitsProfile(estimate: PreflightEstimate): void {
  if (estimate.fitsProfileBudget) {
    return;
  }

  throw new ResourceBudgetExceededError(
    `Estimated RAM budget exceeded for profile "${estimate.profile}": ${estimate.estimatedRamMb.max} MB.`
  );
}
