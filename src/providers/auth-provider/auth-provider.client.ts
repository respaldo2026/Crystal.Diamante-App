import { supabaseBrowserClient as supabase } from "@utils/supabase/client";
import { AuthProvider } from "@refinedev/core";

export const authProviderClient: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    // La contraseña es la cédula por diseño de la academia
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email,
      password: password // La contraseña es la cédula
    });
    
    if (error) {
      return { success: false, error };
    }
    
    // Verificar el rol del usuario para redirigir correctamente
    if (data.user) {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("rol, nombre_completo")
        .eq("id", data.user.id)
        .maybeSingle();
      
      // Redirigir según el rol
      if (perfil?.rol === "profesor") {
        return { success: true, redirectTo: "/mi-oficina" };
      }
      
      if (perfil?.rol === "estudiante") {
        return { success: true, redirectTo: "/portal-estudiante" };
      }
    }
    
    // Por defecto para admin, director, administrativo o sin rol específico
    return { success: true, redirectTo: "/dashboard" };
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Error silencioso en logout
    }
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { authenticated: !!session, redirectTo: session ? undefined : "/login" };
  },

  getPermissions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    return data?.rol || null;
  },

  getIdentity: async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: perfil } = await supabase
      .from("perfiles")
      .select("nombre_completo, foto_url")
      .eq("id", authUser.id)
      .maybeSingle();

    return {
      ...authUser,
      name: perfil?.nombre_completo || authUser.email,
      avatar: perfil?.foto_url,
    };
  },

  onError: async (error: any) => {
    return { error };
  },
};

// Backwards-compatible named export used by layout.tsx
export const authProvider = authProviderClient;