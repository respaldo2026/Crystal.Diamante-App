import { createBrowserClient } from "@supabase/ssr";

// Inicialización del cliente de Supabase para el navegador
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const authProviderClient: any = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
    await supabase.auth.signOut();
    return { success: true, redirectTo: "/login" };
  },

  // MODO DESARROLLO: Siempre permite el acceso en el navegador
  check: async () => {
    // Intentamos refrescar la sesión pero siempre devolvemos true
    await supabase.auth.getSession();
    return {
      authenticated: true,
    };
  },

  getPermissions: async () => null,

  getIdentity: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { ...user, name: user.email };
    return {
      id: "dev-user",
      name: "Admin Academia",
      avatar: "https://i.pravatar.cc/150",
    };
  },

  onError: async (error: any) => {
    console.error("Client Auth Error:", error);
    return { error };
  },
};

// Backwards-compatible named export used by layout.tsx
export const authProvider = authProviderClient;