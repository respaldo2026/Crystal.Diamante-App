"use client";

import React, { useEffect, useState } from "react";
import { 
  Typography, Row, Col, Card, Button, 
  Modal, Form, Input, DatePicker, Avatar, List, Divider, Drawer, Switch, message, Spin, Select, InputNumber, Timeline, Alert, Space,
  Tabs, Tag, Tooltip, Statistic
} from "antd";
import { 
  UserOutlined, BookOutlined, TeamOutlined, PlusOutlined, ExclamationCircleOutlined, StarOutlined,
  WhatsAppOutlined, ClockCircleOutlined, DollarCircleOutlined, GiftOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";
import { formatDate } from "@utils/date";
import { EntregaMaterialModal } from "@components/EntregaMaterialModal";

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
  const [horasPendientesMap, setHorasPendientesMap] = useState<Record<string, number>>({});
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
  const [generandoPago, setGenerandoPago] = useState(false);

  // Entrega de materiales
  const [modalEntregaVisible, setModalEntregaVisible] = useState(false);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<any>(null);

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

  const refrescarHorasPendientes = async (profesorId: string) => {
    const { data: dataSesionesPend, error } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select("curso_id, horas_dictadas, estado_pago")
      .eq("profesor_id", profesorId)
      .eq("estado_pago", "pendiente");

    if (error) {
      console.error(error);
      return;
    }

    const mapHorasPend: Record<string, number> = {};
    (dataSesionesPend || []).forEach((s: any) => {
      const key = String(s.curso_id);
      mapHorasPend[key] = (mapHorasPend[key] || 0) + (s.horas_dictadas || 0);
    });
    setHorasPendientesMap(mapHorasPend);
  };

  const cargarDashboard = async () => {
    try {
        setLoading(true);
        
        // Obtener usuario actual
        const { data: { user }, error: userError } = await supabaseBrowserClient.auth.getUser();
        
        if (userError || !user) {
          messageApi.error("Debes iniciar sesión para ver tu oficina");
          window.location.href = "/login";
          return;
        }

        // Buscar perfil del usuario
        const { data: dataProf, error: errProf } = await supabaseBrowserClient
          .from("perfiles")
          .select("id, nombre_completo, email, telefono, rol, foto_url, identificacion, valor_hora")
          .eq("id", user.id)
          .maybeSingle();
        
        if (errProf) {
          messageApi.error("Error cargando perfil");
          return;
        }
        
        if (!dataProf) {
          messageApi.error("Perfil no encontrado");
          window.location.href = "/login";
          return;
        }

        // Verificar que sea profesor
        if (dataProf.rol !== "profesor") {
          messageApi.warning("Esta área es solo para profesores");
          // Redirigir según su rol
          if (dataProf.rol === "estudiante") {
            window.location.href = "/portal-estudiante";
          } else {
            window.location.href = "/";
          }
          return;
        }
        
        setIdProfesor(user.id);
        setProfesor(dataProf);

        // Cursos activos DEL PROFESOR
        const { data: dataCursos, error: errCursos } = await supabaseBrowserClient
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

        await refrescarHorasPendientes(user.id);

        // Historial de cursos DEL PROFESOR
        const { data: dataCursosHist } = await supabaseBrowserClient
          .from("cursos")
          .select("id, nombre, estado, fecha_inicio, fecha_fin")
          .eq("profesor_id", user.id)
          .order("fecha_inicio", { ascending: false });
        setHistorialCursos(dataCursosHist || []);

        // Pagos de nómina DEL PROFESOR
        const { data: dataPagos } = await supabaseBrowserClient
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
          
          // A) Estudiantes del curso (desde BD real)
          const { data: dataAlumnos, error: errAlumnos } = await supabaseBrowserClient
            .from("matriculas")
            .select(`id, estudiante_id, perfiles!matriculas_estudiante_id_fkey ( nombre_completo, telefono ), pagos!pagos_matricula_id_fkey ( fecha_pago )`)
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
          const { data: dataTemas, error: errTemas } = await supabaseBrowserClient
            .from("temas_curso")
            .select("*")
            .eq("curso_id", curso.id)
            .order("orden", { ascending: true });
            
          if (errTemas) throw errTemas;
          setTemasCurso(dataTemas || []);

          // C) BUSCAR ASISTENCIA PREVIA
          const fechaHoyStr = dayjs().format("YYYY-MM-DD");
          const { data: asistenciasHoy } = await supabaseBrowserClient
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
          const profesorIdSesion = cursoActivo?.profesor_id || idProfesor; // asegura que la sesión se asigne al profesor dueño del curso

          const registros = alumnosClase.map(alumno => ({
              matricula_id: alumno.id,
              fecha: fechaAsistencia.format("YYYY-MM-DD"),
              estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
              tema_id: temaSeleccionado,
              observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
          }));

          const { error: errAsis } = await supabaseBrowserClient
            .from("asistencias")
            .upsert(registros, { onConflict: 'matricula_id, fecha' });

          if (errAsis) throw errAsis;

          const temaTxt = temasCurso.find(t => t.id === temaSeleccionado)?.titulo || 'Tema del día';
          
          const { error: errSesion } = await supabaseBrowserClient
            .from("sesiones_clase")
            .upsert({
                curso_id: cursoActivo.id,
                profesor_id: profesorIdSesion,
                fecha: fechaAsistencia.format("YYYY-MM-DD"),
                horas_dictadas: horasARegistrar,
                tema_visto: temaTxt,
                estado_pago: 'pendiente'
            }, { onConflict: 'curso_id, profesor_id, fecha' });

          if (errSesion) throw errSesion;

          messageApi.success("✅ Clase y Horas registradas correctamente");
          setDrawerVisible(false);
          // refrescar horas pendientes del profesor dueño del curso
          if (profesorIdSesion) await refrescarHorasPendientes(profesorIdSesion);
      } catch (error: any) {
          messageApi.error("Error guardando: " + error.message);
      } finally {
          setGuardandoAsistencia(false);
      }
  };

  // Generar pago quincenal con separación por ciclo (1-15 y 16-30/31)
  const generarPagoQuincenal = async (ciclo?: 'primera' | 'segunda') => {
    if (!idProfesor) {
      messageApi.error("No hay profesor cargado");
      return;
    }

    try {
      setGenerandoPago(true);

      const hoy = dayjs();
      const anioMes = hoy.format('YYYY-MM');
      
      // Determinar automáticamente el ciclo si no se especifica
      let cicloAuto = ciclo;
      if (!cicloAuto) {
        cicloAuto = hoy.date() <= 15 ? 'primera' : 'segunda';
      }

      // Definir rangos de fecha según ciclo
      let fechaInicio, fechaFin;
      if (cicloAuto === 'primera') {
        fechaInicio = dayjs(`${anioMes}-01`).format('YYYY-MM-DD');
        fechaFin = dayjs(`${anioMes}-15`).format('YYYY-MM-DD');
      } else {
        fechaInicio = dayjs(`${anioMes}-16`).format('YYYY-MM-DD');
        fechaFin = dayjs(`${anioMes}`).endOf('month').format('YYYY-MM-DD');
      }

      // Traer SOLO sesiones del ciclo correspondiente
      const { data: sesionesPend, error } = await supabaseBrowserClient
        .from("sesiones_clase")
        .select("id, curso_id, horas_dictadas, fecha, tema_visto")
        .eq("profesor_id", idProfesor)
        .eq("estado_pago", "pendiente")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .order("fecha", { ascending: true });

      if (error) throw error;

      if (!sesionesPend || sesionesPend.length === 0) {
        messageApi.info(`No hay horas pendientes en la ${cicloAuto === 'primera' ? 'primera' : 'segunda'} quincena para pagar`);
        return;
      }

      const horasTotales = sesionesPend.reduce((sum: number, s: any) => sum + (s.horas_dictadas || 0), 0);
      const valorHora = Number(profesor?.valor_hora || 0);
      const monto = valorHora > 0 ? horasTotales * valorHora : 0;

      const cicloLabel = cicloAuto === 'primera' ? 'Primera quincena' : 'Segunda quincena';
      const detalleClases = sesionesPend.map((s: any) => `${s.fecha}: ${s.horas_dictadas}h (${s.tema_visto || 'Sin tema'})`).join('\n');

      // Insertar pago en pagos_nomina CON DETALLE DE SESIONES
      const { data: pagoIns, error: errPago } = await supabaseBrowserClient
        .from("pagos_nomina")
        .insert({
          profesor_id: idProfesor,
          fecha_pago: hoy.toISOString(),
          total_pagado: monto,
          total_horas: horasTotales,
          fecha_inicio_periodo: fechaInicio,
          fecha_fin_periodo: fechaFin,
          observaciones: `${cicloLabel} ${hoy.format('YYYY-MM')} - ${horasTotales} horas × $${Number(valorHora).toLocaleString()} = $${Number(monto).toLocaleString()}`
        })
        .select("id")
        .single();

      if (errPago) throw errPago;

      // Marcar sesiones del ciclo como pagadas
      const { error: errUpdate } = await supabaseBrowserClient
        .from("sesiones_clase")
        .update({ estado_pago: 'pagado', pago_nomina_id: pagoIns.data?.id })
        .eq("profesor_id", idProfesor)
        .eq("estado_pago", "pendiente")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin);

      if (errUpdate) throw errUpdate;

      messageApi.success(`✅ ${cicloLabel} pagada correctamente. ${horasTotales} horas × $${Number(valorHora).toLocaleString()} = $${Number(monto).toLocaleString()}`);

      // Limpiar horas pendientes de oficina (solo del ciclo pagado)
      const nuevasHoras = { ...horasPendientesMap };
      sesionesPend.forEach((s: any) => {
        nuevasHoras[s.curso_id] = Math.max(0, (nuevasHoras[s.curso_id] || 0) - (s.horas_dictadas || 0));
      });
      setHorasPendientesMap(nuevasHoras);

      // Refrescar pagos de nómina
      const { data: dataPagos } = await supabaseBrowserClient
        .from("pagos_nomina")
        .select("id, fecha_pago, total_pagado, total_horas, observaciones, fecha_inicio_periodo, fecha_fin_periodo")
        .eq("profesor_id", idProfesor)
        .order("fecha_pago", { ascending: false });
      setPagosNomina(dataPagos || []);

    } catch (error: any) {
      messageApi.error("Error generando pago: " + error.message);
    } finally {
      setGenerandoPago(false);
    }
  };

  const guardarTemaPensum = async () => {
      setGuardandoTema(true);
      try {
          const values = await formPensum.validateFields();
          const { error } = await supabaseBrowserClient.from("temas_curso").insert({
              ...values,
              curso_id: cursoActivo.id
          });

          if (error) throw error;

          messageApi.success("Tema agregado");
          formPensum.resetFields();
          setModalPensumVisible(false);
          
          const { data } = await supabaseBrowserClient.from("temas_curso").select("*").eq("curso_id", cursoActivo.id).order("orden");
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
          
          const { error } = await supabaseBrowserClient.from("calificaciones").insert({
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

            await supabaseBrowserClient.from("notificaciones").insert({
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

      {process.env.NODE_ENV === 'development' && (
        <Alert 
          message="🔧 MODO DESARROLLO - Datos de demostración" 
          description="Estás viendo la oficina del profesor con datos de prueba. Esto desaparece en producción."
          type="warning" 
          showIcon 
          closable
          style={{marginBottom: 20}}
        />
      )}
      
      {profesor && (
        <>
          {/* HEADER PROFESIONAL */}
          <Card 
            style={{
              marginBottom: 24, 
              background: 'linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)',
              border: 'none',
              color: 'white'
            }}
          >
            <Row align="middle" gutter={24}>
                <Col>
                  <Avatar 
                    size={80} 
                    style={{backgroundColor: '#FFF', color: '#5B21B6'}} 
                    icon={<UserOutlined />} 
                    src={profesor?.foto_url}
                  />
                </Col>
                <Col flex="auto">
                    <Title level={2} style={{margin: 0, color: 'white'}}>Bienvenido, {profesor.nombre_completo.split(' ')[0]}</Title>
                    <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 14}}>Gestor de Clases y Calificaciones</Text>
                </Col>
                <Col>
                  <Space direction="vertical" align="end" style={{color: 'white'}}>
                    <div><strong>Cédula:</strong> {profesor.identificacion}</div>
                    <div><strong>Email:</strong> {profesor.email}</div>
                    {profesor.telefono && (
                      <Button 
                        icon={<WhatsAppOutlined />} 
                        onClick={handleWhatsAppClick}
                        style={{marginTop: 8, backgroundColor: '#25D366', border: 'none', color: 'white'}}
                      >
                        WhatsApp
                      </Button>
                    )}
                  </Space>
                </Col>
            </Row>
          </Card>

          {/* ESTADÍSTICAS PRINCIPALES */}
          <Row gutter={[16, 16]} style={{marginBottom: 24}}>
            <Col xs={24} sm={12} lg={6}>
              <Card hoverable style={{textAlign: 'center', borderTop: '4px solid #5B21B6'}}>
                <Statistic 
                  title="Cursos Activos" 
                  value={misCursos.length}
                  valueStyle={{color: '#5B21B6', fontSize: 28}}
                  prefix={<BookOutlined style={{marginRight: 8}}/>}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card hoverable style={{textAlign: 'center', borderTop: '4px solid #059669'}}>
                <Statistic 
                  title="Total Estudiantes" 
                  value={misCursos.reduce((sum, c) => sum + (c.total_estudiantes || 0), 0)}
                  valueStyle={{color: '#059669', fontSize: 28}}
                  prefix={<TeamOutlined style={{marginRight: 8}}/>}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card hoverable style={{textAlign: 'center', borderTop: '4px solid #D97706'}}>
                <Statistic 
                  title="Horas Pendientes" 
                  value={Object.values(horasPendientesMap).reduce((a, b) => a + (b || 0), 0)}
                  valueStyle={{color: '#D97706', fontSize: 28}}
                  prefix={<ClockCircleOutlined style={{marginRight: 8}}/>}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card hoverable style={{textAlign: 'center', borderTop: '4px solid #DC2626'}}>
                <Statistic 
                  title="Pagos Pendientes" 
                  value={pagosNomina.filter(p => !p.fecha_pago).length}
                  valueStyle={{color: '#DC2626', fontSize: 28}}
                  prefix={<DollarCircleOutlined style={{marginRight: 8}}/>}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
      
      <Title level={3} style={{marginTop: 30, marginBottom: 20}}>📚 Mis Cursos Activos</Title>
      
      {misCursos.length === 0 ? (
        <Card style={{textAlign: 'center', padding: 40}}>
          <BookOutlined style={{fontSize: 48, color: '#999', marginBottom: 16}} />
          <p style={{color: '#999', fontSize: 16}}>No tienes cursos activos asignados.</p>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {misCursos.map((curso) => (
              <Col xs={24} md={12} lg={8} key={curso.id}>
                  <Card 
                    hoverable
                    style={{borderTop: '5px solid #5B21B6', height: '100%'}}
                    actions={[
                      <Button 
                        key="gestionar-clase" 
                        type="primary" 
                        block 
                        onClick={() => abrirGestionClase(curso)}
                      >
                        Gestionar Clase
                      </Button>
                    ]}
                  >
                    <Row gutter={16}>
                      <Col span={24}>
                        <Title level={5} style={{marginBottom: 8, color: '#5B21B6'}}>
                          {curso.nombre}
                        </Title>
                      </Col>
                      <Col xs={12}>
                        <div style={{marginBottom: 12}}>
                          <Text type="secondary" style={{fontSize: 12}}>ESTUDIANTES</Text>
                          <div style={{fontSize: 18, fontWeight: 'bold', color: '#059669'}}>
                            {curso.total_estudiantes || 0}
                          </div>
                        </div>
                      </Col>
                      <Col xs={12}>
                        <div style={{marginBottom: 12}}>
                          <Text type="secondary" style={{fontSize: 12}}>HORAS PENDIENTES</Text>
                          <div style={{fontSize: 18, fontWeight: 'bold', color: '#D97706'}}>
                            {horasPendientesMap[String(curso.id)] || 0}
                          </div>
                        </div>
                      </Col>
                      <Col span={24}>
                        <Space size="small">
                          {curso.estado === 'activo' && (
                            <Tag color="green">Activo</Tag>
                          )}
                          <Tag color="blue">{curso.estado}</Tag>
                        </Space>
                      </Col>
                    </Row>
                  </Card>
              </Col>
          ))}
        </Row>
      )}

      <Divider style={{margin: '32px 0'}} />

      <Card style={{background: 'linear-gradient(135deg, #f8f4ff 0%, #f3e8ff 100%)', border: 'none', marginBottom: 24}}>
        <Row align="middle" gutter={16}>
          <Col>
            <ClockCircleOutlined style={{fontSize: 24, color: '#7C3AED'}} />
          </Col>
          <Col flex="auto">
            <Title level={3} style={{margin: 0, color: '#5B21B6'}}>Horas Trabajadas por Curso</Title>
            <Text type="secondary" style={{fontSize: 13}}>Control de horas pendientes de pago por curso</Text>
          </Col>
          <Col>
            <Button
              type="primary"
              onClick={generarPagoQuincenal}
              loading={generandoPago}
              style={{backgroundColor: '#7C3AED', borderColor: '#7C3AED'}}
            >
              Generar Pago Quincenal
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {misCursos.map((curso) => {
          const horasTotalesCurso = horasPendientesMap[String(curso.id)] || 0;
          
          return (
            <Col xs={24} sm={12} lg={8} key={curso.id}>
              <Card hoverable style={{borderLeft: '4px solid #D97706', height: '100%'}}>
                <Title level={5} style={{marginBottom: 4, color: '#5B21B6'}}>{curso.nombre}</Title>
                <Text type="secondary" style={{fontSize: 12, color: '#6B7280'}}>Horas Pendientes</Text>
                <Statistic
                  value={horasTotalesCurso}
                  suffix="hrs"
                  valueStyle={{ color: '#D97706', fontSize: 28, fontWeight: 'bold' }}
                  style={{marginTop: 12}}
                />
                <Text type="secondary" style={{fontSize: 12, marginTop: 8, display: 'block'}}>
                  {horasTotalesCurso > 0 ? '✓ Pendiente de pago' : '✓ Al día'}
                </Text>
              </Card>
            </Col>
          );
        })}
        {misCursos.length === 0 && (
          <Col xs={24}>
            <Alert 
              message="Sin datos de horas" 
              type="info"
              icon={<ClockCircleOutlined />}
              style={{marginTop: 12}}
            />
          </Col>
        )}
      </Row>

      <Divider style={{margin: '32px 0'}} />

      <Card style={{background: 'linear-gradient(135deg, #f0fdf4 0%, #f0fef9 100%)', border: 'none', marginBottom: 24}}>
        <Row align="middle" gutter={16}>
          <Col>
            <DollarCircleOutlined style={{fontSize: 24, color: '#059669'}} />
          </Col>
          <Col flex="auto">
            <Title level={3} style={{margin: 0, color: '#047857'}}>Registro de Pagos</Title>
            <Text type="secondary" style={{fontSize: 13}}>Historial de nóminas procesadas</Text>
          </Col>
        </Row>
      </Card>

      {pagosNomina.length === 0 ? (
        <Alert 
          message="No tienes pagos registrados" 
          type="info"
          icon={<DollarCircleOutlined />}
          style={{marginBottom: 24}}
        />
      ) : (
        <Card style={{marginBottom: 24}}>
          <List
            itemLayout="horizontal"
            dataSource={pagosNomina}
            renderItem={(p: any) => (
              <List.Item style={{borderBottom: '1px solid #f0f0f0', padding: '16px 0'}}>
                <List.Item.Meta
                  avatar={
                    <div style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      color: 'white',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: 14
                    }}>
                      $
                    </div>
                  }
                  title={
                    <Row gutter={8}>
                      <Col>
                        <Text strong style={{fontSize: 15, color: '#059669'}}>
                          $ {Number(p.total_pagado || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}
                        </Text>
                      </Col>
                      <Col>
                        <Tag color="green">{p.total_horas || 0} horas</Tag>
                      </Col>
                    </Row>
                  }
                  description={
                    <Row gutter={16}>
                      <Col>
                        <Tag color="blue">
                          {dayjs(p.fecha_pago).format("DD/MMM/YYYY")}
                        </Tag>
                      </Col>
                      <Col>
                        <Text type="secondary" style={{fontSize: 12}}>
                          {p.observaciones || "Sin observaciones"}
                        </Text>
                      </Col>
                    </Row>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      <Divider style={{margin: '32px 0'}} />

      <Card style={{background: 'linear-gradient(135deg, #f3f0ff 0%, #fef3f2 100%)', border: 'none', marginBottom: 24}}>
        <Row align="middle" gutter={16}>
          <Col>
            <BookOutlined style={{fontSize: 24, color: '#dc2626'}} />
          </Col>
          <Col flex="auto">
            <Title level={3} style={{margin: 0, color: '#b91c1c'}}>Historial de Mis Grupos</Title>
            <Text type="secondary" style={{fontSize: 13}}>Todos los cursos asignados históricos</Text>
          </Col>
        </Row>
      </Card>

      {historialCursos.length === 0 ? (
        <Alert 
          message="Sin grupos registrados" 
          type="info"
          icon={<BookOutlined />}
          style={{marginBottom: 24}}
        />
      ) : (
        <Card style={{marginBottom: 24}}>
          <List
            itemLayout="horizontal"
            dataSource={historialCursos}
            renderItem={(c: any) => (
              <List.Item style={{borderBottom: '1px solid #f0f0f0', padding: '16px 0'}}>
                <List.Item.Meta
                  avatar={
                    <div style={{
                      background: c.estado === 'activo' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                             : c.estado === 'finalizado' ? 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)' 
                             : 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                      color: 'white',
                      width: 40,
                      height: 40,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      <BookOutlined style={{fontSize: 18}} />
                    </div>
                  }
                  title={
                    <Row gutter={12} align="middle">
                      <Col flex="auto">
                        <Text strong style={{fontSize: 14}}>
                          {c.nombre}
                        </Text>
                      </Col>
                      <Col>
                        <Tag color={
                          c.estado === 'activo' ? 'green' 
                          : c.estado === 'finalizado' ? 'default' 
                          : 'blue'
                        }>
                          {c.estado ? c.estado.toUpperCase() : 'SIN-ESTADO'}
                        </Tag>
                      </Col>
                    </Row>
                  }
                  description={
                    <Row gutter={8} style={{marginTop: 8}}>
                      <Col>
                        <Tag icon={<ClockCircleOutlined />}>
                          {c.fecha_inicio ? dayjs(c.fecha_inicio).format('DD/MMM/YY') : '-'}
                        </Tag>
                      </Col>
                      <Col>
                        <Text type="secondary">→</Text>
                      </Col>
                      <Col>
                        <Tag icon={<ClockCircleOutlined />}>
                          {c.fecha_fin ? dayjs(c.fecha_fin).format('DD/MMM/YY') : '-'}
                        </Tag>
                      </Col>
                    </Row>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

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
                              <Tooltip key={`whatsapp-${alumno?.id}`} title={alumno.perfiles.telefono ? "Contactar por WhatsApp" : "Sin teléfono registrado"}>
                                <Button
                                        type="text"
                                        shape="round"
                                        icon={<WhatsAppOutlined />}
                                        onClick={() => enviarWhatsapp(alumno.perfiles.telefono, `Hola ${alumno.perfiles.nombre_completo}, te contacto de parte de ${profesor?.nombre_completo}`)}
                                        disabled={!alumno.perfiles.telefono}
                                        style={{ color: '#25D366' }}
                                    >
                                    </Button>
                              </Tooltip>,
                              <Tooltip key={`entrega-${alumno?.id}`} title="Entregar camiseta o kit">
                                <Button
                                        type="default"
                                        shape="circle"
                                        icon={<GiftOutlined />}
                                        onClick={() => {
                                          setEstudianteSeleccionado({
                                            id: alumno.estudiante_id,
                                            nombre_completo: alumno.perfiles.nombre_completo
                                          });
                                          setModalEntregaVisible(true);
                                        }}
                                        style={{ color: '#722ed1', borderColor: '#722ed1' }}
                                    />
                              </Tooltip>,
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
            },
            {
                key: '4', label: '📄 Material Didáctico',
                children: (
                    <>
                        <Alert 
                          message="Aquí puedes subir material, notas de clase, ejercicios y recursos para tus estudiantes." 
                          type="info" 
                          style={{marginBottom: 20}}
                          showIcon
                        />
                        <div style={{textAlign: 'center', padding: '40px 20px', background: '#fafafa', borderRadius: 8, border: '2px dashed #d9d9d9'}}>
                            <p style={{color: '#999', marginBottom: 10}}>Material didáctico (próximamente)</p>
                            <p style={{color: '#999', fontSize: 12}}>Función en desarrollo para compartir archivos y recursos con estudiantes</p>
                        </div>
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

      {/* MODAL ENTREGA DE MATERIALES */}
      {estudianteSeleccionado && (
        <EntregaMaterialModal
          visible={modalEntregaVisible}
          onCancel={() => setModalEntregaVisible(false)}
          onSuccess={() => {
            messageApi.success("Material registrado correctamente");
          }}
          estudianteId={estudianteSeleccionado.id}
          estudianteNombre={estudianteSeleccionado.nombre_completo}
          profesorId={idProfesor || ''}
        />
      )}
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
