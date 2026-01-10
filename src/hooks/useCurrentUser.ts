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
          // Modo dev: habilitar admin temporal para poder probar flujos sin login real
          console.warn("No auth user found; enabling temporary dev admin");
          setUser({ id: "dev-admin", email: "dev@local", rol: "admin", nombre_completo: "Dev Admin" });
          setLoading(false);
          return;
        }

        console.log("Auth user found:", authUser.id);

        // Obtener perfil con rol (sin timeout para permitir conexión lenta)
        const { data: perfil, error } = await supabaseBrowserClient
          .from("perfiles")
          .select("id, email, rol, nombre_completo")
          .eq("id", authUser.id)
          .single();

        console.log("Profile query result:", { perfil, error });

        if (error) {
          console.error("Error fetching perfil:", error);
          // Aún así retorna usuario básico
          setUser({ id: authUser.id, email: authUser.email });
        } else if (perfil) {
          console.log("Setting user with rol:", perfil.rol);
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
