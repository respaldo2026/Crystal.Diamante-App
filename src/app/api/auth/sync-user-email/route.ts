import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SyncEmailBody = {
  userId?: string;
  email?: string;
};

const isValidEmail = (value: string): boolean => /.+@.+\..+/.test(value);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SyncEmailBody;
    const userId = String(body?.userId || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!userId) {
      return NextResponse.json({ error: "userId es obligatorio" }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getUserError || !authUser?.user) {
      return NextResponse.json({ error: "No se encontró usuario Auth para ese perfil" }, { status: 404 });
    }

    const currentEmail = String(authUser.user.email || "").trim().toLowerCase();
    if (currentEmail === email) {
      return NextResponse.json({ ok: true, updated: false, message: "Email ya sincronizado" });
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user.user_metadata || {}),
        email,
      },
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      user: {
        id: updatedUser.user?.id,
        email: updatedUser.user?.email,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 });
  }
}
