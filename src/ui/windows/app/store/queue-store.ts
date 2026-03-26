import { createStore } from "zustand/vanilla";

import { MAX_BATCH_FILES } from "../../../../shared/config.js";
import { JobConfigPatch, PreflightEstimate, InputAsset, ResourceProfileName } from "../../../../shared/types.js";

export interface QueuePreset extends JobConfigPatch {}

export interface QueueStoreState {
  items: InputAsset[];
  selectedAssetId: string | null;
  itemOverrides: Record<string, JobConfigPatch>;
  globalPreset: QueuePreset;
  resourceProfile: ResourceProfileName;
  allowMoreResources: boolean;
  queueNotice: string | null;
  preflightEstimate: PreflightEstimate | null;
  addAssets: (assets: InputAsset[]) => void;
  removeAsset: (assetId: string) => void;
  clearQueue: () => void;
  selectAsset: (assetId: string | null) => void;
  setItemOverride: (assetId: string, patch: JobConfigPatch) => void;
  resetItemOverride: (assetId: string) => void;
  setGlobalPreset: (preset: QueuePreset) => void;
  setAllowMoreResources: (enabled: boolean) => void;
  setQueueNotice: (notice: string | null) => void;
  setPreflightEstimate: (estimate: PreflightEstimate | null) => void;
}

const INITIAL_PRESET: QueuePreset = {
  targetFormat: "webp",
  outputDir: ""
};

export function createQueueStore() {
  return createStore<QueueStoreState>()((set) => ({
    items: [],
    selectedAssetId: null,
    itemOverrides: {},
    globalPreset: INITIAL_PRESET,
    resourceProfile: "safe",
    allowMoreResources: false,
    queueNotice: null,
    preflightEstimate: null,
    addAssets: (assets) =>
      set((state) => {
        const nextItems = [...state.items, ...assets];
        const trimmedItems = nextItems.slice(0, MAX_BATCH_FILES);

        return {
          items: trimmedItems,
          queueNotice:
            nextItems.length > MAX_BATCH_FILES
              ? `Queue limit reached: only the first ${MAX_BATCH_FILES} files were kept.`
              : state.queueNotice
        };
      }),
    removeAsset: (assetId) =>
      set((state) => {
        const items = state.items.filter((item) => item.id !== assetId);
        const nextOverrides = { ...state.itemOverrides };
        delete nextOverrides[assetId];

        return {
          items,
          itemOverrides: nextOverrides,
          selectedAssetId: state.selectedAssetId === assetId ? null : state.selectedAssetId
        };
      }),
    clearQueue: () =>
      set({
        items: [],
        selectedAssetId: null,
        itemOverrides: {},
        queueNotice: null,
        preflightEstimate: null
      }),
    selectAsset: (assetId) =>
      set({
        selectedAssetId: assetId
      }),
    setItemOverride: (assetId, patch) =>
      set((state) => ({
        itemOverrides: {
          ...state.itemOverrides,
          [assetId]: {
            ...state.itemOverrides[assetId],
            ...patch
          }
        }
      })),
    resetItemOverride: (assetId) =>
      set((state) => {
        const nextOverrides = { ...state.itemOverrides };
        delete nextOverrides[assetId];

        return {
          itemOverrides: nextOverrides
        };
      }),
    setGlobalPreset: (preset) =>
      set({
        globalPreset: preset
      }),
    setAllowMoreResources: (enabled) =>
      set({
        allowMoreResources: enabled,
        resourceProfile: enabled ? "balanced" : "safe"
      }),
    setQueueNotice: (notice) =>
      set({
        queueNotice: notice
      }),
    setPreflightEstimate: (estimate) =>
      set({
        preflightEstimate: estimate
      })
  }));
}
