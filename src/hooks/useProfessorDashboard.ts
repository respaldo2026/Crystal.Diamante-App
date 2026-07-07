import { useState, useEffect } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { construirNombreGrupo } from "@utils/grupos";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import {
  XP_TOTAL_CURSO,
  CLASES_OBJETIVO_CURSO,
  XP_ASISTENCIA_POR_CLASE,
  XP_QUIZ_MAX_POR_CLASE,
  XP_EVIDENCIA_POR_CLASE,
  XP_POR_NIVEL,
  calcularXpQuizPorNota,
} from "@/modules/gamification/scoring";

dayjs.extend(isBetween);

const HOURS_PER_CLASS = 3;
const AUTO_SESSION_TOPIC_PATTERN = /sesi[oó]n programada autom[aá]ticamente para c[aá]lculo de ciclos/i;

export interface ProfesorDashboardCurso {
  id: string;
  nombre: string;
  estado: string;
  programas?: { nombre?: string | null } | null;
  programaId?: number | null;
  diasSemana?: string[] | string | null;
  horaInicio?: string | null;
  horaFin?: string | null;
  horario?: string | null;
  fechaInicio?: string | null;
  estudiantesActivos: number;
  asistenciaPromedio?: number | null;
  promedioNota?: number | null;
  temaActual?: string | null;
  siguienteTema?: string | null;
  proximaSesion?: {
    fecha: string;
    tema?: string | null;
  } | null;
}

export interface ProfesorDashboardStats {
  cursosActivos: number;
  totalEstudiantes: number;
  horasMes: number;
  porcentajeAsistencia: number;
  promedioCalificaciones: number;
  tieneCalificaciones: boolean;
  pendientesPorCalificar: number;
  asistenciaChart: Array<{ fecha: string; porcentaje: number; presentes: number; total: number; clases?: string | null }>;
  calificacionesChart: Array<{ fecha: string; promedio: number; evaluaciones: number }>;
  topCursos: Array<{ nombre: string; estudiantes: number; asistencia?: number | null }>;
  horasQuincena: number;
  proyeccionQuincena: number;
  tarifaHora?: number | null;
  totalPagadoMes: number;
}

export interface ProfesorDashboardSesion {
  id: string;
  fecha: string;
  cursoId: string;
  curso: string;
  horaInicio?: string | null;
  tema?: string | null;
  claseNumero?: number | null;
  horas?: number | null;
}

export interface ProfesorDashboardPendiente {
  id: string;
  curso: string;
  cursoId?: string | null;
  concepto: string;
  fecha?: string | null;
  tipo?: string | null;
}

export interface ProfesorDashboardPago {
  id: string;
  fecha: string;
  monto: number;
  tipo: string;
  concepto: string;
  origen: "nomina" | "extra";
  periodo?: { inicio?: string | null; fin?: string | null } | null;
}

export interface ProfesorDashboardCalificacionUltimaClase {
  matriculaId: number;
  estudiante: string;
  quiz: number | null;
  actividad: number | null;
}

export interface ProfesorDashboardCalificacionesGrupo {
  cursoId: string;
  curso: string;
  fechaUltimaClase?: string | null;
  temaUltimaClase?: string | null;
  estudiantes: ProfesorDashboardCalificacionUltimaClase[];
}

export interface ProfesorDashboardGamificacionEstudiante {
  matriculaId: number;
  estudiante: string;
  xpSemanal: number;
  xpTotal: number;
  score: number;
  nivel: number;
  asistenciaPercent: number;
  semanasConAsistencia: number;
  rachaActual: number;
  quizAprobados: number;
  estado: "alto" | "medio" | "bajo";
}

export interface ProfesorDashboardGamificacionGrupo {
  cursoId: string;
  curso: string;
  promedioScore: number;
  estudiantes: ProfesorDashboardGamificacionEstudiante[];
}

export interface ProfesorDashboardEvidenciaTarea {
  id: string;
  matriculaId: number;
  cursoId: string;
  pensumCursoId: string;
  estudiante: string;
  urlImagen: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProfessorDashboardData {
  loading: boolean;
  profesorNombre?: string;
  stats: ProfesorDashboardStats;
  cursos: ProfesorDashboardCurso[];
  proximasSesiones: ProfesorDashboardSesion[];
  pendientes: ProfesorDashboardPendiente[];
  pagos: ProfesorDashboardPago[];
  calificacionesRecientesPorGrupo: ProfesorDashboardCalificacionesGrupo[];
  gamificacionEstudiantesPorGrupo: ProfesorDashboardGamificacionGrupo[];
  evidenciasTareas: ProfesorDashboardEvidenciaTarea[];
}

const emptyStats: ProfesorDashboardStats = {
  cursosActivos: 0,
  totalEstudiantes: 0,
  horasMes: 0,
  porcentajeAsistencia: 0,
  promedioCalificaciones: 0,
  tieneCalificaciones: false,
  pendientesPorCalificar: 0,
  asistenciaChart: [],
  calificacionesChart: [],
  topCursos: [],
  horasQuincena: 0,
  proyeccionQuincena: 0,
  tarifaHora: null,
  totalPagadoMes: 0,
};

const isAsistenciaPositiva = (estado?: string | null) => {
  if (!estado) return false;
  const normalized = estado
    .toLowerCase()
    .replace("á", "a")
    .replace("é", "e")
    .replace("í", "i")
    .replace("ó", "o")
    .replace("ú", "u");
  return normalized.includes("asistio") || normalized.includes("presente");
};

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0);

const normalizeStateText = (value?: string | null): string =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const isEnrollmentActiveState = (estado?: string | null): boolean => {
  const normalized = normalizeStateText(estado);
  if (!normalized) return true;

  const inactiveStates = [
    "cancelado",
    "cancelada",
    "retirado",
    "retirada",
    "inactivo",
    "inactiva",
    "expulsado",
    "suspendido",
    "graduado",
    "egresado",
    "finalizado",
    "completado",
  ];

  return !inactiveStates.some((state) => normalized.includes(state));
};

const normalizeEvaluationText = (value?: string | null): string =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const resolveEvaluationKind = (tipo?: string | null, concepto?: string | null): "quiz" | "actividad" | null => {
  const merged = `${normalizeEvaluationText(tipo)} ${normalizeEvaluationText(concepto)}`.trim();
  if (!merged) return null;
  if (merged.includes("quiz") || merged.includes("quizz")) return "quiz";
  if (
    merged.includes("actividad") ||
    merged.includes("taller") ||
    merged.includes("trabajo") ||
    merged.includes("practica") ||
    merged.includes("tema")
  ) {
    return "actividad";
  }
  return null;
};

const extractClassNumber = (value?: string | null): number | null => {
  const text = String(value || "");
  const match = text.match(/clase\s*#?\s*(\d{1,3})/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getWeekKey = (value?: string | null) => {
  const date = dayjs(String(value || "")).startOf("week");
  if (!date.isValid()) return "";
  return date.format("YYYY-MM-DD");
};

const calculateWeeklyStreak = (weekKeys: string[]): { actual: number; best: number } => {
  const weeks = Array.from(new Set((weekKeys || []).filter(Boolean)))
    .map((key) => dayjs(key).startOf("week"))
    .filter((d) => d.isValid())
    .sort((a, b) => a.valueOf() - b.valueOf());

  if (!weeks.length) return { actual: 0, best: 0 };

  let best = 1;
  let current = 1;

  for (let i = 1; i < weeks.length; i += 1) {
    const prev = weeks[i - 1];
    const now = weeks[i];
    if (!prev || !now) continue;
    if (now.isSame(prev.add(1, "week"), "day")) {
      current += 1;
    } else {
      current = 1;
    }
    if (current > best) best = current;
  }

  const thisWeek = dayjs().startOf("week");
  const prevWeek = thisWeek.subtract(1, "week");
  const lastWeek = weeks[weeks.length - 1];

  if (!lastWeek || !(lastWeek.isSame(thisWeek, "day") || lastWeek.isSame(prevWeek, "day"))) {
    return { actual: 0, best };
  }

  let actual = 1;
  for (let i = weeks.length - 1; i > 0; i -= 1) {
    const now = weeks[i];
    const prev = weeks[i - 1];
    if (!now || !prev) continue;
    if (prev.isSame(now.subtract(1, "week"), "day")) {
      actual += 1;
    } else {
      break;
    }
  }

  return { actual, best };
};

const isPassingGrade = (value: number): boolean => {
  if (!Number.isFinite(value)) return false;
  if (value <= 5) return value >= 3;
  return value >= 60;
};

const normalizeDayText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const weekdayMap: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const parseCourseDays = (diasSemana: string[] | string | null | undefined): number[] => {
  if (!diasSemana) return [];
  const raw = Array.isArray(diasSemana)
    ? diasSemana
    : String(diasSemana)
        .split(/[;,|]/)
        .map((part) => part.trim())
        .filter(Boolean);

  const days = raw
    .map((item) => normalizeDayText(item))
    .map((name) => weekdayMap[name])
    .filter((day): day is number => Number.isInteger(day));

  return Array.from(new Set(days));
};

const applyTimeToDate = (base: dayjs.Dayjs, horaInicio?: string | null): dayjs.Dayjs => {
  if (!horaInicio) return base.startOf("day");
  const [hhRaw, mmRaw] = String(horaInicio).split(":");
  const hour = Number(hhRaw);
  const minute = Number(mmRaw);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return base.startOf("day");
  }

  return base.hour(hour).minute(minute).second(0).millisecond(0);
};

const computeNextSessionFromSchedule = (
  diasSemana: string[] | string | null | undefined,
  horaInicio?: string | null,
  fechaInicio?: string | null,
): string | null => {
  const days = parseCourseDays(diasSemana);
  if (!days.length) return null;

  const now = dayjs();
  const minDate = fechaInicio ? dayjs(fechaInicio).startOf("day") : null;

  let best: dayjs.Dayjs | null = null;

  for (let offset = 0; offset <= 21; offset += 1) {
    const candidateDay = dayjs().startOf("day").add(offset, "day");
    if (!days.includes(candidateDay.day())) continue;
    if (minDate && candidateDay.isBefore(minDate, "day")) continue;

    const candidate = applyTimeToDate(candidateDay, horaInicio);
    if (candidate.isBefore(now)) continue;

    if (!best || candidate.isBefore(best)) {
      best = candidate;
    }
  }

  return best ? best.toISOString() : null;
};

export const fetchProfessorDashboardData = async (
  profesorId: string,
): Promise<Omit<ProfessorDashboardData, "loading" | "profesorNombre">> => {
  const cursosResponse = await supabaseBrowserClient
    .from("cursos")
    .select("id, nombre, estado, programa_id, dias_semana, hora_inicio, hora_fin, horario, fecha_inicio, programas:programa_id(nombre)")
    .eq("profesor_id", profesorId)
    .neq("estado", "eliminado")
    .order("nombre", { ascending: true });

  if (cursosResponse.error) {
    console.error("Error obteniendo cursos del profesor", cursosResponse.error);
  }

  const cursosData = cursosResponse.data || [];
  const cursosActivos = cursosData.filter((c) => c.estado === "activo") || [];
  const cursoIds = cursosActivos.map((c) => c.id) || [];

  const cursoFechaInicioMap = new Map<string, dayjs.Dayjs>();
  (cursosData || []).forEach((curso: any) => {
    const cursoId = String(curso?.id || "");
    const fechaInicioRaw = curso?.fecha_inicio;
    if (!cursoId || !fechaInicioRaw) return;
    const fechaInicio = dayjs(fechaInicioRaw).startOf("day");
    if (fechaInicio.isValid()) {
      cursoFechaInicioMap.set(cursoId, fechaInicio);
    }
  });

  const cursoNombreMap = new Map<string, string>(
    cursosData.map((curso: any) => [String(curso.id), construirNombreGrupo(curso) || curso.nombre]),
  );

  const cursoHoraInicioMap = new Map<string, string | null>(
    cursosData.map((curso: any) => [String(curso.id), curso.hora_inicio || null]),
  );

  const startOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");
  const endOfMonth = dayjs().endOf("month").format("YYYY-MM-DD");

  const [matriculasResult, sesionesMesResult, proximasSesionesResult, sesionesHistoricasResult] = await Promise.all([
    cursoIds.length > 0
      ? supabaseBrowserClient
          .from("matriculas")
          .select("id, curso_id, estudiante_id, estado, perfiles!matriculas_estudiante_id_fkey(nombre_completo)")
          .in("curso_id", cursoIds)
      : Promise.resolve({ data: [], error: null }),
    cursoIds.length > 0
      ? supabaseBrowserClient
          .from("sesiones_clase")
          .select("id, fecha, horas_dictadas, curso_id, tema_visto")
          .in("curso_id", cursoIds)
          .gte("fecha", startOfMonth)
          .lte("fecha", endOfMonth)
          .order("fecha", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    cursoIds.length > 0
      ? supabaseBrowserClient
          .from("sesiones_clase")
          .select("id, fecha, horas_dictadas, tema_visto, curso_id")
          .in("curso_id", cursoIds)
          .gte("fecha", dayjs().startOf("day").format("YYYY-MM-DD"))
          .order("fecha", { ascending: true })
          .limit(6)
      : Promise.resolve({ data: [], error: null }),
    cursoIds.length > 0
      ? supabaseBrowserClient
          .from("sesiones_clase")
          .select("id, fecha, tema_visto, curso_id")
          .in("curso_id", cursoIds)
          .lte("fecha", dayjs().format("YYYY-MM-DD"))
          .order("fecha", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (matriculasResult.error) {
    console.error("Error obteniendo matrículas del profesor", matriculasResult.error);
  }
  if (sesionesMesResult.error) {
    console.error("Error obteniendo sesiones del mes", sesionesMesResult.error);
  }
  if (proximasSesionesResult.error) {
    console.error("Error obteniendo próximas sesiones", proximasSesionesResult.error);
  }
  if (sesionesHistoricasResult.error) {
    console.error("Error obteniendo sesiones históricas", sesionesHistoricasResult.error);
  }

  const matriculasData = (matriculasResult.data || []).filter((matricula: any) => isEnrollmentActiveState(matricula?.estado));
  const sesionesMesData = (sesionesMesResult.data || []).filter(
    (sesion: any) => !AUTO_SESSION_TOPIC_PATTERN.test(String(sesion?.tema_visto || "")),
  );
  const proximasSesionesData = (proximasSesionesResult.data || []).filter(
    (sesion: any) => !AUTO_SESSION_TOPIC_PATTERN.test(String(sesion?.tema_visto || "")),
  );
  const sesionesHistoricas = (sesionesHistoricasResult.data || []).filter(
    (sesion: any) => !AUTO_SESSION_TOPIC_PATTERN.test(String(sesion?.tema_visto || "")),
  );

  const matriculaIds = matriculasData.map((matricula: any) => matricula.id);

  const [profesorInfoResult, pagosNominaResult, pagosProfesoresResult] = await Promise.all([
    supabaseBrowserClient
      .from("profesores_info")
      .select("valor_hora, tipo_contrato")
      .eq("perfil_id", profesorId)
      .maybeSingle(),
    supabaseBrowserClient
      .from("pagos_nomina")
      .select("id, fecha_pago, total_pagado, observaciones, fecha_inicio_periodo, fecha_fin_periodo")
      .eq("profesor_id", profesorId)
      .order("fecha_pago", { ascending: false })
      .limit(10),
    supabaseBrowserClient
      .from("pagos_profesores")
      .select("id, fecha_pago, monto, tipo, nota")
      .eq("profesor_id", profesorId)
      .order("fecha_pago", { ascending: false })
      .limit(10),
  ]);

  if (profesorInfoResult.error) {
    console.error("Error obteniendo info del profesor", profesorInfoResult.error);
  }
  if (pagosNominaResult.error) {
    console.error("Error obteniendo pagos de nómina", pagosNominaResult.error);
  }
  if (pagosProfesoresResult.error) {
    console.error("Error obteniendo pagos extraordinarios", pagosProfesoresResult.error);
  }

  const [asistenciasResult, calificacionesResult, asistenciasGamificacionResult, calificacionesGamificacionResult, evidenciasTareasResult] = await Promise.all([
    matriculaIds.length > 0
      ? supabaseBrowserClient
          .from("asistencias")
          .select("id, fecha, estado, matricula_id, matriculas:matriculas!asistencias_matricula_id_fkey(curso_id)")
          .in("matricula_id", matriculaIds)
          .gte("fecha", dayjs().subtract(30, "day").format("YYYY-MM-DD"))
          .order("fecha", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    matriculaIds.length > 0
      ? supabaseBrowserClient
          .from("calificaciones")
          .select("id, matricula_id, concepto, nota, calificacion, fecha_evaluacion, tipo_evaluacion")
          .in("matricula_id", matriculaIds)
          .gte("fecha_evaluacion", dayjs().subtract(90, "day").format("YYYY-MM-DD"))
          .order("fecha_evaluacion", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    matriculaIds.length > 0
      ? supabaseBrowserClient
          .from("asistencias")
          .select("id, fecha, estado, matricula_id")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    matriculaIds.length > 0
      ? supabaseBrowserClient
          .from("calificaciones")
          .select("id, matricula_id, concepto, nota, calificacion, fecha_evaluacion, tipo_evaluacion")
          .in("matricula_id", matriculaIds)
          .order("fecha_evaluacion", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    matriculaIds.length > 0
      ? supabaseBrowserClient
          .from("evidencias_tareas")
          .select("id, matricula_id, curso_id, pensum_curso_id, url_imagen, created_at, updated_at")
          .in("matricula_id", matriculaIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (asistenciasResult.error) {
    console.error("Error obteniendo asistencias", asistenciasResult.error);
  }
  if (calificacionesResult.error) {
    console.error("Error obteniendo calificaciones", calificacionesResult.error);
  }
  if (asistenciasGamificacionResult.error) {
    console.error("Error obteniendo asistencias para XP", asistenciasGamificacionResult.error);
  }
  if (calificacionesGamificacionResult.error) {
    console.error("Error obteniendo calificaciones para XP", calificacionesGamificacionResult.error);
  }
  if (evidenciasTareasResult.error) {
    console.error("Error obteniendo evidencias de tareas", evidenciasTareasResult.error);
  }

  const asistenciasData = asistenciasResult.data || [];
  const calificacionesData = calificacionesResult.data || [];
  const asistenciasGamificacionData = asistenciasGamificacionResult.data || asistenciasData;
  const calificacionesGamificacionData = calificacionesGamificacionResult.data || calificacionesData;
  const evidenciasTareasData = evidenciasTareasResult.data || [];

  const estudiantesPorCurso = new Map<string, number>();
  const matriculaCursoMap = new Map<number, string>();
  const matriculaEstudianteMap = new Map<number, string>();
  matriculasData.forEach((matricula: any) => {
    const cursoId = String(matricula.curso_id);
    const matriculaId = Number(matricula.id);
    const actual = estudiantesPorCurso.get(cursoId) || 0;
    estudiantesPorCurso.set(cursoId, actual + 1);
    if (Number.isFinite(matriculaId)) {
      matriculaCursoMap.set(matriculaId, cursoId);
      matriculaEstudianteMap.set(matriculaId, matricula?.perfiles?.nombre_completo || "Estudiante");
    }
  });

  const horasMes = sesionesMesData.length * HOURS_PER_CLASS;

  const ahora = dayjs();
  const quincenaInicio = ahora.date() <= 15 ? ahora.startOf("month") : ahora.date(16).startOf("day");
  const quincenaFin = ahora.date() <= 15 ? ahora.date(15).endOf("day") : ahora.endOf("month");

  const horasQuincena = sesionesMesData.reduce((total: number, sesion: any) => {
    const fechaSesion = dayjs(sesion.fecha);
    if (fechaSesion.isBetween(quincenaInicio, quincenaFin, "day", "[]")) {
      return total + HOURS_PER_CLASS;
    }
    return total;
  }, 0);

  let valorHora = profesorInfoResult.data?.valor_hora ? Number(profesorInfoResult.data.valor_hora) : null;
  if (valorHora === null) {
    const { data: perfilValorData, error: perfilValorError } = await supabaseBrowserClient
      .from("perfiles")
      .select("valor_hora")
      .eq("id", profesorId)
      .maybeSingle();

    if (!perfilValorError && perfilValorData?.valor_hora !== null && typeof perfilValorData?.valor_hora !== "undefined") {
      valorHora = Number(perfilValorData.valor_hora);
    }
  }
  const proyeccionQuincena = valorHora ? Number((valorHora * horasQuincena).toFixed(2)) : 0;

  const pagosNominaData = pagosNominaResult.data || [];
  const pagosProfesoresData = pagosProfesoresResult.data || [];

  const mesActualInicio = ahora.startOf("month");
  const mesActualFin = ahora.endOf("month");

  const totalPagadoMes = [...pagosNominaData, ...pagosProfesoresData].reduce((total, pago: any) => {
    const fecha = pago.fecha_pago ? dayjs(pago.fecha_pago) : null;
    if (fecha && fecha.isBetween(mesActualInicio, mesActualFin, "day", "[]")) {
      const monto = Number(pago.total_pagado ?? pago.monto ?? 0);
      return total + (Number.isFinite(monto) ? monto : 0);
    }
    return total;
  }, 0);

  const pagosRecientes: ProfesorDashboardPago[] = [
    ...(pagosNominaData || []).map((pago: any) => ({
      id: pago.id,
      fecha: pago.fecha_pago,
      monto: Number(pago.total_pagado || 0),
      tipo: "Nómina",
      concepto: pago.observaciones || "Pago de nómina",
      origen: "nomina" as const,
      periodo: { inicio: pago.fecha_inicio_periodo, fin: pago.fecha_fin_periodo },
    })),
    ...(pagosProfesoresData || []).map((pago: any) => ({
      id: pago.id,
      fecha: pago.fecha_pago,
      monto: Number(pago.monto || 0),
      tipo: pago.tipo || "Pago",
      concepto: pago.nota || "Pago registrado",
      origen: "extra" as const,
      periodo: null,
    })),
  ].sort((a, b) => dayjs(b.fecha).valueOf() - dayjs(a.fecha).valueOf());

  const claseNumeroPorCursoFecha = new Map<string, number | null>();
  (sesionesMesData || []).forEach((sesion: any) => {
    if (!sesion?.curso_id || !sesion?.fecha) return;
    const key = `${sesion.curso_id}-${sesion.fecha}`;
    claseNumeroPorCursoFecha.set(key, extractClassNumber(sesion?.tema_visto));
  });

  const asistenciaPorFecha = new Map<string, { presentes: number; total: number; clases: Set<number> }>();
  const asistenciaPorCurso = new Map<string, { presentes: number; total: number }>();

  asistenciasData.forEach((asistencia: any) => {
    const fechaClave = dayjs(asistencia.fecha).format("DD MMM");
    const cursoId = asistencia.matriculas?.curso_id;
    const present = isAsistenciaPositiva(asistencia.estado);

    const claseNumero = cursoId ? claseNumeroPorCursoFecha.get(`${cursoId}-${asistencia.fecha}`) ?? null : null;
    const acumuladoFecha = asistenciaPorFecha.get(fechaClave) || { presentes: 0, total: 0, clases: new Set<number>() };
    if (typeof claseNumero === "number" && Number.isFinite(claseNumero)) {
      acumuladoFecha.clases.add(claseNumero);
    }
    asistenciaPorFecha.set(fechaClave, {
      presentes: acumuladoFecha.presentes + (present ? 1 : 0),
      total: acumuladoFecha.total + 1,
      clases: acumuladoFecha.clases,
    });

    if (cursoId) {
      const acumuladoCurso = asistenciaPorCurso.get(cursoId) || { presentes: 0, total: 0 };
      asistenciaPorCurso.set(cursoId, {
        presentes: acumuladoCurso.presentes + (present ? 1 : 0),
        total: acumuladoCurso.total + 1,
      });
    }
  });

  const asistenciaChart = Array.from(asistenciaPorFecha.entries())
    .map(([fecha, values]) => {
      const porcentaje = values.total > 0 ? Math.round((values.presentes / values.total) * 100) : 0;
      const clasesOrdenadas = Array.from(values.clases || []).sort((a, b) => a - b);
      return {
        fecha,
        porcentaje,
        presentes: values.presentes,
        total: values.total,
        clases: clasesOrdenadas.length > 0 ? `Clase #${clasesOrdenadas.join(", #")}` : null,
      };
    })
    .slice(-8);

  const totalAsistencias = asistenciasData.length;
  const totalAsistenciasPositivas = asistenciasData.filter((a: any) => isAsistenciaPositiva(a.estado)).length;
  const porcentajeAsistencia = totalAsistencias > 0
    ? Math.round((totalAsistenciasPositivas / totalAsistencias) * 100)
    : 0;

  const calificacionesPorFecha = new Map<string, { suma: number; total: number }>();
  const calificacionesPorCurso = new Map<string, { suma: number; total: number }>();
  const notasValidas: number[] = [];

  calificacionesData.forEach((calificacion: any) => {
    const cursoId = calificacion?.matricula_id ? matriculaCursoMap.get(Number(calificacion.matricula_id)) : undefined;
    const fechaEvaluacion = calificacion?.fecha_evaluacion ? dayjs(calificacion.fecha_evaluacion).startOf("day") : null;
    const fechaInicioCurso = cursoId ? cursoFechaInicioMap.get(String(cursoId)) : null;

    // Evita arrastrar notas históricas previas al inicio del grupo actual.
    if (fechaInicioCurso && fechaEvaluacion && fechaEvaluacion.isBefore(fechaInicioCurso)) {
      return;
    }

    const nota = Number(calificacion.nota ?? calificacion.calificacion);
    if (!Number.isFinite(nota)) return;
    notasValidas.push(nota);
    const fechaClave = calificacion.fecha_evaluacion
      ? dayjs(calificacion.fecha_evaluacion).format("DD MMM")
      : "Sin fecha";

    const acumuladoFecha = calificacionesPorFecha.get(fechaClave) || { suma: 0, total: 0 };
    calificacionesPorFecha.set(fechaClave, {
      suma: acumuladoFecha.suma + nota,
      total: acumuladoFecha.total + 1,
    });

    if (cursoId) {
      const acumuladoCurso = calificacionesPorCurso.get(cursoId) || { suma: 0, total: 0 };
      calificacionesPorCurso.set(cursoId, {
        suma: acumuladoCurso.suma + nota,
        total: acumuladoCurso.total + 1,
      });
    }
  });

  const calificacionesChart = Array.from(calificacionesPorFecha.entries())
    .map(([fecha, values]) => {
      const promedio = values.total > 0 ? Number((values.suma / values.total).toFixed(1)) : 0;
      return {
        fecha,
        promedio,
        evaluaciones: values.total,
      };
    })
    .slice(-8);

  const promedioCalificaciones = notasValidas.length > 0
    ? Number((notasValidas.reduce((acc, nota) => acc + nota, 0) / notasValidas.length).toFixed(1))
    : 0;

  const proximasSesionesList: ProfesorDashboardSesion[] = proximasSesionesData.map((sesion: any) => ({
    id: sesion.id,
    fecha: sesion.fecha,
    cursoId: String(sesion.curso_id),
    curso: cursoNombreMap.get(String(sesion.curso_id)) || "Curso",
    horaInicio: cursoHoraInicioMap.get(String(sesion.curso_id)) || null,
    tema: sesion.tema_visto,
    claseNumero: extractClassNumber(sesion.tema_visto),
    horas: HOURS_PER_CLASS,
  }));

  const proximasSesionPorCurso = new Map<string, { fecha: string; tema?: string | null }>();
  proximasSesionesList.forEach((sesion) => {
    if (!proximasSesionPorCurso.has(sesion.cursoId)) {
      proximasSesionPorCurso.set(sesion.cursoId, { fecha: sesion.fecha, tema: sesion.tema });
    }
  });

  const fallbackProximasSesiones: ProfesorDashboardSesion[] = (cursosData || [])
    .map((curso: any) => {
      if (proximasSesionPorCurso.has(curso.id)) return null;
      const fechaFallback = computeNextSessionFromSchedule(curso.dias_semana, curso.hora_inicio, curso.fecha_inicio);
      if (!fechaFallback) return null;

      return {
        id: `fallback-${curso.id}`,
        fecha: fechaFallback,
        cursoId: String(curso.id),
        curso: cursoNombreMap.get(String(curso.id)) || curso.nombre || "Curso",
        horaInicio: cursoHoraInicioMap.get(String(curso.id)) || curso.hora_inicio || null,
        tema: null,
        horas: HOURS_PER_CLASS,
      } as ProfesorDashboardSesion;
    })
    .filter((item): item is ProfesorDashboardSesion => Boolean(item))
    .sort((a, b) => dayjs(a.fecha).valueOf() - dayjs(b.fecha).valueOf());

  fallbackProximasSesiones.forEach((sesion) => {
    if (!proximasSesionPorCurso.has(sesion.cursoId)) {
      proximasSesionPorCurso.set(sesion.cursoId, { fecha: sesion.fecha, tema: sesion.tema });
    }
  });

  const mergedProximasSesiones = [...proximasSesionesList, ...fallbackProximasSesiones]
    .sort((a, b) => dayjs(a.fecha).valueOf() - dayjs(b.fecha).valueOf())
    .slice(0, 6);

  const ultimaSesionPorCurso = new Map<string, { fecha: string; tema?: string | null }>();
  sesionesHistoricas.forEach((sesion: any) => {
    if (!sesion?.fecha || !sesion?.curso_id) return;
    const cursoId = String(sesion.curso_id);
    const existente = ultimaSesionPorCurso.get(cursoId);
    if (!existente || dayjs(sesion.fecha).isAfter(dayjs(existente.fecha))) {
      ultimaSesionPorCurso.set(cursoId, { fecha: sesion.fecha, tema: sesion.tema_visto });
    }
  });

  const pendientesList: ProfesorDashboardPendiente[] = calificacionesData
    .filter((calificacion: any) =>
      (calificacion.nota === null || calificacion.nota === undefined) &&
      (calificacion.calificacion === null || calificacion.calificacion === undefined),
    )
    .map((calificacion: any) => ({
      id: calificacion.id,
      curso: cursoNombreMap.get(String(matriculaCursoMap.get(Number(calificacion.matricula_id)) || "")) || "Curso",
      cursoId: String(matriculaCursoMap.get(Number(calificacion.matricula_id)) || "") || null,
      concepto: calificacion.concepto || calificacion.tipo_evaluacion || "Sin concepto",
      fecha: calificacion.fecha_evaluacion,
      tipo: calificacion.tipo_evaluacion,
    }));

  const cursosEnriquecidos: ProfesorDashboardCurso[] = (cursosData || []).map((curso: any) => {
    const cursoId = String(curso.id);
    const asistencia = asistenciaPorCurso.get(cursoId);
    const promedioCurso = calificacionesPorCurso.get(cursoId);
    const ultimaSesion = ultimaSesionPorCurso.get(cursoId);
    const proximaSesion = proximasSesionPorCurso.get(cursoId) || null;
    return {
      id: curso.id,
      nombre: cursoNombreMap.get(cursoId) || curso.nombre,
      estado: curso.estado,
      programas: curso.programas ?? null,
      programaId: curso.programa_id ?? null,
      diasSemana: curso.dias_semana ?? null,
      horaInicio: curso.hora_inicio ?? null,
      horaFin: curso.hora_fin ?? null,
      horario: curso.horario ?? null,
      fechaInicio: curso.fecha_inicio ?? null,
      estudiantesActivos: estudiantesPorCurso.get(cursoId) || 0,
      asistenciaPromedio:
        asistencia && asistencia.total > 0
          ? Math.round((asistencia.presentes / asistencia.total) * 100)
          : null,
      promedioNota:
        promedioCurso && promedioCurso.total > 0
          ? Number((promedioCurso.suma / promedioCurso.total).toFixed(1))
          : null,
      temaActual: ultimaSesion?.tema ?? null,
      siguienteTema: proximaSesion?.tema ?? null,
      proximaSesion,
    };
  });

  const topCursos = cursosEnriquecidos
    .filter((curso) => (curso.estudiantesActivos || 0) > 0)
    .sort((a, b) => (b.estudiantesActivos || 0) - (a.estudiantesActivos || 0))
    .slice(0, 3)
    .map((curso) => ({
      nombre: curso.nombre,
      estudiantes: curso.estudiantesActivos,
      asistencia: curso.asistenciaPromedio ?? null,
    }));

  const statsPayload: ProfesorDashboardStats = {
    cursosActivos: cursosActivos.length,
    totalEstudiantes: matriculasData.length,
    horasMes,
    porcentajeAsistencia,
    promedioCalificaciones,
    tieneCalificaciones: notasValidas.length > 0,
    pendientesPorCalificar: pendientesList.length,
    asistenciaChart,
    calificacionesChart,
    topCursos,
    horasQuincena,
    proyeccionQuincena,
    tarifaHora: valorHora,
    totalPagadoMes: Number(totalPagadoMes.toFixed(2)),
  };

  const calificacionesRecientesPorGrupo: ProfesorDashboardCalificacionesGrupo[] = cursosEnriquecidos.map((curso) => {
    const ultimaClase = ultimaSesionPorCurso.get(String(curso.id));
    const fechaUltimaClase = ultimaClase?.fecha || null;
    const filas = new Map<number, ProfesorDashboardCalificacionUltimaClase>();

    matriculasData
      .filter((matricula: any) => String(matricula.curso_id) === String(curso.id))
      .forEach((matricula: any) => {
        const matriculaId = Number(matricula.id);
        if (!Number.isFinite(matriculaId)) return;
        filas.set(matriculaId, {
          matriculaId,
          estudiante: matriculaEstudianteMap.get(matriculaId) || "Estudiante",
          quiz: null,
          actividad: null,
        });
      });

    if (fechaUltimaClase) {
      calificacionesData.forEach((calificacion: any) => {
        const matriculaId = Number(calificacion.matricula_id);
        if (!Number.isFinite(matriculaId)) return;
        const cursoId = matriculaCursoMap.get(matriculaId);
        if (String(cursoId || "") !== String(curso.id)) return;

        const fechaEvaluacion = calificacion.fecha_evaluacion ? dayjs(calificacion.fecha_evaluacion) : null;
        if (!fechaEvaluacion || !fechaEvaluacion.isSame(dayjs(fechaUltimaClase), "day")) return;

        const nota = Number(calificacion.nota ?? calificacion.calificacion);
        if (!Number.isFinite(nota)) return;

        const kind = resolveEvaluationKind(calificacion.tipo_evaluacion, calificacion.concepto);
        if (!kind) return;

        const row = filas.get(matriculaId) || {
          matriculaId,
          estudiante: matriculaEstudianteMap.get(matriculaId) || "Estudiante",
          quiz: null,
          actividad: null,
        };

        if (kind === "quiz") {
          row.quiz = nota;
        }
        if (kind === "actividad") {
          row.actividad = nota;
        }

        filas.set(matriculaId, row);
      });
    }

    const estudiantes = Array.from(filas.values()).sort((a, b) =>
      a.estudiante.localeCompare(b.estudiante, "es", { sensitivity: "base" }),
    );

    return {
      cursoId: String(curso.id),
      curso: curso.nombre,
      fechaUltimaClase,
      temaUltimaClase: ultimaClase?.tema || null,
      estudiantes,
    };
  });

  const asistenciaPorMatricula = new Map<number, { total: number; presentes: number; weekKeys: string[] }>();
  asistenciasGamificacionData.forEach((asistencia: any) => {
    const matriculaId = Number(asistencia?.matricula_id);
    if (!Number.isFinite(matriculaId)) return;

    const current = asistenciaPorMatricula.get(matriculaId) || { total: 0, presentes: 0, weekKeys: [] };
    current.total += 1;

    if (isAsistenciaPositiva(asistencia?.estado)) {
      current.presentes += 1;
      const weekKey = getWeekKey(asistencia?.fecha);
      if (weekKey) current.weekKeys.push(weekKey);
    }

    asistenciaPorMatricula.set(matriculaId, current);
  });

  const quizAprobadosPorMatricula = new Map<number, number>();
  const quizXpTotalPorMatricula = new Map<number, number>();
  const quizXpSemanaPorMatricula = new Map<number, number>();
  const evidenciasTotalPorMatricula = new Map<number, number>();
  const evidenciasSemanaPorMatricula = new Map<number, number>();
  const semanaActualKey = dayjs().startOf("week").format("YYYY-MM-DD");
  calificacionesGamificacionData.forEach((calificacion: any) => {
    const matriculaId = Number(calificacion?.matricula_id);
    if (!Number.isFinite(matriculaId)) return;

    const kind = resolveEvaluationKind(calificacion?.tipo_evaluacion, calificacion?.concepto);
    if (kind !== "quiz") return;

    const nota = Number(calificacion?.nota ?? calificacion?.calificacion);
    if (!Number.isFinite(nota)) return;

    const xpQuiz = calcularXpQuizPorNota(nota);
    quizXpTotalPorMatricula.set(matriculaId, (quizXpTotalPorMatricula.get(matriculaId) || 0) + xpQuiz);

    if (isPassingGrade(nota)) {
      quizAprobadosPorMatricula.set(
        matriculaId,
        (quizAprobadosPorMatricula.get(matriculaId) || 0) + 1
      );
    }

    const weekKeyEvaluacion = getWeekKey(calificacion?.fecha_evaluacion);
    if (weekKeyEvaluacion === semanaActualKey) {
      quizXpSemanaPorMatricula.set(matriculaId, (quizXpSemanaPorMatricula.get(matriculaId) || 0) + xpQuiz);
    }
  });

  evidenciasTareasData.forEach((evidencia: any) => {
    const matriculaId = Number(evidencia?.matricula_id);
    if (!Number.isFinite(matriculaId)) return;

    evidenciasTotalPorMatricula.set(matriculaId, (evidenciasTotalPorMatricula.get(matriculaId) || 0) + 1);

    const weekKeyEvidencia = getWeekKey(evidencia?.updated_at || evidencia?.created_at);
    if (weekKeyEvidencia === semanaActualKey) {
      evidenciasSemanaPorMatricula.set(matriculaId, (evidenciasSemanaPorMatricula.get(matriculaId) || 0) + 1);
    }
  });

  const gamificacionPorCurso = new Map<string, ProfesorDashboardGamificacionEstudiante[]>();

  matriculasData.forEach((matricula: any) => {
    const matriculaId = Number(matricula?.id);
    const cursoId = String(matricula?.curso_id || "");
    if (!Number.isFinite(matriculaId) || !cursoId) return;

    const asistencia = asistenciaPorMatricula.get(matriculaId) || { total: 0, presentes: 0, weekKeys: [] };
    const asistenciaPercent = asistencia.total > 0
      ? Math.round((asistencia.presentes / asistencia.total) * 100)
      : 0;

    const semanasConAsistencia = Array.from(new Set(asistencia.weekKeys)).length;
    const { actual: rachaActual } = calculateWeeklyStreak(asistencia.weekKeys);
    const quizAprobados = quizAprobadosPorMatricula.get(matriculaId) || 0;
    const presentesSemana = asistencia.weekKeys.filter((weekKey) => weekKey === semanaActualKey).length;
    const quizXpTotal = quizXpTotalPorMatricula.get(matriculaId) || 0;
    const quizXpSemana = quizXpSemanaPorMatricula.get(matriculaId) || 0;
    const evidenciasTotal = evidenciasTotalPorMatricula.get(matriculaId) || 0;
    const evidenciasSemana = evidenciasSemanaPorMatricula.get(matriculaId) || 0;

    const xpAsistencia = Math.min(asistencia.presentes, CLASES_OBJETIVO_CURSO) * XP_ASISTENCIA_POR_CLASE;
    const xpQuiz = Math.min(quizXpTotal, CLASES_OBJETIVO_CURSO * XP_QUIZ_MAX_POR_CLASE);
    const xpEvidencia = Math.min(evidenciasTotal, CLASES_OBJETIVO_CURSO) * XP_EVIDENCIA_POR_CLASE;
    const xpTotal = Math.min(XP_TOTAL_CURSO, xpAsistencia + xpQuiz + xpEvidencia);

    const xpSemanal =
      (presentesSemana * XP_ASISTENCIA_POR_CLASE) +
      quizXpSemana +
      (evidenciasSemana * XP_EVIDENCIA_POR_CLASE);

    const score = Math.max(0, Math.min(100, Math.round(xpTotal / 10)));

    const nivel = Math.max(1, Math.ceil(xpTotal / XP_POR_NIVEL));
    const estado: "alto" | "medio" | "bajo" = score >= 80 ? "alto" : score >= 55 ? "medio" : "bajo";

    const payload: ProfesorDashboardGamificacionEstudiante = {
      matriculaId,
      estudiante: matriculaEstudianteMap.get(matriculaId) || "Estudiante",
      xpSemanal,
      xpTotal,
      score,
      nivel,
      asistenciaPercent,
      semanasConAsistencia,
      rachaActual,
      quizAprobados,
      estado,
    };

    const bucket = gamificacionPorCurso.get(cursoId) || [];
    bucket.push(payload);
    gamificacionPorCurso.set(cursoId, bucket);
  });

  const gamificacionEstudiantesPorGrupo: ProfesorDashboardGamificacionGrupo[] = cursosEnriquecidos.map((curso) => {
    const estudiantes = (gamificacionPorCurso.get(String(curso.id)) || [])
      .sort((a, b) => b.xpTotal - a.xpTotal || b.xpSemanal - a.xpSemanal || b.score - a.score || a.estudiante.localeCompare(b.estudiante, "es", { sensitivity: "base" }));

    const promedioScore = estudiantes.length
      ? Math.round(estudiantes.reduce((acc, item) => acc + item.score, 0) / estudiantes.length)
      : 0;

    return {
      cursoId: String(curso.id),
      curso: curso.nombre,
      promedioScore,
      estudiantes,
    };
  });

  const evidenciasTareas: ProfesorDashboardEvidenciaTarea[] = (evidenciasTareasData || []).map((evidencia: any) => {
    const matriculaId = Number(evidencia?.matricula_id);
    return {
      id: String(evidencia?.id || ""),
      matriculaId,
      cursoId: String(evidencia?.curso_id || matriculaCursoMap.get(matriculaId) || ""),
      pensumCursoId: String(evidencia?.pensum_curso_id || ""),
      estudiante: matriculaEstudianteMap.get(matriculaId) || "Estudiante",
      urlImagen: String(evidencia?.url_imagen || ""),
      createdAt: evidencia?.created_at || null,
      updatedAt: evidencia?.updated_at || null,
    };
  });

  return {
    stats: statsPayload,
    cursos: cursosEnriquecidos,
    proximasSesiones: mergedProximasSesiones,
    pendientes: pendientesList,
    pagos: pagosRecientes,
    calificacionesRecientesPorGrupo,
    gamificacionEstudiantesPorGrupo,
    evidenciasTareas,
  };
};

export const useProfessorDashboard = (profesorId?: string): ProfessorDashboardData => {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const currentUserId = currentUser?.id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfesorDashboardStats>(emptyStats);
  const [cursos, setCursos] = useState<ProfesorDashboardCurso[]>([]);
  const [proximasSesiones, setProximasSesiones] = useState<ProfesorDashboardSesion[]>([]);
  const [pendientes, setPendientes] = useState<ProfesorDashboardPendiente[]>([]);
  const [pagos, setPagos] = useState<ProfesorDashboardPago[]>([]);
  const [calificacionesRecientesPorGrupo, setCalificacionesRecientesPorGrupo] = useState<ProfesorDashboardCalificacionesGrupo[]>([]);
  const [gamificacionEstudiantesPorGrupo, setGamificacionEstudiantesPorGrupo] = useState<ProfesorDashboardGamificacionGrupo[]>([]);
  const [evidenciasTareas, setEvidenciasTareas] = useState<ProfesorDashboardEvidenciaTarea[]>([]);

  useEffect(() => {
    const fetchDashboard = async () => {
      // 1. Determinar ID: o viene por prop (admin viendo) o es el usuario actual
      const targetId = profesorId || currentUserId;

      // Si no hay ID y el usuario ya terminó de cargar (o no hay sesión), terminamos
      if (!targetId) {
        if (!userLoading) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchProfessorDashboardData(targetId);
        setStats(data.stats);
        setCursos(data.cursos);
        setProximasSesiones(data.proximasSesiones);
        setPendientes(data.pendientes);
        setPagos(data.pagos);
        setCalificacionesRecientesPorGrupo(data.calificacionesRecientesPorGrupo || []);
        setGamificacionEstudiantesPorGrupo(data.gamificacionEstudiantesPorGrupo || []);
        setEvidenciasTareas(data.evidenciasTareas || []);
      } catch (error) {
        console.error("Error general obteniendo dashboard del profesor", error);
        setStats(emptyStats);
        setCursos([]);
        setProximasSesiones([]);
        setPendientes([]);
        setPagos([]);
        setCalificacionesRecientesPorGrupo([]);
        setGamificacionEstudiantesPorGrupo([]);
        setEvidenciasTareas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [profesorId, currentUserId, userLoading]);
  
  return {
    loading,
    profesorNombre: currentUser?.nombre_completo || currentUser?.email || undefined,
    stats,
    cursos,
    proximasSesiones,
    pendientes,
    pagos,
    calificacionesRecientesPorGrupo,
    gamificacionEstudiantesPorGrupo,
    evidenciasTareas,
  };
};