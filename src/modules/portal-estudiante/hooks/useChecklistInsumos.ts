"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const onLoadErrorRef = useRef(onLoadErrorAction);
  const onSaveErrorRef = useRef(onSaveErrorAction);

  useEffect(() => {
    onLoadErrorRef.current = onLoadErrorAction;
  }, [onLoadErrorAction]);

  useEffect(() => {
    onSaveErrorRef.current = onSaveErrorAction;
  }, [onSaveErrorAction]);

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
      onLoadErrorRef.current?.(error);
    }
  }, [estudianteId]);

  useEffect(() => {
    if (!estudianteId) return;
    try {
      const key = `portal-checklist-insumos:${estudianteId}`;
      localStorage.setItem(key, JSON.stringify(checklistInsumos));
    } catch (error) {
      onSaveErrorRef.current?.(error);
    }
  }, [checklistInsumos, estudianteId]);

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
