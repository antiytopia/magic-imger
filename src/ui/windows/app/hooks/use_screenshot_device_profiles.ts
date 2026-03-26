import { useEffect, useMemo, useState } from "react";

import type { MagicImgerBridge } from "../../preload.js";

type DeviceProfileSummary = {
  name: string;
  viewport: { width: number; height: number } | null;
  isMobile: boolean | null;
};

export function useScreenshotDeviceProfiles(bridge: MagicImgerBridge) {
  const [profiles, setProfiles] = useState<DeviceProfileSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    bridge
      .listScreenshotDeviceProfiles()
      .then((nextProfiles) => {
        if (cancelled) {
          return;
        }
        setProfiles(nextProfiles);
      })
      .catch(() => {
        // ignore: keep an empty list when bridge fails
      });

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const grouped = useMemo(() => {
    const tablets: DeviceProfileSummary[] = [];
    const phones: DeviceProfileSummary[] = [];
    const other: DeviceProfileSummary[] = [];

    for (const entry of profiles) {
      const name = entry.name.toLowerCase();
      if (name.includes("ipad")) {
        tablets.push(entry);
        continue;
      }

      if (name.includes("iphone") || name.includes("pixel")) {
        phones.push(entry);
        continue;
      }

      other.push(entry);
    }

    return { tablets, phones, other };
  }, [profiles]);

  return { profiles, grouped };
}

