import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type WhatsAppStatusEvent = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: {
    id?: string;
    origin?: { type?: string };
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function resolveVerifyToken(): string {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    ""
  );
}

function mapStatusToEstado(statusRaw: string): string {
  const status = String(statusRaw || "").toLowerCase();

  if (status === "sent") return "enviado";
  if (status === "delivered") return "entregado";
  if (status === "read") return "leido";
  if (status === "failed") return "fallido";

  return status || "desconocido";
}

function statusPriority(estado: string): number {
  // Evita degradar estados: no bajar de leido -> entregado -> enviado.
  const key = String(estado || "").toLowerCase();
  if (key === "leido") return 40;
  if (key === "entregado") return 30;
  if (key === "enviado") return 20;
  if (key === "fallido") return 10;
  return 0;
}

async function applyStatusUpdate(event: WhatsAppStatusEvent): Promise<{ updated: boolean; reason?: string }> {
  const messageId = String(event?.id || "").trim();
  if (!messageId) {
    return { updated: false, reason: "missing_message_id" };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { updated: false, reason: "missing_supabase_env" };
  }

  const newEstado = mapStatusToEstado(String(event?.status || ""));

  const { data: row, error: findError } = await supabase
    .from("whatsapp_mensajes")
    .select("id, estado, metadatos")
    .eq("message_id", messageId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error("[WhatsApp Webhook] Error buscando mensaje por message_id:", {
      messageId,
      error: findError,
    });
    return { updated: false, reason: "lookup_error" };
  }

  if (!row?.id) {
    console.warn("[WhatsApp Webhook] No se encontró whatsapp_mensajes para message_id", messageId);
    return { updated: false, reason: "message_not_found" };
  }

  const currentEstado = String(row.estado || "");
  const shouldUpdateEstado =
    statusPriority(newEstado) >= statusPriority(currentEstado) || newEstado === "fallido";

  const incomingMeta = {
    status_raw: String(event?.status || ""),
    status_timestamp: event?.timestamp || null,
    recipient_id: event?.recipient_id || null,
    conversation_id: event?.conversation?.id || null,
    conversation_origin: event?.conversation?.origin?.type || null,
    pricing: event?.pricing || null,
    errors: event?.errors || null,
    updated_at_webhook: new Date().toISOString(),
  };

  const mergedMetadatos = {
    ...(row.metadatos && typeof row.metadatos === "object" ? row.metadatos : {}),
    delivery_tracking: {
      ...(row?.metadatos as any)?.delivery_tracking,
      last_event: incomingMeta,
    },
  };

  const updatePayload: Record<string, any> = {
    metadatos: mergedMetadatos,
  };

  if (shouldUpdateEstado) {
    updatePayload.estado = newEstado;
  }

  const { error: updateError } = await supabase
    .from("whatsapp_mensajes")
    .update(updatePayload)
    .eq("id", row.id);

  if (updateError) {
    console.error("[WhatsApp Webhook] Error actualizando estado del mensaje:", {
      messageId,
      rowId: row.id,
      error: updateError,
    });
    return { updated: false, reason: "update_error" };
  }

  return { updated: true };
}

export async function GET(request: NextRequest) {
  const verifyToken = resolveVerifyToken();
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (!verifyToken) {
    return NextResponse.json(
      { ok: false, error: "Falta WHATSAPP_WEBHOOK_VERIFY_TOKEN (o equivalente) en variables de entorno" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Verificación inválida" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const statuses: WhatsAppStatusEvent[] =
      body?.entry?.flatMap((entry: any) =>
        (entry?.changes || []).flatMap((change: any) => change?.value?.statuses || []),
      ) || [];

    if (!statuses.length) {
      // ACK rápido para eventos que no son estados (o payload vacío)
      return NextResponse.json({ ok: true, updated: 0, ignored: true, reason: "no_statuses" });
    }

    let updated = 0;
    let ignored = 0;

    for (const statusEvent of statuses) {
      const result = await applyStatusUpdate(statusEvent);
      if (result.updated) updated++;
      else ignored++;
    }

    return NextResponse.json({ ok: true, updated, ignored, total: statuses.length });
  } catch (error) {
    console.error("[WhatsApp Webhook] Error procesando webhook:", error);
    return NextResponse.json({ ok: false, error: "Error procesando webhook" }, { status: 500 });
  }
}
