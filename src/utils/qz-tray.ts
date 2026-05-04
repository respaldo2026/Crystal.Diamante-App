import type { TicketPagoData } from "@components/pdf/TicketPagoPDF";
import { generarTicketTermicoHtml } from "@utils/pago-ticket";

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

export const listarImpresorasQzTray = async (): Promise<string[]> => {
  try {
    const qz = await ensureQzConnection();
    const details = await qz.printers.getDetails();
    return details.filter((d) => d.name).map((d) => String(d.name));
  } catch {
    return [];
  }
};

export const imprimirTicketConQzTray = async (data: TicketPagoData, preferredPrinter?: string): Promise<boolean> => {
  try {
    const qz = await ensureQzConnection();
    const printerName = await resolvePrinterName(qz, preferredPrinter);
    const html = await generarTicketTermicoHtml(data);
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
        data: html,
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
