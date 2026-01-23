// Servicio de cursos: lógica de negocio para cursos, inscripciones y gestión académica
import { supabaseBrowserClient } from "@utils/supabase/client";

export async function crearCurso(curso: {
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  cupos: number;
}) {
  // Validaciones de negocio aquí
  // ...
  const { error } = await supabaseBrowserClient
    .from("cursos")
    .insert(curso);
  if (error) throw error;
  return true;
}

export async function obtenerCursos() {
  const { data, error } = await supabaseBrowserClient
    .from("cursos")
    .select("*");
  if (error) throw error;
  return data;
}

// ...más funciones de negocio para cursos, inscripciones, etc.
