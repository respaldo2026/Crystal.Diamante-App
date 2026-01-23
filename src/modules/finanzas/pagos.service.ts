// Servicio de pagos: lógica de negocio para pagos, cuotas y conciliación
import { supabaseBrowserClient } from "@utils/supabase/client";

export async function registrarPago(pago: {
  estudiante_id: string;
  monto: number;
  metodo_pago: string;
  fecha_pago: string;
  concepto: string;
}) {
  // Validaciones de negocio aquí
  // ...
  const { error } = await supabaseBrowserClient
    .from("pagos")
    .insert(pago);
  if (error) throw error;
  return true;
}

export async function obtenerPagosPorEstudiante(estudiante_id: string) {
  const { data, error } = await supabaseBrowserClient
    .from("pagos")
    .select("*")
    .eq("estudiante_id", estudiante_id);
  if (error) throw error;
  return data;
}

// ...más funciones de negocio para pagos, conciliación, etc.
