import { useMemo } from "react";
import dayjs from "dayjs";
import { quizAprobado } from "@/modules/portal-estudiante/utils";

export type CursoResumenGamificacion = {
  matriculaId: string;
  curso: string;
  clasesDictadas: number;
  totalClases: number;
  porcentajeAsistencia: number;
  progresoCursoPercent: number;
  estado: string;
};

export type MisionSemanal = {
  id: string;
  titulo: string;
  descripcion: string;
  progresoLabel: string;
  progresoPercent: number;
  completada: boolean;
  recompensaXp: number;
};

export type LogroGamificacion = {
  id: string;
  titulo: string;
  descripcion: string;
  icono: string;
  desbloqueado: boolean;
};

type Params = {
  misCursosResumen: CursoResumenGamificacion[];
  asistencias: any[];
  quizIntentos: any[];
  evidenciasTareas: any[];
};

const XP_TOTAL_CURSO = 1000;
const CLASES_OBJETIVO_CURSO = 20;
const XP_ASISTENCIA_POR_CLASE = 20;
const XP_QUIZ_MAX_POR_CLASE = 20;
const XP_EVIDENCIA_POR_CLASE = 10;
const XP_POR_NIVEL = 100;
const OBJETIVO_ASISTENCIA_SEMANAL = 1;
const OBJETIVO_RACHA_SEMANAL = 3;
const OBJETIVO_SEMANAS_RECIENTES = 4;
const OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS = 3;

const getWeekKey = (fecha: dayjs.Dayjs) => fecha.startOf("week").format("YYYY-MM-DD");

const calcularRachaSemanal = (fechasPresentes: dayjs.Dayjs[]) => {
  if (!fechasPresentes.length) return { actual: 0, mejor: 0 };

  const weeks = Array.from(new Set(fechasPresentes.map(getWeekKey)))
    .map((w) => dayjs(w).startOf("week"))
    .sort((a, b) => a.valueOf() - b.valueOf());

  if (!weeks.length) return { actual: 0, mejor: 0 };

  let mejor = 1;
  let actualCadena = 1;
  for (let i = 1; i < weeks.length; i += 1) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (!prev || !curr) continue;
    const esperado = prev.add(1, "week");
    if (curr.isSame(esperado, "day")) {
      actualCadena += 1;
    } else {
      actualCadena = 1;
    }
    if (actualCadena > mejor) mejor = actualCadena;
  }

  // Racha activa solo si hubo presencia esta semana o la semana inmediatamente anterior.
  const semanaActual = dayjs().startOf("week");
  const semanaAnterior = semanaActual.subtract(1, "week");
  const ultimaSemana = weeks[weeks.length - 1];

  if (!ultimaSemana) {
    return { actual: 0, mejor };
  }

  if (!(ultimaSemana.isSame(semanaActual, "day") || ultimaSemana.isSame(semanaAnterior, "day"))) {
    return { actual: 0, mejor };
  }

  let actual = 1;
  for (let i = weeks.length - 1; i > 0; i -= 1) {
    const curr = weeks[i];
    const prev = weeks[i - 1];
    if (!curr || !prev) continue;
    const esperado = curr.subtract(1, "week");
    if (prev.isSame(esperado, "day")) {
      actual += 1;
    } else {
      break;
    }
  }

  return { actual, mejor };
};

const normalizarNotaQuizA5 = (notaRaw: number) => {
  const nota = Number(notaRaw);
  if (!Number.isFinite(nota)) return 0;
  if (nota > 5 && nota <= 100) return Number((nota / 20).toFixed(2));
  return Math.max(0, Math.min(5, nota));
};

const calcularXpQuizPorNota = (notaRaw: number) => {
  const nota = normalizarNotaQuizA5(notaRaw);
  if (nota >= 4.8) return 20;
  if (nota >= 4.5) return 18;
  if (nota >= 4.0) return 16;
  if (nota >= 3.5) return 14;
  if (nota >= 3.0) return 10;
  if (nota >= 2.0) return 6;
  if (nota > 0) return 3;
  return 0;
};

export const useGamificationMetrics = ({ misCursosResumen, asistencias, quizIntentos, evidenciasTareas }: Params) => {
  return useMemo(() => {
    const asistenciasArray = Array.isArray(asistencias) ? asistencias : [];
    const quizIntentosArray = Array.isArray(quizIntentos) ? quizIntentos : [];
    const evidenciasArray = Array.isArray(evidenciasTareas) ? evidenciasTareas : [];

    const presentes = asistenciasArray.filter((a: any) => String(a?.estado || "").toLowerCase() === "presente");

    const quizzesAprobados = quizIntentosArray.filter((item: any) => quizAprobado(item));

    const presentesFechas = presentes
      .map((a: any) => dayjs(String(a?.fecha || "")))
      .filter((d: dayjs.Dayjs) => d.isValid());

    const semanasConAsistencia = new Set(presentesFechas.map(getWeekKey));

    const semanaActual = dayjs().startOf("week");
    const semanaActualFin = semanaActual.endOf("week");

    const presentesSemana = presentesFechas.filter((d) => d.isAfter(semanaActual.subtract(1, "millisecond")) && d.isBefore(semanaActualFin.add(1, "millisecond"))).length;
    const asistenciaSemanaCumplida = presentesSemana >= OBJETIVO_ASISTENCIA_SEMANAL;

    const ultimasSemanas = Array.from({ length: OBJETIVO_SEMANAS_RECIENTES }, (_, i) =>
      semanaActual.subtract(i, "week").startOf("week")
    );
    const semanasCumplidasRecientes = ultimasSemanas.filter((semana) => semanasConAsistencia.has(getWeekKey(semana))).length;

    const ultimoIntentoPorQuiz = new Map<string, any>();
    quizIntentosArray.forEach((q: any) => {
      const quizKey = String(q?.quiz_id || q?.pensum_curso_id || q?.id || "").trim();
      if (!quizKey) return;
      const fecha = dayjs(String(q?.created_at || q?.fecha_presentacion || q?.enviado_at || ""));
      const fechaMs = fecha.isValid() ? fecha.valueOf() : 0;
      const actual = ultimoIntentoPorQuiz.get(quizKey);
      const actualFecha = dayjs(String(actual?.created_at || actual?.fecha_presentacion || actual?.enviado_at || ""));
      const actualMs = actualFecha.isValid() ? actualFecha.valueOf() : 0;
      if (!actual || fechaMs >= actualMs) {
        ultimoIntentoPorQuiz.set(quizKey, q);
      }
    });

    const intentosQuizUnicos = Array.from(ultimoIntentoPorQuiz.values());

    const quizXpTotalRaw = intentosQuizUnicos.reduce((acc: number, q: any) => {
      const nota = Number(q?.calificacion ?? q?.nota);
      return acc + calcularXpQuizPorNota(nota);
    }, 0);

    const quizXpSemanal = intentosQuizUnicos.reduce((acc: number, q: any) => {
      const fecha = dayjs(String(q?.created_at || q?.fecha_presentacion || q?.enviado_at || ""));
      if (!fecha.isValid() || !(fecha.isAfter(semanaActual.subtract(1, "millisecond")) && fecha.isBefore(semanaActualFin.add(1, "millisecond")))) {
        return acc;
      }
      const nota = Number(q?.calificacion ?? q?.nota);
      return acc + calcularXpQuizPorNota(nota);
    }, 0);

    const quizAprobadosSemana = intentosQuizUnicos.filter((q: any) => {
      const fecha = dayjs(String(q?.created_at || q?.fecha_presentacion || q?.enviado_at || ""));
      return fecha.isValid()
        && fecha.isAfter(semanaActual.subtract(1, "millisecond"))
        && fecha.isBefore(semanaActualFin.add(1, "millisecond"))
        && quizAprobado(q);
    }).length;

    const evidenciasSemana = evidenciasArray.filter((e: any) => {
      const fecha = dayjs(String(e?.updated_at || e?.created_at || ""));
      return fecha.isValid() && fecha.isAfter(semanaActual.subtract(1, "millisecond")) && fecha.isBefore(semanaActualFin.add(1, "millisecond"));
    }).length;

    const asistenciaPromedio = misCursosResumen.length
      ? Math.round(misCursosResumen.reduce((acc, c) => acc + Number(c?.porcentajeAsistencia || 0), 0) / misCursosResumen.length)
      : 0;

    const xpPorAsistencia = Math.min(presentes.length, CLASES_OBJETIVO_CURSO) * XP_ASISTENCIA_POR_CLASE;
    const xpPorQuiz = Math.min(quizXpTotalRaw, CLASES_OBJETIVO_CURSO * XP_QUIZ_MAX_POR_CLASE);
    const xpPorEvidencias = Math.min(evidenciasArray.length, CLASES_OBJETIVO_CURSO) * XP_EVIDENCIA_POR_CLASE;
    const totalXp = Math.min(XP_TOTAL_CURSO, xpPorAsistencia + xpPorQuiz + xpPorEvidencias);
    const xpSemanal = (presentesSemana * XP_ASISTENCIA_POR_CLASE) + quizXpSemanal + (evidenciasSemana * XP_EVIDENCIA_POR_CLASE);

    const nivel = Math.max(1, Math.ceil(totalXp / XP_POR_NIVEL));
    const xpNivelActual = totalXp % XP_POR_NIVEL;

    const { actual: rachaActual, mejor: mejorRacha } = calcularRachaSemanal(presentesFechas);

    const misiones: MisionSemanal[] = [
      {
        id: "asistencia-semanal",
        titulo: "Asistencia semanal",
        descripcion: "Cumple tu clase de la semana (1 asistencia).",
        progresoLabel: `${asistenciaSemanaCumplida ? 1 : 0}/${OBJETIVO_ASISTENCIA_SEMANAL}`,
        progresoPercent: asistenciaSemanaCumplida ? 100 : 0,
        completada: asistenciaSemanaCumplida,
        recompensaXp: XP_ASISTENCIA_POR_CLASE,
      },
      {
        id: "racha-semanal",
        titulo: "Racha activa",
        descripcion: "Mantén 3 semanas seguidas asistiendo a tu clase.",
        progresoLabel: `${Math.min(rachaActual, OBJETIVO_RACHA_SEMANAL)}/${OBJETIVO_RACHA_SEMANAL} sem`,
        progresoPercent: Math.min(100, Math.round((Math.min(rachaActual, OBJETIVO_RACHA_SEMANAL) / OBJETIVO_RACHA_SEMANAL) * 100)),
        completada: rachaActual >= OBJETIVO_RACHA_SEMANAL,
        recompensaXp: 35,
      },
      {
        id: "quiz-semanal",
        titulo: "Quiz de la semana",
        descripcion: "Aprueba 1 quiz en la semana para consolidar tu avance.",
        progresoLabel: `${Math.min(quizAprobadosSemana, 1)}/1`,
        progresoPercent: Math.min(100, quizAprobadosSemana >= 1 ? 100 : quizAprobadosSemana * 100),
        completada: quizAprobadosSemana >= 1,
        recompensaXp: XP_QUIZ_MAX_POR_CLASE,
      },
      {
        id: "constancia-mensual",
        titulo: "Constancia mensual",
        descripcion: "Asiste al menos 3 de tus últimas 4 semanas.",
        progresoLabel: `${Math.min(semanasCumplidasRecientes, OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS)}/${OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS} sem`,
        progresoPercent: Math.min(100, Math.round((Math.min(semanasCumplidasRecientes, OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS) / OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS) * 100)),
        completada: semanasCumplidasRecientes >= OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS,
        recompensaXp: XP_ASISTENCIA_POR_CLASE + XP_EVIDENCIA_POR_CLASE,
      },
    ];

    const logros: LogroGamificacion[] = [
      {
        id: "primera-clase",
        titulo: "Primer paso",
        descripcion: "Cumpliste tu primera semana de clase.",
        icono: "🚀",
        desbloqueado: semanasConAsistencia.size >= 1,
      },
      {
        id: "cuatro-semanas",
        titulo: "Ritmo constante",
        descripcion: "Completaste 4 semanas con asistencia.",
        icono: "🔥",
        desbloqueado: semanasConAsistencia.size >= 4,
      },
      {
        id: "doce-semanas",
        titulo: "Disciplina de trimestre",
        descripcion: "Completaste 12 semanas con asistencia.",
        icono: "📅",
        desbloqueado: semanasConAsistencia.size >= 12,
      },
      {
        id: "quiz-master",
        titulo: "Quiz Master",
        descripcion: "Aprobaste 3 quizzes.",
        icono: "🧠",
        desbloqueado: quizzesAprobados.length >= 3,
      },
      {
        id: "asistencia-elite",
        titulo: "Asistencia Elite",
        descripcion: "Mantienes 85% o más en asistencia general.",
        icono: "🎯",
        desbloqueado: asistenciaPromedio >= 85,
      },
      {
        id: "meta-final",
        titulo: "Casi graduada",
        descripcion: "Alcanzaste al menos 80% de un curso.",
        icono: "🏆",
        desbloqueado: totalXp >= 800 || misCursosResumen.some((c) => Number(c?.progresoCursoPercent || 0) >= 80),
      },
    ];

    const misionSiguiente = misiones.find((m) => !m.completada) || null;

    return {
      xpSemanal,
      totalXp,
      nivel,
      xpNivelActual,
      xpPorNivel: XP_POR_NIVEL,
      rachaActual,
      mejorRacha,
      asistenciaPromedio,
      misiones,
      logros,
      misionSiguiente,
    };
  }, [misCursosResumen, asistencias, quizIntentos, evidenciasTareas]);
};
