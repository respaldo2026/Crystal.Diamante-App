import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { TicketPagoPDF, type TicketCamposVisibles, type TicketPagoData } from "@components/pdf/TicketPagoPDF";

const crearDocumento = (data: TicketPagoData) =>
  React.createElement(TicketPagoPDF, data) as React.ReactElement<DocumentProps>;

const convertirBlobADataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("No se pudo convertir el logo a data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo logo"));
    reader.readAsDataURL(blob);
  });

const prepararTicketData = async (data: TicketPagoData): Promise<TicketPagoData> => {
  const logoUrl = data.academia?.logoUrl;

  if (!logoUrl || logoUrl.startsWith("data:")) {
    return data;
  }

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) {
      return data;
    }

    const logoBlob = await response.blob();
    const logoDataUrl = await convertirBlobADataUrl(logoBlob);

    return {
      ...data,
      academia: {
        ...data.academia,
        logoUrl: logoDataUrl,
      },
    };
  } catch {
    return data;
  }
};

const TICKET_CAMPOS_DEFAULT: TicketCamposVisibles = {
  logo: true,
  nombreAcademia: true,
  ruc: true,
  direccion: true,
  telefono: true,
  email: true,
  fecha: true,
  concepto: true,
  monto: true,
  nota: true,
  pie: true,
  titulo: true,
};

const normalizarCampos = (campos?: Partial<TicketCamposVisibles> | null): TicketCamposVisibles => ({
  ...TICKET_CAMPOS_DEFAULT,
  ...(campos ?? {}),
});

const truncarTexto = (valor: string | null | undefined, max: number) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (texto.length <= max) return texto;
  return `${texto.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const sanitizeReferenceChunk = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

export const generateShortTicketReference = (prefix: string = "FAC") => {
  const normalizedPrefix = sanitizeReferenceChunk(prefix).slice(0, 4) || "FAC";
  const now = new Date();
  const yymmdd = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${normalizedPrefix}-${yymmdd}-${random}`;
};

export const formatTicketReference = (rawReference?: string | null, prefix: string = "FAC") => {
  const raw = String(rawReference || "").trim();
  if (!raw) return generateShortTicketReference(prefix);

  if (/^[A-Z]{2,6}-[A-Z0-9-]{3,}$/i.test(raw)) {
    return raw.toUpperCase();
  }

  const compact = sanitizeReferenceChunk(raw);
  if (!compact) return generateShortTicketReference(prefix);

  if (compact.length <= 10) {
    return `${sanitizeReferenceChunk(prefix).slice(0, 4) || "FAC"}-${compact}`;
  }

  return `${sanitizeReferenceChunk(prefix).slice(0, 4) || "FAC"}-${compact.slice(-8)}`;
};

type EnrollmentTicketParams = {
  configAcademia: any;
  estudiante: { nombre_completo?: string | null; identificacion?: string | null; telefono?: string | null; id?: string | null } | null | undefined;
  cursoNombre?: string | null;
  monto: number;
  metodoPago?: string | null;
  fechaPagoLegible: string;
  referencia?: string | null;
};

export const buildEnrollmentTicketData = ({
  configAcademia,
  estudiante,
  cursoNombre,
  monto,
  metodoPago,
  fechaPagoLegible,
  referencia,
}: EnrollmentTicketParams): TicketPagoData => {
  const curso = String(cursoNombre || "Curso").trim() || "Curso";
  return {
    academia: {
      nombre: configAcademia?.nombre_academia || "Academia Crystal Diamante",
      ruc: configAcademia?.ruc || undefined,
      logoUrl: configAcademia?.logo_url || undefined,
      telefono: configAcademia?.telefono || configAcademia?.whatsapp || undefined,
      direccion: configAcademia?.direccion || undefined,
      email: configAcademia?.email || undefined,
      ticketTitulo: "FACTURA DE MATRICULA",
      ticketNota: configAcademia?.ticket_nota || undefined,
      ticketPie: configAcademia?.ticket_pie || undefined,
      ticketCampos: configAcademia?.ticket_campos || undefined,
    },
    estudiante: {
      nombre: estudiante?.nombre_completo || "Estudiante",
      identificacion: estudiante?.identificacion || undefined,
      telefono: estudiante?.telefono || undefined,
    },
    pago: {
      referencia: formatTicketReference(referencia, "MAT"),
      metodo: metodoPago || "efectivo",
      monto: Number(monto || 0),
      fecha: fechaPagoLegible,
      concepto: `Inscripción - ${curso}`,
      periodo: "Inscripción",
      numeroCuota: 0,
    },
    curso: {
      nombre: curso,
    },
  };
};

export const generarTicketPagoBlob = async (data: TicketPagoData) => {
  const dataPreparada = await prepararTicketData(data);
  const doc = crearDocumento(dataPreparada);
  return pdf(doc).toBlob();
};

export const abrirTicketPagoDesdeBlob = (blob: Blob, placeholder?: Window | null) => {
  const targetWindow = placeholder ?? window.open("", "_blank");

  if (!targetWindow) {
    throw new Error("No se pudo abrir la ventana del ticket");
  }

  const url = URL.createObjectURL(blob);
  targetWindow.location.href = url;
  targetWindow.focus();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const imprimirTicketPagoDesdeBlob = async (blob: Blob, placeholder?: Window | null) => {
  const targetWindow = placeholder ?? window.open("", "_blank");

  if (!targetWindow) {
    throw new Error("No se pudo abrir la ventana del ticket");
  }

  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve) => {
    let finalized = false;
    const finalizar = () => {
      if (finalized) return;
      finalized = true;
      resolve();
    };

    const onLoad = () => {
      try {
        targetWindow.focus();
        targetWindow.print();
      } catch {
      } finally {
        finalizar();
      }
    };

    targetWindow.addEventListener("load", onLoad, { once: true });
    targetWindow.location.href = url;
    targetWindow.focus();

    setTimeout(() => {
      if (finalized) return;
      try {
        targetWindow.print();
      } catch {
      } finally {
        finalizar();
      }
    }, 2500);
  });

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const descargarTicketPago = async (data: TicketPagoData) => {
  const blob = await generarTicketPagoBlob(data);
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `Recibo_${data.pago.referencia ?? data.pago.numeroCuota ?? Date.now()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const abrirTicketPago = async (data: TicketPagoData) => {
  const placeholder = window.open("", "_blank");

  if (!placeholder) {
    throw new Error("No se pudo abrir la ventana del ticket");
  }

  try {
    const blob = await generarTicketPagoBlob(data);
    abrirTicketPagoDesdeBlob(blob, placeholder);
  } catch (error) {
    placeholder.close();
    throw error;
  }
};

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

export const generarTicketTermicoHtml = async (data: TicketPagoData): Promise<string> => {
  const dataPreparada = await prepararTicketData(data);
  const campos = normalizarCampos(dataPreparada.academia.ticketCampos);
  const monto = Number(dataPreparada.pago.monto || 0);
  const valorEntregado = Number(dataPreparada.pago.valorEntregado || 0);
  const cambio = Number(dataPreparada.pago.cambio || 0);
  const conceptoBase =
    dataPreparada.pago.concepto ||
    dataPreparada.pago.periodo ||
    (dataPreparada.pago.numeroCuota ? `Cuota ${dataPreparada.pago.numeroCuota}` : null) ||
    "Pago";
  const concepto = truncarTexto(conceptoBase, 92);
  const estudiante = truncarTexto(dataPreparada.estudiante.nombre, 56);
  const metodo = truncarTexto(dataPreparada.pago.metodo, 28);
  const referencia = truncarTexto(dataPreparada.pago.referencia, 32);
  const curso = truncarTexto(dataPreparada.curso?.nombre, 64);
  const detallePago = truncarTexto(
    dataPreparada.pago.periodo && dataPreparada.pago.periodo !== dataPreparada.pago.concepto
      ? dataPreparada.pago.periodo
      : "",
    96
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(dataPreparada.academia.nombre || "Recibo")}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    html, body { width: 74mm; margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .ticket { width: 74mm; box-sizing: border-box; padding: 2mm 1.5mm; }
    .header { text-align: center; margin-bottom: 5px; }
    .logo { max-width: 30mm; max-height: 16mm; object-fit: contain; margin: 0 auto 4px auto; display: block; }
    .academy { font-size: 15px; font-weight: 700; line-height: 1.2; }
    .muted { color: #555; font-size: 10px; line-height: 1.35; }
    .section { border-top: 1px dashed #b8b8b8; padding-top: 5px; margin-top: 5px; }
    .title { font-size: 12px; font-weight: 700; margin-bottom: 4px; text-align: center; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
    .row .label { color: #444; }
    .row .value { font-weight: 600; text-align: right; flex: 1; }
    .block-label { font-weight: 700; margin-bottom: 2px; }
    .block-value { margin-bottom: 4px; line-height: 1.35; }
    .total { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; margin-top: 2px; }
    .note { font-size: 10px; line-height: 1.35; white-space: pre-wrap; }
    .footer { text-align: center; font-size: 10px; line-height: 1.35; color: #555; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      ${campos.logo && dataPreparada.academia.logoUrl ? `<img class="logo" src="${escapeHtml(dataPreparada.academia.logoUrl)}" alt="Logo" />` : ""}
      ${campos.nombreAcademia ? `<div class="academy">${escapeHtml(dataPreparada.academia.nombre || "Academia")}</div>` : ""}
      ${campos.ruc && dataPreparada.academia.ruc ? `<div class="muted">RUC/NIT: ${escapeHtml(dataPreparada.academia.ruc)}</div>` : ""}
      ${campos.direccion && dataPreparada.academia.direccion ? `<div class="muted">${escapeHtml(dataPreparada.academia.direccion)}</div>` : ""}
      ${campos.telefono && dataPreparada.academia.telefono ? `<div class="muted">Tel: ${escapeHtml(dataPreparada.academia.telefono)}</div>` : ""}
      ${campos.email && dataPreparada.academia.email ? `<div class="muted">${escapeHtml(dataPreparada.academia.email)}</div>` : ""}
    </div>

    <div class="section">
      ${campos.titulo ? `<div class="title">${escapeHtml(dataPreparada.academia.ticketTitulo || "Recibo de Pago")}</div>` : ""}
      ${campos.fecha ? `<div class="row"><span class="label">Fecha</span><span class="value">${escapeHtml(dataPreparada.pago.fecha || "-")}</span></div>` : ""}
      ${campos.concepto ? `<div class="row"><span class="label">Concepto</span><span class="value">${escapeHtml(concepto)}</span></div>` : ""}
      ${campos.monto ? `<div class="total"><span>TOTAL</span><span>${escapeHtml(formatCop(monto))}</span></div>` : ""}
    </div>

    <div class="section">
      <div class="block-label">Estudiante</div>
      <div class="block-value">${escapeHtml(estudiante || "-")}</div>
      ${dataPreparada.estudiante.identificacion ? `<div class="block-label">Documento</div><div class="block-value">${escapeHtml(dataPreparada.estudiante.identificacion)}</div>` : ""}
      ${curso ? `<div class="block-label">Curso</div><div class="block-value">${escapeHtml(curso)}</div>` : ""}
      ${metodo ? `<div class="block-label">Método</div><div class="block-value">${escapeHtml(metodo)}</div>` : ""}
      ${referencia ? `<div class="block-label">Referencia</div><div class="block-value">${escapeHtml(referencia)}</div>` : ""}
      ${detallePago ? `<div class="block-label">Detalle</div><div class="block-value">${escapeHtml(detallePago)}</div>` : ""}
      ${valorEntregado > 0 ? `<div class="row"><span class="label">Valor entregado</span><span class="value">${escapeHtml(formatCop(valorEntregado))}</span></div>` : ""}
      ${dataPreparada.pago.cambio !== undefined && dataPreparada.pago.cambio !== null ? `<div class="row"><span class="label">Cambio</span><span class="value">${escapeHtml(formatCop(cambio))}</span></div>` : ""}
      ${dataPreparada.estudiante.telefono ? `<div class="muted">Contacto estudiante: ${escapeHtml(dataPreparada.estudiante.telefono)}</div>` : ""}
    </div>

    ${campos.nota && dataPreparada.academia.ticketNota ? `<div class="section"><div class="note">${escapeHtml(dataPreparada.academia.ticketNota)}</div></div>` : ""}
    ${campos.pie ? `<div class="footer">${escapeHtml(dataPreparada.academia.ticketPie || "Gracias por su pago. Conserva este comprobante.")}</div>` : ""}
  </div>
</body>
</html>`;
};

export const imprimirTicketTermicoTM20II = async (data: TicketPagoData, placeholder?: Window | null) => {
  const targetWindow = placeholder ?? window.open("", "_blank", "width=420,height=780");

  if (!targetWindow) {
    throw new Error("No se pudo abrir la ventana de impresion");
  }
  const html = await generarTicketTermicoHtml(data);

  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    targetWindow.onload = () => {
      setTimeout(() => {
        try {
          targetWindow.focus();
          targetWindow.print();
        } catch {
        } finally {
          done();
        }
      }, 350);
    };

    targetWindow.document.open();
    targetWindow.document.write(html);
    targetWindow.document.close();
    targetWindow.focus();

    setTimeout(() => {
      if (resolved) return;
      try {
        targetWindow.focus();
        targetWindow.print();
      } catch {
      } finally {
        done();
      }
    }, 1200);
  });
};
