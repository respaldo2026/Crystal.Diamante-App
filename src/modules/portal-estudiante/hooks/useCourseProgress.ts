"use client";

import { useCallback, useMemo } from "react";

type UseCourseProgressParams = {
  quizzesClase: any[];
  quizIntentos: any[];
  isQuizApprovedAction: (nota: number) => boolean;
};

export const useCourseProgress = ({
  quizzesClase,
  quizIntentos,
  isQuizApprovedAction,
}: UseCourseProgressParams) => {
  const quizByTemaId = useMemo(() => {
    const map = new Map<string, any>();
    (quizzesClase || []).forEach((quiz: any) => {
      const temaId = String(quiz?.pensum_curso_id || "");
      if (!temaId || map.has(temaId)) return;
      map.set(temaId, quiz);
    });
    return map;
  }, [quizzesClase]);

  const intentoByQuizId = useMemo(() => {
    const map = new Map<string, any>();
    (quizIntentos || []).forEach((intento: any) => {
      const quizId = String(intento?.quiz_id || "");
      if (!quizId || map.has(quizId)) return;
      map.set(quizId, intento);
    });
    return map;
  }, [quizIntentos]);

  const getQuizByTemaId = useCallback(
    (temaId: string | number) => quizByTemaId.get(String(temaId || "")) || null,
    [quizByTemaId]
  );

  const getIntentoByTemaId = useCallback(
    (temaId: string | number) => {
      const quiz = getQuizByTemaId(temaId);
      if (!quiz) return null;
      return intentoByQuizId.get(String(quiz?.id || "")) || null;
    },
    [getQuizByTemaId, intentoByQuizId]
  );

  const getNotaByTemaId = useCallback(
    (temaId: string | number) => {
      const intento = getIntentoByTemaId(temaId);
      return intento ? Number(intento?.calificacion || 0) : null;
    },
    [getIntentoByTemaId]
  );

  const isTemaCompletadoByTemaId = useCallback(
    (temaId: string | number) => {
      const nota = getNotaByTemaId(temaId);
      return nota != null && isQuizApprovedAction(nota);
    },
    [getNotaByTemaId, isQuizApprovedAction]
  );

  const getPrimerTemaPendienteIndex = useCallback(
    (temasCiclo: any[]) => {
      for (let index = 0; index < temasCiclo.length; index++) {
        const temaId = String(temasCiclo[index]?.id || "");
        const quiz = getQuizByTemaId(temaId);
        if (!quiz) continue;

        const intento = intentoByQuizId.get(String(quiz?.id || ""));
        const nota = intento ? Number(intento?.calificacion || 0) : null;
        if (nota == null || !isQuizApprovedAction(nota)) return index;
      }
      return temasCiclo.length;
    },
    [getQuizByTemaId, intentoByQuizId, isQuizApprovedAction]
  );

  const getPrimerCicloIncompletoIndex = useCallback(
    (ciclosPrograma: any[], getTemasCicloAction: (ciclo: any) => any[]) => {
      for (let index = 0; index < ciclosPrograma.length; index++) {
        const temas = getTemasCicloAction(ciclosPrograma[index]);
        const primerTemaPendiente = getPrimerTemaPendienteIndex(temas);
        if (primerTemaPendiente < temas.length) return index;
      }
      return ciclosPrograma.length;
    },
    [getPrimerTemaPendienteIndex]
  );

  return {
    getQuizByTemaId,
    getIntentoByTemaId,
    getNotaByTemaId,
    isTemaCompletadoByTemaId,
    getPrimerTemaPendienteIndex,
    getPrimerCicloIncompletoIndex,
  };
};
