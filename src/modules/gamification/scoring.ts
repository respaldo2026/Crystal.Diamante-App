export const XP_TOTAL_CURSO = 1000;
export const CLASES_OBJETIVO_CURSO = 20;

export const XP_ASISTENCIA_TOTAL = 400;
export const XP_QUIZ_TOTAL = 300;
export const XP_EVIDENCIA_TOTAL = 300;

export const XP_ASISTENCIA_POR_CLASE = XP_ASISTENCIA_TOTAL / CLASES_OBJETIVO_CURSO; // 20
export const XP_QUIZ_MAX_POR_CLASE = XP_QUIZ_TOTAL / CLASES_OBJETIVO_CURSO; // 15
export const XP_EVIDENCIA_POR_CLASE = XP_EVIDENCIA_TOTAL / CLASES_OBJETIVO_CURSO; // 15

export const XP_POR_NIVEL = 100;

export const normalizarNotaQuizA5 = (notaRaw: number): number => {
  const nota = Number(notaRaw);
  if (!Number.isFinite(nota)) return 0;
  if (nota > 5 && nota <= 100) return Number((nota / 20).toFixed(2));
  return Math.max(0, Math.min(5, nota));
};

// Puntaje de quiz por actividad: hasta 15 puntos por quiz (20 quizzes = 300 puntos).
export const calcularXpQuizPorNota = (notaRaw: number): number => {
  const nota = normalizarNotaQuizA5(notaRaw);
  const xp = (nota / 5) * XP_QUIZ_MAX_POR_CLASE;
  return Math.max(0, Math.min(XP_QUIZ_MAX_POR_CLASE, Math.round(xp)));
};
