import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { TicketPagoPDF, type TicketPagoData } from "@components/pdf/TicketPagoPDF";

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

export const imprimirTicketTermicoTM20II = async (data: TicketPagoData, placeholder?: Window | null) => {
  const targetWindow = placeholder ?? window.open("", "_blank", "width=420,height=780");

  if (!targetWindow) {
    throw new Error("No se pudo abrir la ventana de impresion");
  }

  const lineasConcepto = String(data.pago.concepto || "Pago").split(",").map((item) => item.trim()).filter(Boolean);
  const monto = Number(data.pago.monto || 0);
  const valorEntregado = Number(data.pago.valorEntregado || 0);
  const cambio = Number(data.pago.cambio || 0);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.academia.nombre || "Recibo")}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    html, body { width: 74mm; margin: 0; padding: 0; font-family: "Courier New", monospace; font-size: 12px; background: #fff; color: #000; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .ticket { width: 74mm; padding: 0; box-sizing: border-box; }
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
