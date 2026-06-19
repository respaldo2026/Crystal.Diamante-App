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

const AUTO_TOPIC = "Sesion programada automaticamente para calculo de ciclos";
const TARGET_COURSES = [83, 84, 85, 86];

async function main() {
  const { data: toDelete, error: scanError } = await supabase
    .from("sesiones_clase")
    .select("id, curso_id, fecha, tema_visto")
    .in("curso_id", TARGET_COURSES)
    .ilike("tema_visto", `%${AUTO_TOPIC}%`)
    .order("curso_id", { ascending: true })
    .order("fecha", { ascending: true });

  if (scanError) throw scanError;

  const rows = toDelete || [];
  console.log(`Detectadas ${rows.length} sesiones auto-generadas para limpiar.`);
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id).filter(Boolean);
  const { error: deleteError } = await supabase.from("sesiones_clase").delete().in("id", ids);
  if (deleteError) throw deleteError;

  console.log(`Eliminadas ${ids.length} sesiones auto-generadas.`);
}

main().catch((error) => {
  console.error("Error limpiando sesiones auto-generadas:", error);
  process.exit(1);
});
