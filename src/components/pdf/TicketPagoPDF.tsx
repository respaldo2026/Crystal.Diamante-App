"use client";

import React from "react";
import * as ReactPDF from "@react-pdf/renderer";
import { construirNombreGrupo } from "@utils/grupos";

const { Page, Text, View, Document, StyleSheet, Image } = ReactPDF;

const BRAND = "#c0306e";
const BRAND_LIGHT = "#fdf0f6";
const BRAND_DARK = "#8a1f4c";
const GRAY = "#6b7280";
const DARK = "#1c1c2e";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    backgroundColor: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  /* ── HEADER ── */
  header: {
    backgroundColor: BRAND,
    paddingTop: 14,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 12,
    alignItems: "center",
  },
  logo: {
    width: 100,
    maxHeight: 40,
    objectFit: "contain",
    marginBottom: 6,
  },
  academiaName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 2,
  },
  academiaSubtitle: {
    fontSize: 7.5,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
  },
  /* ── TITLE BAND ── */
  titleBand: {
    backgroundColor: BRAND_DARK,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  fechaText: {
    fontSize: 8,
    color: "rgba(255,255,255,0.85)",
  },
  /* ── AMOUNT BOX ── */
  amountBox: {
    backgroundColor: BRAND_LIGHT,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    paddingRight: 14,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
  },
  amountLabel: {
    fontSize: 7.5,
    color: GRAY,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
  },
  /* ── DETAILS SECTION ── */
  sectionPad: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingLeft: 14,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
  },
  sectionHeader: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 7,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 5,
    alignItems: "flex-start",
  },
  detailLabel: {
    fontSize: 8,
    color: GRAY,
    width: 68,
    flexShrink: 0,
  },
  detailValue: {
    fontSize: 8.5,
    color: DARK,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  detailValueNormal: {
    fontSize: 8.5,
    color: DARK,
    flex: 1,
  },
  /* ── CONCEPT HIGHLIGHT ── */
  conceptoBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
    borderLeftStyle: "solid",
  },
  conceptoLabel: {
    fontSize: 7.5,
    color: GRAY,
    marginBottom: 2,
  },
  conceptoValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  /* ── DIVIDER ── */
  divider: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: "dashed",
    marginTop: 4,
    marginBottom: 4,
  },
  /* ── FOOTER ── */
  footer: {
    backgroundColor: "#f9fafb",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: GRAY,
    textAlign: "center",
    lineHeight: 1.5,
  },
  footerBrand: {
    fontSize: 7.5,
    color: BRAND,
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },
});

const truncarTexto = (valor: string | null | undefined, max: number) => {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (texto.length <= max) return texto;
  return `${texto.slice(0, Math.max(0, max - 1)).trim()}…`;
};

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
  const conceptoBase =
    pago.concepto ||
    pago.periodo ||
    (pago.numeroCuota ? `Cuota ${pago.numeroCuota}` : null) ||
    "Pago";
  const concepto = truncarTexto(conceptoBase, 92);
  const nombreEstudiante = truncarTexto(estudiante.nombre, 56);
  const nombreCurso = curso ? truncarTexto(construirNombreGrupo(curso), 70) : "";
  const metodo = truncarTexto(pago.metodo, 28);
  const referencia = truncarTexto(pago.referencia, 32);
  const detallePago = truncarTexto(
    pago.periodo && pago.periodo !== pago.concepto ? pago.periodo : "",
    100
  );

  return (
    <Document>
      <Page size={[226.77, 620]} style={styles.page}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          {campos.logo && academia.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.logo} src={academia.logoUrl} />
          ) : null}
          {campos.nombreAcademia ? (
            <Text style={styles.academiaName}>{academia.nombre}</Text>
          ) : null}
          {(campos.ruc && academia.ruc) ||
          (campos.direccion && academia.direccion) ||
          (campos.telefono && academia.telefono) ||
          (campos.email && academia.email) ? (
            <Text style={styles.academiaSubtitle}>
              {[
                campos.ruc && academia.ruc ? `NIT: ${academia.ruc}` : null,
                campos.direccion && academia.direccion ? academia.direccion : null,
                campos.telefono && academia.telefono ? `Tel: ${academia.telefono}` : null,
                campos.email && academia.email ? academia.email : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          ) : null}
        </View>

        {/* ── TITLE BAND ── */}
        {campos.titulo ? (
          <View style={styles.titleBand}>
            <Text style={styles.titleText}>
              {academia.ticketTitulo || "RECIBO DE PAGO"}
            </Text>
            {campos.fecha ? (
              <Text style={styles.fechaText}>{pago.fecha}</Text>
            ) : null}
          </View>
        ) : campos.fecha ? (
          <View style={styles.titleBand}>
            <Text style={styles.fechaText}>Fecha: {pago.fecha}</Text>
          </View>
        ) : null}

        {/* ── AMOUNT BOX ── */}
        {campos.monto ? (
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Total Pagado</Text>
            <Text style={styles.amountValue}>{formatearCOP(pago.monto)}</Text>
            {pago.valorEntregado ? (
              <Text style={[styles.amountLabel, { marginTop: 4 }]}>
                Recibido: {formatearCOP(pago.valorEntregado)}
                {pago.cambio !== undefined && pago.cambio !== null
                  ? `  ·  Cambio: ${formatearCOP(pago.cambio)}`
                  : ""}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── CONCEPTO ── */}
        {campos.concepto ? (
          <View style={{ paddingTop: 10, paddingLeft: 14, paddingRight: 14 }}>
            <View style={styles.conceptoBox}>
              <Text style={styles.conceptoLabel}>Concepto</Text>
              <Text style={styles.conceptoValue}>{concepto}</Text>
            </View>
          </View>
        ) : null}

        {/* ── PAGO DETAILS ── */}
        {(metodo || referencia || detallePago) ? (
          <View style={[styles.sectionPad, { paddingTop: 4 }]}>
            {metodo ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Método</Text>
                <Text style={styles.detailValue}>{metodo}</Text>
              </View>
            ) : null}
            {referencia ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Referencia</Text>
                <Text style={styles.detailValueNormal}>{referencia}</Text>
              </View>
            ) : null}
            {detallePago ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Detalle</Text>
                <Text style={styles.detailValueNormal}>{detallePago}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── ESTUDIANTE ── */}
        <View style={styles.sectionPad}>
          <Text style={styles.sectionHeader}>Datos del Estudiante</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Nombre</Text>
            <Text style={styles.detailValue}>{nombreEstudiante}</Text>
          </View>
          {estudiante.identificacion ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Documento</Text>
              <Text style={styles.detailValueNormal}>{estudiante.identificacion}</Text>
            </View>
          ) : null}
          {nombreCurso ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Curso</Text>
              <Text style={styles.detailValueNormal}>{nombreCurso}</Text>
            </View>
          ) : null}
          {estudiante.telefono ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Contacto</Text>
              <Text style={styles.detailValueNormal}>{estudiante.telefono}</Text>
            </View>
          ) : null}
        </View>

        {/* ── NOTA ── */}
        {campos.nota && academia.ticketNota ? (
          <View style={[styles.sectionPad, { backgroundColor: BRAND_LIGHT }]}>
            <Text style={[styles.detailValueNormal, { textAlign: "center", color: BRAND_DARK }]}>
              {academia.ticketNota}
            </Text>
          </View>
        ) : null}

        {/* ── FOOTER ── */}
        {campos.pie ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {academia.ticketPie || "Gracias por su pago. Conserva este comprobante."}
            </Text>
            <Text style={styles.footerBrand}>✦ {academia.nombre} ✦</Text>
          </View>
        ) : null}

      </Page>
    </Document>
  );
};
