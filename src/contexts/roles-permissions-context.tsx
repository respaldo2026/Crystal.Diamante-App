import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";

export interface RolePermissions {
  rol: string;
  permisos: Record<string, boolean>;
}

interface RolesPermissionsContextType {
  permisos: Record<string, Record<string, boolean>>;
  loading: boolean;
  guardarPermisos: (rol: string, nuevoPermisos: Record<string, boolean>) => Promise<{ success: boolean; error?: string }>;
  tienePermiso: (rol: string | undefined, modulo: string) => boolean;
  recargar: () => Promise<void>;
}

const RolesPermissionsContext = createContext<RolesPermissionsContextType | undefined>(undefined);

export const RolesPermissionsProvider = ({ children }: { children: ReactNode }) => {
  const [permisos, setPermisos] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recargar();
  }, []);

  const recargar = async () => {
    setLoading(true);
    try {
      const { data } = await supabaseBrowserClient.from("role_permissions").select("*");
      if (data) {
        const permisosMap: Record<string, Record<string, boolean>> = {};
        data.forEach((row: { rol: string; permisos: Record<string, boolean> }) => {
          permisosMap[row.rol] = row.permisos || {};
        });
        setPermisos(permisosMap);
      }
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
      setPermisos((prev) => ({ ...prev, [rol]: nuevoPermisos }));
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: String(error) };
    }
  };

  const tienePermiso = (rol: string | undefined, modulo: string): boolean => {
    if (!rol) return false;
    const permsRol = permisos[rol];
    if (!permsRol) return false;
    return permsRol[modulo] ?? false;
  };

  return (
    <RolesPermissionsContext.Provider value={{ permisos, loading, guardarPermisos, tienePermiso, recargar }}>
      {children}
    </RolesPermissionsContext.Provider>
  );
};

export const useRolesPermissions = () => {
  const ctx = useContext(RolesPermissionsContext);
  if (!ctx) throw new Error("useRolesPermissions debe usarse dentro de RolesPermissionsProvider");
  return ctx;
};
