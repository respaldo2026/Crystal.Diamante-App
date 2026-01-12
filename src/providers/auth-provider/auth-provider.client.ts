import { supabaseBrowserClient as supabase } from "@utils/supabase/client";

export const authProviderClient: any = {
  login: async ({ email, password }: { email: string; password: string }) => {
    // Email es el correo del usuario, password es la cédula
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email,
      password: password // La contraseña es la cédula
    });
    
    if (error) return { success: false, error };
    
    // Verificar el rol del usuario
    if (data.user) {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("id", data.user.id)
        .single();
      
      // Redirigir según el rol
      if (perfil?.rol === "profesor") {
        return { success: true, redirectTo: "/mi-oficina" };
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

  // MODO DESARROLLO: Siempre permite el acceso en el navegador
  check: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { authenticated: !!session };
  },

  getPermissions: async () => null,

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