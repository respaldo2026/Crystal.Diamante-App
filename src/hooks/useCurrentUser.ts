import { useEffect, useState, useRef } from "react";
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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Si ya hemos hecho fetch, no repetir
    if (fetchedRef.current) return;

    const fetchUser = async () => {
      try {
        fetchedRef.current = true;
        
        // Obtener usuario autenticado
        const { data: { user: authUser } } = await supabaseBrowserClient.auth.getUser();
        
        if (!authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Obtener perfil con rol (con timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        try {
          const { data: perfil, error } = await supabaseBrowserClient
            .from("perfiles")
            .select("id, email, rol, nombre_completo")
            .eq("id", authUser.id)
            .single();

          clearTimeout(timeoutId);

          if (error || !perfil) {
            setUser({ id: authUser.id, email: authUser.email });
          } else {
            setUser({
              id: perfil.id,
              email: perfil.email || authUser.email,
              rol: perfil.rol,
              nombre_completo: perfil.nombre_completo,
            });
          }
        } catch (timeoutError) {
          clearTimeout(timeoutId);
          // Si timeout, usa datos básicos
          setUser({ id: authUser.id, email: authUser.email });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return { user, loading };
}
