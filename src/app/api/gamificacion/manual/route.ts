import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

const buildManualPlaceholderUrl = (titulo: string, cursoId: string, matriculaId: number, temaId: string) => {
  const texto = String(titulo || "Evidencia manual").trim().slice(0, 28) || "Evidencia manual";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" fill="none">
      <defs>
        <linearGradient id="bg" x1="80" y1="50" x2="1120" y2="750" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f8fafc"/>
          <stop offset="1" stop-color="#e2e8f0"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" rx="48" fill="url(#bg)"/>
      <rect x="76" y="72" width="1048" height="656" rx="36" fill="#ffffff" stroke="#cbd5e1" stroke-width="6"/>
      <circle cx="164" cy="168" r="42" fill="#dbeafe"/>
      <text x="228" y="182" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#0f172a">Evidencia manual</text>
      <text x="228" y="232" font-family="Arial, sans-serif" font-size="24" fill="#475569">Curso ${String(cursoId || "-")}</text>
      <text x="228" y="272" font-family="Arial, sans-serif" font-size="24" fill="#475569">Matrícula ${String(matriculaId || "-")}</text>
      <text x="228" y="312" font-family="Arial, sans-serif" font-size="24" fill="#475569">Tema ${String(temaId || "-")}</text>
      <rect x="110" y="396" width="980" height="184" rx="28" fill="#eff6ff"/>
      <text x="160" y="485" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#2563eb">${texto}</text>
      <text x="160" y="540" font-family="Arial, sans-serif" font-size="26" fill="#64748b">Asignada manualmente desde la tabla de gamificación</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "attendance") {
      const attendanceId = String(body?.attendanceId || body?.id || "").trim();
      const estado = String(body?.estado || "").trim().toLowerCase();
      const observaciones = body?.observaciones == null ? null : String(body.observaciones).trim() || null;

      if (!attendanceId) {
        return NextResponse.json({ error: "attendanceId es requerido" }, { status: 400 });
      }

      if (!estado) {
        return NextResponse.json({ error: "estado es requerido" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("asistencias")
        .update({ estado, observaciones })
        .eq("id", attendanceId)
        .select("id, matricula_id, fecha, estado, observaciones")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
      }

      return NextResponse.json({ ok: true, action: "attendance", data });
    }

    if (action === "task") {
      const matriculaId = Number(body?.matriculaId || body?.matricula_id || 0);
      const cursoId = Number(body?.cursoId || body?.curso_id || 0);
      const temaId = String(body?.temaId || body?.pensum_curso_id || "").trim();
      const estudianteId = String(body?.estudianteId || body?.estudiante_id || "").trim();
      const evidenciaUrl = String(body?.evidenciaUrl || body?.url_imagen || "").trim();
      const nombreArchivo = String(body?.nombreArchivo || body?.nombre_archivo || "").trim();
      const mimeType = String(body?.mimeType || body?.mime_type || "").trim();
      const storagePath = String(body?.storagePath || body?.storage_path || "").trim();

      if (!Number.isFinite(matriculaId) || matriculaId <= 0) {
        return NextResponse.json({ error: "matriculaId es requerido" }, { status: 400 });
      }

      if (!temaId) {
        return NextResponse.json({ error: "temaId es requerido" }, { status: 400 });
      }

      if (!Number.isFinite(cursoId) || cursoId <= 0) {
        return NextResponse.json({ error: "cursoId es requerido" }, { status: 400 });
      }

      const { data: existente, error: errExistente } = await supabaseAdmin
        .from("evidencias_tareas")
        .select("id")
        .eq("matricula_id", matriculaId)
        .eq("pensum_curso_id", temaId)
        .maybeSingle();

      if (errExistente) {
        return NextResponse.json({ error: errExistente.message, details: errExistente.details }, { status: 400 });
      }

      if (!evidenciaUrl && existente?.id) {
        const { error: errDelete } = await supabaseAdmin
          .from("evidencias_tareas")
          .delete()
          .eq("id", existente.id);

        if (errDelete) {
          return NextResponse.json({ error: errDelete.message, details: errDelete.details }, { status: 400 });
        }

        return NextResponse.json({ ok: true, action: "task_deleted", id: existente.id });
      }

      const urlFinal = evidenciaUrl || buildManualPlaceholderUrl(body?.tema || body?.titulo || "Evidencia manual", String(cursoId), matriculaId, temaId);
      const payload = {
        matricula_id: matriculaId,
        curso_id: cursoId,
        pensum_curso_id: temaId,
        estudiante_id: estudianteId,
        url_imagen: urlFinal,
        storage_path: storagePath || `manual/${cursoId}/${matriculaId}/${temaId}.svg`,
        nombre_archivo: nombreArchivo || (evidenciaUrl ? "evidencia-manual" : "evidencia-manual.svg"),
        mime_type: mimeType || (evidenciaUrl ? null : "image/svg+xml"),
        tamano_bytes: null,
      };

      if (existente?.id) {
        const { data, error } = await supabaseAdmin
          .from("evidencias_tareas")
          .update(payload)
          .eq("id", existente.id)
          .select("id, matricula_id, curso_id, pensum_curso_id, estudiante_id, url_imagen, storage_path, nombre_archivo, mime_type, tamano_bytes, created_at, updated_at")
          .single();

        if (error) {
          return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
        }

        return NextResponse.json({ ok: true, action: "task_updated", data });
      }

      const { data, error } = await supabaseAdmin
        .from("evidencias_tareas")
        .insert(payload)
        .select("id, matricula_id, curso_id, pensum_curso_id, estudiante_id, url_imagen, storage_path, nombre_archivo, mime_type, tamano_bytes, created_at, updated_at")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
      }

      return NextResponse.json({ ok: true, action: "task_created", data });
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Error procesando la edición manual" }, { status: 500 });
  }
}