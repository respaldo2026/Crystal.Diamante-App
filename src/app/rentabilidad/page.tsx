"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  Grid,
  Radio,
  message,
} from "antd";
import {
  FallOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
  TrophyOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { DatosReporteRentabilidad } from "@components/pdf/ReporteRentabilidadPDF";
import dayjs from "dayjs";
import "dayjs/locale/es";
dayjs.locale("es");

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { RangePicker } = DatePicker;

const formatoCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);

type PagoEstudiante = {
  id: string;
  origen_id: string;
  fecha_pago: string;
  monto: number;
  tipo: "inscripcion" | "mensualidad";
  curso_nombre: string;
  fuente: "abono" | "pago_completo";
  persona_nombre: string;
};

type PagoNomina = {
  id: string;
  fecha_pago: string;
  total_pagado: number;
  total_horas: number;
  profesor_nombre: string;
};

type ResumenCurso = {
  curso: string;
  inscripciones: number;
  mensualidades: number;
  total: number;
};

type ResumenProfesor = {
  nombre: string;
  horas: number;
  total: number;
};

type ModoFiltro = "mes" | "rango" | "todo";

type RentabilidadCurso = {
  curso: string;
  ingresos: number;
  egresosAsignados: number;
  ganancia: number;
  margen: number;
};

type ResumenMes = {
  mesKey: string;
  mesLabel: string;
  ingresos: number;
  egresos: number;
  ganancia: number;
};

export default function RentabilidadPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesFiltro, setMesFiltro] = useState<dayjs.Dayjs>(dayjs());
  const [rangoFiltro, setRangoFiltro] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf("year"),
    dayjs(),
  ]);
  const [loading, setLoading] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [pagosEstudiantes, setPagosEstudiantes] = useState<PagoEstudiante[]>([]);
  const [pagosNomina, setPagosNomina] = useState<PagoNomina[]>([]);

  const periodoLabel = useMemo(() => {
    if (modoFiltro === "todo") return "Todo el historial";
    if (modoFiltro === "rango") {
      return `${rangoFiltro[0].format("DD/MM/YYYY")} — ${rangoFiltro[1].format("DD/MM/YYYY")}`;
    }
    return mesFiltro.format("MMMM YYYY");
  }, [modoFiltro, mesFiltro, rangoFiltro]);

  const cargarDatos = async () => {
    setLoading(true);

    let inicio: string | null = null;
    let fin: string | null = null;

    if (modoFiltro === "mes") {
      inicio = mesFiltro.startOf("month").format("YYYY-MM-DD");
      fin = mesFiltro.endOf("month").format("YYYY-MM-DD");
    } else if (modoFiltro === "rango") {
      inicio = rangoFiltro[0].startOf("day").format("YYYY-MM-DD");
      fin = rangoFiltro[1].endOf("day").format("YYYY-MM-DD");
    }
    // modoFiltro === "todo" => sin filtro de fechas

    try {
      const hoy = dayjs().endOf("day");

      // 1) Ingresos por abonos (fuente prioritaria cuando existen abonos)
      let qAbonos = supabaseBrowserClient
        .from("pagos_abonos")
        .select("id, pago_id, fecha_pago, monto_abono, pagos!pagos_abonos_pago_id_fkey(numero_cuota, tipo_cuota, matriculas!pagos_matricula_id_fkey(estudiante_id, cursos(nombre)))")
        .gt("monto_abono", 0);
      if (inicio) qAbonos = qAbonos.gte("fecha_pago", inicio);
      if (fin) qAbonos = qAbonos.lte("fecha_pago", fin);

      const { data: abonosData, error: abonosError } = await qAbonos;
      if (abonosError) throw abonosError;

      const pagoConAbonoIds = new Set(
        ((abonosData as any[]) || [])
          .map((a: any) => String(a?.pago_id || ""))
          .filter(Boolean)
      );

      const ingresosAbonos: PagoEstudiante[] = ((abonosData as any[]) || [])
        .map((a: any) => {
          const fecha = dayjs(a?.fecha_pago);
          if (!fecha.isValid() || fecha.isAfter(hoy)) return null;

          const pagoBase = a?.pagos;
          const tipo: "inscripcion" | "mensualidad" =
            Number(pagoBase?.numero_cuota || 0) === 0 ||
            String(pagoBase?.tipo_cuota || "").toLowerCase().includes("inscripcion")
              ? "inscripcion"
              : "mensualidad";

          return {
            id: `abono:${String(a?.id || "")}`,
            origen_id: String(a?.id || ""),
            fecha_pago: String(a?.fecha_pago || ""),
            monto: Number(a?.monto_abono || 0),
            tipo,
            curso_nombre: pagoBase?.matriculas?.cursos?.nombre || "Sin curso",
            fuente: "abono",
            persona_nombre: "Estudiante",
          } as PagoEstudiante;
        })
        .filter(Boolean) as PagoEstudiante[];

      // 2) Ingresos por pagos completos (solo pagos que NO tienen abonos)
      let qPagos = supabaseBrowserClient
        .from("pagos")
        .select("id, fecha_pago, monto, numero_cuota, tipo_cuota, matriculas!pagos_matricula_id_fkey(estudiante_id, cursos(nombre))")
        .eq("estado", "pagado");
      if (inicio) qPagos = qPagos.gte("fecha_pago", inicio);
      if (fin) qPagos = qPagos.lte("fecha_pago", fin);

      const { data: pagosData, error: pagosError } = await qPagos;
      if (pagosError) throw pagosError;

      const ingresosPagos: PagoEstudiante[] = ((pagosData as any[]) || [])
        .filter((p: any) => !pagoConAbonoIds.has(String(p?.id || "")))
        .map((p: any) => {
          const fecha = dayjs(p?.fecha_pago);
          if (!fecha.isValid() || fecha.isAfter(hoy)) return null;

          return {
            id: `pago:${String(p?.id || "")}`,
            origen_id: String(p?.id || ""),
            fecha_pago: String(p?.fecha_pago || ""),
            monto: Number(p?.monto || 0),
            tipo:
              Number(p?.numero_cuota || 0) === 0 ||
              String(p?.tipo_cuota || "").toLowerCase().includes("inscripcion")
                ? "inscripcion"
                : "mensualidad",
            curso_nombre: p?.matriculas?.cursos?.nombre || "Sin curso",
            fuente: "pago_completo",
            persona_nombre: "Estudiante",
          } as PagoEstudiante;
        })
        .filter(Boolean) as PagoEstudiante[];

      const estudianteIds = Array.from(
        new Set(
          [
            ...((abonosData as any[]) || []).map((a: any) => String(a?.pagos?.matriculas?.estudiante_id || "")),
            ...((pagosData as any[]) || []).map((p: any) => String(p?.matriculas?.estudiante_id || "")),
          ].filter(Boolean)
        )
      );

      const estudiantesMap = new Map<string, string>();
      if (estudianteIds.length > 0) {
        const { data: perfilesData, error: perfilesError } = await supabaseBrowserClient
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", estudianteIds);

        if (perfilesError) throw perfilesError;

        (perfilesData || []).forEach((perfil: any) => {
          const id = String(perfil?.id || "");
          if (!id) return;
          estudiantesMap.set(id, String(perfil?.nombre_completo || "Estudiante"));
        });
      }

      const ingresosAbonosConPersona = ingresosAbonos.map((ing, index) => {
        const estudianteId = String((abonosData as any[])?.[index]?.pagos?.matriculas?.estudiante_id || "");
        return {
          ...ing,
          persona_nombre: estudiantesMap.get(estudianteId) || "Estudiante",
        };
      });

      const pagosSinAbonoFuente = ((pagosData as any[]) || []).filter(
        (p: any) => !pagoConAbonoIds.has(String(p?.id || ""))
      );

      const ingresosPagosConPersona = ingresosPagos.map((ing, index) => {
        const estudianteId = String(pagosSinAbonoFuente?.[index]?.matriculas?.estudiante_id || "");
        return {
          ...ing,
          persona_nombre: estudiantesMap.get(estudianteId) || "Estudiante",
        };
      });

      // Dedupe defensivo por id lógico
      const ingresosMap = new Map<string, PagoEstudiante>();
      [...ingresosAbonosConPersona, ...ingresosPagosConPersona].forEach((ing) => {
        if (!ing?.id) return;
        ingresosMap.set(ing.id, ing);
      });
      setPagosEstudiantes(Array.from(ingresosMap.values()));

      // 3) Egresos reales por clases ya pagadas (sin doble conteo por id de sesión)
      const HORAS_FIJAS_POR_CLASE = 3;
      let qSesionesPagadas = supabaseBrowserClient
        .from("sesiones_clase")
        .select("id, fecha, estado_pago, profesor_id, perfiles!sesiones_clase_profesor_id_fkey(nombre_completo, valor_hora)")
        .eq("estado_pago", "pagado");
      if (inicio) qSesionesPagadas = qSesionesPagadas.gte("fecha", inicio);
      if (fin) qSesionesPagadas = qSesionesPagadas.lte("fecha", fin);

      const { data: sesionesPagadas, error: sesionesError } = await qSesionesPagadas;
      if (sesionesError) throw sesionesError;

      const nominaMap = new Map<string, PagoNomina>();
      ((sesionesPagadas as any[]) || []).forEach((s: any) => {
        const fecha = dayjs(s?.fecha);
        if (!fecha.isValid() || fecha.isAfter(hoy)) return;

        const idSesion = String(s?.id || "");
        if (!idSesion || nominaMap.has(idSesion)) return;

        const valorHora = Number(s?.perfiles?.valor_hora || 0);
        nominaMap.set(idSesion, {
          id: idSesion,
          fecha_pago: String(s?.fecha || ""),
          total_horas: HORAS_FIJAS_POR_CLASE,
          total_pagado: HORAS_FIJAS_POR_CLASE * valorHora,
          profesor_nombre: s?.perfiles?.nombre_completo || "Sin nombre",
        });
      });

      setPagosNomina(Array.from(nominaMap.values()));
    } catch (err) {
      console.error("Error cargando rentabilidad:", err);
      message.error("No se pudieron cargar datos de rentabilidad");
      setPagosEstudiantes([]);
      setPagosNomina([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoFiltro, mesFiltro, rangoFiltro]);

  const totalIngresos = useMemo(
    () => pagosEstudiantes.reduce((s, p) => s + p.monto, 0),
    [pagosEstudiantes]
  );
  const totalInscripciones = useMemo(
    () => pagosEstudiantes.filter((p) => p.tipo === "inscripcion").reduce((s, p) => s + p.monto, 0),
    [pagosEstudiantes]
  );
  const totalMensualidades = useMemo(
    () => pagosEstudiantes.filter((p) => p.tipo === "mensualidad").reduce((s, p) => s + p.monto, 0),
    [pagosEstudiantes]
  );
  const totalEgresos = useMemo(
    () => pagosNomina.reduce((s, p) => s + p.total_pagado, 0),
    [pagosNomina]
  );
  const totalHorasPagadas = useMemo(
    () => pagosNomina.reduce((s, p) => s + p.total_horas, 0),
    [pagosNomina]
  );

  const resumenFuentesIngreso = useMemo(() => {
    const abonos = pagosEstudiantes.filter((p) => p.fuente === "abono");
    const pagosCompletos = pagosEstudiantes.filter((p) => p.fuente === "pago_completo");
    return {
      abonosCount: abonos.length,
      pagosCompletosCount: pagosCompletos.length,
      abonosMonto: abonos.reduce((s, p) => s + p.monto, 0),
      pagosCompletosMonto: pagosCompletos.reduce((s, p) => s + p.monto, 0),
    };
  }, [pagosEstudiantes]);

  const ganancia = totalIngresos - totalEgresos;
  const margen = totalIngresos > 0 ? (ganancia / totalIngresos) * 100 : 0;
  const esRentable = ganancia >= 0;

  const ingresosPorCurso = useMemo<ResumenCurso[]>(() => {
    const map: Record<string, ResumenCurso> = {};
    pagosEstudiantes.forEach((p) => {
      if (!map[p.curso_nombre])
        map[p.curso_nombre] = { curso: p.curso_nombre, inscripciones: 0, mensualidades: 0, total: 0 };
      const entry = map[p.curso_nombre]!;
      entry.total += p.monto;
      if (p.tipo === "inscripcion") entry.inscripciones += p.monto;
      else entry.mensualidades += p.monto;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [pagosEstudiantes]);

  const egresosPorProfesor = useMemo<ResumenProfesor[]>(() => {
    const map: Record<string, ResumenProfesor> = {};
    pagosNomina.forEach((p) => {
      if (!map[p.profesor_nombre])
        map[p.profesor_nombre] = { nombre: p.profesor_nombre, horas: 0, total: 0 };
      const entry = map[p.profesor_nombre]!;
      entry.horas += p.total_horas;
      entry.total += p.total_pagado;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [pagosNomina]);

  const coberturaEgresos =
    totalIngresos > 0 ? Math.round((totalEgresos / totalIngresos) * 100) : 0;

  // Rentabilidad por curso (egresos distribuidos proporcionalmente)
  const rentabilidadPorCurso = useMemo<RentabilidadCurso[]>(() => {
    return ingresosPorCurso.map((c) => {
      const egresosAsignados =
        totalIngresos > 0 ? (c.total / totalIngresos) * totalEgresos : 0;
      const ganCurso = c.total - egresosAsignados;
      return {
        curso: c.curso,
        ingresos: c.total,
        egresosAsignados: Math.round(egresosAsignados),
        ganancia: Math.round(ganCurso),
        margen: c.total > 0 ? (ganCurso / c.total) * 100 : 0,
      };
    });
  }, [ingresosPorCurso, totalIngresos, totalEgresos]);

  // Resumen mes a mes (solo relevante en modo rango o todo)
  const resumenPorMes = useMemo<ResumenMes[]>(() => {
    const map: Record<string, ResumenMes> = {};
    pagosEstudiantes.forEach((p) => {
      const key = p.fecha_pago.slice(0, 7); // YYYY-MM
      if (!map[key])
        map[key] = {
          mesKey: key,
          mesLabel: dayjs(key + "-01").format("MMMM YYYY"),
          ingresos: 0,
          egresos: 0,
          ganancia: 0,
        };
      map[key]!.ingresos += p.monto;
    });
    pagosNomina.forEach((p) => {
      const key = p.fecha_pago.slice(0, 7);
      if (!map[key])
        map[key] = {
          mesKey: key,
          mesLabel: dayjs(key + "-01").format("MMMM YYYY"),
          ingresos: 0,
          egresos: 0,
          ganancia: 0,
        };
      map[key]!.egresos += p.total_pagado;
    });
    return Object.values(map)
      .map((m) => ({ ...m, ganancia: m.ingresos - m.egresos }))
      .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  }, [pagosEstudiantes, pagosNomina]);

  const datosReporte = useMemo<DatosReporteRentabilidad>(
    () => ({
      periodo: periodoLabel,
      academia: "Academia Crystal Diamante",
      totalIngresos,
      totalInscripciones,
      totalMensualidades,
      totalEgresos,
      totalHorasPagadas,
      ganancia,
      margen,
      ingresosPorCurso,
      egresosPorProfesor,
    }),
    [
      periodoLabel,
      totalIngresos,
      totalInscripciones,
      totalMensualidades,
      totalEgresos,
      totalHorasPagadas,
      ganancia,
      margen,
      ingresosPorCurso,
      egresosPorProfesor,
    ]
  );

  const descargarPdf = async (tipo: "completo" | "ingresos" | "egresos") => {
    setGenerandoPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ReporteCompleto, ReporteIngresos, ReporteEgresos } = await import(
        "@components/pdf/ReporteRentabilidadPDF"
      );
      let documento;
      let nombre: string;
      if (tipo === "ingresos") {
        documento = React.createElement(ReporteIngresos, datosReporte);
        nombre = `Ingresos-${periodoLabel}`;
      } else if (tipo === "egresos") {
        documento = React.createElement(ReporteEgresos, datosReporte);
        nombre = `Egresos-${periodoLabel}`;
      } else {
        documento = React.createElement(ReporteCompleto, datosReporte);
        nombre = `PYG-${periodoLabel}`;
      }
      const blob = await pdf(documento as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombre}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando PDF:", err);
      message.error("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} wrap>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            Analisis de Rentabilidad — P&G
          </Title>
          <Text type="secondary">
            Ingresos (mensualidades + inscripciones) vs pagos a profesoras
          </Text>
        </Col>
        <Col>
          <Dropdown
            menu={{
              items: [
                {
                  key: "completo",
                  label: "Reporte completo P&G",
                  icon: <FilePdfOutlined />,
                  onClick: () => void descargarPdf("completo"),
                },
                {
                  key: "ingresos",
                  label: "Solo Ingresos por Curso",
                  icon: <FilePdfOutlined />,
                  onClick: () => void descargarPdf("ingresos"),
                },
                {
                  key: "egresos",
                  label: "Solo Egresos por Profesora",
                  icon: <FilePdfOutlined />,
                  onClick: () => void descargarPdf("egresos"),
                },
              ],
            }}
          >
            <Button
              icon={<FilePdfOutlined />}
              type="primary"
              ghost
              loading={generandoPdf}
              disabled={loading || totalIngresos + totalEgresos === 0}
            >
              {isMobile ? "PDF" : "Exportar PDF"}
            </Button>
          </Dropdown>
        </Col>
      </Row>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 24 }}>
        <Space wrap>
          <Radio.Group
            value={modoFiltro}
            onChange={(e) => setModoFiltro(e.target.value as ModoFiltro)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="mes">Por mes</Radio.Button>
            <Radio.Button value="rango">Rango fechas</Radio.Button>
            <Radio.Button value="todo">Todo el historial</Radio.Button>
          </Radio.Group>

          {modoFiltro === "mes" && (
            <DatePicker
              picker="month"
              value={mesFiltro}
              onChange={(v) => v && setMesFiltro(v)}
              format="MMMM YYYY"
              allowClear={false}
            />
          )}

          {modoFiltro === "rango" && (
            <RangePicker
              value={rangoFiltro}
              onChange={(v) => {
                if (v && v[0] && v[1]) setRangoFiltro([v[0], v[1]]);
              }}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          )}

          <Button icon={<ReloadOutlined />} onClick={() => void cargarDatos()} loading={loading}>
            Actualizar
          </Button>
        </Space>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Periodo: <strong>{periodoLabel}</strong>
          </Text>
        </div>
      </Card>

      <Spin spinning={loading}>
        {/* KPI Cards */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Ingresos"
                value={totalIngresos}
                formatter={(v) => formatoCOP(Number(v))}
                prefix={<RiseOutlined />}
                valueStyle={{ color: "#52c41a", fontSize: isMobile ? 16 : 20 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Inscripciones + Mensualidades
              </Text>
              <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {pagosEstudiantes.length} registros: {resumenFuentesIngreso.abonosCount} abonos ({formatoCOP(resumenFuentesIngreso.abonosMonto)}) + {resumenFuentesIngreso.pagosCompletosCount} pagos completos ({formatoCOP(resumenFuentesIngreso.pagosCompletosMonto)})
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Egresos"
                value={totalEgresos}
                formatter={(v) => formatoCOP(Number(v))}
                prefix={<FallOutlined />}
                valueStyle={{ color: "#ff4d4f", fontSize: isMobile ? 16 : 20 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {totalHorasPagadas}h liquidadas a profesoras
              </Text>
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card>
              <Statistic
                title={esRentable ? "Ganancia Neta" : "Perdida Neta"}
                value={Math.abs(ganancia)}
                formatter={(v) => formatoCOP(Number(v))}
                prefix={esRentable ? <TrophyOutlined /> : <WarningOutlined />}
                valueStyle={{
                  color: esRentable ? "#52c41a" : "#ff4d4f",
                  fontSize: isMobile ? 16 : 20,
                }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Resultado neto del periodo
              </Text>
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Margen"
                value={Math.abs(margen)}
                precision={1}
                suffix="%"
                prefix={esRentable ? <RiseOutlined /> : <FallOutlined />}
                valueStyle={{
                  color: esRentable ? "#52c41a" : "#ff4d4f",
                  fontSize: isMobile ? 16 : 20,
                }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {esRentable ? "Margen de ganancia" : "Margen de perdida"}
              </Text>
            </Card>
          </Col>
        </Row>

        {/* Cobertura */}
        {totalIngresos > 0 && (
          <Card style={{ marginBottom: 24 }}>
            <Text strong>Cobertura de egresos sobre ingresos</Text>
            <Progress
              percent={Math.min(100, coberturaEgresos)}
              status={coberturaEgresos <= 100 ? "success" : "exception"}
              format={(p) => `${p}%`}
              style={{ marginTop: 8 }}
            />
            <Row gutter={16} style={{ marginTop: 4 }}>
              <Col>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  0% — Sin egresos
                </Text>
              </Col>
              <Col flex="auto" style={{ textAlign: "right" }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  100% — Punto de equilibrio
                </Text>
              </Col>
            </Row>
          </Card>
        )}

        {/* Alerta resumen */}
        {totalIngresos === 0 && !loading ? (
          <Alert
            message="Sin datos en este periodo"
            description="No hay pagos registrados de estudiantes en el periodo seleccionado"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
        ) : (
          <Alert
            message={
              esRentable
                ? `Periodo rentable — Ganancia: ${formatoCOP(ganancia)}`
                : `Periodo en perdida — Deficit: ${formatoCOP(Math.abs(ganancia))}`
            }
            description={`Margen: ${margen.toFixed(1)}% | Ingresos: ${formatoCOP(totalIngresos)} | Egresos profesoras: ${formatoCOP(totalEgresos)}`}
            type={esRentable ? "success" : "error"}
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Divider />

        <Card
          title="Trazabilidad de ingresos considerados"
          extra={<Text type="secondary" style={{ fontSize: 12 }}>Origen exacto del total de ingresos del periodo</Text>}
          style={{ marginBottom: 24 }}
        >
          <Table<PagoEstudiante>
            dataSource={pagosEstudiantes}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 12, hideOnSinglePage: true }}
            columns={[
              {
                title: "Fecha",
                dataIndex: "fecha_pago",
                key: "fecha_pago",
                render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY") : "-"),
              },
              {
                title: "Fuente",
                dataIndex: "fuente",
                key: "fuente",
                render: (v: PagoEstudiante["fuente"]) => (
                  <Tag color={v === "abono" ? "gold" : "blue"}>{v === "abono" ? "Abono" : "Pago completo"}</Tag>
                ),
              },
              {
                title: "Tipo",
                dataIndex: "tipo",
                key: "tipo",
                render: (v: PagoEstudiante["tipo"]) => (
                  <Tag color={v === "inscripcion" ? "green" : "geekblue"}>{v === "inscripcion" ? "Inscripción" : "Mensualidad"}</Tag>
                ),
              },
              {
                title: "Curso",
                dataIndex: "curso_nombre",
                key: "curso_nombre",
                ellipsis: true,
              },
              {
                title: "Persona",
                dataIndex: "persona_nombre",
                key: "persona_nombre",
                ellipsis: true,
              },
              {
                title: "ID origen",
                dataIndex: "origen_id",
                key: "origen_id",
                ellipsis: true,
                render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
              },
              {
                title: "Monto",
                dataIndex: "monto",
                key: "monto",
                align: "right",
                render: (v: number) => <Text strong>{formatoCOP(v)}</Text>,
              },
            ]}
            locale={{ emptyText: "Sin ingresos en este periodo" }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={6}>
                  <Text strong>Total ingresos considerados</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <Text strong style={{ color: "#52c41a" }}>{formatoCOP(totalIngresos)}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>

        <Row gutter={[24, 24]}>
          {/* Ingresos por curso */}
          <Col xs={24} lg={14}>
            <Card
              title={`Ingresos por Curso — ${formatoCOP(totalIngresos)}`}
              extra={
                <Space size="small" wrap>
                  <Tag color="green">Inscripciones: {formatoCOP(totalInscripciones)}</Tag>
                  <Tag color="blue">Mensualidades: {formatoCOP(totalMensualidades)}</Tag>
                </Space>
              }
            >
              <Table<ResumenCurso>
                dataSource={ingresosPorCurso}
                rowKey="curso"
                size="small"
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                columns={[
                  {
                    title: "Curso",
                    dataIndex: "curso",
                    key: "curso",
                    ellipsis: true,
                  },
                  {
                    title: "Inscripciones",
                    dataIndex: "inscripciones",
                    key: "inscripciones",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#52c41a" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Mensualidades",
                    dataIndex: "mensualidades",
                    key: "mensualidades",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#1677ff" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Total",
                    dataIndex: "total",
                    key: "total",
                    align: "right",
                    render: (v: number) => <Text strong>{formatoCOP(v)}</Text>,
                  },
                ]}
                locale={{ emptyText: "Sin ingresos en este periodo" }}
                summary={() =>
                  ingresosPorCurso.length > 1 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <Text strong>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Text strong style={{ color: "#52c41a" }}>
                          {formatoCOP(totalInscripciones)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Text strong style={{ color: "#1677ff" }}>
                          {formatoCOP(totalMensualidades)}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Text strong>{formatoCOP(totalIngresos)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null
                }
              />
            </Card>
          </Col>

          {/* Egresos por profesora */}
          <Col xs={24} lg={10}>
            <Card title={`Egresos Profesoras — ${formatoCOP(totalEgresos)}`}>
              <Table<ResumenProfesor>
                dataSource={egresosPorProfesor}
                rowKey="nombre"
                size="small"
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                columns={[
                  {
                    title: "Profesora",
                    dataIndex: "nombre",
                    key: "nombre",
                    ellipsis: true,
                    render: (nombre: string) => (
                      <Space>
                        <TeamOutlined style={{ color: "#722ed1" }} />
                        <Text>{nombre}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: "Horas",
                    dataIndex: "horas",
                    key: "horas",
                    align: "right",
                    render: (v: number) => <Tag color="blue">{v}h</Tag>,
                  },
                  {
                    title: "Total",
                    dataIndex: "total",
                    key: "total",
                    align: "right",
                    render: (v: number) => (
                      <Text strong style={{ color: "#ff4d4f" }}>
                        {formatoCOP(v)}
                      </Text>
                    ),
                  },
                ]}
                locale={{ emptyText: "Sin pagos a profesoras en este periodo" }}
                summary={() =>
                  egresosPorProfesor.length > 1 ? (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <Text strong>Total</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Tag color="blue">{totalHorasPagadas}h</Tag>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Text strong style={{ color: "#ff4d4f" }}>
                          {formatoCOP(totalEgresos)}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null
                }
              />
              {pagosNomina.length === 0 && !loading && (
                <Alert
                  message="Sin pagos a profesoras en este periodo"
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* Rentabilidad por Grupo / Curso */}
        {rentabilidadPorCurso.length > 0 && (
          <>
            <Divider />
            <Card
              title="Rentabilidad por Grupo"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Egresos distribuidos proporcionalmente
                </Text>
              }
              style={{ marginBottom: 24 }}
            >
              <Table<RentabilidadCurso>
                dataSource={rentabilidadPorCurso}
                rowKey="curso"
                size="small"
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                rowClassName={(r) => (r.ganancia >= 0 ? "" : "row-perdida")}
                columns={[
                  {
                    title: "Grupo / Curso",
                    dataIndex: "curso",
                    key: "curso",
                    ellipsis: true,
                  },
                  {
                    title: "Ingresos",
                    dataIndex: "ingresos",
                    key: "ingresos",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#52c41a" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Egresos (prop.)",
                    dataIndex: "egresosAsignados",
                    key: "egresosAsignados",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#ff4d4f" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Ganancia / Perdida",
                    dataIndex: "ganancia",
                    key: "ganancia",
                    align: "right",
                    render: (v: number) => (
                      <Text strong style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f" }}>
                        {v >= 0 ? "+" : ""}{formatoCOP(v)}
                      </Text>
                    ),
                    sorter: (a, b) => a.ganancia - b.ganancia,
                  },
                  {
                    title: "Margen %",
                    dataIndex: "margen",
                    key: "margen",
                    align: "right",
                    render: (v: number) => (
                      <Tag color={v >= 0 ? "green" : "red"}>
                        {v.toFixed(1)}%
                      </Tag>
                    ),
                    sorter: (a, b) => a.margen - b.margen,
                  },
                ]}
              />
            </Card>
          </>
        )}

        {/* Evolucion mensual — solo en modo rango o todo */}
        {modoFiltro !== "mes" && resumenPorMes.length > 1 && (
          <>
            <Divider />
            <Card title="Evolucion Mensual" style={{ marginBottom: 24 }}>
              <Table<ResumenMes>
                dataSource={resumenPorMes}
                rowKey="mesKey"
                size="small"
                pagination={{ pageSize: 12, hideOnSinglePage: true }}
                columns={[
                  {
                    title: "Mes",
                    dataIndex: "mesLabel",
                    key: "mesLabel",
                    render: (v: string) => <Text strong>{v}</Text>,
                  },
                  {
                    title: "Ingresos",
                    dataIndex: "ingresos",
                    key: "ingresos",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#52c41a" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Egresos",
                    dataIndex: "egresos",
                    key: "egresos",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: "#ff4d4f" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Ganancia / Perdida",
                    dataIndex: "ganancia",
                    key: "ganancia",
                    align: "right",
                    render: (v: number) => (
                      <Text strong style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f" }}>
                        {v >= 0 ? "+" : ""}{formatoCOP(v)}
                      </Text>
                    ),
                  },
                  {
                    title: "Estado",
                    key: "estado",
                    align: "center",
                    render: (_: unknown, r: ResumenMes) =>
                      r.ganancia >= 0 ? (
                        <Tag color="green" icon={<RiseOutlined />}>Ganancia</Tag>
                      ) : (
                        <Tag color="red" icon={<FallOutlined />}>Perdida</Tag>
                      ),
                  },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <Text strong>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong style={{ color: "#52c41a" }}>{formatoCOP(totalIngresos)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong style={{ color: "#ff4d4f" }}>{formatoCOP(totalEgresos)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong style={{ color: ganancia >= 0 ? "#52c41a" : "#ff4d4f" }}>
                        {ganancia >= 0 ? "+" : ""}{formatoCOP(ganancia)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} />
                  </Table.Summary.Row>
                )}
              />
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
}