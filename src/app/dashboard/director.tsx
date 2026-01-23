import React from "react";
import { Card, Statistic, Row, Col } from "antd";

export default function DirectorDashboard() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Panel del Director</h2>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Progreso Académico" value={85} suffix="%" /></Card></Col>
        <Col span={8}><Card><Statistic title="Egresos" value={12000000} prefix="$" /></Card></Col>
        <Col span={8}><Card><Statistic title="Alertas" value={3} /></Card></Col>
      </Row>
      {/* Agrega más widgets relevantes para el director aquí */}
    </div>
  );
}
