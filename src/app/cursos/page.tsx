"use client";

import React, { useEffect, useMemo, useState } from "react";
import { 
  List, Card, Typography, Tag, Button, Spin, Collapse, Badge, Input, Space, Statistic, Row, Col, Checkbox
} from "antd";
import { 
  PlusOutlined, EditOutlined, EyeOutlined, 
  CalendarOutlined, UserOutlined, SearchOutlined, ClockCircleOutlined, DollarOutlined,
  BookOutlined, TeamOutlined
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { App } from "antd";
import dayjs from "dayjs";
import 'dayjs/locale/es';

dayjs.locale('es');

const { Title, Text } = Typography;

export default function CursosList() {
    const { message, modal } = App.useApp();
  const { edit, create, show } = useNavigation();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
    const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    setLoading(true);
    let query = supabaseBrowserClient
      .from("cursos")
      .select(`*, perfiles (nombre_completo), programas (*)`);
    
    // Filtrar grupos finalizados si no se quiere mostrar
    if (!mostrarFinalizados) {
      query = query.neq("estado", "finalizado");
    }
    
    const { data, error } = await query
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
      // Si no se muestran finalizados, no incluir terminados en la clasificación
    const hoy = dayjs();
    const activos = cohortes.filter(c => 
      c.estado === 'activo' && c.fecha_inicio && dayjs(c.fecha_inicio).isBefore(hoy)
    ).filter(c => mostrarFinalizados || c.estado !== 'finalizado');
    const proximos = cohortes.filter(c => 
      c.estado === 'activo' && c.fecha_inicio && dayjs(c.fecha_inicio).isAfter(hoy)
    ).filter(c => mostrarFinalizados || c.estado !== 'finalizado');
    const terminados = cohortes.filter(c => 
      c.estado !== 'activo' || (c.fecha_fin && dayjs(c.fecha_fin).isBefore(hoy))
    ).filter(c => mostrarFinalizados || c.estado !== 'finalizado');
    
    return { activos, proximos, terminados };
  };

  const CohorteCard = ({ cohorte }: { cohorte: any }) => {
      const esFinalizado = cohorte.estado === 'finalizado';
      const esActivo = cohorte.estado === 'activo';
    const inscritos = inscritosPorCurso[cohorte.id] || 0;
    const cupos = cohorte.cupos || 20;
    const disponibles = Math.max(0, cupos - inscritos);
    const lleno = disponibles === 0;

  const handleToggleEstado = async (grupo: any) => {
    const esActivo = grupo.estado === 'activo';
    const nuevoEstado = esActivo ? 'finalizado' : 'activo';
    const accion = esActivo ? 'finalizar' : 'reactivar';
    
    try {
      // Si va a finalizar, verificar que no haya estudiantes activos
      if (esActivo) {
        const { data: matriculasActivas, error: errorMatriculas } = await supabaseBrowserClient
          .from("matriculas")
          .select("id, perfiles (nombre_completo)")
          .eq("curso_id", grupo.id)
          .eq("estado", "activo");
        
        if (errorMatriculas) throw errorMatriculas;
        
        if (matriculasActivas && matriculasActivas.length > 0) {
          modal.warning({
            title: "No se puede finalizar el grupo",
            content: (
              <div>
                <p>Este grupo tiene <strong>{matriculasActivas.length} estudiantes activos</strong>. Antes de finalizarlo debes:</p>
                <ol>
                  <li>Ir a la vista de gestión del grupo (botón Gestionar)</li>
                  <li>Revisar cada estudiante inscrito</li>
                  <li>Marcar las matrículas como completada, cancelada o retirada según corresponda</li>
                  <li>Una vez que todas las matrículas estén cerradas, podrás finalizar el grupo</li>
                </ol>
                <p><strong>Estudiantes activos:</strong></p>
                <ul>
                  {matriculasActivas.slice(0, 5).map((m: any) => (
                    <li key={m.id}>{m.perfiles?.nombre_completo || 'Sin nombre'}</li>
                  ))}
                  {matriculasActivas.length > 5 && <li>... y {matriculasActivas.length - 5} más</li>}
                </ul>
              </div>
            ),
            okText: "Entendido",
          });
          return;
        }
      }
      
      // Confirmación
      modal.confirm({
        title: esActivo ? "¿Finalizar este grupo?" : "¿Reactivar este grupo?",
        content: esActivo ? (
          <div>
            <p>Estás a punto de <strong>finalizar</strong> el grupo:</p>
            <p><strong>{grupo.cohorte || 'Sin nombre'}</strong></p>
            <p>¿Qué sucede al finalizar?</p>
            <ul>
              <li>El grupo desaparecerá de la lista principal</li>
              <li>No aparecerá al crear nuevas matrículas</li>
              <li>Todo el historial se mantiene intacto</li>
              <li>Las matrículas existentes se conservan</li>
              <li>Podrás reactivarlo si es necesario</li>
            </ul>
          </div>
        ) : (
          <div>
            <p>Estás a punto de <strong>reactivar</strong> el grupo:</p>
            <p><strong>{grupo.cohorte || 'Sin nombre'}</strong></p>
            <p>El grupo volverá a estar disponible para nuevas inscripciones.</p>
          </div>
        ),
        okText: esActivo ? "Sí, finalizar" : "Sí, reactivar",
        okType: esActivo ? "default" : "primary",
        cancelText: "Cancelar",
        onOk: async () => {
          const { error } = await supabaseBrowserClient
            .from("cursos")
            .update({ estado: nuevoEstado })
            .eq("id", grupo.id);
          
          if (error) throw error;
          message.success(`Grupo ${nuevoEstado === 'activo' ? 'reactivado' : 'finalizado'} correctamente`);
          cargarCursos();
        },
      });
    } catch (error: any) {
      message.error(`Error al ${accion} el grupo: ` + (error?.message || "Desconocido"));
      console.error(error);
    }
  };
    return (
      <Card 
        size="small" 
        style={{ marginBottom: 12, borderLeft: `4px solid ${lleno ? '#ff4d4f' : '#52c41a'}` }}
      >
        <Row gutter={16} align="middle">
                    {esFinalizado && (
                      <Col span={24}>
                        <Tag color="default" style={{ marginBottom: 8 }}>FINALIZADO</Tag>
                      </Col>
                    )}
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Text strong style={{ fontSize: 15 }}>
                {cohorte.cohorte || 'Grupo'} 
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
                {esFinalizado ? 'Ver' : 'Editar'}
              </Button>
              <Button 
                size="small" 
                danger={esActivo}
                onClick={() => handleToggleEstado(cohorte)}
              >
                {esActivo ? 'Finalizar' : 'Reactivar'}
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
          <Title level={2} style={{ marginBottom: 4 }}>Cursos (programas) y sus grupos</Title>
          <Text type="secondary">Cada curso académico puede tener múltiples grupos/horarios</Text>
        </div>
        <Space>
          <Input 
            placeholder="Buscar programa..."
            prefix={<SearchOutlined />}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <Checkbox
            checked={mostrarFinalizados}
            onChange={(e) => setMostrarFinalizados(e.target.checked)}
          >
            Ver finalizados {cursos.filter(c => c.estado === 'finalizado').length > 0 && `(${cursos.filter(c => c.estado === 'finalizado').length})`}
          </Checkbox>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => create("cursos")}>
              <App>
              </App>
            Nuevo Grupo
          </Button>
        </Space>
      </div>

      <Collapse 
        defaultActiveKey={programas.length > 0 ? [0] : []}
        expandIconPosition="end"
        style={{ background: 'transparent', border: 'none' }}
        items={programas.map((programa: any, index: number) => {
          const { activos, proximos, terminados } = clasificarCohortes(programa.cohortes);
          const totalInscritos = programa.cohortes.reduce((sum: number, c: any) => 
            sum + (inscritosPorCurso[c.id] || 0), 0
          );

          return {
            key: index.toString(),
            label: (
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
                <Space size={8} align="center">
                  <Tag color="green" style={{ margin: 0 }}>Activos: {activos.length}</Tag>
                  <Tag color="blue" style={{ margin: 0 }}>Próximos: {proximos.length}</Tag>
                  <Tag style={{ margin: 0 }}>Terminados: {terminados.length}</Tag>
                </Space>
              </div>
            ),
            children: (
              <>
                {programa.descripcion && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8 }}>
                    <Text>{programa.descripcion}</Text>
                  </div>
                )}

                {activos.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Title level={5} style={{ color: '#52c41a', margin: 0 }}>Grupos activos</Title>
                      <Tag color="green" style={{ margin: 0 }}>Activos: {activos.length}</Tag>
                    </div>
                    {activos.map((cohorte: any) => (
                      <CohorteCard key={cohorte.id} cohorte={cohorte} />
                    ))}
                  </div>
                )}

                {proximos.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Title level={5} style={{ color: '#1890ff', margin: 0 }}>Grupos próximos</Title>
                      <Tag color="blue" style={{ margin: 0 }}>Próximos: {proximos.length}</Tag>
                    </div>
                    {proximos.map((cohorte: any) => (
                      <CohorteCard key={cohorte.id} cohorte={cohorte} />
                    ))}
                  </div>
                )}

                {terminados.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Title level={5} style={{ color: '#8c8c8c', margin: 0 }}>Grupos terminados</Title>
                      <Tag style={{ margin: 0 }}>Terminados: {terminados.length}</Tag>
                    </div>
                    {terminados.map((cohorte: any) => (
                      <CohorteCard key={cohorte.id} cohorte={cohorte} />
                    ))}
                  </div>
                )}
              </>
            ),
            style: { 
              marginBottom: 16, 
              background: '#fff', 
              borderRadius: 12,
              border: '1px solid #f0f0f0'
            }
          };
        })}
      />

      {programas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Text type="secondary">No se encontraron programas</Text>
        </div>
      )}
    </div>
  );
}