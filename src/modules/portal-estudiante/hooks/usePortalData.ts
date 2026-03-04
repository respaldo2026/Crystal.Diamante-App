"use client";

import { useCallback, useRef, useState } from "react";
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
          onAuthErrorAction();
          return;
        }

        if (result.code === "PROFILE_NOT_FOUND") {
          onProfileErrorAction();
          return;
        }

        throw result.error;
      }

      onSuccessAction(result.payload);
    } catch (error) {
      onUnknownErrorAction(error);
    } finally {
      hasFetchedOnceRef.current = true;
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [onAuthErrorAction, onProfileErrorAction, onSuccessAction, onUnknownErrorAction]);

  return {
    loading,
    loadPortalData,
  };
};
