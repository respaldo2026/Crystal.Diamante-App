import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente con service role bypasea RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    console.log("[API cursos/create] Datos recibidos:", body);

    // Insertar usando service role (bypasea RLS)
    const { data, error } = await supabaseAdmin
      .from("cursos")
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error("[API cursos/create] Error Supabase:", error);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }

    console.log("[API cursos/create] ✅ Grupo creado:", data.id);
    return NextResponse.json({ data });

  } catch (err: any) {
    console.error("[API cursos/create] Error general:", err);
    return NextResponse.json(
      { error: err.message || "Error al crear el grupo" },
      { status: 500 }
    );
  }
}
