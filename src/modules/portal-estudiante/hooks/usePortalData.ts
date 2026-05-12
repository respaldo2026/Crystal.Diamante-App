"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPortalEstudianteData } from "@/modules/portal-estudiante/services/portal-data.service";

type PortalPayload = {
  estudiante: any;
  whatsappAgente: string | null;
  whatsappAdmisiones: string | null;
  logoAcademia: string | null;
  matriculas: any[];
  pagos: any[];
  asistencias: any[];
  quizIntentos: any[];
  calificacionesActividad: any[];
  calificaciones: any[];
  pensum: any[];
  materiales: any[];
  materialesCiclo: any[];
  materialesClase: any[];
  quizzesClase: any[];
  avancePorCurso: any[];
  certificados: any[];
};

type UsePortalDataParams = {
  onSuccessAction: (payload: PortalPayload) => void;
  onAuthErrorAction: () => void;
  onProfileErrorAction: () => void;
  onUnknownErrorAction: (error: unknown) => void;
};

export const usePortalData = ({
  onSuccessAction,
  onAuthErrorAction,
  onProfileErrorAction,
  onUnknownErrorAction,
}: UsePortalDataParams) => {
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const hasFetchedOnceRef = useRef(false);
  const onSuccessRef = useRef(onSuccessAction);
  const onAuthErrorRef = useRef(onAuthErrorAction);
  const onProfileErrorRef = useRef(onProfileErrorAction);
  const onUnknownErrorRef = useRef(onUnknownErrorAction);

  useEffect(() => {
    onSuccessRef.current = onSuccessAction;
  }, [onSuccessAction]);

  useEffect(() => {
    onAuthErrorRef.current = onAuthErrorAction;
  }, [onAuthErrorAction]);

  useEffect(() => {
    onProfileErrorRef.current = onProfileErrorAction;
  }, [onProfileErrorAction]);

  useEffect(() => {
    onUnknownErrorRef.current = onUnknownErrorAction;
  }, [onUnknownErrorAction]);

  const loadPortalData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!hasFetchedOnceRef.current) {
        setLoading(true);
      }

      const result = await fetchPortalEstudianteData();

      if (!result.ok) {
        if (result.code === "NOT_AUTHENTICATED") {
          onAuthErrorRef.current();
          return;
        }

        if (result.code === "PROFILE_NOT_FOUND") {
          onProfileErrorRef.current();
          return;
        }

        throw result.error;
      }

      onSuccessRef.current(result.payload);
    } catch (error) {
      onUnknownErrorRef.current(error);
    } finally {
      hasFetchedOnceRef.current = true;
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  return {
    loading,
    loadPortalData,
  };
};
