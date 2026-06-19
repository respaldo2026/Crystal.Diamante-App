import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WhatsAppService } from "@/services/whatsapp-service";

export const runtime = "nodejs";

const AUDIT_MARKER = "[SISTEMA] Alerta materiales ciclo (7d)";
const DEFAULT_ALERT_PHONE = "3006402575";
const DEFAULT_DAYS_AHEAD = 7;
const DEFAULT_CLASSES_PER_CYCLE = 4;
const SEND_NO_GROUPS_WHATSAPP =
  String(process.env.WHATSAPP_ALERTA_ENVIAR_RESUMEN_SIN_GRUPOS || "true").toLowerCase() === "true";
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_ALERTA_MAX_GRUPOS_POR_CORRIDA || 20);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_ALERTA_DELAY_MS || 900);
const TEMPLATE_NAME = String(process.env.WHATSAPP_TEMPLATE_ALERTA_MATERIALES || "").trim();
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_ALERTA_MATERIALES_LANG || "es_CO").trim();
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_ALERTA_ALLOW_TEXT_FALLBACK || "true").toLowerCase() === "true";
const AUTO_SESSION_TOPIC_PATTERN = /sesion programada automaticamente para calculo de ciclos/i;

type GrupoConPensum = {
  grupo_id: number;
  grupo_nombre: string;
  programa_id: number;
  programa_nombre: string;
  pensum_id: string | null;
  numero_ciclo: number | null;
  nombre_ciclo: string | null;
  fecha_inicio_ciclo: string;
  estado: string | null;
};

type CursoBase = {
  id: number;
  nombre: string;
  programa_id: number | null;
  estado: string | null;
  total_clases?: number | null;
};

type SesionClase = {
  id: string;
  curso_id: number;
  fecha: string;
  tema_visto?: string | null;
};

type Pensum = {
  id: string;
  programa_id: number;
  numero_ciclo: number;
  nombre_ciclo: string | null;
  activo: boolean;
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

function getTodayDateIso(): string {
  return getTargetDateIso(0);
}

function getDiffDays(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function buildAlertKey(item: GrupoConPensum): string {
  return `grupo:${item.grupo_id}|pensum:${item.pensum_id || "sin-pensum"}|ciclo:${item.numero_ciclo || "na"}|fecha:${item.fecha_inicio_ciclo}`;
}

function buildNoGroupsAlertKey(targetDate: string, daysAhead: number): string {
  return `sin-grupos|fecha:${targetDate}|dias:${daysAhead}`;
}

function buildAlertMessage(item: GrupoConPensum, materiales: MaterialCiclo[], daysAhead: number): string {
  const daysToStart = getDiffDays(getTodayDateIso(), item.fecha_inicio_ciclo);
  const cicloLabel = item.nombre_ciclo || (item.numero_ciclo ? `Ciclo ${item.numero_ciclo}` : "Ciclo sin nombre");
  const fechaInicio = formatDateEs(item.fecha_inicio_ciclo);
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
    `El próximo ciclo inicia en *${daysToStart} días*:`,
    `• *Grupo:* ${item.grupo_nombre || `Grupo ${item.grupo_id}`}`,
    `• *Programa:* ${item.programa_nombre || `Programa ${item.programa_id}`}`,
    `• *Ciclo:* ${cicloLabel}`,
    `• *Fecha de inicio:* ${fechaInicio}`,
    item.estado ? `• *Estado del grupo:* ${item.estado}` : "",
    !item.pensum_id ? "⚠️ *Sin pensum configurado para este ciclo; no hay materiales enlazados.*" : "",
    item.pensum_id && materiales.length === 0 ? "⚠️ *Este ciclo no tiene materiales configurados.*" : "",
    "",
    `🧰 *Materiales requeridos (${materiales.length})*`,
    materialesTexto,
    "",
    `Clave alerta: ${key}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildNoGroupsMessage(input: {
  targetDate: string;
  daysAhead: number;
  totalRegistrosFecha: number;
  totalElegibles: number;
}): string {
  const fechaObjetivo = formatDateEs(input.targetDate);
  const noHayRegistros = input.totalRegistrosFecha === 0;
  const key = buildNoGroupsAlertKey(input.targetDate, input.daysAhead);

  return [
    `ℹ️ *Resumen abastecimiento* (${input.daysAhead} días)`,
    "",
    `• *Fecha objetivo:* ${fechaObjetivo}`,
    `• *Registros en fecha:* ${input.totalRegistrosFecha}`,
    `• *Grupos elegibles:* ${input.totalElegibles}`,
    "",
    noHayRegistros
      ? "No hay grupos programados para iniciar en esta fecha."
      : "Hay grupos en la fecha, pero ninguno es elegible para alerta (sin pensum o datos incompletos).",
    "",
    `Clave alerta: ${key}`,
  ].join("\n");
}

function buildTemplateVariables(item: GrupoConPensum, materiales: MaterialCiclo[], daysAhead: number): string[] {
  const daysToStart = getDiffDays(getTodayDateIso(), item.fecha_inicio_ciclo);
  const cicloLabel = item.nombre_ciclo || (item.numero_ciclo ? `Ciclo ${item.numero_ciclo}` : "Ciclo sin nombre");
  const fechaInicio = formatDateEs(item.fecha_inicio_ciclo);
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
    String(daysToStart || daysAhead),
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

async function saveWhatsAppMessageRecord(
  supabase: any,
  input: {
    phone: string;
    content: string;
    estado: "enviado" | "fallido";
    messageId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const payload = {
      telefono: input.phone,
      tipo: "text",
      contenido: input.content,
      estado: input.estado,
      message_id: input.messageId || null,
      metadatos: {
        source: "cron_alerta_materiales",
        ...(input.metadata || {}),
      },
      creado_en: new Date().toISOString(),
    };

    let { error } = await supabase.from("whatsapp_mensajes").insert(payload);

    if (error && /Could not find the 'contenido' column/i.test(String(error.message || ""))) {
      const fallbackPayload = {
        telefono: input.phone,
        tipo: "text",
        mensaje_texto: input.content,
        estado: input.estado,
        message_id: input.messageId || null,
        metadatos: {
          source: "cron_alerta_materiales",
          ...(input.metadata || {}),
        },
        creado_en: new Date().toISOString(),
      };

      const retry = await supabase.from("whatsapp_mensajes").insert(fallbackPayload);
      error = retry.error;
    }

    if (error) {
      console.warn("[Cron Alerta Materiales] No se pudo registrar whatsapp_mensajes:", error);
    }
  } catch (error) {
    console.warn("[Cron Alerta Materiales] Excepción registrando whatsapp_mensajes:", error);
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
    const classesPerCycle = Number(process.env.WHATSAPP_ALERTA_CLASES_POR_CICLO || DEFAULT_CLASSES_PER_CYCLE);
    if (!Number.isFinite(classesPerCycle) || classesPerCycle <= 0) {
      throw new Error("WHATSAPP_ALERTA_CLASES_POR_CICLO debe ser un entero mayor a 0");
    }

    const todayDate = getTodayDateIso();
    const targetDate = getTargetDateIso(daysAhead);
    const alertPhone = String(process.env.WHATSAPP_ALERTA_MATERIALES_PHONE || DEFAULT_ALERT_PHONE).trim();

    const { data: cursosRaw, error: cursosError } = await supabase
      .from("cursos")
      .select("id, nombre, programa_id, estado, total_clases")
      .not("programa_id", "is", null);

    if (cursosError) throw cursosError;

    const cursos = ((cursosRaw || []) as CursoBase[]).filter((item) => item?.id && item?.programa_id);
    const cursoIds = cursos.map((item) => item.id);
    const programaIdsCursos = Array.from(
      new Set(cursos.map((item) => item.programa_id).filter((value): value is number => typeof value === "number")),
    );

    const programaNombreById = new Map<number, string>();
    if (programaIdsCursos.length > 0) {
      const { data: programasRaw, error: programasError } = await supabase
        .from("programas")
        .select("id, nombre")
        .in("id", programaIdsCursos);
      if (programasError) throw programasError;

      for (const programa of programasRaw || []) {
        const id = Number((programa as { id?: number }).id);
        const nombre = String((programa as { nombre?: string }).nombre || "").trim();
        if (Number.isFinite(id)) {
          programaNombreById.set(id, nombre || `Programa ${id}`);
        }
      }
    }

    if (cursoIds.length === 0) {
      const noGroupsMessage = buildNoGroupsMessage({
        targetDate,
        daysAhead,
        totalRegistrosFecha: 0,
        totalElegibles: 0,
      });

      const noGroupsKey = buildNoGroupsAlertKey(targetDate, daysAhead);
      const alreadySent = await wasAlreadySent(supabase, noGroupsKey);
      if (alreadySent) {
        return NextResponse.json({
          success: true,
          mensaje: `Ya se había enviado resumen sin grupos para ${targetDate}`,
          targetDate,
          enviados: 0,
          resumen: {
            totalDetectados: 0,
            enviados: 0,
            enviadosConPlantilla: 0,
            enviadosConTexto: 0,
            omitidos: 1,
            fallidos: 0,
          },
          errores: [],
        });
      }

      let envioResumenExitoso = false;
      let errorEnvioResumen: string | null = null;
      let noGroupsMessageId: string | undefined;

      if (SEND_NO_GROUPS_WHATSAPP) {
        try {
          const response = await WhatsAppService.sendText(alertPhone, noGroupsMessage);
          noGroupsMessageId = response?.messages?.[0]?.id;
          envioResumenExitoso = true;

          await saveWhatsAppMessageRecord(supabase, {
            phone: alertPhone,
            content: noGroupsMessage,
            estado: "enviado",
            messageId: noGroupsMessageId,
            metadata: {
              mode: "no-groups-summary",
              days_ahead: daysAhead,
              classes_per_cycle: classesPerCycle,
              target_date: targetDate,
              alert_key: noGroupsKey,
            },
          });

          await saveAudit(supabase, {
            phone: alertPhone,
            message: `${noGroupsMessage}\n\n[ENVIO_USADO] text\n[MODO] no-groups`,
            messageId: noGroupsMessageId,
          });
        } catch (error: any) {
          errorEnvioResumen = error?.message || "Error enviando resumen no-groups";

          await saveWhatsAppMessageRecord(supabase, {
            phone: alertPhone,
            content: noGroupsMessage,
            estado: "fallido",
            metadata: {
              mode: "no-groups-summary",
              days_ahead: daysAhead,
              classes_per_cycle: classesPerCycle,
              target_date: targetDate,
              alert_key: noGroupsKey,
              error: errorEnvioResumen,
            },
          });
        }
      }

      if (!SEND_NO_GROUPS_WHATSAPP) {
        await saveAudit(supabase, {
          phone: alertPhone,
          message: `${noGroupsMessage}\n\n[ENVIO_USADO] none\n[MODO] no-groups`,
          messageId: "sin-envio-no-groups",
        });
      }

      return NextResponse.json({
        success: SEND_NO_GROUPS_WHATSAPP ? envioResumenExitoso : true,
        mensaje: SEND_NO_GROUPS_WHATSAPP
          ? envioResumenExitoso
            ? `Resumen sin grupos enviado por WhatsApp para ${targetDate}`
            : `Falló envío WhatsApp del resumen sin grupos para ${targetDate}`
          : `Resumen sin grupos registrado (sin envío WhatsApp) para ${targetDate}`,
        targetDate,
        enviados: 0,
        enviadosNoGroupsWhatsapp: envioResumenExitoso ? 1 : 0,
        resumen: {
          totalDetectados: 0,
          enviados: 0,
          enviadosConPlantilla: 0,
          enviadosConTexto: 0,
          omitidos: 1,
          fallidos: envioResumenExitoso ? 0 : SEND_NO_GROUPS_WHATSAPP ? 1 : 0,
        },
        errores: errorEnvioResumen ? [errorEnvioResumen] : [],
      });
    }

    const { data: sesionesRaw, error: sesionesError } = await supabase
      .from("sesiones_clase")
      .select("id, curso_id, fecha, tema_visto")
      .in("curso_id", cursoIds)
      .order("fecha", { ascending: true });

    if (sesionesError) throw sesionesError;

    const sesiones = ((sesionesRaw || []) as SesionClase[]).filter((sesion) => {
      const tema = String(sesion?.tema_visto || "");
      return !AUTO_SESSION_TOPIC_PATTERN.test(tema);
    });
    const sesionesByCurso = new Map<number, SesionClase[]>();
    for (const sesion of sesiones) {
      if (!sesion?.curso_id || !sesion?.fecha) continue;
      const current = sesionesByCurso.get(sesion.curso_id) || [];
      current.push(sesion);
      sesionesByCurso.set(sesion.curso_id, current);
    }

    const cursoById = new Map<number, CursoBase>();
    for (const curso of cursos) {
      cursoById.set(curso.id, curso);
    }

    const proximosCiclosPorGrupo: Array<{ curso_id: number; fecha_inicio_ciclo: string; numero_ciclo_objetivo: number }> = [];
    for (const [cursoId, sesionesCurso] of sesionesByCurso.entries()) {
      const sesionesOrdenadas = [...sesionesCurso].sort((a, b) => {
        if (a.fecha === b.fecha) return String(a.id).localeCompare(String(b.id));
        return a.fecha.localeCompare(b.fecha);
      });

      const curso = cursoById.get(cursoId);
      const totalClasesCurso = Number(curso?.total_clases || 0);
      const maxIteraciones =
        totalClasesCurso > 0 ? Math.min(sesionesOrdenadas.length, totalClasesCurso) : sesionesOrdenadas.length;

      let proximo: { fecha_inicio_ciclo: string; numero_ciclo_objetivo: number } | null = null;
      for (let index = 0; index < maxIteraciones; index += 1) {
        const sesion = sesionesOrdenadas[index];
        if (!sesion?.fecha) continue;

        const numeroClase = index + 1;
        if ((numeroClase - 1) % classesPerCycle !== 0) continue;

        const fecha = String(sesion.fecha).slice(0, 10);
        if (fecha < todayDate) continue;

        proximo = {
          fecha_inicio_ciclo: fecha,
          numero_ciclo_objetivo: Math.floor((numeroClase - 1) / classesPerCycle) + 1,
        };
        break;
      }

      if (proximo) {
        proximosCiclosPorGrupo.push({
          curso_id: cursoId,
          fecha_inicio_ciclo: proximo.fecha_inicio_ciclo,
          numero_ciclo_objetivo: proximo.numero_ciclo_objetivo,
        });
      }
    }

    const candidatosFecha = proximosCiclosPorGrupo.filter(
      (item) => item.fecha_inicio_ciclo >= todayDate && item.fecha_inicio_ciclo <= targetDate,
    );
    const programaIds = Array.from(
      new Set(
        candidatosFecha
          .map((item) => cursoById.get(item.curso_id)?.programa_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    );
    const ciclosObjetivo = Array.from(new Set(candidatosFecha.map((item) => item.numero_ciclo_objetivo)));

    let pensumRows: Pensum[] = [];
    if (programaIds.length > 0 && ciclosObjetivo.length > 0) {
      const { data: pensumRaw, error: pensumError } = await supabase
        .from("pensum")
        .select("id, programa_id, numero_ciclo, nombre_ciclo, activo")
        .in("programa_id", programaIds)
        .in("numero_ciclo", ciclosObjetivo)
        .eq("activo", true);

      if (pensumError) throw pensumError;
      pensumRows = (pensumRaw || []) as Pensum[];
    }

    const pensumByProgramaYCiclo = new Map<string, Pensum>();
    for (const row of pensumRows) {
      pensumByProgramaYCiclo.set(`${row.programa_id}|${row.numero_ciclo}`, row);
    }

    const grupos = candidatosFecha
      .map((item): GrupoConPensum | null => {
        const curso = cursoById.get(item.curso_id);
        if (!curso?.programa_id) return null;

        const pensum = pensumByProgramaYCiclo.get(`${curso.programa_id}|${item.numero_ciclo_objetivo}`);
        return {
          grupo_id: curso.id,
          grupo_nombre: curso.nombre,
          programa_id: curso.programa_id,
          programa_nombre: programaNombreById.get(curso.programa_id) || `Programa ${curso.programa_id}`,
          pensum_id: pensum?.id || null,
          numero_ciclo: item.numero_ciclo_objetivo,
          nombre_ciclo: pensum?.nombre_ciclo || `Ciclo ${item.numero_ciclo_objetivo}`,
          fecha_inicio_ciclo: item.fecha_inicio_ciclo,
          estado: curso.estado || null,
        };
      })
      .filter((item): item is GrupoConPensum => Boolean(item));

    const gruposUnicos = Array.from(
      new Map(
        grupos
          .filter((item) => item?.grupo_id)
          .map((item) => [`${item.grupo_id}|${item.numero_ciclo || "na"}|${item.fecha_inicio_ciclo}`, item]),
      ).values(),
    );

    if (candidatosFecha.length === 0 || gruposUnicos.length === 0) {
      const noGroupsMessage = buildNoGroupsMessage({
        targetDate,
        daysAhead,
        totalRegistrosFecha: candidatosFecha.length,
        totalElegibles: gruposUnicos.length,
      });

      const noGroupsKey = buildNoGroupsAlertKey(targetDate, daysAhead);
      const alreadySent = await wasAlreadySent(supabase, noGroupsKey);
      if (alreadySent) {
        return NextResponse.json({
          success: true,
          mensaje: `Ya se había enviado resumen sin grupos para ${targetDate}`,
          targetDate,
          enviados: 0,
          resumen: {
            totalDetectados: gruposUnicos.length,
            enviados: 0,
            enviadosConPlantilla: 0,
            enviadosConTexto: 0,
            omitidos: 1,
            fallidos: 0,
          },
          errores: [],
        });
      }

      let envioResumenExitoso = false;
      let errorEnvioResumen: string | null = null;
      let noGroupsMessageId: string | undefined;

      if (SEND_NO_GROUPS_WHATSAPP) {
        try {
          const response = await WhatsAppService.sendText(alertPhone, noGroupsMessage);
          noGroupsMessageId = response?.messages?.[0]?.id;
          envioResumenExitoso = true;

          await saveWhatsAppMessageRecord(supabase, {
            phone: alertPhone,
            content: noGroupsMessage,
            estado: "enviado",
            messageId: noGroupsMessageId,
            metadata: {
              mode: "no-groups-summary",
              days_ahead: daysAhead,
              classes_per_cycle: classesPerCycle,
              target_date: targetDate,
              alert_key: noGroupsKey,
            },
          });

          await saveAudit(supabase, {
            phone: alertPhone,
            message: `${noGroupsMessage}\n\n[ENVIO_USADO] text\n[MODO] no-groups`,
            messageId: noGroupsMessageId,
          });
        } catch (error: any) {
          errorEnvioResumen = error?.message || "Error enviando resumen no-groups";

          await saveWhatsAppMessageRecord(supabase, {
            phone: alertPhone,
            content: noGroupsMessage,
            estado: "fallido",
            metadata: {
              mode: "no-groups-summary",
              days_ahead: daysAhead,
              classes_per_cycle: classesPerCycle,
              target_date: targetDate,
              alert_key: noGroupsKey,
              error: errorEnvioResumen,
            },
          });
        }
      }

      if (!SEND_NO_GROUPS_WHATSAPP) {
        await saveAudit(supabase, {
          phone: alertPhone,
          message: `${noGroupsMessage}\n\n[ENVIO_USADO] none\n[MODO] no-groups`,
          messageId: "sin-envio-no-groups",
        });
      }

      return NextResponse.json({
        success: SEND_NO_GROUPS_WHATSAPP ? envioResumenExitoso : true,
        mensaje: SEND_NO_GROUPS_WHATSAPP
          ? envioResumenExitoso
            ? `Resumen sin grupos enviado por WhatsApp para ${targetDate}`
            : `Falló envío WhatsApp del resumen sin grupos para ${targetDate}`
          : `Resumen sin grupos registrado (sin envío WhatsApp) para ${targetDate}`,
        targetDate,
        enviados: 0,
        enviadosNoGroupsWhatsapp: envioResumenExitoso ? 1 : 0,
        resumen: {
          totalDetectados: gruposUnicos.length,
          enviados: 0,
          enviadosConPlantilla: 0,
          enviadosConTexto: 0,
          omitidos: 1,
          fallidos: envioResumenExitoso ? 0 : SEND_NO_GROUPS_WHATSAPP ? 1 : 0,
        },
        errores: errorEnvioResumen ? [errorEnvioResumen] : [],
      });
    }

    const pensumIds = Array.from(new Set(gruposUnicos.map((item) => String(item.pensum_id || "")).filter(Boolean)));

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

        await saveWhatsAppMessageRecord(supabase, {
          phone: alertPhone,
          content: message,
          estado: "enviado",
          messageId: response?.messages?.[0]?.id,
          metadata: {
            envio_usado: envioUsado,
            template_name: envioUsado === "template" ? TEMPLATE_NAME : null,
            template_lang: envioUsado === "template" ? TEMPLATE_LANG : null,
            days_ahead: daysAhead,
            classes_per_cycle: classesPerCycle,
            target_date: targetDate,
            alert_key: key,
            grupo_id: item.grupo_id,
            pensum_id: item.pensum_id,
            numero_ciclo: item.numero_ciclo,
            fecha_inicio_ciclo: item.fecha_inicio_ciclo,
          },
        });
      } catch (error: any) {
        fallidos += 1;
        errores.push(`Grupo ${item.grupo_nombre || item.grupo_id}: ${error?.message || "Error desconocido"}`);

        await saveWhatsAppMessageRecord(supabase, {
          phone: alertPhone,
          content: message,
          estado: "fallido",
          metadata: {
            days_ahead: daysAhead,
            classes_per_cycle: classesPerCycle,
            target_date: targetDate,
            alert_key: key,
            grupo_id: item.grupo_id,
            pensum_id: item.pensum_id,
            numero_ciclo: item.numero_ciclo,
            fecha_inicio_ciclo: item.fecha_inicio_ciclo,
            error: error?.message || "Error desconocido",
          },
        });
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
