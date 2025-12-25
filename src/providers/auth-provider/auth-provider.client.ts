import { AuthBindings } from "@refinedev/core";
import { createBrowserClient } from "@supabase/ssr";

// Inicialización del cliente de Supabase para el navegador
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Proveedor de Autenticación para el Lado del Cliente (Browser)
 * Este archivo controla la interfaz de usuario en Refine.
 */
export const authProviderClient: AuthBindings = {
  login: async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error };
    return { success: true, redirectTo: "/dashboard" };
  },

  logout: async () => {
    await supabase.auth.signOut();
    return { success: true, redirectTo: "/login" };
  },

  // MODO DESARROLLO: Siempre permite el acceso en el navegador
  check: async () => {
    // Intentamos refrescar la sesión pero siempre devolvemoms true
    await supabase.auth.getSession();
    return {
      authenticated: true,
    };
  },

  getPermissions: async () => null,

  getIdentity: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { ...user, name: user.email };
    
    // Identidad genérica para que la interfaz no se rompa si no hay sesión real
    return { 
      id: "dev-user", 
      name: "Admin Academia", 
      avatar: "https://i.pravatar.cc/150" 
    };
  },

  onError: async (error) => {
    console.error("Client Auth Error:", error);
    return { error };
  },
};