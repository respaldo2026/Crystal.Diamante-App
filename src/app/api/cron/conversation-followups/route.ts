import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WhatsAppService, normalizePhoneNumber, validatePhoneNumber } from "@/services/whatsapp-service";

export const runtime = "nodejs";

const FOLLOWUP_TYPE = "followup_3h_social";
const FOLLOWUP_AUDIT_USER_MESSAGE = "[SISTEMA] Follow-up automático 3h · redes";
const FOLLOWUP_DELAY_HOURS = 3;
const META_SAFE_WINDOW_HOURS = 22;
const LOOKBACK_HOURS = 26;
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_FOLLOWUP_MAX_PER_RUN || 25);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_FOLLOWUP_DELAY_MS || 900);
const DEFAULT_FOLLOWUP_MESSAGE = [
  "💗 Mientras decides, mira lo que están logrando nuestras estudiantes 😍",
  "",
  "💎 Instagram:",
  "https://instagram.com/crystal.diamante.academia",
  "",
  "💎 Facebook:",
  "https://www.facebook.com/Crystal.Diamante.cali",
  "",
  "📲 Guarda nuestro número y revisa nuestros estados (subimos trabajos reales y promociones):",
  "👉 3012038582",
].join("\n");

type ConversationRow = {
  id: string;
  phone_number: string;
  user_message: string;
  agent_response: string;
  created_at: string;
  channel?: string | null;
  profile_name?: string | null;
};

type LeadRow = {
  id: string;
  nombre?: string | null;
  telefono?: string | null;
  interes?: string | null;
  estado?: string | null;
};

type ProfileRow = {
  id: string;
  nombre_completo?: string | null;
  telefono?: string | null;
  telefono_2?: string | null;
  notif_whatsapp?: boolean | null;
};

type FollowupRow = {
  id: string;
  conversation_id: string;
  type: string;
  reference_message_at?: string | null;
  status: "sent" | "skipped" | "failed";
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

function normalizePhoneForMatch(value?: string | null): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "unknown" || raw === "desconocido" || raw.startsWith("ig:")) {
    return "";
  }

  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.startsWith("00") && digits.length > 2) return digits.slice(2);
  return digits;
}

function getConversationChannel(phoneNumber?: string | null, explicitChannel?: string | null): "instagram" | "whatsapp" | "unknown" {
  const explicit = String(explicitChannel || "").trim().toLowerCase();
  if (explicit === "instagram" || explicit === "whatsapp") {
    return explicit;
  }

  const raw = String(phoneNumber || "").trim().toLowerCase();
  if (!raw || raw === "unknown" || raw === "desconocido") return "unknown";
  if (raw.startsWith("ig:")) return "instagram";
  if (/^\d{16,}$/.test(raw)) return "instagram";
  return "whatsapp";
}

function buildThreadKey(row: Pick<ConversationRow, "phone_number" | "channel">): string | null {
  const channel = getConversationChannel(row.phone_number, row.channel);
  if (channel !== "whatsapp") return null;

  const normalizedPhone = normalizePhoneForMatch(row.phone_number);
  if (!normalizedPhone) return null;
  return `whatsapp:${normalizedPhone}`;
}

function isSystemConversation(row: Pick<ConversationRow, "user_message">): boolean {
  return /^\s*\[SISTEMA\]/i.test(String(row.user_message || ""));
}

function isThreeHourFollowupAudit(row: Pick<ConversationRow, "user_message">): boolean {
  return String(row.user_message || "").trim() === FOLLOWUP_AUDIT_USER_MESSAGE;
}

function buildFollowupMessage(): string {
  return String(process.env.WHATSAPP_AUTO_FOLLOWUP_3H_TEMPLATE || DEFAULT_FOLLOWUP_MESSAGE)
    .replace(/\r\n/g, "\n")
    .trim();
}

async function saveConversationAudit(
  supabase: any,
  input: {
    phone: string;
    userMessage: string;
    agentResponse: string;
    profileName?: string | null;
  }
): Promise<void> {
  try {
    const payload = {
      phone_number: input.phone,
      user_message: input.userMessage,
      agent_response: input.agentResponse,
      transcription: null,
      channel: "whatsapp",
      profile_name: input.profileName ?? null,
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
      console.warn("[Conversation Followups] Error guardando auditoría:", error);
    }
  } catch (error) {
    console.warn("[Conversation Followups] Excepción guardando auditoría:", error);
  }
}

async function upsertFollowupRecord(
  supabase: any,
  input: {
    conversationId: string;
    phone: string;
    type: string;
    referenceMessageAt: string;
    status: "sent" | "skipped" | "failed";
    errorMessage?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const row = {
    conversation_id: input.conversationId,
    phone_number: input.phone,
    type: input.type,
    reference_message_at: input.referenceMessageAt,
    sent_at: new Date().toISOString(),
    status: input.status,
    error_message: input.errorMessage ?? null,
    payload: input.payload ?? {},
  };

  const { error } = await supabase
    .from("conversation_followups")
    .upsert(row, { onConflict: "conversation_id,type,reference_message_at" });

  if (error) {
    console.warn("[Conversation Followups] Error guardando follow-up:", error);
  }
}

async function runFollowupsJob(): Promise<NextResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Faltan variables de Supabase para ejecutar follow-ups automáticos");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    const [
      conversationsResult,
      leadsResult,
      profilesResult,
      followupsResult,
    ] = await Promise.all([
      supabase
        .from("agent_conversations")
        .select("id, phone_number, user_message, agent_response, created_at, channel, profile_name")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("leads")
        .select("id, nombre, telefono, interes, estado")
        .not("telefono", "is", null)
        .limit(5000),
      supabase
        .from("perfiles")
        .select("id, nombre_completo, telefono, telefono_2, notif_whatsapp")
        .or("telefono.not.is.null,telefono_2.not.is.null")
        .limit(5000),
      supabase
        .from("conversation_followups")
        .select("id, conversation_id, type, reference_message_at, status")
        .eq("type", FOLLOWUP_TYPE)
        .gte("reference_message_at", sinceIso),
    ]);

    if (conversationsResult.error) {
      throw new Error(`Error consultando conversaciones: ${conversationsResult.error.message}`);
    }
    if (leadsResult.error) {
      throw new Error(`Error consultando leads: ${leadsResult.error.message}`);
    }
    if (profilesResult.error) {
      throw new Error(`Error consultando perfiles: ${profilesResult.error.message}`);
    }
    if (followupsResult.error) {
      throw new Error(`Error consultando follow-ups previos: ${followupsResult.error.message}`);
    }

    const conversations = (conversationsResult.data || []) as ConversationRow[];
    const leads = (leadsResult.data || []) as LeadRow[];
    const profiles = (profilesResult.data || []) as ProfileRow[];
    const followups = (followupsResult.data || []) as FollowupRow[];

    const leadByPhone = new Map<string, LeadRow>();
    for (const lead of leads) {
      const normalized = normalizePhoneForMatch(lead.telefono);
      if (normalized && !leadByPhone.has(normalized)) {
        leadByPhone.set(normalized, lead);
      }
    }

    const profileByPhone = new Map<string, ProfileRow>();
    for (const profile of profiles) {
      const candidates = [normalizePhoneForMatch(profile.telefono), normalizePhoneForMatch(profile.telefono_2)];
      for (const candidate of candidates) {
        if (candidate && !profileByPhone.has(candidate)) {
          profileByPhone.set(candidate, profile);
        }
      }
    }

    const followupStateByCycle = new Map<string, FollowupRow>();
    for (const followup of followups) {
      const key = `${followup.conversation_id}__${followup.reference_message_at || ""}`;
      followupStateByCycle.set(key, followup);
    }

    const grouped = new Map<string, ConversationRow[]>();
    for (const row of conversations) {
      const threadKey = buildThreadKey(row);
      if (!threadKey) continue;
      if (!grouped.has(threadKey)) {
        grouped.set(threadKey, []);
      }
      grouped.get(threadKey)!.push(row);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const [threadKey, rows] of grouped.entries()) {
      if (sent >= MAX_SENDS_PER_RUN) {
        break;
      }

      const sortedRows = rows.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastCustomerTurn = sortedRows
        .slice()
        .reverse()
        .find((row) => !isSystemConversation(row) && String(row.user_message || "").trim());

      if (!lastCustomerTurn?.created_at) {
        skipped++;
        continue;
      }

      const normalizedPhone = normalizePhoneNumber(lastCustomerTurn.phone_number || "");
      const validation = validatePhoneNumber(normalizedPhone);
      if (!validation.valid) {
        skipped++;
        continue;
      }

      const referenceMessageAt = new Date(lastCustomerTurn.created_at);
      const elapsedHours = (Date.now() - referenceMessageAt.getTime()) / (1000 * 60 * 60);
      if (elapsedHours < FOLLOWUP_DELAY_HOURS || elapsedHours >= META_SAFE_WINDOW_HOURS) {
        skipped++;
        continue;
      }

      const cycleKey = `${threadKey}__${lastCustomerTurn.created_at}`;
      const priorFollowup = followupStateByCycle.get(cycleKey);

      if (priorFollowup?.status === "sent" || priorFollowup?.status === "skipped") {
        skipped++;
        continue;
      }

      const hasFollowupAuditAfterReference = sortedRows.some((row) => {
        const rowTime = new Date(row.created_at).getTime();
        return rowTime > referenceMessageAt.getTime() && isThreeHourFollowupAudit(row);
      });

      if (hasFollowupAuditAfterReference) {
        if (!priorFollowup) {
          await upsertFollowupRecord(supabase, {
            conversationId: threadKey,
            phone: normalizedPhone,
            type: FOLLOWUP_TYPE,
            referenceMessageAt: lastCustomerTurn.created_at,
            status: "skipped",
            payload: { reason: "followup_already_audited" },
          });
          followupStateByCycle.set(cycleKey, {
            id: cycleKey,
            conversation_id: threadKey,
            type: FOLLOWUP_TYPE,
            reference_message_at: lastCustomerTurn.created_at,
            status: "skipped",
          });
        }
        skipped++;
        continue;
      }

      const hasLaterNonSystemTouch = sortedRows.some((row) => {
        const rowTime = new Date(row.created_at).getTime();
        return rowTime > referenceMessageAt.getTime() && !isSystemConversation(row);
      });

      if (hasLaterNonSystemTouch) {
        if (!priorFollowup) {
          await upsertFollowupRecord(supabase, {
            conversationId: threadKey,
            phone: normalizedPhone,
            type: FOLLOWUP_TYPE,
            referenceMessageAt: lastCustomerTurn.created_at,
            status: "skipped",
            payload: { reason: "conversation_touched_after_customer_message" },
          });
          followupStateByCycle.set(cycleKey, {
            id: cycleKey,
            conversation_id: threadKey,
            type: FOLLOWUP_TYPE,
            reference_message_at: lastCustomerTurn.created_at,
            status: "skipped",
          });
        }
        skipped++;
        continue;
      }

      const lead = leadByPhone.get(normalizedPhone);
      const leadStatus = String(lead?.estado || "").trim().toLowerCase();
      if (["cerrado", "cerrada", "perdido", "perdida"].includes(leadStatus)) {
        await upsertFollowupRecord(supabase, {
          conversationId: threadKey,
          phone: normalizedPhone,
          type: FOLLOWUP_TYPE,
          referenceMessageAt: lastCustomerTurn.created_at,
          status: "skipped",
          payload: { reason: "lead_closed", leadStatus },
        });
        skipped++;
        continue;
      }

      const profile = profileByPhone.get(normalizedPhone);
      if (profile?.notif_whatsapp === false) {
        await upsertFollowupRecord(supabase, {
          conversationId: threadKey,
          phone: normalizedPhone,
          type: FOLLOWUP_TYPE,
          referenceMessageAt: lastCustomerTurn.created_at,
          status: "skipped",
          payload: { reason: "profile_opted_out" },
        });
        skipped++;
        continue;
      }

      const contactName = String(lead?.nombre || profile?.nombre_completo || lastCustomerTurn.profile_name || "").trim() || null;
      const courseName = String(lead?.interes || "").trim() || null;
      const message = buildFollowupMessage();

      try {
        const response = await WhatsAppService.sendText(normalizedPhone, message);

        await saveConversationAudit(supabase, {
          phone: normalizedPhone,
          userMessage: FOLLOWUP_AUDIT_USER_MESSAGE,
          agentResponse: message,
          profileName: contactName,
        });

        await upsertFollowupRecord(supabase, {
          conversationId: threadKey,
          phone: normalizedPhone,
          type: FOLLOWUP_TYPE,
          referenceMessageAt: lastCustomerTurn.created_at,
          status: "sent",
          payload: {
            messageId: response.messages?.[0]?.id || null,
            elapsedHours: Number(elapsedHours.toFixed(2)),
            contactName,
            courseName,
          },
        });
        followupStateByCycle.set(cycleKey, {
          id: cycleKey,
          conversation_id: threadKey,
          type: FOLLOWUP_TYPE,
          reference_message_at: lastCustomerTurn.created_at,
          status: "sent",
        });

        sent++;
        if (DELAY_BETWEEN_SENDS_MS > 0) {
          await sleep(DELAY_BETWEEN_SENDS_MS);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Error desconocido";
        await upsertFollowupRecord(supabase, {
          conversationId: threadKey,
          phone: normalizedPhone,
          type: FOLLOWUP_TYPE,
          referenceMessageAt: lastCustomerTurn.created_at,
          status: "failed",
          errorMessage,
          payload: {
            elapsedHours: Number(elapsedHours.toFixed(2)),
            contactName,
            courseName,
          },
        });
        console.error("[Conversation Followups] Error enviando follow-up:", error);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${sent} follow-ups enviados, ${failed} fallidos, ${skipped} omitidos`,
      config: {
        type: FOLLOWUP_TYPE,
        delayHours: FOLLOWUP_DELAY_HOURS,
        safeWindowHours: META_SAFE_WINDOW_HOURS,
        maxSendsPerRun: MAX_SENDS_PER_RUN,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Conversation Followups] Error general:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runFollowupsJob();
}