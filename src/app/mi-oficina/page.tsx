"use client";

import React, { useEffect, useState } from "react";
import { 
  Typography, Row, Col, Card, Button, 
  Modal, Form, Input, DatePicker, Avatar, List, Divider, Drawer, Switch, message, Spin, Select, InputNumber, Timeline, Alert, Space,
  Tabs, Tag, Tooltip
} from "antd";
import { 
  UserOutlined, BookOutlined, TeamOutlined, PlusOutlined, ExclamationCircleOutlined, StarOutlined,
  WhatsAppOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { createClient } from "@supabase/supabase-js";
import { enviarWhatsapp } from "@utils/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { Title, Text } = Typography;

export default function MiOficinaProfesor() {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [formPensum] = Form.useForm();
  const [formNotas] = Form.useForm();

  // ESTADOS GENERALES
  const [idProfesor, setIdProfesor] = useState<string | null>(null);
  const [profesor, setProfesor] = useState<any>(null);
  const [misCursos, setMisCursos] = useState<any[]>([]);
  const [historialCursos, setHistorialCursos] = useState<any[]>([]);
  const [pagosNomina, setPagosNomina] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // GESTIÓN CLASE (DRAWER)
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [cursoActivo, setCursoActivo] = useState<any>(null);
  const [alumnosClase, setAlumnosClase] = useState<any[]>([]);
  const [temasCurso, setTemasCurso] = useState<any[]>([]);
  const [temaSeleccionado, setTemaSeleccionado] = useState<string | null>(null);
  
  // Asistencia y Horas (NÓMINA)
  const [asistenciaMap, setAsistenciaMap] = useState<Record<string, boolean>>({});
  const [fechaAsistencia, setFechaAsistencia] = useState(dayjs());
  const [horaInicioclase, setHoraInicioClase] = useState<dayjs.Dayjs | null>(null);
  const [horaFinClase, setHoraFinClase] = useState<dayjs.Dayjs | null>(null);
  const [horasCalculadas, setHorasCalculadas] = useState<number>(0);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false);

  // Pensum
  const [modalPensumVisible, setModalPensumVisible] = useState(false);
  const [guardandoTema, setGuardandoTema] = useState(false);

  // Calificaciones
  const [modalNotasVisible, setModalNotasVisible] = useState(false);
  const [estudianteACalificar, setEstudianteACalificar] = useState<any>(null);
  const [guardandoNota, setGuardandoNota] = useState(false);

  // Efecto para calcular horas cuando la clase termina
  useEffect(() => {
    if (horaInicioclase && horaFinClase) {
      const duracion = horaFinClase.diff(horaInicioclase, 'hour', true);
      const horasRedondeadas = Math.round(duracion);
      setHorasCalculadas(Math.max(horasRedondeadas, 1));
    }
  }, [horaInicioclase, horaFinClase]);

  // CARGAR DATOS INICIALES
  useEffect(() => {
    cargarDashboard();
  }, []);

  const cargarDashboard = async () => {
    try {
        setLoading(true);
        
        // Obtener usuario actual
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          messageApi.error("Debes iniciar sesión para ver tu oficina");
          window.location.href = "/login";
          return;
        }

        // Buscar perfil del usuario
        const { data: dataProf, error: errProf } = await supabase
          .from("perfiles")
          .select("*")
          .eq("id", user.id)
          .eq("rol", "profesor")
          .single();
        
        if (errProf || !dataProf) {
          messageApi.error("No tienes permisos de profesor");
          return;
        }
        
        setIdProfesor(user.id);
        setProfesor(dataProf);

        // Cursos activos DEL PROFESOR
        const { data: dataCursos, error: errCursos } = await supabase
            .from("cursos")
            .select(`*, matriculas ( count )`)
            .eq("profesor_id", user.id)
            .eq("estado", "activo");
        
        if (errCursos) throw errCursos;

        const cursosFmt = dataCursos?.map((c: any) => ({
            ...c,
            total_estudiantes: c.matriculas?.[0]?.count || 0
        })) || [];

        setMisCursos(cursosFmt);

        // Historial de cursos DEL PROFESOR
        const { data: dataCursosHist } = await supabase
          .from("cursos")
          .select("id, nombre, estado, fecha_inicio, fecha_fin")
          .eq("profesor_id", user.id)
          .order("fecha_inicio", { ascending: false });
        setHistorialCursos(dataCursosHist || []);

        // Pagos de nómina DEL PROFESOR
        const { data: dataPagos } = await supabase
          .from("pagos_nomina")
          .select("id, fecha_pago, total_pagado, total_horas, observaciones")
          .eq("profesor_id", user.id)
          .order("fecha_pago", { ascending: false });
        setPagosNomina(dataPagos || []);
    } catch (error: any) {
        console.error("Error cargando dashboard:", error);
        messageApi.error("Error al cargar información");
    } finally {
        setLoading(false);
    }
  };

  const handleWhatsAppClick = () => {
    if (!profesor?.telefono) {
      messageApi.warning("No tienes teléfono registrado");
      return;
    }
    const mensaje = `Hola ${profesor.nombre_completo}, te contacto desde Academia Crystal.`;
    enviarWhatsapp(profesor.telefono, mensaje);
  };

  const verificarPagoAlDia = (fechaPagoVencimiento: string | null): boolean => {
    if (!fechaPagoVencimiento) return false;
    const hoy = dayjs();
    const fechaPago = dayjs(fechaPagoVencimiento);
    return fechaPago.isAfter(hoy) || fechaPago.isSame(hoy, 'day');
  };

  const abrirGestionClase = async (curso: any) => {
      try {
          messageApi.loading({ content: "Cargando aula...", key: "loadingAula" });
          setCursoActivo(curso);
          setAlumnosClase([]);
          setTemaSeleccionado(null);
          
          // A) Estudiantes del curso
          const { data: dataAlumnos, error: errAlumnos } = await supabase
            .from("matriculas")
            .select(`id, estudiante_id, perfiles ( nombre_completo, telefono ), pagos ( fecha_pago )`)
            .eq("curso_id", curso.id)
            .eq("estado", "activo");

          if (errAlumnos) throw errAlumnos;
          
          const alumnosConPago = (dataAlumnos || []).map((alumno: any) => {
              const fechaPagoReciente = alumno.pagos && alumno.pagos.length > 0
                ? alumno.pagos[0].fecha_pago
                : null;
              
              return {
                  ...alumno,
                  pagado: verificarPagoAlDia(fechaPagoReciente)
              };
          });
          
          setAlumnosClase(alumnosConPago);
          
          // B) Temas
          const { data: dataTemas, error: errTemas } = await supabase
            .from("temas_curso")
            .select("*")
            .eq("curso_id", curso.id)
            .order("orden", { ascending: true });
            
          if (errTemas) throw errTemas;
          setTemasCurso(dataTemas || []);

          // C) BUSCAR ASISTENCIA PREVIA
          const fechaHoyStr = dayjs().format("YYYY-MM-DD");
          const { data: asistenciasHoy } = await supabase
              .from("asistencias")
              .select("matricula_id, estado, tema_id")
              .eq("fecha", fechaHoyStr)
              .in("matricula_id", alumnosConPago?.map((a: any) => a.id) || []);

          const mapa: any = {};
          
          if (asistenciasHoy && asistenciasHoy.length > 0) {
              asistenciasHoy.forEach((asist: any) => {
                  mapa[asist.matricula_id] = asist.estado === 'presente';
              });
              if(asistenciasHoy[0].tema_id) setTemaSeleccionado(asistenciasHoy[0].tema_id);
              messageApi.success({ content: "Datos cargados", key: "loadingAula" });
          } else {
              alumnosConPago?.forEach((a: any) => mapa[a.id] = true);
              messageApi.success({ content: "Aula lista", key: "loadingAula" });
          }
          
          setAsistenciaMap(mapa);
          setHoraInicioClase(dayjs());
          setHoraFinClase(null);
          setHorasCalculadas(0);
          setDrawerVisible(true);
      } catch (error: any) {
          messageApi.error({ content: "Error: " + error.message, key: "loadingAula" });
      }
  };

  const confirmarGuardado = () => {
      if(!temaSeleccionado) {
          messageApi.warning("⚠️ Selecciona el tema enseñado hoy.");
          return;
      }

      if(!horaInicioclase) {
          messageApi.warning("⚠️ No se registró la hora de inicio.");
          return;
      }

      const horaFin = dayjs();
      const duracion = horaFin.diff(horaInicioclase, 'hour', true);
      const horasRedondeadas = Math.round(duracion);
      const horasFinal = Math.max(horasRedondeadas, 1);

      modal.confirm({
          title: '¿Registrar Clase?',
          icon: <ExclamationCircleOutlined />,
          content: (
              <div>
                  <p>Hora inicio: <b>{horaInicioclase.format('h:mm A')}</b></p>
                  <p>Hora fin: <b>{horaFin.format('h:mm A')}</b></p>
                  <p>Se guardará la asistencia de los alumnos.</p>
                  <p>Horas a pagar: <b>{horasFinal} {horasFinal === 1 ? 'hora' : 'horas'}</b></p>
              </div>
          ),
          okText: 'Confirmar y Guardar',
          cancelText: 'Cancelar',
          onOk: () => ejecutarGuardadoReal(horasFinal)
      });
  };

  const ejecutarGuardadoReal = async (horasARegistrar: number) => {
      setGuardandoAsistencia(true);
      try {
          const registros = alumnosClase.map(alumno => ({
              matricula_id: alumno.id,
              fecha: fechaAsistencia.format("YYYY-MM-DD"),
              estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
              tema_id: temaSeleccionado,
              observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
          }));

          const { error: errAsis } = await supabase
            .from("asistencias")
            .upsert(registros, { onConflict: 'matricula_id, fecha' });

          if (errAsis) throw errAsis;

          const temaTxt = temasCurso.find(t => t.id === temaSeleccionado)?.titulo || 'Tema del día';
          
          const { error: errSesion } = await supabase
            .from("sesiones_clase")
            .upsert({
                curso_id: cursoActivo.id,
                profesor_id: idProfesor,
                fecha: fechaAsistencia.format("YYYY-MM-DD"),
                horas_dictadas: horasARegistrar,
                tema_visto: temaTxt,
                estado_pago: 'pendiente'
            }, { onConflict: 'curso_id, profesor_id, fecha' });

          if (errSesion) throw errSesion;

          messageApi.success("✅ Clase y Horas registradas correctamente");
          setDrawerVisible(false);
      } catch (error: any) {
          messageApi.error("Error guardando: " + error.message);
      } finally {
          setGuardandoAsistencia(false);
      }
  };

  const guardarTemaPensum = async () => {
      setGuardandoTema(true);
      try {
          const values = await formPensum.validateFields();
          const { error } = await supabase.from("temas_curso").insert({
              ...values,
              curso_id: cursoActivo.id
          });

          if (error) throw error;

          messageApi.success("Tema agregado");
          formPensum.resetFields();
          setModalPensumVisible(false);
          
          const { data } = await supabase.from("temas_curso").select("*").eq("curso_id", cursoActivo.id).order("orden");
          setTemasCurso(data || []);

      } catch (error: any) {
          messageApi.error("Error: " + error.message);
      } finally {
          setGuardandoTema(false);
      }
  };

  const abrirCalificar = (alumno: any) => {
      setEstudianteACalificar(alumno);
      formNotas.resetFields();
      setModalNotasVisible(true);
  };

  const guardarNota = async () => {
      setGuardandoNota(true);
      try {
          const values = await formNotas.validateFields();
          
          const { error } = await supabase.from("calificaciones").insert({
             matricula_id: estudianteACalificar.id,
             concepto: values.concepto,
             nota: values.nota,
             observaciones: values.observaciones
          });

          if (error) throw error;

          if (values.nota < 70) {
            const nombre = estudianteACalificar?.perfiles?.nombre_completo || "Estudiante";
            const telefono = estudianteACalificar?.perfiles?.telefono;
            const cursoNombre = cursoActivo?.nombre || "tu curso";
            const mensaje = `Hola ${nombre}, obtuviste ${values.nota} en ${cursoNombre}. Por favor revisa el tema y coordina con tu profesor.`;

            if (telefono) {
              enviarWhatsapp(telefono, mensaje);
            }

            await supabase.from("notificaciones").insert({
              user_id: estudianteACalificar.estudiante_id,
              titulo: "Nota baja registrada",
              mensaje,
              tipo: "calificacion",
              leido: false,
            });
          }

          messageApi.success(`Nota guardada para ${estudianteACalificar.perfiles.nombre_completo}`);
          setModalNotasVisible(false);
          formNotas.resetFields();

      } catch (error: any) {
          messageApi.error("Error al guardar nota: " + error.message);
      } finally {
          setGuardandoNota(false);
      }
  };

  if (loading) return (
      <div style={{ padding: 50, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 15, color: '#888' }}>Cargando Mi Oficina...</div>
      </div>
  );

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}
      {modalContextHolder}
      
      {profesor && (
        <Card style={{marginBottom: 20, borderLeft: '5px solid #722ed1'}}>
            <Row align="middle" gutter={16}>
                <Col>
                  <Avatar 
                    size={64} 
                    style={{backgroundColor: '#87d068'}} 
                    icon={<UserOutlined />} 
                    src={profesor?.foto_url}
                  />
                </Col>
                <Col flex="1">
                    <Title level={4} style={{margin:0}}>{profesor.nombre_completo}</Title>
                    <Text type="secondary">Mi Oficina Virtual</Text>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {profesor.telefono && (
                          <Button
                            type="primary"
                            icon={<WhatsAppOutlined />}
                            onClick={handleWhatsAppClick}
                            style={{
                              backgroundColor: "#25D366",
                              borderColor: "#25D366",
                            }}
                            size="small"
                          >
                            WhatsApp
                          </Button>
                        )}
                    </div>
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
                  actions={[<Button key="gestionar-clase" type="primary" block onClick={() => abrirGestionClase(curso)}>Gestionar Clase</Button>]}
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

      <Divider />

      <Title level={4}>💼 Mis Pagos</Title>
      <List
        itemLayout="horizontal"
        dataSource={pagosNomina}
        locale={{ emptyText: "Sin pagos registrados" }}
        renderItem={(p: any) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  <Tag color="blue">{dayjs(p.fecha_pago).format("DD MMM YYYY")}</Tag>
                  <Text strong>$ {Number(p.total_pagado || 0).toLocaleString()}</Text>
                </Space>
              }
              description={
                <Space>
                  <Tag color="purple">{p.total_horas || 0} horas</Tag>
                  <Text type="secondary">{p.observaciones || "Sin observaciones"}</Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />

      <Divider />

      <Title level={4}>📚 Historial de Mis Grupos</Title>
      <List
        itemLayout="horizontal"
        dataSource={historialCursos}
        locale={{ emptyText: "Sin grupos registrados" }}
        renderItem={(c: any) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{c.nombre}</Text>
                  <Tag color={c.estado === 'activo' ? 'green' : c.estado === 'finalizado' ? 'volcano' : 'default'}>
                    {c.estado || 'sin-estado'}
                  </Tag>
                </Space>
              }
              description={
                <Space>
                  <Tag>{c.fecha_inicio ? dayjs(c.fecha_inicio).format('DD/MM/YYYY') : '-'}</Tag>
                  <span>→</span>
                  <Tag>{c.fecha_fin ? dayjs(c.fecha_fin).format('DD/MM/YYYY') : '-'}</Tag>
                </Space>
              }
            />
          </List.Item>
        )}
      />

      {/* DRAWER GESTIÓN DE CLASE */}
      <Drawer
        title={`Clase: ${cursoActivo?.nombre}`}
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        maskClosable={false}
        extra={
            <Button type="primary" onClick={confirmarGuardado} loading={guardandoAsistencia}>
                Guardar Asistencia
            </Button>
        }
      >
        <Tabs defaultActiveKey="1" items={[
            {
                key: '1', label: '📝 Tomar Lista',
                children: (
                    <>
                        <Card variant="borderless" style={{background: '#f0f2f5', marginBottom: 20}}>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <label>Fecha Clase:</label>
                                    <DatePicker style={{width:'100%'}} value={fechaAsistencia} onChange={val => setFechaAsistencia(val || dayjs())} allowClear={false}/>
                                </Col>
                                <Col span={12}>
                                    <label>Horas Dictadas:</label>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <InputNumber 
                                            min={1} 
                                            max={8} 
                                            value={horasCalculadas} 
                                            disabled
                                            style={{ width: '85%' }} 
                                        />
                                        <Button disabled style={{ width: '15%' }}>Hrs</Button>
                                    </Space.Compact>
                                    <p style={{fontSize: '12px', color: '#999', marginTop: 5}}>
                                        {horaInicioclase && `Inicio: ${horaInicioclase.format('h:mm A')}`}
                                    </p>
                                </Col>
                            </Row>
                            <Row style={{marginTop: 10}}>
                                <Col span={24}>
                                    <label>Tema de hoy:</label>
                                    <Select 
                                        style={{width:'100%'}} 
                                        placeholder="Selecciona tema..."
                                        value={temaSeleccionado}
                                        onChange={setTemaSeleccionado}
                                        options={temasCurso.map(t => ({label: `${t.orden}. ${t.titulo}`, value: t.id}))}
                                        popupRender={(menu) => (
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
                            renderItem={(alumno: any) => {
                              const pagado = alumno.pagado;
                              return (
                            <List.Item key={alumno?.id} actions={[
                              <Tooltip key={`asistencia-${alumno?.id}`} title={!pagado ? "Estudiante sin pagos al día" : ""}>
                                <Switch
                                        checkedChildren="Vino" 
                                        unCheckedChildren="Faltó"
                                        checked={asistenciaMap[alumno.id]}
                                        onChange={(val) => setAsistenciaMap({...asistenciaMap, [alumno.id]: val})}
                                        disabled={!pagado}
                                        style={{ backgroundColor: asistenciaMap[alumno.id] ? '#52c41a' : '#ff4d4f' }}
                                    />
                              </Tooltip>
                                ]}>
                                    <List.Item.Meta
                                        avatar={<Avatar>{alumno.perfiles.nombre_completo[0]}</Avatar>}
                                        title={alumno.perfiles.nombre_completo}
                                        description={
                                            <Space>
                                                {asistenciaMap[alumno.id] ? <Tag color="green">Presente</Tag> : <Tag color="red">Ausente</Tag>}
                                                {pagado ? <Tag color="success">Pagado</Tag> : <Tag color="error">Sin Pagar</Tag>}
                                            </Space>
                                        }
                                    />
                                </List.Item>
                            );
                            }}
                        />
                    </>
                )
            },
            {
                key: '2', label: '⭐ Calificar',
                children: (
                    <div>
                        <Alert message="Selecciona un estudiante para asignar una nota." type="info" style={{marginBottom: 15}} />
                        <List
                            itemLayout="horizontal"
                            dataSource={alumnosClase}
                            renderItem={(alumno: any) => {
                              const pagado = alumno.pagado;
                              return (
                            <List.Item key={alumno?.id} actions={[
                              <Tooltip key={`calificar-${alumno?.id}`} title={!pagado ? "Debe estar al día en pagos para calificar" : ""}>
                                <Button
                                        type="dashed" 
                                        shape="round" 
                                        icon={<StarOutlined />} 
                                        onClick={() => abrirCalificar(alumno)}
                                        disabled={!pagado}
                                    >
                                        Calificar
                                    </Button>
                              </Tooltip>
                                ]}>
                                    <List.Item.Meta
                                        avatar={<Avatar style={{backgroundColor: '#faad14'}}>{alumno.perfiles.nombre_completo[0]}</Avatar>}
                                        title={alumno.perfiles.nombre_completo}
                                        description={
                                            <Space>
                                                <span>Gestionar notas</span>
                                                {pagado ? <Tag color="success">Pagado</Tag> : <Tag color="error">Sin Pagar</Tag>}
                                            </Space>
                                        }
                                    />
                                </List.Item>
                            );
                            }}
                        />
                    </div>
                )
            },
            {
                key: '3', label: '📚 Ver Pensum',
                children: (
                    <>
                        <Button type="dashed" icon={<PlusOutlined />} block onClick={() => setModalPensumVisible(true)} style={{marginBottom: 20}}>
                            Agregar Tema al Pensum
                        </Button>
                        <Timeline items={temasCurso.map(t => ({ key: t?.id, children: <b>{t.titulo}</b>, color: 'blue' }))} />
                    </>
                )
            }
        ]} />
      </Drawer>

      {/* MODAL NUEVO TEMA PENSUM */}
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

      {/* MODAL CALIFICAR */}
      <Modal
        title={<span><StarOutlined /> Calificar a {estudianteACalificar?.perfiles.nombre_completo}</span>}
        open={modalNotasVisible}
        onOk={guardarNota}
        confirmLoading={guardandoNota}
        onCancel={() => setModalNotasVisible(false)}
        okText="Guardar Nota"
      >
          <Form form={formNotas} layout="vertical">
              <Row gutter={16}>
                  <Col span={16}>
                      <Form.Item 
                        name="concepto" 
                        label="Actividad o Evaluación" 
                        rules={[{required:true, message: 'Indica qué estás calificando'}]}
                      >
                          <Input placeholder="Ej: Examen Teórico, Práctica Gel..." />
                      </Form.Item>
                  </Col>
                  <Col span={8}>
                      <Form.Item 
                        name="nota" 
                        label="Nota (0-5)" 
                        rules={[{required:true, message: 'Falta la nota'}]}
                      >
                          <InputNumber min={0} max={5} step={0.1} style={{width: '100%'}} />
                      </Form.Item>
                  </Col>
              </Row>
              <Form.Item name="observaciones" label="Observaciones (Opcional)">
                  <Input.TextArea rows={2} placeholder="Comentarios sobre el desempeño..." />
              </Form.Item>
          </Form>
      </Modal>
    </div>
  );
}
