import React from "react";
import { Card, Statistic, Row, Col } from "antd";

export default function AdminDashboard() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Panel Administrativo</h2>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="Estudiantes" value={120} /></Card></Col>
        <Col span={8}><Card><Statistic title="Docentes" value={15} /></Card></Col>
        <Col span={8}><Card><Statistic title="Ingresos Mensuales" value={45000000} prefix="$" /></Card></Col>
      </Row>
      {/* Agrega más widgets relevantes para el admin aquí */}
    </div>
  );
}
