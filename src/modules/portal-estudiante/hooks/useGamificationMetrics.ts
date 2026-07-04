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
};

const XP_POR_NIVEL = 250;
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

export const useGamificationMetrics = ({ misCursosResumen, asistencias, quizIntentos }: Params) => {
  return useMemo(() => {
    const asistenciasArray = Array.isArray(asistencias) ? asistencias : [];
    const quizIntentosArray = Array.isArray(quizIntentos) ? quizIntentos : [];

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

    const quizAprobadosSemana = quizzesAprobados.filter((q: any) => {
      const fecha = dayjs(String(q?.created_at || q?.fecha_presentacion || ""));
      return fecha.isValid() && fecha.isAfter(semanaActual.subtract(1, "millisecond")) && fecha.isBefore(semanaActualFin.add(1, "millisecond"));
    }).length;

    const asistenciaPromedio = misCursosResumen.length
      ? Math.round(misCursosResumen.reduce((acc, c) => acc + Number(c?.porcentajeAsistencia || 0), 0) / misCursosResumen.length)
      : 0;

    const cursosTerminados = misCursosResumen.filter((curso) => {
      const estado = String(curso?.estado || "").toLowerCase();
      return estado === "aprobado" || estado === "finalizado" || Number(curso?.progresoCursoPercent || 0) >= 100;
    }).length;

    const xpPorAsistencia = presentes.length * 40;
    const xpPorQuiz = quizzesAprobados.length * 30;
    const xpPorCurso = cursosTerminados * 120;
    const xpBonoAsistencia = asistenciaPromedio >= 80 ? 80 : 0;
    const totalXp = xpPorAsistencia + xpPorQuiz + xpPorCurso + xpBonoAsistencia;
    const xpSemanal = (presentesSemana * 40) + (quizAprobadosSemana * 30);

    const nivel = Math.floor(totalXp / XP_POR_NIVEL) + 1;
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
        recompensaXp: 40,
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
        recompensaXp: 30,
      },
      {
        id: "constancia-mensual",
        titulo: "Constancia mensual",
        descripcion: "Asiste al menos 3 de tus últimas 4 semanas.",
        progresoLabel: `${Math.min(semanasCumplidasRecientes, OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS)}/${OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS} sem`,
        progresoPercent: Math.min(100, Math.round((Math.min(semanasCumplidasRecientes, OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS) / OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS) * 100)),
        completada: semanasCumplidasRecientes >= OBJETIVO_SEMANAS_RECIENTES_CUMPLIDAS,
        recompensaXp: 50,
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
        desbloqueado: misCursosResumen.some((c) => Number(c?.progresoCursoPercent || 0) >= 80),
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
  }, [misCursosResumen, asistencias, quizIntentos]);
};
