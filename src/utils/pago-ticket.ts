import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { TicketPagoPDF, type TicketPagoData } from "@components/pdf/TicketPagoPDF";

const crearDocumento = (data: TicketPagoData) =>
  React.createElement(TicketPagoPDF, data) as React.ReactElement<DocumentProps>;

export const generarTicketPagoBlob = async (data: TicketPagoData) => {
  const doc = crearDocumento(data);
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
