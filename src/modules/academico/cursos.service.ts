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

  if (cursoIds.length > 0) {
    const { data: sesiones, error: sesionesError } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select("curso_id, fecha, tema_visto")
      .in("curso_id", cursoIds)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (sesionesError) throw sesionesError;

    (sesiones || []).forEach((sesion: any) => {
      const cursoId = Number(sesion?.curso_id);
      if (!Number.isFinite(cursoId) || ultimaSesionPorCurso.has(cursoId)) return;

      ultimaSesionPorCurso.set(cursoId, {
        numero: extractClassNumber(sesion?.tema_visto || ""),
        tema: String(sesion?.tema_visto || "").trim() || null,
        fecha: sesion?.fecha || null,
      });
    });
  }

  const normalizados = normalizadosBase.map((item: any) => {
    const ultimaSesion = ultimaSesionPorCurso.get(Number(item.id));
    return {
      ...item,
      ultima_clase_numero: ultimaSesion?.numero ?? null,
      ultima_clase_tema: ultimaSesion?.tema ?? null,
      ultima_clase_fecha: ultimaSesion?.fecha ?? null,
    };
  });

  return normalizados as GrupoAcademico[];
}

// ...más funciones de negocio para cursos, inscripciones, etc.
