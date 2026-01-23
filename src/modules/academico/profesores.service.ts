// Servicio de profesores: lógica de negocio para dashboard, cursos y métricas
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";

export async function obtenerDashboardProfesor(profesorId: string) {
  // A. Obtener cursos del profesor
  const { data: cursosData, error: cursosError } = await supabaseBrowserClient
    .from("cursos")
    .select("id, nombre, estado")
    .eq("profesor_id", profesorId)
    .neq("estado", "eliminado");
  if (cursosError) throw cursosError;

  const cursosActivos = cursosData?.filter((c) => c.estado === "activo") || [];
  const cursoIds = cursosData?.map((c) => c.id) || [];

  // B. Contar estudiantes activos
  let totalEstudiantes = 0;
  if (cursoIds.length > 0) {
    const { count, error: estError } = await supabaseBrowserClient
      .from("matriculas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "activo")
      .in("curso_id", cursoIds);
    if (estError) throw estError;
    totalEstudiantes = count || 0;
  }

  // C. Sumar horas dictadas en el mes actual
  const { data: sesionesData, error: sesError } = await supabaseBrowserClient
    .from("sesiones_clase")
    .select("horas_dictadas")
    .eq("profesor_id", profesorId)
    .gte("fecha", dayjs().startOf("month").format("YYYY-MM-DD"))
    .lte("fecha", dayjs().endOf("month").format("YYYY-MM-DD"));
  if (sesError) throw sesError;
  const horasMes = sesionesData?.reduce((acc, curr) => acc + (Number(curr.horas_dictadas) || 0), 0) || 0;

  return {
    cursosActivos: cursosActivos.length,
    totalEstudiantes,
    horasMes,
    cursos: cursosData || [],
  };
}
