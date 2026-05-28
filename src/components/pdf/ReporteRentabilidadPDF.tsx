"use client";

import React from "react";
import * as ReactPDF from "@react-pdf/renderer";

const { Page, Text, View, Document, StyleSheet } = ReactPDF;

const BRAND = "#c0306e";
const BRAND_LIGHT = "#fdf0f6";
const GREEN = "#166534";
const GREEN_BG = "#dcfce7";
const RED = "#991b1b";
const RED_BG = "#fee2e2";
const GRAY = "#6b7280";
const DARK = "#1c1c2e";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    color: DARK,
  },
  header: {
    backgroundColor: BRAND,
    marginLeft: -32,
    marginRight: -32,
    marginTop: -32,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 9,
    color: "rgba(255,255,255,0.85)",
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    marginBottom: 8,
    marginTop: 16,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BRAND,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },
  kpiLabel: {
    fontSize: 7,
    color: GRAY,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  kpiSub: {
    fontSize: 7,
    color: GRAY,
    marginTop: 2,
  },
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: BRAND_LIGHT,
  },
  tableCell: {
    fontSize: 8,
    color: DARK,
  },
  tableCellRight: {
    fontSize: 8,
    textAlign: "right",
    color: DARK,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: "#f3f4f6",
    borderTopWidth: 1.5,
    borderTopColor: BRAND,
    marginTop: 2,
    borderRadius: 3,
  },
  totalCell: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  totalCellRight: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: DARK,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: GRAY,
  },
  resumenBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  resumenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  resumenLabel: {
    fontSize: 9,
    color: GRAY,
  },
  resumenValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginVertical: 8,
  },
});

const formatoCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);

export type DatosReporteRentabilidad = {
  periodo: string;
  academia: string;
  totalIngresos: number;
  totalInscripciones: number;
  totalMensualidades: number;
  totalEgresos: number;
  totalHorasPagadas: number;
  ganancia: number;
  margen: number;
  ingresosPorCurso: { curso: string; inscripciones: number; mensualidades: number; total: number }[];
  egresosPorProfesor: { nombre: string; horas: number; total: number }[];
};

// ── REPORTE COMPLETO ──────────────────────────────────────────────────────────
export const ReporteCompleto: React.FC<DatosReporteRentabilidad> = (d) => {
  const esRentable = d.ganancia >= 0;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analisis de Rentabilidad — P&G</Text>
          <Text style={styles.headerSub}>
            {d.academia} · {d.periodo}
          </Text>
        </View>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiBox, { backgroundColor: GREEN_BG }]}>
            <Text style={styles.kpiLabel}>Total Ingresos</Text>
            <Text style={[styles.kpiValue, { color: GREEN }]}>{formatoCOP(d.totalIngresos)}</Text>
            <Text style={styles.kpiSub}>Inscripciones + Mensualidades</Text>
          </View>
          <View style={[styles.kpiBox, { backgroundColor: RED_BG }]}>
            <Text style={styles.kpiLabel}>Total Egresos</Text>
            <Text style={[styles.kpiValue, { color: RED }]}>{formatoCOP(d.totalEgresos)}</Text>
            <Text style={styles.kpiSub}>{d.totalHorasPagadas}h liquidadas</Text>
          </View>
          <View
            style={[
              styles.kpiBox,
              { backgroundColor: esRentable ? GREEN_BG : RED_BG },
            ]}
          >
            <Text style={styles.kpiLabel}>{esRentable ? "Ganancia Neta" : "Perdida Neta"}</Text>
            <Text style={[styles.kpiValue, { color: esRentable ? GREEN : RED }]}>
              {formatoCOP(Math.abs(d.ganancia))}
            </Text>
            <Text style={styles.kpiSub}>Margen {d.margen.toFixed(1)}%</Text>
          </View>
        </View>

        {/* Resumen */}
        <View style={styles.resumenBox}>
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>Inscripciones</Text>
            <Text style={[styles.resumenValue, { color: GREEN }]}>
              {formatoCOP(d.totalInscripciones)}
            </Text>
          </View>
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>Mensualidades</Text>
            <Text style={[styles.resumenValue, { color: GREEN }]}>
              {formatoCOP(d.totalMensualidades)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>Total Ingresos</Text>
            <Text style={[styles.resumenValue, { color: GREEN }]}>
              {formatoCOP(d.totalIngresos)}
            </Text>
          </View>
          <View style={styles.resumenRow}>
            <Text style={styles.resumenLabel}>Pagos a Profesoras</Text>
            <Text style={[styles.resumenValue, { color: RED }]}>
              — {formatoCOP(d.totalEgresos)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.resumenRow}>
            <Text style={[styles.resumenLabel, { fontFamily: "Helvetica-Bold", fontSize: 10 }]}>
              {esRentable ? "GANANCIA NETA" : "PERDIDA NETA"}
            </Text>
            <Text
              style={[
                styles.resumenValue,
                { fontSize: 12, color: esRentable ? GREEN : RED },
              ]}
            >
              {esRentable ? "" : "— "}{formatoCOP(Math.abs(d.ganancia))}
            </Text>
          </View>
        </View>

        {/* Tabla ingresos */}
        <Text style={styles.sectionTitle}>Ingresos por Curso</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Curso</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Inscripciones</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Mensualidades</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Total</Text>
          </View>
          {d.ingresosPorCurso.map((c, i) => (
            <View key={c.curso} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { flex: 4 }]}>{c.curso}</Text>
              <Text style={[styles.tableCellRight, { flex: 2, color: GREEN }]}>
                {formatoCOP(c.inscripciones)}
              </Text>
              <Text style={[styles.tableCellRight, { flex: 2 }]}>
                {formatoCOP(c.mensualidades)}
              </Text>
              <Text style={[styles.tableCellRight, { flex: 2, fontFamily: "Helvetica-Bold" }]}>
                {formatoCOP(c.total)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.totalCell, { flex: 4 }]}>TOTAL</Text>
            <Text style={[styles.totalCellRight, { flex: 2, color: GREEN }]}>
              {formatoCOP(d.totalInscripciones)}
            </Text>
            <Text style={[styles.totalCellRight, { flex: 2 }]}>
              {formatoCOP(d.totalMensualidades)}
            </Text>
            <Text style={[styles.totalCellRight, { flex: 2 }]}>
              {formatoCOP(d.totalIngresos)}
            </Text>
          </View>
        </View>

        {/* Tabla egresos */}
        <Text style={styles.sectionTitle}>Egresos por Profesora</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 5 }]}>Profesora</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Horas</Text>
            <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: "right" }]}>Total Pagado</Text>
          </View>
          {d.egresosPorProfesor.map((p, i) => (
            <View key={p.nombre} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { flex: 5 }]}>{p.nombre}</Text>
              <Text style={[styles.tableCellRight, { flex: 2 }]}>{p.horas}h</Text>
              <Text style={[styles.tableCellRight, { flex: 3, color: RED }]}>
                {formatoCOP(p.total)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.totalCell, { flex: 5 }]}>TOTAL</Text>
            <Text style={[styles.totalCellRight, { flex: 2 }]}>{d.totalHorasPagadas}h</Text>
            <Text style={[styles.totalCellRight, { flex: 3, color: RED }]}>
              {formatoCOP(d.totalEgresos)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{d.academia}</Text>
          <Text style={styles.footerText}>Generado el {new Date().toLocaleDateString("es-CO")}</Text>
        </View>
      </Page>
    </Document>
  );
};

// ── REPORTE SOLO INGRESOS ────────────────────────────────────────────────────
export const ReporteIngresos: React.FC<DatosReporteRentabilidad> = (d) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reporte de Ingresos</Text>
        <Text style={styles.headerSub}>
          {d.academia} · {d.periodo}
        </Text>
      </View>
      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: GREEN_BG, flex: 1 }]}>
          <Text style={styles.kpiLabel}>Total Ingresos</Text>
          <Text style={[styles.kpiValue, { color: GREEN }]}>{formatoCOP(d.totalIngresos)}</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: GREEN_BG, flex: 1 }]}>
          <Text style={styles.kpiLabel}>Inscripciones</Text>
          <Text style={[styles.kpiValue, { color: GREEN }]}>{formatoCOP(d.totalInscripciones)}</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: GREEN_BG, flex: 1 }]}>
          <Text style={styles.kpiLabel}>Mensualidades</Text>
          <Text style={[styles.kpiValue, { color: GREEN }]}>{formatoCOP(d.totalMensualidades)}</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Detalle por Curso</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Curso</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Inscripciones</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Mensualidades</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Total</Text>
        </View>
        {d.ingresosPorCurso.map((c, i) => (
          <View key={c.curso} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <Text style={[styles.tableCell, { flex: 4 }]}>{c.curso}</Text>
            <Text style={[styles.tableCellRight, { flex: 2, color: GREEN }]}>
              {formatoCOP(c.inscripciones)}
            </Text>
            <Text style={[styles.tableCellRight, { flex: 2 }]}>
              {formatoCOP(c.mensualidades)}
            </Text>
            <Text style={[styles.tableCellRight, { flex: 2, fontFamily: "Helvetica-Bold" }]}>
              {formatoCOP(c.total)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={[styles.totalCell, { flex: 4 }]}>TOTAL</Text>
          <Text style={[styles.totalCellRight, { flex: 2, color: GREEN }]}>
            {formatoCOP(d.totalInscripciones)}
          </Text>
          <Text style={[styles.totalCellRight, { flex: 2 }]}>
            {formatoCOP(d.totalMensualidades)}
          </Text>
          <Text style={[styles.totalCellRight, { flex: 2 }]}>{formatoCOP(d.totalIngresos)}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{d.academia}</Text>
        <Text style={styles.footerText}>Generado el {new Date().toLocaleDateString("es-CO")}</Text>
      </View>
    </Page>
  </Document>
);

// ── REPORTE SOLO EGRESOS ─────────────────────────────────────────────────────
export const ReporteEgresos: React.FC<DatosReporteRentabilidad> = (d) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reporte de Egresos — Nomina Profesoras</Text>
        <Text style={styles.headerSub}>
          {d.academia} · {d.periodo}
        </Text>
      </View>
      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: RED_BG, flex: 1 }]}>
          <Text style={styles.kpiLabel}>Total Egresos</Text>
          <Text style={[styles.kpiValue, { color: RED }]}>{formatoCOP(d.totalEgresos)}</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: RED_BG, flex: 1 }]}>
          <Text style={styles.kpiLabel}>Horas Liquidadas</Text>
          <Text style={[styles.kpiValue, { color: RED }]}>{d.totalHorasPagadas}h</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: "#fef9c3", flex: 1 }]}>
          <Text style={styles.kpiLabel}>% sobre Ingresos</Text>
          <Text style={[styles.kpiValue, { color: "#854d0e" }]}>
            {d.totalIngresos > 0
              ? ((d.totalEgresos / d.totalIngresos) * 100).toFixed(1) + "%"
              : "—"}
          </Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Detalle por Profesora</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 5 }]}>Profesora</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Horas</Text>
          <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: "right" }]}>Total Pagado</Text>
        </View>
        {d.egresosPorProfesor.map((p, i) => (
          <View key={p.nombre} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <Text style={[styles.tableCell, { flex: 5 }]}>{p.nombre}</Text>
            <Text style={[styles.tableCellRight, { flex: 2 }]}>{p.horas}h</Text>
            <Text style={[styles.tableCellRight, { flex: 3, color: RED }]}>
              {formatoCOP(p.total)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={[styles.totalCell, { flex: 5 }]}>TOTAL</Text>
          <Text style={[styles.totalCellRight, { flex: 2 }]}>{d.totalHorasPagadas}h</Text>
          <Text style={[styles.totalCellRight, { flex: 3, color: RED }]}>
            {formatoCOP(d.totalEgresos)}
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{d.academia}</Text>
        <Text style={styles.footerText}>Generado el {new Date().toLocaleDateString("es-CO")}</Text>
      </View>
    </Page>
  </Document>
);
