import React from "react";
import { Card, Statistic, Row, Col, Tag, Space, Typography } from "antd";

const { Text } = Typography;

export default function EstudianteDashboard() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Mi Portal Estudiantil</h2>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Progreso" value={72} suffix="%" /></Card></Col>
        <Col span={8}><Card><Statistic title="Pagos Pendientes" value={2} /></Card></Col>
        <Col span={8}><Card><Statistic title="Tareas Entregadas" value={14} /></Card></Col>
      </Row>
      <Card title="Modalidades de Pago" style={{ marginTop: 16 }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div><Tag color="orange">POR_CLASE</Tag> <Text>$40.000 por clase asistida</Text></div>
          <div><Tag color="blue">MENSUAL_70</Tag> <Text>$260.000 mensuales, incluye 70% de productos</Text></div>
          <div><Tag color="green">MENSUAL_100</Tag> <Text>$300.000 mensuales, incluye 100% de productos</Text></div>
        </Space>
      </Card>
      {/* Agrega más widgets relevantes para el estudiante aquí */}
    </div>
  );
}
