"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { obtenerDashboardProfesor } from "@modules/academico/profesores.service";
import { ProfessorDashboardUI } from "../../../../components/profesor/ProfessorDashboardUI";
import {
  ArrowLeftOutlined,
  MailOutlined,
  PhoneOutlined,
  IdcardOutlined,
  DashboardOutlined,
  BookOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  List,
  Row,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
  Spin,
} from "antd";
import dayjs from "dayjs";

const { Title, Text } = Typography;

export default function ShowProfesorDashboard() {
  const params = useParams();
  const router = useRouter();
  const idProfesor = params?.id as string;
  const [activeKey, setActiveKey] = React.useState("perfil");
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!idProfesor) return;
    setLoading(true);
    obtenerDashboardProfesor(idProfesor)
      .then((response) => setData(response))
      .catch((error) => {
        console.error("Error cargando dashboard del profesor", error);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [idProfesor]);

  const handleOpenCourse = (cursoId: string, action?: "attendance" | "grades" | "materials" | "default") => {
    if (!cursoId) return;
    const section = action && action !== "default" ? `?section=${encodeURIComponent(action)}` : "";
    router.push(`/cursos/show/${cursoId}${section}`);
  };

  const dashboard = data
    ? {
        loading: Boolean(data.loading),
        profesorNombre: data.profesorNombre,
        stats: data.stats,
        cursos: data.cursos,
        proximasSesiones: data.proximasSesiones,
        pendientes: data.pendientes,
        pagos: data.pagos,
      }
    : null;

  const perfil = data?.perfil;
  const stats = dashboard?.stats;

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/profesores")}>Volver a profesores</Button>
          <Card>
            <Title level={4}>No se pudo cargar la información del profesor</Title>
            <Text type="secondary">Intenta nuevamente o verifica que el profesor exista.</Text>
          </Card>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Space size="large" style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/profesores")}>Regresar</Button>
        <Title level={3} style={{ margin: 0 }}>Ficha del profesor</Title>
      </Space>

      <Tabs activeKey={activeKey} onChange={setActiveKey} items={[
        {
          key: "perfil",
          label: "Resumen",
          children: (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Card variant="borderless" style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}>
                <Row gutter={[24, 24]} align="middle">
                  <Col xs={24} md={6}>
                    <Avatar size={96} style={{ backgroundColor: "#1e3a8a", fontSize: 36 }}>
                      {(perfil?.nombre_completo || "P").charAt(0).toUpperCase()}
                    </Avatar>
                  </Col>
                  <Col xs={24} md={18}>
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Title level={3} style={{ margin: 0 }}>
                        {perfil?.nombre_completo || "Profesor"}
                      </Title>
                      <Space split={<Divider type="vertical" />} wrap>
                        <Tag color={perfil?.activo === false ? "volcano" : "green"}>
                          {perfil?.activo === false ? "Inactivo" : "Activo"}
                        </Tag>
                        {perfil?.created_at ? (
                          <span><CalendarOutlined /> Ingreso {dayjs(perfil.created_at).format("DD MMM YYYY")}</span>
                        ) : null}
                      </Space>
                      <Space direction="vertical" size={4}>
                        {perfil?.email ? <Text><MailOutlined /> {perfil.email}</Text> : null}
                        {perfil?.telefono ? <Text><PhoneOutlined /> {perfil.telefono}</Text> : null}
                        {perfil?.identificacion ? <Text><IdcardOutlined /> {perfil.identificacion}</Text> : null}
                      </Space>
                    </Space>
                  </Col>
                </Row>
                <Divider style={{ margin: "24px 0" }} />
                <Space size="middle" wrap>
                  <Button type="primary" icon={<DashboardOutlined />} onClick={() => setActiveKey("panel")}>
                    Abrir panel del profesor
                  </Button>
                  <Button icon={<BookOutlined />} onClick={() => router.push("/cursos")}> 
                    Ver cursos asignados
                  </Button>
                </Space>
              </Card>

              <Row gutter={[24, 24]}>
                <Col xs={24} md={8}>
                  <Card variant="borderless" style={{ borderRadius: 16, height: "100%" }}>
                    <Statistic title="Cursos activos" value={stats?.cursosActivos ?? 0} suffix="cursos" />
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card variant="borderless" style={{ borderRadius: 16, height: "100%" }}>
                    <Statistic title="Estudiantes en seguimiento" value={stats?.totalEstudiantes ?? 0} suffix="est." />
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card variant="borderless" style={{ borderRadius: 16, height: "100%" }}>
                    <Statistic title="Horas dictadas este mes" value={stats?.horasMes ?? 0} suffix="hrs" />
                  </Card>
                </Col>
              </Row>

              <Card
                variant="borderless"
                title={<Space><BookOutlined /> Cursos asignados</Space>}
                style={{ borderRadius: 20, boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)" }}
              >
                <List
                  dataSource={dashboard?.cursos || []}
                  locale={{ emptyText: "No hay cursos asignados" }}
                  renderItem={(curso) => (
                    <List.Item
                      actions={[
                        <Button
                          key={`curso-ficha-${curso.id}`}
                          type="link"
                          onClick={() => handleOpenCourse(curso.id)}
                        >
                          Gestionar curso
                        </Button>,
                      ]}
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
                        description={`${curso.estudiantesActivos || 0} estudiantes activos`}
                      />
                    </List.Item>
                  )}
                />
              </Card>

              <Row gutter={[24, 24]}>
                <Col xs={24} md={12}>
                  <Card
                    bordered={false}
                    title={<Space><CalendarOutlined /> Próximas sesiones</Space>}
                    style={{ borderRadius: 16, height: "100%" }}
                  >
                    <List
                      dataSource={dashboard?.proximasSesiones?.slice(0, 4) || []}
                      locale={{ emptyText: "Sin sesiones programadas" }}
                      renderItem={(sesion) => (
                        <List.Item
                          actions={[
                            <Button
                              key={`sesion-ficha-${sesion.id}`}
                              type="link"
                              onClick={() => handleOpenCourse(sesion.cursoId)}
                            >
                              Ir al curso
                            </Button>,
                          ]}
                        >
                          <List.Item.Meta
                            title={sesion.curso}
                            description={dayjs(sesion.fecha).format("dddd D MMMM, HH:mm")}
                          />
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card
                    bordered={false}
                    title={<Space><DashboardOutlined /> Pendientes por calificar</Space>}
                    style={{ borderRadius: 16, height: "100%" }}
                  >
                    <List
                      dataSource={dashboard?.pendientes?.slice(0, 4) || []}
                      locale={{ emptyText: "Sin pendientes" }}
                      renderItem={(pendiente) => (
                        <List.Item
                          actions={[
                            <Button
                              key={`pendiente-ficha-${pendiente.id}`}
                              type="link"
                              onClick={() => handleOpenCourse(pendiente.cursoId || "")}
                              disabled={!pendiente.cursoId}
                            >
                              Revisar curso
                            </Button>,
                          ]}
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
              </Row>
            </Space>
          ),
        },
        {
          key: "panel",
          label: "Panel del profesor",
          children: (
            <ProfessorDashboardUI dashboard={dashboard} onOpenCourse={handleOpenCourse} />
          ),
        },
      ]} />
    </div>
  );
}