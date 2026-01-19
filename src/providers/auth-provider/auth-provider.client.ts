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
      console.error("❌ Error en login:", error);
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
      
      if (perfil?.rol === "admin" || perfil?.rol === "administrativo" || perfil?.rol === "director") {
        return { success: true, redirectTo: "/" };
      }
      
      if (perfil?.rol === "estudiante") {
        return { success: true, redirectTo: "/portal-estudiante" };
      }
    }
    
    return { success: true, redirectTo: "/" };
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
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
    const { data } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();
    return data?.rol || null;
  },

  getIdentity: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { ...user, name: user.email };
    return null;
  },

  onError: async (error: any) => {
    console.error("Client Auth Error:", error);
    return { error };
  },
};

// Backwards-compatible named export used by layout.tsx
export const authProvider = authProviderClient;