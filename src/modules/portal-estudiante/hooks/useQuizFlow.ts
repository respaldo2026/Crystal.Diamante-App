"use client";

import { useCallback, useState } from "react";
import { message } from "antd";
import { logger } from "@utils/logger";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { quizAprobado } from "@/modules/portal-estudiante/utils";

type QuizResultado = {
  quizId?: string;
  calificacion: number;
  porcentaje: number;
  aprobado: boolean;
  respuestasErradas: any[];
  totalPreguntas: number;
  correctas: number;
  tituloQuiz?: string;
  claseNumero?: number | string | null;
};

type UseQuizFlowParams = {
  estudianteId?: string | null;
  setQuizIntentosAction: React.Dispatch<React.SetStateAction<any[]>>;
  getMatriculaDeQuizAction: (quiz: any) => any;
  resolveClaveOpcionAction: (pregunta: any, valor?: string | null) => string;
  getTextoOpcionAction: (pregunta: any, opcion?: string | null) => string;
  onRefreshPortalAction: () => Promise<void>;
};

export const useQuizFlow = ({
  estudianteId,
  setQuizIntentosAction,
  getMatriculaDeQuizAction,
  resolveClaveOpcionAction,
  getTextoOpcionAction,
  onRefreshPortalAction,
}: UseQuizFlowParams) => {
  const [quizPreguntas, setQuizPreguntas] = useState<any[]>([]);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizActivo, setQuizActivo] = useState<any | null>(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizRespuestas, setQuizRespuestas] = useState<Record<string, string>>({});
  const [quizPreguntaActual, setQuizPreguntaActual] = useState(0);
  const [quizAnimando, setQuizAnimando] = useState(false);
  const [quizResultado, setQuizResultado] = useState<QuizResultado | null>(null);
  const [quizResultadoVisible, setQuizResultadoVisible] = useState(false);

  const resetQuizModalState = useCallback(() => {
    setQuizModalOpen(false);
    setQuizActivo(null);
    setQuizPreguntas([]);
    setQuizRespuestas({});
    setQuizPreguntaActual(0);
    setQuizAnimando(false);
  }, []);

  const openQuiz = useCallback(async (quiz: any) => {
    try {
      const { data: preguntasData, error } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .select("id, orden, pregunta, opcion_a, opcion_b, opcion_c, opcion_d")
        .eq("quiz_id", quiz.id)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (error) throw error;

      if (!preguntasData || preguntasData.length === 0) {
        message.warning("Este quiz aún no tiene preguntas cargadas.");
        return;
      }

      setQuizActivo(quiz);
      setQuizPreguntas(preguntasData);
      setQuizRespuestas({});
      setQuizPreguntaActual(0);
      setQuizAnimando(false);
      setQuizModalOpen(true);
    } catch (error) {
      logger.error("Error al abrir quiz", error);
      message.error("No se pudo abrir el quiz");
    }
  }, []);

  const submitQuiz = useCallback(async () => {
    if (!quizActivo) return;

    const respuestas = quizPreguntas.map((pregunta: any) => {
      const respuesta = quizRespuestas[String(pregunta.id)] || "";
      return {
        pregunta_id: pregunta.id,
        respuesta,
      };
    });

    const sinResponder = respuestas.filter((r) => !r.respuesta).length;
    if (sinResponder > 0) {
      message.warning(`Debes responder todas las preguntas. Faltan ${sinResponder}.`);
      return;
    }

    try {
      setQuizSaving(true);

      const { data: preguntasConRespuesta, error: errorCorrectas } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .select("id, respuesta_correcta")
        .eq("quiz_id", quizActivo.id)
        .eq("activo", true);

      if (errorCorrectas) throw errorCorrectas;

      const preguntaPorId = new Map<string, any>();
      (quizPreguntas || []).forEach((pregunta: any) => {
        preguntaPorId.set(String(pregunta.id), pregunta);
      });

      const correctaPorPregunta = new Map<string, string>();
      (preguntasConRespuesta || []).forEach((pregunta: any) => {
        const preguntaBase = preguntaPorId.get(String(pregunta.id));
        correctaPorPregunta.set(String(pregunta.id), resolveClaveOpcionAction(preguntaBase, pregunta.respuesta_correcta));
      });

      let correctas = 0;
      respuestas.forEach((respuesta) => {
        const preguntaBase = preguntaPorId.get(String(respuesta.pregunta_id));
        const correcta = correctaPorPregunta.get(String(respuesta.pregunta_id)) || "";
        const marcada = resolveClaveOpcionAction(preguntaBase, respuesta.respuesta);
        if (correcta && correcta === marcada) {
          correctas += 1;
        }
      });

      const respuestasErradas = respuestas
        .map((respuesta) => {
          const pregunta = preguntaPorId.get(String(respuesta.pregunta_id));
          const correcta = resolveClaveOpcionAction(pregunta, correctaPorPregunta.get(String(respuesta.pregunta_id)) || "");
          const marcada = resolveClaveOpcionAction(pregunta, respuesta.respuesta);
          if (!correcta || marcada === correcta) return null;

          return {
            preguntaId: String(respuesta.pregunta_id || ""),
            orden: Number(pregunta?.orden || 0),
            pregunta: String(pregunta?.pregunta || "Pregunta"),
            respuestaMarcada: getTextoOpcionAction(pregunta, marcada),
            respuestaCorrecta: getTextoOpcionAction(pregunta, correcta),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.orden - b.orden);

      const total = respuestas.length || 1;
      const porcentaje = Number(((correctas / total) * 100).toFixed(2));
      const calificacion = Number(((correctas / total) * 5).toFixed(2));
      const matriculaQuiz = getMatriculaDeQuizAction(quizActivo);
      if (!matriculaQuiz?.id) {
        message.error("No se encontró matrícula para registrar el resultado del quiz.");
        return;
      }

      const aprobado = quizAprobado(calificacion);

      const payload = {
        quiz_id: quizActivo.id,
        matricula_id: Number(matriculaQuiz.id),
        estudiante_id: estudianteId || null,
        respuestas,
        respuestas_correctas: correctas,
        total_preguntas: total,
        calificacion,
      };
      const enviadoAt = new Date().toISOString();

      const { data: intentosExistentes, error: errorBuscarIntento } = await supabaseBrowserClient
        .from("quiz_intentos_clase")
        .select("id")
        .eq("quiz_id", quizActivo.id)
        .eq("matricula_id", Number(matriculaQuiz.id));

      if (errorBuscarIntento) throw errorBuscarIntento;

      if ((intentosExistentes || []).length > 0) {
        const { error: errorActualizarIntento } = await supabaseBrowserClient
          .from("quiz_intentos_clase")
          .update(payload)
          .eq("quiz_id", quizActivo.id)
          .eq("matricula_id", Number(matriculaQuiz.id));

        if (errorActualizarIntento) throw errorActualizarIntento;
      } else {
        const { error: errorCrearIntento } = await supabaseBrowserClient
          .from("quiz_intentos_clase")
          .insert(payload);

        if (errorCrearIntento) throw errorCrearIntento;
      }

      const intentoLocal = {
        id: String(intentosExistentes?.[0]?.id || `${quizActivo.id}-${matriculaQuiz.id}`),
        ...payload,
        enviado_at: enviadoAt,
      };

      const syncCalificacionResponse = await fetch("/api/portal-estudiante/sync-quiz-calificacion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quizId: String(quizActivo.id),
          matriculaId: Number(matriculaQuiz.id),
          calificacion,
          respuestasCorrectas: correctas,
          totalPreguntas: total,
          enviadoAt,
        }),
      });

      if (!syncCalificacionResponse.ok) {
        const syncError = await syncCalificacionResponse.json().catch(() => null);
        logger.error("Error sincronizando calificación de quiz", syncError);
        message.warning("El quiz se envió, pero la calificación no se sincronizó con el panel académico.");
      }

      setQuizIntentosAction((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const restantes = base.filter(
          (intento: any) =>
            !(
              String(intento?.quiz_id || "") === String(payload.quiz_id || "") &&
              String(intento?.matricula_id || "") === String(payload.matricula_id || "")
            )
        );
        return [intentoLocal, ...restantes];
      });

      resetQuizModalState();

      setQuizResultado({
        quizId: String(quizActivo?.id || ""),
        calificacion,
        porcentaje,
        aprobado,
        respuestasErradas: respuestasErradas as any[],
        totalPreguntas: total,
        correctas,
        tituloQuiz: quizActivo?.titulo || "",
        claseNumero: quizActivo?.clase_numero ?? null,
      });
      setQuizResultadoVisible(true);

      if (!aprobado) {
        const autoCloseDelay = (respuestasErradas as any[]).length > 0 ? 12000 : 8000;
        setTimeout(() => setQuizResultadoVisible(false), autoCloseDelay);
      }

      await onRefreshPortalAction();
    } catch (error) {
      logger.error("Error enviando quiz", error);
      message.error("No se pudo enviar el quiz");
    } finally {
      setQuizSaving(false);
    }
  }, [
    estudianteId,
    getMatriculaDeQuizAction,
    getTextoOpcionAction,
    onRefreshPortalAction,
    quizActivo,
    quizPreguntas,
    quizRespuestas,
    resolveClaveOpcionAction,
    resetQuizModalState,
    setQuizIntentosAction,
  ]);

  return {
    quizPreguntas,
    quizModalOpen,
    quizActivo,
    quizSaving,
    quizRespuestas,
    quizPreguntaActual,
    quizAnimando,
    quizResultado,
    quizResultadoVisible,
    setQuizRespuestas,
    setQuizPreguntaActual,
    setQuizAnimando,
    setQuizResultadoVisible,
    openQuiz,
    submitQuiz,
    resetQuizModalState,
  };
};
