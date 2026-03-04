"use client";

import { useCallback, useEffect, useState } from "react";

type UseChecklistInsumosParams = {
  estudianteId?: string | null;
  onLoadErrorAction?: (error: unknown) => void;
  onSaveErrorAction?: (error: unknown) => void;
};

export const useChecklistInsumos = ({
  estudianteId,
  onLoadErrorAction,
  onSaveErrorAction,
}: UseChecklistInsumosParams) => {
  const [checklistInsumos, setChecklistInsumos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!estudianteId) return;
    try {
      const key = `portal-checklist-insumos:${estudianteId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setChecklistInsumos(parsed);
      }
    } catch (error) {
      onLoadErrorAction?.(error);
    }
  }, [estudianteId, onLoadErrorAction]);

  useEffect(() => {
    if (!estudianteId) return;
    try {
      const key = `portal-checklist-insumos:${estudianteId}`;
      localStorage.setItem(key, JSON.stringify(checklistInsumos));
    } catch (error) {
      onSaveErrorAction?.(error);
    }
  }, [checklistInsumos, estudianteId, onSaveErrorAction]);

  const buildChecklistKey = useCallback(
    (matriculaId: string | number, temaId: string | number, insumoIdOrFallback: string) =>
      `${matriculaId}|${temaId}|${insumoIdOrFallback}`,
    []
  );

  const isChecklistItemChecked = useCallback(
    (key: string) => Boolean(checklistInsumos[key]),
    [checklistInsumos]
  );

  const setChecklistItemChecked = useCallback((key: string, checked: boolean) => {
    setChecklistInsumos((prev) => ({
      ...prev,
      [key]: checked,
    }));
  }, []);

  return {
    checklistInsumos,
    setChecklistInsumos,
    buildChecklistKey,
    isChecklistItemChecked,
    setChecklistItemChecked,
  };
};
