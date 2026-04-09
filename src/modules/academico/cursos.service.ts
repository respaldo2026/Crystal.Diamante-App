// Servicio de cursos: lógica de negocio para cursos, inscripciones y gestión académica
import { supabaseBrowserClient } from "@utils/supabase/client";
import { extractClassNumber } from "@/modules/portal-estudiante/utils";

export interface GrupoAcademico {
  id: number;
  nombre: string | null;
  estado: string | null;
  descripcion?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dias_semana?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  cupos?: number | null;
  programa_id?: number | null;
  profesor_id?: string | null;
  programas?: {
    id: number;
    nombre: string | null;
  } | null;
  profesor?: {
    id: string;
    nombre_completo: string | null;
  } | null;
  matriculas?: Array<{ count: number }>;
  ultima_clase_numero?: number | null;
  ultima_clase_tema?: string | null;
  ultima_clase_fecha?: string | null;
}

export async function crearCurso(curso: {
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  cupos: number;
}) {
  // Validaciones de negocio aquí
  const { error } = await supabaseBrowserClient.from("cursos").insert(curso);
  if (error) throw error;
  return true;
}

export async function obtenerCursos(): Promise<GrupoAcademico[]> {
  const { data, error } = await supabaseBrowserClient
    .from("cursos")
    .select(
      `
        id,
        nombre,
        estado,
        descripcion,
        fecha_inicio,
        fecha_fin,
        dias_semana,
        hora_inicio,
        hora_fin,
        cupos,
        programa_id,
        profesor_id,
        programas:programa_id ( id, nombre ),
        profesor:profesor_id ( id, nombre_completo ),
        matriculas:matriculas ( count )
      `
    )
    .order("estado", { ascending: true })
    .order("fecha_inicio", { ascending: true, nullsFirst: true })
    .order("hora_inicio", { ascending: true, nullsFirst: true });

  if (error) throw error;
  const normalizadosBase = (data ?? []).map((item: any) => ({
    ...item,
    programas: Array.isArray(item.programas) ? item.programas[0] ?? null : item.programas,
    profesor: Array.isArray(item.profesor) ? item.profesor[0] ?? null : item.profesor,
    matriculas: Array.isArray(item.matriculas)
      ? item.matriculas
      : item.matriculas
        ? [item.matriculas]
        : [],
  }));

  const cursoIds = normalizadosBase
    .map((item: any) => Number(item.id))
    .filter((id) => Number.isFinite(id));

  const ultimaSesionPorCurso = new Map<number, { numero: number | null; tema: string | null; fecha: string | null }>();
  const totalSesionesPorCurso = new Map<number, number>();

  if (cursoIds.length > 0) {
    const { data: sesiones, error: sesionesError } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select("curso_id, fecha, tema_visto, observaciones")
      .in("curso_id", cursoIds)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (sesionesError) throw sesionesError;

    (sesiones || []).forEach((sesion: any) => {
      const cursoId = Number(sesion?.curso_id);
      if (!Number.isFinite(cursoId)) return;

      totalSesionesPorCurso.set(cursoId, (totalSesionesPorCurso.get(cursoId) || 0) + 1);

      if (ultimaSesionPorCurso.has(cursoId)) return;

      const textoClase = String(sesion?.observaciones || sesion?.tema_visto || "").trim();

      ultimaSesionPorCurso.set(cursoId, {
        numero: extractClassNumber(textoClase),
        tema: String(sesion?.tema_visto || "").trim() || String(sesion?.observaciones || "").trim() || null,
        fecha: sesion?.fecha || null,
      });
    });

    const cursosSinNumero = cursoIds.filter((cursoId) => {
      const sesion = ultimaSesionPorCurso.get(cursoId);
      return !sesion || !Number.isFinite(Number(sesion.numero)) || Number(sesion.numero) <= 0;
    });

    if (cursosSinNumero.length > 0) {
      const { data: asistencias, error: asistenciasError } = await supabaseBrowserClient
        .from("asistencias")
        .select("fecha, observaciones, matriculas!inner(curso_id)")
        .in("matriculas.curso_id", cursosSinNumero)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

      if (asistenciasError) throw asistenciasError;

      const fechasUnicasPorCurso = new Map<number, Set<string>>();

      (asistencias || []).forEach((registro: any) => {
        const cursoId = Number(registro?.matriculas?.curso_id);
        const fecha = String(registro?.fecha || "").trim();
        if (!Number.isFinite(cursoId) || !fecha) return;

        if (!fechasUnicasPorCurso.has(cursoId)) {
          fechasUnicasPorCurso.set(cursoId, new Set<string>());
        }

        fechasUnicasPorCurso.get(cursoId)?.add(fecha);

        const sesionActual = ultimaSesionPorCurso.get(cursoId);
        if (!sesionActual || !sesionActual.fecha || fecha > String(sesionActual.fecha)) {
          const detalle = String(registro?.observaciones || "").trim();
          ultimaSesionPorCurso.set(cursoId, {
            numero: extractClassNumber(detalle),
            tema: detalle || sesionActual?.tema || null,
            fecha,
          });
        }
      });

      fechasUnicasPorCurso.forEach((fechas, cursoId) => {
        const totalFechas = fechas.size;
        const totalPrevio = totalSesionesPorCurso.get(cursoId) || 0;
        if (totalFechas > totalPrevio) {
          totalSesionesPorCurso.set(cursoId, totalFechas);
        }
      });
    }
  }

  const normalizados = normalizadosBase.map((item: any) => {
    const ultimaSesion = ultimaSesionPorCurso.get(Number(item.id));
    const totalSesiones = totalSesionesPorCurso.get(Number(item.id)) || 0;
    const numeroClase = (() => {
      const numeroDetectado = Number(ultimaSesion?.numero || 0);
      if (Number.isFinite(numeroDetectado) && numeroDetectado > 0) {
        return numeroDetectado;
      }
      return totalSesiones > 0 ? totalSesiones : null;
    })();

    return {
      ...item,
      ultima_clase_numero: numeroClase,
      ultima_clase_tema: ultimaSesion?.tema ?? null,
      ultima_clase_fecha: ultimaSesion?.fecha ?? null,
    };
  });

  return normalizados as GrupoAcademico[];
}

// ...más funciones de negocio para cursos, inscripciones, etc.
