"use client";

import React, { useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { Table, Tag, Card, Statistic, Row, Col, DatePicker, Button, Space } from "antd";
import { ShopOutlined, CalendarOutlined, ClearOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

// Activamos el plugin para comparar fechas
dayjs.extend(isBetween);

const { RangePicker } = DatePicker;

export default function TesoreriaPage() {
  const [fechasFiltro, setFechasFiltro] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Traemos TODAS las matrículas
  const { data: queryResult, isLoading } = useList({
    resource: "matriculas",
    pagination: { mode: "off" },
    meta: {
      // NOTA: Si esto falla con error 400, asegúrate de haber corrido el SQL que agrega 'porcentaje_comision' a 'cursos'
      select: "*, perfiles(nombre_completo, identificacion), cursos(nombre, porcentaje_comision, perfiles(nombre_completo))",
    },
  });

  const todasLasMatriculas = queryResult?.data || [];

  // FILTRO INTELIGENTE 🧠
  const datosFiltrados = useMemo(() => {
    if (!fechasFiltro) return todasLasMatriculas;

    const [inicio, fin] = fechasFiltro;
    
    return todasLasMatriculas.filter((item: any) => {
      const fechaMatricula = dayjs(item.fecha_inicio);
      return fechaMatricula.isBetween(inicio, fin, 'day', '[]');
    });
  }, [todasLasMatriculas, fechasFiltro]);


  // CÁLCULOS MATEMÁTICOS
  const totalRecaudado = datosFiltrados.reduce((sum, item: any) => sum + (Number(item.monto_pagado) || 0), 0);

  const totalPagoProfesores = datosFiltrados.reduce((sum, item: any) => {
    const comision = item.cursos?.porcentaje_comision || 50; 
    const pagoProfe = (Number(item.monto_pagado) || 0) * (comision / 100);
    return sum + pagoProfe;
  }, 0);

  const totalGananciaAcademia = totalRecaudado - totalPagoProfesores;


  return (
    <div style={{ padding: 20 }}>
      
      {/* --- BARRA DE CONTROL --- */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ margin: 0, color: '#722ed1' }}>💰 Tesorería y Nómina</h2>
            
            <Space>
                <span style={{ fontWeight: 'bold' }}>Filtrar por Fecha:</span>
                <RangePicker 
                    placeholder={["Fecha Inicio", "Fecha Fin"]}
                    onChange={(dates) => setFechasFiltro(dates as any)}
                    style={{ width: 250 }}
                />
                {fechasFiltro && (
                    <Button 
                        icon={<ClearOutlined />} 
                        onClick={() => setFechasFiltro(null)}
                        danger
                    >
                        Borrar Filtro
                    </Button>
                )}
            </Space>
        </div>
      </Card>

      {/* --- TARJETAS DE RESUMEN (Aquí corregimos el error 'bordered') --- */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          {/* CORRECCIÓN: Usamos variant="borderless" en vez de bordered={false} */}
          <Card variant="borderless" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <Statistic 
              title="Ventas del Periodo" 
              value={totalRecaudado} 
              prefix="$" 
              valueStyle={{ color: '#1677ff', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <Statistic 
              title="Nómina Profesores" 
              value={totalPagoProfesores} 
              prefix="$" 
              valueStyle={{ color: '#cf1322', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Statistic 
              title="Ganancia Neta" 
              value={totalGananciaAcademia} 
              prefix="$" 
              valueStyle={{ color: '#389e0d', fontWeight: 'bold' }} 
              suffix={<ShopOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* --- TABLA DE DATOS --- */}
      <Table 
        dataSource={datosFiltrados} 
        loading={isLoading}
        rowKey="id" 
        scroll={{ x: 800 }}
        pagination={{ pageSize: 20 }}
      >
        <Table.Column 
            title="Fecha" 
            dataIndex="fecha_inicio"
            sorter={(a: any, b: any) => dayjs(a.fecha_inicio).unix() - dayjs(b.fecha_inicio).unix()}
            render={(val) => (
                <Space>
                    <CalendarOutlined style={{ color: '#888' }}/>
                    {val}
                </Space>
            )} 
        />

        <Table.Column 
            title="Alumno" 
            dataIndex={["perfiles", "nombre_completo"]}
            render={(val) => <b>{val}</b>}
        />

        <Table.Column 
            title="Curso" 
            dataIndex={["cursos", "nombre"]}
        />

        <Table.Column 
            title="Monto Cobrado" 
            dataIndex="monto_pagado"
            render={(val) => `$ ${Number(val).toLocaleString()}`}
        />

        <Table.Column 
            title="Profesor (Comisión)" 
            render={(_, record: any) => {
                // Buscamos datos anidados
                const nombreProfe = record.cursos?.perfiles?.nombre_completo || "Sin Asignar";
                const comision = record.cursos?.porcentaje_comision || 50;
                return (
                    <div>
                        <Tag color="purple">{nombreProfe}</Tag>
                        <small>({comision}%)</small>
                    </div>
                );
            }}
        />

        <Table.Column 
            title="Pago Profe" 
            render={(_, record: any) => {
                const monto = Number(record.monto_pagado) || 0;
                const comision = record.cursos?.porcentaje_comision || 50;
                const aPagar = monto * (comision / 100);
                
                return <span style={{ color: '#cf1322', fontWeight: 500 }}>$ {aPagar.toLocaleString()}</span>;
            }}
        />

      </Table>
    </div>
  );
}