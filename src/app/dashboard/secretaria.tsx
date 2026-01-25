"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Row,
  Col,
  Button,
  List,
  Spin,
  message,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  Empty,
  Tooltip,
  Form,
  Divider,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
  PhoneOutlined,
  CalendarOutlined,
  TeamOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import localizedFormat from "dayjs/plugin/localizedFormat";
import {
  getProgramasResumen,
  getCursosSecretaria,
  getPagosPendientes,
  getLeadsPendientes,
  getEstudiantesActivos,
} from "./secretaria.api";
import { crearMatricula, registrarPago } from "./secretaria.actions";

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
  const [loading, setLoading] = useState(true);
  const [programas, setProgramas] = useState<any[]>([]);
  const [cursosActivos, setCursosActivos] = useState<any[]>([]);
  const [cursosProximos, setCursosProximos] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [registrandoPagoId, setRegistrandoPagoId] = useState<string | null>(null);
  const [matriculaVisible, setMatriculaVisible] = useState(false);
  const [matriculaLoading, setMatriculaLoading] = useState(false);
  const [matriculaForm] = Form.useForm();

  const cargarPanel = useCallback(async () => {
    setLoading(true);
    try {
      const [programasRes, cursosRes, leadsRes, pagosRes, estudiantesRes] = await Promise.all([
        getProgramasResumen(),
        getCursosSecretaria(),
        getLeadsPendientes(),
        getPagosPendientes(),
        getEstudiantesActivos(),
      ]);

      if (programasRes.error) message.error("No se pudieron cargar los programas");
      if (cursosRes.error) message.error("No se pudieron cargar los cursos");
      if (leadsRes.error) message.error("No se pudieron cargar los leads");
      if (pagosRes.error) message.error("No se pudieron cargar los pagos pendientes");
      if (estudiantesRes.error) message.error("No se pudieron cargar los estudiantes activos");

      setProgramas(programasRes.data || []);
      const cursosData = (cursosRes.data || []) as any[];
      setCursosActivos(cursosData.filter((curso) => (curso.estado || "").toLowerCase() === "activo"));
      setCursosProximos(cursosData.filter((curso) => (curso.estado || "").toLowerCase() === "proximo"));
      setLeads(leadsRes.data || []);
      setPagosPendientes(pagosRes.data || []);
      setEstudiantes(estudiantesRes.data || []);
    } catch (error) {
      console.error("Error cargando panel secretaría", error);
      message.error("Ocurrió un error cargando la información");
    } finally {
      setLoading(false);
    }
  }, []);

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
        message.success("Resumen copiado al portapapeles");
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = resumen;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        message.success("Resumen copiado al portapapeles");
      }
    } catch (error) {
      console.error("Error copiando resumen", error);
      message.error("No se pudo copiar el resumen");
    }
  };

  const handleSharePrograma = (programa: any) => {
    const resumen = buildProgramaResumen(programa);
    const url = `https://wa.me/?text=${encodeURIComponent(resumen)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };


  const abrirMatricula = (cursoId?: string) => {
    setMatriculaVisible(true);
    matriculaForm.resetFields();
    const values: Record<string, string | undefined> = {};
    if (cursoId) {
      values.curso_id = cursoId;
    }
    matriculaForm.setFieldsValue(values);
  };

  const cerrarMatricula = () => {
    setMatriculaVisible(false);
    setMatriculaLoading(false);
    matriculaForm.resetFields();
  };

  const handleCrearMatricula = async (values: { curso_id: string; estudiante_id: string }) => {
    setMatriculaLoading(true);
    const { error } = await crearMatricula({ cursoId: values.curso_id, estudianteId: values.estudiante_id });
    if (error) {
      message.error("No se pudo crear la matrícula");
      setMatriculaLoading(false);
      return;
    }
    message.success("Matrícula registrada");
    cerrarMatricula();
    cargarPanel();
  };

  const handleRegistrarPago = async (pagoId: string) => {
    setRegistrandoPagoId(pagoId);
    const { error } = await registrarPago({ pagoId });
    if (error) {
      message.error("No se pudo registrar el pago");
      setRegistrandoPagoId(null);
      return;
    }
    message.success("Pago marcado como recibido");
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
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ marginBottom: 0 }}>
              Panel de Secretaría
            </Title>
            <Text type="secondary">Gestiona inscripciones, seguimiento de leads y pagos pendientes.</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={cargarPanel} disabled={loading}>
                Actualizar
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirMatricula()}>
                Nueva matrícula
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          {resumenCards.map((card) => (
            <Col key={card.key} xs={24} sm={12} lg={6} xl={4}>
              <Card bordered>
                <Text type="secondary">{card.label}</Text>
                <Title level={3} style={{ margin: 0 }}>{card.value}</Title>
              </Card>
            </Col>
          ))}
        </Row>

        {loading ? (
          <div style={{ minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : (
          <Space direction="vertical" size={24} style={{ width: "100%" }}>
            <Card title="Información de programas" extra={<Button type="link" onClick={() => window.open("/programas", "_blank")}>Gestionar programas</Button>}>
              <List
                dataSource={programas}
                rowKey={(programa) => programa.id}
                locale={{ emptyText: <Empty description="No hay programas activos" /> }}
                renderItem={(programa) => (
                  <List.Item
                    actions={[
                      <Button
                        key="copiar"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopyPrograma(programa)}
                      >
                        Copiar resumen
                      </Button>,
                      <Button
                        key="compartir"
                        type="link"
                        icon={<WhatsAppOutlined />}
                        onClick={() => handleSharePrograma(programa)}
                      >
                        Compartir
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space direction="vertical" size={0}>
                          <Text strong>{programa.nombre}</Text>
                          {programa.duracion && (
                            <Text type="secondary">Duración: {programa.duracion}</Text>
                          )}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
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
                            <Text ellipsis={{ tooltip: programa.descripcion }}>{programa.descripcion}</Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card
                  title="Grupos activos"
                  extra={
                    <Button type="link" onClick={() => window.open("/cursos", "_blank")}>Ver detalle</Button>
                  }
                >
                  <List
                    dataSource={cursosActivos}
                    rowKey={(curso) => curso.id}
                    locale={{ emptyText: <Empty description="No hay grupos activos" /> }}
                    renderItem={renderCurso}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="Próximos grupos">
                  <List
                    dataSource={cursosProximos}
                    rowKey={(curso) => curso.id}
                    locale={{ emptyText: <Empty description="No hay próximos lanzamientos" /> }}
                    renderItem={(curso) => (
                      <List.Item
                        actions={[
                          <Button key="reservar" type="link" onClick={() => abrirMatricula(curso.id)}>
                            Reservar cupo
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space direction="vertical" size={0}>
                              <Text strong>{curso.nombre}</Text>
                              <Text type="secondary">{curso.programas?.nombre || "Programa"}</Text>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={4}>
                              <Space>
                                <CalendarOutlined />
                                <Text>{formatFecha(curso.fecha_inicio)}</Text>
                              </Space>
                              <Text type="secondary">{formatDias(curso.dias_semana)} · {formatHorario(curso.hora_inicio, curso.hora_fin)}</Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card
                  title="Leads para contactar"
                  extra={
                    <Button type="link" onClick={() => window.open("/leads", "_blank")}>
                      Abrir módulo de leads
                    </Button>
                  }
                >
                  <List
                    dataSource={leads}
                    rowKey={(lead) => lead.id}
                    locale={{ emptyText: <Empty description="Sin leads pendientes" /> }}
                    renderItem={(lead) => (
                      <List.Item
                        actions={[
                          lead.telefono ? (
                            <Tooltip key="whatsapp" title="Contactar por WhatsApp">
                              <Button
                                type="link"
                                icon={<WhatsAppOutlined />}
                                href={`https://wa.me/${lead.telefono.replace(/\D+/g, "")}`}
                                target="_blank"
                              >
                                Mensaje
                              </Button>
                            </Tooltip>
                          ) : null,
                          lead.telefono ? (
                            <Tooltip key="llamar" title="Llamar">
                              <Button type="link" icon={<PhoneOutlined />} href={`tel:${lead.telefono}`}>
                                Llamar
                              </Button>
                            </Tooltip>
                          ) : null,
                        ].filter(Boolean) as React.ReactNode[]}
                      >
                        <List.Item.Meta
                          title={
                            <Space direction="vertical" size={0}>
                              <Text strong>{lead.nombre}</Text>
                              <Space wrap>
                                {lead.estado && (
                                  <Tag color={estadoLeadColor[lead.estado] || "default"}>{lead.estado.replace(/_/g, " ")}</Tag>
                                )}
                                {lead.canal && (
                                  <Tag color={canalColor[lead.canal] || "default"}>{lead.canal}</Tag>
                                )}
                              </Space>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={2}>
                              {lead.interes && <Text>{lead.interes}</Text>}
                              <Text type="secondary">Creado: {formatFecha(lead.created_at)}</Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="Pagos pendientes por confirmar">
                  <List
                    dataSource={pagosPendientes}
                    rowKey={(pago) => pago.id}
                    locale={{ emptyText: <Empty description="Sin pagos pendientes" /> }}
                    renderItem={(pago) => (
                      <List.Item
                        actions={[
                          <Button
                            key="registrar"
                            type="primary"
                            ghost
                            loading={registrandoPagoId === pago.id}
                            onClick={() => handleRegistrarPago(pago.id)}
                          >
                            Registrar pago
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space direction="vertical" size={0}>
                              <Text strong>{pago.perfiles?.nombre_completo || "Estudiante"}</Text>
                              {pago.matriculas?.cursos?.nombre && (
                                <Text type="secondary">{pago.matriculas.cursos.nombre}</Text>
                              )}
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={2}>
                              <Text>Monto pendiente: {formatCurrency(pago.monto)}</Text>
                              <Text type="secondary">Vence: {formatFecha(pago.fecha_vencimiento)}</Text>
                              {pago.referencia && <Text type="secondary">Referencia: {pago.referencia}</Text>}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Space>

      <Modal
        title="Registrar nueva matrícula"
        open={matriculaVisible}
        onCancel={cerrarMatricula}
        okText="Guardar"
        onOk={() => matriculaForm.submit()}
        confirmLoading={matriculaLoading}
      >
        <Form form={matriculaForm} layout="vertical" onFinish={handleCrearMatricula}>
          <Form.Item
            label="Selecciona el grupo"
            name="curso_id"
            rules={[{ required: true, message: "Elige el grupo" }]}
          >
            <Select
              showSearch
              placeholder="Selecciona un grupo"
              filterOption={(input, option) =>
                (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
              }
              options={[...cursosActivos, ...cursosProximos].map((curso) => ({
                label: `${curso.nombre} · ${formatFecha(curso.fecha_inicio)}`,
                value: curso.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="Estudiante"
            name="estudiante_id"
            rules={[{ required: true, message: "Selecciona el estudiante" }]}
          >
            <Select
              showSearch
              placeholder="Selecciona un estudiante"
              filterOption={(input, option) =>
                (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
              }
              options={estudiantes.map((est) => ({
                label: est.nombre_completo,
                value: est.id,
              }))}
            />
          </Form.Item>
          <Divider style={{ margin: "12px 0" }} />
          <Text type="secondary">Si el estudiante no aparece, regístralo primero desde el módulo de Estudiantes.</Text>
        </Form>
      </Modal>
    </div>
  );
}
