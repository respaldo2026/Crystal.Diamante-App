import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente con permisos de administrador (solo en servidor)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function POST(request: NextRequest) {
  try {
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
    // Esperamos un momento para que el trigger termine
    await new Promise(resolve => setTimeout(resolve, 500));

    // Actualizar el perfil con los datos completos
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .update({
        email: email,
        rol: rol || "estudiante",
        ...user_metadata,
      })
      .eq("id", authUser.user.id)
      .select()
      .single();

    if (perfilError) {
      console.error("Error actualizando perfil:", perfilError);
      // No eliminamos el usuario porque el perfil ya existe
      return NextResponse.json(
        { error: "Error actualizando perfil: " + perfilError.message },
        { status: 400 }
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
