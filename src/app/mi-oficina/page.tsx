"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Modal, Form, message, Spin, Divider } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useRouter } from "next/navigation";
import { enviarWhatsapp } from "@utils/whatsapp";
import { EntregaMaterialModal } from "@components/EntregaMaterialModal";
import { ProfesorHeader } from "./ProfesorHeader";
import { StatsCards } from "./StatsCards";
import { CourseGrid } from "./CourseGrid";
import { PayrollHistory } from "./PayrollHistory";
import { CourseHistory } from "./CourseHistory";
import { ClassDrawer } from "./ClassDrawer";
import { CalificarModal } from "./CalificarModal";
import { NuevoTemaModal } from "./NuevoTemaModal";
import { useGestorTemas } from "@hooks/useGestorTemas";

export default function MiOficinaProfesor() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
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
  const [horasCalculadas, setHorasCalculadas] = useState<number>(0);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false);

  // Entrega de materiales
  const [modalEntregaVisible, setModalEntregaVisible] = useState(false);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<any>(null);

  // Calificaciones
  const [modalNotasVisible, setModalNotasVisible] = useState(false);
  const [estudianteACalificar, setEstudianteACalificar] = useState<any>(null);
  const [guardandoNota, setGuardandoNota] = useState(false);

  // CARGAR DATOS INICIALES
  useEffect(() => {
    cargarDashboard();
  }, []);

  // HOOK GESTOR DE TEMAS (Reemplaza lógica duplicada)
  const { 
    form: formPensum, 
    visible: modalPensumVisible, 
    setVisible: setModalPensumVisible, 
    loading: guardandoTema, 
    guardarTema: guardarTemaPensum 
  } = useGestorTemas(cursoActivo?.id, (nuevos) => setTemasCurso(nuevos), messageApi);

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
          router.push("/login");
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
          router.push("/login");
          return;
        }

        // Verificar que sea profesor
        if (dataProf.rol !== "profesor") {
          messageApi.warning("Esta área es solo para profesores");
          // Redirigir según su rol
          if (dataProf.rol === "estudiante") {
            router.push("/portal-estudiante");
          } else {
            router.push("/");
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

  const abrirGestionClase = async (curso: any) => {
      try {
          messageApi.loading({ content: "Cargando aula...", key: "loadingAula" });
          setCursoActivo(curso);
          setAlumnosClase([]);
          setTemaSeleccionado(null);
          
          // A) Estudiantes del curso (desde BD real)
          const { data: dataAlumnos, error: errAlumnos } = await supabaseBrowserClient
            .from("matriculas")
            .select(`id, estudiante_id, perfiles!matriculas_estudiante_id_fkey ( nombre_completo, telefono ), pagos!pagos_matricula_id_fkey ( estado, fecha_vencimiento )`)
            .eq("curso_id", curso.id)
            .eq("estado", "activo");

          if (errAlumnos) throw errAlumnos;
          
          const alumnosConPago = (dataAlumnos || []).map((alumno: any) => {
              // Verificar si tiene pagos vencidos (estado pendiente y fecha vencimiento anterior a hoy)
              const tieneDeuda = (alumno.pagos || []).some((p: any) => 
                  p.estado === 'pendiente' && dayjs(p.fecha_vencimiento).isBefore(dayjs(), 'day')
              );
              
              return {
                  ...alumno,
                  pagado: !tieneDeuda
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

      <ProfesorHeader profesor={profesor} />

      <StatsCards
        cursosCount={misCursos.length}
        totalEstudiantes={misCursos.reduce((sum, c) => sum + (c.total_estudiantes || 0), 0)}
        horasPendientes={Object.values(horasPendientesMap).reduce((a, b) => a + (b || 0), 0)}
        pagosPendientes={pagosNomina.filter(p => !p.fecha_pago).length}
      />

      <CourseGrid 
        cursos={misCursos}
        horasPendientesMap={horasPendientesMap}
        onGestionar={abrirGestionClase}
      />

      <Divider style={{margin: '32px 0'}} />

      <PayrollHistory pagosNomina={pagosNomina} />

      <Divider style={{margin: '32px 0'}} />

      <CourseHistory historialCursos={historialCursos} />

      {/* DRAWER GESTIÓN DE CLASE */}
      <ClassDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        cursoActivo={cursoActivo}
        fechaAsistencia={fechaAsistencia}
        onFechaChange={handleFechaChange}
        horasCalculadas={horasCalculadas}
        onHorasChange={setHorasCalculadas}
        horaInicioclase={horaInicioclase}
        temaSeleccionado={temaSeleccionado}
        onTemaChange={setTemaSeleccionado}
        opcionesTemas={opcionesTemas}
        alumnosClase={alumnosClase}
        asistenciaMap={asistenciaMap}
        onAsistenciaChange={(id, val) => setAsistenciaMap(prev => ({ ...prev, [id]: val }))}
        entregasMap={entregasMap}
        onRegistrarEntrega={(alumno) => {
          setEstudianteSeleccionado({ id: alumno.estudiante_id, nombre_completo: alumno.perfiles.nombre_completo });
          setModalEntregaVisible(true);
        }}
        onConfirmarGuardado={confirmarGuardado}
        guardandoAsistencia={guardandoAsistencia}
        onAbrirCalificar={abrirCalificar}
        pensum={pensum}
        materiales={materiales}
        profesorNombre={profesor?.nombre_completo || 'Profesor'}
      />

      {/* MODAL NUEVO TEMA PENSUM */}
      <NuevoTemaModal
        visible={modalPensumVisible}
        onCancel={() => setModalPensumVisible(false)}
        onOk={guardarTemaPensum}
        confirmLoading={guardandoTema}
        form={formPensum}
        initialOrden={(temasCurso.length || 0) + 1}
      />

      {/* MODAL CALIFICAR */}
      <CalificarModal
        visible={modalNotasVisible}
        onCancel={() => setModalNotasVisible(false)}
        onOk={guardarNota}
        loading={guardandoNota}
        form={formNotas}
        estudiante={estudianteACalificar}
      />
      
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
    </div>
  );
}
