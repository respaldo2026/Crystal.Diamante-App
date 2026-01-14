import { supabaseBrowserClient as supabase } from "@utils/supabase/client";

export const authProviderClient: any = {
  login: async ({ email, password }: { email: string; password: string }) => {
    console.log("🔐 Intentando login con email:", email);
    
    // Email es el correo del usuario, password es la cédula
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email,
      password: password // La contraseña es la cédula
    });
    
    if (error) {
      console.error("❌ Error en login:", error);
      return { success: false, error };
    }
    
    console.log("✅ Login exitoso, usuario:", data.user?.email);
    
    // Verificar el rol del usuario para redirigir correctamente
    if (data.user) {
      const { data: perfil, error: perfilError } = await supabase
        .from("perfiles")
        .select("rol, nombre_completo")
        .eq("id", data.user.id)
        .maybeSingle();
      
      if (perfilError) {
        console.error("⚠️ Error obteniendo perfil:", perfilError);
      } else if (perfil) {
        console.log("👤 Perfil encontrado:", perfil?.nombre_completo, "- Rol:", perfil?.rol);
      } else {
        console.warn("ℹ️ Perfil no encontrado para el usuario; usando redirección por defecto");
      }
      
      // Redirigir según el rol
      if (perfil?.rol === "profesor") {
        console.log("🎓 Redirigiendo a /mi-oficina (Profesor)");
        return { success: true, redirectTo: "/mi-oficina" };
      }
      
      if (perfil?.rol === "administrativo") {
        console.log("🏢 Redirigiendo a / (Administrativo - Dashboard)");
        return { success: true, redirectTo: "/" };
      }
      
      if (perfil?.rol === "estudiante") {
        console.log("📚 Redirigiendo a /estudiantes/show (Estudiante)");
        return { success: true, redirectTo: `/estudiantes/show/${data.user.id}` };
      }
    }
    
    console.log("🏠 Redirigiendo a / (default)");
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