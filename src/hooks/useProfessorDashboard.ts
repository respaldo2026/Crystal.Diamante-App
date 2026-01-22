import { useState, useEffect, useMemo } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { App } from "antd";
import dayjs from "dayjs";
import { enviarWhatsapp } from "@utils/whatsapp";
import { useRouter } from "next/navigation";

export const useProfessorDashboard = (professorIdProp?: string) => {
  const { message, modal } = App.useApp();
  const router = useRouter();

  // General State
  const [loading, setLoading] = useState(true);
  const [idProfesor, setIdProfesor] = useState<string | null>(professorIdProp || null);
  const [profesor, setProfesor] = useState<any>(null);
  const [misCursos, setMisCursos] = useState<any[]>([]);
  const [historialCursos, setHistorialCursos] = useState<any[]>([]);
  const [pagosNomina, setPagosNomina] = useState<any[]>([]);
  const [horasPendientesMap, setHorasPendientesMap] = useState<Record<string, number>>({});

  // Class Management State
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [cursoActivo, setCursoActivo] = useState<any>(null);
  const [alumnosClase, setAlumnosClase] = useState<any[]>([]);
  const [temasCurso, setTemasCurso] = useState<any[]>([]);
  const [temaSeleccionado, setTemaSeleccionado] = useState<string | null>(null);
  const [pensum, setPensum] = useState<any[]>([]);
  const [temasVistos, setTemasVistos] = useState<Set<string>>(new Set());
  const [materiales, setMateriales] = useState<any[]>([]);
  const [entregasMap, setEntregasMap] = useState<Record<string, any[]>>({});
  
  // Attendance State
  const [asistenciaMap, setAsistenciaMap] = useState<Record<string, boolean>>({});
  const [fechaAsistencia, setFechaAsistencia] = useState(dayjs());
  const [horaInicioclase, setHoraInicioClase] = useState<dayjs.Dayjs | null>(null);
  const [horasCalculadas, setHorasCalculadas] = useState<number>(0);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false);

  // Grading State
  const [modalNotasVisible, setModalNotasVisible] = useState(false);
  const [estudianteACalificar, setEstudianteACalificar] = useState<any>(null);
  const [guardandoNota, setGuardandoNota] = useState(false);

  // Material Delivery State
  const [modalEntregaVisible, setModalEntregaVisible] = useState(false);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<any>(null);

  useEffect(() => {
    cargarDashboard();
  }, [professorIdProp]);

  const refrescarHorasPendientes = async (profId: string) => {
    const { data: dataSesionesPend, error } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select("curso_id, horas_dictadas, estado_pago")
      .eq("profesor_id", profId)
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
      let targetId = professorIdProp;

      if (!targetId) {
        const { data: { user }, error: userError } = await supabaseBrowserClient.auth.getUser();
        if (userError || !user) {
           // Handle redirect in component if needed, or here
           return;
        }
        targetId = user.id;
      }

      setIdProfesor(targetId);

      // 1. Profile
      const { data: dataProf, error: errProf } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();
      
      if (errProf || !dataProf) {
        message.error("Perfil no encontrado");
        return;
      }
      setProfesor(dataProf);

      // 2. Parallel Data Fetching
      const [cursosRes, historialRes, pagosRes] = await Promise.all([
        supabaseBrowserClient
            .from("cursos")
            .select(`*, matriculas ( estado )`)
            .eq("profesor_id", targetId)
            .eq("estado", "activo"),
        supabaseBrowserClient
            .from("cursos")
            .select("id, nombre, estado, fecha_inicio, fecha_fin")
            .eq("profesor_id", targetId)
            .order("fecha_inicio", { ascending: false }),
        supabaseBrowserClient
            .from("pagos_nomina")
            .select("id, fecha_pago, total_pagado, total_horas, observaciones")
            .eq("profesor_id", targetId)
            .order("fecha_pago", { ascending: false })
      ]);

      if (cursosRes.error) throw cursosRes.error;

      const cursosFmt = (cursosRes.data || []).map((c: any) => ({
          ...c,
          total_estudiantes: c.matriculas?.filter((m: any) => m.estado === 'activo').length || 0
      }));

      setMisCursos(cursosFmt);
      setHistorialCursos(historialRes.data || []);
      setPagosNomina(pagosRes.data || []);
      
      await refrescarHorasPendientes(targetId);

    } catch (error: any) {
      console.error("Error cargando dashboard:", error);
      message.error("Error al cargar información");
    } finally {
      setLoading(false);
    }
  };

  const abrirGestionClase = async (curso: any) => {
    try {
        message.loading({ content: "Cargando aula...", key: "loadingAula" });
        setCursoActivo(curso);
        setAlumnosClase([]);
        setTemaSeleccionado(null);
        
        // Students
        const { data: dataAlumnos, error: errAlumnos } = await supabaseBrowserClient
          .from("matriculas")
          .select(`id, estudiante_id, perfiles!matriculas_estudiante_id_fkey ( nombre_completo, telefono ), pagos!pagos_matricula_id_fkey ( estado, fecha_vencimiento )`)
          .eq("curso_id", curso.id)
          .eq("estado", "activo");

        if (errAlumnos) throw errAlumnos;
        
        const alumnosConPago = (dataAlumnos || []).map((alumno: any) => {
            const tieneDeuda = (alumno.pagos || []).some((p: any) => 
                p.estado === 'pendiente' && dayjs(p.fecha_vencimiento).isBefore(dayjs(), 'day')
            );
            return { ...alumno, pagado: !tieneDeuda };
        });
        
        setAlumnosClase(alumnosConPago);
        
        // Material Deliveries
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

        // Topics
        const { data: dataTemas, error: errTemas } = await supabaseBrowserClient
          .from("temas_curso")
          .select("*")
          .eq("curso_id", curso.id)
          .order("orden", { ascending: true });
          
        if (errTemas) throw errTemas;
        setTemasCurso(dataTemas || []);

        // Pensum & Materials
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

        const hoy = dayjs();
        setFechaAsistencia(hoy);
        await cargarDatosSesion(hoy, alumnosConPago, curso.id);
        
        setHoraInicioClase(dayjs());
        setHorasCalculadas(0);
        setDrawerVisible(true);
        message.success({ content: "Aula lista", key: "loadingAula" });
    } catch (error: any) {
        message.error({ content: "Error: " + error.message, key: "loadingAula" });
    }
  };

  const cargarDatosSesion = async (fecha: dayjs.Dayjs, alumnos: any[], cursoId: number) => {
    const fechaStr = fecha.format("YYYY-MM-DD");
    const matriculaIds = alumnos.map((a: any) => a.id);
    
    // History of seen topics
    const vistosSet = new Set<string>();
    if (matriculaIds.length > 0) {
        const { data: dataVistos } = await supabaseBrowserClient
          .from("asistencias")
          .select("tema_id")
          .in("matricula_id", matriculaIds)
          .neq("fecha", fechaStr)
          .not("tema_id", "is", null);
        
        dataVistos?.forEach((d: any) => {
            if (d.tema_id) vistosSet.add(String(d.tema_id));
        });
    }
    setTemasVistos(vistosSet);

    // Attendance for selected date
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
        alumnos.forEach((a: any) => mapa[a.id] = true);
    }
    
    setAsistenciaMap(mapa);
    setTemaSeleccionado(temaDia);
  };

  const handleFechaChange = async (fecha: dayjs.Dayjs) => {
    setFechaAsistencia(fecha);
    if (cursoActivo && alumnosClase.length > 0) {
        message.loading({ content: "Cargando datos...", key: "loadingFecha" });
        await cargarDatosSesion(fecha, alumnosClase, cursoActivo.id);
        message.success({ content: "Datos actualizados", key: "loadingFecha" });
    }
  };

  const guardarAsistencia = async (horas: number, finalTemaId: string | null, temaTxt: string) => {
    setGuardandoAsistencia(true);
    try {
        const fechaStr = fechaAsistencia.format("YYYY-MM-DD");
        const matriculaIds = alumnosClase.map(a => a.id);
        
        if (matriculaIds.length > 0) {
            await supabaseBrowserClient.from("asistencias").delete().eq("fecha", fechaStr).in("matricula_id", matriculaIds);
            const registros = alumnosClase.map(alumno => ({
                matricula_id: alumno.id,
                fecha: fechaStr,
                estado: asistenciaMap[alumno.id] ? 'presente' : 'ausente',
                tema_id: finalTemaId,
                observaciones: asistenciaMap[alumno.id] ? 'Tema completado' : 'Tema pendiente'
            }));
            const { error: errAsis } = await supabaseBrowserClient.from("asistencias").insert(registros);
            if (errAsis) throw errAsis;
        }

        const sesionData: any = {
            curso_id: cursoActivo.id,
            profesor_id: idProfesor,
            fecha: fechaStr,
            horas_dictadas: horas,
            tema_visto: temaTxt,
            estado_pago: 'pendiente'
        };

        const { data: existingSesion } = await supabaseBrowserClient.from("sesiones_clase").select("id").eq("curso_id", cursoActivo.id).eq("profesor_id", idProfesor).eq("fecha", fechaStr).maybeSingle();

        if (existingSesion) {
            await supabaseBrowserClient.from("sesiones_clase").update(sesionData).eq("id", existingSesion.id);
        } else {
            await supabaseBrowserClient.from("sesiones_clase").insert(sesionData);
        }

        message.success("✅ Clase registrada correctamente");
        setDrawerVisible(false);
        if (idProfesor) await refrescarHorasPendientes(idProfesor);
    } catch (error: any) {
        message.error("Error guardando: " + error.message);
    } finally {
        setGuardandoAsistencia(false);
    }
  };

  return {
    loading, idProfesor, profesor, misCursos, historialCursos, pagosNomina, horasPendientesMap,
    drawerVisible, setDrawerVisible, cursoActivo, alumnosClase, temasCurso, setTemasCurso,
    temaSeleccionado, setTemaSeleccionado, pensum, materiales, entregasMap,
    asistenciaMap, setAsistenciaMap, fechaAsistencia, horaInicioclase, horasCalculadas, setHorasCalculadas,
    guardandoAsistencia, modalNotasVisible, setModalNotasVisible, estudianteACalificar, setEstudianteACalificar,
    guardandoNota, setGuardandoNota, modalEntregaVisible, setModalEntregaVisible, estudianteSeleccionado, setEstudianteSeleccionado,
    abrirGestionClase, handleFechaChange, guardarAsistencia, cargarDashboard
  };
};