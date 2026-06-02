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
  siguiente_clase_numero?: number | null;
  siguiente_clase_nombre?: string | null;
  ciclo_actual_numero?: number | null;
  ciclo_actual_nombre?: string | null;
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

  const programaIds = Array.from(
    new Set(
      normalizadosBase
        .map((item: any) => Number(item.programa_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  const rutaPorPrograma = new Map<
    number,
    Array<{
      numeroClase: number;
      nombreClase: string;
      cicloNumero: number | null;
      cicloNombre: string | null;
    }>
  >();

  if (programaIds.length > 0) {
    const { data: pensumData, error: pensumError } = await supabaseBrowserClient
      .from("pensum")
      .select("id, programa_id, numero_ciclo, nombre_ciclo, orden, pensum_cursos(id, nombre_curso, orden)")
      .in("programa_id", programaIds)
      .eq("activo", true)
      .order("programa_id", { ascending: true })
      .order("orden", { ascending: true, nullsFirst: false })
      .order("numero_ciclo", { ascending: true, nullsFirst: false });

    if (pensumError) throw pensumError;

    const pensumPorPrograma = new Map<number, any[]>();
    (pensumData || []).forEach((ciclo: any) => {
      const programaId = Number(ciclo?.programa_id);
      if (!Number.isFinite(programaId) || programaId <= 0) return;
      if (!pensumPorPrograma.has(programaId)) {
        pensumPorPrograma.set(programaId, []);
      }
      pensumPorPrograma.get(programaId)?.push(ciclo);
    });

    pensumPorPrograma.forEach((ciclos, programaId) => {
      const ciclosOrdenados = [...ciclos].sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
        const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });

      const ruta: Array<{
        numeroClase: number;
        nombreClase: string;
        cicloNumero: number | null;
        cicloNombre: string | null;
      }> = [];

      ciclosOrdenados.forEach((ciclo: any) => {
        const temasOrdenados = (Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [])
          .slice()
          .sort((a: any, b: any) => {
            const ordenA = Number(a?.orden ?? 0);
            const ordenB = Number(b?.orden ?? 0);
            if (ordenA !== ordenB) return ordenA - ordenB;
            return Number(a?.id || 0) - Number(b?.id || 0);
          });

        temasOrdenados.forEach((tema: any) => {
          const numeroClase = ruta.length + 1;
          const nombreTema = String(tema?.nombre_curso || "").trim() || `Clase ${numeroClase}`;
          const cicloNumeroRaw = Number(ciclo?.numero_ciclo);
          const cicloNumero = Number.isFinite(cicloNumeroRaw) && cicloNumeroRaw > 0 ? cicloNumeroRaw : null;
          const cicloNombre = String(ciclo?.nombre_ciclo || "").trim() || null;

          ruta.push({
            numeroClase,
            nombreClase: nombreTema,
            cicloNumero,
            cicloNombre,
          });
        });
      });

      if (ruta.length > 0) {
        rutaPorPrograma.set(programaId, ruta);
      }
    });
  }

  const ultimaSesionPorCurso = new Map<number, { numero: number | null; tema: string | null; fecha: string | null }>();
  const totalSesionesPorCurso = new Map<number, number>();

  if (cursoIds.length > 0) {
    const { data: sesiones, error: sesionesError } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select("curso_id, fecha, tema_visto")
      .in("curso_id", cursoIds)
      .order("fecha", { ascending: false });

    if (sesionesError) throw sesionesError;

    (sesiones || []).forEach((sesion: any) => {
      const cursoId = Number(sesion?.curso_id);
      if (!Number.isFinite(cursoId)) return;

      totalSesionesPorCurso.set(cursoId, (totalSesionesPorCurso.get(cursoId) || 0) + 1);

      if (ultimaSesionPorCurso.has(cursoId)) return;

      const textoClase = String(sesion?.tema_visto || "").trim();

      ultimaSesionPorCurso.set(cursoId, {
        numero: extractClassNumber(textoClase),
        tema: String(sesion?.tema_visto || "").trim() || null,
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
        .select("fecha, observaciones, matriculas:matriculas!asistencias_matricula_id_fkey!inner(curso_id)")
        .in("matriculas.curso_id", cursosSinNumero)
        .order("fecha", { ascending: false });

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

    const programaId = Number(item.programa_id || 0);
    const rutaPrograma = rutaPorPrograma.get(programaId) || [];
    const claseActualInfo =
      Number.isFinite(Number(numeroClase)) && Number(numeroClase) > 0
        ? rutaPrograma[Number(numeroClase) - 1] || null
        : null;

    const proximaNumeroBase =
      Number.isFinite(Number(numeroClase)) && Number(numeroClase) > 0
        ? Number(numeroClase) + 1
        : 1;

    const proximaInfo = rutaPrograma[proximaNumeroBase - 1] || null;
    const cicloActualInfo = claseActualInfo || rutaPrograma[0] || null;

    return {
      ...item,
      ultima_clase_numero: numeroClase,
      ultima_clase_tema: ultimaSesion?.tema ?? null,
      ultima_clase_fecha: ultimaSesion?.fecha ?? null,
      siguiente_clase_numero: proximaInfo?.numeroClase ?? null,
      siguiente_clase_nombre: proximaInfo?.nombreClase ?? null,
      ciclo_actual_numero: cicloActualInfo?.cicloNumero ?? null,
      ciclo_actual_nombre: cicloActualInfo?.cicloNombre ?? null,
    };
  });

  return normalizados as GrupoAcademico[];
}

// ...más funciones de negocio para cursos, inscripciones, etc.
