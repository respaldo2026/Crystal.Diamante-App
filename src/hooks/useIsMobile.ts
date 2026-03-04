"use client";

import { Grid } from "antd";

type BreakpointKey = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

type BreakpointMap = Partial<Record<BreakpointKey, boolean>>;

export const useIsMobile = (desktopFrom: BreakpointKey = "md"): boolean => {
  const screens = Grid.useBreakpoint() as BreakpointMap;
  return !screens[desktopFrom];
};
