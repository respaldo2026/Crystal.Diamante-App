import type { AuthBindings } from "@refinedev/core";
import { supabaseBrowserClient as supabase } from "@utils/supabase/client";

export const authProvider: AuthBindings = {
  login: async ({ email, password }: { email: string; password: string }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
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
        // Obtener el perfil del usuario para conocer su rol
        const { data: perfil } = await supabase
          .from("perfiles")
          .select("rol")
          .eq("id", data.user.id)
          .single();

        // Redirigir según el rol
        let redirectTo = "/";
        
        if (perfil?.rol === "profesor") {
          redirectTo = "/mi-oficina";
        } else if (perfil?.rol === "estudiante") {
          redirectTo = "/portal-estudiante";
        } else if (perfil?.rol === "admin" || perfil?.rol === "director") {
          redirectTo = "/"; // Dashboard principal con métricas
        } else if (perfil?.rol === "administrativo") {
          redirectTo = "/"; // Dashboard o primera página con permisos
        }

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
    const { error } = await supabase.auth.signOut();
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        return {
          authenticated: true,
        };
      }

      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
      };
    } catch (error: any) {
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: perfil } = await supabase
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: perfil } = await supabase
          .from("perfiles")
          .select("nombre_completo, email, rol, foto_url")
          .eq("id", user.id)
          .single();

        if (perfil) {
          return {
            id: user.id,
            name: perfil.nombre_completo,
            email: perfil.email || user.email,
            avatar: perfil.foto_url,
            rol: perfil.rol,
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  },

  onError: async (error: unknown) => {
    console.error(error);
    return { error };
  },
};