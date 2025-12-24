"use client";

import React, { useEffect, useState } from "react";
import { Typography, Row, Col, Card, Statistic, List, Avatar, Button, Spin, Tag } from "antd";
import { 
  DollarCircleOutlined, TeamOutlined, BookOutlined, 
  UserOutlined, RightOutlined, RiseOutlined 
} from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import 'dayjs/locale/es'; // Para fechas en español

dayjs.locale('es');

const { Title, Text } = Typography;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  
  // Estadísticas
  const [stats, setStats] = useState({
    ingresosMes: 0,
    estudiantesActivos: 0,
    cursosActivos: 0,
    profesores: 0
  });

  // Listas recientes
  const [ultimosPagos, setUltimosPagos] = useState<any[]>([]);
  const [nuevosEstudiantes, setNuevosEstudiantes] = useState<any[]>([]);

  useEffect(() => {
    cargarDashboardGeneral();
  }, []);

  const cargarDashboardGeneral = async () => {
    setLoading(true);
    try {
        const hoy = dayjs();
        const inicioMes = hoy.startOf('month').format('YYYY-MM-DD');

        // 1. Calcular Ingresos del Mes
        const { data: pagosMes } = await supabase
            .from("pagos")
            .select("monto")
            .gte("fecha_pago", inicioMes);
        
        const totalIngresos = pagosMes?.reduce((acc, curr) => acc + Number(curr.monto), 0) || 0;

        // 2. Contar Estudiantes Activos (Matrículas activas)
        const { count: countEstudiantes } = await supabase
            .from("matriculas")
            .select("*", { count: 'exact', head: true })
            .eq("estado", "activo");

        // 3. Contar Cursos Activos
        const { count: countCursos } = await supabase
            .from("cursos")
            .select("*", { count: 'exact', head: true })
            .eq("estado", "activo");

        // 4. Cargar Últimos 5 Pagos (Para el feed de actividad)
        const { data: dataUltimosPagos } = await supabase
            .from("pagos")
            .select(`
                id, monto, fecha_pago, periodo_pagado,
                matriculas ( perfiles (nombre_completo) )
            `)
            .order("created_at", { ascending: false })
            .limit(5);

        setStats({
            ingresosMes: totalIngresos,
            estudiantesActivos: countEstudiantes || 0,
            cursosActivos: countCursos || 0,
            profesores: 0 // Puedes agregar count de profes si quieres
        });

        setUltimosPagos(dataUltimosPagos || []);

    } catch (error) {
        console.error("Error cargando dashboard home", error);
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <div style={{padding: 50, textAlign: 'center'}}><Spin size="large"/></div>;

  return (
    <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 24 }}>
            <Title level={2}>¡Hola, Directora! 👋</Title>
            <Text type="secondary">Aquí tienes el resumen de tu academia hoy, {dayjs().format("D [de] MMMM")}.</Text>
        </div>

        {/* TARJETAS KPI (Indicadores Clave) */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* INGRESOS */}
            <Col xs={24} sm={12} lg={8}>
                <Card bordered={false} style={{ background: 'linear-gradient(135deg, #135200 0%, #3f8600 100%)' }}>
                    <Statistic 
                        title={<span style={{color: '#fff', opacity: 0.8}}>Ingresos este Mes</span>}
                        value={stats.ingresosMes}
                        prefix={<DollarCircleOutlined />}
                        valueStyle={{ color: '#fff', fontWeight: 'bold' }}
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                    <div style={{ marginTop: 10, color: '#fff', opacity: 0.9 }}>
                        <RiseOutlined /> Cierre de caja mensual
                    </div>
                </Card>
            </Col>

            {/* ESTUDIANTES */}
            <Col xs={24} sm={12} lg={8}>
                <Card bordered={false} style={{ background: 'linear-gradient(135deg, #003a8c 0%, #1890ff 100%)' }}>
                    <Statistic 
                        title={<span style={{color: '#fff', opacity: 0.8}}>Estudiantes Activos</span>}
                        value={stats.estudiantesActivos}
                        prefix={<TeamOutlined />}
                        valueStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <div style={{ marginTop: 10, color: '#fff', opacity: 0.9 }}>
                        Matrículas vigentes hoy
                    </div>
                </Card>
            </Col>

            {/* CURSOS */}
            <Col xs={24} sm={12} lg={8}>
                <Card bordered={false} style={{ background: 'linear-gradient(135deg, #531dab 0%, #722ed1 100%)' }}>
                    <Statistic 
                        title={<span style={{color: '#fff', opacity: 0.8}}>Cursos Abiertos</span>}
                        value={stats.cursosActivos}
                        prefix={<BookOutlined />}
                        valueStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <div style={{ marginTop: 10, color: '#fff', opacity: 0.9 }}>
                        Oferta académica actual
                    </div>
                </Card>
            </Col>
        </Row>

        <Row gutter={24}>
            {/* COLUMNA IZQUIERDA: ÚLTIMOS PAGOS */}
            <Col xs={24} lg={16}>
                <Card 
                    title="💰 Transacciones Recientes" 
                    extra={<Button type="link" href="/tesoreria">Ver todo</Button>}
                    style={{ height: '100%' }}
                >
                    <List
                        itemLayout="horizontal"
                        dataSource={ultimosPagos}
                        renderItem={(item) => (
                            <List.Item>
                                <List.Item.Meta
                                    avatar={<Avatar style={{backgroundColor: '#f6ffed', color: '#52c41a'}} icon={<DollarCircleOutlined />} />}
                                    title={<Text strong>{item.matriculas?.perfiles?.nombre_completo}</Text>}
                                    description={
                                        <span>
                                            {dayjs(item.created_at).format("DD MMM HH:mm")} - <Tag>{item.periodo_pagado}</Tag>
                                        </span>
                                    }
                                />
                                <div style={{fontWeight: 'bold', color: '#3f8600'}}>
                                    + ${Number(item.monto).toLocaleString()}
                                </div>
                            </List.Item>
                        )}
                    />
                    {ultimosPagos.length === 0 && <Text type="secondary">No hay pagos recientes.</Text>}
                </Card>
            </Col>

            {/* COLUMNA DERECHA: ACCESOS RÁPIDOS */}
            <Col xs={24} lg={8}>
                <Card title="⚡ Accesos Rápidos" style={{ height: '100%' }}>
                    <Button type="primary" block size="large" icon={<UserOutlined />} href="/matriculas" style={{ marginBottom: 15, height: 50 }}>
                        Matricular Estudiante
                    </Button>
                    <Button block size="large" icon={<DollarCircleOutlined />} href="/tesoreria" style={{ marginBottom: 15, height: 50 }}>
                        Registrar Pago
                    </Button>
                    <Button block size="large" icon={<BookOutlined />} href="/cursos/create" style={{ height: 50 }}>
                        Crear Nuevo Curso
                    </Button>
                    
                    <div style={{ marginTop: 30, background: '#fff7e6', padding: 15, borderRadius: 8, border: '1px solid #ffd591' }}>
                        <Text strong style={{ color: '#d46b08' }}>💡 Tip del día:</Text>
                        <p style={{ marginTop: 5, fontSize: 13, color: '#874d00' }}>
                            Recuerda revisar las calificaciones de los cursos que terminan esta semana para generar los certificados a tiempo.
                        </p>
                    </div>
                </Card>
            </Col>
        </Row>
    </div>
  );
}