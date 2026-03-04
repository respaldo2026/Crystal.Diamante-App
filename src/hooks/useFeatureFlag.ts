"use client";

import { useMemo } from "react";
import { isFeatureEnabled } from "@/config/feature-flags";

export const useFeatureFlag = (flagName: string, fallback = false): boolean => {
  return useMemo(() => isFeatureEnabled(flagName, fallback), [flagName, fallback]);
};
