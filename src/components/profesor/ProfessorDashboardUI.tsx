import React, { useMemo } from "react";
import { Card, Statistic, Row, Col, Spin, List, Typography, Button, Space, Tag, Divider, Progress } from "antd";
import { Line, Column } from "@ant-design/plots";
import {
  UserAddOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  RiseOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  BookOutlined,
  StarOutlined,
  FormOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { ProfessorDashboardData } from "@hooks/useProfessorDashboard";

interface ProfessorDashboardUIProps {
  dashboard: ProfessorDashboardData | null | undefined;
  onOpenCourse?: (cursoId: string) => void;
}

const fallbackStats: ProfessorDashboardData["stats"] = {
  cursosActivos: 0,
  totalEstudiantes: 0,
  horasMes: 0,
  porcentajeAsistencia: 0,
  promedioCalificaciones: 0,
  pendientesPorCalificar: 0,
  asistenciaChart: [],
  calificacionesChart: [],
  topCursos: [],
};

export const ProfessorDashboardUI: React.FC<ProfessorDashboardUIProps> = ({ dashboard, onOpenCourse }) => {
  const resolvedDashboard: ProfessorDashboardData = dashboard ?? {
    loading: true,
    profesorNombre: undefined,
    stats: fallbackStats,
    cursos: [],
    proximasSesiones: [],
    pendientes: [],
  };

  const { loading, stats, cursos, proximasSesiones, pendientes, profesorNombre } = resolvedDashboard;
  const statsData = stats ?? fallbackStats;
  const proximasSesionesData = proximasSesiones || [];
  const pendientesData = pendientes || [];

  const asistenciaConfig = {
    data: statsData.asistenciaChart || [],
    xField: "fecha",
    yField: "porcentaje",
    smooth: true,
    color: "#22c55e",
    height: 240,
    area: {
      style: {
        fill: "l(90) 0:#bbf7d0 1:#22c55e",
        fillOpacity: 0.25,
      },
    },
    tooltip: {
      formatter: (datum: any) => ({
        name: "Asistencia",
        value: `${datum.porcentaje}%`,
      }),
    },
    yAxis: {
      max: 100,
      min: 0,
      label: {
        formatter: (val: number) => `${val}%`,
      },
    },
  };

  const calificacionesConfig = {
    data: statsData.calificacionesChart || [],
    xField: "fecha",
    yField: "promedio",
    color: "#6366f1",
    height: 240,
    columnWidthRatio: 0.6,
    tooltip: {
      formatter: (datum: any) => ({
        name: "Promedio",
        value: datum.promedio,
      }),
    },
    yAxis: {
      min: 0,
      max: 100,
    },
  };

  const topCursos = useMemo(
    () => [...(statsData.topCursos || [])],
    [statsData.topCursos],
  );

  const cursosOrdenados = useMemo(
    () =>
      [...cursos].sort((a, b) => (b.estudiantesActivos || 0) - (a.estudiantesActivos || 0)),
    [cursos],
  );

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "32px 16px 64px",
        background: "linear-gradient(135deg, #f4f7ff 0%, #ffffff 100%)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 24,
            background: "linear-gradient(135deg, #1e3a8a 0%, #111827 100%)",
            marginBottom: 32,
            color: "#fff",
            boxShadow: "0 20px 45px -24px rgba(30,64,175,0.65)",
          }}
          bodyStyle={{ padding: "36px 40px" }}
        >
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={14}>
              <Typography.Text style={{ color: "rgba(255,255,255,0.65)" }}>
                {dayjs().format("dddd, D MMMM")}
              </Typography.Text>
              <Typography.Title level={2} style={{ color: "#fff", marginTop: 4 }}>
                {profesorNombre ? `Hola, ${profesorNombre}` : "Mi Oficina"}
              </Typography.Title>
              <Typography.Paragraph style={{ color: "rgba(255,255,255,0.7)", marginBottom: 24 }}>
                Visualiza el pulso de tus cursos, haz seguimiento a tus estudiantes y mantén tus clases listas.
              </Typography.Paragraph>
              <Space size="middle" wrap>
                <Button type="primary" icon={<CheckCircleOutlined />} size="large">
                  Tomar asistencia
                </Button>
                <Button ghost icon={<FileTextOutlined />} size="large">
                  Registrar calificación
                </Button>
                <Button ghost icon={<UserAddOutlined />} size="large">
                  Invitar estudiante
                </Button>
              </Space>
            </Col>
            <Col xs={24} md={10}>
              <Card
                bordered={false}
                style={{ borderRadius: 20, background: "rgba(17, 24, 39, 0.55)", color: "#fff" }}
                bodyStyle={{ padding: 24 }}
              >
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic
                      prefix={<BookOutlined style={{ color: "#60a5fa" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Cursos activos</span>}
                      value={statsData.cursosActivos}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      prefix={<TeamOutlined style={{ color: "#34d399" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Estudiantes</span>}
                      value={statsData.totalEstudiantes}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      prefix={<ClockCircleOutlined style={{ color: "#fbbf24" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Horas dictadas</span>}
                      value={statsData.horasMes}
                      suffix="hrs"
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      prefix={<StarOutlined style={{ color: "#a78bfa" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Promedio</span>}
                      value={statsData.promedioCalificaciones}
                      suffix="/100"
                      precision={1}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </Card>

        <Row gutter={[24, 24]} style={{ marginBottom: 12 }}>
          {[{
            key: "asistencia",
            title: "Asistencia promedio",
            value: statsData.porcentajeAsistencia,
            suffix: "%",
            icon: <CalendarOutlined style={{ color: "#16a34a" }} />,
            description: "Últimos 30 días",
          }, {
            key: "pendientes",
            title: "Pendientes por calificar",
            value: statsData.pendientesPorCalificar,
            icon: <FormOutlined style={{ color: "#f97316" }} />,
            description: statsData.pendientesPorCalificar > 0 ? "Revisa tus evaluaciones" : "Todo al día",
          }, {
            key: "cursos",
            title: "Cursos activos",
            value: statsData.cursosActivos,
            icon: <RiseOutlined style={{ color: "#2563eb" }} />,
            description: `${cursos.length} totales asignados`,
          }].map((item) => (
            <Col key={item.key} xs={24} md={8}>
              <Card
                bordered={false}
                style={{ borderRadius: 20, height: "100%", boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
              >
                <Space size="large" align="start">
                  {item.icon}
                  <div>
                    <Typography.Text type="secondary">{item.title}</Typography.Text>
                    <Typography.Title level={3} style={{ margin: "8px 0" }}>
                      {item.value}
                      {item.suffix ? <Typography.Text style={{ fontSize: 16, marginLeft: 4 }}>{item.suffix}</Typography.Text> : null}
                    </Typography.Title>
                    <Typography.Text style={{ color: "#667085" }}>{item.description}</Typography.Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <Card
              bordered={false}
              title={<span style={{ fontWeight: 600 }}>Tendencia de asistencia</span>}
              extra={<Tag color="green">Últimas 8 sesiones</Tag>}
              style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              {statsData.asistenciaChart.length > 0 ? <Line {...asistenciaConfig} /> : <Typography.Text>No hay datos recientes.</Typography.Text>}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card
              bordered={false}
              title={<span style={{ fontWeight: 600 }}>Desempeño académico</span>}
              extra={<Tag color="blue">Evaluaciones</Tag>}
              style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              {statsData.calificacionesChart.length > 0 ? <Column {...calificacionesConfig} /> : <Typography.Text>No hay evaluaciones recientes.</Typography.Text>}
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={8}>
            <Card
              bordered={false}
              title={<Space><RiseOutlined />Top cursos</Space>}
              style={{ borderRadius: 20, marginBottom: 24, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              <List
                dataSource={topCursos}
                locale={{ emptyText: "Sin cursos destacados aún" }}
                renderItem={(curso) => (
                  <List.Item>
                    <List.Item.Meta
                      title={curso.nombre}
                      description={`${curso.estudiantes} estudiantes`}
                    />
                    {typeof curso.asistencia === "number" ? (
                      <Tag color={curso.asistencia >= 85 ? "green" : curso.asistencia >= 70 ? "gold" : "volcano"}>
                        {curso.asistencia}%
                      </Tag>
                    ) : null}
                  </List.Item>
                )}
              />
            </Card>

            <Card
              bordered={false}
              title={<Space><FormOutlined />Pendientes por calificar</Space>}
              style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              <List
                dataSource={pendientesData.slice(0, 5)}
                locale={{ emptyText: "No tienes pendientes" }}
                renderItem={(pendiente) => (
                  <List.Item
                    actions={
                      onOpenCourse && pendiente.cursoId
                        ? [
                            <Button
                              key={`pendiente-${pendiente.id}`}
                              type="link"
                              size="small"
                              icon={<ArrowRightOutlined />}
                              onClick={() => onOpenCourse(pendiente.cursoId as string)}
                            >
                              Ir al curso
                            </Button>,
                          ]
                        : undefined
                    }
                  >
                    <List.Item.Meta
                      title={pendiente.concepto}
                      description={
                        <Space split={<Divider type="vertical" />}> 
                          <span>{pendiente.curso}</span>
                          {pendiente.fecha ? <span>{dayjs(pendiente.fecha).format("DD MMM")}</span> : null}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              bordered={false}
              title={<Space><CalendarOutlined />Próximas sesiones</Space>}
              style={{ borderRadius: 20, marginBottom: 24, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              <List
                dataSource={proximasSesionesData}
                locale={{ emptyText: "No hay sesiones programadas" }}
                renderItem={(sesion) => (
                  <List.Item
                    actions={
                      onOpenCourse
                        ? [
                            <Button
                              key={`sesion-${sesion.id}`}
                              type="link"
                              size="small"
                              icon={<ArrowRightOutlined />}
                              onClick={() => onOpenCourse(sesion.cursoId)}
                            >
                              Ir al curso
                            </Button>,
                          ]
                        : undefined
                    }
                  >
                    <List.Item.Meta
                      title={sesion.curso}
                      description={
                        <Space split={<Divider type="vertical" />}> 
                          <span>{dayjs(sesion.fecha).format("dddd D MMMM, HH:mm")}</span>
                          {sesion.tema ? <span>{sesion.tema}</span> : null}
                          {sesion.horas ? <span>{sesion.horas} hrs</span> : null}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>

            <Card
              bordered={false}
              title={<Space><BookOutlined />Mis cursos</Space>}
              style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
            >
              <List
                dataSource={cursosOrdenados}
                locale={{ emptyText: "No tienes cursos asignados" }}
                renderItem={(curso) => (
                  <List.Item
                    actions={
                      onOpenCourse
                        ? [
                            <Button
                              key={`curso-${curso.id}`}
                              type="link"
                              size="small"
                              icon={<ArrowRightOutlined />}
                              onClick={() => onOpenCourse(curso.id)}
                            >
                              Entrar al curso
                            </Button>,
                          ]
                        : undefined
                    }
                  >
                    <List.Item.Meta
                      title={
                        <Space split={<Divider type="vertical" />}> 
                          <span>{curso.nombre}</span>
                          <Tag color={curso.estado === "activo" ? "green" : curso.estado === "pausado" ? "gold" : "blue"}>
                            {curso.estado}
                          </Tag>
                        </Space>
                      }
                      description={<span>{curso.estudiantesActivos} estudiantes activos</span>}
                    />
                    <div style={{ minWidth: 180 }}>
                      {typeof curso.asistenciaPromedio === "number" ? (
                        <div style={{ marginBottom: 8 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Asistencia</Typography.Text>
                          <Progress
                            percent={curso.asistenciaPromedio}
                            size="small"
                            strokeColor={curso.asistenciaPromedio >= 85 ? "#22c55e" : curso.asistenciaPromedio >= 70 ? "#facc15" : "#f97316"}
                            showInfo={false}
                          />
                        </div>
                      ) : null}
                      {typeof curso.promedioNota === "number" ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Promedio {curso.promedioNota}/100
                        </Typography.Text>
                      ) : null}
                      {curso.proximaSesion ? (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="blue">Próx: {dayjs(curso.proximaSesion.fecha).format("D MMM")}</Tag>
                        </div>
                      ) : null}
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};
