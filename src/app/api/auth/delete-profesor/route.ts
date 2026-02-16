import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId es requerido" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: "Faltan llaves de Supabase" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: cursosError } = await supabaseAdmin
      .from("cursos")
      .update({ profesor_id: null })
      .eq("profesor_id", userId);
    if (cursosError) throw cursosError;

    const { error: clasesError } = await supabaseAdmin
      .from("clases")
      .update({ profesor_id: null })
      .eq("profesor_id", userId);
    if (clasesError) throw clasesError;

    const { error: sesionesError } = await supabaseAdmin
      .from("sesiones_clase")
      .update({ profesor_id: null })
      .eq("profesor_id", userId);
    if (sesionesError) throw sesionesError;

    const { error: pagosProfesoresError } = await supabaseAdmin
      .from("pagos_profesores")
      .delete()
      .eq("profesor_id", userId);
    if (pagosProfesoresError) throw pagosProfesoresError;

    const { error: pagosNominaError } = await supabaseAdmin
      .from("pagos_nomina")
      .delete()
      .eq("profesor_id", userId);
    if (pagosNominaError) throw pagosNominaError;

    const { error: infoError } = await supabaseAdmin
      .from("profesores_info")
      .delete()
      .eq("perfil_id", userId);
    if (infoError) throw infoError;

    const { error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .delete()
      .eq("id", userId);
    if (perfilError) throw perfilError;

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) {
      const msg = String(authErr.message || "").toLowerCase();
      if (!msg.includes("not exist") && !msg.includes("not found")) {
        throw authErr;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("🔴 Error borrando profesor:", error);
    return NextResponse.json({ success: false, error: error?.message || "Error desconocido" }, { status: 500 });
  }
}
