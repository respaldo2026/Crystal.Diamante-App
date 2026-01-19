import { useEffect, useState } from "react";
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

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Obtener usuario autenticado
        const { data: { user: authUser }, error: authError } = await supabaseBrowserClient.auth.getUser();
        
        if (authError || !authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Obtener perfil con rol
        const { data: perfil, error } = await supabaseBrowserClient
          .from("perfiles")
          .select("id, email, rol, nombre_completo")
          .eq("id", authUser.id)
          .maybeSingle();

        if (error) {
          console.error("Error fetching perfil:", error);
          setUser({ id: authUser.id, email: authUser.email });
        } else if (perfil) {
          setUser({
            id: perfil.id,
            email: perfil.email || authUser.email,
            rol: perfil.rol,
            nombre_completo: perfil.nombre_completo,
          });
        } else {
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
