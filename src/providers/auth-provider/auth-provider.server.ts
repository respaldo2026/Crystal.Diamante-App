import { AuthBindings } from "@refinedev/core";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Proveedor de Autenticación para el Lado del Servidor
 * Este archivo se usa en Server Components y Middleware para validar acceso rápido.
 */
export const authProviderServer: AuthBindings = {
  check: async () => {
    const cookieStore = cookies();

    // Creamos el cliente de servidor para gestionar las cookies de sesión
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // MODO DESARROLLO: El servidor siempre dice que el usuario está "autenticado"
    // para evitar redirecciones infinitas al login.
    return {
      authenticated: true,
    };
  },

  // Estas funciones suelen ser dummies en el servidor ya que el cliente las maneja
  login: async () => ({ success: true }),
  logout: async () => ({ success: true }),
  getPermissions: async () => null,
  getIdentity: async () => null,
  onError: async (error) => ({ error }),
};