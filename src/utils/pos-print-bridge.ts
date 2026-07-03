import type { TicketPagoData } from "@components/pdf/TicketPagoPDF";

type BridgeResult = {
  ok: boolean;
  channel: "local-agent" | "qz" | "none";
  pendingAuth?: boolean;
};

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:17891";

const resolveAgentBaseUrl = () =>
  String(process.env.NEXT_PUBLIC_POS_AGENT_URL || DEFAULT_AGENT_BASE_URL).trim().replace(/\/$/, "");

const resolveAgentToken = () => String(process.env.NEXT_PUBLIC_POS_AGENT_TOKEN || "").trim();

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

const truncate = (value: unknown, max: number) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
};

const formatCop = (value?: number | null) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

const buildEscPosRaw = (data: TicketPagoData): string => {
  const lineWidth = 42;
  const separator = "-".repeat(lineWidth);
  const chunks: string[] = [];

  const push = (line = "") => chunks.push(line);
  const center = (text: string) => {
    const t = truncate(text, lineWidth);
    const left = Math.max(0, Math.floor((lineWidth - t.length) / 2));
    push(`${" ".repeat(left)}${t}`);
  };

  const academia = truncate(data.academia?.nombre || "Academia", lineWidth);
  const titulo = truncate(data.academia?.ticketTitulo || "RECIBO DE PAGO", lineWidth);
  const estudiante = truncate(data.estudiante?.nombre || "Estudiante", lineWidth);
  const metodo = truncate(data.pago?.metodo || "", lineWidth);
  const referencia = truncate(data.pago?.referencia || "", lineWidth);
  const concepto = truncate(data.pago?.concepto || data.pago?.periodo || "Pago", lineWidth);
  const curso = truncate(data.curso?.nombre || "", lineWidth);

  // ESC @ (init), ESC a 1 (center)
  chunks.push("\x1B\x40");
  chunks.push("\x1B\x61\x01");
  center(academia);
  center(titulo);
  push("");

  // ESC a 0 (left)
  chunks.push("\x1B\x61\x00");
  push(separator);
  push(`Fecha: ${truncate(data.pago?.fecha || "", lineWidth - 7)}`);
  push(`Est.: ${truncate(estudiante, lineWidth - 6)}`);
  if (curso) push(`Curso: ${truncate(curso, lineWidth - 7)}`);
  push(`Concepto: ${truncate(concepto, lineWidth - 10)}`);
  if (metodo) push(`Metodo: ${truncate(metodo, lineWidth - 8)}`);
  if (referencia) push(`Ref: ${truncate(referencia, lineWidth - 5)}`);
  push(separator);
  push(`TOTAL: ${formatCop(data.pago?.monto)}`);

  if (Number(data.pago?.valorEntregado || 0) > 0) {
    push(`Entregado: ${formatCop(data.pago?.valorEntregado)}`);
  }

  if (data.pago?.cambio !== undefined && data.pago?.cambio !== null) {
    push(`Cambio: ${formatCop(data.pago?.cambio)}`);
  }

  if (data.academia?.ticketPie) {
    push(separator);
    push(truncate(data.academia.ticketPie, lineWidth));
  }

  push("\n\n");
  return chunks.join("\n");
};

const postAgent = async (path: string, body: Record<string, unknown>, timeoutMs: number) => {
  const token = resolveAgentToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["x-pos-agent-token"] = token;
  }

  const res = await withTimeout(
    fetch(`${resolveAgentBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    timeoutMs
  );

  if (!res.ok) {
    throw new Error(`agent_http_${res.status}`);
  }

  const payload = (await res.json()) as any;
  if (!payload?.ok) {
    throw new Error(payload?.error || "agent_error");
  }

  return payload;
};

const imprimirConAgenteLocal = async (data: TicketPagoData, preferredPrinter?: string): Promise<boolean> => {
  const raw = buildEscPosRaw(data);
  await postAgent(
    "/print-raw",
    {
      printerName: preferredPrinter || null,
      raw,
      encoding: "cp1252",
      ensureLineFeed: true,
      autoCut: true,
    },
    4500
  );
  return true;
};

export const imprimirTicketConBridge = async (
  data: TicketPagoData,
  preferredPrinter?: string
): Promise<BridgeResult> => {
  // 1) Priorizar QZ para conservar el ticket visual (logo/estilos)
  try {
    const { imprimirTicketConQzTray } = await import("@utils/qz-tray");
    const qzOutcome = await Promise.race<"printed" | "failed" | "pending">([
      imprimirTicketConQzTray(data, preferredPrinter).then((ok) => (ok ? "printed" : "failed")),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 4500);
      }),
    ]);

    if (qzOutcome === "printed") {
      return { ok: true, channel: "qz" };
    }

    if (qzOutcome === "pending") {
      return { ok: true, channel: "qz", pendingAuth: true };
    }
  } catch {
  }

  // 2) Si QZ no está disponible, usar agente local RAW como respaldo
  try {
    const ok = await imprimirConAgenteLocal(data, preferredPrinter);
    if (ok) {
      return { ok: true, channel: "local-agent" };
    }
  } catch {
  }

  return { ok: false, channel: "none" };
};

export const abrirCajonConBridge = async (preferredPrinter?: string): Promise<boolean> => {
  try {
    const payload = await postAgent(
      "/drawer",
      {
        printerName: preferredPrinter || null,
      },
      2500
    );

    if (payload?.ok) {
      return true;
    }
  } catch {
  }

  try {
    const { abrirCajonConQzTray } = await import("@utils/qz-tray");
    return await abrirCajonConQzTray(preferredPrinter);
  } catch {
    return false;
  }
};
