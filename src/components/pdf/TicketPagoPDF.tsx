"use client";

import React from "react";
import * as ReactPDF from "@react-pdf/renderer";

const { Page, Text, View, Document, StyleSheet } = ReactPDF;

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
  ticketTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#555555",
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
  },
});

export interface TicketPagoData {
  academia: {
    nombre: string;
    telefono?: string | null;
    direccion?: string | null;
    email?: string | null;
    ticketTitulo?: string | null;
    ticketNota?: string | null;
    ticketPie?: string | null;
  };
  estudiante: {
    nombre: string;
    identificacion?: string | null;
    telefono?: string | null;
  };
  pago: {
    referencia?: string | null;
    metodo?: string | null;
    monto: number;
    fecha: string;
    periodo?: string | null;
    numeroCuota?: number | null;
  };
  curso?: {
    nombre?: string | null;
  };
}

const formatearCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

export const TicketPagoPDF: React.FC<TicketPagoData> = ({ academia, estudiante, pago, curso }) => (
  <Document>
    <Page size={[226.77, 397.7]} style={styles.page}>
      <View style={styles.header}>
        {academia.ticketTitulo ? <Text style={styles.ticketTitle}>{academia.ticketTitulo}</Text> : null}
        <Text style={styles.title}>{academia.nombre}</Text>
        {academia.direccion ? <Text style={styles.subtitle}>{academia.direccion}</Text> : null}
        {academia.telefono ? <Text style={styles.subtitle}>Tel: {academia.telefono}</Text> : null}
        {academia.email ? <Text style={styles.subtitle}>{academia.email}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Fecha:</Text>
        <Text style={styles.value}>{pago.fecha}</Text>
        {pago.periodo ? (
          <>
            <Text style={styles.label}>Periodo:</Text>
            <Text style={styles.value}>{pago.periodo}</Text>
          </>
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
        {curso?.nombre ? (
          <>
            <Text style={styles.label}>Curso:</Text>
            <Text style={styles.value}>{curso.nombre}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Monto pagado:</Text>
        <Text style={styles.value}>{formatearCOP(pago.monto)}</Text>
        {pago.metodo ? (
          <>
            <Text style={styles.label}>Método:</Text>
            <Text style={styles.value}>{pago.metodo}</Text>
          </>
        ) : null}
        {pago.numeroCuota ? (
          <>
            <Text style={styles.label}>Cuota:</Text>
            <Text style={styles.value}>{pago.numeroCuota}</Text>
          </>
        ) : null}
        {pago.referencia ? (
          <>
            <Text style={styles.label}>Referencia:</Text>
            <Text style={styles.value}>{pago.referencia}</Text>
          </>
        ) : null}
      </View>

      {estudiante.telefono ? (
        <View style={styles.section}>
          <Text>Contacto estudiante: {estudiante.telefono}</Text>
        </View>
      ) : null}

      {academia.ticketNota ? (
        <View style={styles.section}>
          <Text>{academia.ticketNota}</Text>
        </View>
      ) : null}

      <Text style={styles.footer}>{academia.ticketPie || "Gracias por su pago. Conserva este comprobante."}</Text>
    </Page>
  </Document>
);
