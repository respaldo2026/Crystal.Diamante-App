import { supabaseBrowserClient } from "@utils/supabase/client";

export async function getCursosDisponibles() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseBrowserClient
    .from("cursos")
    .select("id, nombre, cupos, fecha_inicio")
    .gte("fecha_inicio", hoy)
    .in("estado", ["proximo", "activo"])
    .order("fecha_inicio", { ascending: true });
  return { data, error };
}

export async function getPagosPendientes() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseBrowserClient
    .from("pagos")
    .select("id, monto, fecha_vencimiento, perfiles(nombre_completo)")
    .eq("estado", "pendiente")
    .lt("fecha_vencimiento", hoy)
    .order("fecha_vencimiento", { ascending: true });
  return { data, error };
}
