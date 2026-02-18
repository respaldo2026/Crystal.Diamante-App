"use client";

import React from "react";
import * as ReactPDF from "@react-pdf/renderer";
import { construirNombreGrupo } from "@utils/grupos";

const { Page, Text, View, Document, StyleSheet, Image } = ReactPDF;

const styles = StyleSheet.create({
  page: {
    padding: 16,
    backgroundColor: "#ffffff",
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    textAlign: "center",
    marginBottom: 12,
  },
  logo: {
    width: 120,
    maxHeight: 56,
    objectFit: "contain",
    alignSelf: "center",
    marginBottom: 6,
  },
  ticketTitle: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#555555",
  },
  details: {
    borderTop: "1px dashed #cccccc",
    paddingTop: 8,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  section: {
    marginBottom: 8,
    borderBottom: "1px dashed #cccccc",
    paddingBottom: 6,
  },
  label: {
    fontWeight: "bold",
  },
  value: {
    marginBottom: 2,
  },
  footer: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 9,
    color: "#555555",
  },
});

export interface TicketCamposVisibles {
  logo: boolean;
  nombreAcademia: boolean;
  ruc: boolean;
  direccion: boolean;
  telefono: boolean;
  email: boolean;
  fecha: boolean;
  concepto: boolean;
  monto: boolean;
  nota: boolean;
  pie: boolean;
  titulo: boolean;
}

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

export interface TicketPagoData {
  academia: {
    nombre: string;
    ruc?: string | null;
    logoUrl?: string | null;
    telefono?: string | null;
    direccion?: string | null;
    email?: string | null;
    ticketTitulo?: string | null;
    ticketNota?: string | null;
    ticketPie?: string | null;
    ticketCampos?: Partial<TicketCamposVisibles> | null;
  };
  estudiante: {
    nombre: string;
    identificacion?: string | null;
    telefono?: string | null;
  };
  pago: {
    referencia?: string | null;
    metodo?: string | null;
    concepto?: string | null;
    monto: number;
    fecha: string;
    periodo?: string | null;
    numeroCuota?: number | null;
    valorEntregado?: number | null;
    cambio?: number | null;
  };
  curso?: {
    nombre?: string | null;
  };
}

const formatearCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

const normalizarCampos = (campos?: Partial<TicketCamposVisibles> | null): TicketCamposVisibles => ({
  ...TICKET_CAMPOS_DEFAULT,
  ...(campos ?? {}),
});

export const TicketPagoPDF: React.FC<TicketPagoData> = ({ academia, estudiante, pago, curso }) => {
  const campos = normalizarCampos(academia.ticketCampos);
  const concepto =
    pago.concepto ||
    pago.periodo ||
    (pago.numeroCuota ? `Cuota ${pago.numeroCuota}` : null) ||
    "Pago";

  return (
    <Document>
      <Page size={[226.77, 397.7]} style={styles.page}>
        <View style={styles.header}>
          {campos.logo && academia.logoUrl ? <Image style={styles.logo} src={academia.logoUrl} /> : null}
          {campos.nombreAcademia ? <Text style={styles.title}>{academia.nombre}</Text> : null}
          {campos.ruc && academia.ruc ? <Text style={styles.subtitle}>RUC/NIT: {academia.ruc}</Text> : null}
          {campos.direccion && academia.direccion ? <Text style={styles.subtitle}>{academia.direccion}</Text> : null}
          {campos.telefono && academia.telefono ? <Text style={styles.subtitle}>Tel: {academia.telefono}</Text> : null}
          {campos.email && academia.email ? <Text style={styles.subtitle}>{academia.email}</Text> : null}
        </View>

        <View style={styles.details}>
          {campos.titulo ? (
            <Text style={styles.ticketTitle}>{academia.ticketTitulo || "Recibo de Pago"}</Text>
          ) : null}
          {campos.fecha ? (
            <Text style={[styles.subtitle, { marginBottom: 6 }]}>Fecha: {pago.fecha}</Text>
          ) : null}
          {campos.concepto ? (
            <View style={styles.row}>
              <Text>Concepto</Text>
              <Text>{concepto}</Text>
            </View>
          ) : null}
          {campos.monto ? (
            <View style={styles.row}>
              <Text>Monto</Text>
              <Text>{formatearCOP(pago.monto)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Estudiante:</Text>
          <Text style={styles.value}>{estudiante.nombre}</Text>
          {estudiante.identificacion ? (
            <>
              <Text style={styles.label}>Documento:</Text>
              <Text style={styles.value}>{estudiante.identificacion}</Text>
            </>
          ) : null}
          {curso ? (
            <>
              <Text style={styles.label}>Curso:</Text>
              <Text style={styles.value}>{construirNombreGrupo(curso)}</Text>
            </>
          ) : null}
          {pago.metodo ? (
            <>
              <Text style={styles.label}>Método:</Text>
              <Text style={styles.value}>{pago.metodo}</Text>
            </>
          ) : null}
          {pago.referencia ? (
            <>
              <Text style={styles.label}>Referencia:</Text>
              <Text style={styles.value}>{pago.referencia}</Text>
            </>
          ) : null}
          {pago.valorEntregado ? (
            <>
              <Text style={styles.label}>Valor entregado:</Text>
              <Text style={styles.value}>{formatearCOP(pago.valorEntregado)}</Text>
            </>
          ) : null}
          {pago.cambio !== undefined && pago.cambio !== null ? (
            <>
              <Text style={styles.label}>Cambio:</Text>
              <Text style={styles.value}>{formatearCOP(pago.cambio)}</Text>
            </>
          ) : null}
          {estudiante.telefono ? <Text style={styles.value}>Contacto estudiante: {estudiante.telefono}</Text> : null}
        </View>

        {campos.nota && academia.ticketNota ? (
          <View style={styles.section}>
            <Text>{academia.ticketNota}</Text>
          </View>
        ) : null}

        {campos.pie ? (
          <Text style={styles.footer}>{academia.ticketPie || "Gracias por su pago. Conserva este comprobante."}</Text>
        ) : null}
      </Page>
    </Document>
  );
};
