"use client";

import React, { useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { 
  Typography, Tag, Tabs, Row, Col, Card, Button, 
  Modal, Form, Input, DatePicker, Avatar, List, Divider, Drawer, Switch, message, Spin, Select, InputNumber, Timeline, Alert
} from "antd";
import { 
  UserOutlined, BookOutlined, TeamOutlined, PlusOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useParams } from "next/navigation"; 
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { Title, Text } = Typography;

export default function ShowProfesorDashboard() {
  const params = useParams();
  const idProfesor = params?.id as string;

  // ESTADOS
  const [profesor, setProfesor] = useState<any>(null);
  const [misCursos, setMisCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // GESTIÓN CLASE (DRAWER)
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [cursoActivo, setCursoActivo] = useState<any>(null);
  const [alumnosClase, setAlumnosClase] = useState<any[]>([]);
  const [temasCurso, setTemasCurso] = useState<any[]>([]);
  const [temaSeleccionado, setTemaSeleccionado] = useState<string | null>(null);
  
  const [asistenciaMap, setAsistenciaMap] = useState<Record<string, boolean>>({});
  const [fechaAsistencia, setFechaAsistencia] = useState(dayjs());
  
  // ESTADOS DE CARGA PARA BOTONES (Anti-Freeze)
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false);
  const [guardandoTema, setGuardandoTema] = useState(false);

  // MODAL PENSUM
  const [modalPensumVisible, setModalPensumVisible] = useState(false);
  const [formPensum] = Form.useForm();

  // 1. CARGAR DATOS
  useEffect(() => {
    if (idProfesor) cargarDashboard();
  }, [idProfesor]);

  const cargarDashboard = async () => {
    try {
        setLoading(true);
        // Perfil
        const { data: dataProf, error: errProf } = await supabase.from("perfiles").select("*").eq("id", idProfesor).single();
        if (errProf) throw errProf;
        setProfesor(dataProf);

        // Cursos
        const { data: dataCursos, error: errCursos } = await supabase
            .from("cursos")
            .select(`*, matriculas ( count )`)
            .eq("profesor_id", idProfesor)
            .eq("estado", "activo");
        
        if (errCursos) throw errCursos;

        const cursosFmt = dataCursos?.map((c: any) => ({
            ...c,
            total_estudiantes: c.matriculas?.[0]?.count || 0
        })) || [];

        setMisCursos(cursosFmt);
    } catch (error: any) {
        console.error("Error cargando dashboard:", error);
        message.error("Error cargando datos: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  // 2. ABRIR GESTIÓN DE CLASE
  const abrirGestionClase = async (curso: any) => {
      try {
          message.loading({ content: "Cargando aula...", key: "loadingAula" });
          setCursoActivo(curso);
          setAlumnosClase([]);
          setTemaSeleccionado(null);
          
          // A) Estudiantes
          const { data: dataAlumnos, error: errAlumnos } = await supabase
            .from("matriculas")
            .select(`id, estudiante_id, perfiles ( nombre_completo )`)
            .eq("curso_id", curso.id)
            .eq("estado", "activo");

          if (errAlumnos) throw errAlumnos;
          
          setAlumnosClase(dataAlumnos || []);
          
          // B) Temas
          const { data: dataTemas, error: errTemas } = await supabase
            .from("temas_curso")
            .select("*")
            .eq("curso_id", curso.id)
            .order("orden", { ascending: true });
            
          if (errTemas) throw errTemas;

          setTemasCurso(dataTemas || []);

          // Pre-llenar asistencia
          const mapa: any = {};
          dataAlumnos?.forEach((a: any) => mapa[a.id] = true);
          setAsistenciaMap(mapa);

          setDrawerVisible(true);
          message.success({ content: "Aula lista", key: "loadingAula" });
      } catch (error: any) {
          message.error({ content: "Error al abrir clase: " + error.message, key: "loadingAula" });
      }
  };

  // 3. GUARDAR ASISTENCIA
  const guardarAsistencia = async () => {
      if(!temaSeleccionado) {
          message.warning("⚠️ Selecciona el tema visto hoy.");
          return;
      }
      
      setGuardandoAsistencia(true);
      try {
          const registros = alumnosClase.map(alumno => ({
              matricula_id: alumno.id, // Esto debe ser un número (BigInt)
              fecha: fechaAsistencia.format("YYYY-MM-DD"),
              estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
              tema_id: temaSeleccionado, // UUID del tema
              observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
          }));

          const { error } = await supabase.from("asistencias").insert(registros);

          if (error) throw error;

          message.success("✅ Asistencia registrada");
          setDrawerVisible(false);
      } catch (error: any) {
          if (error.message.includes("unique")) message.warning("Ya registraste este tema hoy.");
          else message.error("Error guardando: " + error.message);
      } finally {
          setGuardandoAsistencia(false);
      }
  };

  // 4. GUARDAR TEMA
  const guardarTemaPensum = async () => {
      setGuardandoTema(true);
      try {
          const values = await formPensum.validateFields();
          const { error } = await supabase.from("temas_curso").insert({
              ...values,
              curso_id: cursoActivo.id // Número (BigInt)
          });

          if (error) throw error;

          message.success("Tema agregado");
          formPensum.resetFields();
          setModalPensumVisible(false);
          
          // Recargar temas sin cerrar todo
          const { data } = await supabase.from("temas_curso").select("*").eq("curso_id", cursoActivo.id).order("orden");
          setTemasCurso(data || []);

      } catch (error: any) {
          message.error("Error al crear tema: " + error.message);
      } finally {
          setGuardandoTema(false);
      }
  };

  if (loading) return <div style={{padding: 50, textAlign:'center'}}><Spin size="large" tip="Cargando Oficina Virtual..."/></div>;

  return (
    <Show title="Oficina Virtual" headerButtons={() => <Button href="/profesores">Volver</Button>}>
      
      {/* HEADER */}
      {profesor && (
        <Card style={{marginBottom: 20, borderLeft: '5px solid #722ed1'}}>
            <Row align="middle" gutter={16}>
                <Col><Avatar size={64} style={{backgroundColor: '#87d068'}} icon={<UserOutlined />} /></Col>
                <Col>
                    <Title level={4} style={{margin:0}}>{profesor.nombre_completo}</Title>
                    <Text type="secondary">Panel Docente</Text>
                </Col>
            </Row>
        </Card>
      )}

      <Title level={4}><BookOutlined /> Mis Cursos</Title>
      
      <Row gutter={[16, 16]}>
        {misCursos.map((curso) => (
            <Col xs={24} md={12} lg={8} key={curso.id}>
                <Card 
                    hoverable
                    actions={[<Button type="primary" block onClick={() => abrirGestionClase(curso)}>Gestionar Clase</Button>]}
                >
                    <Card.Meta 
                        avatar={<Avatar style={{backgroundColor: '#722ed1'}} icon={<BookOutlined />} />}
                        title={curso.nombre}
                        description={<span><TeamOutlined /> {curso.total_estudiantes} Alumnos</span>}
                    />
                </Card>
            </Col>
        ))}
        {misCursos.length === 0 && <Alert message="No tienes cursos activos asignados." type="info" />}
      </Row>

      {/* DRAWER CLASE */}
      <Drawer
        title={`Clase: ${cursoActivo?.nombre}`}
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        maskClosable={false} // Evita cierres accidentales
        extra={<Button type="primary" onClick={guardarAsistencia} loading={guardandoAsistencia}>Guardar Clase</Button>}
      >
        <Tabs defaultActiveKey="1" items={[
            {
                key: '1', label: '📝 Tomar Lista',
                children: (
                    <>
                        <Card variant="borderless" style={{background: '#f0f2f5', marginBottom: 20}}>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <label>Fecha:</label>
                                    <DatePicker style={{width:'100%'}} value={fechaAsistencia} onChange={val => setFechaAsistencia(val || dayjs())} allowClear={false}/>
                                </Col>
                                <Col span={12}>
                                    <label>Tema de hoy:</label>
                                    <Select 
                                        style={{width:'100%'}} 
                                        placeholder="Selecciona tema..."
                                        value={temaSeleccionado}
                                        onChange={setTemaSeleccionado}
                                        options={temasCurso.map(t => ({label: `${t.orden}. ${t.titulo}`, value: t.id}))}
                                        dropdownRender={(menu) => (
                                            <>
                                                {menu}
                                                <Divider style={{ margin: '8px 0' }} />
                                                <Button type="text" icon={<PlusOutlined />} block onClick={() => setModalPensumVisible(true)}>
                                                    + Nuevo Tema
                                                </Button>
                                            </>
                                        )}
                                    />
                                </Col>
                            </Row>
                        </Card>

                        <List
                            itemLayout="horizontal"
                            dataSource={alumnosClase}
                            renderItem={(alumno: any) => (
                                <List.Item actions={[
                                    <Switch 
                                        checkedChildren="Vino" 
                                        unCheckedChildren="Faltó"
                                        checked={asistenciaMap[alumno.id]}
                                        onChange={(val) => setAsistenciaMap({...asistenciaMap, [alumno.id]: val})}
                                        style={{ backgroundColor: asistenciaMap[alumno.id] ? '#52c41a' : '#ff4d4f' }}
                                    />
                                ]}>
                                    <List.Item.Meta
                                        avatar={<Avatar>{alumno.perfiles.nombre_completo[0]}</Avatar>}
                                        title={alumno.perfiles.nombre_completo}
                                        description={asistenciaMap[alumno.id] ? <Tag color="green">Presente</Tag> : <Tag color="red">Ausente</Tag>}
                                    />
                                </List.Item>
                            )}
                        />
                        {alumnosClase.length === 0 && <p>No hay alumnos matriculados.</p>}
                    </>
                )
            },
            {
                key: '2', label: '📚 Ver Pensum',
                children: (
                    <>
                        <Button type="dashed" icon={<PlusOutlined />} block onClick={() => setModalPensumVisible(true)} style={{marginBottom: 20}}>
                            Agregar Tema al Pensum
                        </Button>
                        <Timeline items={temasCurso.map(t => ({ children: <b>{t.titulo}</b>, color: 'blue' }))} />
                    </>
                )
            }
        ]} />
      </Drawer>

      {/* MODAL NUEVO TEMA */}
      <Modal
        title="Nuevo Tema en el Pensum"
        open={modalPensumVisible}
        onOk={guardarTemaPensum}
        confirmLoading={guardandoTema}
        onCancel={() => setModalPensumVisible(false)}
      >
          <Form form={formPensum} layout="vertical">
              <Row gutter={16}>
                  <Col span={6}>
                      <Form.Item name="orden" label="Nº" initialValue={(temasCurso.length || 0) + 1}>
                          <InputNumber style={{width:'100%'}} />
                      </Form.Item>
                  </Col>
                  <Col span={18}>
                      <Form.Item name="titulo" label="Título" rules={[{required:true}]}>
                          <Input placeholder="Ej: Manicure Ruso" />
                      </Form.Item>
                  </Col>
              </Row>
              <Form.Item name="descripcion" label="Descripción">
                  <Input.TextArea rows={2} />
              </Form.Item>
          </Form>
      </Modal>

    </Show>
  );
}