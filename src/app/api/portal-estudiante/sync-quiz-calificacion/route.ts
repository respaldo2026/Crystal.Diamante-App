import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/utils/supabase/admin";

type SyncQuizCalificacionBody = {
  quizId?: string;
  matriculaId?: number;
  calificacion?: number;
  respuestasCorrectas?: number;
  totalPreguntas?: number;
  enviadoAt?: string;
};

const buildObservacion = (respuestasCorrectas: number, totalPreguntas: number) =>
  `Quiz: ${respuestasCorrectas}/${totalPreguntas} correctas`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SyncQuizCalificacionBody;
    const quizId = String(body?.quizId || "").trim();
    const matriculaId = Number(body?.matriculaId);
    const calificacion = Number(body?.calificacion);
    const respuestasCorrectas = Number(body?.respuestasCorrectas || 0);
    const totalPreguntas = Number(body?.totalPreguntas || 0);
    const enviadoAt = String(body?.enviadoAt || new Date().toISOString()).trim();

    if (!quizId || !Number.isFinite(matriculaId) || !Number.isFinite(calificacion)) {
      return NextResponse.json({ error: "quizId, matriculaId y calificacion son obligatorios" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id || null;

    if (authError || !authUserId) {
      return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
    }

    const { data: matricula, error: matriculaError } = await supabaseAdmin
      .from("matriculas")
      .select("id, estudiante_id")
      .eq("id", matriculaId)
      .maybeSingle();

    if (matriculaError || !matricula) {
      return NextResponse.json({ error: "No se encontró la matrícula del quiz" }, { status: 404 });
    }

    if (String(matricula.estudiante_id || "") !== authUserId) {
      return NextResponse.json({ error: "No autorizado para sincronizar esta calificación" }, { status: 403 });
    }

    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes_clase")
      .select("id, titulo, pensum_curso_id")
      .eq("id", quizId)
      .maybeSingle();

    if (quizError || !quiz) {
      return NextResponse.json({ error: "No se encontró el quiz" }, { status: 404 });
    }

    const concepto = `Quiz de clase: ${String(quiz.titulo || "Quiz").trim() || "Quiz"}`;
    const payload = {
      matricula_id: matriculaId,
      tema_id: quiz.pensum_curso_id || null,
      concepto,
      nota: calificacion,
      calificacion,
      tipo_evaluacion: "quiz",
      fecha_evaluacion: enviadoAt.slice(0, 10),
      observaciones: buildObservacion(respuestasCorrectas, totalPreguntas),
    };

    let updateQuery = supabaseAdmin
      .from("calificaciones")
      .update(payload)
      .eq("matricula_id", matriculaId)
      .eq("tipo_evaluacion", "quiz");

    if (quiz.pensum_curso_id) {
      updateQuery = updateQuery.eq("tema_id", quiz.pensum_curso_id);
    } else {
      updateQuery = updateQuery.eq("concepto", concepto);
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select("id");

    if (updateError) {
      return NextResponse.json({ error: updateError.message, details: updateError.details }, { status: 400 });
    }

    if ((updatedRows || []).length === 0) {
      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from("calificaciones")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message, details: insertError.details }, { status: 400 });
      }

      return NextResponse.json({ ok: true, calificacionId: insertedRow.id, synced: "inserted" });
    }

    return NextResponse.json({ ok: true, calificacionId: updatedRows?.[0]?.id || null, synced: "updated" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Error interno sincronizando calificación" }, { status: 500 });
  }
}