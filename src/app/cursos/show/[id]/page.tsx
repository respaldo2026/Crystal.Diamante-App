"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, Tabs, Table, Tag, Row, Col, Statistic, Button, Space, Typography, Spin, Alert, Modal, Form, Input, InputNumber, DatePicker, Upload, List, Empty, App } from "antd";
import {
  UserOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  BookOutlined,
  FileOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  FormOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface Student {
  id: number;
  nombre_completo: string;
  email: string;
  identificacion: string;
  estado: string;
  nota_final: number | null;
  asistencia_porcentaje: number;
  totalClases: number;
  presentes: number;
}

interface Tema {
  id: string;
  titulo: string;
  descripcion?: string;
  orden?: number;
  created_at?: string;
}

interface Sesion {
  id: string;
  fecha: string;
  horas_dictadas: number;
  tema_visto?: string;
  asistencia?: number;
  observaciones?: string;
}

export default function CursoShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { message, modal } = App.useApp();
  const [cursoId, setCursoId] = useState<string>("");
  const [curso, setCurso] = useState<any>(null);
  const [estudiantes, setEstudiantes] = useState<Student[]>([]);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTemaVisible, setModalTemaVisible] = useState(false);
  const [modalSesionVisible, setModalSesionVisible] = useState(false);
  const [formTema] = Form.useForm();
  const [formSesion] = Form.useForm();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("1");

  // Memoized columns to avoid re-creation on every render
  const columnasSesiones = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        render: (fecha: string) => dayjs(fecha).format("DD MMM YYYY"),
        sorter: (a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
      },
      {
        title: "Tema",
        dataIndex: "tema_visto",
        render: (tema: string) => (tema ? <Tag>{tema}</Tag> : <Text type="secondary">-</Text>),
      },
      {
        title: "Horas Dictadas",
        dataIndex: "horas_dictadas",
        align: "center" as const,
        render: (horas: number) => <Tag color="blue">{horas}h</Tag>,
      },
      {
        title: "Observaciones",
        dataIndex: "observaciones",
        ellipsis: true,
        render: (obs: string) => (obs ? <Text type="secondary">{obs}</Text> : <Text type="secondary">-</Text>),
      },
    ],
    []
  );

  const columnasEstudiantes = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "nombre_completo",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      { title: "Identificación", dataIndex: "identificacion", width: 150 },
      { title: "Email", dataIndex: "email", ellipsis: true },
      {
        title: "Estado",
        dataIndex: "estado",
        render: (estado: string) => {
          let color = "default";
          if (estado === "activo") color = "success";
          if (estado === "aprobado" || estado === "certificado") color = "blue";
          if (estado === "cancelado") color = "error";
          return <Tag color={color}>{estado?.toUpperCase()}</Tag>;
        },
        width: 120,
      },
      {
        title: "Asistencia",
        dataIndex: "asistencia_porcentaje",
        render: (porcentaje: number) => {
          let color = "success";
          if (porcentaje < 80) color = "warning";
          if (porcentaje < 70) color = "error";
          return <Tag color={color}>{porcentaje}%</Tag>;
        },
        width: 100,
        sorter: (a: any, b: any) => a.asistencia_porcentaje - b.asistencia_porcentaje,
      },
      {
        title: "Acciones",
        key: "acciones",
        width: 260,
        render: (_: any, record: any) => {
          const esActivo = record.estado === "activo";
          return (
            <Space>
              <Button size="small" type="primary" disabled={!esActivo} onClick={() => actualizarEstadoMatricula(record.id, "completada")}>Completada</Button>
              <Button size="small" danger disabled={!esActivo} onClick={() => actualizarEstadoMatricula(record.id, "cancelada")}>Cancelar</Button>
              <Button size="small" disabled={!esActivo} onClick={() => actualizarEstadoMatricula(record.id, "retirada")}>Retirar</Button>
            </Space>
          );
        },
      },
    ],
    []
  );

  const columnasCalificaciones = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "nombre_completo",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: "Nota Final",
        dataIndex: "nota_final",
        render: (nota: number) => {
          if (!nota) return <Text type="secondary">Pendiente</Text>;
          let color = "success";
          if (nota < 3) color = "error";
          if (nota < 4) color = "warning";
          return <Tag color={color}>{nota.toFixed(1)}/5.0</Tag>;
        },
        width: 120,
      },
      {
        title: "Estado",
        dataIndex: "estado",
        render: (estado: string) => {
          let color = "default";
          if (estado === "aprobado" || estado === "certificado") color = "success";
          if (estado === "activo") color = "processing";
          return <Tag color={color}>{estado?.toUpperCase()}</Tag>;
        },
        width: 140,
      },
    ],
    []
  );

  useEffect(() => {
    const loadParams = async () => {
      const { id } = await params;
      setCursoId(id);
      await cargarDatos(id);
    };
    loadParams();
  }, [params]);

  const cargarDatos = async (id: string) => {
    setLoading(true);
    try {
      // Curso
      const { data: cursoData, error: errorCurso } = await supabaseBrowserClient
        .from("cursos")
        .select("*")
        .eq("id", parseInt(id))
        .single();
      
      if (errorCurso) {
        console.error("Error cargando curso:", errorCurso);
        return;
      }

      // Profesor
      let cursoConProfesor = cursoData;
      if (cursoData?.profesor_id) {
        const { data: profesorData } = await supabaseBrowserClient
          .from("perfiles")
          .select("nombre_completo")
          .eq("id", cursoData.profesor_id)
          .single();
        cursoConProfesor = { ...cursoData, perfiles: profesorData };
      }
      
      setCurso(cursoConProfesor);

      // Estudiantes
      const { data: matriculasData } = await supabaseBrowserClient
        .from("matriculas")
        .select("id, estudiante_id, estado, nota_final")
        .eq("curso_id", parseInt(id));

      if (matriculasData) {
        const estudiantesConAsistencia = await Promise.all(
          matriculasData.map(async (matricula: any) => {
            // Obtener datos del estudiante
            const { data: estudiante } = await supabaseBrowserClient
              .from("perfiles")
              .select("nombre_completo, email, identificacion")
              .eq("id", matricula.estudiante_id)
              .single();

            // Obtener asistencia
            const { data: asistencias } = await supabaseBrowserClient
              .from("asistencias")
              .select("estado")
              .eq("matricula_id", matricula.id);

            const totalClases = asistencias?.length || 0;
            const presentes = asistencias?.filter(a => a.estado === "presente").length || 0;
            const porcentaje = totalClases > 0 ? (presentes / totalClases) * 100 : 0;

            return {
              id: matricula.id,
              nombre_completo: estudiante?.nombre_completo || "Sin nombre",
              email: estudiante?.email || "-",
              identificacion: estudiante?.identificacion || "-",
              estado: matricula.estado,
              nota_final: matricula.nota_final,
              asistencia_porcentaje: Math.round(porcentaje),
              totalClases,
              presentes
            };
          })
        );
        setEstudiantes(estudiantesConAsistencia);
      }

      // Temario
      const { data: temasData } = await supabaseBrowserClient
        .from("temas_curso")
        .select("*")
        .eq("curso_id", parseInt(id))
        .order("orden", { ascending: true });
      setTemas(temasData || []);

      // Sesiones de clase
      const { data: sesionesData } = await supabaseBrowserClient
        .from("sesiones_clase")
        .select("*")
        .eq("curso_id", parseInt(id))
        .order("fecha", { ascending: false });
      setSesiones(sesionesData || []);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const actualizarEstadoMatricula = async (matriculaId: number, nuevoEstado: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("matriculas")
        .update({ estado: nuevoEstado })
        .eq("id", matriculaId);
      if (error) throw error;
      message.success(`Matrícula marcada como ${nuevoEstado}`);
      await cargarDatos(cursoId);
    } catch (error: any) {
      message.error("No se pudo actualizar la matrícula");
      console.error(error);
    }
  };

  const handleToggleEstadoGrupo = async () => {
    const esActivo = curso.estado === "activo";
    const nuevoEstado = esActivo ? "finalizado" : "activo";
    const accion = esActivo ? "finalizar" : "reactivar";

    try {
      if (esActivo) {
        const activos = estudiantes.filter(e => e.estado === "activo");
        if (activos.length > 0) {
          modal.warning({
            title: "No se puede finalizar el grupo",
            content: (
              <div>
                <p>Este grupo tiene <strong>{activos.length} estudiantes activos</strong>. Antes de finalizarlo debes:</p>
                <ol>
                  <li>En esta misma vista, usar los botones en la lista de estudiantes</li>
                  <li>Marcar las matrículas como completada, cancelada o retirada según corresponda</li>
                  <li>Una vez que todas las matrículas estén cerradas, podrás finalizar el grupo</li>
                </ol>
                <p><strong>Estudiantes activos:</strong></p>
                <ul>
                  {activos.slice(0, 5).map((m: any) => (
                    <li key={m.id}>{m.nombre_completo}</li>
                  ))}
                  {activos.length > 5 && <li>... y {activos.length - 5} más</li>}
                </ul>
              </div>
            ),
            okText: "Entendido",
          });
          return;
        }
      }

      modal.confirm({
        title: esActivo ? "¿Finalizar este grupo/cohorte?" : "¿Reactivar este grupo/cohorte?",
        content: esActivo ? (
          <div>
            <p>Estás a punto de <strong>finalizar</strong> el grupo:</p>
            <p><strong>{curso.nombre}</strong></p>
            <p>¿Qué sucede al finalizar?</p>
            <ul>
              <li>El grupo desaparecerá de la lista principal</li>
              <li>No aparecerá al crear nuevas matrículas</li>
              <li>Todo el historial se mantiene intacto</li>
              <li>Las matrículas existentes se conservan</li>
              <li>Podrás reactivarlo si es necesario</li>
            </ul>
          </div>
        ) : (
          <div>
            <p>Estás a punto de <strong>reactivar</strong> el grupo:</p>
            <p><strong>{curso.nombre}</strong></p>
            <p>El grupo volverá a estar disponible para nuevas inscripciones.</p>
          </div>
        ),
        okText: esActivo ? "Sí, finalizar" : "Sí, reactivar",
        okType: esActivo ? "default" : "primary",
        cancelText: "Cancelar",
        onOk: async () => {
          const { error } = await supabaseBrowserClient
            .from("cursos")
            .update({ estado: nuevoEstado })
            .eq("id", parseInt(cursoId));
          if (error) throw error;
          message.success(`Grupo ${nuevoEstado === 'activo' ? 'reactivado' : 'finalizado'} correctamente`);
          await cargarDatos(cursoId);
        },
      });
    } catch (error: any) {
      message.error(`Error al ${accion} el grupo`);
      console.error(error);
    }
  };

  const onAddTema = async (values: any) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("temas_curso")
        .insert({
          curso_id: parseInt(cursoId),
          titulo: values.titulo,
          descripcion: values.descripcion,
          orden: values.orden || (temas.length + 1)
        });

      if (error) throw error;
      formTema.resetFields();
      setModalTemaVisible(false);
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error agregando tema:", error);
    }
  };

  const onAddSesion = async (values: any) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("sesiones_clase")
        .insert({
          curso_id: parseInt(cursoId),
          profesor_id: curso.profesor_id,
          fecha: values.fecha.format("YYYY-MM-DD"),
          horas_dictadas: values.horas_dictadas,
          tema_visto: values.tema_visto,
          observaciones: values.observaciones
        });

      if (error) throw error;
      formSesion.resetFields();
      setModalSesionVisible(false);
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error agregando sesión:", error);
    }
  };

  const onDeleteTema = async (temaId: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("temas_curso")
        .delete()
        .eq("id", temaId);

      if (error) throw error;
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error eliminando tema:", error);
    }
  };

  if (loading) {
    return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;
  }

  if (!curso) {
    return (
      <Card style={{ padding: 50 }}>
        <Alert message="Curso no encontrado" type="error" />
      </Card>
    );
  }

  const totalEstudiantes = estudiantes.length;
  const estudiantesActivos = estudiantes.filter(e => e.estado === "activo").length;
  const promedioAsistencia = estudiantes.length > 0
    ? Math.round(estudiantes.reduce((sum, e) => sum + e.asistencia_porcentaje, 0) / estudiantes.length)
    : 0;
  const estudiantesEnRiesgo = estudiantes.filter(e => e.asistencia_porcentaje < (curso.porcentaje_minimo || 80)).length;

  return (
    <div style={{ padding: 24 }}>
      {/* ENCABEZADO - OFICINA DEL PROFESOR */}
      <div style={{ marginBottom: 24, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: 20, borderRadius: 8 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push("/cursos")}
              style={{ background: "rgba(255,255,255,0.3)" }}
            >
              Volver
            </Button>
            <Title level={2} style={{ margin: 0, color: "white" }}>{curso.nombre}</Title>
            <Space>
              <Button icon={<BookOutlined />} onClick={() => setActiveTab("1")}>
                Ver Temario
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => router.push(`/asistencias/create?curso_id=${cursoId}&curso_nombre=${encodeURIComponent(curso.nombre)}`)}
              >
                Llamar Lista
              </Button>
              <Button icon={<FormOutlined />} onClick={() => setActiveTab("5")}>
                Calificar Tareas
              </Button>
              {curso.estado === 'activo' && (
                <Tag color="blue" style={{ marginLeft: 8 }}>{estudiantesActivos} activos</Tag>
              )}
              <Button 
                type={curso.estado === 'activo' ? 'default' : 'primary'}
                danger={curso.estado === 'activo'}
                onClick={handleToggleEstadoGrupo}
              >
                {curso.estado === 'activo' ? 'Finalizar Grupo' : 'Reactivar Grupo'}
              </Button>
            </Space>
          </Space>
          <div>
            <Text style={{ color: "rgba(255,255,255,0.9)" }}>
              👨‍🏫 Profesor: <strong>{curso.perfiles?.nombre_completo || "Sin asignar"}</strong> • 📅 Inicio: {dayjs(curso.fecha_inicio).format("DD MMM YYYY")} • ⏱️ Duración: {curso.duracion}
            </Text>
          </div>
        </Space>
      </div>

      {/* ESTADÍSTICAS RÁPIDAS */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Estudiantes" value={totalEstudiantes} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Activos" value={estudiantesActivos} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Asistencia" value={promedioAsistencia} suffix="%" valueStyle={{ color: promedioAsistencia >= 80 ? "#52c41a" : "#ff4d4f" }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="En Riesgo" value={estudiantesEnRiesgo} valueStyle={{ color: estudiantesEnRiesgo > 0 ? "#ff4d4f" : "#52c41a" }} />
          </Card>
        </Col>
      </Row>

      {/* TABS - OFICINA COMPLETA DEL PROFESOR */}
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Temario / Pensum ({temas.length})</span>,
            children: (
              <Card
                title="Contenido del Curso - Temario"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalTemaVisible(true)}>
                    Agregar Tema
                  </Button>
                }
              >
                {temas.length > 0 ? (
                  <List
                    dataSource={temas}
                    renderItem={(tema, index) => (
                      <List.Item key={tema?.id ?? index}
                        actions={[
                          <Button key={`eliminar-tema-${tema?.id ?? index}`} type="link" danger icon={<DeleteOutlined />} onClick={() => onDeleteTema(tema.id)}>
                            Eliminar
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<span style={{ fontSize: 24, fontWeight: "bold", color: "#667eea" }}>{tema.orden || index + 1}</span>}
                          title={<Text strong>{tema.titulo}</Text>}
                          description={tema.descripcion}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="No hay temas registrados. Comienza a agregar contenido." />
                )}
              </Card>
            )
          },
          {
            key: "2",
            label: <span><FileOutlined /> Material Didáctico</span>,
            children: (
              <Card
                title="Recursos y Material para la Enseñanza"
                extra={
                  <Upload maxCount={5} multiple>
                    <Button type="primary" icon={<PlusOutlined />}>
                      Subir Material
                    </Button>
                  </Upload>
                }
              >
                <Alert
                  message="Característica en desarrollo"
                  description="Aquí podrás subir PDFs, videos, documentos y otros recursos para tus estudiantes."
                  type="info"
                  showIcon
                />
                <div style={{ marginTop: 20 }}>
                  <Text type="secondary">Los materiales subidos estarán disponibles para que los estudiantes descarguen desde sus secciones.</Text>
                </div>
              </Card>
            )
          },
          {
            key: "3",
            label: <span><ClockCircleOutlined /> Sesiones de Clase ({sesiones.length})</span>,
            children: (
              <Card
                title="Registro de Sesiones y Clases Dictadas"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSesionVisible(true)}>
                    Registrar Sesión
                  </Button>
                }
              >
                <Table
                  dataSource={sesiones}
                  rowKey="id"
                  pagination={{ pageSize: 15 }}
                  columns={columnasSesiones}
                />
              </Card>
            )
          },
          {
            key: "4",
            label: <span><UserOutlined /> Estudiantes ({totalEstudiantes})</span>,
            children: (
              <Card title="Lista de Estudiantes Matriculados">
                <Table
                  dataSource={estudiantes}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                  columns={columnasEstudiantes}
                />
              </Card>
            )
          },
          {
            key: "5",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <Card title="Notas y Desempeño de Estudiantes">
                <Table
                  dataSource={estudiantes}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                  columns={columnasCalificaciones}
                />
              </Card>
            )
          }
        ]}
      />

      {/* MODAL AGREGAR TEMA */}
      <Modal
        title="Agregar Tema al Temario"
        open={modalTemaVisible}
        onOk={() => formTema.submit()}
        onCancel={() => setModalTemaVisible(false)}
      >
        <Form form={formTema} layout="vertical" onFinish={onAddTema}>
          <Form.Item label="Número de Orden" name="orden">
            <InputNumber min={1} placeholder="Ej: 1, 2, 3..." />
          </Form.Item>
          <Form.Item label="Título del Tema" name="titulo" rules={[{ required: true }]}>
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>
          <Form.Item label="Descripción" name="descripcion">
            <Input.TextArea rows={3} placeholder="Describe brevemente qué se cubrirá en este tema..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL REGISTRAR SESIÓN */}
      <Modal
        title="Registrar Sesión de Clase"
        open={modalSesionVisible}
        onOk={() => formSesion.submit()}
        onCancel={() => setModalSesionVisible(false)}
      >
        <Form form={formSesion} layout="vertical" onFinish={onAddSesion}>
          <Form.Item label="Fecha" name="fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Horas Dictadas" name="horas_dictadas" rules={[{ required: true }]}>
            <InputNumber min={0.5} step={0.5} placeholder="Ej: 2" />
          </Form.Item>
          <Form.Item label="Tema Visto" name="tema_visto">
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>
          <Form.Item label="Observaciones" name="observaciones">
            <Input.TextArea rows={3} placeholder="Notas sobre la clase..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
