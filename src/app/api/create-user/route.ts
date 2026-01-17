import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Error de servidor: Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno." },
        { status: 500 }
      );
    }

    // Cliente con permisos de administrador (solo en servidor)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();
    const { email, password, user_metadata, rol } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y password son requeridos" },
        { status: 400 }
      );
    }

    // Crear usuario en auth.users con privilegios de admin
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirmar email
      user_metadata: user_metadata || {},
    });

    if (authError) {
      console.error("Error creando usuario auth:", authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    // El trigger on_auth_user_created ya creó el perfil automáticamente
    // IMPLEMENTACIÓN ROBUSTA: Reintentos + Upsert para evitar condiciones de carrera
    let perfil = null;
    let intentos = 0;
    const maxIntentos = 3;

    while (!perfil && intentos < maxIntentos) {
      // Esperar progresivamente (500ms, 1000ms, 1500ms)
      await new Promise(resolve => setTimeout(resolve, 500 * (intentos + 1)));
      
      // Intentar actualizar si existe, o insertar si falló el trigger (Upsert)
      const { data, error } = await supabaseAdmin
        .from("perfiles")
        .upsert({
          id: authUser.user.id,
          email: email,
          rol: rol || "estudiante",
          identificacion: user_metadata?.identificacion,
          nombre_completo: user_metadata?.nombre_completo,
          telefono: user_metadata?.telefono,
          activo: user_metadata?.activo ?? true,
          notif_whatsapp: user_metadata?.notif_whatsapp ?? true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' }) // Si existe por ID, actualiza. Si no, crea.
        .select()
        .single();

      if (!error && data) {
        perfil = data;
      } else {
        console.warn(`Intento ${intentos + 1} fallido actualizando perfil:`, error?.message);
      }
      intentos++;
    }

    if (!perfil) {
      return NextResponse.json(
        { error: "El usuario se creó, pero hubo un error configurando su perfil. Por favor contacte soporte." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: authUser.user,
      perfil,
    });
  } catch (error: any) {
    console.error("Error en API create-user:", error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
