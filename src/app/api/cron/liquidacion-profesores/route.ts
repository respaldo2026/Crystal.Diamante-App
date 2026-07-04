import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WhatsAppService } from "@/services/whatsapp-service";

export const runtime = "nodejs";

const DEFAULT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_LIQUIDACION_PROFESOR || "liquidacion_horas_profesor_v1";
const DEFAULT_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LIQUIDACION_PROFESOR_LANG || "es_CO";
const DIRECTOR_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_RESUMEN_DIRECTOR || "resumen_liquidacion_director";
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_ALLOW_TEXT_FALLBACK || "true").toLowerCase() === "true";
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_MAX_BULK_PER_RUN || 60);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_DELAY_BETWEEN_SENDS_MS || 1000);
const BOGOTA_TIMEZONE = "America/Bogota";
const HORAS_FIJAS_POR_CLASE = 3;

type ResumenProfesor = {
  profesorId: string;
  nombre: string;
  telefono: string;
  horas: number;
  valor: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(telefono: string): string {
  const digits = String(telefono || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.startsWith("00") && digits.length > 2) return digits.slice(2);
  return digits;
}

function moneyCOP(value: number): string {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-CO")}`;
}

function parseBogotaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? NaN);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? NaN);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? NaN);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error("No se pudieron parsear las partes de fecha en zona horaria de Bogotá");
  }

  return { year, month, day };
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftYearMonth(year: number, month: number, monthDelta: number): { year: number; month: number } {
  const base = new Date(Date.UTC(year, month - 1 + monthDelta, 1));
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
  };
}

function buildPeriodLabel(startISO: string, endISO: string): string {
  const format = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      timeZone: BOGOTA_TIMEZONE,
    });
  };

  return `${format(startISO)} a ${format(endISO)}`;
}

function buildPeriodoConPagoLabel(startISO: string, endISO: string, fechaPagoISO: string): string {
  const periodo = buildPeriodLabel(startISO, endISO);

  const match = fechaPagoISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `${periodo} (pago: ${fechaPagoISO})`;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const pago = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: BOGOTA_TIMEZONE,
  });

  return `${periodo} (pago: ${pago})`;
}

function buildFallbackText(nombre: string, periodoTexto: string, horasTexto: string, valorTexto: string): string {
  return [
    `Profesora ${nombre}, esta es la liquidación del periodo ${periodoTexto}.`,
    `Horas dictadas: ${horasTexto}.`,
    `Valor total a pagar: ${valorTexto}.`,
    "Academia Crystal Diamante.",
  ].join("\n");
}

async function saveTemplateAuditConversation(
  supabase: any,
  input: {
    phone: string;
    profileName?: string;
    templateName: string;
    templateLanguage: string;
    templateVariables: string[];
    messageId?: string;
  }
): Promise<void> {
  try {
    const payload = {
      phone_number: input.phone,
      user_message: "[SISTEMA] Liquidacion por plantilla",
      agent_response:
        `📤 Plantilla enviada: ${input.templateName}\n` +
        `Idioma: ${input.templateLanguage}\n` +
        `Variables: ${input.templateVariables.length ? input.templateVariables.join(" | ") : "-"}\n` +
        `Meta Message ID: ${input.messageId || "sin ID"}`,
      transcription: null,
      channel: "whatsapp",
      profile_name: input.profileName || null,
    };

    let { error } = await supabase.from("agent_conversations").insert(payload);

    if (error && /column .* does not exist/i.test(String(error.message || ""))) {
      const fallbackPayload = {
        phone_number: input.phone,
        user_message: payload.user_message,
        agent_response: payload.agent_response,
        transcription: null,
      };
      const retry = await supabase.from("agent_conversations").insert(fallbackPayload);
      error = retry.error;
    }

    if (error) {
      console.warn("[Cron Liquidacion] Error guardando auditoria de plantilla:", error);
    }
  } catch (error) {
    console.warn("[Cron Liquidacion] Excepcion guardando auditoria de plantilla:", error);
  }
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

async function runLiquidacionJob() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Faltan variables de Supabase para ejecutar la liquidación automática");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { year, month, day } = parseBogotaDateParts();
  const lastDay = getLastDayOfMonth(year, month);
  // Se envía 1 día ANTES del pago: día 15 anticipa pago el 16,
  // y el último día del mes anticipa pago el 1 del siguiente mes.
  const esQuincena = day === 15;
  const esFinMes = day === lastDay;

  if (!esQuincena && !esFinMes) {
    return {
      success: true,
      skipped: true,
      reason: "Hoy no es día previo a liquidación (15 o último día del mes)",
      today: `${year}-${pad(month)}-${pad(day)}`,
    };
  }

  const startDay = esQuincena ? 1 : 16;
  // El período completo es hasta el 15 o fin de mes, aunque se envíe un día antes.
  const endDay = esQuincena ? 15 : lastDay;
  const startISO = formatDateISO(year, month, startDay);
  const endISO = formatDateISO(year, month, endDay);
  const fechaPagoISO = esQuincena
    ? formatDateISO(year, month, 16)
    : (() => {
        const next = shiftYearMonth(year, month, 1);
        return formatDateISO(next.year, next.month, 1);
      })();
  const periodoTexto = buildPeriodoConPagoLabel(startISO, endISO, fechaPagoISO);

  const { data: sesiones, error: sesionesError } = await supabase
    .from("sesiones_clase")
    .select("id, curso_id, profesor_id, horas_dictadas, fecha, estado_pago")
    .gte("fecha", startISO)
    .lte("fecha", endISO)
    .eq("estado_pago", "pendiente");

  if (sesionesError) {
    throw new Error(`Error consultando sesiones: ${sesionesError.message}`);
  }

  if (!sesiones?.length) {
    return {
      success: true,
      skipped: true,
      reason: "No hay sesiones dictadas en el periodo",
      periodo: { startISO, endISO, periodoTexto },
    };
  }

  const profesoresIdsSet = new Set<string>();
  (sesiones || []).forEach((sesion: any) => {
    const profesorId = String(sesion?.profesor_id || "");
    if (!profesorId) return;
    profesoresIdsSet.add(profesorId);
  });

  const profesoresIds = Array.from(profesoresIdsSet);

  if (!profesoresIds.length) {
    return {
      success: true,
      skipped: true,
      reason: "No se encontraron profesores asociados a las sesiones del periodo",
      periodo: { startISO, endISO, periodoTexto },
    };
  }

  const { data: perfiles, error: perfilesError } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, telefono, notif_whatsapp, valor_hora")
    .in("id", profesoresIds);

  if (perfilesError) {
    throw new Error(`Error consultando perfiles de profesores: ${perfilesError.message}`);
  }

  const perfilById = new Map<string, any>();
  (perfiles || []).forEach((perfil: any) => {
    perfilById.set(String(perfil.id), perfil);
  });

  const resumenByProfesor = new Map<string, ResumenProfesor>();

  (sesiones || []).forEach((sesion: any) => {
    const profesorId = String(sesion?.profesor_id || "");
    if (!profesorId) return;

    const perfil = perfilById.get(profesorId);
    if (!perfil) return;

    const horas = HORAS_FIJAS_POR_CLASE;
    if (!Number.isFinite(horas) || horas <= 0) return;

    const valorHoraPerfil = Number(perfil?.valor_hora || 0);
    const valorHora = valueOrZero(valorHoraPerfil);

    const current = resumenByProfesor.get(profesorId) || {
      profesorId,
      nombre: String(perfil?.nombre_completo || "Profesor/a"),
      telefono: String(perfil?.telefono || ""),
      horas: 0,
      valor: 0,
    };

    current.horas += horas;
    current.valor += horas * valorHora;

    resumenByProfesor.set(profesorId, current);
  });

  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;
  const detalles: Array<Record<string, any>> = [];
  const telefonosProcesados = new Set<string>();

  for (const resumen of resumenByProfesor.values()) {
    if (enviados >= MAX_SENDS_PER_RUN) break;

    const perfil = perfilById.get(resumen.profesorId);
    if (!perfil || perfil.notif_whatsapp === false) {
      omitidos++;
      detalles.push({ profesor: resumen.nombre, estado: "omitido", motivo: "notificaciones deshabilitadas" });
      continue;
    }

    const telefonoNormalizado = normalizePhone(resumen.telefono);
    if (!telefonoNormalizado) {
      omitidos++;
      detalles.push({ profesor: resumen.nombre, estado: "omitido", motivo: "sin teléfono válido" });
      continue;
    }

    if (telefonosProcesados.has(telefonoNormalizado)) {
      omitidos++;
      detalles.push({ profesor: resumen.nombre, estado: "omitido", motivo: "teléfono duplicado" });
      continue;
    }

    const primerNombre = resumen.nombre.trim().split(" ")[0] || "Profesor/a";
    const horasTexto = `${Number(resumen.horas.toFixed(1)).toLocaleString("es-CO")} horas`;
    const valorTexto = moneyCOP(resumen.valor);

    try {
      const templateVariables = [primerNombre, periodoTexto, horasTexto, valorTexto];
      const response = await WhatsAppService.sendTemplate(
        telefonoNormalizado,
        DEFAULT_TEMPLATE_NAME,
        templateVariables,
        DEFAULT_TEMPLATE_LANG,
      );

      await saveTemplateAuditConversation(supabase, {
        phone: telefonoNormalizado,
        profileName: resumen.nombre,
        templateName: DEFAULT_TEMPLATE_NAME,
        templateLanguage: DEFAULT_TEMPLATE_LANG,
        templateVariables,
        messageId: response.messages?.[0]?.id,
      });

      enviados++;
      telefonosProcesados.add(telefonoNormalizado);
      detalles.push({ profesor: resumen.nombre, estado: "enviado", horas: resumen.horas, valor: Math.round(resumen.valor) });

      if (DELAY_BETWEEN_SENDS_MS > 0) {
        await sleep(DELAY_BETWEEN_SENDS_MS);
      }
    } catch (error) {
      if (ALLOW_TEXT_FALLBACK) {
        try {
          await WhatsAppService.sendText(
            telefonoNormalizado,
            buildFallbackText(primerNombre, periodoTexto, horasTexto, valorTexto),
          );

          enviados++;
          telefonosProcesados.add(telefonoNormalizado);
          detalles.push({ profesor: resumen.nombre, estado: "enviado_fallback", horas: resumen.horas, valor: Math.round(resumen.valor) });

          if (DELAY_BETWEEN_SENDS_MS > 0) {
            await sleep(DELAY_BETWEEN_SENDS_MS);
          }
        } catch (fallbackError) {
          fallidos++;
          detalles.push({
            profesor: resumen.nombre,
            estado: "fallido",
            error: fallbackError instanceof Error ? fallbackError.message : "Error desconocido",
          });
        }
      } else {
        fallidos++;
        detalles.push({
          profesor: resumen.nombre,
          estado: "fallido",
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }
  }

  // ── Notificación al director ─────────────────────────────────────────
  const fechaPago = (() => {
    const match = fechaPagoISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return fechaPagoISO;

    const pagoYear = Number(match[1]);
    const pagoMonth = Number(match[2]);
    const pagoDay = Number(match[3]);

    return new Date(Date.UTC(pagoYear, pagoMonth - 1, pagoDay)).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      timeZone: BOGOTA_TIMEZONE,
    });
  })();

  let directorNotificado = false;
  let directorError: string | undefined;

  try {
    // Teléfono y nombre: variable de entorno > perfil con rol 'director' en BD
    let directorTelefono = normalizePhone(process.env.WHATSAPP_DIRECTOR_PHONE || "");
    let directorNombre = "Director";

    const { data: directorPerfil } = await supabase
      .from("perfiles")
      .select("telefono, nombre_completo")
      .eq("rol", "director")
      .limit(1)
      .maybeSingle();

    if (directorPerfil?.nombre_completo) {
      directorNombre = directorPerfil.nombre_completo.trim().split(" ")[0];
    }
    if (!directorTelefono && directorPerfil?.telefono) {
      directorTelefono = normalizePhone(directorPerfil.telefono);
    }

    if (directorTelefono) {
      const totalProfesoras = `${resumenByProfesor.size} profesor${resumenByProfesor.size === 1 ? "a" : "as"}`;
      const directorTemplateVariables = [directorNombre, fechaPago, periodoTexto, totalProfesoras];
      const directorResponse = await WhatsAppService.sendTemplate(
        directorTelefono,
        DIRECTOR_TEMPLATE_NAME,
        directorTemplateVariables,
        DEFAULT_TEMPLATE_LANG,
      );
      await saveTemplateAuditConversation(supabase, {
        phone: directorTelefono,
        profileName: directorNombre,
        templateName: DIRECTOR_TEMPLATE_NAME,
        templateLanguage: DEFAULT_TEMPLATE_LANG,
        templateVariables: directorTemplateVariables,
        messageId: directorResponse.messages?.[0]?.id,
      });
      directorNotificado = true;
      console.log(`[Cron Liquidacion] Resumen enviado al director (${directorTelefono})`);
    } else {
      console.warn("[Cron Liquidacion] No se encontró teléfono del director");
    }
  } catch (directorErr) {
    directorError = directorErr instanceof Error ? directorErr.message : "Error desconocido";
    console.error("[Cron Liquidacion] Error notificando al director:", directorErr);
  }
  // ─────────────────────────────────────────────────────────────────────

  return {
    success: true,
    skipped: false,
    periodo: {
      startISO,
      endISO,
      periodoTexto,
      fechaPago,
      corte: esQuincena ? "quincena_1_15" : "quincena_16_fin",
    },
    totales: {
      profesoresDetectados: resumenByProfesor.size,
      enviados,
      omitidos,
      fallidos,
      maxSendsPerRun: MAX_SENDS_PER_RUN,
    },
    template: {
      name: DEFAULT_TEMPLATE_NAME,
      language: DEFAULT_TEMPLATE_LANG,
      fallbackTextEnabled: ALLOW_TEXT_FALLBACK,
    },
    director: { notificado: directorNotificado, error: directorError },
    detalles,
    timestamp: new Date().toISOString(),
  };
}

function valueOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildDirectorResumen(
  periodoTexto: string,
  resumen: Map<string, ResumenProfesor>,
  enviados: number,
  fechaPago: string,
): string {
  const lineas = Array.from(resumen.values()).map(
    (r) => `• ${r.nombre.split(" ")[0]}: ${r.horas.toFixed(1)}h → ${moneyCOP(r.valor)}`,
  );
  return [
    `📊 *Liquidación Profesores*`,
    `Periodo: ${periodoTexto}`,
    `Fecha de pago: ${fechaPago}`,
    ``,
    lineas.join("\n"),
    ``,
    `✅ Recordatorios enviados: ${enviados} de ${resumen.size}`,
    `_Academia Crystal Diamante_`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await runLiquidacionJob();
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Cron Liquidacion Profesores] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await runLiquidacionJob();
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Cron Liquidacion Profesores] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 },
    );
  }
}
