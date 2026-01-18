"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Typography, Row, Col, Card, Button, 
  Modal, Form, Input, DatePicker, Avatar, List, Divider, Drawer, Switch, message, Spin, Select, InputNumber, Timeline, Alert, Space,
  Tabs, Tag, Tooltip, Statistic, Collapse, Empty
} from "antd";
import { 
  UserOutlined, BookOutlined, TeamOutlined, PlusOutlined, ExclamationCircleOutlined, StarOutlined,
  WhatsAppOutlined, ClockCircleOutlined, DollarCircleOutlined, GiftOutlined,
  FileTextOutlined, VideoCameraOutlined, FilePdfOutlined, DownloadOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";
import { formatDate } from "@utils/date";
import { EntregaMaterialModal } from "@components/EntregaMaterialModal";

const { Title, Text } = Typography;
const { Panel } = Collapse;

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
  const [pensum, setPensum] = useState<any[]>([]);
  const [temasVistos, setTemasVistos] = useState<Set<string>>(new Set());
  const [materiales, setMateriales] = useState<any[]>([]);
  const [entregasMap, setEntregasMap] = useState<Record<string, any[]>>({});
  
  // Asistencia y Horas (NÓMINA)
  const [asistenciaMap, setAsistenciaMap] = useState<Record<string, boolean>>({});
  const [fechaAsistencia, setFechaAsistencia] = useState(dayjs());
  const [horaInicioclase, setHoraInicioClase] = useState<dayjs.Dayjs | null>(null);
  const [horaFinClase, setHoraFinClase] = useState<dayjs.Dayjs | null>(null);
  const [horasCalculadas, setHorasCalculadas] = useState<number>(0);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false);

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

  // CALCULAR OPCIONES DE TEMAS (Memoizado para actualización inmediata)
  const opcionesTemas = useMemo(() => {
    const opciones: any[] = [];

    // 1. Temas Manuales del Curso (si existen)
    if (temasCurso.length > 0) {
        opciones.push({
            label: <span style={{fontWeight: 'bold', color: '#1890ff'}}>Temas Específicos</span>,
            options: temasCurso.map(t => {
                const visto = temasVistos.has(String(t.id));
                const titulo = t.titulo || "Sin título";
                return {
                    label: visto ? <span style={{color: '#999', fontStyle: 'italic'}}>✓ {t.orden ? `${t.orden}. ` : ''}{titulo} (Visto)</span> : `${t.orden ? `${t.orden}. ` : ''}${titulo}`,
                    value: t.id,
                    disabled: visto,
                    key: `tema-${t.id}`
                };
            })
        });
    }

    // 2. Temas del Pensum (Agrupados por Ciclo)
    pensum.forEach(ciclo => {
        if (ciclo.pensum_cursos && ciclo.pensum_cursos.length > 0) {
            opciones.push({
                label: <span style={{fontWeight: 'bold', color: '#722ed1'}}>{ciclo.nombre_ciclo}</span>,
                options: ciclo.pensum_cursos.map((pc: any) => {
                    const visto = temasVistos.has(String(pc.id));
                    const nombre = pc.nombre_curso || "Sin nombre";
                    return {
                        label: visto ? <span style={{color: '#999', fontStyle: 'italic'}}>✓ {nombre} (Visto)</span> : nombre,
                        value: pc.id,
                        disabled: visto,
                        key: `pensum-${pc.id}`
                    };
                })
            });
        }
    });

    return opciones;
  }, [temasCurso, temasVistos, pensum]);

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
            .select(`*, matriculas ( estado )`)
            .eq("profesor_id", user.id)
            .eq("estado", "activo");
        
        if (errCursos) throw errCursos;

        const cursosFmt = dataCursos?.map((c: any) => ({
            ...c,
            total_estudiantes: c.matriculas?.filter((m: any) => m.estado === 'activo').length || 0
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
          
          // A.1) Cargar historial de entregas de materiales para visualización rápida
          if (alumnosConPago.length > 0) {
            const ids = alumnosConPago.map(a => a.estudiante_id);
            const { data: entregasData } = await supabaseBrowserClient
                .from("entregas_materiales")
                .select("estudiante_id, tipo_material, created_at")
                .in("estudiante_id", ids);
            
            const eMap: Record<string, any[]> = {};
            entregasData?.forEach((e: any) => {
                if (!eMap[e.estudiante_id]) eMap[e.estudiante_id] = [];
                eMap[e.estudiante_id].push(e);
            });
            setEntregasMap(eMap);
          }

          // B) Temas
          const { data: dataTemas, error: errTemas } = await supabaseBrowserClient
            .from("temas_curso")
            .select("*")
            .eq("curso_id", curso.id)
            .order("orden", { ascending: true });
            
          if (errTemas) throw errTemas;
          setTemasCurso(dataTemas || []);

          // C) Cargar temas ya vistos y asistencia (se mueve a función reutilizable)
          // Se llamará al final con la fecha actual

          // D) Pensum y Materiales del Programa (Igual al portal estudiante)
          if (curso.programa_id) {
             const { data: pData } = await supabaseBrowserClient
                .from("pensum")
                .select(`*, pensum_cursos (*)`)
                .eq("programa_id", curso.programa_id)
                .eq("activo", true)
                .order("numero_ciclo", { ascending: true });
             setPensum(pData || []);

             const { data: mData } = await supabaseBrowserClient
                .from("material_didactico")
                .select("*")
                .eq("programa_id", curso.programa_id)
                .eq("visible", true)
                .order("created_at", { ascending: false });
             setMateriales(mData || []);
          } else {
             setPensum([]);
             setMateriales([]);
          }

          // Inicializar con fecha de hoy
          const hoy = dayjs();
          setFechaAsistencia(hoy);
          await cargarDatosSesion(hoy, alumnosConPago);
          
          setHoraInicioClase(dayjs());
          setHoraFinClase(null);
          setHorasCalculadas(0);
          setDrawerVisible(true);
          messageApi.success({ content: "Aula lista", key: "loadingAula" });
      } catch (error: any) {
          messageApi.error({ content: "Error: " + error.message, key: "loadingAula" });
      }
  };

  const cargarDatosSesion = async (fecha: dayjs.Dayjs, alumnos: any[]) => {
      const fechaStr = fecha.format("YYYY-MM-DD");
      const matriculaIds = alumnos.map((a: any) => a.id);
      
      // 1. Cargar temas vistos en OTRAS fechas (Historial)
      const vistosSet = new Set<string>();
      if (matriculaIds.length > 0) {
          const { data: dataVistos } = await supabaseBrowserClient
            .from("asistencias")
            .select("tema_id")
            .in("matricula_id", matriculaIds)
            .neq("fecha", fechaStr) // IMPORTANTE: Excluir la fecha seleccionada para permitir edición
            .not("tema_id", "is", null);
          
          dataVistos?.forEach((d: any) => {
              if (d.tema_id) vistosSet.add(String(d.tema_id));
          });
      }
      setTemasVistos(vistosSet);

      // 2. Cargar asistencia y tema de la fecha seleccionada
      const { data: asistenciasFecha } = await supabaseBrowserClient
          .from("asistencias")
          .select("matricula_id, estado, tema_id")
          .eq("fecha", fechaStr)
          .in("matricula_id", matriculaIds);

      const mapa: any = {};
      let temaDia = null;

      if (asistenciasFecha && asistenciasFecha.length > 0) {
          asistenciasFecha.forEach((asist: any) => {
              mapa[asist.matricula_id] = asist.estado === 'presente';
              if (asist.tema_id) temaDia = asist.tema_id;
          });
      } else {
          // Si no hay datos, marcar todos presentes por defecto
          alumnos.forEach((a: any) => mapa[a.id] = true);
      }
      
      setAsistenciaMap(mapa);
      setTemaSeleccionado(temaDia);
  };

  const handleFechaChange = async (fecha: dayjs.Dayjs) => {
      setFechaAsistencia(fecha);
      if (cursoActivo && alumnosClase.length > 0) {
          messageApi.loading({ content: "Cargando datos de la fecha...", key: "loadingFecha" });
          await cargarDatosSesion(fecha, alumnosClase);
          messageApi.success({ content: "Datos actualizados", key: "loadingFecha" });
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

      // VALIDACIÓN DE FECHA FUTURA
      if (fechaAsistencia.isAfter(dayjs(), 'day')) {
          messageApi.error("⛔ No puedes registrar asistencia en una fecha futura.");
          return;
      }

      // VALIDACIÓN DE INTENSIDAD HORARIA
      const horasFinal = horasCalculadas; // Usar el valor del input (manual o calculado)

      if (cursoActivo?.hora_inicio && cursoActivo?.hora_fin) {
          const fechaBase = dayjs().format('YYYY-MM-DD');
          const inicioProg = dayjs(`${fechaBase} ${cursoActivo.hora_inicio}`);
          const finProg = dayjs(`${fechaBase} ${cursoActivo.hora_fin}`);
          
          if (inicioProg.isValid() && finProg.isValid()) {
              const horasProgramadas = finProg.diff(inicioProg, 'hour', true);
              const limiteHoras = Math.ceil(horasProgramadas);
              
              if (horasFinal > limiteHoras) {
                  messageApi.error({
                      content: `⛔ Error de Intensidad: Estás intentando registrar ${horasFinal} horas, pero este curso tiene programadas ${Number(horasProgramadas).toFixed(1)} horas por clase.`,
                      duration: 5
                  });
                  return;
              }
          }
      }

      modal.confirm({
          title: '¿Registrar Clase?',
          icon: <ExclamationCircleOutlined />,
          content: (
              <div>
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
          const fechaStr = fechaAsistencia.format("YYYY-MM-DD");

          // VERIFICACIÓN DE SEGURIDAD: No modificar si ya está pagado
          const { data: sesionExistente } = await supabaseBrowserClient
              .from("sesiones_clase")
              .select("estado_pago")
              .eq("curso_id", cursoActivo.id)
              .eq("profesor_id", profesorIdSesion)
              .eq("fecha", fechaStr)
              .maybeSingle();

          if (sesionExistente?.estado_pago === 'pagado') {
              throw new Error("⛔ Esta clase ya fue pagada en nómina y no se puede modificar.");
          }

          // 0. VALIDAR Y PREPARAR TEMA (Resolver conflicto de FK)
          let finalTemaId = temaSeleccionado;
          const isManualTopic = temasCurso.some(t => t.id === temaSeleccionado);

          if (!isManualTopic && temaSeleccionado) {
              // Es un tema del Pensum. Buscar detalles:
              let pensumTopic: any = null;
              pensum.forEach(c => {
                  const found = c.pensum_cursos?.find((pc: any) => pc.id === temaSeleccionado);
                  if (found) pensumTopic = found;
              });

              if (pensumTopic) {
                  // Verificar si ya existe en temas_curso por título para no duplicar
                  const existingTema = temasCurso.find(t => t.titulo === pensumTopic.nombre_curso);
                  
                  if (existingTema) {
                      finalTemaId = existingTema.id;
                  } else {
                      // Crear el tema en temas_curso automáticamente
                      const { data: newTema, error: errNew } = await supabaseBrowserClient
                          .from("temas_curso")
                          .insert({
                              curso_id: cursoActivo.id,
                              titulo: pensumTopic.nombre_curso,
                              descripcion: "Tema del pensum",
                              orden: (temasCurso.length + 1)
                          })
                          .select()
                          .single();
                      
                      if (errNew) throw errNew;
                      finalTemaId = newTema.id;
                      // Actualizamos la lista local para futuras referencias
                      setTemasCurso(prev => [...prev, newTema]);
                  }
              }
          }

          // 1. ASISTENCIAS: Estrategia DELETE + INSERT para evitar conflictos 409
          const matriculaIds = alumnosClase.map(a => a.id);
          
          if (matriculaIds.length > 0) {
              // Primero borramos lo que haya de hoy (limpieza)
              await supabaseBrowserClient
                .from("asistencias")
                .delete()
                .eq("fecha", fechaStr)
                .in("matricula_id", matriculaIds);

              // Luego insertamos los nuevos registros
              const registros = alumnosClase.map(alumno => ({
                  matricula_id: alumno.id,
                  fecha: fechaStr,
                  estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
                  tema_id: finalTemaId,
                  observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
              }));

              const { error: errAsis } = await supabaseBrowserClient
                .from("asistencias")
                .insert(registros);

              if (errAsis) throw errAsis;
          }

          const temaTxt = temasCurso.find(t => t.id === finalTemaId)?.titulo || 
                          pensum.flatMap(c => c.pensum_cursos || []).find((p: any) => p.id === temaSeleccionado)?.nombre_curso || 
                          'Tema del día';
          
          // 2. SESIÓN DE CLASE: Verificar manualmente y hacer UPDATE o INSERT
          const { data: existingSesion } = await supabaseBrowserClient
            .from("sesiones_clase")
            .select("id")
            .eq("curso_id", cursoActivo.id)
            .eq("profesor_id", profesorIdSesion)
            .eq("fecha", fechaStr)
            .maybeSingle();

          const sesionData: any = {
              curso_id: cursoActivo.id,
              profesor_id: profesorIdSesion,
              fecha: fechaStr,
              horas_dictadas: horasARegistrar,
              tema_visto: temaTxt,
              estado_pago: 'pendiente'
          };

          let errSesion;
          if (existingSesion) {
              // Si existe, actualizamos
              const { error } = await supabaseBrowserClient
                .from("sesiones_clase")
                .update(sesionData)
                .eq("id", existingSesion.id);
              errSesion = error;
          } else {
              // Si no existe, insertamos
              const { error } = await supabaseBrowserClient
                .from("sesiones_clase")
                .insert(sesionData);
              errSesion = error;
          }

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
                                    <DatePicker style={{width:'100%'}} value={fechaAsistencia} onChange={val => handleFechaChange(val || dayjs())} allowClear={false}/>
                                </Col>
                                <Col span={12}>
                                    <label>Horas Dictadas:</label>
                                    <Space.Compact style={{ width: '100%' }}>
                                        <InputNumber 
                                            min={1} 
                                            max={8} 
                                            value={horasCalculadas} 
                                            onChange={(val) => setHorasCalculadas(val || 0)}
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
                                        options={opcionesTemas}
                                    />
                                </Col>
                            </Row>
                        </Card>

                        <List
                            itemLayout="horizontal"
                            dataSource={alumnosClase}
                            renderItem={(alumno: any) => {
                              const pagado = alumno.pagado;
                              const entregasEst = entregasMap[alumno.estudiante_id] || [];
                              const tieneCamiseta = entregasEst.some(e => e.tipo_material === 'camiseta');
                              const kits = entregasEst.filter(e => e.tipo_material === 'kit').length;

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
                                                {tieneCamiseta && <Tooltip title="Camiseta entregada">👕</Tooltip>}
                                                {kits > 0 && <Tooltip title={`${kits} Kits entregados`}>📦 {kits}</Tooltip>}
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
                    <div style={{maxHeight: '500px', overflowY: 'auto'}}>
                        <Alert message="Plan de estudios oficial del programa." type="info" showIcon style={{marginBottom: 16}} />
                        {pensum.length === 0 ? <Empty description="No hay pensum asignado" /> : (
                            <Collapse defaultActiveKey={pensum[0]?.id}>
                                {pensum.map(ciclo => (
                                    <Panel header={`${ciclo.nombre_ciclo} (${ciclo.duracion_semanas || 0} semanas)`} key={ciclo.id}>
                                        <Text type="secondary">{ciclo.descripcion}</Text>
                                        <Divider style={{ margin: '10px 0' }} />
                                        <List
                                            size="small"
                                            dataSource={ciclo.pensum_cursos || []}
                                            renderItem={(curso: any) => (
                                                <List.Item>
                                                    <List.Item.Meta
                                                        avatar={<BookOutlined />}
                                                        title={curso.nombre_curso}
                                                        description={`${curso.horas} horas • ${curso.tipo_curso}`}
                                                    />
                                                </List.Item>
                                            )}
                                        />
                                    </Panel>
                                ))}
                            </Collapse>
                        )}
                    </div>
                )
            },
            {
                key: '4', label: '📄 Material Didáctico',
                children: (
                    <div style={{maxHeight: '500px', overflowY: 'auto'}}>
                        <Alert 
                          message="Recursos descargables del programa." 
                          type="info" 
                          style={{marginBottom: 20}}
                          showIcon
                        />
                        {materiales.length === 0 ? <Empty description="No hay material disponible" /> : (
                            <div>
                                {pensum.map(ciclo => {
                                    const matsCiclo = materiales.filter(m => m.pensum_id === ciclo.id);
                                    if (matsCiclo.length === 0) return null;
                                    return (
                                        <div key={ciclo.id} style={{marginBottom: 24}}>
                                            <Divider orientation="left" style={{borderColor: '#d9d9d9'}}>{ciclo.nombre_ciclo}</Divider>
                                            <List
                                                grid={{ gutter: 16, xs: 1, sm: 2 }}
                                                dataSource={matsCiclo}
                                                renderItem={(item: any) => {
                                                    let Icon = FileTextOutlined;
                                                    if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                                                    if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                                                    return (
                                                        <List.Item>
                                                            <Card 
                                                                size="small" 
                                                                title={<><Icon /> {item.tipo_material?.toUpperCase()}</>}
                                                                extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}
                                                            >
                                                                <Text strong>{item.titulo}</Text>
                                                                <br />
                                                                <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                                            </Card>
                                                        </List.Item>
                                                    );
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                                
                                {materiales.filter(m => !m.pensum_id).length > 0 && (
                                    <div style={{marginBottom: 24}}>
                                        <Divider orientation="left">General</Divider>
                                        <List
                                            grid={{ gutter: 16, xs: 1, sm: 2 }}
                                            dataSource={materiales.filter(m => !m.pensum_id)}
                                            renderItem={(item: any) => {
                                                let Icon = FileTextOutlined;
                                                if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                                                if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                                                return (
                                                    <List.Item>
                                                        <Card 
                                                            size="small" 
                                                            title={<><Icon /> {item.tipo_material?.toUpperCase()}</>}
                                                            extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}
                                                        >
                                                            <Text strong>{item.titulo}</Text>
                                                            <br />
                                                            <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                                        </Card>
                                                    </List.Item>
                                                );
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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
