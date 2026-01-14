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
import isBetween from 'dayjs/plugin/isBetween';
import { formatDate } from "@utils/date";
import { Line, Column } from "@ant-design/plots";
import 'dayjs/locale/es';

dayjs.extend(isBetween);
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
    tasaConversion: 0,
    // Métricas estratégicas
    tasaDesercion: 0,
    tasaOcupacion: 0,
    moraPromedio: 0,
    ingresosPorEstudiante: 0,
    rentabilidadPorPrograma: [] as any[]
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
      
      // Determinar rango según filtro
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

      // 1. INGRESOS DEL PERÍODO ACTUAL
      const { data: pagosMes } = await supabaseBrowserClient
        .from("pagos")
        .select("monto, fecha_pago, estado, metodo_pago")
        .eq("estado", "pagado")
        .gte("fecha_pago", inicioPeriodo)
        .lte("fecha_pago", finPeriodo);

      const totalIngresos = pagosMes?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;

      // 2. INGRESOS PERÍODO ANTERIOR (para comparación)
      const { data: pagosMesAnterior } = await supabaseBrowserClient
        .from("pagos")
        .select("monto")
        .eq("estado", "pagado")
        .gte("fecha_pago", periodoAnteriorInicio)
        .lte("fecha_pago", periodoAnteriorFin);

      const ingresosMesAnterior = pagosMesAnterior?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;

      // 3. EGRESOS (NÓMINA)
      const { data: nomina } = await supabaseBrowserClient
        .from("pagos_nomina")
        .select("total_pagado")
        .gte("fecha_pago", inicioPeriodo)
        .lte("fecha_pago", finPeriodo);

      const totalEgresos = nomina?.reduce((sum, n) => sum + Number(n.total_pagado || 0), 0) || 0;

      // 4. ESTUDIANTES ACTIVOS
      const { data: matriculasActivas } = await supabaseBrowserClient
        .from("matriculas")
        .select("estudiante_id, created_at")
        .eq("estado", "activo");

      const estudiantesUnicos = new Set(matriculasActivas?.map(m => m.estudiante_id) || []);
      const estudiantesNuevosMes = matriculasActivas?.filter(m => 
        dayjs(m.created_at).isBetween(inicioPeriodo, finPeriodo, null, '[]')
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

      // 10. DATOS PARA GRÁFICO DE INGRESOS (dinámico según período)
      const chartData = [];
      let iteraciones = 7; // Por defecto 7 días
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
      } else { // month
        iteraciones = 30;
        unidad = 'day';
        formato = 'DD';
      }
      
      for (let i = iteraciones - 1; i >= 0; i--) {
        const fecha = hoy.subtract(i, unidad);
        const fechaInicio = fecha.startOf(unidad).format('YYYY-MM-DD');
        const fechaFin = fecha.endOf(unidad).format('YYYY-MM-DD');
        const pagos = pagosMes?.filter(p => {
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

      // 12. TASA DE DESERCIÓN (estudiantes que abandonaron en los últimos 3 meses)
      const hace3Meses = hoy.subtract(3, 'month').format('YYYY-MM-DD');
      const { data: matriculasRetiradas } = await supabaseBrowserClient
        .from("matriculas")
        .select("id")
        .eq("estado", "retirado")
        .gte("updated_at", hace3Meses);

      const totalMatriculasTrimestre = (matriculasActivas?.length || 0) + (matriculasRetiradas?.length || 0);
      const tasaDesercion = totalMatriculasTrimestre > 0 
        ? ((matriculasRetiradas?.length || 0) / totalMatriculasTrimestre * 100) 
        : 0;

      // 13. TASA DE OCUPACIÓN (cupos ocupados vs disponibles)
      const { data: cursosConCupos } = await supabaseBrowserClient
        .from("cursos")
        .select("cupos, matriculas(count)")
        .eq("estado", "activo");

      const totalCuposDisponibles = cursosConCupos?.reduce((sum, c) => sum + (Number(c.cupos) || 0), 0) || 1;
      const totalCuposOcupados = cursosConCupos?.reduce((sum, c) => sum + (c.matriculas?.length || 0), 0) || 0;
      const tasaOcupacion = (totalCuposOcupados / totalCuposDisponibles * 100);

      // 14. MORA PROMEDIO (días promedio de retraso en pagos vencidos)
      const { data: pagosVencidosCompletos } = await supabaseBrowserClient
        .from("pagos")
        .select("fecha_vencimiento")
        .eq("estado", "pendiente")
        .lt("fecha_vencimiento", hoy.format('YYYY-MM-DD'));

      const diasMoraTotal = pagosVencidosCompletos?.reduce((sum, p) => {
        return sum + hoy.diff(dayjs(p.fecha_vencimiento), 'day');
      }, 0) || 0;
      const moraPromedio = pagosVencidosCompletos?.length 
        ? Math.round(diasMoraTotal / pagosVencidosCompletos.length)
        : 0;

      // 15. INGRESOS POR ESTUDIANTE (LTV promedio)
      const ingresosPorEstudiante = estudiantesUnicos.size > 0 
        ? Math.round(totalIngresos / estudiantesUnicos.size)
        : 0;

      // 16. RENTABILIDAD POR PROGRAMA
      const { data: programasConIngresos } = await supabaseBrowserClient
        .from("programas")
        .select(`
          id, 
          nombre,
          cursos(
            id,
            matriculas(
              id,
              pagos(monto, estado)
            )
          )
        `);

      const rentabilidadPorPrograma = programasConIngresos?.map(programa => {
        const totalIngresosProg = programa.cursos?.reduce((sum: number, curso: any) => {
          const ingresosCurso = curso.matriculas?.reduce((sumMat: number, mat: any) => {
            const ingresosMat = mat.pagos
              ?.filter((p: any) => p.estado === 'pagado')
              ?.reduce((sumPago: number, pago: any) => sumPago + Number(pago.monto || 0), 0) || 0;
            return sumMat + ingresosMat;
          }, 0) || 0;
          return sum + ingresosCurso;
        }, 0) || 0;

        const totalEstudiantes = programa.cursos?.reduce((sum: number, curso: any) => {
          return sum + (curso.matriculas?.length || 0);
        }, 0) || 0;

        return {
          nombre: programa.nombre,
          ingresos: totalIngresosProg,
          estudiantes: totalEstudiantes,
          promedioPorEstudiante: totalEstudiantes > 0 ? Math.round(totalIngresosProg / totalEstudiantes) : 0
        };
      }).filter(p => p.ingresos > 0).sort((a, b) => b.ingresos - a.ingresos) || [];

      setStats({
        ingresosMes: totalIngresos,
        ingresosMesAnterior,
        egresosMes: totalEgresos,
        estudiantesActivos: estudiantesUnicos.size,
        estudiantesNuevos: estudiantesNuevosMes,
        cursosActivos: cursosActivos || 0,
        profesores: profesores || 0,
        balanceNeto: totalIngresos - totalEgresos,
        tasaConversion: ((estudiantesNuevosMes / (proximosCursos?.length || 1)) * 100),
        tasaDesercion,
        tasaOcupacion,
        moraPromedio,
        ingresosPorEstudiante,
        rentabilidadPorPrograma
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

  // Texto del período seleccionado
  const periodoTexto = timeRange === 'week' ? 'de la Semana' : timeRange === 'year' ? 'del Año' : 'del Mes';
  const periodoAnteriorTexto = timeRange === 'week' ? 'Semana Anterior' : timeRange === 'year' ? 'Año Anterior' : 'Mes Anterior';

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

      {/* MÉTRICAS ESTRATÉGICAS */}
      <Card 
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <span>Indicadores Estratégicos</span>
          </Space>
        }
        variant="outlined"
        style={{ marginBottom: 24 }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Statistic
                title="Tasa de Ocupación"
                value={stats.tasaOcupacion}
                precision={1}
                suffix="%"
                valueStyle={{ color: stats.tasaOcupacion >= 80 ? '#52c41a' : stats.tasaOcupacion >= 60 ? '#faad14' : '#ff4d4f' }}
                prefix={<CheckCircleOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {stats.tasaOcupacion >= 80 ? 'Excelente capacidad' : stats.tasaOcupacion >= 60 ? 'Buena ocupación' : 'Mejorar captación'}
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: stats.tasaDesercion >= 15 ? '#fff1f0' : '#f6ffed', borderColor: stats.tasaDesercion >= 15 ? '#ffccc7' : '#b7eb8f' }}>
              <Statistic
                title="Tasa de Deserción"
                value={stats.tasaDesercion}
                precision={1}
                suffix="%"
                valueStyle={{ color: stats.tasaDesercion < 10 ? '#52c41a' : stats.tasaDesercion < 15 ? '#faad14' : '#ff4d4f' }}
                prefix={<FallOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {stats.tasaDesercion < 10 ? 'Retención excelente' : stats.tasaDesercion < 15 ? 'Retención normal' : 'Requiere atención'}
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
              <Statistic
                title="Mora Promedio"
                value={stats.moraPromedio}
                suffix="días"
                valueStyle={{ color: stats.moraPromedio <= 7 ? '#52c41a' : stats.moraPromedio <= 15 ? '#faad14' : '#ff4d4f' }}
                prefix={<ClockCircleOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {stats.moraPromedio <= 7 ? 'Cobranza efectiva' : stats.moraPromedio <= 15 ? 'Revisar procesos' : 'Acción inmediata'}
              </Text>
            </Card>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: '#e6f4ff', borderColor: '#91caff' }}>
              <Statistic
                title="Ingreso por Estudiante"
                value={stats.ingresosPorEstudiante}
                precision={0}
                prefix="$"
                valueStyle={{ color: '#1890ff' }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>LTV promedio mensual</Text>
            </Card>
          </Col>
        </Row>
      </Card>

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

      {/* RENTABILIDAD POR PROGRAMA - Decisión Estratégica */}
      {stats.rentabilidadPorPrograma.length > 0 && (
        <Card 
          title={
            <Space>
              <RiseOutlined style={{ color: '#52c41a' }} />
              <span>Rentabilidad por Programa</span>
              <Tag color="blue">Decisión Estratégica</Tag>
            </Space>
          }
          variant="borderless"
          style={{ marginBottom: 24, marginTop: 24 }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {stats.rentabilidadPorPrograma.map((programa: any, index: number) => (
              <div key={index}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Space>
                    <Badge 
                      count={index + 1} 
                      style={{ backgroundColor: index === 0 ? '#52c41a' : index === 1 ? '#1890ff' : '#8c8c8c' }} 
                    />
                    <Text strong>{programa.nombre}</Text>
                    <Tag>{programa.estudiantes} estudiantes</Tag>
                  </Space>
                  <Space>
                    <Text type="secondary">Promedio/estudiante:</Text>
                    <Text strong style={{ color: '#1890ff' }}>
                      ${programa.promedioPorEstudiante.toLocaleString()}
                    </Text>
                  </Space>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Progress 
                    percent={Math.round((programa.ingresos / (stats.rentabilidadPorPrograma[0]?.ingresos || 1)) * 100)}
                    strokeColor={index === 0 ? '#52c41a' : index === 1 ? '#1890ff' : '#faad14'}
                    style={{ flex: 1 }}
                  />
                  <Text strong style={{ color: '#52c41a', minWidth: 120, textAlign: 'right' }}>
                    ${programa.ingresos.toLocaleString()}
                  </Text>
                </div>
              </div>
            ))}
          </Space>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 16 }}>
            💡 Los programas con mayor promedio por estudiante tienen mejor rentabilidad. 
            Considera expandir o replicar los más exitosos.
          </Text>
        </Card>
      )}

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
