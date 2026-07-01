"use client";

import React from "react";
import * as ReactPDF from "@react-pdf/renderer";
import { construirNombreGrupo } from "@utils/grupos";

const { Page, Text, View, Document, StyleSheet, Image } = ReactPDF;

const GRAY = "#5b5b5b";
const DARK = "#111111";
const BORDER = "#d6d6d6";

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
    paddingTop: 14,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
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
    color: DARK,
    textAlign: "center",
    marginBottom: 2,
  },
  academiaSubtitle: {
    fontSize: 7.5,
    color: GRAY,
    textAlign: "center",
  },
  /* ── TITLE ROW ── */
  titleBand: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
  },
  titleText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    letterSpacing: 0.5,
  },
  fechaText: {
    fontSize: 8,
    color: GRAY,
  },
  /* ── AMOUNT BOX ── */
  amountBox: {
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
    color: DARK,
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
    color: DARK,
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
    borderRadius: 4,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
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
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: "solid",
  },
  footerText: {
    fontSize: 8,
    color: GRAY,
    textAlign: "center",
    lineHeight: 1.5,
  },
  footerBrand: {
    fontSize: 7.5,
    color: DARK,
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },
  avisoBox: {
    marginTop: 8,
    marginLeft: 14,
    marginRight: 14,
    marginBottom: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderStyle: "solid",
    backgroundColor: "#fff7ed",
    borderRadius: 4,
  },
  avisoTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#9a3412",
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  avisoMessage: {
    fontSize: 7.5,
    color: "#7c2d12",
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 1.4,
  },
  avisoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 6,
  },
  avisoRowLabel: {
    fontSize: 7.5,
    color: "#7c2d12",
  },
  avisoRowValue: {
    fontSize: 7.5,
    color: "#7c2d12",
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
  avisoPagosMatricula?: {
    titulo: string;
    mensaje?: string | null;
    fechas: Array<{
      ciclo: string;
      claseNumero: number;
      fecha: string;
    }>;
  } | null;
}

const formatearCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

const normalizarCampos = (campos?: Partial<TicketCamposVisibles> | null): TicketCamposVisibles => ({
  ...TICKET_CAMPOS_DEFAULT,
  ...(campos ?? {}),
});

export const TicketPagoPDF: React.FC<TicketPagoData> = ({ academia, estudiante, pago, curso, avisoPagosMatricula }) => {
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
        {(campos.titulo || campos.fecha) ? (
          <View style={styles.titleBand}>
            <Text style={styles.titleText}>
              {campos.titulo ? academia.ticketTitulo || "RECIBO DE PAGO" : "RECIBO"}
            </Text>
            {campos.fecha ? <Text style={styles.fechaText}>{pago.fecha}</Text> : null}
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

        {avisoPagosMatricula?.fechas?.length ? (
          <View style={styles.avisoBox}>
            <Text style={styles.avisoTitle}>{avisoPagosMatricula.titulo}</Text>
            {avisoPagosMatricula.mensaje ? (
              <Text style={styles.avisoMessage}>{avisoPagosMatricula.mensaje}</Text>
            ) : null}
            {avisoPagosMatricula.fechas.map((item) => (
              <View key={`${item.ciclo}-${item.claseNumero}`} style={styles.avisoRow}>
                <Text style={styles.avisoRowLabel}>{`Próximo pago ${item.ciclo} (clase ${item.claseNumero})`}</Text>
                <Text style={styles.avisoRowValue}>{item.fecha}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── NOTA ── */}
        {campos.nota && academia.ticketNota ? (
          <View style={styles.sectionPad}>
            <Text style={[styles.detailValueNormal, { textAlign: "center" }]}>
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
