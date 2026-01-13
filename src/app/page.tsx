"use client";

import React, { useEffect, useState } from "react";
import { 
  Typography, Row, Col, Card, Statistic, Button, Spin, Tag, Progress, 
  Empty, Space, Segmented, Tooltip, Badge
} from "antd";
import {
  DollarCircleOutlined, TeamOutlined, BookOutlined, RiseOutlined,
  FallOutlined, CalendarOutlined, TrophyOutlined, ClockCircleOutlined,
  UserAddOutlined, WalletOutlined, FileTextOutlined, BankOutlined,
  GiftOutlined, WarningOutlined, CheckCircleOutlined, SyncOutlined
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { formatDate } from "@utils/date";
import { Line, Column } from "@ant-design/plots";
import 'dayjs/locale/es';

dayjs.locale('es');

const { Title, Text } = Typography;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  
  // Estadísticas principales
  const [stats, setStats] = useState({
    ingresosMes: 0,
    ingresosMesAnterior: 0,
    egresosMes: 0,
    estudiantesActivos: 0,
    estudiantesNuevos: 0,
    cursosActivos: 0,
    profesores: 0,
    balanceNeto: 0,
    tasaConversion: 0
  });

  // Datos para gráficos
  const [ingresosChart, setIngresosChart] = useState<any[]>([]);
  const [distribucionPagos, setDistribucionPagos] = useState<any[]>([]);
  
  // Listas
  const [pagosRecientes, setPagosRecientes] = useState<any[]>([]);
  const [cumplesHoy, setCumplesHoy] = useState<any[]>([]);
  const [proximosCursos, setProximosCursos] = useState<any[]>([]);
  const [pagosVencidos, setPagosVencidos] = useState<any[]>([]);

  useEffect(() => {
    cargarDashboard();
    
    // Actualización en tiempo real
    const subscription = supabaseBrowserClient
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => cargarDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' }, () => cargarDashboard())
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [timeRange]);

  const cargarDashboard = async () => {
    setLoading(true);
    try {
      const hoy = dayjs();
      const inicioMes = hoy.startOf('month').format('YYYY-MM-DD');
      const finMes = hoy.endOf('month').format('YYYY-MM-DD');
      const mesAnterior = hoy.subtract(1, 'month');

      // 1. INGRESOS DEL MES ACTUAL
      const { data: pagosMes } = await supabaseBrowserClient
        .from("pagos")
        .select("monto, fecha_pago, estado, metodo_pago")
        .eq("estado", "pagado")
        .gte("fecha_pago", inicioMes)
        .lte("fecha_pago", finMes);

      const totalIngresos = pagosMes?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;

      // 2. INGRESOS MES ANTERIOR (para comparación)
      const { data: pagosMesAnterior } = await supabaseBrowserClient
        .from("pagos")
        .select("monto")
        .eq("estado", "pagado")
        .gte("fecha_pago", mesAnterior.startOf('month').format('YYYY-MM-DD'))
        .lte("fecha_pago", mesAnterior.endOf('month').format('YYYY-MM-DD'));

      const ingresosMesAnterior = pagosMesAnterior?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;

      // 3. EGRESOS (NÓMINA)
      const { data: nomina } = await supabaseBrowserClient
        .from("pagos_nomina")
        .select("total_pagado")
        .gte("fecha_pago", inicioMes)
        .lte("fecha_pago", finMes);

      const totalEgresos = nomina?.reduce((sum, n) => sum + Number(n.total_pagado || 0), 0) || 0;

      // 4. ESTUDIANTES ACTIVOS
      const { data: matriculasActivas } = await supabaseBrowserClient
        .from("matriculas")
        .select("estudiante_id, created_at")
        .eq("estado", "activo");

      const estudiantesUnicos = new Set(matriculasActivas?.map(m => m.estudiante_id) || []);
      const estudiantesNuevosMes = matriculasActivas?.filter(m => 
        dayjs(m.created_at).isAfter(inicioMes)
      ).length || 0;

      // 5. CURSOS Y PROFESORES
      const { count: cursosActivos } = await supabaseBrowserClient
        .from("cursos")
        .select("*", { count: 'exact', head: true })
        .eq("estado", "activo");

      const { count: profesores } = await supabaseBrowserClient
        .from("perfiles")
        .select("*", { count: 'exact', head: true })
        .eq("rol", "profesor");

      // 6. PAGOS RECIENTES (últimos 8)
      const { data: pagosRec } = await supabaseBrowserClient
        .from("pagos")
        .select("id, monto, fecha_pago, metodo_pago, estado, perfiles(nombre_completo)")
        .eq("estado", "pagado")
        .order("fecha_pago", { ascending: false })
        .limit(8);

      // 7. CUMPLEAÑOS HOY
      const { data: perfilesEstudiantes } = await supabaseBrowserClient
        .from("perfiles")
        .select("id, nombre_completo, telefono, fecha_nacimiento, matriculas!inner(estado)")
        .eq("rol", "estudiante")
        .eq("matriculas.estado", "activo")
        .not("fecha_nacimiento", "is", null);

      const cumples = perfilesEstudiantes?.filter(p => {
        const fecha = dayjs(p.fecha_nacimiento);
        return fecha.format('MM-DD') === hoy.format('MM-DD');
      }) || [];

      // 8. PRÓXIMOS CURSOS
      const { data: proxCursos } = await supabaseBrowserClient
        .from("cursos")
        .select("id, nombre, fecha_inicio, cupos, estado, matriculas(count)")
        .gte("fecha_inicio", hoy.format('YYYY-MM-DD'))
        .in("estado", ["proximo", "activo"])
        .order("fecha_inicio", { ascending: true })
        .limit(6);

      // 9. PAGOS VENCIDOS
      const { data: vencidos } = await supabaseBrowserClient
        .from("pagos")
        .select("id, monto, fecha_vencimiento, perfiles(nombre_completo), periodo_pagado")
        .eq("estado", "pendiente")
        .lt("fecha_vencimiento", hoy.format('YYYY-MM-DD'))
        .order("fecha_vencimiento", { ascending: true })
        .limit(5);

      // 10. DATOS PARA GRÁFICO DE INGRESOS (últimos 7 días)
      const chartData = [];
      for (let i = 6; i >= 0; i--) {
        const fecha = hoy.subtract(i, 'day');
        const fechaStr = fecha.format('YYYY-MM-DD');
        const pagos = pagosMes?.filter(p => 
          dayjs(p.fecha_pago).format('YYYY-MM-DD') === fechaStr
        ) || [];
        const total = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
        chartData.push({
          fecha: fecha.format('DD MMM'),
          monto: total,
          cantidad: pagos.length
        });
      }

      // 11. DISTRIBUCIÓN POR MÉTODO DE PAGO
      const metodos: Record<string, number> = {};
      pagosMes?.forEach(p => {
        const metodo = p.metodo_pago || 'Efectivo';
        metodos[metodo] = (metodos[metodo] || 0) + Number(p.monto || 0);
      });
      const distribucion = Object.entries(metodos).map(([metodo, monto]) => ({
        metodo,
        monto
      }));

      setStats({
        ingresosMes: totalIngresos,
        ingresosMesAnterior,
        egresosMes: totalEgresos,
        estudiantesActivos: estudiantesUnicos.size,
        estudiantesNuevos: estudiantesNuevosMes,
        cursosActivos: cursosActivos || 0,
        profesores: profesores || 0,
        balanceNeto: totalIngresos - totalEgresos,
        tasaConversion: ((estudiantesNuevosMes / (proximosCursos?.length || 1)) * 100)
      });

      setIngresosChart(chartData);
      setDistribucionPagos(distribucion);
      setPagosRecientes(pagosRec || []);
      setCumplesHoy(cumples);
      setProximosCursos(proxCursos || []);
      setPagosVencidos(vencidos || []);

    } catch (error) {
      console.error("Error cargando dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  const cambioIngresos = stats.ingresosMesAnterior > 0 
    ? ((stats.ingresosMes - stats.ingresosMesAnterior) / stats.ingresosMesAnterior * 100).toFixed(1)
    : 0;

  const lineConfig = {
    data: ingresosChart,
    xField: 'fecha',
    yField: 'monto',
    smooth: true,
    color: '#52c41a',
    point: {
      size: 5,
      shape: 'circle',
    },
    label: {
      style: {
        fill: '#aaa',
      },
    },
  };

  const columnConfig = {
    data: distribucionPagos,
    xField: 'metodo',
    yField: 'monto',
    seriesField: 'metodo',
    color: ({ metodo }: any) => {
      const colors: Record<string, string> = {
        'efectivo': '#52c41a',
        'transferencia': '#1890ff',
        'tarjeta': '#722ed1',
        'nequi': '#fa8c16',
        'otro': '#8c8c8c'
      };
      return colors[metodo?.toLowerCase()] || '#8c8c8c';
    },
    label: {
      position: 'top',
      style: {
        fill: '#000',
        opacity: 0.6,
      },
    },
  };

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ 
        marginBottom: 24, 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#262626' }}>
            Dashboard Ejecutivo
          </Title>
          <Text type="secondary">{dayjs().format('dddd, D [de] MMMM [de] YYYY')}</Text>
        </div>
        <Space>
          <Segmented
            options={[
              { label: 'Semana', value: 'week' },
              { label: 'Mes', value: 'month' },
              { label: 'Año', value: 'year' },
            ]}
            value={timeRange}
            onChange={(value: any) => setTimeRange(value)}
          />
          <Button 
            icon={<SyncOutlined />} 
            onClick={cargarDashboard}
            type="primary"
          >
            Actualizar
          </Button>
        </Space>
      </div>

      {/* KPIs Principales */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', boxShadow: '0 4px 12px rgba(30, 58, 138, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Ingresos del Mes</span>}
              value={stats.ingresosMes}
              precision={0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<DollarCircleOutlined style={{ color: '#fff' }} />}
              suffix={
                <Tag color={Number(cambioIngresos) >= 0 ? 'success' : 'error'} icon={Number(cambioIngresos) >= 0 ? <RiseOutlined /> : <FallOutlined />}>
                  {cambioIngresos}%
                </Tag>
              }
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)', boxShadow: '0 4px 12px rgba(190, 18, 60, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Egresos (Nómina)</span>}
              value={stats.egresosMes}
              precision={0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<WalletOutlined style={{ color: '#fff' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)', boxShadow: '0 4px 12px rgba(8, 145, 178, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Balance Neto</span>}
              value={stats.balanceNeto}
              precision={0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<BankOutlined style={{ color: '#fff' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)', boxShadow: '0 4px 12px rgba(21, 128, 61, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Estudiantes Activos</span>}
              value={stats.estudiantesActivos}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<TeamOutlined style={{ color: '#fff' }} />}
              suffix={
                <Badge count={`+${stats.estudiantesNuevos} nuevos`} style={{ backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 600 }} />
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Accesos Rápidos */}
      <Card 
        title="Acciones Rápidas" 
        variant="outlined"
        style={{ marginBottom: 24 }}
      >
        <Space size="middle" wrap>
          <Button 
            type="primary" 
            size="large"
            icon={<UserAddOutlined />}
            onClick={() => router.push('/matriculas/create')}
          >
            Nueva Matrícula
          </Button>
          <Button 
            size="large"
            icon={<DollarCircleOutlined />}
            onClick={() => router.push('/tesoreria/create')}
          >
            Registrar Pago
          </Button>
          <Button 
            size="large"
            icon={<BookOutlined />}
            onClick={() => router.push('/cursos/create')}
          >
            Nuevo Grupo
          </Button>
          <Button 
            size="large"
            icon={<FileTextOutlined />}
            onClick={() => router.push('/nomina')}
          >
            Ver Nómina
          </Button>
        </Space>
      </Card>

      {/* Gráficos */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Ingresos de los últimos 7 días" variant="borderless">
            <Line {...lineConfig} height={300} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Distribución por Método de Pago" variant="borderless">
            <Column {...columnConfig} height={300} />
          </Card>
        </Col>
      </Row>

      {/* Alertas y Acciones Importantes */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {pagosVencidos.length > 0 && (
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <WarningOutlined style={{ color: '#ff4d4f' }} />
                  Pagos Vencidos ({pagosVencidos.length})
                </Space>
              } 
              variant="borderless"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {pagosVencidos.slice(0, 5).map((pago: any) => (
                  <Card key={pago.id} size="small" style={{ background: '#fff1f0', borderColor: '#ffccc7' }}>
                    <Space direction="vertical" size={0}>
                      <Text strong>{pago.perfiles?.nombre_completo || 'Estudiante'}</Text>
                      <Text type="secondary">{pago.periodo_pagado}</Text>
                      <Space>
                        <Tag color="red">Vencido: {formatDate(pago.fecha_vencimiento)}</Tag>
                        <Text strong style={{ color: '#ff4d4f' }}>${Number(pago.monto).toLocaleString()}</Text>
                      </Space>
                    </Space>
                  </Card>
                ))}
                <Button type="link" onClick={() => router.push('/tesoreria')}>Ver todos los pagos</Button>
              </Space>
            </Card>
          </Col>
        )}

        {cumplesHoy.length > 0 && (
          <Col xs={24} lg={pagosVencidos.length > 0 ? 12 : 24}>
            <Card 
              title={
                <Space>
                  <GiftOutlined style={{ color: '#52c41a' }} />
                  Cumpleaños Hoy ({cumplesHoy.length})
                </Space>
              } 
              variant="borderless"
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {cumplesHoy.map((estudiante: any) => (
                  <Card key={estudiante.id} size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <TrophyOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                        <div>
                          <Text strong>{estudiante.nombre_completo}</Text>
                          <br />
                          <Text type="secondary">{estudiante.telefono}</Text>
                        </div>
                      </Space>
                      <Button 
                        type="primary" 
                        size="small" 
                        style={{ background: '#25D366', borderColor: '#25D366' }}
                        onClick={() => window.open(`https://wa.me/${estudiante.telefono}?text=¡Feliz cumpleaños ${estudiante.nombre_completo}! 🎉`, '_blank')}
                      >
                        Felicitar
                      </Button>
                    </Space>
                  </Card>
                ))}
              </Space>
            </Card>
          </Col>
        )}
      </Row>

      {/* Información Adicional */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Pagos Recientes" variant="borderless">
            {pagosRecientes.length === 0 ? (
              <Empty description="No hay pagos recientes" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {pagosRecientes.map((pago: any) => (
                  <div key={pago.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '8px 0',
                    borderBottom: '1px solid #f0f0f0'
                  }}>
                    <Space>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <div>
                        <Text strong>{pago.perfiles?.nombre_completo || 'Estudiante'}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDate(pago.fecha_pago)} • {pago.metodo_pago || 'Efectivo'}
                        </Text>
                      </div>
                    </Space>
                    <Text strong style={{ color: '#52c41a' }}>
                      ${Number(pago.monto).toLocaleString()}
                    </Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Próximos Grupos a Iniciar" variant="borderless">
            {proximosCursos.length === 0 ? (
              <Empty description="No hay grupos próximos" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {proximosCursos.map((curso: any) => {
                  const inscritos = curso.matriculas?.[0]?.count || 0;
                  const cupos = curso.cupos || 20;
                  const porcentaje = (inscritos / cupos) * 100;
                  
                  return (
                    <Card key={curso.id} size="small" hoverable onClick={() => router.push(`/cursos/salon/${curso.id}`)}>
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{curso.nombre}</Text>
                          <Tag color="blue">{formatDate(curso.fecha_inicio)}</Tag>
                        </div>
                        <Progress 
                          percent={porcentaje} 
                          format={() => `${inscritos}/${cupos}`}
                          strokeColor={porcentaje >= 80 ? '#ff4d4f' : '#52c41a'}
                        />
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Stats adicionales */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={12} sm={6}>
          <Card variant="borderless" style={{ textAlign: 'center' }}>
            <Statistic
              title="Cursos Activos"
              value={stats.cursosActivos}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="borderless" style={{ textAlign: 'center' }}>
            <Statistic
              title="Profesores"
              value={stats.profesores}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="borderless" style={{ textAlign: 'center' }}>
            <Statistic
              title="Tasa Conversión"
              value={stats.tasaConversion}
              suffix="%"
              precision={1}
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card variant="borderless" style={{ textAlign: 'center' }}>
            <Statistic
              title="Nuevos Este Mes"
              value={stats.estudiantesNuevos}
              prefix={<UserAddOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
