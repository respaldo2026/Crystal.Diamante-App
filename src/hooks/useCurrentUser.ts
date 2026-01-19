import { useQuery } from "@tanstack/react-query";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useMemo } from "react";

export interface CurrentUser {
  id: string;
  email?: string;
  rol?: string;
  nombre_completo?: string;
}

/**
 * Hook para obtener el usuario actual y su información de rol
 * Optimizado para evitar llamadas duplicadas
 */
export function useCurrentUser() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: { user: authUser } } = await supabaseBrowserClient.auth.getUser();
      
      if (!authUser) return null;

      const { data: perfil, error } = await supabaseBrowserClient
        .from("perfiles")
        .select("id, email, rol, nombre_completo")
        .eq("id", authUser.id)
        .maybeSingle();

      if (error || !perfil) {
        return { id: authUser.id, email: authUser.email };
      }

      return {
        id: perfil.id,
        email: perfil.email || authUser.email,
        rol: perfil.rol,
        nombre_completo: perfil.nombre_completo,
      };
    },
    staleTime: 1000 * 60 * 5, // El perfil se considera fresco por 5 minutos
    retry: 1,
  });

  // Memorizamos el resultado para evitar re-renders innecesarios
  const result = useMemo(() => ({
    user: user ?? null,
    loading: isLoading
  }), [user, isLoading]);

  return result;
}
