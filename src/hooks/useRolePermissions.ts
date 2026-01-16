import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";

export interface RolePermissions {
  rol: string;
  permisos: {
    [modulo: string]: boolean;
  };
}

// Módulos disponibles en la aplicación
export const MODULOS_DISPONIBLES = [
  { key: "cursos", label: "Cursos" },
  { key: "estudiantes", label: "Estudiantes" },
  { key: "matriculas", label: "Matrículas" },
  { key: "asistencias", label: "Asistencias" },
  { key: "profesores", label: "Profesores" },
  { key: "tesoreria", label: "Tesorería/Pagos" },
  { key: "nomina", label: "Nómina" },
  { key: "perfiles", label: "Perfiles" },
  { key: "leads", label: "Leads" },
  { key: "inventario", label: "Inventario" },
  { key: "planificador", label: "Planificador" },
  { key: "portal-estudiante", label: "Portal Estudiante" },
  { key: "configuracion", label: "Configuración" },
];

// Roles disponibles - JERARQUÍA ACTUALIZADA
export const ROLES_DISPONIBLES = {
  director: { label: "🏆 Director", color: "gold", nivel: 5, descripcion: "Propietario de la academia" },
  administrador: { label: "👔 Administrador", color: "blue", nivel: 4, descripcion: "Apoyo operativo" },
  asesor: { label: "📞 Asesor", color: "cyan", nivel: 3, descripcion: "Gestión de leads" },
  profesor: { label: "🎓 Profesor", color: "green", nivel: 2, descripcion: "Docente" },
  estudiante: { label: "👨‍🎓 Estudiante", color: "default", nivel: 1, descripcion: "Aprendiz" },
};

/**
 * Hook para obtener y gestionar permisos por rol
 */
export function useRolePermissions() {
  const [permisos, setPermisos] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarPermisos();
  }, []);

  const cargarPermisos = async () => {
    try {
      const { data } = await supabaseBrowserClient
        .from("role_permissions")
        .select("*");

      if (data) {
        const permisosMap: Record<string, Record<string, boolean>> = {};
        data.forEach((row: any) => {
          permisosMap[row.rol] = row.permisos || {};
        });
        setPermisos(permisosMap);
      }
    } catch (error) {
      console.error("Error cargando permisos:", error);
    } finally {
      setLoading(false);
    }
  };

  const guardarPermisos = async (rol: string, nuevoPermisos: Record<string, boolean>) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("role_permissions")
        .upsert(
          { rol, permisos: nuevoPermisos },
          { onConflict: "rol" }
        );

      if (error) throw error;

      setPermisos((prev) => ({
        ...prev,
        [rol]: nuevoPermisos,
      }));

      return { success: true };
    } catch (error: any) {
      console.error("Error guardando permisos:", error);
      return { success: false, error: error.message };
    }
  };

  const tienePermiso = (rol: string | undefined, modulo: string): boolean => {
    if (!rol) return false;
    const permsRol = permisos[rol];
    if (!permsRol) return false;
    return permsRol[modulo] ?? false;
  };

  return {
    permisos,
    loading,
    guardarPermisos,
    tienePermiso,
    recargar: cargarPermisos,
  };
}
