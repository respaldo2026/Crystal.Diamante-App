import { useEffect, useState } from "react";
import { useRolePermissions } from "./useRolePermissions";
import { useCurrentUser } from "./useCurrentUser";

/**
 * Hook para verificar si el usuario actual tiene acceso a un módulo
 * Se usa en el layout para filtrar el menú dinámicamente
 */
export function useModuleAccess() {
  const { user } = useCurrentUser();
  const { tienePermiso, loading } = useRolePermissions();
  const [modulosAccesibles, setModulosAccesibles] = useState<string[]>([]);

  useEffect(() => {
    if (user?.rol && !loading) {
      // Aquí verificamos qué módulos tiene acceso
      const modulos = [
        "cursos",
        "estudiantes",
        "matriculas",
        "asistencias",
        "profesores",
        "tesoreria",
        "nomina",
        "perfiles",
        "leads",
        "inventario",
        "planificador",
        "portal-estudiante",
      ];

      const accesibles = modulos.filter((modulo) =>
        tienePermiso(user.rol, modulo)
      );

      setModulosAccesibles(accesibles);
    }
  }, [user, loading, tienePermiso]);

  const tieneAcceso = (modulo: string): boolean => {
    // Si no hay permisos configurados (nuevo sistema), permitir acceso por defecto
    if (modulosAccesibles.length === 0 && !loading) {
      return true;
    }
    return modulosAccesibles.includes(modulo);
  };

  return {
    modulosAccesibles,
    tieneAcceso,
    loading,
  };
}
