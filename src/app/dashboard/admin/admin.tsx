"use client";

import React, { useEffect, useState } from "react";
import {
  Typography, Row, Col, Card, Statistic, Button, Spin, Tag, Progress, Space, Segmented, Badge
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
import { Line, Column } from "@ant-design/plots";
import { formatDate } from "@utils/date";

const { Title, Text } = Typography;

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [stats, setStats] = useState({
    ingresosMes: 0,
    ingresosMesAnterior: 0,
    egresosMes: 0,
    estudiantesActivos: 0,
    estudiantesNuevos: 0,
    cursosActivos: 0,
    profesores: 0,
    balanceNeto: 0,
    tasaConversion: 0,
    tasaDesercion: 0,
    tasaOcupacion: 0,
    moraPromedio: 0,
    ingresosPorEstudiante: 0,
    rentabilidadPorPrograma: [] as any[]
  });
  const [ingresosChart, setIngresosChart] = useState<any[]>([]);
  const [distribucionPagos, setDistribucionPagos] = useState<any[]>([]);
  const [pagosVencidos, setPagosVencidos] = useState<any[]>([]);
  const [cumplesHoy, setCumplesHoy] = useState<any[]>([]);

  useEffect(() => {
    cargarDashboard();
    // eslint-disable-next-line
  }, [timeRange]);

  const cargarDashboard = async () => {
    setLoading(true);
    try {
      const hoy = dayjs();
      let inicioPeriodo: string;
      let finPeriodo: string;
      let periodoAnteriorInicio: string;
      let periodoAnteriorFin: string;
      switch (timeRange) {
        case 'week':
          inicioPeriodo = hoy.startOf('week').format('YYYY-MM-DD');
          finPeriodo = hoy.endOf('week').format('YYYY-MM-DD');
          periodoAnteriorInicio = hoy.subtract(1, 'week').startOf('week').format('YYYY-MM-DD');
          periodoAnteriorFin = hoy.subtract(1, 'week').endOf('week').format('YYYY-MM-DD');
          break;
        case 'year':
          inicioPeriodo = hoy.startOf('year').format('YYYY-MM-DD');
          finPeriodo = hoy.endOf('year').format('YYYY-MM-DD');
          periodoAnteriorInicio = hoy.subtract(1, 'year').startOf('year').format('YYYY-MM-DD');
          periodoAnteriorFin = hoy.subtract(1, 'year').endOf('year').format('YYYY-MM-DD');
          break;
        case 'month':
        default:
          inicioPeriodo = hoy.startOf('month').format('YYYY-MM-DD');
          finPeriodo = hoy.endOf('month').format('YYYY-MM-DD');
          periodoAnteriorInicio = hoy.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
          periodoAnteriorFin = hoy.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
          break;
      }
      const [
        pagosMes,
        pagosMesAnterior,
        nomina,
        matriculasActivas,
        cursosActivosCount,
        profesoresCount,
        vencidos
      ] = await Promise.all([
        supabaseBrowserClient
          .from("pagos")
          .select("monto, fecha_pago, estado, metodo_pago")
          .eq("estado", "pagado")
          .gte("fecha_pago", inicioPeriodo)
          .lte("fecha_pago", finPeriodo),
        supabaseBrowserClient
          .from("pagos")
          .select("monto")
          .eq("estado", "pagado")
          .gte("fecha_pago", periodoAnteriorInicio)
          .lte("fecha_pago", periodoAnteriorFin),
        supabaseBrowserClient
          .from("pagos_nomina")
          .select("total_pagado")
          .gte("fecha_pago", inicioPeriodo)
          .lte("fecha_pago", finPeriodo),
        supabaseBrowserClient
          .from("matriculas")
          .select("estudiante_id, created_at")
          .eq("estado", "activo"),
        supabaseBrowserClient
          .from("cursos")
          .select("*", { count: 'exact', head: true })
          .eq("estado", "activo"),
        supabaseBrowserClient
          .from("perfiles")
          .select("*", { count: 'exact', head: true })
          .eq("rol", "profesor"),
        supabaseBrowserClient
          .from("pagos")
          .select("id, monto, fecha_vencimiento, perfiles(nombre_completo), periodo_pagado")
          .eq("estado", "pendiente")
          .lt("fecha_vencimiento", hoy.format('YYYY-MM-DD'))
          .order("fecha_vencimiento", { ascending: true })
          .limit(5)
      ]);
      const totalIngresos = pagosMes.data?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;
      const ingresosMesAnterior = pagosMesAnterior.data?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;
      const totalEgresos = nomina.data?.reduce((sum, n) => sum + Number(n.total_pagado || 0), 0) || 0;
      const estudiantesUnicos = new Set(matriculasActivas.data?.map(m => m.estudiante_id) || []);
      const estudiantesNuevosMes = matriculasActivas.data?.filter(m => 
        dayjs(m.created_at).isBetween(inicioPeriodo, finPeriodo, null, '[]')
      ).length || 0;
      // Gráficos
      const chartData = [];
      let iteraciones = 7;
      let unidad: 'day' | 'week' | 'month' = 'day';
      let formato = 'DD MMM';
      if (timeRange === 'week') {
        iteraciones = 7;
        unidad = 'day';
        formato = 'DD MMM';
      } else if (timeRange === 'year') {
        iteraciones = 12;
        unidad = 'month';
        formato = 'MMM';
      } else {
        iteraciones = 30;
        unidad = 'day';
        formato = 'DD';
      }
      for (let i = iteraciones - 1; i >= 0; i--) {
        const fecha = dayjs().subtract(i, unidad);
        const fechaInicio = fecha.startOf(unidad).format('YYYY-MM-DD');
        const fechaFin = fecha.endOf(unidad).format('YYYY-MM-DD');
        const pagos = pagosMes.data?.filter(p => {
          const fechaPago = dayjs(p.fecha_pago);
          return fechaPago.isBetween(fechaInicio, fechaFin, null, '[]');
        }) || [];
        const total = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
        chartData.push({
          fecha: fecha.format(formato),
          monto: total,
          cantidad: pagos.length
        });
      }
      // Métodos de pago
      const metodos: Record<string, number> = {};
      pagosMes.data?.forEach(p => {
        const metodo = p.metodo_pago || 'Efectivo';
        metodos[metodo] = (metodos[metodo] || 0) + Number(p.monto || 0);
      });
      const distribucion = Object.entries(metodos).map(([metodo, monto]) => ({ metodo, monto }));
      // Métricas simplificadas
      const tasaOcupacion = 75;
      const moraPromedio = 5;
      const ingresosPorEstudiante = estudiantesUnicos.size > 0 
        ? Math.round(totalIngresos / estudiantesUnicos.size)
        : 0;
      setStats({
        ingresosMes: totalIngresos,
        ingresosMesAnterior,
        egresosMes: totalEgresos,
        estudiantesActivos: estudiantesUnicos.size,
        estudiantesNuevos: estudiantesNuevosMes,
        cursosActivos: cursosActivosCount.count || 0,
        profesores: profesoresCount.count || 0,
        balanceNeto: totalIngresos - totalEgresos,
        tasaConversion: 0,
        tasaDesercion: 0,
        tasaOcupacion,
        moraPromedio,
        ingresosPorEstudiante,
        rentabilidadPorPrograma: []
      });
      setIngresosChart(chartData);
      setDistribucionPagos(distribucion);
      setPagosVencidos(vencidos.data || []);
      setCumplesHoy([]);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
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
    point: { size: 5, shape: 'circle' },
    label: { style: { fill: '#aaa' } },
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
    label: { position: 'top', style: { fill: '#000', opacity: 0.6 } },
  };
  const periodoTexto = timeRange === 'week' ? 'de la Semana' : timeRange === 'year' ? 'del Año' : 'del Mes';
  const periodoAnteriorTexto = timeRange === 'week' ? 'Semana Anterior' : timeRange === 'year' ? 'Año Anterior' : 'Mes Anterior';

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#262626' }}>
            Panel Administrativo
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
          <Button icon={<SyncOutlined />} onClick={cargarDashboard} type="primary">Actualizar</Button>
        </Space>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', boxShadow: '0 4px 12px rgba(30, 58, 138, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Ingresos {periodoTexto}</span>}
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
            <Text style={{ color: '#e0e7ff', fontSize: 11 }}>vs. {periodoAnteriorTexto}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)', boxShadow: '0 4px 12px rgba(190, 18, 60, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Egresos {periodoTexto}</span>}
              value={stats.egresosMes}
              precision={0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<WalletOutlined style={{ color: '#fff' }} />}
            />
            <Text style={{ color: '#ffe4e6', fontSize: 11 }}>Nómina y gastos</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)', boxShadow: '0 4px 12px rgba(8, 145, 178, 0.2)' }}>
            <Statistic
              title={<span style={{ color: '#fff', fontWeight: 600 }}>Balance Neto {periodoTexto}</span>}
              value={stats.balanceNeto}
              precision={0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<BankOutlined style={{ color: '#fff' }} />}
            />
            <Text style={{ color: '#cffafe', fontSize: 11 }}>Ingresos - Egresos</Text>
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
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card 
            title={
              timeRange === 'week' 
                ? 'Ingresos de la Semana (Últimos 7 días)' 
                : timeRange === 'year' 
                  ? 'Ingresos del Año (Por mes)' 
                  : 'Ingresos del Mes (Por día)'
            } 
            variant="borderless"
          >
            <Line {...lineConfig} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={`Métodos de Pago ${periodoTexto}`} variant="borderless">
            <Column {...columnConfig} height={300} />
          </Card>
        </Col>
      </Row>
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
      </Row>
    </div>
  );
}
