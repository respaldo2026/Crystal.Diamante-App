import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WhatsAppService } from "@/services/whatsapp-service";

export const runtime = "nodejs";

const AUDIT_MARKER = "[SISTEMA] Alerta materiales ciclo (7d)";
const DEFAULT_ALERT_PHONE = "3006402575";
const DEFAULT_DAYS_AHEAD = 7;
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_ALERTA_MAX_GRUPOS_POR_CORRIDA || 20);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_ALERTA_DELAY_MS || 900);
const TEMPLATE_NAME = String(process.env.WHATSAPP_TEMPLATE_ALERTA_MATERIALES || "").trim();
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_ALERTA_MATERIALES_LANG || "es_CO").trim();
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_ALERTA_ALLOW_TEXT_FALLBACK || "true").toLowerCase() === "true";

type GrupoConPensum = {
  grupo_id: number;
  grupo_nombre: string;
  programa_id: number;
  programa_nombre: string;
  pensum_id: string;
  numero_ciclo: number | null;
  nombre_ciclo: string | null;
  fecha_inicio: string;
  estado: string | null;
};

type MaterialCiclo = {
  id: string;
  pensum_id: string;
  nombre: string;
  cantidad: string | null;
  orden: number | null;
  activo: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthorized(request: NextRequest): boolean {
  const apiKeyHeader = request.headers.get("x-api-key");
  const cronApiKey = process.env.CRON_API_KEY;
  if (cronApiKey && apiKeyHeader && apiKeyHeader === cronApiKey) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

function formatDateEs(value?: string | null): string {
  if (!value) return "Por confirmar";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

function getTargetDateIso(daysAhead: number): string {
  const bogotaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  bogotaNow.setHours(0, 0, 0, 0);
  bogotaNow.setDate(bogotaNow.getDate() + daysAhead);

  const y = bogotaNow.getFullYear();
  const m = String(bogotaNow.getMonth() + 1).padStart(2, "0");
  const d = String(bogotaNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildAlertKey(item: GrupoConPensum): string {
  return `grupo:${item.grupo_id}|pensum:${item.pensum_id}|fecha:${item.fecha_inicio}`;
}

function buildAlertMessage(item: GrupoConPensum, materiales: MaterialCiclo[], daysAhead: number): string {
  const cicloLabel = item.nombre_ciclo || (item.numero_ciclo ? `Ciclo ${item.numero_ciclo}` : "Ciclo sin nombre");
  const fechaInicio = formatDateEs(item.fecha_inicio);
  const materialesTexto = materiales.length
    ? materiales
        .slice(0, 40)
        .map((mat, idx) => {
          const cantidad = String(mat.cantidad || "").trim();
          return `${idx + 1}. ${mat.nombre}${cantidad ? ` (${cantidad})` : ""}`;
        })
        .join("\n")
    : "Sin materiales configurados en este ciclo.";

  const key = buildAlertKey(item);

  return [
    `🚨 *Alerta de abastecimiento* (${daysAhead} días)`,
    "",
    `En *${daysAhead} días* inicia un nuevo ciclo:`,
    `• *Grupo:* ${item.grupo_nombre || `Grupo ${item.grupo_id}`}`,
    `• *Programa:* ${item.programa_nombre || `Programa ${item.programa_id}`}`,
    `• *Ciclo:* ${cicloLabel}`,
    `• *Fecha de inicio:* ${fechaInicio}`,
    item.estado ? `• *Estado del grupo:* ${item.estado}` : "",
    "",
    `🧰 *Materiales requeridos (${materiales.length})*`,
    materialesTexto,
    "",
    `Clave alerta: ${key}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTemplateVariables(item: GrupoConPensum, materiales: MaterialCiclo[], daysAhead: number): string[] {
  const cicloLabel = item.nombre_ciclo || (item.numero_ciclo ? `Ciclo ${item.numero_ciclo}` : "Ciclo sin nombre");
  const fechaInicio = formatDateEs(item.fecha_inicio);
  const materialesTexto = materiales.length
    ? materiales
        .slice(0, 40)
        .map((mat, idx) => {
          const cantidad = String(mat.cantidad || "").trim();
          return `${idx + 1}. ${mat.nombre}${cantidad ? ` (${cantidad})` : ""}`;
        })
        .join("; ")
    : "Sin materiales configurados en este ciclo.";

  return [
    String(daysAhead),
    item.grupo_nombre || `Grupo ${item.grupo_id}`,
    item.programa_nombre || `Programa ${item.programa_id}`,
    cicloLabel,
    fechaInicio,
    materialesTexto,
  ];
}

async function wasAlreadySent(supabase: any, alertKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .select("id")
    .eq("user_message", AUDIT_MARKER)
    .ilike("agent_response", `%${alertKey}%`)
    .limit(1);

  if (error) {
    console.warn("[Cron Alerta Materiales] No se pudo validar duplicado por key:", alertKey, error);
    return false;
  }

  return Boolean((data || []).length);
}

async function saveAudit(
  supabase: any,
  input: {
    phone: string;
    message: string;
    messageId?: string;
  },
): Promise<void> {
  try {
    const payload = {
      phone_number: input.phone,
      user_message: AUDIT_MARKER,
      agent_response: `${input.message}\n\nMeta Message ID: ${input.messageId || "sin ID"}`,
      transcription: null,
      channel: "whatsapp",
      profile_name: "Alerta interna de materiales",
    };

    let { error } = await supabase.from("agent_conversations").insert(payload);

    if (error && /column .* does not exist/i.test(String(error.message || ""))) {
      const fallbackPayload = {
        phone_number: payload.phone_number,
        user_message: payload.user_message,
        agent_response: payload.agent_response,
        transcription: null,
      };
      const retry = await supabase.from("agent_conversations").insert(fallbackPayload);
      error = retry.error;
    }

    if (error) {
      console.warn("[Cron Alerta Materiales] Error guardando auditoría:", error);
    }
  } catch (error) {
    console.warn("[Cron Alerta Materiales] Excepción guardando auditoría:", error);
  }
}

async function runAlertaMaterialesCiclo() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Faltan variables de Supabase para ejecutar la alerta de materiales");
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const daysAhead = Number(process.env.WHATSAPP_ALERTA_DIAS_ANTICIPACION || DEFAULT_DAYS_AHEAD);
    const targetDate = getTargetDateIso(daysAhead);
    const alertPhone = String(process.env.WHATSAPP_ALERTA_MATERIALES_PHONE || DEFAULT_ALERT_PHONE).trim();

    const { data: gruposRaw, error: gruposError } = await supabase
      .from("v_grupos_con_pensum")
      .select("grupo_id, grupo_nombre, programa_id, programa_nombre, pensum_id, numero_ciclo, nombre_ciclo, fecha_inicio, estado")
      .eq("fecha_inicio", targetDate)
      .order("programa_nombre", { ascending: true })
      .order("grupo_nombre", { ascending: true });

    if (gruposError) throw gruposError;

    const grupos = (gruposRaw || []) as GrupoConPensum[];
    if (grupos.length === 0) {
      return NextResponse.json({
        success: true,
        mensaje: `Sin ciclos por iniciar el ${targetDate}`,
        targetDate,
        enviados: 0,
      });
    }

    const gruposUnicos = Array.from(
      new Map(
        grupos
          .filter((item) => item?.grupo_id && item?.pensum_id)
          .map((item) => [`${item.grupo_id}|${item.pensum_id}|${item.fecha_inicio}`, item]),
      ).values(),
    );

    const pensumIds = Array.from(new Set(gruposUnicos.map((item) => String(item.pensum_id)).filter(Boolean)));

    const { data: materialesRaw, error: materialesError } = await supabase
      .from("materiales_ciclo")
      .select("id, pensum_id, nombre, cantidad, orden, activo")
      .in("pensum_id", pensumIds)
      .eq("activo", true)
      .order("pensum_id", { ascending: true })
      .order("orden", { ascending: true });

    if (materialesError) throw materialesError;

    const materiales = (materialesRaw || []) as MaterialCiclo[];
    const materialesByPensum = new Map<string, MaterialCiclo[]>();
    materiales.forEach((item) => {
      const key = String(item.pensum_id || "");
      const current = materialesByPensum.get(key) || [];
      current.push(item);
      materialesByPensum.set(key, current);
    });

    let enviados = 0;
    let omitidos = 0;
    let fallidos = 0;
    const errores: string[] = [];
    let enviadosConPlantilla = 0;
    let enviadosConTexto = 0;

    for (const item of gruposUnicos.slice(0, Math.max(1, MAX_SENDS_PER_RUN))) {
      const key = buildAlertKey(item);
      const alreadySent = await wasAlreadySent(supabase, key);
      if (alreadySent) {
        omitidos += 1;
        continue;
      }

      const mats = materialesByPensum.get(String(item.pensum_id)) || [];
      const message = buildAlertMessage(item, mats, daysAhead);

      try {
        let response: any = null;
        let envioUsado: "template" | "text" = "text";

        if (TEMPLATE_NAME) {
          const variables = buildTemplateVariables(item, mats, daysAhead);
          try {
            response = await WhatsAppService.sendTemplate(alertPhone, TEMPLATE_NAME, variables, TEMPLATE_LANG);
            envioUsado = "template";
          } catch (templateError) {
            if (!ALLOW_TEXT_FALLBACK) {
              throw templateError;
            }
            console.warn("[Cron Alerta Materiales] Falló plantilla, usando fallback texto:", templateError);
            response = await WhatsAppService.sendText(alertPhone, message);
            envioUsado = "text";
          }
        } else {
          response = await WhatsAppService.sendText(alertPhone, message);
          envioUsado = "text";
        }

        enviados += 1;
        if (envioUsado === "template") {
          enviadosConPlantilla += 1;
        } else {
          enviadosConTexto += 1;
        }
        await saveAudit(supabase, {
          phone: alertPhone,
          message:
            envioUsado === "template"
              ? `${message}\n\n[ENVIO_USADO] template:${TEMPLATE_NAME} lang:${TEMPLATE_LANG}`
              : `${message}\n\n[ENVIO_USADO] text`,
          messageId: response?.messages?.[0]?.id,
        });
      } catch (error: any) {
        fallidos += 1;
        errores.push(`Grupo ${item.grupo_nombre || item.grupo_id}: ${error?.message || "Error desconocido"}`);
      }

      if (DELAY_BETWEEN_SENDS_MS > 0) {
        await sleep(DELAY_BETWEEN_SENDS_MS);
      }
    }

    return NextResponse.json({
      success: fallidos === 0,
      targetDate,
      resumen: {
        totalDetectados: gruposUnicos.length,
        enviados,
        enviadosConPlantilla,
        enviadosConTexto,
        omitidos,
        fallidos,
      },
      errores,
    });
  } catch (error: any) {
    console.error("[Cron Alerta Materiales] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Error ejecutando alerta de materiales por ciclo",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  return runAlertaMaterialesCiclo();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  return runAlertaMaterialesCiclo();
}
