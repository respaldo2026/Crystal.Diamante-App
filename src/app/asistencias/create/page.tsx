"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Form, DatePicker, Card, Table, Switch, Button, Row, Col, Alert, Tag, Space, Statistic, Typography, Spin, App, Grid, Select } from "antd";
import { CheckOutlined, CloseOutlined, ArrowLeftOutlined, SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useRouter } from "next/navigation";
import { enviarWhatsapp } from "@/modules/comunicacion/whatsapp.service";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@utils/date";
import { buildWhatsappFallbackMessage } from "@/constants/whatsappTemplates";

const { Title, Text } = Typography;

const AUTO_SESSION_TOPIC_PATTERN = /sesion programada automatic[ae]mente para calculo de ciclos/i;

const extractClassNumber = (value?: string | null): number | null => {
  const text = String(value || "");
  const patterns = [
    /clase\s*#?\s*(\d{1,3})/i,
    /^\s*(\d{1,3})\s*[\).:-]/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

export default function TomarAsistencia() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursoSeleccionado, setCursoSeleccionado] = useState<number | null>(null);
  const [fecha, setFecha] = useState(dayjs());
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [cursoNombre, setCursoNombre] = useState<string>("");
  const [cursos, setCursos] = useState<any[]>([]);
  const [temaVisto, setTemaVisto] = useState("");
  const [numeroClase, setNumeroClase] = useState<number | null>(null);
  const [clasesDisponibles, setClasesDisponibles] = useState<Array<{ numero: number; nombre: string }>>([]);
  const [clasesRegistradas, setClasesRegistradas] = useState<Set<number>>(new Set());
  const [claseRegistradaEnFecha, setClaseRegistradaEnFecha] = useState<number | null>(null);
  
  // Estado local para guardar la asistencia antes de enviarla
  // Formato: { "id_matricula": "presente", ... }
  const [asistenciasMap, setAsistenciasMap] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const cursoIdParam = searchParams.get("curso_id") || searchParams.get("cursoId");
  const returnTo = useMemo(
    () => searchParams.get("return") || (cursoIdParam ? `/cursos/show/${cursoIdParam}` : "/cursos"),
    [cursoIdParam, searchParams]
  );

  const extractTotalClases = useCallback((value: unknown): number | null => {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return Math.floor(asNumber);
    }

    const text = String(value || "").trim();
    if (!text) return null;

    const match = text.match(/(\d{1,3})\s*clases?/i) || text.match(/^(\d{1,3})$/);
    if (!match?.[1]) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, []);

  const esMatriculaHabilitada = useCallback((matricula: any) => {
    const estado = String(matricula?.estado || "").toLowerCase();
    return estado === "activo" || estado === "en curso";
  }, []);

  const estaDentroCicloCincoMeses = useCallback((matricula: any) => {
    const baseDate = String(matricula?.fecha_inicio || matricula?.created_at || "").slice(0, 10);
    if (!baseDate) return false;

    const inicio = dayjs(baseDate).startOf("day");
    const hoy = dayjs().startOf("day");
    if (!inicio.isValid()) return false;
    if (inicio.isAfter(hoy, "day")) return false;

    const limiteInferior = hoy.subtract(5, "month").startOf("day");
    return !inicio.isBefore(limiteInferior, "day");
  }, []);

  // Cargar cursos al inicio
  useEffect(() => {
    const cargarCursos = async () => {
      try {
        const {
          data: { user },
        } = await supabaseBrowserClient.auth.getUser();

        let rol = "";
        if (user?.id) {
          const { data: perfil } = await supabaseBrowserClient
            .from("perfiles")
            .select("rol")
            .eq("id", user.id)
            .maybeSingle();
          rol = String(perfil?.rol || "").toLowerCase();
        }

        let cursosQuery = supabaseBrowserClient
          .from("cursos")
          .select("id, nombre, profesor_id, total_clases, duracion_horas, programa_id, programas(id, nombre, total_clases, duracion)")
          .eq("estado", "activo");

        if (rol === "profesor" && user?.id) {
          cursosQuery = cursosQuery.eq("profesor_id", user.id);
        }

        const { data, error } = await cursosQuery;
        if (error) {
          message.error("No se pudieron cargar los cursos");
          setCursos([]);
          return;
        }

        setCursos(data || []);
      } catch (error) {
        console.error(error);
        message.error("Error cargando cursos");
        setCursos([]);
      }
    };
    cargarCursos();
  }, [message]);

  // Preseleccionar curso desde la URL (dentro del grupo)
  useEffect(() => {
    if (cursoIdParam) {
      const id = Number(cursoIdParam);
      setCursoSeleccionado(id);

      const nombreParam = searchParams.get("curso_nombre") || searchParams.get("cursoNombre");
      if (nombreParam) {
        setCursoNombre(nombreParam);
      } else {
        const cursoInfo = cursos.find((c) => c.id === id);
        if (cursoInfo?.nombre) {
          setCursoNombre(cursoInfo.nombre);
        }
      }
    } else if (cursos.length > 0) {
      message.warning("Debes abrir asistencia desde un curso específico.");
      router.push("/cursos");
    }
  }, [searchParams, cursos, cursoIdParam, message, router]);

  // Cargar Alumnos cuando cambia el curso
  useEffect(() => {
    if (!cursoSeleccionado) {
      setAlumnos([]);
      return;
    }

    const cargarClase = async () => {
      setLoadingAlumnos(true);
      try {
        // Buscamos matriculas ACTIVAS de este curso
        const { data, error } = await supabaseBrowserClient
          .from("matriculas")
          .select(`id, estudiante_id, estado, fecha_inicio, created_at, perfiles(nombre_completo, email, telefono, notif_whatsapp)`) 
          .eq("curso_id", cursoSeleccionado)
          .order("perfiles(nombre_completo)");

        if (error) {
          message.error("Error cargando lista de clase");
        } else {
          setAlumnos(data || []);
          // Pre-llenar solo los habilitados con "presente"; deshabilitados quedan sin valor
          const inicial: any = {};
          data?.forEach((m: any) => {
            const habilitado = esMatriculaHabilitada(m);
            inicial[m.id] = habilitado ? "presente" : undefined;
          });
          setAsistenciasMap(inicial);
        }
      } catch (error) {
        console.error(error);
        message.error("Error cargando estudiantes");
      } finally {
        setLoadingAlumnos(false);
      }
    };

    cargarClase();
  }, [cursoSeleccionado, message, esMatriculaHabilitada]);

  useEffect(() => {
    if (!cursoSeleccionado) {
      setClasesDisponibles([]);
      setClasesRegistradas(new Set());
      setClaseRegistradaEnFecha(null);
      setNumeroClase(null);
      setTemaVisto("");
      return;
    }

    setNumeroClase(null);
    setTemaVisto("");

    const cargarClasesTemario = async () => {
      try {
        const { data: cursoData, error: errorCurso } = await supabaseBrowserClient
          .from("cursos")
          .select("id, programa_id, total_clases, programas(id, total_clases, duracion)")
          .eq("id", cursoSeleccionado)
          .maybeSingle();

        if (errorCurso) {
          console.error(errorCurso);
          setClasesDisponibles([]);
          return;
        }

        let base: Array<{ numero: number; nombre: string }> = [];

        if (cursoData?.programa_id) {
          const { data: ciclosData, error: errorCiclos } = await supabaseBrowserClient
            .from("pensum")
            .select("id, numero_ciclo, orden")
            .eq("programa_id", Number(cursoData.programa_id))
            .eq("activo", true)
            .order("orden", { ascending: true });

          if (errorCiclos) {
            console.error(errorCiclos);
          }

          const ciclos = (ciclosData || []) as any[];
          const pensumIds = ciclos.map((c) => c.id).filter(Boolean);

          if (pensumIds.length > 0) {
            const { data: temasPrograma, error: errorTemasPrograma } = await supabaseBrowserClient
              .from("pensum_cursos")
              .select("id, nombre_curso, orden, pensum_id")
              .in("pensum_id", pensumIds);

            if (errorTemasPrograma) {
              console.error(errorTemasPrograma);
            } else {
              const ordenCicloByPensum = new Map<string, number>();
              ciclos.forEach((c) => {
                ordenCicloByPensum.set(
                  String(c.id),
                  Number(c?.orden || c?.numero_ciclo || 9999)
                );
              });

              const temasOrdenados = ((temasPrograma || []) as any[])
                .slice()
                .sort((a, b) => {
                  const cicloA = ordenCicloByPensum.get(String(a?.pensum_id || "")) ?? 9999;
                  const cicloB = ordenCicloByPensum.get(String(b?.pensum_id || "")) ?? 9999;
                  if (cicloA !== cicloB) return cicloA - cicloB;
                  const ordenA = Number(a?.orden || 9999);
                  const ordenB = Number(b?.orden || 9999);
                  if (ordenA !== ordenB) return ordenA - ordenB;
                  return String(a?.nombre_curso || "").localeCompare(String(b?.nombre_curso || ""), "es", { sensitivity: "base" });
                });

              base = temasOrdenados.map((item: any, index: number) => ({
                numero: index + 1,
                nombre: item?.nombre_curso || `Clase ${index + 1}`,
              }));
            }
          }
        }

        const uniqueByNumero = Array.from(
          new Map(base.map((item) => [item.numero, item])).values()
        ).sort((a, b) => a.numero - b.numero);

        const fechaSesion = fecha.format("YYYY-MM-DD");
        const { data: sesionesData, error: errorSesiones } = await supabaseBrowserClient
          .from("sesiones_clase")
          .select("id, fecha, tema_visto")
          .eq("curso_id", cursoSeleccionado)
          .order("fecha", { ascending: true });

        if (errorSesiones) {
          console.error(errorSesiones);
        }

        const registradas = new Set<number>();
        let claseDeLaFecha: number | null = null;

        (sesionesData || []).forEach((sesion: any) => {
          const tema = String(sesion?.tema_visto || "").trim();
          if (!tema || AUTO_SESSION_TOPIC_PATTERN.test(tema)) return;

          const numero = extractClassNumber(tema);
          if (!numero || !Number.isFinite(numero) || numero <= 0) return;

          registradas.add(numero);
          if (String(sesion?.fecha || "") === fechaSesion) {
            claseDeLaFecha = numero;
          }
        });

        setClasesRegistradas(registradas);
        setClaseRegistradaEnFecha(claseDeLaFecha);

        setClasesDisponibles(uniqueByNumero);
        if (claseDeLaFecha) {
          setNumeroClase(claseDeLaFecha);
          const clase = uniqueByNumero.find((item) => item.numero === claseDeLaFecha);
          setTemaVisto(clase?.nombre || "");
        }
      } catch (error) {
        console.error(error);
        setClasesDisponibles([]);
        setClasesRegistradas(new Set());
        setClaseRegistradaEnFecha(null);
      }
    };

    cargarClasesTemario();
  }, [cursoSeleccionado, fecha]);

  const opcionesClase = useMemo(() => {
    if (clasesDisponibles.length > 0) {
      return clasesDisponibles.map((clase) => ({
        value: clase.numero,
        label: `Clase ${clase.numero} · ${clase.nombre}`,
        disabled: clasesRegistradas.has(clase.numero) && clase.numero !== claseRegistradaEnFecha,
      }));
    }

    const cursoActual = cursos.find((c) => Number(c.id) === Number(cursoSeleccionado));
    const totalDesdeCurso = extractTotalClases(cursoActual?.total_clases);
    const totalDesdePrograma = extractTotalClases(cursoActual?.programas?.total_clases);
    const totalDesdeDuracionPrograma = extractTotalClases(cursoActual?.programas?.duracion);
    const totalClasesPrograma = totalDesdeCurso || totalDesdePrograma || totalDesdeDuracionPrograma || 20;

    return Array.from({ length: totalClasesPrograma }, (_, i) => {
      const numero = i + 1;
      return {
        value: numero,
        label: `Clase ${numero}`,
        disabled: clasesRegistradas.has(numero) && numero !== claseRegistradaEnFecha,
      };
    });
  }, [clasesDisponibles, clasesRegistradas, claseRegistradaEnFecha, cursos, cursoSeleccionado, extractTotalClases]);

  // Función para cambiar estado individual
  const toggleEstado = useCallback((matriculaId: number) => {
    setAsistenciasMap((prev) => ({
      ...prev,
      [matriculaId]: prev[matriculaId] === "presente" ? "ausente" : "presente",
    }));
  }, []);
  const columnasAlumnos = useMemo(
    () => [
      {
        title: "Estudiante",
        dataIndex: ["perfiles", "nombre_completo"],
        width: isMobile ? 210 : 320,
        ellipsis: true,
        render: (txt: string) => (
          <Text
            strong
            style={{
              display: "inline-block",
              maxWidth: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={txt || "Sin nombre"}
          >
            {txt || "Sin nombre"}
          </Text>
        ),
      },
      {
        title: "Email",
        dataIndex: ["perfiles", "email"],
        ellipsis: true,
        width: 250,
        responsive: ["md" as const],
      },
      {
        title: "Asistencia",
        align: "center" as const,
        width: isMobile ? 150 : 190,
        render: (_: any, record: any) => {
          const habilitado = record.estado === "activo" || record.estado === "en curso";
          const esPresente = asistenciasMap[record.id] === "presente";
          const estadoLabel = habilitado
            ? (esPresente ? "PRESENTE" : "AUSENTE")
            : (isMobile ? "PENDIENTE" : "PENDIENTE PAGO");

          return (
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                alignItems: "center",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <Switch
                disabled={!habilitado}
                checked={esPresente}
                onChange={() => toggleEstado(record.id)}
                checkedChildren={<CheckOutlined />}
                unCheckedChildren={<CloseOutlined />}
              />
              <Tag color={habilitado ? (esPresente ? "success" : "error") : "default"} style={{ margin: 0 }}>
                {estadoLabel}
              </Tag>
            </div>
          );
        },
      },
    ],
    [asistenciasMap, isMobile, toggleEstado]
  );

  // Marcar todos como presentes
  const marcarTodoPresente = () => {
    const inicial: any = {};
    alumnos.forEach((m: any) => {
      inicial[m.id] = esMatriculaHabilitada(m) ? "presente" : undefined;
    });
    setAsistenciasMap(inicial);
    message.success("Todos marcados como presentes");
  };

  // Marcar todos como ausentes
  const marcarTodoAusente = () => {
    const inicial: any = {};
    alumnos.forEach((m: any) => {
      inicial[m.id] = esMatriculaHabilitada(m) ? "ausente" : undefined;
    });
    setAsistenciasMap(inicial);
    message.success("Todos marcados como ausentes");
  };

  // GUARDAR TODO EN LA BD
  const guardarAsistencia = async () => {
    if (!cursoSeleccionado || alumnos.length === 0) {
      message.warning("Selecciona un curso primero");
      return;
    }

    if (!numeroClase || Number(numeroClase) <= 0) {
      message.warning("Selecciona el número de la clase antes de guardar");
      return;
    }

    if (clasesRegistradas.has(Number(numeroClase)) && Number(numeroClase) !== Number(claseRegistradaEnFecha || 0)) {
      message.warning(`La clase #${numeroClase} ya fue registrada en otra fecha. Usa la clase correcta o corrige la sesión existente.`);
      return;
    }

    const cursoSeleccionadoData = cursos.find((c) => Number(c.id) === Number(cursoSeleccionado));

    if (!cursoSeleccionadoData?.profesor_id) {
      message.error("⚠️ Este curso no tiene un profesor asignado. Asigna el profesor en la configuración del curso antes de registrar la sesión.");
      return;
    }

    // Usar las horas configuradas en el curso, si existen; de lo contrario 3 horas por defecto
    const HORAS_POR_SESION = Number(cursoSeleccionadoData?.duracion_horas) > 0
      ? Number(cursoSeleccionadoData.duracion_horas)
      : 3;

    setGuardando(true);
    try {
      const temaLimpio = temaVisto.trim();
      const fechaSesion = fecha.format("YYYY-MM-DD");
      const claseSeleccionada = clasesDisponibles.find((c) => Number(c.numero) === Number(numeroClase));
      const nombreClase = temaLimpio || claseSeleccionada?.nombre || `Clase ${numeroClase}`;
      const referenciaClase = `Clase #${numeroClase}`;
      const detalleClase = `${referenciaClase} · ${nombreClase}`;
      const observacionSesion = `${detalleClase}. Sesión registrada desde llamado de lista`;

      const guardarTemaSesion = async () => {
        if (!nombreClase) return;

        const payloadSesion = {
          curso_id: cursoSeleccionado,
          profesor_id: cursoSeleccionadoData?.profesor_id || null,
          fecha: fechaSesion,
          horas_dictadas: HORAS_POR_SESION,
          tema_visto: detalleClase,
          observaciones: observacionSesion,
        };

        const { error: upsertError } = await supabaseBrowserClient
          .from("sesiones_clase")
          .upsert(payloadSesion, { onConflict: "curso_id,fecha" });

        if (!upsertError) {
          return;
        }

        const upsertMessage = String(upsertError.message || "").toLowerCase();
        const constraintMissing = upsertMessage.includes("no unique")
          || upsertMessage.includes("there is no unique")
          || upsertMessage.includes("constraint")
          || upsertMessage.includes("on conflict");

        if (!constraintMissing) {
          throw upsertError;
        }

        // Fallback temporal para entornos donde aún no se haya aplicado el constraint único.
        const { data: sesionesExistentes, error: errBuscar } = await supabaseBrowserClient
          .from("sesiones_clase")
          .select("id")
          .eq("curso_id", cursoSeleccionado)
          .eq("fecha", fechaSesion)
          .limit(1);

        if (errBuscar) throw errBuscar;

        const sesionExistente = sesionesExistentes?.[0] || null;

        if (sesionExistente?.id) {
          // 2a. Ya existe → actualizar tema
          const { error: errUpdate } = await supabaseBrowserClient
            .from("sesiones_clase")
            .update({
              profesor_id: cursoSeleccionadoData?.profesor_id || null,
              horas_dictadas: HORAS_POR_SESION,
              tema_visto: detalleClase,
              observaciones: observacionSesion,
            })
            .eq("id", sesionExistente.id);
          if (errUpdate) throw errUpdate;
          return;
        }

        // 2b. No existe → insertar, ignorando 409 si acaso hay race condition
        const { error: errInsert } = await supabaseBrowserClient
          .from("sesiones_clase")
          .insert(payloadSesion);

        // Si hay 409 (conflicto de unicidad por race condition), hacer update como fallback
        if (errInsert) {
          if (errInsert.code === "23505") {
            const { data: sesion2 } = await supabaseBrowserClient
              .from("sesiones_clase")
              .select("id")
              .eq("curso_id", cursoSeleccionado)
              .eq("fecha", fechaSesion)
              .limit(1);
            const id2 = sesion2?.[0]?.id;
            if (id2) {
              await supabaseBrowserClient
                .from("sesiones_clase")
                .update({
                  profesor_id: cursoSeleccionadoData?.profesor_id || null,
                  horas_dictadas: HORAS_POR_SESION,
                  tema_visto: detalleClase,
                  observaciones: observacionSesion,
                })
                .eq("id", id2);
            }
            return;
          }
          throw errInsert;
        }
      };

      const registros = alumnos
        .map((alumno) => {
          const estado = asistenciasMap[alumno.id];
          if (estado !== "presente" && estado !== "ausente") return null;
          return {
            matricula_id: alumno.id,
            fecha: fechaSesion,
            estado,
            observaciones: detalleClase,
          };
        })
        .filter(Boolean) as Array<{
        matricula_id: number;
        fecha: string;
        estado: "presente" | "ausente";
        observaciones: string;
      }>;

      const actualizarAsistenciaExistente = async () => {
        for (const registro of registros) {
          const { error: updateError } = await supabaseBrowserClient
            .from("asistencias")
            .update({
              estado: registro.estado,
              observaciones: registro.observaciones,
            })
            .eq("matricula_id", registro.matricula_id)
            .eq("fecha", registro.fecha);

          if (updateError) {
            throw updateError;
          }
        }
      };

      const { error } = await supabaseBrowserClient
        .from("asistencias")
        .insert(registros);

      let asistenciaExistenteActualizada = false;

      if (error) {
        if (error.code === "23505" || error.message.includes("duplicate") || error.message.includes("unique")) {
          try {
            await actualizarAsistenciaExistente();
            await guardarTemaSesion();
            asistenciaExistenteActualizada = true;
          } catch (sesionError: any) {
            console.error(sesionError);
            message.warning("⚠️ La asistencia ya existía y no se pudo actualizar completamente.");
            return;
          }
        }
        if (!asistenciaExistenteActualizada) {
          message.error("Error guardando: " + error.message);
          return;
        }
      }

      if (!asistenciaExistenteActualizada) {
        try {
          await guardarTemaSesion();
        } catch (sesionError: any) {
          console.error(sesionError);
          message.warning("Asistencia guardada, pero no se pudo guardar el tema del día.");
        }
      }

      // Notificar automáticamente a ausentes habilitadas en ciclo activo y enviar WhatsApp al cerrar lista.
      const ausentesInfo = alumnos.filter((alumno) => {
        const estaAusente = asistenciasMap[alumno.id] === "ausente";
        const habilitada = esMatriculaHabilitada(alumno);
        const enCiclo = estaDentroCicloCincoMeses(alumno);
        const tieneTelefono = Boolean(alumno?.perfiles?.telefono);
        const notificacionActiva = alumno?.perfiles?.notif_whatsapp ?? true;
        return estaAusente && habilitada && enCiclo && tieneTelefono && notificacionActiva;
      });

      let enviadosWhatsapp = 0;
      if (ausentesInfo.length > 0) {
        const fechaTexto = formatDate(fecha);
        await Promise.all(
          ausentesInfo.map(async (alumno) => {
            const nombre = alumno.perfiles?.nombre_completo || "Estudiante";
            const telefono = String(alumno?.perfiles?.telefono || "");
            
            // Intentar enviar por plantilla de Meta con fallback de texto
            const templateName = "inasistencia_motivacion";
            const templateFallback = buildWhatsappFallbackMessage(templateName, {
              nombre,
              curso: cursoNombre || "tu curso",
              fecha_clase: fechaTexto,
            }) || "Notamos tu ausencia. Te esperamos en la próxima clase.";

            try {
              // Intenta enviar como template de Meta primero
              const response = await fetch("/api/whatsapp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phone: telefono,
                  type: "template",
                  template: templateName,
                  templateVariables: [nombre, cursoNombre || "tu curso", fechaTexto],
                  templateLanguage: "es_CO",
                }),
              });
              const result = await response.json();
              
              if (result.success) {
                enviadosWhatsapp += 1;
              } else {
                // Fallback a texto si falla la plantilla
                const textResponse = await enviarWhatsapp(telefono, templateFallback);
                if (textResponse?.success) {
                  enviadosWhatsapp += 1;
                }
              }
            } catch (whatsappError) {
              console.error("Error enviando WhatsApp por inasistencia:", whatsappError);
              // Intenta fallback de texto en caso de error
              try {
                const textFallback = await enviarWhatsapp(telefono, templateFallback);
                if (textFallback?.success) {
                  enviadosWhatsapp += 1;
                }
              } catch (fallbackError) {
                console.error("Error en fallback de texto:", fallbackError);
              }
            }

            await supabaseBrowserClient.from("notificaciones").insert({
              user_id: alumno.estudiante_id,
              titulo: "Inasistencia registrada",
              mensaje: templateFallback,
              tipo: "asistencia",
              leido: false,
            });
          })
        );
      }

      const mensajeGuardadoBase = asistenciaExistenteActualizada
        ? (nombreClase
            ? "✅ Asistencia existente actualizada y sesión registrada correctamente."
            : "✅ Asistencia existente actualizada correctamente.")
        : `✅ ¡Asistencia y sesión guardadas correctamente! Se registraron ${HORAS_POR_SESION} horas para ${referenciaClase}.`;

      if (ausentesInfo.length > 0) {
        message.success(`${mensajeGuardadoBase} WhatsApp enviados a ausentes: ${enviadosWhatsapp}/${ausentesInfo.length}.`);
      } else {
        message.success(mensajeGuardadoBase);
      }
      setTimeout(() => router.push(returnTo), 800);
    } catch (error) {
      console.error(error);
      message.error("Error al guardar asistencia");
    } finally {
      setGuardando(false);
    }
  };

  // Contar presentes y ausentes
  const presentes = Object.values(asistenciasMap).filter(
    (v) => v === "presente"
  ).length;
  const ausentes = Object.values(asistenciasMap).filter(
    (v) => v === "ausente"
  ).length;
  const totalHabilitados = alumnos.filter((a) => esMatriculaHabilitada(a)).length;
  const claseSeleccionadaValida = Boolean(numeroClase && Number(numeroClase) > 0);
  const cursoActual = cursos.find((c) => Number(c.id) === Number(cursoSeleccionado));
  const cursoSinProfesor = cursoSeleccionado && !cursoActual?.profesor_id;

  return (
    <div style={{ padding: "24px" }}>
      {/* ENCABEZADO */}
      <div
        style={{
          marginBottom: 24,
          background:
            "linear-gradient(135deg, #1890ff 0%, #1890ff 100%)",
          color: "white",
          padding: 20,
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, color: "white" }}>
            📋 Tomar Asistencia / Llamado de Lista
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.9)" }}>
            Registra la asistencia de tus estudiantes de forma rápida y sencilla
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          size="large"
          onClick={() => router.push(returnTo)}
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          Volver
        </Button>
      </div>

      {/* SELECCIÓN DE CURSO Y FECHA */}
      <Card
        style={{ marginBottom: 20 }}
        title="📅 Paso 1: Curso y Fecha"
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Text strong>Curso:</Text>
              {cursoSeleccionado ? (
                <Tag color="blue" style={{ width: "fit-content", padding: "6px 12px", fontSize: 14 }}>
                  {cursoNombre || `Curso ${cursoSeleccionado}`}
                </Tag>
              ) : (
                <Alert type="warning" message="Falta el curso. Esta pantalla se debe abrir desde un grupo." showIcon />
              )}
              <Text type="secondary">El curso está fijado por el grupo actual.</Text>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div>
              <Text strong>Fecha de la Clase:</Text>
              <DatePicker
                style={{ width: "100%", marginTop: 8 }}
                value={fecha}
                onChange={(val) => setFecha(val || dayjs())}
                format="DD-MMM-YYYY"
              />
            </div>
          </Col>
              {cursoSinProfesor && (
                <Col xs={24}>
                  <Alert
                    type="error"
                    showIcon
                    message="Este curso no tiene un profesor asignado"
                    description="Las horas de esta clase NO se registrarán en nómina. Ve a la edición del curso y asigna el profesor antes de tomar lista."
                    style={{ marginTop: 8 }}
                  />
                </Col>
              )}
              <Col xs={24} md={12}>
                <div>
                  <Text strong>Número de clase (obligatorio):</Text>
              <Select
                style={{ width: "100%", marginTop: 8 }}
                status={!claseSeleccionadaValida ? "error" : undefined}
                value={numeroClase ?? undefined}
                options={opcionesClase}
                onChange={(value) => {
                  setNumeroClase(Number(value));
                  const clase = clasesDisponibles.find((item) => Number(item.numero) === Number(value));
                  setTemaVisto(clase?.nombre || "");
                }}
                placeholder="Selecciona el número de la clase"
                showSearch
                optionFilterProp="label"
              />
              {temaVisto.trim() ? (
                <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                  {`Tema de la clase: ${temaVisto}`}
                </Text>
              ) : null}
              {!claseSeleccionadaValida && (
                <Text type="danger">Selecciona el número de clase para continuar con el llamado de lista.</Text>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* LISTA DE ESTUDIANTES */}
      {cursoSeleccionado && (
        <>
          <Card
            title={`👥 Paso 2: Marca Asistencia - ${cursoNombre}`}
            style={{ marginBottom: 20 }}
            extra={
              <Space>
                <Button
                  onClick={marcarTodoPresente}
                  type="dashed"
                  icon={<CheckOutlined />}
                  disabled={!claseSeleccionadaValida}
                >
                  Todos Presentes
                </Button>
                <Button
                  onClick={marcarTodoAusente}
                  type="dashed"
                  danger
                  icon={<CloseOutlined />}
                  disabled={!claseSeleccionadaValida}
                >
                  Todos Ausentes
                </Button>
              </Space>
            }
          >
            {loadingAlumnos ? (
              <div style={{ textAlign: "center", padding: 50 }}>
                <Spin size="large" />
              </div>
            ) : alumnos.length === 0 ? (
              <Alert
                message="No hay estudiantes activos en este curso"
                type="info"
                showIcon
              />
            ) : (
              <>
                {/* RESUMEN RÁPIDO */}
                <Row gutter={16} style={{ marginBottom: 20 }}>
                  <Col xs={12} md={8}>
                    <Card>
                      <Statistic
                        title="Presentes"
                        value={presentes}
                        valueStyle={{ color: "#52c41a" }}
                        suffix={`/ ${totalHabilitados || alumnos.length}`}
                      />
                    </Card>
                  </Col>
                  <Col xs={12} md={8}>
                    <Card>
                      <Statistic
                        title="Ausentes"
                        value={ausentes}
                        valueStyle={{ color: "#ff4d4f" }}
                        suffix={`/ ${totalHabilitados || alumnos.length}`}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card>
                      <Statistic
                        title="% Asistencia"
                        value={
                          totalHabilitados > 0
                            ? Math.round((presentes / totalHabilitados) * 100)
                            : 0
                        }
                        suffix="%"
                        valueStyle={{
                          color:
                            totalHabilitados > 0 && presentes / totalHabilitados >= 0.8
                              ? "#52c41a"
                              : "#ff4d4f",
                        }}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* TABLA DE ESTUDIANTES */}
                <Table
                  dataSource={alumnos}
                  rowKey="id"
                  pagination={{ pageSize: 15 }}
                  loading={loadingAlumnos}
                  columns={columnasAlumnos}
                  size={isMobile ? "small" : "middle"}
                  scroll={isMobile ? { x: 420 } : undefined}
                />
              </>
            )}
          </Card>

          {/* BOTONES DE ACCIÓN */}
          {alumnos.length > 0 && (
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Button
                  block
                  size="large"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push(returnTo)}
                >
                  Cancelar
                </Button>
              </Col>
              <Col xs={24} md={12}>
                <Button
                  block
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  loading={guardando}
                  disabled={!claseSeleccionadaValida || !!cursoSinProfesor}
                  onClick={guardarAsistencia}
                >
                  💾 Guardar Asistencia
                </Button>
              </Col>
            </Row>
          )}
        </>
      )}
    </div>
  );
}