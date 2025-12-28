"use client";

import React, { useEffect, useMemo, useState } from "react";
import { 
  List, Card, Typography, Tag, Button, Spin, Collapse, Badge, Input, Space, Statistic, Row, Col 
} from "antd";
import { 
  PlusOutlined, EditOutlined, EyeOutlined, 
  CalendarOutlined, UserOutlined, SearchOutlined, ClockCircleOutlined, DollarOutlined,
  BookOutlined, TeamOutlined
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";
import 'dayjs/locale/es';

dayjs.locale('es');

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function CursosList() {
  const { edit, create, show } = useNavigation();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    setLoading(true);
    const { data, error } = await supabaseBrowserClient
      .from("cursos")
      .select(`*, perfiles (nombre_completo), programas (*)`)
      .order("fecha_inicio", { ascending: false });

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

  // Agrupar cursos por programa
  const programas = useMemo(() => {
    const mapa: Record<number, any> = {};
    
    cursos.forEach((curso) => {
      const programaId = curso.programa_id;
      const programaData = curso.programas;
      
      // Si el curso no tiene programa_id, usar fallback con nombre
      const key = programaId || `legacy_${curso.nombre}`;
      
      if (!mapa[key]) {
        mapa[key] = {
          id: programaId,
          nombre: programaData?.nombre || curso.nombre,
          duracion: programaData?.duracion || curso.duracion,
          precio: programaData?.precio || curso.precio,
          descripcion: programaData?.descripcion || curso.descripcion,
          cohortes: []
        };
      }
      
      mapa[key].cohortes.push(curso);
    });
    
    return Object.values(mapa).filter((p: any) => 
      p.nombre.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [cursos, searchText]);

  // Clasificar cohortes por estado
  const clasificarCohortes = (cohortes: any[]) => {
    const hoy = dayjs();
    const activos = cohortes.filter(c => 
      c.estado === 'activo' && c.fecha_inicio && dayjs(c.fecha_inicio).isBefore(hoy)
    );
    const proximos = cohortes.filter(c => 
      c.estado === 'activo' && c.fecha_inicio && dayjs(c.fecha_inicio).isAfter(hoy)
    );
    const terminados = cohortes.filter(c => 
      c.estado !== 'activo' || (c.fecha_fin && dayjs(c.fecha_fin).isBefore(hoy))
    );
    
    return { activos, proximos, terminados };
  };

  const CohorteCard = ({ cohorte }: { cohorte: any }) => {
    const inscritos = inscritosPorCurso[cohorte.id] || 0;
    const cupos = cohorte.cupos || 20;
    const disponibles = Math.max(0, cupos - inscritos);
    const lleno = disponibles === 0;

    return (
      <Card 
        size="small" 
        style={{ marginBottom: 12, borderLeft: `4px solid ${lleno ? '#ff4d4f' : '#52c41a'}` }}
      >
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Text strong style={{ fontSize: 15 }}>
                {cohorte.cohorte || 'Cohorte'} 
                {cohorte.fecha_inicio && ` - ${dayjs(cohorte.fecha_inicio).format('MMM YYYY')}`}
              </Text>
              
              {cohorte.dias_semana && (
                <Text type="secondary">
                  <CalendarOutlined /> {cohorte.dias_semana}
                </Text>
              )}
              
              {cohorte.hora_inicio && (
                <Text type="secondary">
                  <ClockCircleOutlined /> {dayjs(cohorte.hora_inicio, 'HH:mm:ss').format('HH:mm')}
                  {cohorte.hora_fin && ` - ${dayjs(cohorte.hora_fin, 'HH:mm:ss').format('HH:mm')}`}
                </Text>
              )}
              
              {cohorte.perfiles && (
                <Text type="secondary">
                  <UserOutlined /> {cohorte.perfiles.nombre_completo}
                </Text>
              )}
            </Space>
          </Col>
          
          <Col>
            <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
              <Tag color={lleno ? 'red' : 'blue'} style={{ margin: 0 }}>
                {inscritos}/{cupos} estudiantes
              </Tag>
              {disponibles > 0 && (
                <Text type="success" style={{ fontSize: 11 }}>
                  {disponibles} disponibles
                </Text>
              )}
              {lleno && (
                <Text type="danger" style={{ fontSize: 11 }}>
                  LLENO
                </Text>
              )}
            </Space>
          </Col>
          
          <Col>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => show('cursos', cohorte.id)}>
                Gestionar
              </Button>
              <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={() => edit('cursos', cohorte.id)}>
                Editar
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>Oferta Académica</Title>
          <Text type="secondary">Programas con múltiples cohortes y horarios</Text>
        </div>
        <Space>
          <Input 
            placeholder="Buscar programa..." 
            prefix={<SearchOutlined />} 
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => create("cursos")}>
            Nueva Cohorte
          </Button>
        </Space>
      </div>

      <Collapse 
        defaultActiveKey={programas.length > 0 ? [0] : []}
        expandIconPosition="end"
        style={{ background: 'transparent', border: 'none' }}
      >
        {programas.map((programa: any, index: number) => {
          const { activos, proximos, terminados } = clasificarCohortes(programa.cohortes);
          const totalInscritos = programa.cohortes.reduce((sum: number, c: any) => 
            sum + (inscritosPorCurso[c.id] || 0), 0
          );

          return (
            <Panel
              key={index}
              header={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Space size="large">
                    <div>
                      <Text strong style={{ fontSize: 18, color: '#1890ff' }}>
                        <BookOutlined /> {programa.nombre}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Space size="small" split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                          {programa.duracion && (
                            <Text type="secondary">
                              <ClockCircleOutlined /> {programa.duracion}
                            </Text>
                          )}
                          {programa.precio && (
                            <Text type="secondary">
                              <DollarOutlined /> ${Number(programa.precio).toLocaleString()}
                            </Text>
                          )}
                          <Text type="secondary">
                            <TeamOutlined /> {totalInscritos} estudiantes
                          </Text>
                        </Space>
                      </div>
                    </div>
                  </Space>
                  <Space>
                    <Badge count={activos.length} style={{ backgroundColor: '#52c41a' }} />
                    <Tag color="green">Activos</Tag>
                    <Badge count={proximos.length} style={{ backgroundColor: '#1890ff' }} />
                    <Tag color="blue">Próximos</Tag>
                    <Badge count={terminados.length} />
                    <Tag>Terminados</Tag>
                  </Space>
                </div>
              }
              style={{ 
                marginBottom: 16, 
                background: '#fff', 
                borderRadius: 12,
                border: '1px solid #f0f0f0'
              }}
            >
              {programa.descripcion && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8 }}>
                  <Text>{programa.descripcion}</Text>
                </div>
              )}

              {activos.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <Title level={5} style={{ color: '#52c41a' }}>
                    🟢 Cohortes Activas ({activos.length})
                  </Title>
                  {activos.map((cohorte: any) => (
                    <CohorteCard key={cohorte.id} cohorte={cohorte} />
                  ))}
                </div>
              )}

              {proximos.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <Title level={5} style={{ color: '#1890ff' }}>
                    🔵 Próximos Inicios ({proximos.length})
                  </Title>
                  {proximos.map((cohorte: any) => (
                    <CohorteCard key={cohorte.id} cohorte={cohorte} />
                  ))}
                </div>
              )}

              {terminados.length > 0 && (
                <div>
                  <Title level={5} style={{ color: '#8c8c8c' }}>
                    ⚫ Terminados ({terminados.length})
                  </Title>
                  {terminados.map((cohorte: any) => (
                    <CohorteCard key={cohorte.id} cohorte={cohorte} />
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </Collapse>

      {programas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Text type="secondary">No se encontraron programas</Text>
        </div>
      )}
    </div>
  );
}