"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Card, Col, Row, Statistic, Typography } from "antd";
import { 
  DollarCircleOutlined, 
  UserOutlined, 
  ReadOutlined 
} from "@ant-design/icons";

const { Title } = Typography;

export default function DashboardPage() {
  // 1. Traemos TODAS las matrículas para sumar el dinero
  const { data: matriculasData, isLoading: loadingMatriculas } = useList({
    resource: "matriculas",
    pagination: { mode: "off" }, // "off" trae todo sin paginar para poder sumar
  });

  // 2. Traemos TODOS los perfiles para contarlos
  const { data: perfilesData, isLoading: loadingPerfiles } = useList({
    resource: "perfiles",
    pagination: { mode: "off" },
  });

  // --- CÁLCULOS MATEMÁTICOS ---
  
  // Calcular Total de Dinero ($)
  // Recorremos cada matrícula y sumamos el "monto_pagado"
  const totalIngresos = matriculasData?.data?.reduce((total, item: any) => {
    return total + (Number(item.monto_pagado) || 0);
  }, 0);

  // Contar Total de Estudiantes
  const totalEstudiantes = perfilesData?.data?.length || 0;

  // Contar Total de Matrículas
  const totalMatriculas = matriculasData?.data?.length || 0;


  return (
    <div style={{ padding: "20px" }}>
      <Title level={2}>📊 Tablero de Control</Title>
      <br />

      <Row gutter={[16, 16]}>
        
        {/* TARJETA 1: INGRESOS TOTALES */}
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            <Statistic
              title="Ingresos Totales"
              value={totalIngresos}
              precision={0}
              valueStyle={{ color: '#3f8600', fontWeight: 'bold' }}
              prefix={<DollarCircleOutlined />}
              suffix="$"
              loading={loadingMatriculas}
            />
          </Card>
        </Col>

        {/* TARJETA 2: ESTUDIANTES REGISTRADOS */}
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            <Statistic
              title="Estudiantes Registrados"
              value={totalEstudiantes}
              valueStyle={{ color: '#1677ff', fontWeight: 'bold' }}
              prefix={<UserOutlined />}
              loading={loadingPerfiles}
            />
          </Card>
        </Col>

        {/* TARJETA 3: MATRÍCULAS TOTALES */}
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            <Statistic
              title="Matrículas Realizadas"
              value={totalMatriculas}
              valueStyle={{ color: '#cf1322', fontWeight: 'bold' }}
              prefix={<ReadOutlined />}
              loading={loadingMatriculas}
            />
          </Card>
        </Col>

      </Row>

      <br /><br />
      
      {/* MENSAJE DE BIENVENIDA */}
      <Card>
        <Title level={4}>👋 ¡Bienvenido a Crystal App!</Title>
        <p>Desde aquí puedes gestionar tu academia. Usa el menú de la izquierda para ver los detalles.</p>
      </Card>
    </div>
  );
}