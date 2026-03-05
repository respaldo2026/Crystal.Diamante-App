import { logger } from "@utils/logger";
import { supabaseBrowserClient } from "@utils/supabase/client";
import {
  obtenerMaterialesCicloPorProgramas,
  obtenerMaterialesClasePorProgramas,
  obtenerMaterialesPorProgramas,
  obtenerPensumPorProgramas,
} from "@modules/academico/pensum.service";
import { extractClassNumber, getMaterialCanonicalKey } from "@/modules/portal-estudiante/utils";

type PortalDataErrorCode = "NOT_AUTHENTICATED" | "PROFILE_NOT_FOUND" | "UNKNOWN";

export type PortalDataResult =
  | {
      ok: true;
      payload: {
        estudiante: any;
        whatsappAgente: string | null;
        whatsappAdmisiones: string | null;
        logoAcademia: string | null;
        matriculas: any[];
        pagos: any[];
        asistencias: any[];
        quizIntentos: any[];
        calificacionesActividad: any[];
        pensum: any[];
        materiales: any[];
        materialesCiclo: any[];
        materialesClase: any[];
        quizzesClase: any[];
        avancePorCurso: any[];
        certificados: any[];
      };
    }
  | {
      ok: false;
      code: PortalDataErrorCode;
      error?: unknown;
    };

const deduplicarLista = <T,>(items: T[], resolverClave: (item: T) => string) => {
  const vistos = new Set<string>();
  const resultado: T[] = [];

  for (const item of items || []) {
    const clave = resolverClave(item);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(item);
  }

  return resultado;
};

const normalizarTelefonoWhatsapp = (value?: string | null): string | null => {
  if (!value) return null;

  const texto = String(value).trim();
  if (!texto) return null;

  const matchWa = texto.match(/wa\.me\/(\d+)/i);
  const base = matchWa?.[1] || texto;
  let digitos = base.replace(/\D/g, "");

  if (!digitos) return null;

  if (digitos.length === 10) {
    digitos = `57${digitos}`;
  }

  return digitos;
};

export const fetchPortalEstudianteData = async (): Promise<PortalDataResult> => {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseBrowserClient.auth.getUser();

    if (authError || !user) {
      return { ok: false, code: "NOT_AUTHENTICATED", error: authError };
    }

    const [perfilRes, configRes, matriculasRes] = await Promise.all([
      supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle(),
      supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabaseBrowserClient
        .from("matriculas")
        .select(`
            *,
            cursos (
              *,
              programas (*)
            )
          `)
        .eq("estudiante_id", user.id)
        .neq("estado", "cancelado"),
    ]);

    const perfil = perfilRes.data;
    const errPerfil = perfilRes.error;
    const config = configRes.data;

    if (errPerfil || !perfil) {
      return { ok: false, code: "PROFILE_NOT_FOUND", error: errPerfil };
    }

    const whatsappAgente = normalizarTelefonoWhatsapp((config as any)?.whatsapp_agente || (config as any)?.whatsapp || null);
    const whatsappAdmisiones = normalizarTelefonoWhatsapp((config as any)?.whatsapp_admisiones || (config as any)?.telefono || (config as any)?.whatsapp || null);
    const logoAcademia = (config as any)?.logo_url || null;

    if (matriculasRes.error) {
      logger.error("Error cargando matrículas del estudiante:", matriculasRes.error);
    }

    const matriculas = matriculasRes.data || [];
    const matriculaIds = matriculas.map((m: any) => m.id);
    const programaIds = matriculas.map((m: any) => m.cursos?.programa_id).filter(Boolean);
    const cursoIds = matriculas
      .map((m: any) => m?.curso_id || m?.cursos?.id)
      .filter(Boolean);

    const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
      .from("pagos")
      .select("*")
      .eq("estudiante_id", user.id)
      .order("fecha_vencimiento", { ascending: true });

    if (errPagos) logger.error("Error cargando pagos:", errPagos);

    let pagos = dataPagos || [];

    if (pagos.length === 0 && matriculaIds.length > 0) {
      const { data: pagosPorMatricula, error: errPagosPorMatricula } = await supabaseBrowserClient
        .from("pagos")
        .select("*")
        .in("matricula_id", matriculaIds)
        .order("fecha_vencimiento", { ascending: true });

      if (errPagosPorMatricula) {
        logger.error("Error cargando pagos por matrícula:", errPagosPorMatricula);
      } else {
        pagos = pagosPorMatricula || [];
      }
    }

    let asistencias: any[] = [];
    let quizIntentos: any[] = [];
    let calificacionesActividad: any[] = [];

    if (matriculaIds.length > 0) {
      const [asistenciasRes, intentosQuizRes, calificacionesActividadRes] = await Promise.all([
        supabaseBrowserClient
          .from("asistencias")
          .select("*, matriculas(id, curso_id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: false }),
        supabaseBrowserClient
          .from("quiz_intentos_clase")
          .select("*")
          .in("matricula_id", matriculaIds)
          .order("enviado_at", { ascending: false }),
        supabaseBrowserClient
          .from("calificaciones")
          .select("matricula_id, tema_id, nota, calificacion, tipo_evaluacion, fecha_evaluacion")
          .in("matricula_id", matriculaIds)
          .in("tipo_evaluacion", ["actividad", "tema"])
          .order("fecha_evaluacion", { ascending: false }),
      ]);

      const dataAsistencias = asistenciasRes.data || [];
      asistencias = dataAsistencias;
      quizIntentos = intentosQuizRes.data || [];
      calificacionesActividad = calificacionesActividadRes.data || [];

      if ((dataAsistencias || []).length > 0 && cursoIds.length > 0) {
        const fechas = (dataAsistencias || [])
          .map((a: any) => a?.fecha)
          .filter(Boolean)
          .sort();

        const fechaMin = fechas[0];
        const fechaMax = fechas[fechas.length - 1];

        const sesionesQuery = supabaseBrowserClient
          .from("sesiones_clase")
          .select("curso_id, fecha, tema_visto, observaciones")
          .in("curso_id", cursoIds);

        const { data: sesionesData } = await (fechaMin && fechaMax
          ? sesionesQuery.gte("fecha", fechaMin).lte("fecha", fechaMax)
          : sesionesQuery);

        const temaPorCursoFecha = new Map<string, string>();
        const claseNumeroPorCursoFecha = new Map<string, number | null>();

        (sesionesData || []).forEach((sesion: any) => {
          const key = `${sesion?.curso_id || ""}-${sesion?.fecha || ""}`;
          if (!temaPorCursoFecha.has(key)) {
            temaPorCursoFecha.set(key, sesion?.tema_visto || "");
            claseNumeroPorCursoFecha.set(key, extractClassNumber(sesion?.observaciones || sesion?.tema_visto));
          }
        });

        asistencias = (dataAsistencias || []).map((asistencia: any) => {
          const cursoId = asistencia?.matriculas?.curso_id;
          const key = `${cursoId || ""}-${asistencia?.fecha || ""}`;
          const temaSesion = temaPorCursoFecha.get(key) || null;
          const temaAsistencia = asistencia?.tema_visto || null;
          const detalleRegistro = String(asistencia?.observaciones || "").trim();
          return {
            ...asistencia,
            tema_visto: temaSesion || temaAsistencia,
            clase_numero: extractClassNumber(asistencia?.observaciones) ?? claseNumeroPorCursoFecha.get(key) ?? null,
            registro_clase: detalleRegistro || temaSesion || temaAsistencia || null,
          };
        });
      }
    }

    let pensum: any[] = [];
    let materiales: any[] = [];
    let materialesCiclo: any[] = [];
    let materialesClase: any[] = [];
    let quizzesClase: any[] = [];

    if (programaIds.length > 0) {
      pensum = await obtenerPensumPorProgramas(programaIds);

      const materialesData = await obtenerMaterialesPorProgramas(programaIds);
      materiales = deduplicarLista(materialesData || [], (m: any) => getMaterialCanonicalKey(m));

      const materialesCicloData = await obtenerMaterialesCicloPorProgramas(programaIds);
      materialesCiclo = deduplicarLista(materialesCicloData || [], (m: any) => String(m?.id || ""));

      const materialesClaseData = await obtenerMaterialesClasePorProgramas(programaIds);
      materialesClase = deduplicarLista(materialesClaseData || [], (m: any) =>
        String(`${m?.programa_id || ""}-${m?.pensum_id || ""}-${m?.pensum_curso_id || ""}-${(m?.nombre_material || "").trim().toLowerCase()}-${m?.cantidad || ""}-${(m?.unidad || "").trim().toLowerCase()}-${(m?.observaciones || "").trim().toLowerCase()}`)
      );

      const { data: dataQuizzes } = await supabaseBrowserClient
        .from("quizzes_clase")
        .select("*")
        .in("programa_id", programaIds)
        .eq("activo", true)
        .eq("publicado", true)
        .order("created_at", { ascending: false });

      quizzesClase = dataQuizzes || [];
    }

    const avancePorCurso = matriculas.map((m: any) => ({
      matriculaId: m.id,
      curso: m.cursos?.nombre,
      programa: m.cursos?.programas?.nombre,
      programaId: m.cursos?.programa_id,
      diasSemana: m.cursos?.dias_semana,
      horaInicio: m.cursos?.hora_inicio,
      horaFin: m.cursos?.hora_fin,
      nota: m.nota_final || 0,
      estado: m.estado_academico,
    }));

    const certificados = matriculas.filter((m: any) => m.estado_academico === "aprobado" && m.nota_final >= 70);

    return {
      ok: true,
      payload: {
        estudiante: perfil,
        whatsappAgente,
        whatsappAdmisiones,
        logoAcademia,
        matriculas,
        pagos,
        asistencias,
        quizIntentos,
        calificacionesActividad,
        pensum,
        materiales,
        materialesCiclo,
        materialesClase,
        quizzesClase,
        avancePorCurso,
        certificados,
      },
    };
  } catch (error) {
    return { ok: false, code: "UNKNOWN", error };
  }
};
