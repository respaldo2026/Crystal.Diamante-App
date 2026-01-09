"use client";

import React, { useEffect, useMemo, useState } from "react";
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

interface Clase {
  id: number;
  curso_id: number;
  fecha_hora: string;
  estado?: string | null;
  profesor_id?: string | null;
  perfiles?: {
    nombre_completo?: string | null;
  };
}

interface EventoCalendario {
  curso: Curso;
  clase?: Clase;
  estadoClase?: string;
}

export default function PlanificadorPage() {
  const { show } = useNavigation();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});
  const [clases, setClases] = useState<Clase[]>([]);
  const [profesores, setProfesores] = useState<{ id: string; nombre_completo: string }[]>([]);
  const [profesorFiltro, setProfesorFiltro] = useState<string | null>(null);

  useEffect(() => {
    cargarProfesores();
  }, []);

  useEffect(() => {
    cargarCursos();
  }, [viewMode, currentDate, customRange, profesorFiltro]);

  const cargarCursos = async () => {
    setLoading(true);
    const rango = getDateRange();
    try {
      let query = supabaseBrowserClient
        .from("cursos")
        .select(`*, perfiles (nombre_completo), programas (nombre, duracion)`)
        .in('estado', ['activo', 'proximo'])
        .order("fecha_inicio", { ascending: true });

      if (profesorFiltro) {
        query = query.eq("profesor_id", profesorFiltro);
      }

      const { data, error } = await query;

      if (!error && data) {
        setCursos(data || []);
        const cursoIds = data.map((c: any) => c.id);

        if (cursoIds.length) {
          await Promise.all([
            cargarInscritosPorCurso(cursoIds),
            cargarClases(cursoIds, rango.start, rango.end),
          ]);
        } else {
          setInscritosPorCurso({});
          setClases([]);
        }
      } else {
        setCursos([]);
        setClases([]);
        setInscritosPorCurso({});
      }
    } catch (err) {
      console.error("Error cargando cursos:", err);
      setCursos([]);
      setClases([]);
    } finally {
      setLoading(false);
    }
  };

  const cargarProfesores = async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("perfiles")
        .select("id, nombre_completo")
        .eq("rol", "profesor")
        .order("nombre_completo");

      if (!error && data) {
        setProfesores(data as { id: string; nombre_completo: string }[]);
      }
    } catch (err) {
      console.error("Error cargando profesores:", err);
    }
  };

  const cargarInscritosPorCurso = async (cursoIds: number[]) => {
    if (!cursoIds.length) {
      setInscritosPorCurso({});
      return;
    }

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

  const cargarClases = async (cursoIds: number[], start: Dayjs, end: Dayjs) => {
    if (!cursoIds.length) {
      setClases([]);
      return;
    }

    try {
      let query = supabaseBrowserClient
        .from("clases")
        .select("id, curso_id, fecha_hora, estado, profesor_id, perfiles:profesor_id (nombre_completo)")
        .in("curso_id", cursoIds)
        .gte("fecha_hora", start.startOf('day').toISOString())
        .lte("fecha_hora", end.endOf('day').toISOString());

      if (profesorFiltro) {
        query = query.eq("profesor_id", profesorFiltro);
      }

      const { data, error } = await query;

      if (!error && data) {
        setClases(data as unknown as Clase[]);
      } else {
        setClases([]);
      }
    } catch (err) {
      console.error("Error cargando clases:", err);
      setClases([]);
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

  const cursosPorId = useMemo(() => {
    const map: Record<number, Curso> = {};
    cursos.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [cursos]);

  const clasesPorFecha = useMemo(() => {
    const map: Record<string, Clase[]> = {};
    clases.forEach((clase) => {
      const fecha = dayjs(clase.fecha_hora).format('YYYY-MM-DD');
      if (!map[fecha]) map[fecha] = [];
      map[fecha].push(clase);
    });
    return map;
  }, [clases]);

  const getEstadoClaseProps = (estado?: string) => {
    const normalized = (estado || 'programada').toLowerCase();
    switch (normalized) {
      case 'cancelada':
        return { color: 'red', label: 'Cancelada', border: '#ff4d4f' };
      case 'reprogramada':
        return { color: 'orange', label: 'Reprogramada', border: '#fa8c16' };
      case 'dictada':
      case 'completada':
        return { color: 'green', label: 'Dictada', border: '#52c41a' };
      default:
        return { color: 'blue', label: 'Programada', border: '#1890ff' };
    }
  };

  const getHoraEvento = (evento: EventoCalendario) => {
    if (evento.clase?.fecha_hora) {
      return dayjs(evento.clase.fecha_hora);
    }

    if (evento.curso.hora_inicio) {
      return dayjs(evento.curso.hora_inicio, 'HH:mm:ss');
    }

    return dayjs().hour(23).minute(59);
  };

  const getRangoEvento = (evento: EventoCalendario) => {
    const inicio = getHoraEvento(evento);
    // Usamos hora_fin del curso o 1 hora por defecto
    const fin = evento.curso.hora_fin
      ? dayjs(evento.curso.hora_fin, 'HH:mm:ss')
      : inicio.add(1, 'hour');
    return { inicio, fin };
  };

  const marcarConflictos = (eventos: EventoCalendario[]) => {
    const conflictivos = new Set<string>();
    for (let i = 0; i < eventos.length; i++) {
      for (let j = i + 1; j < eventos.length; j++) {
        const { inicio: aIni, fin: aFin } = getRangoEvento(eventos[i]);
        const { inicio: bIni, fin: bFin } = getRangoEvento(eventos[j]);
        const seSolapan = aIni.isBefore(bFin) && bIni.isBefore(aFin);
        if (seSolapan) {
          conflictivos.add(`${i}`);
          conflictivos.add(`${j}`);
        }
      }
    }
    return conflictivos;
  };

  const obtenerEventosDelDia = (dia: Dayjs): EventoCalendario[] => {
    const fechaClave = dia.format('YYYY-MM-DD');
    const clasesDelDia = (clasesPorFecha[fechaClave] || [])
      .map((clase) => {
        const curso = cursosPorId[clase.curso_id];
        if (!curso) return null;
        return {
          curso,
          clase,
          estadoClase: (clase.estado || 'programada').toLowerCase(),
        } as EventoCalendario;
      })
      .filter(Boolean) as EventoCalendario[];

    const cursosConClaseEnFecha = new Set(clasesDelDia.map((e) => e.curso.id));
    const cursosCanceladosEnFecha = new Set(
      clasesDelDia
        .filter((e) => e.estadoClase === 'cancelada')
        .map((e) => e.curso.id)
    );

    const eventosAuto = cursosEnRango
      .filter((curso) =>
        !cursosCanceladosEnFecha.has(curso.id) &&
        cursoTieneClaseEnDia(curso, dia) &&
        !cursosConClaseEnFecha.has(curso.id)
      )
      .map((curso) => ({ curso, estadoClase: 'programada' as const }));

    return [...clasesDelDia, ...eventosAuto];
  };

  // Vista de lista agrupada por día
  const renderListView = () => {
    let hayEventos = false;
    return (
      <div>
        {daysArray.map(dia => {
          const eventosDelDia = obtenerEventosDelDia(dia).sort((a, b) => getHoraEvento(a).diff(getHoraEvento(b)));
          const conflictos = marcarConflictos(eventosDelDia);
          
          if (eventosDelDia.length === 0) return null;
          hayEventos = true;
          
          return (
            <Card 
              key={dia.format('YYYY-MM-DD')}
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <CalendarOutlined />
                  <Text strong>{dia.format('dddd DD [de] MMMM YYYY').toUpperCase()}</Text>
                  <Badge count={eventosDelDia.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              }
            >
              <Row gutter={[16, 16]}>
                {eventosDelDia.map((evento, idx) => {
                  const inscritos = inscritosPorCurso[evento.curso.id] || 0;
                  const disponibles = Math.max(0, evento.curso.cupos - inscritos);
                  const estadoClaseProps = getEstadoClaseProps(evento.estadoClase);
                  const esCancelada = estadoClaseProps.label === 'Cancelada';
                  const horaInicio = getHoraEvento(evento);
                  const horaFin = evento.curso.hora_fin ? dayjs(evento.curso.hora_fin, 'HH:mm:ss') : null;
                  const profesorNombre = evento.clase?.perfiles?.nombre_completo || evento.curso.perfiles?.nombre_completo;
                  const enConflicto = conflictos.has(`${idx}`);

                  return (
                    <Col xs={24} sm={12} md={8} lg={6} key={`${evento.curso.id}-${evento.clase?.id || horaInicio.valueOf()}`}>
                      <Card
                        size="small"
                        hoverable={!esCancelada}
                        onClick={esCancelada ? undefined : () => show("cursos", evento.curso.id)}
                        style={{ 
                          borderLeft: `4px solid ${enConflicto ? '#ff4d4f' : estadoClaseProps.border || '#1890ff'}`,
                          height: '100%',
                          opacity: esCancelada ? 0.75 : 1,
                          background: esCancelada ? '#fff1f0' : enConflicto ? '#fff2f0' : undefined
                        }}
                      >
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text strong ellipsis={{ tooltip: true }}>
                              {evento.curso.programas?.nombre || evento.curso.nombre}
                            </Text>
                            {enConflicto && (
                              <Tag color="red" style={{ fontSize: 10 }}>Conflicto</Tag>
                            )}
                            {evento.clase && evento.estadoClase !== 'programada' && (
                              <Tooltip title="Clase reprogramada/registrada manualmente">
                                <Tag color={estadoClaseProps.color} style={{ fontSize: 10 }}>
                                  {estadoClaseProps.label}
                                </Tag>
                              </Tooltip>
                            )}
                          </div>

                          {(evento.clase || evento.curso.hora_inicio) && (
                            <div>
                              <ClockCircleOutlined style={{ marginRight: 4 }} />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {horaInicio.format('HH:mm')}
                                {horaFin && ` - ${horaFin.format('HH:mm')}`}
                              </Text>
                            </div>
                          )}
                          
                          {profesorNombre && (
                            <div>
                              <UserOutlined style={{ marginRight: 4 }} />
                              <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: true }}>
                                {profesorNombre}
                              </Text>
                            </div>
                          )}
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Tag color={getEstadoColor(evento.curso.estado)} style={{ fontSize: 11 }}>
                              {evento.curso.estado}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <TeamOutlined /> {inscritos}/{evento.curso.cupos}
                            </Text>
                          </div>
                          
                          <div style={{ fontSize: 11, color: '#999' }}>
                            Inicia: {dayjs(evento.curso.fecha_inicio).format('DD MMM YYYY')}
                            {evento.curso.fecha_fin && (
                              <><br/>Termina: {dayjs(evento.curso.fecha_fin).format('DD MMM YYYY')}</>
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
        
        {!hayEventos && (
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
                  onChange={(dates) => setCustomRange(dates ? (dates as [Dayjs, Dayjs]) : null)}
                  format="DD MMM YYYY"
                />
              ) : (
                <Space.Compact>
                  <Button icon={<LeftOutlined />} onClick={() => navigatePeriod('prev')} />
                  <Button onClick={() => setCurrentDate(dayjs())}>Hoy</Button>
                  <Button icon={<RightOutlined />} onClick={() => navigatePeriod('next')} />
                </Space.Compact>
              )}

              <Select
                allowClear
                showSearch
                placeholder="Todos los profesores"
                optionFilterProp="label"
                value={profesorFiltro || undefined}
                onChange={(value) => setProfesorFiltro(value || null)}
                style={{ minWidth: 220 }}
                options={profesores.map((p) => ({ value: p.id, label: p.nombre_completo }))}
              />
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
