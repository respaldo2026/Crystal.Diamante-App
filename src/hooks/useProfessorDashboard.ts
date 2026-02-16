import { useState, useEffect } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

export interface ProfesorDashboardCurso {
  id: string;
  nombre: string;
  estado: string;
  programaId?: number | null;
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
  pendientesPorCalificar: number;
  asistenciaChart: Array<{ fecha: string; porcentaje: number; presentes: number; total: number }>;
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
  tema?: string | null;
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

export interface ProfessorDashboardData {
  loading: boolean;
  profesorNombre?: string;
  stats: ProfesorDashboardStats;
  cursos: ProfesorDashboardCurso[];
  proximasSesiones: ProfesorDashboardSesion[];
  pendientes: ProfesorDashboardPendiente[];
  pagos: ProfesorDashboardPago[];
}

const emptyStats: ProfesorDashboardStats = {
  cursosActivos: 0,
  totalEstudiantes: 0,
  horasMes: 0,
  porcentajeAsistencia: 0,
  promedioCalificaciones: 0,
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

export const fetchProfessorDashboardData = async (
  profesorId: string,
): Promise<Omit<ProfessorDashboardData, "loading" | "profesorNombre">> => {
  const cursosResponse = await supabaseBrowserClient
    .from("cursos")
    .select("id, nombre, estado, programa_id")
    .eq("profesor_id", profesorId)
    .neq("estado", "eliminado")
    .order("nombre", { ascending: true });

  if (cursosResponse.error) {
    console.error("Error obteniendo cursos del profesor", cursosResponse.error);
  }

  const cursosData = cursosResponse.data || [];
  const cursosActivos = cursosData.filter((c) => c.estado === "activo") || [];
  const cursoIds = cursosData.map((c) => c.id) || [];

  const cursoNombreMap = new Map<string, string>(
    cursosData.map((curso) => [curso.id, curso.nombre]),
  );

  const startOfMonth = dayjs().startOf("month").format("YYYY-MM-DD");
  const endOfMonth = dayjs().endOf("month").format("YYYY-MM-DD");

  const [matriculasResult, sesionesMesResult, proximasSesionesResult] = await Promise.all([
    cursoIds.length > 0
      ? supabaseBrowserClient
          .from("matriculas")
          .select("id, curso_id")
          .eq("estado", "activo")
          .in("curso_id", cursoIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseBrowserClient
      .from("sesiones_clase")
      .select("id, fecha, horas_dictadas, curso_id, tema_visto")
      .eq("profesor_id", profesorId)
      .gte("fecha", startOfMonth)
      .lte("fecha", endOfMonth)
      .order("fecha", { ascending: true }),
    supabaseBrowserClient
      .from("sesiones_clase")
      .select("id, fecha, horas_dictadas, tema_visto, curso_id")
      .eq("profesor_id", profesorId)
      .gte("fecha", dayjs().startOf("day").format("YYYY-MM-DD"))
      .order("fecha", { ascending: true })
      .limit(6),
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

  const matriculasData = matriculasResult.data || [];
  const sesionesMesData = sesionesMesResult.data || [];
  const proximasSesionesData = proximasSesionesResult.data || [];

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

  const [asistenciasResult, calificacionesResult] = await Promise.all([
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
          .select("id, concepto, nota, calificacion, fecha_evaluacion, tipo_evaluacion, matriculas:matriculas!calificaciones_matricula_id_fkey(curso_id)")
          .in("matricula_id", matriculaIds)
          .gte("fecha_evaluacion", dayjs().subtract(90, "day").format("YYYY-MM-DD"))
          .order("fecha_evaluacion", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (asistenciasResult.error) {
    console.error("Error obteniendo asistencias", asistenciasResult.error);
  }
  if (calificacionesResult.error) {
    console.error("Error obteniendo calificaciones", calificacionesResult.error);
  }

  const asistenciasData = asistenciasResult.data || [];
  const calificacionesData = calificacionesResult.data || [];

  const estudiantesPorCurso = new Map<string, number>();
  matriculasData.forEach((matricula: any) => {
    const actual = estudiantesPorCurso.get(matricula.curso_id) || 0;
    estudiantesPorCurso.set(matricula.curso_id, actual + 1);
  });

  const horasMes = sesionesMesData.reduce(
    (total: number, sesion: any) => total + safeNumber(Number(sesion.horas_dictadas) || 0),
    0,
  );

  const ahora = dayjs();
  const quincenaInicio = ahora.date() <= 15 ? ahora.startOf("month") : ahora.date(16).startOf("day");
  const quincenaFin = ahora.date() <= 15 ? ahora.date(15).endOf("day") : ahora.endOf("month");

  const horasQuincena = sesionesMesData.reduce((total: number, sesion: any) => {
    const fechaSesion = dayjs(sesion.fecha);
    if (fechaSesion.isBetween(quincenaInicio, quincenaFin, "day", "[]")) {
      return total + safeNumber(Number(sesion.horas_dictadas) || 0);
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

  const asistenciaPorFecha = new Map<string, { presentes: number; total: number }>();
  const asistenciaPorCurso = new Map<string, { presentes: number; total: number }>();

  asistenciasData.forEach((asistencia: any) => {
    const fechaClave = dayjs(asistencia.fecha).format("DD MMM");
    const cursoId = asistencia.matriculas?.curso_id;
    const present = isAsistenciaPositiva(asistencia.estado);

    const acumuladoFecha = asistenciaPorFecha.get(fechaClave) || { presentes: 0, total: 0 };
    asistenciaPorFecha.set(fechaClave, {
      presentes: acumuladoFecha.presentes + (present ? 1 : 0),
      total: acumuladoFecha.total + 1,
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
      return {
        fecha,
        porcentaje,
        presentes: values.presentes,
        total: values.total,
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

    const cursoId = calificacion.matriculas?.curso_id;
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
    cursoId: sesion.curso_id,
    curso: cursoNombreMap.get(sesion.curso_id) || "Curso",
    tema: sesion.tema_visto,
    horas: Number(sesion.horas_dictadas) || null,
  }));

  const proximasSesionPorCurso = new Map<string, { fecha: string; tema?: string | null }>();
  proximasSesionesList.forEach((sesion) => {
    if (!proximasSesionPorCurso.has(sesion.cursoId)) {
      proximasSesionPorCurso.set(sesion.cursoId, { fecha: sesion.fecha, tema: sesion.tema });
    }
  });

  const ultimaSesionPorCurso = new Map<string, { fecha: string; tema?: string | null }>();
  sesionesMesData.forEach((sesion: any) => {
    if (!sesion.fecha || !sesion.curso_id) return;
    const fechaSesion = dayjs(sesion.fecha);
    if (fechaSesion.isAfter(dayjs())) return; // solo sesiones pasadas o de hoy
    const existente = ultimaSesionPorCurso.get(sesion.curso_id);
    if (!existente || fechaSesion.isAfter(dayjs(existente.fecha))) {
      ultimaSesionPorCurso.set(sesion.curso_id, { fecha: sesion.fecha, tema: sesion.tema_visto });
    }
  });

  const pendientesList: ProfesorDashboardPendiente[] = calificacionesData
    .filter((calificacion: any) =>
      (calificacion.nota === null || calificacion.nota === undefined) &&
      (calificacion.calificacion === null || calificacion.calificacion === undefined),
    )
    .map((calificacion: any) => ({
      id: calificacion.id,
      curso: cursoNombreMap.get(calificacion.matriculas?.curso_id) || "Curso",
      cursoId: calificacion.matriculas?.curso_id || null,
      concepto: calificacion.concepto || calificacion.tipo_evaluacion || "Sin concepto",
      fecha: calificacion.fecha_evaluacion,
      tipo: calificacion.tipo_evaluacion,
    }));

  const cursosEnriquecidos: ProfesorDashboardCurso[] = (cursosData || []).map((curso: any) => {
    const asistencia = asistenciaPorCurso.get(curso.id);
    const promedioCurso = calificacionesPorCurso.get(curso.id);
    const ultimaSesion = ultimaSesionPorCurso.get(curso.id);
    const proximaSesion = proximasSesionPorCurso.get(curso.id) || null;
    return {
      id: curso.id,
      nombre: curso.nombre,
      estado: curso.estado,
      programaId: curso.programa_id ?? null,
      estudiantesActivos: estudiantesPorCurso.get(curso.id) || 0,
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
    pendientesPorCalificar: pendientesList.length,
    asistenciaChart,
    calificacionesChart,
    topCursos,
    horasQuincena,
    proyeccionQuincena,
    tarifaHora: valorHora,
    totalPagadoMes: Number(totalPagadoMes.toFixed(2)),
  };

  return {
    stats: statsPayload,
    cursos: cursosEnriquecidos,
    proximasSesiones: proximasSesionesList,
    pendientes: pendientesList,
    pagos: pagosRecientes,
  };
};

export const useProfessorDashboard = (profesorId?: string): ProfessorDashboardData => {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfesorDashboardStats>(emptyStats);
  const [cursos, setCursos] = useState<ProfesorDashboardCurso[]>([]);
  const [proximasSesiones, setProximasSesiones] = useState<ProfesorDashboardSesion[]>([]);
  const [pendientes, setPendientes] = useState<ProfesorDashboardPendiente[]>([]);
  const [pagos, setPagos] = useState<ProfesorDashboardPago[]>([]);

  useEffect(() => {
    const fetchDashboard = async () => {
      // 1. Determinar ID: o viene por prop (admin viendo) o es el usuario actual
      const targetId = profesorId || currentUser?.id;

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
      } catch (error) {
        console.error("Error general obteniendo dashboard del profesor", error);
        setStats(emptyStats);
        setCursos([]);
        setProximasSesiones([]);
        setPendientes([]);
        setPagos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [profesorId, currentUser, userLoading]);
  
  return {
    loading,
    profesorNombre: currentUser?.nombre_completo || currentUser?.email || undefined,
    stats,
    cursos,
    proximasSesiones,
    pendientes,
    pagos,
  };
};