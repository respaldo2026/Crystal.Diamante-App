import React from "react";
import { Card, Statistic, Row, Col, Spin, Tabs, List, Typography, Button, Space } from "antd";
import { Line, Column } from "@ant-design/plots";
import { UserAddOutlined, FileTextOutlined, CheckCircleOutlined } from "@ant-design/icons";


interface CursoResumen {
  nombre: string;
  estado: string;
  [key: string]: unknown;
}

interface ProfessorDashboardUIProps {
  dashboard: {
    loading: boolean;
    stats: {
      cursosActivos: number;
      totalEstudiantes: number;
      horasMes: number;
      asistenciaChart?: any[];
      calificacionesChart?: any[];
    };
    cursos: CursoResumen[];
  };
}

export const ProfessorDashboardUI: React.FC<ProfessorDashboardUIProps> = ({ dashboard }) => {
  const { loading, stats, cursos } = dashboard;

  // Configuración de gráficas (simples, pueden ser reemplazadas por datos reales)
  const asistenciaConfig = {
    data: stats.asistenciaChart || [],
    xField: 'fecha',
    yField: 'asistencias',
    smooth: true,
    color: '#52c41a',
    height: 200,
  };
  const calificacionesConfig = {
    data: stats.calificacionesChart || [],
    xField: 'fecha',
    yField: 'promedio',
    color: '#1890ff',
    height: 200,
  };

  if (loading) {
    return <Spin size="large" style={{ margin: "48px auto", display: "block" }} />;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <Typography.Title level={2} style={{ textAlign: "center", marginBottom: 32 }}>
        Mi Oficina - Panel del Profesor
      </Typography.Title>
      <Row gutter={[24, 24]} justify="center" style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ textAlign: "center" }}>
            <Statistic title="Cursos Activos" value={stats.cursosActivos} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ textAlign: "center" }}>
            <Statistic title="Total Estudiantes" value={stats.totalEstudiantes} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ textAlign: "center" }}>
            <Statistic title="Horas este mes" value={stats.horasMes} valueStyle={{ color: "#722ed1" }} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="Asistencias Recientes" bordered={false}>
            <Line {...asistenciaConfig} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Promedio de Calificaciones" bordered={false}>
            <Column {...calificacionesConfig} />
          </Card>
        </Col>
      </Row>
      <Card style={{ marginBottom: 24 }}>
        <Space size="middle" wrap>
          <Button type="primary" icon={<CheckCircleOutlined />} size="large">Tomar Lista</Button>
          <Button icon={<FileTextOutlined />} size="large">Calificar</Button>
          <Button icon={<UserAddOutlined />} size="large">Agregar Estudiante</Button>
        </Space>
      </Card>
      <Tabs defaultActiveKey="1" style={{ marginTop: 32 }}>
        <Tabs.TabPane tab="Mis Cursos" key="1">
          <List
            itemLayout="horizontal"
            dataSource={cursos}
            locale={{ emptyText: "No tienes cursos asignados" }}
            renderItem={curso => (
              <List.Item>
                <List.Item.Meta
                  title={<b>{curso.nombre}</b>}
                  description={`Estado: ${curso.estado}`}
                />
              </List.Item>
            )}
          />
        </Tabs.TabPane>
        {/* Puedes agregar más pestañas aquí: Tomar Lista, Calificar, Pagos, etc. */}
      </Tabs>
    </div>
  );
};
