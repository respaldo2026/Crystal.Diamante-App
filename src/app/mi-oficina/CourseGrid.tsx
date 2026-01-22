import React from "react";
import { Row, Col, Card, Button, Typography, Tag, Space } from "antd";
import { BookOutlined, TeamOutlined, ClockCircleOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

interface CourseGridProps {
  cursos: any[];
  horasPendientesMap: Record<string, number>;
  onGestionar: (curso: any) => void;
}

export const CourseGrid: React.FC<CourseGridProps> = React.memo(({ cursos, horasPendientesMap, onGestionar }) => {
  if (cursos.length === 0) {
    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <BookOutlined style={{ fontSize: 48, color: '#999', marginBottom: 16 }} />
        <p style={{ color: '#999', fontSize: 16 }}>No tienes cursos activos asignados.</p>
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {cursos.map((curso) => (
        <Col xs={24} md={12} lg={8} key={curso.id}>
          <Card 
            hoverable
            style={{ borderTop: '5px solid #5B21B6', height: '100%' }}
            actions={[
              <Button 
                key="gestionar-clase" 
                type="primary" 
                block 
                onClick={() => onGestionar(curso)}
              >
                Gestionar Clase
              </Button>
            ]}
          >
            <Row gutter={16}>
              <Col span={24}>
                <Title level={5} style={{ marginBottom: 8, color: '#5B21B6' }}>
                  {curso.nombre}
                </Title>
              </Col>
              <Col xs={12}>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>ESTUDIANTES</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: '#059669' }}>
                    {curso.total_estudiantes || 0}
                  </div>
                </div>
              </Col>
              <Col xs={12}>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>HORAS PENDIENTES</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: '#D97706' }}>
                    {horasPendientesMap[String(curso.id)] || 0}
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <Space size="small">
                  {curso.estado === 'activo' && <Tag color="green">Activo</Tag>}
                  <Tag color="blue">{curso.estado}</Tag>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
      ))}
    </Row>
  );
});