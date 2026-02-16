"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, Tabs, Table, Tag, Row, Col, Statistic, Button, Space, Typography, Spin, Alert, Modal, Form, Input, InputNumber, DatePicker, Upload, List, Empty, App, Select } from "antd";
import {
  UserOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  BookOutlined,
  FileOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  FormOutlined,
} from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";
import { construirNombreGrupo } from "@utils/grupos";
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";

const { Title, Text } = Typography;

interface Student {
  id: number;
  nombre_completo: string;
  email: string;
  identificacion: string;
  estado: string;
  nota_final: number | null;
  asistencia_porcentaje: number;
  totalClases: number;
  presentes: number;
}

interface Tema {
  id: string;
  titulo: string;
  descripcion?: string;
  orden?: number;
  numero_ciclo?: number;
  nombre_ciclo?: string;
  created_at?: string;
}

interface Sesion {
  id: string;
  fecha: string;
  horas_dictadas: number;
  tema_visto?: string;
  asistencia?: number;
  observaciones?: string;
}

type ParamsLike = Promise<{ id: string }>;

export default function CursoShowPage({ params }: { params: ParamsLike }) {
  const { message, modal } = App.useApp();
  const [cursoId, setCursoId] = useState<string>("");
  const [curso, setCurso] = useState<any>(null);
  const [estudiantes, setEstudiantes] = useState<Student[]>([]);
  const [notaEdicion, setNotaEdicion] = useState<Record<string, number | null>>({});
  const [estadoEdicion, setEstadoEdicion] = useState<Record<string, string>>({});
  const [savingNotaId, setSavingNotaId] = useState<string | null>(null);
  const [calificacionesTema, setCalificacionesTema] = useState<Record<string, Record<string, number | null>>>({});
  const [savingCalificacionId, setSavingCalificacionId] = useState<string | null>(null);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTemaVisible, setModalTemaVisible] = useState(false);
  const [modalSesionVisible, setModalSesionVisible] = useState(false);
  const [formTema] = Form.useForm();
  const [formSesion] = Form.useForm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdminView = searchParams?.get("admin") === "1";
  const returnTo = isAdminView ? "/cursos" : "/mi-oficina";

  const guardarNota = useCallback(
    async (matriculaId: string | number, nota: number | null, estado: string) => {
      if (nota == null || Number.isNaN(nota)) {
        message.warning("Ingresa una nota válida (0 a 5)");
        return;
      }
      setSavingNotaId(String(matriculaId));
      try {
        const { error } = await supabaseBrowserClient
          .from("matriculas")
          .update({ nota_final: nota, estado })
          .eq("id", matriculaId);

        if (error) {
          message.error("Error guardando nota: " + error.message);
        } else {
          message.success("Nota actualizada");
          setEstudiantes((prev) =>
            prev.map((est) =>
              est.id === matriculaId ? { ...est, nota_final: nota, estado } : est
            )
          );
        }
      } catch (err) {
        console.error(err);
        message.error("Error inesperado guardando nota");
      } finally {
        setSavingNotaId(null);
      }
    },
    [message]
  );

  const guardarNotaTema = useCallback(
    async (temaId: string | number, matriculaId: string | number, nota: number | null) => {
      if (nota == null || Number.isNaN(nota)) {
        message.warning("Ingresa una nota válida (0 a 5)");
        return;
      }
      const key = `${temaId}-${matriculaId}`;
      setSavingCalificacionId(key);
      try {
        const payload: any = {
          tema_id: temaId,
          matricula_id: matriculaId,
          nota,
          calificacion: nota,
          tipo_evaluacion: "tema",
        };

        const { data: existente, error: errExistente } = await supabaseBrowserClient
          .from("calificaciones")
          .select("id")
          .eq("matricula_id", matriculaId)
          .eq("tema_id", temaId)
          .maybeSingle();

        if (errExistente) {
          message.error("Error validando nota de tema: " + errExistente.message);
          return;
        }

        if (existente?.id) {
          const { error: errUpdate } = await supabaseBrowserClient
            .from("calificaciones")
            .update({
              nota,
              calificacion: nota,
              tipo_evaluacion: "tema",
            })
            .eq("id", existente.id);

          if (errUpdate) {
            message.error("Error actualizando nota de tema: " + errUpdate.message);
            return;
          }
        } else {
          const { error: errInsert } = await supabaseBrowserClient
            .from("calificaciones")
            .insert(payload);

          if (errInsert) {
            message.error("Error guardando nota de tema: " + errInsert.message);
            return;
          }
        }

        setCalificacionesTema((prev) => ({
          ...prev,
          [String(temaId)]: {
            ...(prev[String(temaId)] || {}),
            [String(matriculaId)]: nota,
          },
        }));
        message.success("Nota guardada");
      } catch (err) {
        console.error(err);
        message.error("Error inesperado guardando nota de tema");
      } finally {
        setSavingCalificacionId(null);
      }
    },
    [message]
  );

  // Resolver params si es una Promise
  useEffect(() => {
    (async () => {
      if (params instanceof Promise) {
        const resolvedParams = await params;
        setCursoId(resolvedParams.id);
      } else {
        setCursoId((params as any).id);
      }
    })();
  }, [params]);
  const [activeTab, setActiveTab] = useState("1");

  // Memoized columns to avoid re-creation on every render
  const columnasSesiones = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        render: (fecha: string) => dayjs(fecha).format("DD MMM YYYY"),
        sorter: (a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
      },
      {
        title: "Tema",
        dataIndex: "tema_visto",
        render: (tema: string) => (tema ? <Tag>{tema}</Tag> : <Text type="secondary">-</Text>),
      },
      {
        title: "Horas Dictadas",
        dataIndex: "horas_dictadas",
        align: "center" as const,
        render: (horas: number) => <Tag color="blue">{horas}h</Tag>,
      },
      {
        title: "Observaciones",
        dataIndex: "observaciones",
        ellipsis: true,
        render: (obs: string) => (obs ? <Text type="secondary">{obs}</Text> : <Text type="secondary">-</Text>),
      },
    ],
    []
  );

  const estadoOptions = useMemo(
    () => [
      "aprobado",
      "certificado",
      "en curso",
      "activo",
      "reprobado",
      "pendiente_pago",
    ],
    []
  );

  const columnasCalificaciones = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "nombre_completo",
        render: (text: string, record: any) => (
          <Space direction="vertical" size={0}>
            <Text strong>{text}</Text>
            {record.estado === "pendiente_pago" ? (
              <Tag color="default">PENDIENTE PAGO</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "Nota Final",
        dataIndex: "nota_final",
        render: (nota: number, record: any) => {
          if (!nota) return <Text type="secondary">Pendiente</Text>;
          let color = "success";
          if (nota < 3) color = "error";
          if (nota < 4) color = "warning";
          return <Tag color={record.estado === "pendiente_pago" ? "default" : color}>{nota.toFixed(1)}/5.0</Tag>;
        },
        width: 120,
      },
      {
        title: "Estado",
        dataIndex: "estado",
        render: (estado: string) => {
          let color = "default";
          if (estado === "aprobado" || estado === "certificado") color = "success";
          if (estado === "activo") color = "processing";
          return <Tag color={color}>{estado?.toUpperCase()}</Tag>;
        },
        width: 140,
      },
      {
        title: "Calificar",
        render: (_: any, record: any) => {
          const currentNota = notaEdicion[String(record.id)] ?? record.nota_final ?? null;
          const currentEstado = estadoEdicion[String(record.id)] ?? record.estado ?? "en curso";
          const habilitado = currentEstado !== "pendiente_pago";
          const disabled = currentNota == null || Number.isNaN(currentNota) || !habilitado;
          return (
            <Space direction="vertical" size={8}>
              <InputNumber
                min={0}
                max={5}
                step={0.1}
                value={currentNota}
                disabled={!habilitado}
                onChange={(value) => setNotaEdicion((prev) => ({ ...prev, [record.id]: value === null ? null : Number(value) }))}
                style={{ width: 120 }}
              />
              <Select
                size="small"
                value={currentEstado}
                onChange={(value) => setEstadoEdicion((prev) => ({ ...prev, [record.id]: value }))}
                style={{ width: 140 }}
                options={estadoOptions.map((opt) => ({ label: opt.toUpperCase(), value: opt }))}
              />
              <Button
                type="primary"
                size="small"
                loading={savingNotaId === String(record.id)}
                disabled={disabled}
                onClick={() => guardarNota(record.id, currentNota, currentEstado)}
              >
                Guardar
              </Button>
            </Space>
          );
        },
        width: 200,
      },
    ],
    [estadoEdicion, estadoOptions, notaEdicion, savingNotaId, guardarNota]
  );

  const cargarDatos = useCallback(async (id: string) => {
    setLoading(true);
    try {
      // Curso
      const { data: cursoData, error: errorCurso } = await supabaseBrowserClient
        .from("cursos")
        .select("*")
        .eq("id", parseInt(id))
        .maybeSingle();
      
      if (errorCurso || !cursoData) {
        console.error("Error cargando curso:", errorCurso || { message: "Curso no encontrado" });
        setLoading(false);
        return;
      }

      // Profesor
      let cursoConProfesor = cursoData;
      if (cursoData?.profesor_id) {
        const { data: profesorData } = await supabaseBrowserClient
          .from("perfiles")
          .select("nombre_completo")
          .eq("id", cursoData.profesor_id)
          .single();
        cursoConProfesor = { ...cursoData, perfiles: profesorData };
      }
      
      setCurso(cursoConProfesor);

      // Estudiantes
      const { data: matriculasData } = await supabaseBrowserClient
        .from("matriculas")
        .select("id, estudiante_id, estado, nota_final")
        .eq("curso_id", parseInt(id));

      if (matriculasData) {
        const estudiantesConAsistencia = await Promise.all(
          matriculasData.map(async (matricula: any) => {
            // Obtener datos del estudiante
            const { data: estudiante } = await supabaseBrowserClient
              .from("perfiles")
              .select("nombre_completo, email, identificacion")
              .eq("id", matricula.estudiante_id)
              .single();

            // Obtener asistencia
            const { data: asistencias } = await supabaseBrowserClient
              .from("asistencias")
              .select("estado")
              .eq("matricula_id", matricula.id);

            const totalClases = asistencias?.length || 0;
            const presentes = asistencias?.filter(a => a.estado === "presente").length || 0;
            const porcentaje = totalClases > 0 ? (presentes / totalClases) * 100 : 0;

            return {
              id: matricula.id,
              nombre_completo: estudiante?.nombre_completo || "Sin nombre",
              email: estudiante?.email || "-",
              identificacion: estudiante?.identificacion || "-",
              estado: matricula.estado,
              nota_final: matricula.nota_final,
              asistencia_porcentaje: Math.round(porcentaje),
              totalClases,
              presentes
            };
          })
        );
        setEstudiantes(estudiantesConAsistencia);
        const notasIniciales: Record<string, number | null> = {};
        const estadosIniciales: Record<string, string> = {};
        estudiantesConAsistencia.forEach((est) => {
          notasIniciales[String(est.id)] = est.nota_final ?? null;
          estadosIniciales[String(est.id)] = est.estado;
        });
        setNotaEdicion(notasIniciales);
        setEstadoEdicion(estadosIniciales);

        const matriculaIds = estudiantesConAsistencia.map((e) => e.id);
        if (matriculaIds.length > 0) {
          const { data: califData } = await supabaseBrowserClient
            .from("calificaciones")
            .select("matricula_id, tema_id, nota, calificacion")
            .in("matricula_id", matriculaIds);

          const mapa: Record<string, Record<string, number | null>> = {};
          (califData || []).forEach((c: any) => {
            const temaKey = String(c.tema_id);
            const matKey = String(c.matricula_id);
            const valor = c.calificacion ?? c.nota ?? null;
            if (!mapa[temaKey]) mapa[temaKey] = {};
            mapa[temaKey][matKey] = valor;
          });
          setCalificacionesTema(mapa);
        }
      }

      // Temario desde programa académico
      if (cursoConProfesor?.programa_id) {
        const programaIds = [String(cursoConProfesor.programa_id)];

        const [temasData, materialesData, materialesClaseData] = await Promise.all([
          obtenerPensumPorProgramas(programaIds),
          obtenerMaterialesPorProgramas(programaIds),
          obtenerMaterialesClasePorProgramas(programaIds),
        ]);

        setTemas(temasData || []);
        setMateriales(materialesData || []);
        setMaterialesClase(materialesClaseData || []);
      } else {
        setTemas([]);
        setMateriales([]);
        setMaterialesClase([]);
      }

      // Sesiones de clase
      const { data: sesionesData } = await supabaseBrowserClient
        .from("sesiones_clase")
        .select("*")
        .eq("curso_id", parseInt(id))
        .order("fecha", { ascending: false });
      setSesiones(sesionesData || []);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const resolveParams = async () => {
      const resolved = await params;
      if (resolved?.id) {
        setCursoId(resolved.id);
        cargarDatos(resolved.id);
      }
    };
    resolveParams();
  }, [params, cargarDatos]);

  const actualizarEstadoMatricula = useCallback(async (matriculaId: number, nuevoEstado: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("matriculas")
        .update({ estado: nuevoEstado })
        .eq("id", matriculaId);
      if (error) throw error;
      message.success(`Matrícula marcada como ${nuevoEstado}`);
      await cargarDatos(cursoId);
    } catch (error: any) {
      message.error("No se pudo actualizar la matrícula");
      console.error(error);
    }
  }, [cursoId, cargarDatos, message]);

  const handleAccionMatricula = useCallback((key: string, record: any) => {
    if (key === "completada" || key === "cancelada" || key === "retirada") {
      actualizarEstadoMatricula(record.id, key);
    }
  }, [actualizarEstadoMatricula]);

  const columnasEstudiantes = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "nombre_completo",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      { title: "Identificación", dataIndex: "identificacion", width: 150 },
      { title: "Email", dataIndex: "email", ellipsis: true },
      {
        title: "Estado",
        dataIndex: "estado",
        render: (estado: string) => {
          let color = "default";
          if (estado === "activo") color = "success";
          if (estado === "aprobado" || estado === "certificado") color = "blue";
          if (estado === "cancelado") color = "error";
          return <Tag color={color}>{estado?.toUpperCase()}</Tag>;
        },
        width: 120,
      },
      {
        title: "Asistencia",
        dataIndex: "asistencia_porcentaje",
        render: (porcentaje: number) => {
          let color = "success";
          if (porcentaje < 80) color = "warning";
          if (porcentaje < 70) color = "error";
          return <Tag color={color}>{porcentaje}%</Tag>;
        },
        width: 100,
        sorter: (a: any, b: any) => a.asistencia_porcentaje - b.asistencia_porcentaje,
      },
      {
        title: "Acciones",
        key: "acciones",
        width: 280,
        render: (_: any, record: any) => {
          const esActivo = record.estado === "activo";
          return (
            <Space wrap size="small">
              <Button 
                size="small" 
                type="primary"
                disabled={!esActivo}
                onClick={() => handleAccionMatricula("completada", record)}
              >
                Completar
              </Button>
              <Button 
                size="small" 
                disabled={!esActivo}
                onClick={() => handleAccionMatricula("cancelada", record)}
              >
                Cancelar
              </Button>
              <Button 
                size="small" 
                danger
                disabled={!esActivo}
                onClick={() => handleAccionMatricula("retirada", record)}
              >
                Retirar
              </Button>
            </Space>
          );
        },
      },
    ],
    [handleAccionMatricula]
  );

  const handleDeleteCurso = async () => {
    modal.confirm({
      title: "¿Ocultar este grupo?",
      content: (
        <div>
          <p>Se quitará el grupo de las vistas, pero se conservará todo el historial:</p>
          <ul>
            <li>Pagos y matrículas</li>
            <li>Horas dictadas</li>
            <li>Asistencias y notas</li>
          </ul>
          <p>Recomendado cuando no quieres que aparezca en listados pero necesitas mantener los datos.</p>
        </div>
      ),
      okText: "Sí, ocultar",
      okType: "danger",
      cancelText: "Cancelar",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("cursos")
            .update({ estado: "eliminado" })
            .eq("id", parseInt(cursoId));
          if (error) throw error;
          message.success("Grupo ocultado. El historial se mantiene.");
          router.push("/cursos");
        } catch (error: any) {
          message.error("No se pudo ocultar el grupo");
          console.error(error);
        }
      }
    });
  };

  const handleToggleEstadoGrupo = async () => {
    const esActivo = curso.estado === "activo";
    const nuevoEstado = esActivo ? "finalizado" : "activo";
    const accion = esActivo ? "finalizar" : "reactivar";

    try {
      if (esActivo) {
        const activos = estudiantes.filter(e => e.estado === "activo");
        if (activos.length > 0) {
          modal.warning({
            title: "No se puede finalizar el grupo",
            content: (
              <div>
                <p>Este grupo tiene <strong>{activos.length} estudiantes activos</strong>. Antes de finalizarlo debes:</p>
                <ol>
                  <li>En esta misma vista, usar los botones en la lista de estudiantes</li>
                  <li>Marcar las matrículas como completada, cancelada o retirada según corresponda</li>
                  <li>Una vez que todas las matrículas estén cerradas, podrás finalizar el grupo</li>
                </ol>
                <p><strong>Estudiantes activos:</strong></p>
                <ul>
                  {activos.slice(0, 5).map((m: any) => (
                    <li key={m.id}>{m.nombre_completo}</li>
                  ))}
                  {activos.length > 5 && <li>... y {activos.length - 5} más</li>}
                </ul>
              </div>
            ),
            okText: "Entendido",
          });
          return;
        }
      }

      modal.confirm({
        title: esActivo ? "¿Finalizar este grupo?" : "¿Reactivar este grupo?",
        content: esActivo ? (
          <div>
            <p>Estás a punto de <strong>finalizar</strong> el grupo:</p>
            <p><strong>{curso.nombre}</strong></p>
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
            <p><strong>{curso.nombre}</strong></p>
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
            .eq("id", parseInt(cursoId));
          if (error) throw error;
          message.success(`Grupo ${nuevoEstado === 'activo' ? 'reactivado' : 'finalizado'} correctamente`);
          await cargarDatos(cursoId);
        },
      });
    } catch (error: any) {
      message.error(`Error al ${accion} el grupo`);
      console.error(error);
    }
  };

  const onAddTema = async (values: any) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("temas_curso")
        .insert({
          curso_id: parseInt(cursoId),
          titulo: values.titulo,
          descripcion: values.descripcion,
          orden: values.orden || (temas.length + 1)
        });

      if (error) throw error;
      formTema.resetFields();
      setModalTemaVisible(false);
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error agregando tema:", error);
    }
  };

  const onAddSesion = async (values: any) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("sesiones_clase")
        .insert({
          curso_id: parseInt(cursoId),
          profesor_id: curso.profesor_id,
          fecha: values.fecha.format("YYYY-MM-DD"),
          horas_dictadas: values.horas_dictadas,
          tema_visto: values.tema_visto,
          observaciones: values.observaciones
        });

      if (error) throw error;
      formSesion.resetFields();
      setModalSesionVisible(false);
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error agregando sesión:", error);
    }
  };

  const onDeleteTema = async (temaId: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("temas_curso")
        .delete()
        .eq("id", temaId);

      if (error) throw error;
      await cargarDatos(cursoId);
    } catch (error) {
      console.error("Error eliminando tema:", error);
    }
  };

  if (loading) {
    return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;
  }

  if (!curso) {
    return (
      <Card style={{ padding: 50 }}>
        <Alert message="Curso no encontrado" type="error" />
      </Card>
    );
  }

  const totalEstudiantes = estudiantes.length;
  const estudiantesActivos = estudiantes.filter(e => e.estado === "activo").length;
  const promedioAsistencia = estudiantes.length > 0
    ? Math.round(estudiantes.reduce((sum, e) => sum + e.asistencia_porcentaje, 0) / estudiantes.length)
    : 0;
  const estudiantesEnRiesgo = estudiantes.filter(e => e.asistencia_porcentaje < (curso.porcentaje_minimo || 80)).length;
  const notas = estudiantes.filter((e) => e.nota_final !== null && e.nota_final !== undefined);
  const promedioNota = notas.length > 0
    ? (notas.reduce((sum, e) => sum + (e.nota_final || 0), 0) / notas.length)
    : 0;
  const cuposTotales = curso.cupos || 0;
  const cuposOcupados = totalEstudiantes;

  return (
    <div style={{ padding: 24 }}>
      {/* ENCABEZADO - OFICINA DEL PROFESOR */}
      <div style={{ marginBottom: 28, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: 28, borderRadius: 10 }}>
        <Space direction="vertical" style={{ width: "100%" }} size={20}>
          <Space wrap size={20} style={{ alignItems: "center" }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push(returnTo)}
              style={{ background: "rgba(255,255,255,0.3)" }}
            >
              Volver
            </Button>
            <Title level={2} style={{ margin: 0, color: "white" }}>{construirNombreGrupo(curso)}</Title>
            <Space wrap size={20} style={{ marginTop: 4 }}>
              <Button icon={<BookOutlined />} onClick={() => setActiveTab("1")}>
                Ver Temario
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => router.push(`/asistencias/create?curso_id=${cursoId}&curso_nombre=${encodeURIComponent(construirNombreGrupo(curso))}`)}
              >
                Llamar Lista
              </Button>
              <Button icon={<FormOutlined />} onClick={() => setActiveTab("5")}>
                Calificar Tareas
              </Button>
              {isAdminView && (
                <>
                  <Button icon={<EditOutlined />} onClick={() => router.push(`/cursos/edit/${cursoId}`)}>
                    Editar curso
                  </Button>
                  <Button danger icon={<DeleteOutlined />} onClick={handleDeleteCurso}>
                    Eliminar curso
                  </Button>
                  {curso.estado === 'activo' && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>{estudiantesActivos} activos</Tag>
                  )}
                  <Button 
                    type={curso.estado === 'activo' ? 'default' : 'primary'}
                    danger={curso.estado === 'activo'}
                    onClick={handleToggleEstadoGrupo}
                  >
                    {curso.estado === 'activo' ? 'Finalizar Grupo' : 'Reactivar Grupo'}
                  </Button>
                </>
              )}
            </Space>
          </Space>
          <div>
            <Text style={{ color: "rgba(255,255,255,0.9)" }}>

          {/* RESUMEN RÁPIDO DEL CURSO */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Estudiantes" value={`${estudiantesActivos}/${totalEstudiantes}`} suffix="activos" />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Promedio asistencia" value={promedioAsistencia} suffix="%" />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Promedio nota" value={promedioNota} precision={1} suffix="/5" />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Cupos" value={cuposOcupados} suffix={cuposTotales ? `/ ${cuposTotales}` : ""} />
              </Card>
            </Col>
          </Row>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical">
              <Text><strong>Horario:</strong> {curso.dias_semana || "-"} {curso.hora_inicio && `• ${dayjs(curso.hora_inicio, 'HH:mm:ss').format('h:mm A')}`} {curso.hora_fin && ` - ${dayjs(curso.hora_fin, 'HH:mm:ss').format('h:mm A')}`}</Text>
              <Text><strong>Fecha de inicio:</strong> {curso.fecha_inicio ? dayjs(curso.fecha_inicio).format('DD MMM YYYY') : "-"}</Text>
              <Text><strong>Fecha de fin:</strong> {curso.fecha_fin ? dayjs(curso.fecha_fin).format('DD MMM YYYY') : "No definida"}</Text>
            </Space>
          </Card>
              👨‍🏫 Profesor: <strong>{curso.perfiles?.nombre_completo || "Sin asignar"}</strong> • 📅 Inicio: {dayjs(curso.fecha_inicio).format("DD MMM YYYY")} • ⏱️ Duración: {curso.duracion}
            </Text>
          </div>
        </Space>
      </div>

      {/* ESTADÍSTICAS RÁPIDAS */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Estudiantes" value={totalEstudiantes} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Activos" value={estudiantesActivos} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Asistencia" value={promedioAsistencia} suffix="%" valueStyle={{ color: promedioAsistencia >= 80 ? "#52c41a" : "#ff4d4f" }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="En Riesgo" value={estudiantesEnRiesgo} valueStyle={{ color: estudiantesEnRiesgo > 0 ? "#ff4d4f" : "#52c41a" }} />
          </Card>
        </Col>
      </Row>

      {/* TABS - OFICINA COMPLETA DEL PROFESOR */}
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Temario / Pensum ({temas.length})</span>,
            children: (
              <Card
                title="Contenido del Curso - Temario"
                extra={isAdminView ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalTemaVisible(true)}>
                    Agregar Tema
                  </Button>
                ) : null}
              >
                {temas.length > 0 ? (
                  <List
                    dataSource={temas}
                    renderItem={(tema, index) => (
                      <List.Item key={tema?.id ?? index}
                        actions={isAdminView ? [
                          <Button key={`eliminar-tema-${tema?.id ?? index}`} type="link" danger icon={<DeleteOutlined />} onClick={() => onDeleteTema(tema.id)}>
                            Eliminar
                          </Button>
                        ] : []}
                      >
                        <List.Item.Meta
                          avatar={<span style={{ fontSize: 24, fontWeight: "bold", color: "#667eea" }}>{tema.orden || tema.numero_ciclo || index + 1}</span>}
                          title={<Text strong>{tema.nombre_ciclo || tema.titulo || `Tema ${index + 1}`}</Text>}
                          description={tema.descripcion || ""}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="No hay temas registrados en el programa." />
                )}
              </Card>
            )
          },
          {
            key: "2",
            label: <span><FileOutlined /> Material Didáctico</span>,
            children: (
              <Card
                title="Recursos y Material para la Enseñanza"
                extra={isAdminView ? (
                  <Upload maxCount={5} multiple>
                    <Button type="primary" icon={<PlusOutlined />}>
                      Subir Material
                    </Button>
                  </Upload>
                ) : null}
              >
                <Alert
                  message="Material controlado desde el programa académico"
                  description="El temario y los recursos provienen del programa académico. Para cambios, contacta a un administrador."
                  type="info"
                  showIcon
                />
                {materiales.length > 0 || materialesClase.length > 0 ? (
                  (() => {
                    const pensumNombre = (pensumId?: string | number | null) => {
                      if (pensumId == null) return "Sin ciclo";
                      const numericId = typeof pensumId === "string" ? Number(pensumId) : pensumId;
                      const match = temas.find((t: any) => t.id === numericId || t.id === pensumId);
                      if (match) {
                        if (match.nombre_ciclo) return match.nombre_ciclo;
                        if (match.titulo) return match.titulo;
                        if (match.numero_ciclo) return `Ciclo ${match.numero_ciclo}`;
                      }
                      return "Sin ciclo";
                    };

                    const grupos = materiales.reduce<Record<string, any[]>>((acc, mat) => {
                      const keyValue = mat.pensum_id ?? "sin-ciclo";
                      const key = String(keyValue);
                      acc[key] = acc[key] || [];
                      acc[key].push(mat);
                      return acc;
                    }, {});

                    return (
                      <Space direction="vertical" size={16} style={{ marginTop: 16, width: "100%" }}>
                        {materialesClase.length > 0 ? (
                          (() => {
                            const agrupadosPorTema = materialesClase.reduce<Record<string, any[]>>((acc, material) => {
                              const key = String(material.pensum_curso_id || "sin-tema");
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(material);
                              return acc;
                            }, {});

                            const temasOrden = new Map<string, number>();
                            temas.forEach((ciclo: any) => {
                              (ciclo?.pensum_cursos || []).forEach((tema: any) => {
                                temasOrden.set(String(tema.id), Number(tema?.orden ?? 0));
                              });
                            });

                            const entriesTemaOrdenadas = Object.entries(agrupadosPorTema).sort(([temaA], [temaB]) => {
                              const ordenA = temasOrden.get(String(temaA)) ?? 0;
                              const ordenB = temasOrden.get(String(temaB)) ?? 0;
                              if (ordenB !== ordenA) return ordenB - ordenA;
                              return Number(temaB) - Number(temaA);
                            });

                            return (
                              <Card type="inner" title="Materiales necesarios por clase" style={{ marginBottom: 8 }}>
                                <List
                                  dataSource={entriesTemaOrdenadas}
                                  renderItem={([temaId, items]) => {
                                    const temaNombre = (items?.[0] as any)?.pensum_cursos?.nombre_curso || "Clase";
                                    return (
                                      <List.Item key={`req-${temaId}`}>
                                        <List.Item.Meta
                                          title={<Text strong>{temaNombre}</Text>}
                                          description={
                                            <Space direction="vertical" size={4}>
                                              {(items as any[]).map((item: any) => (
                                                <Text key={item.id} type="secondary">
                                                  • {item.nombre_material}
                                                  {item.cantidad ? ` (${item.cantidad}${item.unidad ? ` ${item.unidad}` : ""})` : ""}
                                                  {item.obligatorio ? " • obligatorio" : " • opcional"}
                                                  {item.observaciones ? ` — ${item.observaciones}` : ""}
                                                </Text>
                                              ))}
                                            </Space>
                                          }
                                        />
                                      </List.Item>
                                    );
                                  }}
                                />
                              </Card>
                            );
                          })()
                        ) : null}

                        {Object.entries(grupos)
                          .sort(([a], [b]) => {
                            const matchA = temas.find((t: any) => String(t.id) === String(a));
                            const matchB = temas.find((t: any) => String(t.id) === String(b));
                            const ordenA = Number(matchA?.orden ?? matchA?.numero_ciclo ?? 0);
                            const ordenB = Number(matchB?.orden ?? matchB?.numero_ciclo ?? 0);
                            if (ordenB !== ordenA) return ordenB - ordenA;
                            return Number(b) - Number(a);
                          })
                          .map(([key, mats]) => (
                          <Card
                            key={key}
                            type="inner"
                            title={`Ciclo / Tema: ${pensumNombre(key === "sin-ciclo" ? null : key)}`}
                          >
                            <List
                              dataSource={mats}
                              renderItem={(material) => (
                                <List.Item
                                  key={material.id}
                                  extra={material.url_archivo ? (
                                    <a href={material.url_archivo} target="_blank" rel="noreferrer">
                                      Descargar
                                    </a>
                                  ) : null}
                                >
                                  <List.Item.Meta
                                    title={<Text strong>{material.titulo || material.nombre_archivo || "Recurso"}</Text>}
                                    description={
                                      <Space direction="vertical" size={2}>
                                        {material.descripcion ? <Text type="secondary">{material.descripcion}</Text> : null}
                                        <Space size={8} wrap>
                                          {material.tipo_material ? <Tag>{material.tipo_material}</Tag> : null}
                                          {material.orden ? <Tag color="blue">Orden {material.orden}</Tag> : null}
                                        </Space>
                                      </Space>
                                    }
                                  />
                                </List.Item>
                              )}
                            />
                          </Card>
                        ))}
                      </Space>
                    );
                  })()
                ) : (
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary">No hay material didáctico publicado para este programa.</Text>
                  </div>
                )}
              </Card>
            )
          },
          {
            key: "3",
            label: <span><ClockCircleOutlined /> Sesiones de Clase ({sesiones.length})</span>,
            children: (
              <Card
                title="Registro de Sesiones y Clases Dictadas"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSesionVisible(true)}>
                    Registrar Sesión
                  </Button>
                }
              >
                <Table
                  dataSource={sesiones}
                  rowKey="id"
                  pagination={{ pageSize: 15 }}
                  columns={columnasSesiones}
                />
              </Card>
            )
          },
          {
            key: "4",
            label: <span><UserOutlined /> Estudiantes ({totalEstudiantes})</span>,
            children: (
              <Card title="Lista de Estudiantes Matriculados">
                <Table
                  dataSource={estudiantes}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                  columns={columnasEstudiantes}
                />
              </Card>
            )
          },
          {
            key: "5",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Alert
                  message="Calificaciones por tema"
                  description="Cada tema del temario debe tener su nota. Los estudiantes pendientes de pago no pueden ser calificados."
                  type="info"
                  showIcon
                  style={{ padding: "8px 10px" }}
                />
                {temas.length === 0 ? (
                  <Card><Empty description="No hay temario cargado" /></Card>
                ) : (
                  temas.map((tema) => (
                    <Card
                      key={tema.id}
                      title={<Text strong style={{ fontSize: 14 }}>{`Tema: ${tema.nombre_ciclo || tema.titulo || "Tema"}`}</Text>}
                      style={{ marginBottom: 8 }}
                      bodyStyle={{ padding: 10 }}
                      headStyle={{ padding: "8px 12px", background: "#0f172a0f" }}
                    >
                      <Table
                        size="small"
                        dataSource={estudiantes}
                        rowKey="id"
                        pagination={false}
                        style={{ marginTop: 4 }}
                        columns={[
                          {
                            title: "Nombre",
                            dataIndex: "nombre_completo",
                            render: (text: string, record: any) => (
                              <Space direction="vertical" size={0}>
                                <Text strong>{text}</Text>
                                {record.estado === "pendiente_pago" ? (
                                  <Tag color="default">PENDIENTE PAGO</Tag>
                                ) : null}
                              </Space>
                            ),
                          },
                          {
                            title: "Nota (0-5)",
                            width: 140,
                            render: (_: any, record: any) => {
                              const current = calificacionesTema[String(tema.id)]?.[String(record.id)] ?? null;
                              const habilitado = record.estado !== "pendiente_pago";
                              return (
                                <InputNumber
                                  min={0}
                                  max={5}
                                  step={0.1}
                                  value={current}
                                  disabled={!habilitado}
                                  onChange={(val) =>
                                    setCalificacionesTema((prev) => ({
                                      ...prev,
                                      [String(tema.id)]: {
                                        ...(prev[String(tema.id)] || {}),
                                        [String(record.id)]: val === null ? null : Number(val),
                                      },
                                    }))
                                  }
                                  style={{ width: 110 }}
                                />
                              );
                            },
                          },
                          {
                            title: "Guardar",
                            width: 120,
                            render: (_: any, record: any) => {
                              const current = calificacionesTema[String(tema.id)]?.[String(record.id)] ?? null;
                              const habilitado = record.estado !== "pendiente_pago";
                              const saving = savingCalificacionId === `${tema.id}-${record.id}`;
                              return (
                                <Button
                                  type="primary"
                                  size="small"
                                  disabled={!habilitado || current == null || Number.isNaN(current)}
                                  loading={saving}
                                  onClick={() => guardarNotaTema(tema.id, record.id, current)}
                                >
                                  Guardar
                                </Button>
                              );
                            },
                          },
                        ]}
                      />
                    </Card>
                  ))
                )}
              </Space>
            )
          }
        ]}
      />

      {/* MODAL AGREGAR TEMA */}
      <Modal
        title="Agregar Tema al Temario"
        open={isAdminView && modalTemaVisible}
        onOk={() => formTema.submit()}
        onCancel={() => setModalTemaVisible(false)}
      >
        <Form form={formTema} layout="vertical" onFinish={onAddTema}>
          <Form.Item label="Número de Orden" name="orden">
            <InputNumber min={1} placeholder="Ej: 1, 2, 3..." />
          </Form.Item>
          <Form.Item label="Título del Tema" name="titulo" rules={[{ required: true }]}>
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>
          <Form.Item label="Descripción" name="descripcion">
            <Input.TextArea rows={3} placeholder="Describe brevemente qué se cubrirá en este tema..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL REGISTRAR SESIÓN */}
      <Modal
        title="Registrar Sesión de Clase"
        open={modalSesionVisible}
        onOk={() => formSesion.submit()}
        onCancel={() => setModalSesionVisible(false)}
      >
        <Form form={formSesion} layout="vertical" onFinish={onAddSesion}>
          <Form.Item label="Fecha" name="fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Horas Dictadas" name="horas_dictadas" rules={[{ required: true }]}>
            <InputNumber min={0.5} step={0.5} placeholder="Ej: 2" />
          </Form.Item>
          <Form.Item label="Tema Visto" name="tema_visto">
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>
          <Form.Item label="Observaciones" name="observaciones">
            <Input.TextArea rows={3} placeholder="Notas sobre la clase..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
