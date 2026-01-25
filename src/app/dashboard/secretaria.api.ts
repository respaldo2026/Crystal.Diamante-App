import { supabaseBrowserClient } from "@utils/supabase/client";

export async function getProgramasResumen() {
  const { data, error } = await supabaseBrowserClient
    .from("programas")
    .select(
      "id, nombre, descripcion, contenido, duracion, precio_inscripcion, precio_mensualidad, total_clases"
    )
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return { data, error };
}

export async function getCursosSecretaria() {
  const { data, error } = await supabaseBrowserClient
    .from("cursos")
    .select(`
      id,
      nombre,
      estado,
      fecha_inicio,
      fecha_fin,
      dias_semana,
      hora_inicio,
      hora_fin,
      cupos,
      programa_id,
      programas:programa_id ( id, nombre ),
      matriculas:matriculas ( count )
    `)
    .in("estado", ["activo", "proximo"])
    .order("fecha_inicio", { ascending: true, nullsFirst: true });

  return { data, error };
}

export async function getPagosPendientes() {
  const { data, error } = await supabaseBrowserClient
    .from("pagos")
    .select(`
      id,
      monto,
      fecha_vencimiento,
      referencia,
      matricula_id,
      perfiles:estudiante_id ( nombre_completo ),
      matriculas:matricula_id ( cursos ( nombre ) )
    `)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento", { ascending: true });

  return { data, error };
}

export async function getLeadsPendientes(limit = 6) {
  const { data, error } = await supabaseBrowserClient
    .from("leads")
    .select("id, nombre, telefono, email, interes, estado, created_at, canal")
    .in("estado", ["nuevo", "contactado", "en_seguimiento"])
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data, error };
}

export async function getEstudiantesActivos() {
  const { data, error } = await supabaseBrowserClient
    .from("perfiles")
    .select("id, nombre_completo")
    .eq("rol", "estudiante")
    .eq("activo", true)
    .order("nombre_completo", { ascending: true });

  return { data, error };
}
