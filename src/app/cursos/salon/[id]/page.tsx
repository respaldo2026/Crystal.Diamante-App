"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Tabs, Typography, Space, Tag, Button, Table, Upload, List, Progress, Statistic, Row, Col, App } from "antd";
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  UploadOutlined,
  DownloadOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";
import { formatDate, formatTime } from "@utils/date";

const { Title, Text } = Typography;

export default function SalonVirtualPage() {
  const params = useParams();
  const cursoId = params?.id as string;
  const { list } = useNavigation();
  const { message } = App.useApp();
  const { user } = useCurrentUser();
  const [curso, setCurso] = useState<any>(null);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (cursoId) {
      cargarDatos();
    }
  }, [cursoId]);

  const cargarDatos = async () => {
    setLoading(true);
    
    // Cargar información del curso
    const { data: cursoData, error: cursoError } = await supabaseBrowserClient
      .from("cursos")
      .select("*, programas(nombre, descripcion), perfiles(nombre_completo)")
      .eq("id", cursoId)
      .single();

    if (cursoError) {
      message.error("Error cargando el curso");
      setLoading(false);
      return;
    }

    setCurso(cursoData);

    // Cargar estudiantes matriculados
    const { data: matriculasData, error: matriculasError } = await supabaseBrowserClient
      .from("matriculas")
      .select("*, perfiles(id, nombre_completo, email, telefono)")
      .eq("curso_id", cursoId)
      .in("estado", ["activo", "en curso"]);

    if (!matriculasError && matriculasData) {
      setEstudiantes(matriculasData);
    }

    // Cargar asistencias
    const { data: asistenciasData, error: asistenciasError } = await supabaseBrowserClient
      .from("asistencias")
      .select("*, perfiles(nombre_completo)")
      .in("matricula_id", matriculasData?.map(m => m.id) || [])
      .order("fecha", { ascending: false });

    if (!asistenciasError && asistenciasData) {
      setAsistencias(asistenciasData);
    }

    setLoading(false);
  };

  const calcularEstadisticas = () => {
    const totalEstudiantes = estudiantes.length;
    const totalClases = asistencias.length > 0 
      ? new Set(asistencias.map(a => a.fecha)).size
      : 0;

    return { totalEstudiantes, totalClases };
  };

  const { totalEstudiantes, totalClases } = calcularEstadisticas();

  // Tabs del salón virtual
  const items = [
    {
      key: "estudiantes",
      label: (
        <span>
          <UserOutlined /> Estudiantes ({totalEstudiantes})
        </span>
      ),
      children: (
        <Table
          dataSource={estudiantes}
          loading={loading}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: "Nombre",
              dataIndex: ["perfiles", "nombre_completo"],
              key: "nombre",
              render: (text) => <Text strong>{text}</Text>,
            },
            {
              title: "Email",
              dataIndex: ["perfiles", "email"],
              key: "email",
            },
            {
              title: "Teléfono",
              dataIndex: ["perfiles", "telefono"],
              key: "telefono",
            },
            {
              title: "Estado",
              dataIndex: "estado",
              key: "estado",
              render: (estado) => (
                <Tag color={estado === "activo" ? "green" : "blue"}>
                  {estado?.toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Asistencia",
              key: "asistencia",
              render: (_, record) => {
                const asistenciasEstudiante = asistencias.filter(
                  a => a.matricula_id === record.id
                );
                const presentes = asistenciasEstudiante.filter(
                  a => a.estado === "presente"
                ).length;
                const total = asistenciasEstudiante.length;
                const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

                return (
                  <Space>
                    <Progress
                      type="circle"
                      percent={porcentaje}
                      width={50}
                      status={porcentaje >= 80 ? "success" : porcentaje >= 60 ? "normal" : "exception"}
                    />
                    <Text type="secondary">{presentes}/{total}</Text>
                  </Space>
                );
              },
            },
          ]}
        />
      ),
    },
    {
      key: "asistencia",
      label: (
        <span>
          <CheckCircleOutlined /> Asistencia ({totalClases} clases)
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => {
              message.info("Funcionalidad de tomar asistencia en desarrollo");
            }}
          >
            Tomar Asistencia Hoy
          </Button>
          
          <Table
            dataSource={asistencias}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: "Fecha",
                dataIndex: "fecha",
                key: "fecha",
                render: (fecha) => formatDate(fecha),
                sorter: (a, b) => dayjs(a.fecha).unix() - dayjs(b.fecha).unix(),
              },
              {
                title: "Estudiante",
                dataIndex: ["perfiles", "nombre_completo"],
                key: "estudiante",
              },
              {
                title: "Estado",
                dataIndex: "estado",
                key: "estado",
                render: (estado) => {
                  const config: any = {
                    presente: { color: "success", icon: <CheckCircleOutlined />, text: "Presente" },
                    ausente: { color: "error", icon: <CloseCircleOutlined />, text: "Ausente" },
                    tardanza: { color: "warning", icon: <ClockCircleOutlined />, text: "Tardanza" },
                  };
                  const conf = config[estado] || config.ausente;
                  return (
                    <Tag color={conf.color} icon={conf.icon}>
                      {conf.text}
                    </Tag>
                  );
                },
                filters: [
                  { text: "Presente", value: "presente" },
                  { text: "Ausente", value: "ausente" },
                  { text: "Tardanza", value: "tardanza" },
                ],
                onFilter: (value, record) => record.estado === value,
              },
              {
                title: "Observaciones",
                dataIndex: "observaciones",
                key: "observaciones",
                ellipsis: true,
              },
            ]}
          />
        </Space>
      ),
    },
    {
      key: "calificaciones",
      label: (
        <span>
          <TrophyOutlined /> Calificaciones
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text type="secondary">
              Sistema de calificaciones en desarrollo. Aquí podrás:
            </Text>
            <ul>
              <li>Registrar notas por módulo/tema</li>
              <li>Calcular promedios automáticos</li>
              <li>Generar reportes de rendimiento</li>
              <li>Exportar calificaciones</li>
            </ul>
            <Button type="primary" disabled>
              Próximamente
            </Button>
          </Space>
        </Card>
      ),
    },
    {
      key: "material",
      label: (
        <span>
          <FileTextOutlined /> Material Didáctico
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Card title="Subir Material">
            <Upload>
              <Button icon={<UploadOutlined />}>Subir archivo</Button>
            </Upload>
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              PDF, PPT, DOCX, imágenes, videos
            </Text>
          </Card>

          <Card title="Material Disponible">
            <List
              dataSource={[]}
              locale={{ emptyText: "No hay material didáctico cargado aún" }}
              renderItem={(item: any) => (
                <List.Item
                  actions={[
                    <Button key="download" icon={<DownloadOutlined />} size="small">
                      Descargar
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={item.nombre}
                    description={`Subido el ${formatDate(item.fecha)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <Card loading={loading}>
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }}>
          <Text>Cargando salón virtual...</Text>
        </Space>
      </Card>
    );
  }

  if (!curso) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }}>
          <Text type="danger">No se encontró el curso</Text>
          <Button onClick={() => list("cursos")}>Volver a Cursos</Button>
        </Space>
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Card>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => list("cursos")}
            type="text"
          >
            Volver a Grupos
          </Button>

          <Title level={2} style={{ margin: 0 }}>
            {curso.programas?.nombre || curso.nombre}
          </Title>

          <Space wrap>
            {curso.dias_semana && (
              <Tag icon={<CalendarOutlined />}>
                {Array.isArray(curso.dias_semana)
                  ? curso.dias_semana.join(", ")
                  : curso.dias_semana}
              </Tag>
            )}
            {curso.hora_inicio && (
              <Tag icon={<ClockCircleOutlined />}>
                {formatTime(dayjs(curso.hora_inicio, "HH:mm:ss"))} - {curso.hora_fin ? formatTime(dayjs(curso.hora_fin, "HH:mm:ss")) : ""}
              </Tag>
            )}
            {curso.perfiles?.nombre_completo && (
              <Tag icon={<UserOutlined />}>{curso.perfiles.nombre_completo}</Tag>
            )}
          </Space>

          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Estudiantes"
                value={totalEstudiantes}
                prefix={<UserOutlined />}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Clases Impartidas"
                value={totalClases}
                prefix={<CalendarOutlined />}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Estado"
                value={curso.estado?.toUpperCase()}
                valueStyle={{ color: curso.estado === "activo" ? "#3f8600" : "#666" }}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      <Card>
        <Tabs items={items} defaultActiveKey="estudiantes" />
      </Card>
    </Space>
  );
}
