"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Show } from "@refinedev/antd";
import { 
  Typography, Row, Col, Card, Button, 
  Modal, Form, Input, DatePicker, Avatar, List, Divider, Drawer, Switch, message, Spin, Select, InputNumber, Timeline, Alert, Space,
  Tabs, Tag, Upload, Tooltip
} from "antd";
import { 
  UserOutlined, BookOutlined, TeamOutlined, PlusOutlined, ExclamationCircleOutlined, StarOutlined,
  WhatsAppOutlined, CameraOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useParams } from "next/navigation"; 
import { createClient } from "@supabase/supabase-js";
import { enviarWhatsapp } from "@utils/whatsapp";
import { formatDate } from "@utils/date";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { Title, Text } = Typography;

export default function ShowProfesorDashboard() {
  const params = useParams();
  const idProfesor = params?.id as string;

  // HOOKS DE ANT DESIGN
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [formPensum] = Form.useForm();
  const [formNotas] = Form.useForm();

  // ESTADOS GENERALES
  const [profesor, setProfesor] = useState<any>(null);
  const [misCursos, setMisCursos] = useState<any[]>([]);
  const [historialCursos, setHistorialCursos] = useState<any[]>([]);
  const [pagosNomina, setPagosNomina] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState("");

  // GESTIÓN CLASE (DRAWER)
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [cursoActivo, setCursoActivo] = useState<any>(null);
  const [alumnosClase, setAlumnosClase] = useState<any[]>([]);
  const [temasCurso, setTemasCurso] = useState<any[]>([]);
  const [temaSeleccionado, setTemaSeleccionado] = useState<string | null>(null);
  const [pensum, setPensum] = useState<any[]>([]);
  const [temasVistos, setTemasVistos] = useState<Set<string>>(new Set());
  const [entregasMap, setEntregasMap] = useState<Record<string, any[]>>({});
  
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

  // CALCULAR OPCIONES DE TEMAS (Memoizado para actualización inmediata)
  const opcionesTemas = useMemo(() => {
    const opciones: any[] = [];

    // 1. Temas Manuales
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

    // 2. Temas del Pensum
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

  // 1. CARGAR DATOS INICIALES
  useEffect(() => {
    if (idProfesor) cargarDashboard();
  }, [idProfesor]);

  const cargarDashboard = async () => {
    try {
        setLoading(true);
        // Perfil
        const { data: dataProf, error: errProf } = await supabase.from("perfiles").select("*").eq("id", idProfesor).maybeSingle();
        if (errProf) throw errProf;
        if (!dataProf) {
          console.error("Profesor no encontrado");
          return;
        }
        setProfesor(dataProf);

        // Cursos activos
        const { data: dataCursos, error: errCursos } = await supabase
            .from("cursos")
            .select(`*, matriculas ( estado )`)
            .eq("profesor_id", idProfesor)
            .eq("estado", "activo");
            
        if (errCursos) throw errCursos;

        const cursosFmt = dataCursos?.map((c: any) => ({
            ...c,
            total_estudiantes: c.matriculas?.filter((m: any) => m.estado === 'activo').length || 0
        })) || [];


        // Historial de cursos (todos los estados)
        const { data: dataCursosHist } = await supabase
          .from("cursos")
          .select("id, nombre, estado, fecha_inicio, fecha_fin")
          .eq("profesor_id", idProfesor)
          .order("fecha_inicio", { ascending: false });
        setHistorialCursos(dataCursosHist || []);

        // Pagos de nómina del profesor
        const { data: dataPagos } = await supabase
          .from("pagos_nomina")
          .select("id, fecha_pago, total_pagado, total_horas, observaciones")
          .eq("profesor_id", idProfesor)
          .order("fecha_pago", { ascending: false });
        setPagosNomina(dataPagos || []);
    } catch (error: any) {
        console.error("Error cargando dashboard:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    try {
      setUploadingPhoto(true);
      
      const fileExt = file.name.split(".").pop();
      const fileName = `${idProfesor}_${Date.now()}.${fileExt}`;
      const filePath = `perfiles/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("perfiles")
        .update({ foto_url: urlData.publicUrl })
        .eq("id", idProfesor);

      if (updateError) throw updateError;

      messageApi.success("Foto actualizada correctamente");
      await cargarDashboard();
    } catch (error: any) {
      console.error("Error subiendo foto:", error);
      messageApi.error("Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
    }
    return false;
  };

  const handleWhatsAppClick = () => {
    if (!profesor?.telefono) {
      messageApi.warning("El profesor no tiene teléfono registrado");
      return;
    }
    const mensaje = `Hola ${profesor.nombre_completo}, te contacto desde Academia Crystal.`;
    enviarWhatsapp(profesor.telefono, mensaje);
  };

  // Verificar si el estudiante está al día en pagos
  const verificarPagoAlDia = (fechaPagoVencimiento: string | null): boolean => {
    if (!fechaPagoVencimiento) return false;
    const hoy = dayjs();
    const fechaPago = dayjs(fechaPagoVencimiento);
    return fechaPago.isAfter(hoy) || fechaPago.isSame(hoy, 'day');
  };

  // 2. ABRIR GESTIÓN DE CLASE
  const abrirGestionClase = async (curso: any) => {
      try {
          messageApi.loading({ content: "Cargando aula...", key: "loadingAula" });
          setCursoActivo(curso);
          setAlumnosClase([]);
          setTemaSeleccionado(null);
          
          // A) Estudiantes - Simplificado para evitar errores de join
          const { data: dataMatriculas, error: errMatriculas } = await supabase
            .from("matriculas")
            .select(`id, estudiante_id`)
            .eq("curso_id", curso.id)
            .eq("estado", "activo");

          if (errMatriculas) throw errMatriculas;

          // Ahora traemos los perfiles y pagos por separado
          let alumnosConPago: any[] = [];
          
          if (dataMatriculas && dataMatriculas.length > 0) {
              const estudianteIds = dataMatriculas.map((m: any) => m.estudiante_id);
              
              // Traer perfiles
              const { data: perfiles } = await supabase
                  .from("perfiles")
                  .select("id, nombre_completo, telefono")
                  .in("id", estudianteIds);
              
              const perfilesMap = (perfiles || []).reduce((acc: any, p: any) => {
                  acc[p.id] = p;
                  return acc;
              }, {});
              
              // Traer pagos
              const { data: pagosData } = await supabase
                  .from("pagos")
                  .select("estudiante_id, fecha_pago")
                  .in("estudiante_id", estudianteIds)
                  .order("fecha_pago", { ascending: false });
              
              const pagosMap = (pagosData || []).reduce((acc: any, p: any) => {
                  if (!acc[p.estudiante_id]) acc[p.estudiante_id] = [];
                  acc[p.estudiante_id].push(p);
                  return acc;
              }, {});
              
              // Combinar todo
              alumnosConPago = dataMatriculas.map((mat: any) => {
                  const perfil = perfilesMap[mat.estudiante_id] || {};
                  const pagos = pagosMap[mat.estudiante_id] || [];
                  const fechaPagoReciente = pagos.length > 0 ? pagos[0].fecha_pago : null;
                  
                  return {
                      id: mat.id,
                      estudiante_id: mat.estudiante_id,
                      perfiles: perfil,
                      pagado: verificarPagoAlDia(fechaPagoReciente)
                  };
              });
          }
          
          setAlumnosClase(alumnosConPago);

          // A.1) Cargar historial de entregas
          if (alumnosConPago.length > 0) {
            const ids = alumnosConPago.map(a => a.estudiante_id);
            const { data: entregasData } = await supabase
                .from("entregas_materiales")
                .select("estudiante_id, tipo_material")
                .in("estudiante_id", ids);
            
            const eMap: Record<string, any[]> = {};
            entregasData?.forEach((e: any) => {
                if (!eMap[e.estudiante_id]) eMap[e.estudiante_id] = [];
                eMap[e.estudiante_id].push(e);
            });
            setEntregasMap(eMap);
          }
          
          // B) Temas
          const { data: dataTemas, error: errTemas } = await supabase
            .from("temas_curso")
            .select("*")
            .eq("curso_id", curso.id)
            .order("orden", { ascending: true });
            
          if (errTemas) throw errTemas;

          setTemasCurso(dataTemas || []);

          // C) Cargar Pensum (Igual que en mi-oficina)
          if (curso.programa_id) {
             const { data: pData } = await supabase
                .from("pensum")
                .select(`*, pensum_cursos (*)`)
                .eq("programa_id", curso.programa_id)
                .eq("activo", true)
                .order("numero_ciclo", { ascending: true });
             setPensum(pData || []);
          } else {
             setPensum([]);
          }

          // C) Cargar datos de sesión (asistencia y temas vistos)
          const hoy = dayjs();
          setFechaAsistencia(hoy);
          await cargarDatosSesion(hoy, alumnosConPago);

          // Registrar hora de inicio
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
      
      // 1. Cargar temas vistos en OTRAS fechas
      const vistosSet = new Set<string>();
      if (matriculaIds.length > 0) {
          const { data: dataVistos } = await supabase
            .from("asistencias")
            .select("tema_id")
            .in("matricula_id", matriculaIds)
            .neq("fecha", fechaStr) // Excluir fecha actual
            .not("tema_id", "is", null);
          
          dataVistos?.forEach((d: any) => {
              if (d.tema_id) vistosSet.add(String(d.tema_id));
          });
      }
      setTemasVistos(vistosSet);

      // 2. Cargar asistencia de la fecha
      let asistenciasFecha: any[] = [];
      if (matriculaIds.length > 0) {
          const { data } = await supabase
              .from("asistencias")
              .select("matricula_id, estado, tema_id")
              .eq("fecha", fechaStr)
              .in("matricula_id", matriculaIds);
          asistenciasFecha = data || [];
      }

      const mapa: any = {};
      let temaDia = null;

      if (asistenciasFecha.length > 0) {
          asistenciasFecha.forEach((asist: any) => {
              mapa[asist.matricula_id] = asist.estado === 'presente';
              if (asist.tema_id) temaDia = asist.tema_id;
          });
      } else {
          alumnos.forEach((a: any) => mapa[a.id] = true);
      }
      
      setAsistenciaMap(mapa);
      setTemaSeleccionado(temaDia);
  };

  const handleFechaChange = async (fecha: dayjs.Dayjs) => {
      setFechaAsistencia(fecha);
      if (cursoActivo && alumnosClase.length > 0) {
          messageApi.loading({ content: "Cargando datos...", key: "loadingFecha" });
          await cargarDatosSesion(fecha, alumnosClase);
          messageApi.success({ content: "Datos actualizados", key: "loadingFecha" });
      }
  };

  // 3. CONFIRMAR Y GUARDAR (ASISTENCIA + HORAS TRABAJADAS)
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
      const horasFinal = horasCalculadas; // Usar valor editable

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
          const fechaStr = fechaAsistencia.format("YYYY-MM-DD");

          // VERIFICACIÓN DE SEGURIDAD: No modificar si ya está pagado
          const { data: sesionExistente } = await supabase
              .from("sesiones_clase")
              .select("estado_pago")
              .eq("curso_id", cursoActivo.id)
              .eq("profesor_id", idProfesor)
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
                  // Verificar si ya existe en temas_curso por título
                  const existingTema = temasCurso.find(t => t.titulo === pensumTopic.nombre_curso);
                  
                  if (existingTema) {
                      finalTemaId = existingTema.id;
                  } else {
                      // Crear el tema en temas_curso automáticamente
                      const { data: newTema, error: errNew } = await supabase
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
                      setTemasCurso(prev => [...prev, newTema]);
                  }
              }
          }

          // 1. ASISTENCIAS: Estrategia DELETE + INSERT
          const matriculaIds = alumnosClase.map(a => a.id);
          
          if (matriculaIds.length > 0) {
              // Borrar previos
              await supabase
                .from("asistencias")
                .delete()
                .eq("fecha", fechaStr)
                .in("matricula_id", matriculaIds);

              // Insertar nuevos
              const registros = alumnosClase.map(alumno => ({
                  matricula_id: alumno.id,
                  fecha: fechaStr,
                  estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
                  tema_id: finalTemaId,
                  observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
              }));

              const { error: errAsis } = await supabase
                .from("asistencias")
                .insert(registros);

              if (errAsis) throw errAsis;
          }

          // 2. Guardar Sesión PROFESOR (Para Nómina)
          const temaTxt = temasCurso.find(t => t.id === finalTemaId)?.titulo || 
                          pensum.flatMap(c => c.pensum_cursos || []).find((p: any) => p.id === temaSeleccionado)?.nombre_curso || 
                          'Tema del día';
          
          const { data: existingSesion } = await supabase
            .from("sesiones_clase")
            .select("id")
            .eq("curso_id", cursoActivo.id)
            .eq("profesor_id", idProfesor)
            .eq("fecha", fechaStr)
            .maybeSingle();

          const sesionData: any = {
              curso_id: cursoActivo.id,
              profesor_id: idProfesor,
              fecha: fechaStr,
              horas_dictadas: horasARegistrar,
              tema_visto: temaTxt,
              estado_pago: 'pendiente'
          };

          let errSesion;
          if (existingSesion) {
              // UPDATE
              const { error } = await supabase
                .from("sesiones_clase")
                .update(sesionData)
                .eq("id", existingSesion.id);
              errSesion = error;
          } else {
              // INSERT
              const { error } = await supabase
                .from("sesiones_clase")
                .insert(sesionData);
              errSesion = error;
          }

          if (errSesion) throw errSesion;

          messageApi.success("✅ Clase y Horas registradas correctamente");
          setDrawerVisible(false);
      } catch (error: any) {
          messageApi.error("Error guardando: " + error.message);
      } finally {
          setGuardandoAsistencia(false);
      }
  };

  // 4. GUARDAR TEMA PENSUM
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

  // 5. CALIFICAR
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

          // Notificación automática por nota baja
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
          <div style={{ marginTop: 15, color: '#888' }}>Cargando Oficina Virtual...</div>
      </div>
  );

  return (
    <Show title="Oficina Virtual" headerButtons={() => <Button href="/profesores">Volver</Button>}>
      {contextHolder}
      {modalContextHolder}
      
      {profesor && (
        <Card style={{marginBottom: 20, borderLeft: '5px solid #722ed1'}}>
            <Row align="middle" gutter={16}>
                <Col>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <Avatar 
                      size={64} 
                      style={{backgroundColor: '#87d068', cursor: profesor?.foto_url ? "pointer" : "default"}} 
                      icon={<UserOutlined />} 
                      src={profesor?.foto_url}
                      onClick={() => {
                        if (profesor?.foto_url) {
                          setPreviewImage(profesor.foto_url);
                          setPreviewVisible(true);
                        }
                      }}
                    />
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleUploadPhoto(file);
                        return false;
                      }}
                      accept="image/*"
                    >
                      <Button
                        icon={<CameraOutlined />}
                        shape="circle"
                        size="small"
                        loading={uploadingPhoto}
                        style={{
                          position: "absolute",
                          bottom: -5,
                          right: -5,
                          backgroundColor: "#fff",
                          border: "2px solid #722ed1",
                        }}
                      />
                    </Upload>
                  </div>
                </Col>
                <Col flex="1">
                    <Title level={4} style={{margin:0}}>{profesor.nombre_completo}</Title>
                    <Text type="secondary">Panel Docente</Text>
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
                        <Button
                          icon={<UserOutlined />}
                          size="small"
                          onClick={() => window.location.href = `/profesores/edit/${idProfesor}`}
                        >
                          Editar
                        </Button>
                        <Button
                          danger
                          size="small"
                          onClick={() => {
                            messageApi.warning("Acciones de desactivar/eliminar están disponibles en la lista de profesores");
                          }}
                        >
                          Acciones
                        </Button>
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
        {misCursos.length === 0 && <Alert message="No tienes cursos activos." type="info" />}
      </Row>

      <Divider />

      <Title level={4}>💼 Historial de Pagos</Title>
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

      <Title level={4}>📚 Historial de Grupos</Title>
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
                  <Tag>{c.fecha_inicio ? formatDate(c.fecha_inicio) : '-'}</Tag>
                  <span>→</span>
                  <Tag>{c.fecha_fin ? formatDate(c.fecha_fin) : '-'}</Tag>
                </Space>
              }
            />
          </List.Item>
        )}
      />

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

      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
      >
        <img alt="Foto de perfil" style={{ width: "100%" }} src={previewImage} />
      </Modal>

    </Show>
  );
}