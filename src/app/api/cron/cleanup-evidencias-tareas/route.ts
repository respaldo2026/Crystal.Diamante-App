import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const isAuthorizedCronRequest = (request: NextRequest) => {
  const apiKey = request.headers.get("x-api-key") || "";
  const authHeader = request.headers.get("authorization") || "";
  const validApiKey = process.env.CRON_API_KEY || "";
  const validSecret = process.env.CRON_SECRET || "";

  if (validApiKey && apiKey && apiKey === validApiKey) {
    return true;
  }

  if (validSecret && authHeader === `Bearer ${validSecret}`) {
    return true;
  }

  return false;
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const cutoffIso = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30 * 6)).toISOString();

    const { data: rows, error: readError } = await supabaseAdmin
      .from("evidencias_tareas")
      .select("id, storage_path")
      .lt("updated_at", cutoffIso)
      .limit(5000);

    if (readError) {
      return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    }

    const evidencias = rows || [];
    if (!evidencias.length) {
      return NextResponse.json({ ok: true, removed: 0, storageDeleted: 0 });
    }

    const storagePaths = evidencias
      .map((item: any) => String(item?.storage_path || ""))
      .filter(Boolean);

    let storageDeleted = 0;
    if (storagePaths.length > 0) {
      for (let i = 0; i < storagePaths.length; i += 100) {
        const batch = storagePaths.slice(i, i + 100);
        const { error: storageError } = await supabaseAdmin.storage
          .from("evidencias-tareas")
          .remove(batch);

        if (!storageError) {
          storageDeleted += batch.length;
        }
      }
    }

    const ids = evidencias
      .map((item: any) => Number(item?.id))
      .filter((id) => Number.isFinite(id));

    const { error: deleteError } = await supabaseAdmin
      .from("evidencias_tareas")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      removed: ids.length,
      storageDeleted,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Error interno" }, { status: 500 });
  }
}
