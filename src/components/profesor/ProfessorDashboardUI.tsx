import React, { useMemo, useState } from "react";
import { Column, Line } from "@ant-design/plots";
import {
  BookOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  FormOutlined,
  ReadOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  StarOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  List,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { ProfessorDashboardData } from "@hooks/useProfessorDashboard";

type CourseActionContext = "attendance" | "grades" | "materials" | "default";

type ProfessorDashboardUIProps = {
  dashboard: ProfessorDashboardData | null | undefined;
  onOpenCourse?: (cursoId: string, action?: CourseActionContext) => void;
};

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
  horasQuincena: 0,
  proyeccionQuincena: 0,
  tarifaHora: null,
  totalPagadoMes: 0,
};

const dedupeByKey = <T,>(items: T[] = [], keySelector: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = keySelector(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
};

export const ProfessorDashboardUI: React.FC<ProfessorDashboardUIProps> = ({ dashboard, onOpenCourse }) => {
  const resolvedDashboard: ProfessorDashboardData = dashboard ?? {
    loading: true,
    profesorNombre: undefined,
    stats: fallbackStats,
    cursos: [],
    proximasSesiones: [],
    pendientes: [],
    pagos: [],
  };

  const { loading, stats, cursos, proximasSesiones, pendientes, pagos, profesorNombre } = resolvedDashboard;
  const statsData = stats ?? fallbackStats;
  const proximasSesionesData = dedupeByKey(proximasSesiones || [], (sesion: any) => `${sesion.cursoId ?? ""}-${sesion.fecha ?? ""}-${sesion.tema ?? ""}`);
  const pendientesData = dedupeByKey(pendientes || [], (pendiente: any) => `${pendiente.cursoId ?? ""}-${pendiente.concepto ?? ""}-${pendiente.fecha ?? ""}`);
  const pagosData = dedupeByKey(pagos || [], (pago: any) => `${pago.id ?? ""}-${pago.fecha ?? ""}-${pago.monto ?? ""}-${pago.tipo ?? ""}`);
  const [financialOpen, setFinancialOpen] = useState(false);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }),
    [],
  );
  const proyeccionLabel = currencyFormatter.format(statsData.proyeccionQuincena || 0);
  const pagadoMesLabel = currencyFormatter.format(statsData.totalPagadoMes || 0);
  const tarifaHoraLabel =
    typeof statsData.tarifaHora === "number" && Number.isFinite(statsData.tarifaHora)
      ? currencyFormatter.format(statsData.tarifaHora)
      : "Sin definir";

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
    () => dedupeByKey(statsData.topCursos || [], (curso: any) => `${curso.id ?? curso.nombre ?? ""}`),
    [statsData.topCursos],
  );
  const cursosOrdenados = useMemo(
    () => dedupeByKey(cursos || [], (curso: any) => `${curso.id ?? curso.nombre ?? ""}`)
      .sort((a, b) => (b.estudiantesActivos || 0) - (a.estudiantesActivos || 0)),
    [cursos],
  );

  const courseCards = useMemo(() => {
    return cursosOrdenados.map((curso) => {
      const proxFecha = curso.proximaSesion?.fecha ? dayjs(curso.proximaSesion.fecha) : null;
      const proxLabel = proxFecha ? proxFecha.format("ddd D MMM, HH:mm") : "Sin próxima sesión";
      const isSoon = proxFecha ? proxFecha.isBefore(dayjs().add(24, "hour")) : false;
      const asistenciaColor = typeof curso.asistenciaPromedio === "number"
        ? curso.asistenciaPromedio >= 85
          ? "#22c55e"
          : curso.asistenciaPromedio >= 70
            ? "#facc15"
            : "#f97316"
        : undefined;

      return {
        ...curso,
        proxFecha,
        proxLabel,
        isSoon,
        asistenciaColor,
        temaActual: curso.temaActual,
        siguienteTema: curso.siguienteTema,
      };
    });
  }, [cursosOrdenados]);

  const hasAsistenciaData = (statsData.asistenciaChart || []).length > 0;
  const hasCalificacionesData = (statsData.calificacionesChart || []).length > 0;
  const hasTopCursos = (topCursos || []).length > 0;

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
        padding: "16px 10px 32px",
        background: "linear-gradient(135deg, #f4f7ff 0%, #ffffff 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Card
          variant="borderless"
          style={{
            borderRadius: 24,
            background: "linear-gradient(135deg, #1e3a8a 0%, #111827 100%)",
            marginBottom: 12,
            color: "#fff",
            boxShadow: "0 16px 36px -26px rgba(30,64,175,0.6)",
          }}
          styles={{ body: { padding: "18px 20px" } }}
        >
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={14}>
              <Typography.Text style={{ color: "rgba(255,255,255,0.65)" }}>
                {dayjs().format("dddd, D MMMM")}
              </Typography.Text>
              <Typography.Title level={2} style={{ color: "#fff", marginTop: 4 }}>
                {profesorNombre ? `Hola, ${profesorNombre}` : "Mi Oficina"}
              </Typography.Title>
              <Typography.Paragraph style={{ color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                Visualiza el pulso de tus cursos, haz seguimiento a tus estudiantes y mantén tus clases listas.
              </Typography.Paragraph>
              <Space size="small" wrap>
                <Button type="primary" icon={<DollarCircleOutlined />} size="middle" onClick={() => setFinancialOpen(true)}>
                  Resumen financiero
                </Button>
              </Space>
            </Col>
            <Col xs={24} md={10}>
              <Card
                variant="borderless"
                style={{ borderRadius: 20, background: "rgba(17, 24, 39, 0.55)", color: "#fff" }}
                styles={{ body: { padding: 14 } }}
              >
                <Row gutter={[10, 10]}>
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
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Horas del mes</span>}
                      value={statsData.horasMes}
                      suffix="hrs"
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      prefix={<CalendarOutlined style={{ color: "#38bdf8" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Horas quincena</span>}
                      value={statsData.horasQuincena}
                      suffix="hrs"
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      prefix={<DollarCircleOutlined style={{ color: "#34d399" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Proyección quincena</span>}
                      value={proyeccionLabel}
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

        <Row gutter={[12, 12]} style={{ marginBottom: 4 }}>
          {[{
            key: "asistencia",
            title: "Asistencia promedio",
            value: statsData.porcentajeAsistencia,
            suffix: "%",
            icon: <CalendarOutlined style={{ color: "#16a34a" }} />,
            description: "Últimos 30 días",
          }, {
            key: "horas",
            title: "Horas registradas",
            value: statsData.horasMes,
            suffix: "hrs",
            icon: <ClockCircleOutlined style={{ color: "#2563eb" }} />,
            description: "Mes en curso",
          }, {
            key: "pagos",
            title: "Pagado este mes",
            value: pagadoMesLabel,
            icon: <DollarCircleOutlined style={{ color: "#059669" }} />,
            description: "Incluye nómina y extras",
          }].map((item, index, arr) => (
            <Col key={item.key} xs={24} md={12} xl={arr.length === 3 ? 8 : 6}>
              <Card
                variant="borderless"
                style={{ borderRadius: 16, height: "100%", boxShadow: "0 12px 24px -22px rgba(15,23,42,0.26)" }}
                styles={{ body: { padding: 12 } }}
              >
                <Space size="small" align="start">
                  {item.icon}
                  <div>
                    <Typography.Text type="secondary">{item.title}</Typography.Text>
                    <Typography.Title level={4} style={{ margin: "6px 0" }}>
                      {item.value}
                      {item.suffix && typeof item.value === "number" ? (
                        <Typography.Text style={{ fontSize: 16, marginLeft: 4 }}>{item.suffix}</Typography.Text>
                      ) : null}
                    </Typography.Title>
                    <Typography.Text style={{ color: "#667085" }}>{item.description}</Typography.Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[12, 12]} style={{ marginTop: 4 }}>
          <Col xs={24} lg={16}>
            <Card
              variant="borderless"
              title={<Space><BookOutlined />Mis cursos</Space>}
              style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
            >
              <Row gutter={[10, 10]}>
                {courseCards.map((curso) => {
                  const colSpan = courseCards.length === 1 ? 24 : courseCards.length === 2 ? 12 : 12;
                  return (
                    <Col key={curso.id} xs={24} sm={12} lg={colSpan}>
                      <Card
                        hoverable
                        onClick={() => onOpenCourse && onOpenCourse(curso.id, "default")}
                        style={{
                          borderRadius: 14,
                          height: "100%",
                          border: curso.isSoon ? "1px solid #A855F7" : "1px solid rgba(148,163,184,0.18)",
                          boxShadow: curso.isSoon
                            ? "0 14px 38px -26px rgba(168,85,247,0.5)"
                            : "0 10px 26px -22px rgba(15,23,42,0.22)",
                          background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))",
                        }}
                        styles={{
                          body: {
                            color: "#E5E7EB",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            minHeight: 150,
                            padding: 10,
                          },
                        }}
                      >
                        <Space align="center" split={<Divider type="vertical" style={{ borderColor: "rgba(255,255,255,0.12)" }} />} wrap>
                          <Typography.Title level={4} style={{ margin: 0, color: "#F8FAFC", fontSize: 18 }}>
                            {curso.nombre}
                          </Typography.Title>
                          <Tag color={curso.estado === "activo" ? "green" : curso.estado === "pausado" ? "gold" : "blue"}>
                            {curso.estado}
                          </Tag>
                        </Space>

                        <Typography.Text style={{ color: "#CBD5E1" }}>
                          {curso.estudiantesActivos || 0} estudiantes activos
                        </Typography.Text>

                        {typeof curso.asistenciaPromedio === "number" ? (
                          <div>
                            <Typography.Text type="secondary" style={{ color: "#94A3B8", fontSize: 12 }}>Asistencia</Typography.Text>
                            <Progress
                              percent={curso.asistenciaPromedio}
                              size="small"
                              strokeColor={curso.asistenciaColor}
                              showInfo={false}
                              trailColor="rgba(148,163,184,0.25)"
                            />
                          </div>
                        ) : null}

                        <Space size={8} align="center">
                          <Badge color={curso.isSoon ? "#A855F7" : "#38bdf8"} text={curso.proxLabel} />
                        </Space>

                        {curso.temaActual ? (
                          <Typography.Text type="secondary" style={{ color: "#cbd5e1", fontSize: 12 }}>
                            Tema actual: {curso.temaActual}
                          </Typography.Text>
                        ) : null}

                        <Typography.Text style={{ color: "#e2e8f0", fontSize: 12, display: "block" }}>
                          Horario próximo: {curso.proxLabel}
                        </Typography.Text>
                        <Typography.Text style={{ color: "#e2e8f0", fontSize: 12 }}>
                          Próxima clase: {curso.proxLabel}
                          {curso.siguienteTema ? ` • Tema: ${curso.siguienteTema}` : ""}
                        </Typography.Text>

                        <Button
                          type="primary"
                          block
                          size="middle"
                          style={{ marginTop: 4 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCourse && onOpenCourse(curso.id, "default");
                          }}
                        >
                          Entrar al curso
                        </Button>
                      </Card>
                    </Col>
                  );
                })}

                {courseCards.length === 0 && (
                  <Col span={24}>
                    <Card variant="borderless" style={{ textAlign: "center" }}>
                      <Typography.Text type="secondary">No tienes cursos asignados</Typography.Text>
                    </Card>
                  </Col>
                )}
              </Row>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Card
                variant="borderless"
                title={<Space><CalendarOutlined />Próximas sesiones</Space>}
                style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
              >
                <List
                  dataSource={proximasSesionesData}
                  locale={{ emptyText: "No hay sesiones programadas" }}
                  renderItem={(sesion) => (
                    <List.Item
                      style={{ cursor: "pointer" }}
                      onClick={() => onOpenCourse && onOpenCourse(sesion.cursoId, "attendance")}
                    >
                      <List.Item.Meta
                        title={sesion.curso}
                        description={
                          <Space split={<Divider type="vertical" />}> 
                            <span>{dayjs(sesion.fecha).format("ddd D MMM, HH:mm")}</span>
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
                variant="borderless"
                title={<Space><FormOutlined />Pendientes por calificar</Space>}
                style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
              >
                <List
                  dataSource={pendientesData.slice(0, 5)}
                  locale={{ emptyText: "No tienes pendientes" }}
                  renderItem={(pendiente) => (
                    <List.Item
                      style={{ cursor: pendiente.cursoId ? "pointer" : "default", opacity: pendiente.cursoId ? 1 : 0.6 }}
                      onClick={() => pendiente.cursoId && onOpenCourse && onOpenCourse(pendiente.cursoId as string, "grades")}
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
            </Space>
          </Col>
        </Row>

        {(hasAsistenciaData || hasCalificacionesData || hasTopCursos) && (
          <Row gutter={[12, 12]} style={{ marginTop: 10 }}>
            {hasAsistenciaData && (
              <Col xs={24} lg={hasCalificacionesData ? 12 : 24}>
                <Card
                  variant="borderless"
                  title={<span style={{ fontWeight: 600 }}>Tendencia de asistencia</span>}
                  extra={<Tag color="green">Últimas 8 sesiones</Tag>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                >
                  <Line {...asistenciaConfig} />
                </Card>
              </Col>
            )}

            {hasCalificacionesData && (
              <Col xs={24} lg={hasAsistenciaData ? 12 : 24}>
                <Card
                  variant="borderless"
                  title={<span style={{ fontWeight: 600 }}>Desempeño académico</span>}
                  extra={<Tag color="blue">Evaluaciones</Tag>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                >
                  <Column {...calificacionesConfig} />
                </Card>
              </Col>
            )}

            {hasTopCursos && (
              <Col xs={24} lg={8}>
                <Card
                  variant="borderless"
                  title={<Space><ReadOutlined />Top cursos</Space>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
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
              </Col>
            )}
          </Row>
        )}

        <Drawer
          title="Resumen financiero"
          placement="right"
          width={420}
          onClose={() => setFinancialOpen(false)}
          open={financialOpen}
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Row gutter={[12, 12]}>
              {[{
                key: "tarifa",
                title: "Tarifa por hora",
                value: tarifaHoraLabel,
              }, {
                key: "horasMes",
                title: "Horas del mes",
                value: `${statsData.horasMes} hrs`,
              }, {
                key: "horasQuincena",
                title: "Horas quincena",
                value: `${statsData.horasQuincena} hrs`,
              }, {
                key: "proyeccion",
                title: "Proyección quincena",
                value: proyeccionLabel,
              }, {
                key: "pagadoMes",
                title: "Pagado este mes",
                value: pagadoMesLabel,
              }].map((item, index) => (
                <Col key={item.key} span={index === 4 ? 24 : 12}>
                  <Card variant="borderless" style={{ borderRadius: 16, background: "#f8fafc" }}>
                    <Typography.Text type="secondary">{item.title}</Typography.Text>
                    <Typography.Title level={4} style={{ marginTop: 8 }}>
                      {item.value}
                    </Typography.Title>
                  </Card>
                </Col>
              ))}
            </Row>

            <div>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>Pagos recientes</Typography.Title>
              <List
                dataSource={pagosData.slice(0, 6)}
                locale={{ emptyText: "Sin pagos registrados" }}
                renderItem={(pago) => {
                  const fechaLabel = pago.fecha ? dayjs(pago.fecha).format("DD MMM YYYY") : "Sin fecha";
                  const periodoLabel =
                    pago.origen === "nomina" && pago.periodo?.inicio && pago.periodo?.fin
                      ? `${dayjs(pago.periodo.inicio).format("DD MMM")} - ${dayjs(pago.periodo.fin).format("DD MMM")}`
                      : null;
                  return (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space split={<Divider type="vertical" />}>
                            <span>{currencyFormatter.format(pago.monto || 0)}</span>
                            <span>{pago.tipo}</span>
                            <Tag color={pago.origen === "nomina" ? "blue" : "gold"}>
                              {pago.origen === "nomina" ? "Nómina" : "Extra"}
                            </Tag>
                          </Space>
                        }
                        description={
                          <div>
                            <Space split={<Divider type="vertical" />} style={{ color: "#475467" }}>
                              <span>{fechaLabel}</span>
                              <span>{pago.concepto}</span>
                            </Space>
                            {periodoLabel ? (
                              <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                                Periodo: {periodoLabel}
                              </Typography.Text>
                            ) : null}
                          </div>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </div>
          </Space>
        </Drawer>
      </div>
    </div>
  );
};
