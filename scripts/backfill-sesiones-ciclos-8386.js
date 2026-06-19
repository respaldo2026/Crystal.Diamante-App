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

const TARGET_COURSE_IDS = [83, 84, 85, 86];
const SESSIONS_TO_GENERATE = 20;
const DEFAULT_HOURS = 2;
const DEFAULT_TOPIC = "Sesion programada automaticamente para calculo de ciclos";
const DEFAULT_PAY_STATUS = "pendiente";
const CONFIRM_FLAG = process.env.ALLOW_AUTO_SESSIONS_BACKFILL;

function getBogotaTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  if (CONFIRM_FLAG !== "YES") {
    console.log("Backfill bloqueado por seguridad.");
    console.log("Para ejecutarlo de forma intencional usa: ALLOW_AUTO_SESSIONS_BACKFILL=YES node scripts/backfill-sesiones-ciclos-8386.js");
    return;
  }

  const todayIso = getBogotaTodayIso();

  const { data: cursos, error: cursosError } = await supabase
    .from("cursos")
    .select("id, nombre, profesor_id, estado, fecha_inicio")
    .in("id", TARGET_COURSE_IDS)
    .order("id", { ascending: true });

  if (cursosError) throw cursosError;
  if (!cursos || cursos.length === 0) {
    console.log("No se encontraron cursos objetivo.");
    return;
  }

  const { data: sesionesExistentes, error: sesionesError } = await supabase
    .from("sesiones_clase")
    .select("curso_id, fecha")
    .in("curso_id", TARGET_COURSE_IDS)
    .order("fecha", { ascending: true });

  if (sesionesError) throw sesionesError;

  const fechasPorCurso = new Map();
  const maxFechaPorCurso = new Map();

  for (const sesion of sesionesExistentes || []) {
    const cursoId = Number(sesion.curso_id);
    const fecha = String(sesion.fecha).slice(0, 10);

    if (!fechasPorCurso.has(cursoId)) fechasPorCurso.set(cursoId, new Set());
    fechasPorCurso.get(cursoId).add(fecha);

    const prev = maxFechaPorCurso.get(cursoId);
    if (!prev || fecha > prev) maxFechaPorCurso.set(cursoId, fecha);
  }

  const rowsToInsert = [];
  const skippedCourses = [];

  for (const curso of cursos) {
    const cursoId = Number(curso.id);
    const profesorId = curso.profesor_id;
    const estado = (curso.estado || "").toLowerCase();

    if (!profesorId) {
      skippedCourses.push({ cursoId, reason: "sin profesor_id" });
      continue;
    }

    if (estado && estado !== "activo") {
      skippedCourses.push({ cursoId, reason: `estado ${estado}` });
      continue;
    }

    const anchor =
      maxFechaPorCurso.get(cursoId) ||
      (curso.fecha_inicio ? String(curso.fecha_inicio).slice(0, 10) : todayIso);

    if (!fechasPorCurso.has(cursoId)) fechasPorCurso.set(cursoId, new Set());

    for (let n = 1; n <= SESSIONS_TO_GENERATE; n += 1) {
      const fechaSesion = addDaysIso(anchor, n * 7);
      if (fechaSesion < todayIso) continue;
      if (fechasPorCurso.get(cursoId).has(fechaSesion)) continue;

      fechasPorCurso.get(cursoId).add(fechaSesion);
      rowsToInsert.push({
        curso_id: cursoId,
        profesor_id: profesorId,
        fecha: fechaSesion,
        horas_dictadas: DEFAULT_HOURS,
        tema_visto: DEFAULT_TOPIC,
        estado_pago: DEFAULT_PAY_STATUS,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    console.log("No hay nuevas sesiones para insertar.");
    if (skippedCourses.length > 0) {
      console.log("Cursos omitidos:", skippedCourses);
    }
    return;
  }

  const { error: insertError } = await supabase.from("sesiones_clase").insert(rowsToInsert);
  if (insertError) throw insertError;

  console.log(`Insertadas ${rowsToInsert.length} sesiones nuevas.`);
  if (skippedCourses.length > 0) {
    console.log("Cursos omitidos:", skippedCourses);
  }
}

main().catch((error) => {
  console.error("Error en backfill:", error);
  process.exit(1);
});
