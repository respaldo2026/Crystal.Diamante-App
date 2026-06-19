const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function daysAgoIso(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const since = daysAgoIso(14);
  const until = daysAgoIso(0);

  const { data: sesiones, error: sesionesErr } = await supabase
    .from("sesiones_clase")
    .select("id, curso_id, profesor_id, fecha, tema_visto, created_at")
    .gte("fecha", since)
    .lte("fecha", until)
    .order("fecha", { ascending: false });

  if (sesionesErr) throw sesionesErr;

  const cursoIds = Array.from(new Set((sesiones || []).map((s) => Number(s.curso_id)).filter(Number.isFinite)));

  const [{ data: cursos, error: cursosErr }, { data: matriculas, error: matriculasErr }] = await Promise.all([
    cursoIds.length
      ? supabase.from("cursos").select("id, nombre, profesor_id").in("id", cursoIds)
      : Promise.resolve({ data: [], error: null }),
    cursoIds.length
      ? supabase.from("matriculas").select("id, curso_id, estado").in("curso_id", cursoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cursosErr) throw cursosErr;
  if (matriculasErr) throw matriculasErr;

  const matriculaIds = Array.from(new Set((matriculas || []).map((m) => Number(m.id)).filter(Number.isFinite)));

  const { data: asistencias, error: asistErr } = await supabase
    .from("asistencias")
    .select("id, matricula_id, fecha, estado, created_at")
    .in("matricula_id", matriculaIds.length ? matriculaIds : [-1])
    .gte("fecha", since)
    .lte("fecha", until)
    .order("fecha", { ascending: false });

  if (asistErr) throw asistErr;

  const cursoById = new Map((cursos || []).map((c) => [Number(c.id), c]));
  const matriculasByCurso = new Map();
  for (const m of matriculas || []) {
    const cursoId = Number(m.curso_id);
    if (!matriculasByCurso.has(cursoId)) matriculasByCurso.set(cursoId, []);
    matriculasByCurso.get(cursoId).push(m);
  }

  const asistenciasByCursoFecha = new Map();
  const matriculaToCurso = new Map((matriculas || []).map((m) => [Number(m.id), Number(m.curso_id)]));
  for (const a of asistencias || []) {
    const cursoId = matriculaToCurso.get(Number(a.matricula_id));
    if (!cursoId) continue;
    const key = `${cursoId}|${String(a.fecha).slice(0, 10)}`;
    asistenciasByCursoFecha.set(key, (asistenciasByCursoFecha.get(key) || 0) + 1);
  }

  const summaryByProfesor = new Map();
  const gaps = [];

  for (const s of sesiones || []) {
    const cursoId = Number(s.curso_id);
    const fecha = String(s.fecha).slice(0, 10);
    const curso = cursoById.get(cursoId);
    const profId = String(s.profesor_id || curso?.profesor_id || "sin-profesor");
    const profSummary = summaryByProfesor.get(profId) || {
      profesor_id: profId,
      sesiones: 0,
      asistencias: 0,
      sesiones_sin_asistencia: 0,
      cursos: new Set(),
    };

    profSummary.sesiones += 1;
    profSummary.cursos.add(cursoId);

    const key = `${cursoId}|${fecha}`;
    const countAsistencias = asistenciasByCursoFecha.get(key) || 0;
    profSummary.asistencias += countAsistencias;

    if (countAsistencias === 0) {
      profSummary.sesiones_sin_asistencia += 1;
      gaps.push({
        fecha,
        curso_id: cursoId,
        curso_nombre: curso?.nombre || `Curso ${cursoId}`,
        profesor_id: profId,
        sesion_id: s.id,
      });
    }

    summaryByProfesor.set(profId, profSummary);
  }

  const resumen = Array.from(summaryByProfesor.values()).map((r) => ({
    profesor_id: r.profesor_id,
    cursos_distintos: r.cursos.size,
    sesiones_registradas_14d: r.sesiones,
    asistencias_registradas_14d: r.asistencias,
    sesiones_sin_asistencia_14d: r.sesiones_sin_asistencia,
  }));

  console.log("=== Verificacion sincronizacion profesoras (14 dias) ===");
  console.log(JSON.stringify({ since, until, total_sesiones: (sesiones || []).length, total_asistencias: (asistencias || []).length }, null, 2));
  console.log("\n=== Resumen por profesora ===");
  console.log(JSON.stringify(resumen, null, 2));
  console.log("\n=== Sesiones sin asistencias (top 30) ===");
  console.log(JSON.stringify(gaps.slice(0, 30), null, 2));
}

main().catch((e) => {
  console.error("Error en verificacion:", e);
  process.exit(1);
});
