import React from "react";
import { Card, Statistic, Row, Col, Space, Tag, Typography } from "antd";

const { Text } = Typography;

export default function ProfesorDashboard() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Panel Docente</h2>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Clases Hoy" value={4} /></Card></Col>
        <Col span={8}><Card><Statistic title="Estudiantes Asistentes" value={32} /></Card></Col>
        <Col span={8}><Card><Statistic title="Pendientes por Calificar" value={7} /></Card></Col>
      </Row>
      <Card title="Planes de Pago Estudiantil" style={{ marginTop: 16 }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div><Tag color="orange">POR_CLASE</Tag> <Text>$40.000 por clase asistida</Text></div>
          <div><Tag color="green">MENSUAL_100</Tag> <Text>$300.000 mensuales con 100% de productos</Text></div>
        </Space>
      </Card>
      {/* Agrega más widgets relevantes para el docente aquí */}
    </div>
  );
}
