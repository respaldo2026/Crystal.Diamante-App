"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  Grid,
} from "antd";
import {
  FallOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
  TrophyOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";
import "dayjs/locale/es";
dayjs.locale("es");

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const formatoCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);

type PagoEstudiante = {
  id: string;
  fecha_pago: string;
  monto: number;
  tipo: "inscripcion" | "mensualidad";
  curso_nombre: string;
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

export default function RentabilidadPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [mesFiltro, setMesFiltro] = useState<dayjs.Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [pagosEstudiantes, setPagosEstudiantes] = useState<PagoEstudiante[]>([]);
  const [pagosNomina, setPagosNomina] = useState<PagoNomina[]>([]);

  const cargarDatos = async () => {
    setLoading(true);
    const inicio = mesFiltro.startOf("month").format("YYYY-MM-DD");
    const fin = mesFiltro.endOf("month").format("YYYY-MM-DD");

    // Ingresos: pagos de estudiantes (mensualidades + inscripciones)
    const { data: pagosData } = await supabaseBrowserClient
      .from("pagos")
      .select(
        "id, fecha_pago, monto, numero_cuota, tipo_cuota, matriculas!pagos_matricula_id_fkey(cursos(nombre))"
      )
      .eq("estado", "pagado")
      .gte("fecha_pago", inicio)
      .lte("fecha_pago", fin);

    const parsed: PagoEstudiante[] = ((pagosData as any[]) || []).map((p) => ({
      id: p.id,
      fecha_pago: p.fecha_pago,
      monto: Number(p.monto) || 0,
      tipo:
        p.numero_cuota === 0 ||
        String(p.tipo_cuota || "").toLowerCase().includes("inscripcion")
          ? "inscripcion"
          : "mensualidad",
      curso_nombre: p.matriculas?.cursos?.nombre || "Sin curso",
    }));
    setPagosEstudiantes(parsed);

    // Egresos: pagos reales a profesoras (pagos_nomina)
    const { data: nominaData } = await supabaseBrowserClient
      .from("pagos_nomina")
      .select("id, fecha_pago, total_pagado, total_horas, perfiles(nombre_completo)")
      .gte("fecha_pago", inicio)
      .lte("fecha_pago", fin);

    const nominaParsed: PagoNomina[] = ((nominaData as any[]) || []).map((n) => ({
      id: n.id,
      fecha_pago: n.fecha_pago,
      total_pagado: Number(n.total_pagado) || 0,
      total_horas: Number(n.total_horas) || 0,
      profesor_nombre: n.perfiles?.nombre_completo || "Sin nombre",
    }));
    setPagosNomina(nominaParsed);

    setLoading(false);
  };

  useEffect(() => {
    void cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFiltro]);

  const totalIngresos = useMemo(
    () => pagosEstudiantes.reduce((s, p) => s + p.monto, 0),
    [pagosEstudiantes]
  );
  const totalInscripciones = useMemo(
    () =>
      pagosEstudiantes
        .filter((p) => p.tipo === "inscripcion")
        .reduce((s, p) => s + p.monto, 0),
    [pagosEstudiantes]
  );
  const totalMensualidades = useMemo(
    () =>
      pagosEstudiantes
        .filter((p) => p.tipo === "mensualidad")
        .reduce((s, p) => s + p.monto, 0),
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

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>
          ðŸ“Š AnÃ¡lisis de Rentabilidad â€” P&G
        </Title>
        <Text type="secondary">
          Ingresos reales (mensualidades + inscripciones) vs pagos a profesoras
        </Text>
      </Space>

      <Space style={{ marginBottom: 24 }} wrap>
        <DatePicker
          picker="month"
          value={mesFiltro}
          onChange={(v) => v && setMesFiltro(v)}
          format="MMMM YYYY"
          allowClear={false}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void cargarDatos()} loading={loading}>
          Actualizar
        </Button>
      </Space>

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
                {totalHorasPagadas}h liquidadas
              </Text>
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card>
              <Statistic
                title={esRentable ? "Ganancia Neta" : "PÃ©rdida Neta"}
                value={Math.abs(ganancia)}
                formatter={(v) => formatoCOP(Number(v))}
                prefix={esRentable ? <TrophyOutlined /> : <WarningOutlined />}
                valueStyle={{
                  color: esRentable ? "#52c41a" : "#ff4d4f",
                  fontSize: isMobile ? 16 : 20,
                }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Resultado neto del mes
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
                {esRentable ? "Margen de ganancia" : "Margen de pÃ©rdida"}
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
                  0% â€” Sin egresos
                </Text>
              </Col>
              <Col flex="auto" style={{ textAlign: "right" }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  100% â€” Punto de equilibrio
                </Text>
              </Col>
            </Row>
          </Card>
        )}

        {/* Alerta resumen */}
        {totalIngresos === 0 && !loading ? (
          <Alert
            message="Sin datos en este perÃ­odo"
            description="No hay pagos registrados de estudiantes en el mes seleccionado"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
        ) : (
          <Alert
            message={
              esRentable
                ? `âœ… Mes rentable â€” Ganancia: ${formatoCOP(ganancia)}`
                : `âŒ Mes en pÃ©rdida â€” DÃ©ficit: ${formatoCOP(Math.abs(ganancia))}`
            }
            description={`Margen: ${margen.toFixed(1)}% | Ingresos: ${formatoCOP(totalIngresos)} | Egresos profesoras: ${formatoCOP(totalEgresos)}`}
            type={esRentable ? "success" : "error"}
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Divider />

        <Row gutter={[24, 24]}>
          {/* Ingresos por curso */}
          <Col xs={24} lg={14}>
            <Card
              title={`ðŸ’° Ingresos por Curso â€” ${formatoCOP(totalIngresos)}`}
                          >
              <Table<ResumenProfesor>
                dataSource={egresosPorProfesor}
                rowKey="nombre"
                size="small"
                pagination={false}
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
                    title: "Pagado",
                    dataIndex: "pagado",
                    key: "pagado",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: v > 0 ? "#ff4d4f" : "#999" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Pendiente",
                    dataIndex: "pendiente",
                    key: "pendiente",
                    align: "right",
                    render: (v: number) => (
                      <Text style={{ color: v > 0 ? "#fa8c16" : "#999" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                  {
                    title: "Total",
                    dataIndex: "total",
                    key: "total",
                    align: "right",
                    render: (v: number) => (
                      <Text strong style={{ color: "#ff4d4f" }}>{formatoCOP(v)}</Text>
                    ),
                  },
                ]}
                locale={{ emptyText: "Sin clases dictadas en este periodo" }}
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
                        <Text strong style={{ color: "#ff4d4f" }}>{formatoCOP(totalEgresos)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Text strong style={{ color: "#fa8c16" }}>{formatoCOP(0)}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        <Text strong>{formatoCOP(totalEgresos)}</Text>
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
      </Spin>
    </div>
  );
}
