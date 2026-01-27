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
        const { data: perfil } = await supabaseBrowserClient
          .from("perfiles")
          .select("rol")
          .eq("id", data.user.id)
          .single();

        let redirectTo = "/";
        
        if (perfil?.rol === "profesor") {
          redirectTo = "/mi-oficina";
        } else if (perfil?.rol === "estudiante") {
          redirectTo = "/portal-estudiante";
        } else if (perfil?.rol === "secretaria") {
          redirectTo = "/dashboard/secretaria";
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
      
      if (user) {
        const { data: perfil } = await supabaseBrowserClient
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

  onError: async (error: any) => {
    if (error instanceof Error) {
      return { error };
    }
    return { 
      error: new Error(typeof error === 'string' ? error : JSON.stringify(error))
    };
  },
};