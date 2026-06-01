"use client";

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Empty,
  Grid,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  GiftOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { normalizeModalidadPago } from "@/types/payment-plans";
import { getMontoProgramado, getVisiblePaymentStatus } from "@utils/payment-balances";
import { construirNombreGrupo } from "@utils/grupos";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

type FiltroPeriodo = "mes_actual" | "mes_anterior" | "trimestre_actual" | "personalizado";

type KitRow = {
  key: string;
  estudianteNombre: string;
  estudianteTelefono: string;
  grupoNombre: string;
  planLabel: string;
  ultimoPagoFecha: string | null;
  ultimoPagoPeriodo: string;
  ultimoPagoMonto: number;
  proximoPagoFecha: string | null;
  proximoPagoPeriodo: string;
  proximoPagoMonto: number;
  estadoPagoLabel: string;
  estadoPagoColor: "green" | "orange" | "red" | "default";
  puedeRecibirKit: boolean;
  pagoEnPeriodo: boolean;
  vencido: boolean;
};

const formatoCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor || 0);

const esPagoInscripcion = (pago: any) => {
  const numero = Number(pago?.numero_cuota || 0);
  const periodo = String(pago?.periodo_pagado || "").toLowerCase();
  return numero === 0 || periodo.includes("inscrip") || periodo.includes("matric");
};

const obtenerRangoPeriodo = (
  filtroPeriodo: FiltroPeriodo,
  rangoPersonalizado: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null,
) => {
  const hoy = dayjs();

  if (filtroPeriodo === "personalizado" && rangoPersonalizado?.[0] && rangoPersonalizado?.[1]) {
    return {
      inicio: rangoPersonalizado[0].startOf("day"),
      fin: rangoPersonalizado[1].endOf("day"),
      etiqueta: `${rangoPersonalizado[0].format("DD/MM/YYYY")} - ${rangoPersonalizado[1].format("DD/MM/YYYY")}`,
    };
  }

  if (filtroPeriodo === "mes_anterior") {
    const mesAnterior = hoy.subtract(1, "month");
    return {
      inicio: mesAnterior.startOf("month"),
      fin: mesAnterior.endOf("month"),
      etiqueta: mesAnterior.format("MMMM YYYY"),
    };
  }

  if (filtroPeriodo === "trimestre_actual") {
    const q = Math.floor(hoy.month() / 3);
    const inicio = hoy.month(q * 3).startOf("month");
    const fin = hoy.month(q * 3 + 2).endOf("month");
    return {
      inicio,
      fin,
      etiqueta: `T${q + 1} ${hoy.year()}`,
    };
  }

  return {
    inicio: hoy.startOf("month"),
    fin: hoy.endOf("month"),
    etiqueta: hoy.format("MMMM YYYY"),
  };
};

export default function KitMensualPage() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes_actual");
  const [rangoPersonalizado, setRangoPersonalizado] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const [gruposDisponibles, setGruposDisponibles] = useState<Array<{ value: string; label: string }>>([]);
  const [rows, setRows] = useState<KitRow[]>([]);

  const periodo = useMemo(() => obtenerRangoPeriodo(filtroPeriodo, rangoPersonalizado), [filtroPeriodo, rangoPersonalizado]);

  useEffect(() => {
    const cargarGrupos = async () => {
      const { data, error: cursosError } = await supabaseBrowserClient
        .from("cursos")
        .select("id, nombre, dias_semana, hora_inicio, programas(nombre)")
        .order("nombre", { ascending: true });

      if (cursosError) {
        console.warn("No se pudieron cargar grupos para kit mensual", cursosError);
        return;
      }

      const options = (data || []).map((curso: any) => ({
        value: String(curso.id),
        label: construirNombreGrupo(curso),
      }));

      setGruposDisponibles(options);
    };

    void cargarGrupos();
  }, []);

  useEffect(() => {
    const cargarEstadoKit = async () => {
      try {
        setLoading(true);
        setError(null);

        let queryMatriculas = supabaseBrowserClient
          .from("matriculas")
          .select("id, estado, fecha_inicio, modalidad_pago, porcentaje_productos, estudiante_id, curso_id, perfiles!matriculas_estudiante_id_fkey(id, nombre_completo, telefono), cursos(id, nombre, dias_semana, hora_inicio, programas(nombre))")
          .order("fecha_inicio", { ascending: false });

        if (filtroGrupo) {
          queryMatriculas = queryMatriculas.eq("curso_id", filtroGrupo);
        }

        const { data: matriculasData, error: matriculasError } = await queryMatriculas;
        if (matriculasError) throw matriculasError;

        const matriculasMensuales = (matriculasData || []).filter((m: any) => {
          const modalidad = normalizeModalidadPago(m?.modalidad_pago);
          const estado = String(m?.estado || "").toLowerCase();
          const esInactiva = ["cancelado", "cancelada", "retirado", "retirada", "anulado", "anulada"].includes(estado);
          return modalidad !== "POR_CLASE" && !esInactiva;
        });

        if (matriculasMensuales.length === 0) {
          setRows([]);
          return;
        }

        const matriculaIds = matriculasMensuales.map((m: any) => String(m.id));

        const { data: pagosData, error: pagosError } = await supabaseBrowserClient
          .from("pagos")
          .select("id, matricula_id, estado, fecha_pago, fecha_vencimiento, numero_cuota, periodo_pagado, monto, monto_programado, total_abonado, saldo_pendiente, descuento_aplicado")
          .in("matricula_id", matriculaIds)
          .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

        if (pagosError) throw pagosError;

        const pagosPorMatricula = new Map<string, any[]>();
        (pagosData || []).forEach((p: any) => {
          const key = String(p?.matricula_id || "");
          if (!key) return;
          const arr = pagosPorMatricula.get(key) || [];
          arr.push(p);
          pagosPorMatricula.set(key, arr);
        });

        const inicio = periodo.inicio;
        const fin = periodo.fin;
        const hoy = dayjs().endOf("day");

        const dataRows: KitRow[] = matriculasMensuales.map((m: any) => {
          const perfil = Array.isArray(m?.perfiles) ? m.perfiles[0] : m?.perfiles;
          const curso = Array.isArray(m?.cursos) ? m.cursos[0] : m?.cursos;
          const modalidad = normalizeModalidadPago(m?.modalidad_pago);
          const planLabel = modalidad === "MENSUAL_100" ? "Mensual 100" : "Mensual 70";

          const pagosMatricula = (pagosPorMatricula.get(String(m.id)) || []).filter((p: any) => !esPagoInscripcion(p));

          const pagosPagados = pagosMatricula
            .filter((p: any) => String(p?.estado || "").toLowerCase() === "pagado")
            .sort((a: any, b: any) => dayjs(b?.fecha_pago || 0).valueOf() - dayjs(a?.fecha_pago || 0).valueOf());

          const ultimoPago = pagosPagados[0] || null;

          const pagosPendientes = pagosMatricula
            .filter((p: any) => String(p?.estado || "").toLowerCase() !== "pagado")
            .sort((a: any, b: any) => {
              const fa = dayjs(a?.fecha_vencimiento || "9999-12-31").valueOf();
              const fb = dayjs(b?.fecha_vencimiento || "9999-12-31").valueOf();
              return fa - fb;
            });

          const proximoPago = pagosPendientes[0] || null;

          const pagoEnPeriodo = pagosPagados.some((p: any) => {
            if (!p?.fecha_pago) return false;
            const fp = dayjs(p.fecha_pago);
            return fp.isBetween(inicio, fin, "day", "[]");
          });

          const proximoVencido = Boolean(
            proximoPago?.fecha_vencimiento && dayjs(proximoPago.fecha_vencimiento).endOf("day").isBefore(hoy),
          );

          let estadoPagoLabel: KitRow["estadoPagoLabel"] = "Sin programación";
          let estadoPagoColor: KitRow["estadoPagoColor"] = "default";

          if (pagoEnPeriodo) {
            estadoPagoLabel = "Pagó en el período";
            estadoPagoColor = "green";
          } else if (proximoVencido) {
            estadoPagoLabel = "Pendiente vencido";
            estadoPagoColor = "red";
          } else if (proximoPago) {
            estadoPagoLabel = "Pendiente por pagar";
            estadoPagoColor = "orange";
          }

          return {
            key: String(m.id),
            estudianteNombre: String(perfil?.nombre_completo || "Estudiante"),
            estudianteTelefono: String(perfil?.telefono || ""),
            grupoNombre: construirNombreGrupo(curso),
            planLabel,
            ultimoPagoFecha: ultimoPago?.fecha_pago || null,
            ultimoPagoPeriodo: String(
              ultimoPago?.periodo_pagado ||
              (Number.isFinite(Number(ultimoPago?.numero_cuota)) ? `Cuota ${ultimoPago?.numero_cuota}` : "-")
            ),
            ultimoPagoMonto: Number(ultimoPago?.monto || getMontoProgramado(ultimoPago || {}) || 0),
            proximoPagoFecha: proximoPago?.fecha_vencimiento || null,
            proximoPagoPeriodo: String(
              proximoPago?.periodo_pagado ||
              (Number.isFinite(Number(proximoPago?.numero_cuota)) ? `Cuota ${proximoPago?.numero_cuota}` : "-")
            ),
            proximoPagoMonto: Number(getMontoProgramado(proximoPago || {}) || proximoPago?.monto || 0),
            estadoPagoLabel,
            estadoPagoColor,
            puedeRecibirKit: pagoEnPeriodo,
            pagoEnPeriodo,
            vencido: proximoVencido || (proximoPago ? getVisiblePaymentStatus(proximoPago) === "vencido" : false),
          };
        });

        setRows(dataRows.sort((a, b) => Number(b.puedeRecibirKit) - Number(a.puedeRecibirKit)));
      } catch (err: any) {
        console.error("Error cargando estado de kit mensual", err);
        setError(err?.message || "No se pudo cargar el estado de kit mensual");
      } finally {
        setLoading(false);
      }
    };

    void cargarEstadoKit();
  }, [filtroGrupo, periodo]);

  const totalEstudiantes = rows.length;
  const puedeKit = rows.filter((r) => r.puedeRecibirKit).length;
  const bloqueados = rows.filter((r) => !r.puedeRecibirKit).length;
  const vencidos = rows.filter((r) => r.vencido).length;

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      <Card
        title={
          <Space>
            <GiftOutlined />
            <Title level={4} style={{ margin: 0 }}>Control Kit Mensual</Title>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Text type="secondary">
          Esta vista solo muestra estudiantes con plan mensual (Mensual 70/100). Si pagó en el período seleccionado, puede recibir kit.
        </Text>

        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={10}>
            <Select
              allowClear
              placeholder="Filtrar por grupo"
              style={{ width: "100%" }}
              value={filtroGrupo ?? undefined}
              onChange={(value) => setFiltroGrupo(value ?? null)}
              options={gruposDisponibles}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              style={{ width: "100%" }}
              value={filtroPeriodo}
              onChange={(value) => setFiltroPeriodo(value)}
              options={[
                { label: "Mes actual", value: "mes_actual" },
                { label: "Mes anterior", value: "mes_anterior" },
                { label: "Trimestre actual", value: "trimestre_actual" },
                { label: "Rango personalizado", value: "personalizado" },
              ]}
            />
          </Col>
          <Col xs={24} md={8}>
            <RangePicker
              disabled={filtroPeriodo !== "personalizado"}
              value={rangoPersonalizado as any}
              onChange={(value) => setRangoPersonalizado(value as any)}
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
            />
          </Col>
        </Row>

        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Período aplicado: <strong>{periodo.etiqueta}</strong></Text>
        </div>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Estudiantes mensuales" value={totalEstudiantes} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Puede recibir kit" value={puedeKit} valueStyle={{ color: "#15803d" }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="No puede recibir kit" value={bloqueados} valueStyle={{ color: "#b91c1c" }} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Con pagos vencidos" value={vencidos} valueStyle={{ color: "#c2410c" }} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : rows.length === 0 ? (
        <Empty description="No hay estudiantes mensuales para este filtro" />
      ) : (
        <Card>
          <Table
            rowKey="key"
            dataSource={rows}
            size={isMobile ? "small" : "middle"}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: isMobile ? 10 : 15, showSizeChanger: !isMobile }}
          >
            <Table.Column
              title="Estudiante"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{record.estudianteNombre}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.estudianteTelefono || "Sin teléfono"}</Text>
                </Space>
              )}
            />
            <Table.Column title="Grupo" dataIndex="grupoNombre" />
            <Table.Column title="Plan" dataIndex="planLabel" render={(value: string) => <Tag color="blue">{value}</Tag>} />
            <Table.Column
              title="Último pago"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text>{record.ultimoPagoFecha ? dayjs(record.ultimoPagoFecha).format("DD/MM/YYYY") : "Sin pago"}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.ultimoPagoPeriodo || "-"}</Text>
                  <Text strong style={{ color: "#15803d" }}>{record.ultimoPagoMonto > 0 ? formatoCOP(record.ultimoPagoMonto) : "-"}</Text>
                </Space>
              )}
            />
            <Table.Column
              title="Próximo pago"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text>{record.proximoPagoFecha ? dayjs(record.proximoPagoFecha).format("DD/MM/YYYY") : "Sin cuota pendiente"}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.proximoPagoPeriodo || "-"}</Text>
                  <Text strong style={{ color: "#b45309" }}>{record.proximoPagoMonto > 0 ? formatoCOP(record.proximoPagoMonto) : "-"}</Text>
                </Space>
              )}
            />
            <Table.Column
              title="Estado de pago"
              render={(_, record: KitRow) => (
                <Tag color={record.estadoPagoColor}>{record.estadoPagoLabel}</Tag>
              )}
            />
            <Table.Column
              title="Entrega kit"
              render={(_, record: KitRow) => (
                record.puedeRecibirKit
                  ? <Tag color="green">Sí, entregar kit</Tag>
                  : <Tag color="red">No entregar kit</Tag>
              )}
            />
          </Table>
        </Card>
      )}
    </div>
  );
}
