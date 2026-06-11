"use client";

import React from "react";
import dayjs from "dayjs";
import { Alert, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { normalizeModalidadPago } from "@/types/payment-plans";
import {
  getDescuentoAplicado,
  getMontoProgramado,
  getSaldoPendiente,
  getTotalAbonado,
} from "@/utils/payment-balances";
import { getPaymentPlanDisplay } from "@/types/payment-plans";

const { Text } = Typography;

type PortalFinancieroSectionProps = {
  isMobile: boolean;
  matriculas: any[];
  pagosConPendientes: any[];
  renderMobileListCards: (items: any[], getCard: (item: any) => any, emptyText?: string) => React.ReactNode;
  getVisiblePaymentStatusWithGrace: (pago: any) => string;
  getFechaVencimientoEfectiva: (pago: any) => any;
};

export const PortalFinancieroSection = ({
  isMobile,
  matriculas,
  pagosConPendientes,
  renderMobileListCards,
  getVisiblePaymentStatusWithGrace,
  getFechaVencimientoEfectiva,
}: PortalFinancieroSectionProps) => {
  const formatPagoCOP = (valor?: number | null) => `$ ${Number(valor || 0).toLocaleString()}`;

  const renderPlanTag = (pago: any) => {
    const matricula = matriculas.find((m: any) => String(m.id) === String(pago.matricula_id));
    const plan = getPaymentPlanDisplay({
      modalidadPago: matricula?.modalidad_pago,
      valorMensualPlan: matricula?.valor_mensual_plan,
      montoPorClase: matricula?.valor_por_clase,
      porcentajeProductos: matricula?.porcentaje_productos,
    });

    return <Tag color={plan.color}>{plan.label}</Tag>;
  };

  const renderEstadoPagoTag = (pago: any) => {
    const visibleStatus = getVisiblePaymentStatusWithGrace(pago);

    if (visibleStatus === "vencido") return <Tag color="red">VENCIDO</Tag>;
    if (visibleStatus === "abono_parcial") return <Tag color="gold">ABONO PARCIAL</Tag>;
    if (visibleStatus === "pagado") return <Tag color="green">PAGADO</Tag>;

    return <Tag style={{ color: "#8c8c8c", borderColor: "#d9d9d9", fontSize: "11px" }}>PENDIENTE</Tag>;
  };

  const getConceptoPago = (pago: any) => {
    const matricula = matriculas.find((m: any) => String(m?.id) === String(pago?.matricula_id));
    const modalidad = normalizeModalidadPago(matricula?.modalidad_pago);
    const numero = Number(pago?.numero_cuota || 0);

    if (modalidad === "POR_CLASE" && Number.isFinite(numero) && numero > 0) {
      return `Clase #${numero}`;
    }

    return pago?.periodo_pagado || `Cuota ${numero || ""}`.trim();
  };

  const pendientes = pagosConPendientes
    .filter((p) => {
      const visibleStatus = getVisiblePaymentStatusWithGrace(p);
      return visibleStatus === "pendiente" || visibleStatus === "abono_parcial" || visibleStatus === "vencido";
    })
    .sort((a, b) => {
      const fechaA = a?.fecha_vencimiento ? dayjs(a.fecha_vencimiento) : null;
      const fechaB = b?.fecha_vencimiento ? dayjs(b.fecha_vencimiento) : null;
      if (fechaA && fechaB) return fechaA.valueOf() - fechaB.valueOf();
      if (fechaA) return -1;
      if (fechaB) return 1;
      return Number(a?.numero_cuota || 0) - Number(b?.numero_cuota || 0);
    });

  const realizados = pagosConPendientes.filter((p) => getVisiblePaymentStatusWithGrace(p) === "pagado");
  const totalPendiente = pendientes.reduce((sum, pago: any) => sum + Number(getSaldoPendiente(pago) || 0), 0);
  const totalPagado = realizados.reduce((sum, pago: any) => sum + Number(getTotalAbonado(pago) || pago?.monto || 0), 0);
  const pagosVencidos = pendientes.filter((p: any) => getVisiblePaymentStatusWithGrace(p) === "vencido").length;

  const isVencido = (pago: any) => {
    const fecha = getFechaVencimientoEfectiva(pago);
    return Boolean(fecha && dayjs().startOf("day").isAfter(fecha));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <Card size="small" className="portal-finance-summary portal-finance-summary--pending">
            <Statistic
              title="Saldo pendiente"
              value={totalPendiente}
              precision={0}
              prefix="$"
              valueStyle={{ color: "#b54708", fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" className="portal-finance-summary portal-finance-summary--alert">
            <Statistic
              title="Pagos vencidos"
              value={pagosVencidos}
              valueStyle={{ color: pagosVencidos > 0 ? "#cf1322" : "#389e0d", fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" className="portal-finance-summary portal-finance-summary--paid">
            <Statistic
              title="Total pagado"
              value={totalPagado}
              precision={0}
              prefix="$"
              valueStyle={{ color: "#15803d", fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={<><ClockCircleOutlined /> Proximos Pagos</>}
            className="shadow-sm portal-finance-card portal-finance-card--pending"
            extra={<Tag color={pagosVencidos > 0 ? "red" : "orange"}>{pendientes.length} pendientes</Tag>}
          >
            {!isMobile ? (
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                Aqui ves primero lo que debes cubrir y cuanto sigue pendiente en cada cuota.
              </Text>
            ) : null}
            {pendientes.length > 0 ? (
              isMobile ? renderMobileListCards(pendientes, (r: any) => {
                const fechaEfectiva = getFechaVencimientoEfectiva(r);
                const descuento = Number(getDescuentoAplicado(r) || 0);
                const abonado = Number(getTotalAbonado(r) || 0);
                const programado = Number(getMontoProgramado(r) || r?.monto || 0);
                const saldo = Number(getSaldoPendiente(r) || 0);

                return {
                  key: String(r.id),
                  title: (
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Text strong>{getConceptoPago(r)}</Text>
                      {renderPlanTag(r)}
                    </Space>
                  ),
                  extra: renderEstadoPagoTag(r),
                  rows: [
                    { label: "Vence", value: fechaEfectiva ? fechaEfectiva.format("DD/MM/YYYY") : "-" },
                    { label: "Programado", value: formatPagoCOP(programado) },
                    { label: "Abonado", value: abonado > 0 ? formatPagoCOP(abonado) : undefined },
                    { label: "Descuento", value: descuento > 0 ? formatPagoCOP(descuento) : undefined },
                    { label: "Saldo", value: formatPagoCOP(saldo) },
                  ],
                };
              }) : <Table
                dataSource={pendientes}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 560 }}
                rowClassName={(record: any) => {
                  const visibleStatus = getVisiblePaymentStatusWithGrace(record);
                  return visibleStatus === "vencido"
                    ? "portal-finance-row portal-finance-row--overdue"
                    : visibleStatus === "abono_parcial"
                    ? "portal-finance-row portal-finance-row--partial"
                    : "portal-finance-row portal-finance-row--pending";
                }}
                columns={[
                  {
                    title: "Concepto",
                    dataIndex: "periodo_pagado",
                    render: (_t, r: any) => {
                      const vencido = isVencido(r);
                      const style = !vencido ? { color: "#8c8c8c", fontSize: "13px" } : {};
                      return <span style={style}>{getConceptoPago(r)}</span>;
                    },
                  },
                  {
                    title: "Plan",
                    render: (_: any, r: any) => renderPlanTag(r),
                  },
                  {
                    title: "Vence",
                    dataIndex: "fecha_vencimiento",
                    render: (_d, r: any) => {
                      const vencido = isVencido(r);
                      const fechaEfectiva = getFechaVencimientoEfectiva(r);
                      const style = !vencido ? { color: "#8c8c8c", fontSize: "13px" } : {};
                      return <span style={style}>{fechaEfectiva ? fechaEfectiva.format("DD/MM/YYYY") : "-"}</span>;
                    },
                  },
                  {
                    title: "Monto",
                    dataIndex: "monto",
                    render: (v: any, r: any) => {
                      const vencido = isVencido(r);
                      const style = !vencido ? { color: "#8c8c8c", fontSize: "13px" } : {};
                      return <span style={style}>{formatPagoCOP(getMontoProgramado(r) || v)}</span>;
                    },
                  },
                  {
                    title: "Abonado",
                    render: (_: any, r: any) => formatPagoCOP(getTotalAbonado(r)),
                  },
                  {
                    title: "Descuento",
                    render: (_: any, r: any) => formatPagoCOP(getDescuentoAplicado(r)),
                  },
                  {
                    title: "Saldo",
                    render: (_: any, r: any) => formatPagoCOP(getSaldoPendiente(r)),
                  },
                  {
                    title: "Estado",
                    render: (_: any, r: any) => renderEstadoPagoTag(r),
                  },
                ]}
              />
            ) : (
              <Alert message="Estas al dia" description="No tienes pagos pendientes." type="success" showIcon />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={<><CheckCircleOutlined /> Historial de Pagos</>}
            className="shadow-sm portal-finance-card portal-finance-card--paid"
            extra={<Tag color="green">{realizados.length} pagos registrados</Tag>}
          >
            {!isMobile ? (
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                Este bloque resalta claramente lo que ya quedo pagado y confirmado.
              </Text>
            ) : null}
            {isMobile ? renderMobileListCards(realizados, (r: any) => {
              const descuento = Number(getDescuentoAplicado(r) || 0);
              const abonado = Number(getTotalAbonado(r) || 0);
              const programado = Number(getMontoProgramado(r) || 0);

              return {
                key: String(r.id),
                title: (
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Text strong>{getConceptoPago(r)}</Text>
                    {renderPlanTag(r)}
                  </Space>
                ),
                extra: renderEstadoPagoTag(r),
                rows: [
                  { label: "Fecha", value: r?.fecha_pago ? dayjs(r.fecha_pago).format("DD/MM/YYYY") : "-" },
                  { label: "Pagado", value: formatPagoCOP(abonado || r?.monto) },
                  { label: "Programado", value: programado > 0 && programado !== Number(r?.monto || 0) ? formatPagoCOP(programado) : undefined },
                  { label: "Descuento", value: descuento > 0 ? formatPagoCOP(descuento) : undefined },
                ],
              };
            }) : <Table
              dataSource={realizados}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              size="small"
              scroll={{ x: 520 }}
              rowClassName={() => "portal-finance-row portal-finance-row--paid"}
              columns={[
                { title: "Concepto", dataIndex: "periodo_pagado", render: (_: any, r: any) => getConceptoPago(r) },
                {
                  title: "Plan",
                  render: (_: any, r: any) => renderPlanTag(r),
                },
                { title: "Fecha", dataIndex: "fecha_pago", render: (d: any) => d ? dayjs(d).format("DD/MM/YYYY") : "-" },
                { title: "Programado", render: (_: any, r: any) => formatPagoCOP(getMontoProgramado(r)) },
                { title: "Abonado", render: (_: any, r: any) => formatPagoCOP(getTotalAbonado(r)) },
                { title: "Descuento", render: (_: any, r: any) => formatPagoCOP(getDescuentoAplicado(r)) },
                { title: "Monto", dataIndex: "monto", render: (v: any) => formatPagoCOP(v) },
                { title: "Estado", render: () => <Tag color="green">PAGADO</Tag> },
              ]}
            />}
          </Card>
        </Col>
      </Row>
    </Space>
  );
};
