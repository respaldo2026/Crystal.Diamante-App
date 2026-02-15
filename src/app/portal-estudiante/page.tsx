"use client";

import React, { useEffect, useState } from "react";
import { logger } from "@utils/logger";
import {
  Tabs,
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Spin,
  Alert,
  Progress,
  Button,
  Empty,
  message,
  Tag,
  Divider,
  List,
  Collapse,
  Typography,
  Space,
  Dropdown
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  TrophyOutlined,
  DownloadOutlined,
  WhatsAppOutlined,
  DollarCircleOutlined,
  SafetyCertificateOutlined,
  VideoCameraOutlined,
  FilePdfOutlined,
  ClockCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { formatDate } from "@utils/date";
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";
import { HistorialEntregas } from "@components/EntregaMaterialModal";

dayjs.locale("es");

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function PortalEstudiante() {
  const [loading, setLoading] = useState(true);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [pensum, setPensum] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAdmisiones, setWhatsappAdmisiones] = useState<string | null>(null);

  const deduplicarLista = <T,>(items: T[], resolverClave: (item: T) => string) => {
    const vistos = new Set<string>();
    const resultado: T[] = [];
    for (const item of items || []) {
      const clave = resolverClave(item);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      resultado.push(item);
    }
    return resultado;
  };

  const obtenerSaludoBienvenida = (genero?: string | null) => {
    const generoNormalizado = String(genero || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (["femenino", "femenina", "mujer"].includes(generoNormalizado)) {
      return "Bienvenida";
    }

    if (["masculino", "masculina", "hombre"].includes(generoNormalizado)) {
      return "Bienvenido";
    }

    return "Te damos la bienvenida";
  };

  const normalizarTelefonoWhatsapp = (valor?: string | null): string | null => {
    if (!valor) return null;

    const texto = String(valor).trim();
    if (!texto) return null;

    const matchWa = texto.match(/wa\.me\/(\d+)/i);
    const base = matchWa?.[1] || texto;
    let digitos = base.replace(/\D/g, "");

    if (!digitos) return null;

    if (digitos.length === 10) {
      digitos = `57${digitos}`;
    }

    return digitos;
  };

  const abrirWhatsapp = (telefono: string | null, mensajeBase: string) => {
    if (!telefono) {
      message.warning("No hay número de WhatsApp configurado");
      return;
    }

    const enlace = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeBase)}`;
    window.open(enlace, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);

      const { data: { user }, error: authError } = await supabaseBrowserClient.auth.getUser();
      if (authError || !user) {
        message.error("No autenticado");
        return;
      }

      const { data: perfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (errPerfil || !perfil) {
        message.error("Perfil no encontrado. Contacta a la administración.");
        return;
      }

      setEstudiante(perfil);

      const { data: config } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const numeroAgente = normalizarTelefonoWhatsapp((config as any)?.whatsapp_agente || (config as any)?.whatsapp || null);
      const numeroAdmisiones = normalizarTelefonoWhatsapp((config as any)?.whatsapp_admisiones || (config as any)?.telefono || (config as any)?.whatsapp || null);

      setWhatsappAgente(numeroAgente);
      setWhatsappAdmisiones(numeroAdmisiones);

      // 1. Cargar Matrículas con Cursos y Programas
      const { data: dataMatriculas } = await supabaseBrowserClient
        .from("matriculas")
        .select(`
          *,
          cursos (
            *,
            programas (*)
          )
        `)
        .eq("estudiante_id", user.id)
        .neq("estado", "cancelado");

      setMatriculas(dataMatriculas || []);

      const matriculaIds = dataMatriculas?.map(m => m.id) || [];
      const programaIds = dataMatriculas?.map(m => m.cursos?.programa_id).filter(Boolean) || [];

      // 2. Cargar Pagos (Independiente de matrículas activas para ver historial completo)
      const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
        .from("pagos")
        .select("*")
        .eq("estudiante_id", user.id)
        .order("fecha_vencimiento", { ascending: true });
      
      if (errPagos) logger.error("Error cargando pagos:", errPagos);

      let pagosFinales = dataPagos || [];

      if (pagosFinales.length === 0 && matriculaIds.length > 0) {
        const { data: pagosPorMatricula, error: errPagosPorMatricula } = await supabaseBrowserClient
          .from("pagos")
          .select("*")
          .in("matricula_id", matriculaIds)
          .order("fecha_vencimiento", { ascending: true });

        if (errPagosPorMatricula) {
          logger.error("Error cargando pagos por matrícula:", errPagosPorMatricula);
        } else {
          pagosFinales = pagosPorMatricula || [];
        }
      }

      setPagos(pagosFinales);

      // 3. Cargar datos relacionados a matrículas activas
      if (matriculaIds.length > 0) {
        // Asistencias
        const { data: dataAsistencias } = await supabaseBrowserClient
          .from("asistencias")
          .select("*, matriculas(id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: false });
        setAsistencias(dataAsistencias || []);

        // Calificaciones
        const { data: dataCalificaciones } = await supabaseBrowserClient
          .from("calificaciones")
          .select("*, matriculas(id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha_evaluacion", { ascending: false });
        setCalificaciones(dataCalificaciones || []);
      }

      // 4. Cargar Pensum y Materiales si hay programas
      if (programaIds.length > 0) {
        const pensumData = await obtenerPensumPorProgramas(programaIds);
        setPensum(pensumData);

        const materialesData = await obtenerMaterialesPorProgramas(programaIds);
        const materialesUnicos = deduplicarLista(materialesData || [], (m: any) =>
          String(m?.id || `${m?.programa_id || ''}-${m?.pensum_id || ''}-${m?.titulo || ''}-${m?.url_archivo || ''}`)
        );
        setMateriales(materialesUnicos);

        const materialesClaseData = await obtenerMaterialesClasePorProgramas(programaIds);
        const materialesClaseUnicos = deduplicarLista(materialesClaseData || [], (m: any) =>
          String(m?.id || `${m?.programa_id || ''}-${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${m?.nombre_material || ''}-${m?.cantidad || ''}-${m?.unidad || ''}`)
        );
        setMaterialesClase(materialesClaseUnicos);
      }

      // 5. Calcular Avance y Certificados
      if (dataMatriculas) {
        const avance = dataMatriculas.map((m: any) => ({
          curso: m.cursos?.nombre,
          programa: m.cursos?.programas?.nombre,
          nota: m.nota_final || 0,
          estado: m.estado_academico
        }));
        setAvancePorCurso(avance);

        const certs = dataMatriculas.filter((m: any) => m.estado_academico === 'aprobado' && m.nota_final >= 70);
        setCertificados(certs);
      }
    } catch (error) {
      logger.error("Error:", error);
      message.error("Error cargando información del portal");
    } finally {
      setLoading(false);
    }
  };

  const descargarCertificado = async (matricula: any) => {
    try {
      await descargarCertificadoPDF({
        estudianteName: estudiante?.nombre_completo || "Estudiante",
        courseName: matricula?.cursos?.nombre || "Curso",
        fechaFinalizacion: matricula?.cursos?.fecha_fin || new Date().toISOString(),
        folio: String(matricula?.id || "FOLIO"),
      });
      message.success("Certificado descargado");
    } catch (err: any) {
      logger.error(err);
      message.error("No se pudo descargar el certificado");
    }
  };

  const renderFinanciero = () => {
    const pendientes = pagos.filter(p => p.estado === 'pendiente');
    const realizados = pagos.filter(p => p.estado === 'pagado');

    // Función auxiliar para determinar si está vencido (estrictamente anterior a hoy)
    const isVencido = (fecha: string) => {
      return fecha && dayjs().startOf('day').isAfter(dayjs(fecha));
    };

    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<><ClockCircleOutlined /> Próximos Pagos</>} className="shadow-sm">
            {pendientes.length > 0 ? (
              <Table 
                dataSource={pendientes} 
                rowKey="id" 
                pagination={false} 
                size="small"
                scroll={{ x: 560 }}
                columns={[
                  { 
                    title: 'Concepto', 
                    dataIndex: 'periodo_pagado', 
                    render: (t, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{t || `Cuota ${r.numero_cuota}`}</span>;
                    } 
                  },
                  { 
                    title: 'Vence', 
                    dataIndex: 'fecha_vencimiento', 
                    render: (d, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{d ? dayjs(d).format("DD/MM/YYYY") : '-'}</span>;
                    }
                  },
                  { 
                    title: 'Monto', 
                    dataIndex: 'monto', 
                    render: (v, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{`$ ${Number(v).toLocaleString()}`}</span>;
                    }
                  },
                  { 
                    title: 'Estado', 
                    render: (_, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      if (vencido) return <Tag color="red">VENCIDO</Tag>;
                      return <Tag style={{ color: '#8c8c8c', borderColor: '#d9d9d9', fontSize: '11px' }}>PENDIENTE</Tag>;
                    } 
                  }
                ]}
              />
            ) : (
              <Alert message="¡Estás al día!" description="No tienes pagos pendientes." type="success" showIcon />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><CheckCircleOutlined /> Historial de Pagos</>} className="shadow-sm">
             <Table 
                dataSource={realizados} 
                rowKey="id" 
                pagination={{ pageSize: 5 }} 
                size="small"
               scroll={{ x: 520 }}
                columns={[
                  { title: 'Concepto', dataIndex: 'periodo_pagado', render: (t, r: any) => t || `Cuota ${r.numero_cuota}` },
                  { title: 'Fecha', dataIndex: 'fecha_pago', render: (d) => d ? dayjs(d).format("DD/MM/YYYY") : '-' },
                  { title: 'Monto', dataIndex: 'monto', render: (v) => `$ ${Number(v).toLocaleString()}` },
                  { title: 'Estado', render: () => <Tag color="green">PAGADO</Tag> }
                ]}
              />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderPensum = () => {
    if (!matriculas.length) return <Empty description="No tienes cursos activos" />;
    const programasIds = Array.from(new Set(matriculas.map(m => m.cursos?.programa_id))).filter(Boolean);

    return (
      <div>
        {programasIds.map((progId: any) => {
          const programa = matriculas.find(m => m.cursos?.programa_id === progId)?.cursos?.programas;
          const pensumProg = pensum.filter(p => p.programa_id === progId);
          const matProg = materiales.filter(m => m.programa_id === progId);
          const matClaseProg = materialesClase.filter((m) => m.programa_id === progId);

          return (
            <Card key={progId} title={`Plan de Estudios: ${programa?.nombre}`} style={{ marginBottom: 20 }}>
              <Tabs items={[
                {
                  key: 'pensum',
                  label: 'Pensum Académico',
                  children: (
                    <Collapse defaultActiveKey={pensumProg[0]?.id}>
                      {pensumProg.map(ciclo => (
                        <Panel header={`${ciclo.nombre_ciclo} (${ciclo.duracion_semanas || 0} semanas)`} key={ciclo.id}>
                          <Text type="secondary">{ciclo.descripcion}</Text>
                          <Divider style={{ margin: '10px 0' }} />
                          <List
                            header={<Text strong>Temas:</Text>}
                            dataSource={ciclo.pensum_cursos || []}
                            renderItem={(curso: any) => (
                              <List.Item>
                                <List.Item.Meta
                                  avatar={<BookOutlined />}
                                  title={curso.nombre_curso}
                                  description={`${curso.horas} horas • ${curso.tipo_curso}`}
                                />
                              </List.Item>
                            )}
                          />
                        </Panel>
                      ))}
                    </Collapse>
                  )
                },
                {
                  key: 'material',
                  label: 'Material Didáctico',
                  children: (
                    <div>
                      {pensumProg.map(ciclo => {
                        const materialesClaseCiclo = deduplicarLista(
                          matClaseProg.filter((m) => m.pensum_id === ciclo.id),
                          (m: any) => String(m?.id || `${m?.pensum_curso_id || ''}-${m?.nombre_material || ''}-${m?.cantidad || ''}`)
                        );
                        const matsCiclo = deduplicarLista(
                          matProg.filter((m) => m.pensum_id === ciclo.id),
                          (m: any) => String(m?.id || `${m?.titulo || ''}-${m?.url_archivo || ''}-${m?.tipo_material || ''}`)
                        );

                        if (materialesClaseCiclo.length === 0 && matsCiclo.length === 0) return null;

                        const materialesPorTema = materialesClaseCiclo.reduce((acc: Record<string, any[]>, material: any) => {
                          const temaKey = material.pensum_curso_id || 'sin-tema';
                          if (!acc[temaKey]) acc[temaKey] = [];
                          acc[temaKey].push(material);
                          return acc;
                        }, {});

                        return (
                          <Card
                            key={`material-ciclo-${ciclo.id}`}
                            size="small"
                            title={`Ciclo: ${ciclo.nombre_ciclo}`}
                            style={{ marginBottom: 16 }}
                          >
                            {materialesClaseCiclo.length > 0 && (
                              <>
                                <Divider orientation="left" style={{ marginTop: 0 }}>
                                  Materiales para la clase / tema
                                </Divider>
                                <Collapse>
                                  {Object.entries(materialesPorTema).map(([temaId, items]: [string, any]) => {
                                    const temaNombre = items?.[0]?.pensum_cursos?.nombre_curso || 'Clase sin tema definido';
                                    return (
                                      <Panel header={`Tema: ${temaNombre}`} key={`${ciclo.id}-${temaId}`}>
                                        <List
                                          size="small"
                                          dataSource={items}
                                          renderItem={(item: any) => (
                                            <List.Item>
                                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                                <Text strong>{item.nombre_material}</Text>
                                                <Space size={6} wrap>
                                                  <Tag color="blue">Ciclo: {ciclo.nombre_ciclo}</Tag>
                                                  <Tag color="purple">Tema: {temaNombre}</Tag>
                                                  <Tag color={item.obligatorio ? 'red' : 'default'}>
                                                    {item.obligatorio ? 'Obligatorio' : 'Opcional'}
                                                  </Tag>
                                                </Space>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                  {item.cantidad ? `${item.cantidad}${item.unidad ? ` ${item.unidad}` : ''}` : 'Cantidad por definir'}
                                                </Text>
                                                {item.observaciones ? <Text type="secondary">{item.observaciones}</Text> : null}
                                              </Space>
                                            </List.Item>
                                          )}
                                        />
                                      </Panel>
                                    );
                                  })}
                                </Collapse>
                              </>
                            )}

                            {matsCiclo.length > 0 && (
                              <>
                                <Divider orientation="left">Recursos didácticos del ciclo</Divider>
                                <List
                                  grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
                                  dataSource={matsCiclo}
                                  renderItem={(item: any) => {
                                    let Icon = FileTextOutlined;
                                    if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                                    if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                                    return (
                                      <List.Item>
                                        <Card
                                          size="small"
                                          title={<><Icon /> {item.tipo_material?.toUpperCase()}</>}
                                          extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}
                                        >
                                          <Text strong>{item.titulo}</Text>
                                          <br />
                                          <Text type="secondary" style={{ fontSize: 12 }}>
                                            Ciclo: {ciclo.nombre_ciclo}
                                          </Text>
                                          <br />
                                          <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                        </Card>
                                      </List.Item>
                                    );
                                  }}
                                />
                              </>
                            )}
                          </Card>
                        );
                      })}

                      {matProg.filter(m => !m.pensum_id).length > 0 && (
                        <div style={{marginBottom: 24}}>
                          <Divider orientation="left">Material general (no asociado a ciclo)</Divider>
                          <List
                            grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
                            dataSource={matProg.filter(m => !m.pensum_id)}
                            renderItem={(item: any) => {
                              let Icon = FileTextOutlined;
                              if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                              if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                              return (
                                <List.Item>
                                  <Card 
                                    size="small" 
                                    title={<><Icon /> {item.tipo_material?.toUpperCase()}</>}
                                    extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}
                                  >
                                    <Text strong>{item.titulo}</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                  </Card>
                                </List.Item>
                              );
                            }}
                          />
                        </div>
                      )}
                      {matClaseProg.length === 0 && matProg.length === 0 && (
                        <Alert
                          type="info"
                          showIcon
                          message="Aún no hay material didáctico cargado para este programa"
                          description="Cuando administración registre materiales por ciclo, clase o tema, aparecerán aquí organizados."
                        />
                      )}
                    </div>
                  )
                }
              ]} />
            </Card>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 10 }}>Cargando tu información...</div>
      </div>
    );
  }

  return (
    <div className="portal-estudiante" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16} className="header-row">
          <Col xs={24} sm={12}>
            <Title level={2}>{obtenerSaludoBienvenida(estudiante?.genero)}, {estudiante?.nombre_completo}! 🎓</Title>
            <Text type="secondary">Portal de Estudiante - Academy Crystal</Text>
          </Col>
          <Col xs={24} sm={12} className="header-actions" style={{ textAlign: "right" }}>
            {(whatsappAgente || whatsappAdmisiones) && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "agente",
                      label: "Hablar con Agente",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAgente,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Tengo una consulta sobre mis cursos en el portal.`
                        ),
                      disabled: !whatsappAgente,
                    },
                    {
                      key: "admisiones",
                      label: "Hablar con Admisiones",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAdmisiones,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Necesito apoyo de Admisiones.`
                        ),
                      disabled: !whatsappAdmisiones,
                    },
                  ],
                }}
              >
                <Button
                  icon={<WhatsAppOutlined />}
                  type="primary"
                  size="large"
                  style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
                >
                  Contactar por WhatsApp
                </Button>
              </Dropdown>
            )}
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Mis Cursos</span>,
            children: (
              <>
                {avancePorCurso.length === 0 ? (
                  <Empty description="No estás inscrito en ningún curso activo" />
                ) : (
                  <Row gutter={16}>
                    {avancePorCurso.map((curso: any, idx: number) => (
                      <Col xs={24} sm={12} lg={8} key={idx}>
                        <Card className="course-card" title={curso.curso} extra={<Tag>{curso.programa}</Tag>}>
                          <Progress type="circle" percent={curso.nota} format={() => `${curso.nota}/100`} />
                          <div style={{ marginTop: 10, textAlign: 'center' }}>
                            <Tag color={curso.nota >= 70 ? "green" : "orange"}>{curso.estado?.toUpperCase()}</Tag>
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: "2",
            label: <span><SafetyCertificateOutlined /> Plan de Estudios</span>,
            children: renderPensum()
          },
          {
            key: "3",
            label: <span><DollarCircleOutlined /> Financiero</span>,
            children: renderFinanciero()
          },
          {
            key: "4",
            label: <span><CheckCircleOutlined /> Asistencia</span>,
            children: (
              <Table
                dataSource={asistencias}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Fecha", dataIndex: "fecha", render: (f) => formatDate(f) },
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Estado", dataIndex: "estado", render: (e) => <Tag color={e === "presente" ? "green" : "red"}>{e?.toUpperCase()}</Tag> },
                ]}
              />
            ),
          },
          {
            key: "5",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <Table
                dataSource={calificaciones}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Nota", dataIndex: "calificacion", render: (c) => <Tag color={c >= 70 ? "green" : "red"}>{c}</Tag> },
                  { title: "Fecha", dataIndex: "fecha_evaluacion", render: (f) => formatDate(f) },
                ]}
              />
            ),
          },
          {
            key: "6",
            label: <span><TrophyOutlined /> Certificados</span>,
            children: (
              <Table
                dataSource={certificados}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.cursos?.nombre },
                  { title: "Nota Final", dataIndex: "nota_final" },
                  { title: "Acción", render: (_, r) => <Button icon={<DownloadOutlined />} onClick={() => descargarCertificado(r)}>Descargar</Button> }
                ]}
              />
            ),
          },
          {
            key: "7",
            label: <span><BookOutlined /> Materiales (Kits)</span>,
            children: <HistorialEntregas estudianteId={estudiante?.id} />
          }
        ]}
      />
      <style jsx global>{`
        .portal-estudiante .header-row {
          align-items: center;
        }
        @media (max-width: 576px) {
          .portal-estudiante {
            padding: 12px !important;
          }
          .portal-estudiante .header-row {
            text-align: center;
          }
          .portal-estudiante .header-actions {
            text-align: center !important;
            margin-top: 12px;
          }
          .portal-estudiante .header-actions .ant-btn {
            width: 100%;
          }
          .portal-estudiante .ant-card-head-title {
            white-space: normal;
          }
          .portal-estudiante .course-card .ant-card-body {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .portal-estudiante .ant-table {
            font-size: 12px;
          }
          .portal-estudiante .ant-table-cell {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
