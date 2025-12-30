"use client";

import React, { useState, useEffect } from "react";
import { 
  Card, Typography, Spin, Tag, Button, Space, Select, DatePicker, Row, Col, Badge, Divider, Tooltip
} from "antd";
import { 
  CalendarOutlined, ClockCircleOutlined, UserOutlined, TeamOutlined,
  LeftOutlined, RightOutlined, EyeOutlined
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from 'dayjs/plugin/isoWeek';
import isBetween from 'dayjs/plugin/isBetween';
import 'dayjs/locale/es';

dayjs.extend(isoWeek);
dayjs.extend(isBetween);
dayjs.locale('es');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type ViewMode = 'week' | 'month' | 'custom';

interface Curso {
  id: number;
  nombre: string;
  programa_id: number;
  profesor_id: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin?: string;
  dias_semana?: string;
  hora_inicio?: string;
  hora_fin?: string;
  cupos: number;
  perfiles?: {
    nombre_completo: string;
  };
  programas?: {
    nombre: string;
    duracion: string;
  };
}

export default function PlanificadorPage() {
  const { show } = useNavigation();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    setLoading(true);
    const { data, error } = await supabaseBrowserClient
      .from("cursos")
      .select(`*, perfiles (nombre_completo), programas (nombre, duracion)`)
      .in('estado', ['activo', 'proximo'])
      .order("fecha_inicio", { ascending: true });

    if (!error && data) {
      setCursos(data || []);
      cargarInscritosPorCurso(data.map((c: any) => c.id));
    }
    setLoading(false);
  };

  const cargarInscritosPorCurso = async (cursoIds: number[]) => {
    try {
      const { data } = await supabaseBrowserClient
        .from("matriculas")
        .select("curso_id")
        .in("curso_id", cursoIds);
      
      const conteos: Record<number, number> = {};
      cursoIds.forEach(id => {
        conteos[id] = (data || []).filter((m: any) => m.curso_id === id).length;
      });
      setInscritosPorCurso(conteos);
    } catch (error) {
      console.error("Error cargando inscritos:", error);
    }
  };

  // Obtener rango de fechas según el modo de vista
  const getDateRange = (): { start: Dayjs; end: Dayjs; title: string } => {
    if (viewMode === 'custom' && customRange) {
      return {
        start: customRange[0].startOf('day'),
        end: customRange[1].endOf('day'),
        title: `${customRange[0].format('DD MMM YYYY')} - ${customRange[1].format('DD MMM YYYY')}`
      };
    }

    if (viewMode === 'week') {
      return {
        start: currentDate.startOf('isoWeek'),
        end: currentDate.endOf('isoWeek'),
        title: `Semana del ${currentDate.startOf('isoWeek').format('DD MMM')} al ${currentDate.endOf('isoWeek').format('DD MMM YYYY')}`
      };
    }

    // month
    return {
      start: currentDate.startOf('month'),
      end: currentDate.endOf('month'),
      title: currentDate.format('MMMM YYYY').toUpperCase()
    };
  };

  const dateRange = getDateRange();

  // Filtrar cursos que están en el rango de fechas
  const cursosEnRango = cursos.filter(curso => {
    if (!curso.fecha_inicio) return false;
    
    const fechaInicio = dayjs(curso.fecha_inicio);
    const fechaFin = curso.fecha_fin ? dayjs(curso.fecha_fin) : fechaInicio.add(6, 'month'); // Si no hay fecha fin, asumimos 6 meses
    
    // El curso está en rango si su periodo se solapa con el rango visible
    return fechaInicio.isBefore(dateRange.end) && fechaFin.isAfter(dateRange.start);
  });

  // Generar array de días según el modo de vista
  const getDaysArray = (): Dayjs[] => {
    const days: Dayjs[] = [];
    let current = dateRange.start;
    
    while (current.isBefore(dateRange.end) || current.isSame(dateRange.end, 'day')) {
      days.push(current);
      current = current.add(1, 'day');
    }
    
    return days;
  };

  // Verificar si un curso tiene clase en un día específico
  const cursoTieneClaseEnDia = (curso: Curso, dia: Dayjs): boolean => {
    if (!curso.fecha_inicio) return false;
    
    const fechaInicio = dayjs(curso.fecha_inicio);
    const fechaFin = curso.fecha_fin ? dayjs(curso.fecha_fin) : fechaInicio.add(6, 'month');
    
    // Verificar si el día está dentro del rango del curso
    if (!dia.isBetween(fechaInicio, fechaFin, 'day', '[]')) {
      return false;
    }
    
    // Verificar si el día de la semana coincide
    if (curso.dias_semana) {
      const diasArray = curso.dias_semana.toLowerCase().split(',').map(d => d.trim());
      const diaActual = dia.format('dddd').toLowerCase();
      return diasArray.includes(diaActual);
    }
    
    return false;
  };

  // Navegar entre períodos
  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (viewMode === 'week') {
      setCurrentDate(direction === 'next' 
        ? currentDate.add(1, 'week')
        : currentDate.subtract(1, 'week')
      );
    } else if (viewMode === 'month') {
      setCurrentDate(direction === 'next'
        ? currentDate.add(1, 'month')
        : currentDate.subtract(1, 'month')
      );
    }
  };

  // Obtener color del tag según estado
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'green';
      case 'proximo': return 'blue';
      case 'finalizado': return 'default';
      default: return 'default';
    }
  };

  const daysArray = getDaysArray();
  const horas = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

  // Vista de lista agrupada por día
  const renderListView = () => {
    return (
      <div>
        {daysArray.map(dia => {
          const cursosDelDia = cursosEnRango.filter(curso => cursoTieneClaseEnDia(curso, dia));
          
          if (cursosDelDia.length === 0) return null;
          
          return (
            <Card 
              key={dia.format('YYYY-MM-DD')}
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <CalendarOutlined />
                  <Text strong>{dia.format('dddd DD [de] MMMM YYYY').toUpperCase()}</Text>
                  <Badge count={cursosDelDia.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              }
            >
              <Row gutter={[16, 16]}>
                {cursosDelDia.sort((a, b) => {
                  const horaA = a.hora_inicio ? dayjs(a.hora_inicio, 'HH:mm:ss') : dayjs();
                  const horaB = b.hora_inicio ? dayjs(b.hora_inicio, 'HH:mm:ss') : dayjs();
                  return horaA.diff(horaB);
                }).map(curso => {
                  const inscritos = inscritosPorCurso[curso.id] || 0;
                  const disponibles = Math.max(0, curso.cupos - inscritos);
                  
                  return (
                    <Col xs={24} sm={12} md={8} lg={6} key={curso.id}>
                      <Card
                        size="small"
                        hoverable
                        onClick={() => show("cursos", curso.id)}
                        style={{ 
                          borderLeft: `4px solid ${curso.estado === 'activo' ? '#52c41a' : '#1890ff'}`,
                          height: '100%'
                        }}
                      >
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Text strong ellipsis={{ tooltip: true }}>
                            {curso.programas?.nombre || curso.nombre}
                          </Text>
                          
                          {curso.hora_inicio && (
                            <div>
                              <ClockCircleOutlined style={{ marginRight: 4 }} />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {dayjs(curso.hora_inicio, 'HH:mm:ss').format('HH:mm')}
                                {curso.hora_fin && ` - ${dayjs(curso.hora_fin, 'HH:mm:ss').format('HH:mm')}`}
                              </Text>
                            </div>
                          )}
                          
                          {curso.perfiles && (
                            <div>
                              <UserOutlined style={{ marginRight: 4 }} />
                              <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: true }}>
                                {curso.perfiles.nombre_completo}
                              </Text>
                            </div>
                          )}
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Tag color={getEstadoColor(curso.estado)} style={{ fontSize: 11 }}>
                              {curso.estado}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <TeamOutlined /> {inscritos}/{curso.cupos}
                            </Text>
                          </div>
                          
                          <div style={{ fontSize: 11, color: '#999' }}>
                            Inicia: {dayjs(curso.fecha_inicio).format('DD MMM YYYY')}
                            {curso.fecha_fin && (
                              <><br/>Termina: {dayjs(curso.fecha_fin).format('DD MMM YYYY')}</>
                            )}
                          </div>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          );
        })}
        
        {cursosEnRango.length === 0 && (
          <Card>
            <div style={{ textAlign: 'center', padding: 40 }}>
              <CalendarOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <Text type="secondary">No hay cursos activos en este período</Text>
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle" justify="space-between">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <CalendarOutlined /> Planificador de Cursos
            </Title>
          </Col>
          
          <Col>
            <Space size="middle">
              <Select
                value={viewMode}
                onChange={(value) => {
                  setViewMode(value);
                  setCustomRange(null);
                }}
                style={{ width: 120 }}
              >
                <Select.Option value="week">Semana</Select.Option>
                <Select.Option value="month">Mes</Select.Option>
                <Select.Option value="custom">Rango</Select.Option>
              </Select>
              
              {viewMode === 'custom' ? (
                <RangePicker
                  value={customRange}
                  onChange={(dates) => setCustomRange(dates as [Dayjs, Dayjs])}
                  format="DD MMM YYYY"
                />
              ) : (
                <Space.Compact>
                  <Button icon={<LeftOutlined />} onClick={() => navigatePeriod('prev')} />
                  <Button onClick={() => setCurrentDate(dayjs())}>Hoy</Button>
                  <Button icon={<RightOutlined />} onClick={() => navigatePeriod('next')} />
                </Space.Compact>
              )}
            </Space>
          </Col>
        </Row>
        
        <Divider />
        
        <Row justify="center">
          <Col>
            <Title level={4} style={{ margin: 0, textAlign: 'center' }}>
              {dateRange.title}
            </Title>
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" tip="Cargando cursos..." />
        </div>
      ) : (
        renderListView()
      )}
    </div>
  );
}
