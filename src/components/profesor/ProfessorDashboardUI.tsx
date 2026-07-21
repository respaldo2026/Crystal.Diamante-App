import React, { useEffect, useMemo, useRef, useState } from "react";
import { Line } from "@ant-design/plots";
import {
  BookOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  FormOutlined,
  ReadOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  StarOutlined,
  TrophyOutlined,
  UserAddOutlined,
  PrinterOutlined,
  GiftOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CameraOutlined,
  EyeOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Drawer,
  Empty,
  Grid,
  List,
  Modal,
  Progress,
  Row,
  Skeleton,
  Table,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import {
  ProfessorDashboardData,
  ProfesorDashboardCalificacionUltimaClase,
  ProfesorDashboardCalificacionesGrupo,
  ProfesorDashboardEvidenciaTarea,
  ProfesorDashboardGamificacionEstudiante,
  ProfesorDashboardGamificacionGrupo,
} from "@hooks/useProfessorDashboard";
import { construirNombreGrupo } from "@utils/grupos";
import { obtenerMaterialesCicloPorProgramas, obtenerMaterialesClasePorProgramas, obtenerMaterialesPorProgramas, obtenerPensumPorProgramas } from "@modules/academico/pensum.service";
import { getMaterialCoverageRuleDisplay } from "@/types/payment-plans";
import { supabaseBrowserClient } from "@utils/supabase/client";

type CourseActionContext = "attendance" | "grades" | "materials" | "default";
type GamificationDetailType = "asistencia" | "quiz" | "tarea";

type GamificationDetailState = {
  open: boolean;
  loading: boolean;
  type: GamificationDetailType;
  cursoId: string;
  curso: string;
  estudiante: string;
  matriculaId: number;
  rows: any[];
  faltantes: number;
  total: number;
};

type SessionCycleDivider = {
  id: string;
  es_divisor_ciclo: true;
  cursoId: string;
  curso: string;
  cicloNumero: number;
  cicloNombre: string;
};

type ProfessorDashboardUIProps = {
  dashboard: ProfessorDashboardData | null | undefined;
  onOpenCourse?: (cursoId: string, action?: CourseActionContext) => void;
};

const fallbackStats: ProfessorDashboardData["stats"] = {
  cursosActivos: 0,
  totalEstudiantes: 0,
  horasMes: 0,
  porcentajeAsistencia: 0,
  promedioCalificaciones: 0,
  tieneCalificaciones: false,
  pendientesPorCalificar: 0,
  asistenciaChart: [],
  calificacionesChart: [],
  topCursos: [],
  horasQuincena: 0,
  proyeccionQuincena: 0,
  tarifaHora: null,
  totalPagadoMes: 0,
};

const dedupeByKey = <T,>(items: T[] = [], keySelector: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = keySelector(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
};

const applyCourseStartTime = (fechaRaw?: string | null, horaInicioRaw?: string | null) => {
  if (!fechaRaw) return null;
  const parsedFecha = dayjs(fechaRaw);
  if (!parsedFecha.isValid()) return null;

  if (!horaInicioRaw) return parsedFecha;

  const [hRaw, mRaw] = String(horaInicioRaw).split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return parsedFecha;

  return parsedFecha.hour(hour).minute(minute).second(0).millisecond(0);
};

const formatSessionStartLabel = (fechaRaw?: string | null, horaInicioRaw?: string | null) => {
  const fecha = applyCourseStartTime(fechaRaw, horaInicioRaw);
  if (!fecha) return "Sin próxima sesión";
  return fecha.format("dddd D [de] MMMM, h:mm A");
};

const parseTemaTituloMaterial = (titulo?: string | null) => {
  const raw = String(titulo || "").trim();
  const match = raw.match(/^\s*(?:\[?tema[:\-]\s*)(.+?)(?:\]|—|–|-|:)\s*(.+)?$/i);
  if (!match) {
    return {
      tema: "",
      tituloLimpio: raw,
    };
  }

  return {
    tema: String(match[1] || "").trim(),
    tituloLimpio: String(match[2] || raw).trim(),
  };
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeTheme = (value?: string | null) => normalizeText(value).replace(/^\d+\s*/, "").trim();

const getActividadColor = (nota?: number | null): string => {
  const value = Number(nota);
  if (!Number.isFinite(value)) return "default";
  if (value >= 4) return "green";
  if (value >= 3) return "gold";
  return "red";
};
const isAsistenciaPositiva = (estado?: string | null) => {
  const normalized = String(estado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return normalized.includes("presente") || normalized.includes("asistio");
};

const normalizeHttpUrl = (value?: string | null) => {
  const raw = String(value || "").trim().replace(/&amp;/gi, "&");
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const hasMalformedEmbedTokens = (value?: string | null) => {
  const raw = String(value || "");
  return /%_ENCODED_%|\{\"|\{"/i.test(raw);
};

const isAllowedEmbedHost = (value?: string | null) => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host === "gamma.app" || host.endsWith(".gamma.app");
  } catch {
    return false;
  }
};

const extractIframeSrc = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
  return normalizeHttpUrl(String(match?.[1] || raw).trim());
};

const toGammaEmbedUrl = (value?: string | null) => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (!(host === "gamma.app" || host.endsWith(".gamma.app"))) {
      return normalized;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "embed") {
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    }

    const documentId = segments[segments.length - 1];
    if (!documentId) return normalized;

    parsed.pathname = `/embed/${documentId}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
};

const isIframeMaterial = (material: any) => {
  const mime = String(material?.mime_type || "").toLowerCase();
  const tipo = String(material?.tipo_material || "").toLowerCase();
  const url = String(material?.url_archivo || "").toLowerCase();
  return mime === "iframe" || tipo === "iframe" || url.includes("<iframe") || url.includes("gamma.app");
};

const MATERIAL_IMPRIMIBLE_PROFESOR_TAG = "MATERIAL_IMPRIMIBLE_PROFESOR";

const isMaterialImprimibleProfesor = (material: any) => {
  const descripcion = String(material?.descripcion || "");
  return descripcion.includes(MATERIAL_IMPRIMIBLE_PROFESOR_TAG);
};

const limpiarDescripcionImprimible = (descripcion?: string | null) => {
  return String(descripcion || "")
    .replace(new RegExp(`\\[?${MATERIAL_IMPRIMIBLE_PROFESOR_TAG}\\]?`, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
};

export const ProfessorDashboardUI: React.FC<ProfessorDashboardUIProps> = ({ dashboard, onOpenCourse }) => {
  const resolvedDashboard: ProfessorDashboardData = dashboard ?? {
    loading: true,
    profesorNombre: undefined,
    stats: fallbackStats,
    cursos: [],
    proximasSesiones: [],
    pendientes: [],
    pagos: [],
    calificacionesRecientesPorGrupo: [],
    gamificacionEstudiantesPorGrupo: [],
    evidenciasTareas: [],
  };

  const {
    loading,
    stats,
    cursos,
    proximasSesiones,
    pendientes,
    pagos,
    profesorNombre,
    calificacionesRecientesPorGrupo,
    gamificacionEstudiantesPorGrupo,
    evidenciasTareas,
  } = resolvedDashboard;
  const statsData = stats ?? fallbackStats;
  const proximasSesionesData = dedupeByKey(proximasSesiones || [], (sesion: any) => `${sesion.cursoId ?? ""}-${sesion.fecha ?? ""}-${sesion.tema ?? ""}-${sesion.claseNumero ?? ""}`);
  const pendientesData = dedupeByKey(pendientes || [], (pendiente: any) => `${pendiente.cursoId ?? ""}-${pendiente.concepto ?? ""}-${pendiente.fecha ?? ""}`);
  const pagosData = dedupeByKey(pagos || [], (pago: any) => `${pago.id ?? ""}-${pago.fecha ?? ""}-${pago.monto ?? ""}-${pago.tipo ?? ""}`);
  const [financialOpen, setFinancialOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialesPensum, setMaterialesPensum] = useState<any[]>([]);
  const [materialesCiclo, setMaterialesCiclo] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [materialesDidacticos, setMaterialesDidacticos] = useState<any[]>([]);
  const [cursoMaterialSeleccionado, setCursoMaterialSeleccionado] = useState<any | null>(null);
  const [cicloSeleccionadoId, setCicloSeleccionadoId] = useState<string | null>(null);
  const [temaSeleccionadoId, setTemaSeleccionadoId] = useState<string | null>(null);
  const [quizzesProfesor, setQuizzesProfesor] = useState<any[]>([]);
  const [quizPreguntasProfesor, setQuizPreguntasProfesor] = useState<any[]>([]);
  const [cycleMetaByProgram, setCycleMetaByProgram] = useState<Record<string, Record<number, { cicloNumero: number; cicloNombre: string }>>>({});
  const [iframePreview, setIframePreview] = useState<{ open: boolean; title: string; src: string }>({
    open: false,
    title: "",
    src: "",
  });
  const [logoAcademia, setLogoAcademia] = useState<string | null>(null);
    const [gamificationDetail, setGamificationDetail] = useState<GamificationDetailState>({
      open: false,
      loading: false,
      type: "asistencia",
      cursoId: "",
      curso: "",
      estudiante: "",
      matriculaId: 0,
      rows: [],
      faltantes: 0,
      total: 0,
    });
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;
  const cursosSectionRef = useRef<HTMLDivElement | null>(null);
  const sesionesSectionRef = useRef<HTMLDivElement | null>(null);
  const pendientesSectionRef = useRef<HTMLDivElement | null>(null);
  const analiticaSectionRef = useRef<HTMLDivElement | null>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }),
    [],
  );
  const proyeccionLabel = currencyFormatter.format(statsData.proyeccionQuincena || 0);
  const pagadoMesLabel = currencyFormatter.format(statsData.totalPagadoMes || 0);
  const tarifaHoraLabel =
    typeof statsData.tarifaHora === "number" && Number.isFinite(statsData.tarifaHora)
      ? currencyFormatter.format(statsData.tarifaHora)
      : "Sin definir";

  const asistenciaConfig = {
    data: statsData.asistenciaChart || [],
    xField: "fecha",
    yField: "porcentaje",
    smooth: true,
    color: "#22c55e",
    height: 240,
    area: {
      style: {
        fill: "l(90) 0:#bbf7d0 1:#22c55e",
        fillOpacity: 0.25,
      },
    },
    tooltip: {
      formatter: (datum: any) => ({
        name: datum?.clases ? `Asistencia (${datum.clases})` : "Asistencia",
        value: `${datum.porcentaje}%`,
      }),
    },
    yAxis: {
      max: 100,
      min: 0,
      label: {
        formatter: (val: number) => `${val}%`,
      },
    },
  };

  const topCursos = useMemo(
    () => dedupeByKey(statsData.topCursos || [], (curso: any) => `${curso.id ?? curso.nombre ?? ""}`),
    [statsData.topCursos],
  );

  const assignedCourseIds = useMemo(() => {
    const ids = new Set<string>();
    (cursos || []).forEach((curso: any) => {
      if (curso?.id !== undefined && curso?.id !== null) {
        ids.add(String(curso.id));
      }
    });
    return ids;
  }, [cursos]);

  useEffect(() => {
    const loadCycleMeta = async () => {
      const programIds = Array.from(
        new Set(
          (cursos || [])
            .map((curso: any) => String(curso?.programId || ""))
            .filter(Boolean),
        ),
      );

      if (!programIds.length) {
        setCycleMetaByProgram({});
        return;
      }

      try {
        const pensumData = await obtenerPensumPorProgramas(programIds);
        const ordered = [...(pensumData || [])].sort((a: any, b: any) => {
          const programA = String(a?.programa_id || "");
          const programB = String(b?.programa_id || "");
          if (programA !== programB) return programA.localeCompare(programB);
          const orderA = Number(a?.orden ?? a?.numero_ciclo ?? 9999);
          const orderB = Number(b?.orden ?? b?.numero_ciclo ?? 9999);
          return orderA - orderB;
        });

        const counters = new Map<string, number>();
        const meta: Record<string, Record<number, { cicloNumero: number; cicloNombre: string }>> = {};

        ordered.forEach((ciclo: any, cycleIndex: number) => {
          const programId = String(ciclo?.programa_id || "");
          if (!programId) return;
          const temas = (Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [])
            .slice()
            .sort((a: any, b: any) => Number(a?.orden ?? 9999) - Number(b?.orden ?? 9999));

          const programMeta = meta[programId] || (meta[programId] = {});

          const cicloNumero = Number(ciclo?.numero_ciclo || cycleIndex + 1) || cycleIndex + 1;
          const cicloNombre = String(ciclo?.nombre_ciclo || `Ciclo ${cicloNumero}`).trim() || `Ciclo ${cicloNumero}`;

          temas.forEach(() => {
            const nextNumber = Number(counters.get(programId) || 0) + 1;
            counters.set(programId, nextNumber);
            programMeta[nextNumber] = { cicloNumero, cicloNombre };
          });
        });

        setCycleMetaByProgram(meta);
      } catch (error) {
        console.error("Error cargando metadata de ciclos para panel profesor", error);
        setCycleMetaByProgram({});
      }
    };

    loadCycleMeta();
  }, [cursos]);

  const proximasSesionesAsignadas = useMemo(
    () => proximasSesionesData.filter((sesion: any) => assignedCourseIds.has(String(sesion?.cursoId || ""))),
    [proximasSesionesData, assignedCourseIds],
  );

  const courseProgramIdMap = useMemo(() => {
    const map = new Map<string, string>();
    (cursos || []).forEach((curso: any) => {
      const courseId = String(curso?.id || "");
      const programId = String(curso?.programId || "");
      if (courseId && programId) {
        map.set(courseId, programId);
      }
    });
    return map;
  }, [cursos]);

  const proximasSesionesConDivisores = useMemo(() => {
    const rows: Array<any | SessionCycleDivider> = [];
    let lastKey = "";

    proximasSesionesAsignadas.forEach((sesion: any, index: number) => {
      const courseId = String(sesion?.cursoId || "");
      const classNumber = Number(sesion?.claseNumero || 0);
      const programId = courseProgramIdMap.get(courseId) || "";
      const cycleMeta = (programId && classNumber ? cycleMetaByProgram[programId]?.[classNumber] : null) || null;
      const cycleNumber = cycleMeta?.cicloNumero || (classNumber > 0 ? Math.floor((classNumber - 1) / 4) + 1 : 1);
      const cycleName = cycleMeta?.cicloNombre || `Ciclo ${cycleNumber}`;
      const dividerKey = `${courseId}-${cycleNumber}`;

      if (dividerKey !== lastKey) {
        rows.push({
          id: `session-divider-${courseId}-${cycleNumber}-${index}`,
          es_divisor_ciclo: true,
          cursoId: courseId,
          curso: String(sesion?.curso || "Curso"),
          cicloNumero: cycleNumber,
          cicloNombre: cycleName,
        });
        lastKey = dividerKey;
      }

      rows.push(sesion);
    });

    return rows;
  }, [courseProgramIdMap, cycleMetaByProgram, proximasSesionesAsignadas]);

  const cursosOrdenados = useMemo(
    () => dedupeByKey(cursos || [], (curso: any) => `${curso.id ?? curso.nombre ?? ""}`)
      .sort((a, b) => (b.estudiantesActivos || 0) - (a.estudiantesActivos || 0)),
    [cursos],
  );

  const courseCards = useMemo(() => {
    return cursosOrdenados.map((curso) => {
      const proxFecha = applyCourseStartTime(curso.proximaSesion?.fecha, curso.horaInicio);
      const proxLabel = formatSessionStartLabel(curso.proximaSesion?.fecha, curso.horaInicio);
      const isSoon = proxFecha ? proxFecha.isBefore(dayjs().add(24, "hour")) : false;
      const asistenciaColor = typeof curso.asistenciaPromedio === "number"
        ? curso.asistenciaPromedio >= 85
          ? "#22c55e"
          : curso.asistenciaPromedio >= 70
            ? "#facc15"
            : "#f97316"
        : undefined;

      return {
        ...curso,
        proxFecha,
        proxLabel,
        isSoon,
        asistenciaColor,
        temaActual: curso.temaActual,
        siguienteTema: curso.siguienteTema,
      };
    });
  }, [cursosOrdenados]);

  const hasAsistenciaData = (statsData.asistenciaChart || []).length > 0;
  const hasTopCursos = (topCursos || []).length > 0;
  const hasGamificacionEstudiantes = (gamificacionEstudiantesPorGrupo || []).some((grupo) => (grupo?.estudiantes || []).length > 0);

  const menuProfesor = [
    { key: "cursos", label: "Cursos", icon: <BookOutlined /> },
    { key: "sesiones", label: "Sesiones", icon: <CalendarOutlined /> },
    { key: "pendientes", label: "Pendientes", icon: <FormOutlined /> },
    { key: "analitica", label: "Analítica", icon: <ReadOutlined /> },
    { key: "financiero", label: "Finanzas", icon: <DollarCircleOutlined /> },
  ];

  const handleMenuProfesor = (key: string) => {
    if (key === "financiero") {
      setFinancialOpen(true);
      return;
    }

    const mapaSecciones: Record<string, React.RefObject<HTMLDivElement | null>> = {
      cursos: cursosSectionRef,
      sesiones: sesionesSectionRef,
      pendientes: pendientesSectionRef,
      analitica: analiticaSectionRef,
    };

    const targetRef = mapaSecciones[key];
    targetRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const ciclosMateriales = useMemo(() => {
    const programaId = cursoMaterialSeleccionado?.programaId;
    if (!programaId) return [];
    return (materialesPensum || [])
      .filter((ciclo: any) => Number(ciclo.programa_id) === Number(programaId))
      .sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
        const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.numero_ciclo ?? 0) - Number(b?.numero_ciclo ?? 0);
      });
  }, [materialesPensum, cursoMaterialSeleccionado?.programaId]);

  const cicloMaterialSeleccionado = useMemo(() => {
    return ciclosMateriales.find((ciclo: any) => String(ciclo.id) === String(cicloSeleccionadoId));
  }, [ciclosMateriales, cicloSeleccionadoId]);

  const temasMateriales = useMemo(() => {
    const temas = cicloMaterialSeleccionado?.pensum_cursos || [];
    return temas.slice().sort((a: any, b: any) => {
      const ordenA = Number(a?.orden ?? 0);
      const ordenB = Number(b?.orden ?? 0);
      if (ordenA !== ordenB) return ordenA - ordenB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  }, [cicloMaterialSeleccionado]);

  const materialesCicloSeleccionado = useMemo(() => {
    if (!cicloMaterialSeleccionado?.id) return [];
    return (materialesCiclo || [])
      .filter((item: any) => String(item.pensum_id) === String(cicloMaterialSeleccionado.id))
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0));
  }, [materialesCiclo, cicloMaterialSeleccionado?.id]);

  const materialesClaseSeleccionados = useMemo(() => {
    if (!cicloMaterialSeleccionado?.id || !temaSeleccionadoId) return [];
    return (materialesClase || [])
      .filter((item: any) => String(item.pensum_id) === String(cicloMaterialSeleccionado.id))
      .filter((item: any) => String(item.pensum_curso_id) === String(temaSeleccionadoId))
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0));
  }, [materialesClase, cicloMaterialSeleccionado?.id, temaSeleccionadoId]);

  const materialesDidacticosTema = useMemo(() => {
    if (!cursoMaterialSeleccionado?.programaId || !temaSeleccionadoId) return [];

    const temaActual = temasMateriales.find((tema: any) => String(tema.id) === String(temaSeleccionadoId));
    const temaObjetivo = normalizeTheme(temaActual?.nombre_curso);

    return (materialesDidacticos || [])
      .filter((item: any) => String(item?.programa_id) === String(cursoMaterialSeleccionado.programaId))
      .filter((item: any) => {
        if (cicloMaterialSeleccionado?.id && String(item?.pensum_id || "") !== String(cicloMaterialSeleccionado.id)) {
          return false;
        }

        const parsed = parseTemaTituloMaterial(item?.titulo);
        const temaMaterial = normalizeTheme(parsed.tema);
        const tituloLimpio = normalizeText(parsed.tituloLimpio);
        const descripcion = normalizeText(item?.descripcion || "");

        if (!temaObjetivo) return true;
        if (temaMaterial) return temaMaterial === temaObjetivo;
        return tituloLimpio.includes(temaObjetivo) || descripcion.includes(temaObjetivo);
      })
      .sort((a: any, b: any) => {
        const fechaA = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const fechaB = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return fechaB - fechaA;
      });
  }, [materialesDidacticos, cursoMaterialSeleccionado?.programaId, temaSeleccionadoId, temasMateriales, cicloMaterialSeleccionado?.id]);

  const quizDelTema = useMemo(() => {
    if (!temaSeleccionadoId) return null;
    const quiz = quizzesProfesor.find(
      (q: any) => String(q.pensum_curso_id || "") === String(temaSeleccionadoId)
    );
    if (!quiz) return null;
    const preguntas = quizPreguntasProfesor
      .filter((p: any) => String(p.quiz_id || "") === String(quiz.id))
      .sort((a: any, b: any) => Number(a.orden || 0) - Number(b.orden || 0));
    return { ...quiz, preguntas };
  }, [quizzesProfesor, quizPreguntasProfesor, temaSeleccionadoId]);

  const evidenciasTemaSeleccionado = useMemo(() => {
    if (!temaSeleccionadoId || !cursoMaterialSeleccionado?.id) return [];

    return (evidenciasTareas || [])
      .filter((item: ProfesorDashboardEvidenciaTarea) =>
        String(item?.cursoId || "") === String(cursoMaterialSeleccionado.id)
        && String(item?.pensumCursoId || "") === String(temaSeleccionadoId)
      )
      .sort((a: ProfesorDashboardEvidenciaTarea, b: ProfesorDashboardEvidenciaTarea) =>
        dayjs(String(b.updatedAt || b.createdAt || "")).valueOf() - dayjs(String(a.updatedAt || a.createdAt || "")).valueOf()
      );
  }, [evidenciasTareas, temaSeleccionadoId, cursoMaterialSeleccionado?.id]);

  const abrirMaterialDidactico = (material: any, title: string) => {
    const src = extractIframeSrc(material?.url_archivo);
    if (!src) return;

    if (isIframeMaterial(material)) {
      if (hasMalformedEmbedTokens(src)) {
        return;
      }

      if (!isAllowedEmbedHost(src)) {
        window.open(src, "_blank", "noopener,noreferrer");
        return;
      }

      setIframePreview({
        open: true,
        title: title || "Presentación",
        src: toGammaEmbedUrl(src),
      });
      return;
    }

    window.open(src, "_blank", "noopener,noreferrer");
  };

  const imprimirMaterialDidactico = (material: any) => {
    const src = extractIframeSrc(material?.url_archivo);
    if (!src) return;

    const popup = window.open(src, "_blank", "noopener,noreferrer");
    if (!popup) return;

    const lanzarImpresion = () => {
      try {
        popup.focus();
        popup.print();
      } catch {
        // no-op
      }
    };

    popup.onload = () => {
      setTimeout(lanzarImpresion, 450);
    };
  };

  const handleOpenMaterials = (curso: any) => {
    setCursoMaterialSeleccionado(curso);
    setCicloSeleccionadoId(null);
    setTemaSeleccionadoId(null);
    setMaterialsOpen(true);
  };

  useEffect(() => {
    const cargarMateriales = async () => {
      if (!materialsOpen || !cursoMaterialSeleccionado?.programaId) return;
      setMaterialsLoading(true);
      try {
        const programaId = String(cursoMaterialSeleccionado.programaId);
        const [pensumData, materialesCicloData, materialesClaseData, materialesDidacticosData] = await Promise.all([
          obtenerPensumPorProgramas([programaId]),
          obtenerMaterialesCicloPorProgramas([programaId]),
          obtenerMaterialesClasePorProgramas([programaId]),
          obtenerMaterialesPorProgramas([programaId], { includeMaterialImprimibleProfesor: true }),
        ]);
        setMaterialesPensum(pensumData || []);
        setMaterialesCiclo(materialesCicloData || []);
        setMaterialesClase(materialesClaseData || []);
        setMaterialesDidacticos(materialesDidacticosData || []);

        // Cargar quizzes del programa
        const { data: quizzesData } = await supabaseBrowserClient
          .from("quizzes_clase")
          .select("id, titulo, pensum_curso_id, programa_id")
          .eq("programa_id", programaId)
          .eq("activo", true)
          .eq("publicado", true);
        setQuizzesProfesor(quizzesData || []);

        if ((quizzesData || []).length > 0) {
          const quizIds = (quizzesData || []).map((q: any) => q.id);
          const { data: preguntasData } = await supabaseBrowserClient
            .from("quiz_preguntas_clase")
            .select("id, quiz_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, orden")
            .in("quiz_id", quizIds)
            .order("orden", { ascending: true });
          setQuizPreguntasProfesor(preguntasData || []);
        } else {
          setQuizPreguntasProfesor([]);
        }

        const primerCiclo = (pensumData || [])[0];
        setCicloSeleccionadoId(primerCiclo?.id || null);
        const primerTema = (primerCiclo?.pensum_cursos || [])[0];
        setTemaSeleccionadoId(primerTema?.id || null);
      } catch (error) {
        console.error("Error cargando materiales del curso", error);
        setMaterialesPensum([]);
        setMaterialesCiclo([]);
        setMaterialesClase([]);
        setMaterialesDidacticos([]);
      } finally {
        setMaterialsLoading(false);
      }
    };

    cargarMateriales();
  }, [materialsOpen, cursoMaterialSeleccionado?.programaId]);

  useEffect(() => {
    const cargarLogo = async () => {
      try {
        const { data } = await supabaseBrowserClient
          .from("configuracion")
          .select("logo_url")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        setLogoAcademia(data?.logo_url || null);
      } catch (error) {
        console.error("Error cargando logo de la academia", error);
      }
    };

    cargarLogo();
  }, []);

  const openGamificationDetail = async (
    type: GamificationDetailType,
    grupo: ProfesorDashboardGamificacionGrupo,
    estudiante: ProfesorDashboardGamificacionEstudiante,
  ) => {
    const curso = (cursos || []).find((item: any) => String(item?.id || "") === String(grupo.cursoId || ""));
    const programaId = String(curso?.programaId || "");
    const matriculaId = Number(estudiante?.matriculaId || 0);

    setGamificationDetail({
      open: true,
      loading: true,
      type,
      cursoId: String(grupo.cursoId || ""),
      curso: grupo.curso,
      estudiante: estudiante.estudiante,
      matriculaId,
      rows: [],
      faltantes: 0,
      total: 0,
    });

    try {
      if (type === "asistencia") {
        const { data, error } = await supabaseBrowserClient
          .from("asistencias")
          .select("id, fecha, estado, observaciones")
          .eq("matricula_id", matriculaId)
          .order("fecha", { ascending: false });

        if (error) throw error;

        const rows = (data || []).map((item: any) => {
          const presente = isAsistenciaPositiva(item?.estado);
          return {
            id: String(item?.id || ""),
            fecha: item?.fecha || null,
            estado: String(item?.estado || "sin_registro"),
            presente,
            observaciones: item?.observaciones || null,
          };
        });

        const faltantes = rows.filter((item: any) => !item.presente).length;
        setGamificationDetail((prev) => ({
          ...prev,
          loading: false,
          rows,
          faltantes,
          total: rows.length,
        }));
        return;
      }

      if (!programaId) {
        setGamificationDetail((prev) => ({ ...prev, loading: false }));
        return;
      }

      const pensumData = await obtenerPensumPorProgramas([programaId]);
      const temas = (pensumData || [])
        .flatMap((ciclo: any) => (Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : []))
        .map((tema: any, idx: number) => ({
          id: String(tema?.id || `tema-${idx}`),
          nombre: String(tema?.nombre_curso || tema?.titulo || "Tema"),
        }));

      if (type === "quiz") {
        const { data: quizzes, error: errQuizzes } = await supabaseBrowserClient
          .from("quizzes_clase")
          .select("id, titulo, pensum_curso_id")
          .eq("programa_id", programaId)
          .eq("activo", true)
          .eq("publicado", true);

        if (errQuizzes) throw errQuizzes;

        const quizIds = (quizzes || []).map((q: any) => q.id);
        const { data: intentos, error: errIntentos } = quizIds.length > 0
          ? await supabaseBrowserClient
              .from("quiz_intentos_clase")
              .select("id, quiz_id, matricula_id, calificacion, enviado_at, respuestas_correctas, total_preguntas")
              .in("quiz_id", quizIds)
              .eq("matricula_id", matriculaId)
              .order("enviado_at", { ascending: false })
          : { data: [], error: null } as any;

        if (errIntentos) throw errIntentos;

        const ultimoIntentoPorQuiz = new Map<string, any>();
        (intentos || []).forEach((intento: any) => {
          const quizId = String(intento?.quiz_id || "");
          if (!quizId || ultimoIntentoPorQuiz.has(quizId)) return;
          ultimoIntentoPorQuiz.set(quizId, intento);
        });

        const temaNombreMap = new Map(temas.map((tema: any) => [String(tema.id), tema.nombre]));
        const rows = (quizzes || []).map((quiz: any) => {
          const intento = ultimoIntentoPorQuiz.get(String(quiz?.id || "")) || null;
          const nota = intento ? Number(intento?.calificacion || 0) : null;
          return {
            id: String(quiz?.id || ""),
            tema: temaNombreMap.get(String(quiz?.pensum_curso_id || "")) || String(quiz?.titulo || "Quiz"),
            quiz: String(quiz?.titulo || "Quiz"),
            nota,
            fecha: intento?.enviado_at || null,
            estado: intento ? "presentado" : "pendiente",
            aciertos: intento?.respuestas_correctas,
            totalPreguntas: intento?.total_preguntas,
          };
        });

        const faltantes = rows.filter((item: any) => item.estado === "pendiente").length;
        setGamificationDetail((prev) => ({
          ...prev,
          loading: false,
          rows,
          faltantes,
          total: rows.length,
        }));
        return;
      }

      const { data: evidencias, error: errEvidencias } = await supabaseBrowserClient
        .from("evidencias_tareas")
        .select("id, pensum_curso_id, url_imagen, created_at, updated_at")
        .eq("matricula_id", matriculaId)
        .eq("curso_id", Number(grupo.cursoId || 0))
        .order("updated_at", { ascending: false });

      if (errEvidencias) throw errEvidencias;

      const evidenciaPorTema = new Map<string, any>();
      (evidencias || []).forEach((item: any) => {
        const key = String(item?.pensum_curso_id || "");
        if (!key || evidenciaPorTema.has(key)) return;
        evidenciaPorTema.set(key, item);
      });

      const rows = temas.map((tema: any) => {
        const evidencia = evidenciaPorTema.get(String(tema.id)) || null;
        return {
          id: String(tema.id),
          tema: tema.nombre,
          fecha: evidencia?.updated_at || evidencia?.created_at || null,
          estado: evidencia ? "subida" : "pendiente",
          url: evidencia?.url_imagen || null,
        };
      });

      const faltantes = rows.filter((item: any) => item.estado === "pendiente").length;
      setGamificationDetail((prev) => ({
        ...prev,
        loading: false,
        rows,
        faltantes,
        total: rows.length,
      }));
    } catch (error) {
      console.error("Error cargando detalle de gamificación", error);
      setGamificationDetail((prev) => ({ ...prev, loading: false, rows: [], faltantes: 0, total: 0 }));
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", maxWidth: 1200, margin: "0 auto", width: "100%", padding: 16 }}>
        <Card style={{ borderRadius: 16 }}>
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Skeleton active title={{ width: "32%" }} paragraph={{ rows: 1 }} />
            <Row gutter={[12, 12]}>
              {[1, 2, 3, 4].map((item) => (
                <Col key={item} xs={24} sm={12} lg={6}>
                  <Card style={{ borderRadius: 12 }}>
                    <Skeleton active paragraph={{ rows: 2 }} title={false} />
                  </Card>
                </Col>
              ))}
            </Row>
            <Skeleton active title={{ width: "26%" }} paragraph={{ rows: 6 }} />
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="profesor-dashboard"
      style={{
        minHeight: "100vh",
        padding: isMobile ? "12px 8px 20px" : "16px 10px 32px",
        background: "linear-gradient(135deg, #f4f7ff 0%, #ffffff 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Card
          variant="borderless"
          style={{
            borderRadius: isMobile ? 16 : 24,
            background: "linear-gradient(135deg, #1e3a8a 0%, #111827 100%)",
            marginBottom: 12,
            color: "#fff",
            boxShadow: "0 16px 36px -26px rgba(30,64,175,0.6)",
          }}
          styles={{ body: { padding: isMobile ? "14px 12px" : "18px 20px" } }}
        >
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={14}>
              <Typography.Text style={{ color: "rgba(255,255,255,0.65)" }}>
                {dayjs().format("dddd, D MMMM")}
              </Typography.Text>
              <Typography.Title level={isMobile ? 3 : 2} style={{ color: "#fff", marginTop: 4, marginBottom: isMobile ? 8 : 14 }}>
                {profesorNombre ? `Hola, ${profesorNombre}` : "Mi Oficina"}
              </Typography.Title>
              <Typography.Paragraph style={{ color: "rgba(255,255,255,0.7)", marginBottom: isMobile ? 8 : 12, fontSize: isMobile ? 13 : 14 }}>
                Visualiza el pulso de tus cursos, haz seguimiento a tus estudiantes y mantén tus clases listas.
              </Typography.Paragraph>
              <Card
                className="professor-menu-card"
                variant="borderless"
                style={{
                  borderRadius: 14,
                  background: "rgba(17, 24, 39, 0.45)",
                  border: "1px solid rgba(148,163,184,0.2)",
                  maxWidth: 560,
                }}
                styles={{ body: { padding: isMobile ? 8 : 10 } }}
              >
                <Row gutter={isMobile ? [6, 6] : [8, 8]}>
                  {menuProfesor.map((item) => (
                    <Col
                      xs={item.key === "financiero" ? 24 : 12}
                      sm={8}
                      md={8}
                      key={item.key}
                    >
                      <Button
                        block
                        size="small"
                        className={`professor-menu-btn ${item.key === "financiero" ? "professor-menu-finance" : ""}`.trim()}
                        onClick={() => handleMenuProfesor(item.key)}
                      >
                        <span className="professor-menu-inner">
                          <span className="professor-menu-icon">{item.icon}</span>
                          <span className="professor-menu-label">{item.label}</span>
                        </span>
                      </Button>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
            <Col xs={24} md={10}>
              <Card
                variant="borderless"
                style={{ borderRadius: isMobile ? 14 : 20, background: "rgba(17, 24, 39, 0.55)", color: "#fff" }}
                styles={{ body: { padding: isMobile ? 10 : 14 } }}
              >
                <Row gutter={[10, 10]}>
                  <Col xs={12} sm={12}>
                    <Statistic
                      prefix={<BookOutlined style={{ color: "#60a5fa" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Cursos activos</span>}
                      value={statsData.cursosActivos}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col xs={12} sm={12}>
                    <Statistic
                      prefix={<TeamOutlined style={{ color: "#34d399" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Estudiantes</span>}
                      value={statsData.totalEstudiantes}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col xs={12} sm={12}>
                    <Statistic
                      prefix={<ClockCircleOutlined style={{ color: "#fbbf24" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Horas del mes</span>}
                      value={statsData.horasMes}
                      suffix="hrs"
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col xs={12} sm={12}>
                    <Statistic
                      prefix={<CalendarOutlined style={{ color: "#38bdf8" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Horas quincena</span>}
                      value={statsData.horasQuincena}
                      suffix="hrs"
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic
                      prefix={<StarOutlined style={{ color: "#a78bfa" }} />}
                      title={<span style={{ color: "rgba(255,255,255,0.65)" }}>Promedio</span>}
                      value={statsData.tieneCalificaciones ? statsData.promedioCalificaciones : "Sin calificaciones"}
                      suffix={statsData.tieneCalificaciones ? "/5" : ""}
                      precision={statsData.tieneCalificaciones ? 1 : undefined}
                      valueStyle={{ color: "#fff", fontWeight: 600 }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </Card>

        <Row gutter={[12, 12]} style={{ marginBottom: isMobile ? 0 : 4 }}>
          {[{
            key: "asistencia",
            title: "Asistencia promedio",
            value: statsData.porcentajeAsistencia,
            suffix: "%",
            icon: <CalendarOutlined style={{ color: "#16a34a" }} />,
            description: "Últimos 30 días",
          }, {
            key: "horas",
            title: "Horas registradas",
            value: statsData.horasMes,
            suffix: "hrs",
            icon: <ClockCircleOutlined style={{ color: "#2563eb" }} />,
            description: "Mes en curso",
          }].map((item, index, arr) => (
            <Col
              key={item.key}
              xs={12}
              sm={12}
              lg={arr.length === 2 ? 12 : 8}
              xl={arr.length === 2 ? 12 : 8}
            >
              <Card
                variant="borderless"
                style={{ borderRadius: 16, height: "100%", boxShadow: "0 12px 24px -22px rgba(15,23,42,0.26)" }}
                styles={{ body: { padding: isMobile ? 10 : 12 } }}
              >
                <Space size="small" align="start">
                  {item.icon}
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>{item.title}</Typography.Text>
                    <Typography.Title level={isMobile ? 5 : 4} style={{ margin: "6px 0" }}>
                      {item.value}
                      {item.suffix && typeof item.value === "number" ? (
                        <Typography.Text style={{ fontSize: isMobile ? 14 : 16, marginLeft: 4 }}>{item.suffix}</Typography.Text>
                      ) : null}
                    </Typography.Title>
                    <Typography.Text style={{ color: "#667085", fontSize: isMobile ? 12 : 14 }}>{item.description}</Typography.Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[12, 12]} style={{ marginTop: isMobile ? 0 : 4 }}>
          <Col xs={24} lg={16}>
            <div ref={cursosSectionRef}>
              <Card
                variant="borderless"
                title={<Space><BookOutlined />Mis cursos</Space>}
                style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
              >
                <Row gutter={[10, 10]}>
                  {courseCards.map((curso) => {
                    const colSpan = courseCards.length === 1 ? 24 : courseCards.length === 2 ? 12 : 12;
                    return (
                      <Col key={curso.id} xs={24} sm={12} lg={colSpan}>
                        <Card
                          hoverable
                          onClick={() => onOpenCourse && onOpenCourse(curso.id, "default")}
                          style={{
                            borderRadius: 14,
                            height: "100%",
                            border: curso.isSoon ? "1px solid #A855F7" : "1px solid rgba(148,163,184,0.18)",
                            boxShadow: curso.isSoon
                              ? "0 14px 38px -26px rgba(168,85,247,0.5)"
                              : "0 10px 26px -22px rgba(15,23,42,0.22)",
                            background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))",
                          }}
                          styles={{
                            body: {
                              color: "#E5E7EB",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              minHeight: isMobile ? 132 : 150,
                              padding: isMobile ? 9 : 10,
                            },
                          }}
                        >
                          <Space align="center" split={<Divider type="vertical" style={{ borderColor: "rgba(255,255,255,0.12)" }} />} wrap>
                            <Typography.Title level={isMobile ? 5 : 4} style={{ margin: 0, color: "#F8FAFC", fontSize: isMobile ? 16 : 18 }}>
                              {construirNombreGrupo(curso)}
                            </Typography.Title>
                            <Tag color={curso.estado === "activo" ? "green" : curso.estado === "pausado" ? "gold" : "blue"}>
                              {curso.estado}
                            </Tag>
                          </Space>

                          <Typography.Text style={{ color: "#CBD5E1" }}>
                            {curso.estudiantesActivos || 0} estudiantes activos
                          </Typography.Text>

                          {typeof curso.asistenciaPromedio === "number" ? (
                            <div>
                              <Typography.Text type="secondary" style={{ color: "#94A3B8", fontSize: 12 }}>Asistencia</Typography.Text>
                              <Progress
                                percent={curso.asistenciaPromedio}
                                size="small"
                                strokeColor={curso.asistenciaColor}
                                showInfo={false}
                                trailColor="rgba(148,163,184,0.25)"
                              />
                            </div>
                          ) : null}

                          <Space size={8} align="center">
                            <Badge color={curso.isSoon ? "#A855F7" : "#38bdf8"} text={curso.proxLabel} />
                          </Space>

                          {curso.temaActual ? (
                            <Typography.Text type="secondary" style={{ color: "#cbd5e1", fontSize: 12 }}>
                              Tema actual: {curso.temaActual}
                            </Typography.Text>
                          ) : null}

                          <Typography.Text style={{ color: "#e2e8f0", fontSize: 12 }}>
                            Próxima clase: {curso.proxLabel}
                            {curso.siguienteTema ? ` • Tema: ${curso.siguienteTema}` : ""}
                          </Typography.Text>

                          <Button
                            type="primary"
                            block
                            size={isMobile ? "small" : "middle"}
                            style={{ marginTop: 4 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCourse && onOpenCourse(curso.id, "default");
                            }}
                          >
                            Entrar al curso
                          </Button>
                          <Button
                            block
                            size={isMobile ? "small" : "middle"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenMaterials(curso);
                            }}
                          >
                            Ver materiales
                          </Button>
                        </Card>
                      </Col>
                    );
                  })}

                  {courseCards.length === 0 && (
                    <Col span={24}>
                      <Card variant="borderless" style={{ textAlign: "center" }}>
                        <Typography.Text type="secondary">No tienes cursos asignados</Typography.Text>
                      </Card>
                    </Col>
                  )}
                </Row>
              </Card>
            </div>
          </Col>

          <Col xs={24} lg={8}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div ref={sesionesSectionRef}>
                <Card
                  variant="borderless"
                  title={<Space><CalendarOutlined />Próximas sesiones</Space>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                  bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
                >
                  <List
                    dataSource={proximasSesionesConDivisores}
                    locale={{ emptyText: "No hay sesiones programadas" }}
                    renderItem={(sesion: any) => {
                      if (sesion?.es_divisor_ciclo) {
                        const backgrounds = ["#fff7e6", "#f6ffed", "#e6f4ff", "#f9f0ff", "#fff1f0"];
                        const accents = ["#d46b08", "#389e0d", "#0958d9", "#7a3db8", "#cf1322"];
                        const index = (Math.max(Number(sesion?.cicloNumero || 1), 1) - 1) % backgrounds.length;
                        return (
                          <List.Item style={{ background: backgrounds[index], borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
                            <Typography.Text strong style={{ color: accents[index] }}>
                              {`${sesion.curso} · Ciclo ${sesion.cicloNumero} · ${sesion.cicloNombre}`}
                            </Typography.Text>
                          </List.Item>
                        );
                      }

                      return (
                        <List.Item
                          style={{ cursor: "pointer" }}
                          onClick={() => onOpenCourse && onOpenCourse(sesion.cursoId, "attendance")}
                        >
                          <List.Item.Meta
                            title={sesion.curso}
                            description={
                              <Space split={<Divider type="vertical" />}> 
                                <span>{formatSessionStartLabel(sesion.fecha, sesion.horaInicio)}</span>
                                {sesion.claseNumero ? <span>Clase #{sesion.claseNumero}</span> : null}
                                {sesion.tema ? <span>{sesion.tema}</span> : null}
                                {sesion.horas ? <span>{sesion.horas} hrs</span> : null}
                              </Space>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                </Card>
              </div>

              <div ref={pendientesSectionRef}>
                <Card
                  variant="borderless"
                  title={<Space><FormOutlined />Pendientes por calificar</Space>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                  bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
                >
                  <List
                    dataSource={pendientesData.slice(0, 5)}
                    locale={{ emptyText: "No tienes pendientes" }}
                    renderItem={(pendiente) => (
                      <List.Item
                        style={{ cursor: pendiente.cursoId ? "pointer" : "default", opacity: pendiente.cursoId ? 1 : 0.6 }}
                        onClick={() => pendiente.cursoId && onOpenCourse && onOpenCourse(pendiente.cursoId as string, "grades")}
                      >
                        <List.Item.Meta
                          title={pendiente.concepto}
                          description={
                            <Space split={<Divider type="vertical" />}> 
                              <span>{pendiente.curso}</span>
                              {pendiente.fecha ? <span>{dayjs(pendiente.fecha).format("DD MMM")}</span> : null}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </div>
            </Space>
          </Col>
        </Row>

        {(hasAsistenciaData || hasTopCursos) && (
          <Row ref={analiticaSectionRef} gutter={[12, 12]} style={{ marginTop: 10 }}>
            {hasAsistenciaData && (
              <Col xs={24} lg={hasTopCursos ? 16 : 24}>
                <Card
                  variant="borderless"
                  title={<span style={{ fontWeight: 600 }}>Tendencia de asistencia</span>}
                  extra={<Tag color="green">Últimas 8 sesiones</Tag>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                >
                  <Line {...asistenciaConfig} />
                </Card>
              </Col>
            )}

            {hasTopCursos && (
              <Col xs={24} lg={8}>
                <Card
                  variant="borderless"
                  title={<Space><ReadOutlined />Top cursos</Space>}
                  style={{ borderRadius: 18, boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)" }}
                >
                  <List
                    dataSource={topCursos}
                    locale={{ emptyText: "Sin cursos destacados aún" }}
                    renderItem={(curso) => (
                      <List.Item>
                        <List.Item.Meta
                          title={construirNombreGrupo(curso)}
                          description={`${curso.estudiantes} estudiantes`}
                        />
                        {typeof curso.asistencia === "number" ? (
                          <Tag color={curso.asistencia >= 85 ? "green" : curso.asistencia >= 70 ? "gold" : "volcano"}>
                            {curso.asistencia}%
                          </Tag>
                        ) : null}
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
            )}
          </Row>
        )}

        {hasGamificacionEstudiantes && (
          <Row gutter={[12, 12]} style={{ marginTop: 10 }}>
            <Col xs={24}>
              <Card
                variant="borderless"
                title={<Space><TrophyOutlined />Gamificación del grupo</Space>}
                extra={<Tag color="magenta">Meta: 1000 XP por curso</Tag>}
                style={{
                  borderRadius: 18,
                  boxShadow: "0 12px 28px -22px rgba(15,23,42,0.3)",
                  border: "1px solid #f3d0e6",
                  background: "linear-gradient(135deg, #fff8fc 0%, #ffffff 100%)",
                }}
              >
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {(gamificacionEstudiantesPorGrupo || []).map((grupo: ProfesorDashboardGamificacionGrupo) => {
                    const topEstudiante = (grupo.estudiantes || [])[0];
                    return (
                      <Card
                        key={grupo.cursoId}
                        size="small"
                        title={grupo.curso}
                        extra={
                          topEstudiante
                            ? <Tag color="gold">Top: {topEstudiante.estudiante}</Tag>
                            : <Tag>Sin datos</Tag>
                        }
                        styles={{ body: { padding: isMobile ? 8 : 12 } }}
                      >
                        <Space wrap size={6} style={{ marginBottom: 8 }}>
                          <Tag color="blue">✅ Asistencia</Tag>
                          <Tag color="purple">🧠 Quiz</Tag>
                          <Tag color="green">📷 Tarea</Tag>
                        </Space>

                        <Table
                          size="small"
                          pagination={false}
                          rowKey="matriculaId"
                          dataSource={grupo.estudiantes || []}
                          scroll={{ x: 860 }}
                          columns={[
                            {
                              title: "Estudiante",
                              dataIndex: "estudiante",
                              key: "estudiante",
                              render: (value: string, record: any, index: number) => (
                                <Space size={6}>
                                  <Avatar src={record?.estudianteFotoUrl || undefined} icon={<UserOutlined />} size={30} />
                                  <Typography.Text strong>{value}</Typography.Text>
                                  {index === 0 ? <Tag color="gold">Top</Tag> : null}
                                </Space>
                              ),
                            },
                            {
                              title: "XP total",
                              dataIndex: "xpTotal",
                              key: "xpTotal",
                              width: 160,
                              render: (value: number) => (
                                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                  <Typography.Text strong>{`${Number(value || 0)}/1000 XP`}</Typography.Text>
                                  <Progress
                                    percent={Math.max(0, Math.min(100, Math.round(Number(value || 0) / 10)))}
                                    showInfo={false}
                                    size="small"
                                    strokeColor="#16a34a"
                                    trailColor="#dbeafe"
                                  />
                                </Space>
                              ),
                            },
                            {
                              title: "XP semanal",
                              dataIndex: "xpSemanal",
                              key: "xpSemanal",
                              width: 105,
                              align: "right",
                              render: (value: number) => <Typography.Text strong>{Number(value || 0)}</Typography.Text>,
                            },
                            {
                              title: "✅ Asistencia",
                              key: "detalleAsistencia",
                              width: 150,
                              align: "center",
                              render: (_: any, record: ProfesorDashboardGamificacionEstudiante) => (
                                <Button
                                  size="small"
                                  icon={<EyeOutlined />}
                                  onClick={() => openGamificationDetail("asistencia", grupo, record)}
                                >
                                  {`${record.asistenciaPercent}%`}
                                </Button>
                              ),
                            },
                            {
                              title: "🧠 Quiz",
                              key: "detalleQuiz",
                              width: 130,
                              align: "center",
                              render: (_: any, record: ProfesorDashboardGamificacionEstudiante) => (
                                <Button
                                  size="small"
                                  icon={<EyeOutlined />}
                                  onClick={() => openGamificationDetail("quiz", grupo, record)}
                                >
                                  {record.quizAprobados}
                                </Button>
                              ),
                            },
                            {
                              title: "📷 Tarea",
                              key: "detalleTarea",
                              width: 130,
                              align: "center",
                              render: (_: any, record: ProfesorDashboardGamificacionEstudiante) => {
                                const tareasSubidas = (evidenciasTareas || []).filter((item: ProfesorDashboardEvidenciaTarea) =>
                                  Number(item?.matriculaId || 0) === Number(record.matriculaId)
                                  && String(item?.cursoId || "") === String(grupo.cursoId || "")
                                ).length;
                                return (
                                  <Button
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => openGamificationDetail("tarea", grupo, record)}
                                  >
                                    {tareasSubidas}
                                  </Button>
                                );
                              },
                            },
                            {
                              title: "Nivel",
                              dataIndex: "nivel",
                              key: "nivel",
                              width: 88,
                              align: "center",
                              render: (value: number) => <Tag color="magenta">Nv {value}</Tag>,
                            },
                          ]}
                        />
                      </Card>
                    );
                  })}
                </Space>
              </Card>
            </Col>
          </Row>
        )}

        <Modal
          title={`Detalle ${gamificationDetail.type.toUpperCase()} · ${gamificationDetail.estudiante}`}
          open={gamificationDetail.open}
          onCancel={() => setGamificationDetail((prev) => ({ ...prev, open: false }))}
          footer={null}
          width={isMobile ? "96%" : 980}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Space wrap size={8}>
              <Tag color="blue">Curso: {gamificationDetail.curso || "-"}</Tag>
              <Tag color={gamificationDetail.faltantes > 0 ? "volcano" : "green"}>
                {`Faltantes: ${gamificationDetail.faltantes}/${gamificationDetail.total}`}
              </Tag>
              <Tag color="magenta">Matrícula: {gamificationDetail.matriculaId || "-"}</Tag>
            </Space>

            {gamificationDetail.loading ? (
              <div style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Spin />
              </div>
            ) : gamificationDetail.type === "asistencia" ? (
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                rowKey={(row: any) => String(row?.id || row?.fecha || "row")}
                dataSource={gamificationDetail.rows}
                columns={[
                  {
                    title: "Fecha",
                    dataIndex: "fecha",
                    width: 140,
                    render: (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY") : "-",
                  },
                  {
                    title: "Estado",
                    dataIndex: "estado",
                    width: 130,
                    render: (_: any, row: any) => row.presente ? <Tag color="green">Presente</Tag> : <Tag color="red">Faltó</Tag>,
                  },
                  {
                    title: "Observación",
                    dataIndex: "observaciones",
                    render: (value: string | null) => value || "-",
                  },
                  {
                    title: "Acción sugerida",
                    width: 220,
                    render: (_: any, row: any) => (
                      row.presente
                        ? <Typography.Text type="secondary">Sin novedad</Typography.Text>
                        : <Typography.Text style={{ color: "#b91c1c", fontWeight: 600 }}>{`Faltaste el ${row.fecha ? dayjs(row.fecha).format("DD/MM") : "día"}`}</Typography.Text>
                    ),
                  },
                ]}
              />
            ) : gamificationDetail.type === "quiz" ? (
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                rowKey={(row: any) => String(row?.id || row?.tema || "row")}
                dataSource={gamificationDetail.rows}
                columns={[
                  { title: "Tema", dataIndex: "tema", render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
                  { title: "Quiz", dataIndex: "quiz", render: (value: string) => value || "Quiz" },
                  {
                    title: "Nota",
                    dataIndex: "nota",
                    width: 110,
                    align: "center",
                    render: (value: number | null) => {
                      if (value == null || !Number.isFinite(value)) return <Typography.Text type="secondary">Pendiente</Typography.Text>;
                      const nota = Number(value);
                      return <Tag color={nota >= 4 ? "green" : nota >= 3 ? "gold" : "red"}>{`${nota.toFixed(1)}/5`}</Tag>;
                    },
                  },
                  {
                    title: "Estado",
                    dataIndex: "estado",
                    width: 120,
                    render: (value: string) => value === "presentado" ? <Tag color="green">Presentado</Tag> : <Tag color="volcano">Pendiente</Tag>,
                  },
                  {
                    title: "Fecha",
                    dataIndex: "fecha",
                    width: 150,
                    render: (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY") : "-",
                  },
                  {
                    title: "Acción sugerida",
                    width: 200,
                    render: (_: any, row: any) => (
                      row.estado === "presentado"
                        ? <Typography.Text type="secondary">Quiz completado</Typography.Text>
                        : <Typography.Text style={{ color: "#b91c1c", fontWeight: 600 }}>{`Te falta este quiz: ${row.tema}`}</Typography.Text>
                    ),
                  },
                ]}
              />
            ) : (
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                rowKey={(row: any) => String(row?.id || row?.tema || "row")}
                dataSource={gamificationDetail.rows}
                columns={[
                  { title: "Tema", dataIndex: "tema", render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
                  {
                    title: "Estado",
                    dataIndex: "estado",
                    width: 120,
                    render: (value: string) => value === "subida" ? <Tag color="green">Subida</Tag> : <Tag color="volcano">Pendiente</Tag>,
                  },
                  {
                    title: "Fecha",
                    dataIndex: "fecha",
                    width: 150,
                    render: (value: string | null) => value ? dayjs(value).format("DD/MM/YYYY") : "-",
                  },
                  {
                    title: "Evidencia",
                    width: 110,
                    align: "center",
                    render: (_: any, row: any) => row.url
                      ? (
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => window.open(String(row.url), "_blank", "noopener,noreferrer")}
                        >
                          Ver
                        </Button>
                      )
                      : <Typography.Text type="secondary">-</Typography.Text>,
                  },
                  {
                    title: "Acción sugerida",
                    width: 220,
                    render: (_: any, row: any) => (
                      row.estado === "subida"
                        ? <Typography.Text type="secondary">Tarea completa</Typography.Text>
                        : <Typography.Text style={{ color: "#b91c1c", fontWeight: 600 }}>{`Te falta esta tarea: ${row.tema}`}</Typography.Text>
                    ),
                  },
                ]}
              />
            )}
          </Space>
        </Modal>

        <Drawer
          title={`Materiales del curso: ${cursoMaterialSeleccionado ? construirNombreGrupo(cursoMaterialSeleccionado) : "Curso"}`}
          placement="right"
          width={isMobile ? "100%" : 460}
          onClose={() => setMaterialsOpen(false)}
          open={materialsOpen}
        >
          {materialsLoading ? (
            <div style={{ minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Spin />
            </div>
          ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Select
                placeholder="Selecciona un ciclo"
                value={cicloSeleccionadoId || undefined}
                onChange={(value) => {
                  const ciclo = ciclosMateriales.find((item: any) => String(item.id) === String(value));
                  setCicloSeleccionadoId(value || null);
                  const primerTema = ciclo?.pensum_cursos?.[0];
                  setTemaSeleccionadoId(primerTema?.id || null);
                }}
                options={ciclosMateriales.map((ciclo: any) => ({
                  value: ciclo.id,
                  label: ciclo.nombre_ciclo || `Ciclo ${ciclo.numero_ciclo}`,
                }))}
              />

              <Select
                placeholder="Selecciona un tema"
                value={temaSeleccionadoId || undefined}
                onChange={(value) => setTemaSeleccionadoId(value || null)}
                options={temasMateriales.map((tema: any) => ({
                  value: tema.id,
                  label: tema.nombre_curso,
                }))}
              />

              <Card size="small" title="Materiales generales del ciclo">
                {materialesCicloSeleccionado.length === 0 ? (
                  <Empty description="Sin materiales generales" />
                ) : (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(record) => String(record?.id || record?.nombre)}
                    dataSource={materialesCicloSeleccionado}
                    columns={[
                      {
                        title: "Producto",
                        dataIndex: "nombre",
                        render: (value) => <Typography.Text strong>{value}</Typography.Text>,
                      },
                      {
                        title: "Cantidad",
                        dataIndex: "cantidad",
                        render: (value) => value || "Cantidad por definir",
                      },
                      {
                        title: "Cobertura",
                        dataIndex: "cobertura_material",
                        align: "center",
                        render: (_value, record) => {
                          const display = getMaterialCoverageRuleDisplay(record?.cobertura_material, record?.incluido_kit);
                          return <Tag color={display.color}>{display.shortLabel}</Tag>;
                        },
                      },
                    ]}
                  />
                )}
              </Card>

              <Card size="small" title="Materiales por clase">
                {materialesClaseSeleccionados.length === 0 ? (
                  <Empty description="Sin materiales asignados" />
                ) : (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(record) => String(record?.id || record?.nombre_material)}
                    dataSource={materialesClaseSeleccionados}
                    columns={[
                      {
                        title: "Producto",
                        dataIndex: "nombre_material",
                        render: (_value, record) => (
                          <Space size={6} wrap>
                            <Typography.Text strong>{record.materiales_ciclo?.nombre || record.nombre_material}</Typography.Text>
                          </Space>
                        ),
                      },
                      {
                        title: "Cantidad",
                        dataIndex: "cantidad",
                        render: (_value, record) => {
                          const cantidad = record.materiales_ciclo?.cantidad || record.cantidad;
                          return [cantidad, record.unidad].filter(Boolean).join(" ") || "Cantidad por definir";
                        },
                      },
                      {
                        title: "Cobertura",
                        dataIndex: "materiales_ciclo",
                        align: "center",
                        render: (value) => {
                          const display = getMaterialCoverageRuleDisplay(value?.cobertura_material, value?.incluido_kit);
                          return <Tag color={display.color}>{display.shortLabel}</Tag>;
                        },
                      },
                    ]}
                  />
                )}
              </Card>

              <Card size="small" title="Material didáctico del tema">
                {materialesDidacticosTema.length === 0 ? (
                  <Empty description="Sin material didáctico" />
                ) : (
                  <List
                    dataSource={materialesDidacticosTema}
                    renderItem={(item: any) => {
                      const parsed = parseTemaTituloMaterial(item?.titulo);
                      const titulo = parsed.tituloLimpio || item?.titulo || "Material";
                      const esImprimibleProfesor = isMaterialImprimibleProfesor(item);
                      const descripcionLimpia = limpiarDescripcionImprimible(item?.descripcion);
                      return (
                        <List.Item
                          actions={[
                            esImprimibleProfesor ? (
                              <Button
                                key={`imprimir-material-${item.id}`}
                                type="link"
                                icon={<PrinterOutlined />}
                                onClick={() => imprimirMaterialDidactico(item)}
                              >
                                Imprimir
                              </Button>
                            ) : null,
                            <Button
                              key={`ver-material-${item.id}`}
                              type="link"
                              onClick={() => abrirMaterialDidactico(item, titulo)}
                            >
                              Ver
                            </Button>,
                          ].filter(Boolean)}
                        >
                          <List.Item.Meta
                            title={
                              <Space size={6} wrap>
                                <Typography.Text strong>{titulo}</Typography.Text>
                                {esImprimibleProfesor ? <Tag color="orange">Material imprimible</Tag> : null}
                              </Space>
                            }
                            description={descripcionLimpia || null}
                          />
                        </List.Item>
                      );
                    }}
                  />
                )}
              </Card>

              <Card
                size="small"
                title={
                  <Space>
                    <SafetyCertificateOutlined style={{ color: "#d81b87" }} />
                    <span>Evaluación del tema</span>
                  </Space>
                }
              >
                {!quizDelTema ? (
                  <Empty description="Sin quiz publicado para este tema" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Tag color="purple" style={{ marginBottom: 4 }}>{quizDelTema.titulo}</Tag>
                    <Collapse
                      size="small"
                      ghost
                      items={quizDelTema.preguntas.map((pregunta: any, idx: number) => ({
                        key: String(pregunta.id || idx),
                        label: (
                          <Typography.Text strong style={{ fontSize: 13 }}>
                            {`${idx + 1}. ${pregunta.pregunta}`}
                          </Typography.Text>
                        ),
                        children: (
                          <Space direction="vertical" size={6} style={{ width: "100%", paddingLeft: 8 }}>
                            {(["a", "b", "c", "d"] as const).map((letra) => {
                              const texto = pregunta[`opcion_${letra}`];
                              if (!texto) return null;
                              const esCorrecta =
                                (pregunta.respuesta_correcta || "").toUpperCase() === letra.toUpperCase();
                              return (
                                <Space key={letra} size={8} align="start">
                                  {esCorrecta ? (
                                    <CheckCircleOutlined style={{ color: "#16a34a", marginTop: 2 }} />
                                  ) : (
                                    <CloseCircleOutlined style={{ color: "#d1d5db", marginTop: 2 }} />
                                  )}
                                  <Typography.Text
                                    style={{
                                      color: esCorrecta ? "#16a34a" : undefined,
                                      fontWeight: esCorrecta ? 600 : 400,
                                      fontSize: 13,
                                    }}
                                  >
                                    {`${letra.toUpperCase()}. ${texto}`}
                                  </Typography.Text>
                                </Space>
                              );
                            })}
                          </Space>
                        ),
                      }))}
                    />
                  </Space>
                )}
              </Card>

              <Card
                size="small"
                title={
                  <Space>
                    <CameraOutlined style={{ color: "#2563eb" }} />
                    <span>Evidencias de tareas del tema</span>
                  </Space>
                }
              >
                {evidenciasTemaSeleccionado.length === 0 ? (
                  <Empty description="Sin evidencias subidas por estudiantes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <List
                    dataSource={evidenciasTemaSeleccionado}
                    renderItem={(item: ProfesorDashboardEvidenciaTarea) => (
                      <List.Item
                        actions={[
                          <Button
                            key={`ver-evidencia-${item.id}`}
                            type="link"
                            onClick={() => window.open(item.urlImagen, "_blank", "noopener,noreferrer")}
                          >
                            Ver
                          </Button>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <img
                              src={item.urlImagen}
                              alt={`Evidencia ${item.estudiante}`}
                              style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb" }}
                            />
                          }
                          title={<Typography.Text strong>{item.estudiante}</Typography.Text>}
                          description={dayjs(String(item.updatedAt || item.createdAt || "")).isValid()
                            ? dayjs(String(item.updatedAt || item.createdAt)).format("DD MMM YYYY, h:mm A")
                            : "Fecha no disponible"}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Space>
          )}
        </Drawer>

        <Modal
          title={iframePreview.title || "Presentación"}
          open={iframePreview.open}
          onCancel={() => setIframePreview({ open: false, title: "", src: "" })}
          footer={null}
          width="100%"
          centered
          style={{ top: 0, padding: 0 }}
          styles={{ 
            body: { padding: 0, height: "100vh", overflow: "hidden" },
            content: { padding: 0, borderRadius: 0, height: "100vh", overflow: "hidden" }
          }}
          destroyOnClose
          className="gamma-fullscreen-modal"
        >
          <iframe
            src={iframePreview.src}
            title={iframePreview.title || "Presentación"}
            style={{ width: "100%", height: "100%", border: 0 }}
            allow="fullscreen; clipboard-read; clipboard-write"
            allowFullScreen
            loading="lazy"
          />
        </Modal>

        <Drawer
          title="Resumen financiero"
          placement="right"
          width={isMobile ? "100%" : 420}
          onClose={() => setFinancialOpen(false)}
          open={financialOpen}
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Row gutter={[12, 12]}>
              {[{
                key: "tarifa",
                title: "Tarifa por hora",
                value: tarifaHoraLabel,
              }, {
                key: "horasMes",
                title: "Horas del mes",
                value: `${statsData.horasMes} hrs`,
              }, {
                key: "horasQuincena",
                title: "Horas quincena",
                value: `${statsData.horasQuincena} hrs`,
              }, {
                key: "proyeccion",
                title: "Proyección quincena",
                value: proyeccionLabel,
              }, {
                key: "pagadoMes",
                title: "Pagado este mes",
                value: pagadoMesLabel,
              }].map((item, index) => (
                <Col key={item.key} xs={24} sm={index === 4 ? 24 : 12}>
                  <Card variant="borderless" style={{ borderRadius: 16, background: "#f8fafc" }}>
                    <Typography.Text type="secondary">{item.title}</Typography.Text>
                    <Typography.Title level={4} style={{ marginTop: 8 }}>
                      {item.value}
                    </Typography.Title>
                  </Card>
                </Col>
              ))}
            </Row>

            <div>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>Pagos recientes</Typography.Title>
              <List
                dataSource={pagosData.slice(0, 6)}
                locale={{ emptyText: "Sin pagos registrados" }}
                renderItem={(pago) => {
                  const fechaLabel = pago.fecha ? dayjs(pago.fecha).format("DD MMM YYYY") : "Sin fecha";
                  const periodoLabel =
                    pago.origen === "nomina" && pago.periodo?.inicio && pago.periodo?.fin
                      ? `${dayjs(pago.periodo.inicio).format("DD MMM")} - ${dayjs(pago.periodo.fin).format("DD MMM")}`
                      : null;
                  return (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space split={<Divider type="vertical" />}>
                            <span>{currencyFormatter.format(pago.monto || 0)}</span>
                            <span>{pago.tipo}</span>
                            <Tag color={pago.origen === "nomina" ? "blue" : "gold"}>
                              {pago.origen === "nomina" ? "Nómina" : "Extra"}
                            </Tag>
                          </Space>
                        }
                        description={
                          <div>
                            <Space split={<Divider type="vertical" />} style={{ color: "#475467" }}>
                              <span>{fechaLabel}</span>
                              <span>{pago.concepto}</span>
                            </Space>
                            {periodoLabel ? (
                              <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                                Periodo: {periodoLabel}
                              </Typography.Text>
                            ) : null}
                          </div>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </div>
          </Space>
        </Drawer>
        <style jsx global>{`
          .profesor-dashboard .professor-menu-card {
            margin-top: 10px;
          }
          .profesor-dashboard .professor-menu-btn {
            border-radius: 12px;
            min-height: 58px;
            padding: 6px;
            border-color: rgba(148, 163, 184, 0.35);
            background: rgba(255, 255, 255, 0.92);
            color: #0f172a;
          }
          .profesor-dashboard .professor-menu-inner {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            width: 100%;
          }
          .profesor-dashboard .professor-menu-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            line-height: 1;
          }
          .profesor-dashboard .professor-menu-label {
            font-size: 11px;
            line-height: 1.15;
            text-align: center;
            white-space: normal;
          }
          @media (max-width: 576px) {
            .ant-layout-sider-zero-width-trigger,
            .ant-layout-sider-zero-width-trigger-left {
              display: none !important;
            }
            .profesor-dashboard {
              padding: 10px !important;
            }
            .profesor-dashboard .ant-card-head {
              min-height: 40px;
              padding: 0 12px;
            }
            .profesor-dashboard .ant-card-head-title {
              white-space: normal;
              font-size: 14px;
            }
            .profesor-dashboard .ant-typography {
              word-break: break-word;
            }
            .profesor-dashboard .ant-list-item-meta-title,
            .profesor-dashboard .ant-list-item-meta-description {
              white-space: normal;
            }
            .profesor-dashboard .ant-card-body {
              padding: 10px !important;
            }
            .profesor-dashboard .ant-drawer-content-wrapper {
              width: 100% !important;
            }
            .profesor-dashboard .professor-menu-btn {
              min-height: 48px;
              padding: 5px 4px;
            }
            .profesor-dashboard .professor-menu-btn.professor-menu-finance {
              min-height: 44px;
            }
            .profesor-dashboard .professor-menu-label {
              font-size: 10px;
            }
            .profesor-dashboard .ant-statistic-title {
              font-size: 12px;
            }
            .profesor-dashboard .ant-statistic-content {
              font-size: 20px;
            }
          }
        `}</style>
      </div>
    </div>
  );
};
