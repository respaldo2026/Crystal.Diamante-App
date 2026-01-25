import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { TicketPagoPDF, type TicketPagoData } from "@components/pdf/TicketPagoPDF";

const crearDocumento = (data: TicketPagoData) =>
  React.createElement(TicketPagoPDF, data) as React.ReactElement<DocumentProps>;

export const descargarTicketPago = async (data: TicketPagoData) => {
  const doc = crearDocumento(data);
  const blob = await pdf(doc).toBlob();
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
    const doc = crearDocumento(data);
    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    placeholder.location.href = url;
    placeholder.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    placeholder.close();
    throw error;
  }
};
