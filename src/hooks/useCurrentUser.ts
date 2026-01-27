import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowserClient } from "@utils/supabase/client";

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
  const queryClient = useQueryClient();
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
        return { id: authUser.id, email: authUser.email, rol: undefined };
      }

      // Si el campo rol viene vacío, intenta obtenerlo del authUser (por si acaso)
      return {
        id: perfil.id,
        email: perfil.email || authUser.email,
        rol: perfil.rol || authUser.role || undefined,
        nombre_completo: perfil.nombre_completo,
      };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    const { data: authListener } = supabaseBrowserClient.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabaseBrowserClient
      .channel(`perfil-rol-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "perfiles", filter: `id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }
      )
      .subscribe();

    return () => {
      supabaseBrowserClient.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  // Memorizamos el resultado para evitar re-renders innecesarios
  const result = useMemo(() => ({
    user: user ?? null,
    loading: isLoading
  }), [user, isLoading]);

  return result;
}
