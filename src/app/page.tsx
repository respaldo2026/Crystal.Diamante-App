"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Typography, Row, Col, Card, Statistic } from "antd";
import { DollarCircleOutlined, UserOutlined, BookOutlined, ShopOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function DashboardPage() {
  // 1. Traemos las matrículas para sumar dinero
  const { data: matriculasData } = useList({
    resource: "matriculas",
    pagination: { mode: "off" }, // Traemos todo sin paginar
  });

  // 2. Traemos estudiantes y cursos para contar
  const { data: perfilesData } = useList({ resource: "perfiles" });
  const { data: cursosData } = useList({ resource: "cursos" });

  // Cálculos rápidos
  const matriculas = matriculasData?.data || [];
  const totalIngresos = matriculas.reduce((sum, item: any) => sum + (Number(item.monto_pagado) || 0), 0);
  const totalEstudiantes = perfilesData?.data?.length || 0;
  const totalCursos = cursosData?.data?.length || 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 30 }}>
        <div style={{ fontSize: '32px' }}>💎</div>
        <Title level={2} style={{ margin: 0, color: '#722ed1' }}>Panel de Control Crystal</Title>
      </div>
      
      <Row gutter={[16, 16]}>
        
        {/* TARJETA 1: INGRESOS TOTALES */}
        <Col xs={24} sm={8}>
          {/* CORRECCIÓN AQUÍ: variant="borderless" */}
          <Card variant="borderless" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)", borderRadius: 12 }}>
            <Statistic 
              title="Ingresos Totales" 
              value={totalIngresos} 
              prefix="$" 
              valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} 
              suffix={<DollarCircleOutlined />}
            />
          </Card>
        </Col>

        {/* TARJETA 2: ESTUDIANTES REGISTRADOS */}
        <Col xs={24} sm={8}>
          <Card variant="borderless" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)", borderRadius: 12 }}>
            <Statistic 
              title="Usuarios Registrados" 
              value={totalEstudiantes} 
              valueStyle={{ color: '#1677ff', fontWeight: 'bold' }} 
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>

        {/* TARJETA 3: CURSOS DISPONIBLES */}
        <Col xs={24} sm={8}>
          <Card variant="borderless" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)", borderRadius: 12 }}>
            <Statistic 
              title="Cursos Activos" 
              value={totalCursos} 
              valueStyle={{ color: '#722ed1', fontWeight: 'bold' }} 
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>

      </Row>

      <div style={{ marginTop: 40, textAlign: 'center', color: '#888' }}>
        <ShopOutlined style={{ fontSize: 40, marginBottom: 10, color: '#d9d9d9' }} />
        <p>Bienvenido al sistema de gestión de tu Academia.</p>
      </div>
    </div>
  );
}