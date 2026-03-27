import type { TicketPagoData } from "@components/pdf/TicketPagoPDF";

type QzTrayLike = {
  websocket: {
    isActive: () => boolean;
    connect: (options?: Record<string, unknown>) => Promise<void>;
  };
  printers: {
    find: (query?: string) => Promise<string | string[]>;
    getDefault: () => Promise<string>;
    getDetails: () => Promise<Array<{ name?: string }>>;
  };
  configs: {
    create: (printer: string, options?: Record<string, unknown>) => unknown;
  };
  print: (config: unknown, data: Array<Record<string, unknown> | string>) => Promise<void>;
  security?: {
    setCertificatePromise?: (factory: (...args: any[]) => any) => void;
    setSignaturePromise?: (factory: (...args: any[]) => any) => void;
    setSignatureAlgorithm?: (algorithm: string) => void;
  };
};

const QZ_TRAY_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";
const DEFAULT_PRINTER_NAME = "EPSON TM-T20II";

const getWindowWithQz = () => window as Window & { qz?: QzTrayLike };

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCop = (value?: number): string =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

const buildThermalTicketHtml = (data: TicketPagoData): string => {
  const lineasConcepto = String(data.pago.concepto || "Pago")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const monto = Number(data.pago.monto || 0);
  const valorEntregado = Number(data.pago.valorEntregado || 0);
  const cambio = Number(data.pago.cambio || 0);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.academia.nombre || "Recibo")}</title>
  <style>
    html, body { width: 74mm; margin: 0; padding: 0; background: #fff; color: #000; font-family: "Courier New", monospace; font-size: 12px; }
    .ticket { width: 74mm; box-sizing: border-box; }
    .center { text-align: center; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .strong { font-weight: 700; }
    .small { font-size: 11px; }
    ul { margin: 4px 0 0 14px; padding: 0; }
    li { margin: 0 0 2px 0; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="center strong">${escapeHtml(data.academia.nombre || "Academia")}</div>
    ${data.academia.direccion ? `<div class="center small">${escapeHtml(data.academia.direccion)}</div>` : ""}
    ${data.academia.telefono ? `<div class="center small">Tel: ${escapeHtml(data.academia.telefono)}</div>` : ""}
    ${data.academia.ruc ? `<div class="center small">RUC: ${escapeHtml(data.academia.ruc)}</div>` : ""}
    <div class="sep"></div>
    <div class="row"><span>Fecha:</span><span>${escapeHtml(data.pago.fecha || "-")}</span></div>
    <div class="row"><span>Ref:</span><span>${escapeHtml(data.pago.referencia || "-")}</span></div>
    <div class="row"><span>Metodo:</span><span>${escapeHtml(data.pago.metodo || "-")}</span></div>
    <div class="sep"></div>
    <div class="small">Estudiante: <span class="strong">${escapeHtml(data.estudiante.nombre || "-")}</span></div>
    ${data.estudiante.telefono ? `<div class="small">Tel: ${escapeHtml(data.estudiante.telefono)}</div>` : ""}
    <div class="sep"></div>
    <div class="strong">Detalle</div>
    <ul>
      ${lineasConcepto.map((line) => `<li>${escapeHtml(line)}</li>`).join("") || `<li>${escapeHtml(data.pago.periodo || "Pago")}</li>`}
    </ul>
    <div class="sep"></div>
    <div class="row strong"><span>TOTAL:</span><span>${escapeHtml(formatCop(monto))}</span></div>
    ${valorEntregado > 0 ? `<div class="row"><span>Recibido:</span><span>${escapeHtml(formatCop(valorEntregado))}</span></div>` : ""}
    ${cambio > 0 ? `<div class="row"><span>Cambio:</span><span>${escapeHtml(formatCop(cambio))}</span></div>` : ""}
    ${data.academia.ticketNota ? `<div class="sep"></div><div class="small">${escapeHtml(data.academia.ticketNota)}</div>` : ""}
    <div class="sep"></div>
    <div class="center small">${escapeHtml(data.academia.ticketPie || "Gracias por su pago")}</div>
  </div>
</body>
</html>`;
};

const loadQzTrayScript = async (): Promise<QzTrayLike> => {
  const current = getWindowWithQz().qz;
  if (current) return current;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-qz-tray="true"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar QZ Tray")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = QZ_TRAY_SCRIPT_URL;
    script.async = true;
    script.dataset.qzTray = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar QZ Tray"));
    document.head.appendChild(script);
  });

  const qz = getWindowWithQz().qz;
  if (!qz) {
    throw new Error("QZ Tray no esta disponible en esta estacion");
  }

  if (qz.security?.setCertificatePromise) {
    qz.security.setCertificatePromise((resolve: (value: string) => void) => resolve(""));
  }
  if (qz.security?.setSignatureAlgorithm) {
    qz.security.setSignatureAlgorithm("SHA512");
  }
  if (qz.security?.setSignaturePromise) {
    qz.security.setSignaturePromise(() => (resolve: (value: string) => void) => resolve(""));
  }

  return qz;
};

const ensureQzConnection = async (): Promise<QzTrayLike> => {
  const qz = await loadQzTrayScript();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 0, delay: 0 });
  }
  return qz;
};

const resolvePrinterName = async (qz: QzTrayLike, preferredPrinter?: string): Promise<string> => {
  const preferred = String(preferredPrinter || DEFAULT_PRINTER_NAME).trim();

  try {
    const found = await qz.printers.find(preferred);
    if (typeof found === "string" && found) return found;
    if (Array.isArray(found) && found[0]) return found[0];
  } catch {
  }

  try {
    const details = await qz.printers.getDetails();
    const fuzzy = details.find((printer) => String(printer?.name || "").toLowerCase().includes("tm-t20"));
    if (fuzzy?.name) return fuzzy.name;
  } catch {
  }

  return qz.printers.getDefault();
};

export const verificarQzTrayDisponible = async (): Promise<boolean> => {
  try {
    await ensureQzConnection();
    return true;
  } catch {
    return false;
  }
};

export const imprimirTicketConQzTray = async (data: TicketPagoData, preferredPrinter?: string): Promise<boolean> => {
  try {
    const qz = await ensureQzConnection();
    const printerName = await resolvePrinterName(qz, preferredPrinter);
    const config = qz.configs.create(printerName, {
      jobName: `Recibo ${String(data.pago.referencia || Date.now())}`,
      copies: 1,
      scaleContent: false,
    });

    await qz.print(config, [
      {
        type: "pixel",
        format: "html",
        flavor: "plain",
        data: buildThermalTicketHtml(data),
      },
    ]);

    return true;
  } catch {
    return false;
  }
};

export const abrirCajonConQzTray = async (preferredPrinter?: string): Promise<boolean> => {
  try {
    const qz = await ensureQzConnection();
    const printerName = await resolvePrinterName(qz, preferredPrinter);
    const config = qz.configs.create(printerName, {
      jobName: "Abrir cajon",
      copies: 1,
    });

    await qz.print(config, [
      {
        type: "raw",
        format: "command",
        flavor: "plain",
        data: "\x1B\x70\x00\x19\xFA",
      },
    ]);

    return true;
  } catch {
    return false;
  }
};
