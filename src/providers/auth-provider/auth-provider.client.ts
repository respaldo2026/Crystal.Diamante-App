import type { AuthProvider } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const { data, error } = await supabaseBrowserClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error: {
            name: "LoginError",
            message: error.message,
          },
        };
      }

      if (data?.user) {
        const { data: perfil, error: perfilError } = await supabaseBrowserClient
          .from("perfiles")
          .select("rol, email")
          .eq("id", data.user.id)
          .maybeSingle();

        const perfilEmail = (perfil?.email || "").toLowerCase();
        const authEmail = (data.user.email || "").toLowerCase();

        if (perfilError || !perfil || !perfilEmail || perfilEmail !== authEmail) {
          await supabaseBrowserClient.auth.signOut();
          return {
            success: false,
            error: {
              name: "LoginError",
              message: "Solo puedes iniciar sesion con el correo registrado en tu ficha de inscripcion.",
            },
          };
        }

        console.log("[AUTH] Login - User ID:", data.user.id);
        console.log("[AUTH] Login - Perfil Error:", perfilError);
        console.log("[AUTH] Login - Perfil Data:", perfil);
        console.log("[AUTH] Login - Perfil.rol:", perfil?.rol);

        let redirectTo = "/";
        
        // If we can read the profile, use role-based redirect
        if (!perfilError && perfil) {
          if (perfil.rol === "profesor") {
            redirectTo = "/mi-oficina";
            console.log("[AUTH] Redirecting to profesor panel: /mi-oficina");
          } else if (perfil.rol === "estudiante") {
            redirectTo = "/portal-estudiante";
          } else if (perfil.rol === "secretaria") {
            redirectTo = "/dashboard/secretaria";
          } else if (perfil.rol === "admin" || perfil.rol === "director") {
            redirectTo = "/";
          } else if (perfil.rol === "administrativo") {
            redirectTo = "/";
          }
        } else if (perfilError) {
          // If RLS blocks reading perfiles, still allow login but redirect to home
          console.warn("[AUTH] Could not fetch user role from perfiles:", perfilError.message);
        }

        console.log("[AUTH] Final redirectTo:", redirectTo);
        return {
          success: true,
          redirectTo,
        };
      }

      return {
        success: false,
        error: {
          name: "LoginError",
          message: "No se pudo obtener los datos del usuario",
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: error?.message || "Error desconocido",
        },
      };
    }
  },

  logout: async () => {
    const { error } = await supabaseBrowserClient.auth.signOut();
    if (error) {
      return {
        success: false,
        error: {
          name: "LogoutError",
          message: error.message,
        },
      };
    }

    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    try {
      const { data: { session }, error } = await supabaseBrowserClient.auth.getSession();
      
      if (error) {
        console.error("Auth Check Error:", error);
        return {
          authenticated: false,
          redirectTo: "/login",
          logout: true,
        };
      }

      if (session) {
        return {
          authenticated: true,
        };
      }

      // Sin sesión, redirigir
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
      };
    } catch (error: any) {
      console.error("Auth Check Exception:", error);
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
        error: {
          name: "CheckError",
          message: error?.message || "Error al verificar sesión",
        },
      };
    }
  },

  getPermissions: async () => {
    try {
      const { data: { user } } = await supabaseBrowserClient.auth.getUser();
      
      if (user) {
        const { data: perfil } = await supabaseBrowserClient
          .from("perfiles")
          .select("rol")
          .eq("id", user.id)
          .single();

        return perfil?.rol || null;
      }

      return null;
    } catch (error) {
      return null;
    }
  },

  getIdentity: async () => {
    try {
      const { data: { user } } = await supabaseBrowserClient.auth.getUser();
      
      console.log("[AUTH] getIdentity - Current user:", user?.id);
      
      if (user) {
        console.log("[AUTH] getIdentity - Querying perfiles table with id:", user.id);
        const { data: perfil, error } = await supabaseBrowserClient
          .from("perfiles")
          .select("nombre_completo, email, rol, foto_url")
          .eq("id", user.id)
          .maybeSingle();

        console.log("[AUTH] getIdentity - Perfil fetch error:", error);
        console.log("[AUTH] getIdentity - Perfil data:", perfil);
        console.log("[AUTH] getIdentity - Raw query result:", { perfil, error });

        // If RLS is blocking, return a basic identity with auth user data
        if (error) {
          console.warn("[AUTH] Error fetching perfiles:", error.message);
          return {
            id: user.id,
            name: user.user_metadata?.full_name || user.email,
            email: user.email,
          };
        }

        if (perfil) {
          const identity = {
            id: user.id,
            name: perfil.nombre_completo,
            email: perfil.email || user.email,
            avatar: perfil.foto_url,
            rol: perfil.rol,
          };
          console.log("[AUTH] getIdentity - Returning:", identity);
          return identity;
        }

        console.warn("[AUTH] No perfil found for user:", user.id);
        // Profile doesn't exist, return basic auth identity
        return {
          id: user.id,
          name: user.email,
          email: user.email,
        };
      }

      return null;
    } catch (error) {
      console.warn("[AUTH] getIdentity error:", error);
      return null;
    }
  },

  onError: async (error: any) => {
    if (error instanceof Error) {
      return { error };
    }
    return { 
      error: new Error(typeof error === 'string' ? error : JSON.stringify(error))
    };
  },
};