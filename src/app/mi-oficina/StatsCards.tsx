import React from "react";
import { Row, Col, Card, Statistic } from "antd";
import { BookOutlined, TeamOutlined, ClockCircleOutlined, DollarCircleOutlined } from "@ant-design/icons";

interface StatsCardsProps {
  cursosCount: number;
  totalEstudiantes: number;
  horasPendientes: number;
  pagosPendientes: number;
}

export const StatsCards: React.FC<StatsCardsProps> = React.memo(({
  cursosCount,
  totalEstudiantes,
  horasPendientes,
  pagosPendientes,
}) => (
  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
    <Col xs={24} sm={12} lg={6}>
      <Card hoverable style={{ textAlign: 'center', borderTop: '4px solid #5B21B6' }}>
        <Statistic 
          title="Cursos Activos" 
          value={cursosCount}
          valueStyle={{ color: '#5B21B6', fontSize: 28 }}
          prefix={<BookOutlined style={{ marginRight: 8 }}/>}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card hoverable style={{ textAlign: 'center', borderTop: '4px solid #059669' }}>
        <Statistic 
          title="Total Estudiantes" 
          value={totalEstudiantes}
          valueStyle={{ color: '#059669', fontSize: 28 }}
          prefix={<TeamOutlined style={{ marginRight: 8 }}/>}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card hoverable style={{ textAlign: 'center', borderTop: '4px solid #D97706' }}>
        <Statistic 
          title="Horas Pendientes" 
          value={horasPendientes}
          valueStyle={{ color: '#D97706', fontSize: 28 }}
          prefix={<ClockCircleOutlined style={{ marginRight: 8 }}/>}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card hoverable style={{ textAlign: 'center', borderTop: '4px solid #DC2626' }}>
        <Statistic 
          title="Pagos Pendientes" 
          value={pagosPendientes}
          valueStyle={{ color: '#DC2626', fontSize: 28 }}
          prefix={<DollarCircleOutlined style={{ marginRight: 8 }}/>}
        />
      </Card>
    </Col>
  </Row>
));