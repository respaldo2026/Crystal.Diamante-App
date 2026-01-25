"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Card,
  Row,
  Col,
  Button,
  List,
  Spin,
  Space,
  Tag,
  Typography,
  Empty,
  Tooltip,
  Divider,
  Statistic,
  Tabs,
  Timeline,
  Badge,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
  CalendarOutlined,
  TeamOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { useRouter } from "next/navigation";
import {
  getProgramasResumen,
  getCursosSecretaria,
  getPagosPendientes,
  getLeadsPendientes,
} from "../secretaria.api";
import { registrarPago } from "../secretaria.actions";

dayjs.locale("es");
dayjs.extend(localizedFormat);

const { Title, Text } = Typography;

const estadoLeadColor: Record<string, string> = {
  nuevo: "blue",
  contactado: "gold",
  en_seguimiento: "cyan",
};

const canalColor: Record<string, string> = {
  Instagram: "magenta",
  WhatsApp: "green",
  Facebook: "blue",
  Referencia: "purple",
  Evento: "volcano",
  Web: "geekblue",
  Otro: "default",
};

const formatFecha = (value?: string | null) => {
  if (!value) return "Sin fecha";
  return dayjs(value).format("DD MMM YYYY");
};

const formatHorario = (inicio?: string | null, fin?: string | null) => {
  if (!inicio && !fin) return "Horario por definir";
  const inicioFmt = inicio ? dayjs(inicio, "HH:mm:ss").format("hh:mm A") : "";
  const finFmt = fin ? dayjs(fin, "HH:mm:ss").format("hh:mm A") : "";
  if (inicioFmt && finFmt) return `${inicioFmt} - ${finFmt}`;
  return inicioFmt || finFmt || "Horario por definir";
};

const formatDias = (value?: string | null) => {
  if (!value) return "Días por definir";
  return value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((dia) => dia.charAt(0).toUpperCase() + dia.slice(1))
    .join(" · ");
};

const formatCurrency = (value?: number | null) => {
  if (!value) return "$0";
  return `$${Number(value).toLocaleString("es-CO")}`;
};

export default function SecretariaDashboard() {
  const { message: messageApi } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programas, setProgramas] = useState<any[]>([]);
  const [cursosActivos, setCursosActivos] = useState<any[]>([]);
  const [cursosProximos, setCursosProximos] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  const [registrandoPagoId, setRegistrandoPagoId] = useState<string | null>(null);

  const resumenFinanciero = useMemo(() => {
    const totalPendiente = pagosPendientes.reduce((acc, pago) => acc + Number(pago.monto || 0), 0);
    const vencidos = pagosPendientes.filter((pago) => {
      if (!pago.fecha_vencimiento) return false;
      return dayjs(pago.fecha_vencimiento).isBefore(dayjs(), "day");
    }).length;
    const proximosVencimientos = pagosPendientes.filter((pago) => {
      if (!pago.fecha_vencimiento) return false;
      const diff = dayjs(pago.fecha_vencimiento).diff(dayjs(), "day");
      return diff >= 0 && diff <= 7;
    }).length;
    return { totalPendiente, vencidos, proximosVencimientos };
  }, [pagosPendientes]);

  const leadsPrioritarios = useMemo(() => {
    const sinContacto = leads.filter((lead) => (lead.estado || "").toLowerCase() === "nuevo");
    const seguimiento = leads.filter((lead) => (lead.estado || "").toLowerCase() === "en_seguimiento");
    return { sinContacto, seguimiento };
  }, [leads]);

  const proximosDestacados = useMemo(() => cursosProximos.slice(0, 4), [cursosProximos]);

  const cargarPanel = useCallback(async () => {
    setLoading(true);
    try {
      const [programasRes, cursosRes, leadsRes, pagosRes] = await Promise.all([
        getProgramasResumen(),
        getCursosSecretaria(),
        getLeadsPendientes(),
        getPagosPendientes(),
      ]);

      if (programasRes.error) messageApi.error("No se pudieron cargar los programas");
      if (cursosRes.error) messageApi.error("No se pudieron cargar los cursos");
      if (leadsRes.error) messageApi.error("No se pudieron cargar los leads");
      if (pagosRes.error) messageApi.error("No se pudieron cargar los pagos pendientes");

      setProgramas(programasRes.data || []);
      const cursosData = (cursosRes.data || []) as any[];
      setCursosActivos(cursosData.filter((curso) => (curso.estado || "").toLowerCase() === "activo"));
      setCursosProximos(cursosData.filter((curso) => (curso.estado || "").toLowerCase() === "proximo"));
      setLeads(leadsRes.data || []);
      setPagosPendientes(pagosRes.data || []);
    } catch (error) {
      console.error("Error cargando panel secretaría", error);
      messageApi.error("Ocurrió un error cargando la información");
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    cargarPanel();
  }, [cargarPanel]);

  const resumenCards = useMemo(
    () => [
      { key: "programas", label: "Programas activos", value: programas.length },
      { key: "activos", label: "Grupos activos", value: cursosActivos.length },
      { key: "proximos", label: "Próximos inicios", value: cursosProximos.length },
      { key: "leads", label: "Leads en seguimiento", value: leads.length },
      { key: "pagos", label: "Pagos pendientes", value: pagosPendientes.length },
    ],
    [programas.length, cursosActivos.length, cursosProximos.length, leads.length, pagosPendientes.length]
  );
  const buildProgramaResumen = (programa: any) => {
    const lines = [
      `Programa: ${programa.nombre}`,
      programa.duracion ? `Duración: ${programa.duracion}` : undefined,
      programa.total_clases ? `Clases: ${programa.total_clases}` : undefined,
      programa.precio_inscripcion !== null && programa.precio_inscripcion !== undefined
        ? `Inscripción: ${formatCurrency(programa.precio_inscripcion)}`
        : undefined,
      programa.precio_mensualidad !== null && programa.precio_mensualidad !== undefined
        ? `Mensualidad: ${formatCurrency(programa.precio_mensualidad)}`
        : undefined,
      programa.descripcion ? `Descripción: ${programa.descripcion}` : undefined,
    ].filter(Boolean);

    if (programa.contenido) {
      lines.push(`Contenido: ${programa.contenido}`);
    }

    return lines.join("\n");
  };

  const handleCopyPrograma = async (programa: any) => {
    const resumen = buildProgramaResumen(programa);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resumen);
        messageApi.success("Resumen copiado al portapapeles");
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = resumen;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        messageApi.success("Resumen copiado al portapapeles");
      }
    } catch (error) {
      console.error("Error copiando resumen", error);
      messageApi.error("No se pudo copiar el resumen");
    }
  };

  const abrirMatricula = useCallback(
    (cursoId?: string) => {
      const search = cursoId ? `?cursoId=${encodeURIComponent(cursoId)}` : "";
      router.push(`/matriculas/create${search}`);
    },
    [router]
  );

  const handleRegistrarPago = async (pagoId: string) => {
    setRegistrandoPagoId(pagoId);
    const { error } = await registrarPago({ pagoId });
    if (error) {
      messageApi.error("No se pudo registrar el pago");
      setRegistrandoPagoId(null);
      return;
    }
    messageApi.success("Pago marcado como recibido");
    setRegistrandoPagoId(null);
    cargarPanel();
  };

  const renderCurso = (curso: any) => {
    const inscritos = Number(curso.matriculas?.[0]?.count || 0);
    const cupos = Number(curso.cupos || 0);
    const libres = Math.max(cupos - inscritos, 0);

    return (
      <List.Item
        actions={[
          <Button key="matricular" type="link" onClick={() => abrirMatricula(curso.id)}>
            Matricular
          </Button>,
        ]}
      >
        <List.Item.Meta
          title={
            <Space direction="vertical" size={0}>
              <Text strong>{curso.nombre || "Grupo sin nombre"}</Text>
              <Text type="secondary">{curso.programas?.nombre || "Programa por definir"}</Text>
            </Space>
          }
          description={
            <Space direction="vertical" size={4}>
              <Space>
                <CalendarOutlined />
                <Text>{formatFecha(curso.fecha_inicio)}</Text>
              </Space>
              <Space>
                <TeamOutlined />
                <Text>{`${inscritos}/${cupos || 0} inscritos`}</Text>
                <Tag color={libres > 0 ? "green" : "red"}>{libres} cupos libres</Tag>
              </Space>
              <Text type="secondary">{formatDias(curso.dias_semana)} · {formatHorario(curso.hora_inicio, curso.hora_fin)}</Text>
            </Space>
          }
        />
      </List.Item>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #5B21B6, #7C3AED)",
            borderRadius: 18,
            padding: 24,
            color: "#fff",
            boxShadow: "0 18px 40px -24px rgba(91,33,182,0.55)",
          }}
        >
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={14}>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space size={12} wrap>
                  <Badge color="#F5F5F5" text={<span style={{ color: "#F5F5F5" }}>Centro de atención</span>} />
                  <Badge color="#C4B5FD" text={<span style={{ color: "#F5F5F5" }}>Secretaría</span>} />
                </Space>
                <Title level={2} style={{ color: "#FFFFFF", marginBottom: 0 }}>
                  Bienvenida, facilita la información y gestiona el flujo académico
                </Title>
                <Text style={{ color: "rgba(255,255,255,0.85)" }}>
                  Mantén actualizada la información de cursos, realiza matrículas y controla los pagos de los estudiantes desde un solo lugar.
                </Text>
                <Space size={[12, 12]} wrap>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirMatricula()}>
                    Registrar matrícula
                  </Button>
                  <Button
                    icon={<CreditCardOutlined />}
                    onClick={() => {
                      if (pagosPendientes.length === 0) {
                        messageApi.info("No hay pagos pendientes por ahora");
                        return;
                      }
                      void handleRegistrarPago(pagosPendientes[0].id);
                    }}
                  >
                    Marcar pago recibido
                  </Button>
                  <Button
                    type="link"
                    style={{ color: "#E0E7FF" }}
                    icon={<InfoCircleOutlined />}
                    onClick={() => window.open("/programas", "_blank")}
                  >
                    Catálogo de cursos
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    ghost
                    onClick={cargarPanel}
                    disabled={loading}
                  >
                    Actualizar datos
                  </Button>
                </Space>
              </Space>
            </Col>
            <Col xs={24} md={10}>
              <Row gutter={[16, 16]}>
                {resumenCards.map((card) => (
                  <Col xs={12} key={card.key}>
                    <div
                      style={{
                        backgroundColor: "rgba(17,24,39,0.28)",
                        borderRadius: 16,
                        padding: 16,
                        backdropFilter: "blur(2px)",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.7)" }}>{card.label}</Text>
                      <Statistic value={card.value} valueStyle={{ color: "#FFFFFF", fontWeight: 700 }} />
                    </div>
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        </div>

        {loading ? (
          <div style={{ minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : (
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={16}>
              <Card
                title="Vista general académica"
                extra={<Button type="link" onClick={() => window.open("/programas", "_blank")}>Gestionar programas</Button>}
                variant="outlined"
              >
                <Tabs
                  defaultActiveKey="programas"
                  items={[
                    {
                      key: "programas",
                      label: "Programas activos",
                      children: (
                        <List
                          grid={{ gutter: 16, xs: 1, md: 2 }}
                          dataSource={programas}
                          rowKey={(programa) => programa.id}
                          locale={{ emptyText: <Empty description="Sin programas registrados" /> }}
                          renderItem={(programa) => (
                            <List.Item>
                              <Card
                                variant="borderless"
                                title={programa.nombre}
                                extra={
                                  <Button type="link" size="small" onClick={() => handleCopyPrograma(programa)}>
                                    Copiar info
                                  </Button>
                                }
                              >
                                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                  {programa.duracion && <Text type="secondary">Duración: {programa.duracion}</Text>}
                                  <Space wrap>
                                    {programa.precio_inscripcion !== null && programa.precio_inscripcion !== undefined && (
                                      <Tag color="purple">Inscripción: {formatCurrency(programa.precio_inscripcion)}</Tag>
                                    )}
                                    {programa.precio_mensualidad !== null && programa.precio_mensualidad !== undefined && (
                                      <Tag color="green">Mensualidad: {formatCurrency(programa.precio_mensualidad)}</Tag>
                                    )}
                                    {programa.total_clases && (
                                      <Tag color="blue">Clases: {programa.total_clases}</Tag>
                                    )}
                                  </Space>
                                  {programa.descripcion && (
                                    <Text type="secondary" ellipsis={{ tooltip: programa.descripcion }}>{programa.descripcion}</Text>
                                  )}
                                </Space>
                              </Card>
                            </List.Item>
                          )}
                        />
                      ),
                    },
                    {
                      key: "grupos",
                      label: "Grupos activos",
                      children: (
                        <List
                          dataSource={cursosActivos}
                          rowKey={(curso) => curso.id}
                          locale={{ emptyText: <Empty description="No hay grupos activos" /> }}
                          renderItem={renderCurso}
                        />
                      ),
                    },
                    {
                      key: "proximos",
                      label: "Inicios próximos",
                      children: (
                        proximosDestacados.length > 0 ? (
                          <Timeline
                            items={proximosDestacados.map((curso) => ({
                              color: "#7C3AED",
                              children: (
                                <div>
                                  <Space direction="vertical" size={4}>
                                    <Space align="center">
                                      <Text strong>{curso.nombre}</Text>
                                      <Tag color="geekblue">{curso.programas?.nombre || "Programa"}</Tag>
                                    </Space>
                                    <Text type="secondary">Inicio: {formatFecha(curso.fecha_inicio)}</Text>
                                    <Text type="secondary">{formatDias(curso.dias_semana)} · {formatHorario(curso.hora_inicio, curso.hora_fin)}</Text>
                                    <Button size="small" type="link" onClick={() => abrirMatricula(curso.id)}>
                                      Reservar cupo
                                    </Button>
                                  </Space>
                                </div>
                              ),
                            }))}
                          />
                        ) : (
                          <Empty description="No hay inicios programados" />
                        )
                      ),
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Space direction="vertical" size={24} style={{ width: "100%" }}>
                <Card title="Estado de pagos" variant="outlined">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Statistic
                        title="Pendiente"
                        value={resumenFinanciero.totalPendiente}
                        precision={0}
                        prefix="$"
                        valueStyle={{ color: "#B91C1C", fontWeight: 700 }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Pagos vencidos"
                        value={resumenFinanciero.vencidos}
                        valueStyle={{ color: "#DC2626", fontWeight: 700 }}
                      />
                    </Col>
                    <Col span={24}>
                      <Statistic
                        title="Vencen en 7 días"
                        value={resumenFinanciero.proximosVencimientos}
                        valueStyle={{ color: "#F59E0B", fontWeight: 600 }}
                      />
                    </Col>
                  </Row>
                  <Divider style={{ margin: "16px 0" }} />
                  <List
                    dataSource={pagosPendientes.slice(0, 4)}
                    rowKey={(pago) => pago.id}
                    locale={{ emptyText: <Empty description="Sin pagos pendientes" /> }}
                    renderItem={(pago) => (
                      <List.Item
                        actions={[
                          <Button
                            key="registrar"
                            type="link"
                            size="small"
                            onClick={() => handleRegistrarPago(pago.id)}
                            loading={registrandoPagoId === pago.id}
                          >
                            Registrar
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={pago.perfiles?.nombre_completo || "Estudiante"}
                          description={
                            <Space direction="vertical" size={0}>
                              <Text strong>{formatCurrency(pago.monto)}</Text>
                              <Text type="secondary">Vence: {formatFecha(pago.fecha_vencimiento)}</Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                  {pagosPendientes.length > 4 && (
                    <Button type="link" onClick={() => window.open("/tesoreria", "_blank")}>Ver todos los pagos</Button>
                  )}
                </Card>

                <Card
                  title="Leads en seguimiento"
                  extra={<Button type="link" onClick={() => window.open("/leads", "_blank")}>
                    Abrir módulo
                  </Button>}
                  variant="outlined"
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Statistic
                      title="Sin contacto"
                      value={leadsPrioritarios.sinContacto.length}
                      valueStyle={{ color: "#2563EB", fontWeight: 600 }}
                    />
                    <Statistic
                      title="En seguimiento"
                      value={leadsPrioritarios.seguimiento.length}
                      valueStyle={{ color: "#0EA5E9", fontWeight: 600 }}
                    />
                    <Divider style={{ margin: "12px 0" }} />
                    <List
                      dataSource={leads.slice(0, 4)}
                      rowKey={(lead) => lead.id}
                      locale={{ emptyText: <Empty description="Sin leads pendientes" /> }}
                      renderItem={(lead) => (
                        <List.Item
                          actions={[
                            lead.telefono ? (
                              <Tooltip key="whatsapp" title="Enviar mensaje">
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<WhatsAppOutlined />}
                                  href={`https://wa.me/${lead.telefono.replace(/\D+/g, "")}`}
                                  target="_blank"
                                />
                              </Tooltip>
                            ) : null,
                          ].filter(Boolean) as React.ReactNode[]}
                        >
                          <List.Item.Meta
                            title={
                              <Space>
                                <Text strong>{lead.nombre}</Text>
                                {lead.estado && (
                                  <Tag color={estadoLeadColor[lead.estado] || "default"}>{lead.estado.replace(/_/g, " ")}</Tag>
                                )}
                              </Space>
                            }
                            description={
                              <Text type="secondary">
                                {lead.interes || "Sin observaciones"}
                              </Text>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  </Space>
                </Card>
              </Space>
            </Col>
          </Row>
        )}
      </Space>
    </div>
  );
}
