"use client";

import { useEffect, useState } from "react";

export const useDelayedLoader = (isLoading: boolean, delayMs = 180): boolean => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }

    if (delayMs <= 0) {
      setVisible(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [isLoading, delayMs]);

  return visible;
};
