"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { logger } from "@utils/logger";
import {
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Skeleton,
  Alert,
  Progress,
  Button,
  Empty,
  message,
  Tag,
  Divider,
  List,
  Typography,
  Space,
  Checkbox,
  Collapse,
  Modal,
  Radio,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  BookOutlined,
  FileOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileWordOutlined,
  LinkOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  TrophyOutlined,
  DownloadOutlined,
  WhatsAppOutlined,
  DollarCircleOutlined,
  SafetyCertificateOutlined,
  VideoCameraOutlined,
  FilePdfOutlined,
  ClockCircleOutlined,
  YoutubeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { formatDate } from "@utils/date";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useDelayedLoader } from "@/modules/portal-estudiante/hooks/useDelayedLoader";
import { usePortalData } from "@/modules/portal-estudiante/hooks/usePortalData";
import { useQuizFlow } from "@/modules/portal-estudiante/hooks/useQuizFlow";
import { useChecklistInsumos } from "@/modules/portal-estudiante/hooks/useChecklistInsumos";
import { useCourseProgress } from "@/modules/portal-estudiante/hooks/useCourseProgress";
import { useTemaMaterials } from "@/modules/portal-estudiante/hooks/useTemaMaterials";
import { useGamificationMetrics } from "@/modules/portal-estudiante/hooks/useGamificationMetrics";
import { TemaMaterialActions } from "@/modules/portal-estudiante/components/TemaMaterialActions";
import { GamificationHeader } from "@/modules/portal-estudiante/components/GamificationHeader";
import { WeeklyMissionsCard } from "@/modules/portal-estudiante/components/WeeklyMissionsCard";
import { StreakCard } from "@/modules/portal-estudiante/components/StreakCard";
import { AchievementsStrip } from "@/modules/portal-estudiante/components/AchievementsStrip";
import { CourseFinishTrack } from "@/modules/portal-estudiante/components/CourseFinishTrack";
import {
  extractClassNumber,
  getActividadColor,
  getMaterialCanonicalKey,
  getMaterialCanonicalTitle,
  normalizarTemaComparacion,
  normalizarTexto,
  parseTemaTituloMaterial,
  quizAprobado,
  UMBRAL_APROBACION_QUIZ_NOTA,
  UMBRAL_APROBACION_QUIZ_PORCENTAJE,
} from "@/modules/portal-estudiante/utils";
import {
  getMaterialCoverageDisplay,
  getPaymentPlan,
  getPaymentPlanDisplay,
  normalizeModalidadPago,
} from "@/types/payment-plans";
import {
  getDescuentoAplicado,
  getMontoProgramado,
  getSaldoPendiente,
  getTotalAbonado,
  getVisiblePaymentStatus,
} from "@/utils/payment-balances";
import { construirNombreGrupo } from "@utils/grupos";

const QuizApprovedResult = dynamic(
  () => import("@/modules/portal-estudiante/components/QuizApprovedResult").then((m) => m.QuizApprovedResult),
  { ssr: false },
);

const QuizFailedResult = dynamic(
  () => import("@/modules/portal-estudiante/components/QuizFailedResult").then((m) => m.QuizFailedResult),
  { ssr: false },
);

const QuizQuestionFlow = dynamic(
  () => import("@/modules/portal-estudiante/components/QuizQuestionFlow").then((m) => m.QuizQuestionFlow),
  { ssr: false },
);

const QuizFlowFooter = dynamic(
  () => import("@/modules/portal-estudiante/components/QuizFlowFooter").then((m) => m.QuizFlowFooter),
  { ssr: false },
);

const IframeMaterialModal = dynamic(
  () => import("@/modules/portal-estudiante/components/IframeMaterialModal").then((m) => m.IframeMaterialModal),
  { ssr: false },
);

const PortalFinancieroSection = dynamic(
  () => import("@/modules/portal-estudiante/components/PortalFinancieroSection").then((m) => m.PortalFinancieroSection),
  {
    ssr: false,
    loading: () => <Skeleton active paragraph={{ rows: 6 }} />,
  },
);

const PortalRutaAcademicaSection = dynamic(
  () => import("@/modules/portal-estudiante/components/PortalRutaAcademicaSection").then((m) => m.PortalRutaAcademicaSection),
  {
    ssr: false,
    loading: () => <Skeleton active paragraph={{ rows: 8 }} />,
  },
);

dayjs.locale("es");

const { Title, Text } = Typography;

type TemaVisualConfig = {
  palette: [string, string];
  accent: string;
  label: string;
};

const CURSO_UNAS_MATCHERS = [/uñas|unas|manicur|pedicur|semipermanent|esmalt|acril|gel|nail/i];

const TEMA_VISUAL_PRESETS_UNAS: Array<{ matchers: RegExp[]; config: TemaVisualConfig }> = [
  {
    matchers: [/bioseg|higien|seguridad|esteriliz|anatom/i],
    config: { palette: ["#86efac", "#f0fdf4"], accent: "#166534", label: "CARE" },
  },
  {
    matchers: [/pedi|pie|spa|duraz|masaje|relaja|hidrat/i],
    config: { palette: ["#99f6e4", "#f0fdfa"], accent: "#0f766e", label: "PEDI" },
  },
  {
    matchers: [/maquill|frances|decor|art|color/i],
    config: { palette: ["#f9a8d4", "#fdf2f8"], accent: "#9d174d", label: "ART" },
  },
  {
    matchers: [/manicur|esmalt|acril|gel|soft gel|polygel|tradicional|semi/i],
    config: { palette: ["#fda4af", "#fff1f2"], accent: "#be185d", label: "NAILS" },
  },
];

const TEMA_VISUAL_PRESETS: Array<{ matchers: RegExp[]; config: TemaVisualConfig }> = [
  {
    matchers: [/uñas|unas|acrilic|manicure|pedicure/i],
    config: { palette: ["#ff8fb1", "#ffd6e0"], accent: "#a61e4d", label: "NAILS" },
  },
  {
    matchers: [/cejas|brow|laminad|micro/i],
    config: { palette: ["#c8b6ff", "#efe7ff"], accent: "#5b3cc4", label: "BROWS" },
  },
  {
    matchers: [/pestañ|lash|volumen/i],
    config: { palette: ["#9ad0f5", "#e8f6ff"], accent: "#0b6aa2", label: "LASHES" },
  },
  {
    matchers: [/maquill|makeup|visag/i],
    config: { palette: ["#ffb86b", "#fff0d9"], accent: "#a24a00", label: "MAKEUP" },
  },
  {
    matchers: [/bioseg|higien|seguridad|esteriliz/i],
    config: { palette: ["#7dd3a7", "#e8fff3"], accent: "#166534", label: "CARE" },
  },
  {
    matchers: [/color|mecha|balayage|decolor/i],
    config: { palette: ["#f9a8d4", "#fff1f8"], accent: "#9d174d", label: "COLOR" },
  },
  {
    matchers: [/facial|piel|skin|limpieza/i],
    config: { palette: ["#8be9fd", "#eefcff"], accent: "#0f766e", label: "SKIN" },
  },
  {
    matchers: [/masaje|spa|relaja/i],
    config: { palette: ["#b7e4c7", "#f1fff5"], accent: "#2d6a4f", label: "SPA" },
  },
  {
    matchers: [/barber|corte|fade|cabello|peinad/i],
    config: { palette: ["#94a3b8", "#f8fafc"], accent: "#334155", label: "STYLE" },
  },
];

const DEFAULT_TEMA_VISUAL: TemaVisualConfig = {
  palette: ["#f472b6", "#fdf2f8"],
  accent: "#9d174d",
  label: "TEMA",
};

const DEFAULT_TEMA_VISUAL_UNAS: TemaVisualConfig = {
  palette: ["#fda4af", "#fff1f2"],
  accent: "#be185d",
  label: "NAILS",
};

const TEMA_IMAGE_CACHE = new Map<string, string>();

const resolveTemaVisual = (tema: any, cursoContext?: any): TemaVisualConfig => {
  const text = `${String(tema?.nombre_curso || tema?.titulo || "")} ${String(tema?.descripcion || "")}`;
  const cursoText = `${String(cursoContext?.nombre || "")} ${String(cursoContext?.nombre_curso || "")} ${String(cursoContext?.nombre_grupo || "")} ${String(cursoContext?.programas?.nombre || "")} ${String(cursoContext?.programa?.nombre || "")}`;
  const esCursoUnas = CURSO_UNAS_MATCHERS.some((matcher) => matcher.test(cursoText));

  if (esCursoUnas) {
    return TEMA_VISUAL_PRESETS_UNAS.find((preset) => preset.matchers.some((matcher) => matcher.test(text)))?.config || DEFAULT_TEMA_VISUAL_UNAS;
  }

  return TEMA_VISUAL_PRESETS.find((preset) => preset.matchers.some((matcher) => matcher.test(text)))?.config || DEFAULT_TEMA_VISUAL;
};

const getTemaInitials = (tema: any) => {
  const source = String(tema?.nombre_curso || tema?.titulo || "Tema").trim();
  const words = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = words.map((word) => word.charAt(0).toUpperCase()).join("");
  return initials || "TM";
};

const buildTemaImageDataUri = (tema: any, cursoContext?: any) => {
  const temaId = String(tema?.id || "");
  const cursoId = String(cursoContext?.id || cursoContext?.programa_id || cursoContext?.nombre || "");
  const cacheKey = `${temaId}::${cursoId}`;

  const cached = TEMA_IMAGE_CACHE.get(cacheKey);
  if (cached) return cached;

  const visual = resolveTemaVisual(tema, cursoContext);
  const initials = getTemaInitials(tema);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120" fill="none">
      <defs>
        <linearGradient id="bg" x1="18" y1="12" x2="144" y2="108" gradientUnits="userSpaceOnUse">
          <stop stop-color="${visual.palette[0]}"/>
          <stop offset="1" stop-color="${visual.palette[1]}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="120" rx="20" fill="url(#bg)"/>
      <circle cx="126" cy="30" r="28" fill="white" fill-opacity="0.26"/>
      <circle cx="34" cy="92" r="36" fill="white" fill-opacity="0.18"/>
      <rect x="14" y="14" width="62" height="22" rx="11" fill="white" fill-opacity="0.92"/>
      <text x="45" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${visual.accent}">${visual.label}</text>
      <text x="18" y="88" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${visual.accent}">${initials}</text>
      <path d="M108 72C118 60 132 61 140 72" stroke="${visual.accent}" stroke-width="6" stroke-linecap="round" opacity="0.28"/>
      <path d="M98 84C112 68 132 68 146 84" stroke="${visual.accent}" stroke-width="4" stroke-linecap="round" opacity="0.2"/>
    </svg>`;

  const encoded = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  if (cacheKey !== "::") {
    TEMA_IMAGE_CACHE.set(cacheKey, encoded);
  }
  return encoded;
};

export default function PortalEstudiante() {
  const router = useRouter();
  const portalMobileUiV1 = useFeatureFlag("portal_mobile_ui_v1", true);
  const portalDelayedLoaderV1 = useFeatureFlag("portal_delayed_loader_v1", true);
  const isMobileDetected = useIsMobile("md");
  const isMobile = portalMobileUiV1 ? isMobileDetected : false;
  const [activeTab, setActiveTab] = useState("1");
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [pensum, setPensum] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesCiclo, setMaterialesCiclo] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [quizzesClase, setQuizzesClase] = useState<any[]>([]);
  const [quizIntentos, setQuizIntentos] = useState<any[]>([]);
  const [calificacionesActividad, setCalificacionesActividad] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [evidenciasTareas, setEvidenciasTareas] = useState<any[]>([]);
  const [evidenciaUploadByTema, setEvidenciaUploadByTema] = useState<Record<string, boolean>>({});
  const logrocardRef = useRef<HTMLDivElement>(null);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAdmisiones, setWhatsappAdmisiones] = useState<string | null>(null);
  const [logoAcademia, setLogoAcademia] = useState<string | null>(null);
  const [matriculaRutaId, setMatriculaRutaId] = useState<string | null>(null);
  const [cicloRutaId, setCicloRutaId] = useState<string | null>(null);
  const [temaRutaId, setTemaRutaId] = useState<string | null>(null);
  const [iframePreview, setIframePreview] = useState<{ open: boolean; title: string; src: string; temaId: string }>({
    open: false,
    title: "",
    src: "",
    temaId: "",
  });
  const [iframePromptVisible, setIframePromptVisible] = useState(false);
  const [iframeTrackingSupported, setIframeTrackingSupported] = useState(true);
  const academicContentRequestedRef = useRef(false);
  const [academicContentLoading, setAcademicContentLoading] = useState(false);
  const [academicContentReady, setAcademicContentReady] = useState(false);
  const iframeEmbedRef = useRef<HTMLIFrameElement>(null);

  const applyPortalPayload = useCallback((payload: any) => {
    setEstudiante(payload.estudiante);
    setWhatsappAgente(payload.whatsappAgente);
    setWhatsappAdmisiones(payload.whatsappAdmisiones);
    setLogoAcademia(payload.logoAcademia);

    setMatriculas(payload.matriculas);
    setPagos(payload.pagos);
    setAsistencias(payload.asistencias);
    setQuizIntentos(payload.quizIntentos);
    setCalificacionesActividad(payload.calificacionesActividad);
    setCalificaciones(payload.calificaciones || []);
    setPensum(payload.pensum);
    setMateriales(payload.materiales);
    setMaterialesCiclo(payload.materialesCiclo);
    setMaterialesClase(payload.materialesClase);
    setEvidenciasTareas(payload.evidenciasTareas || []);
    setQuizzesClase(payload.quizzesClase);
    setAvancePorCurso(payload.avancePorCurso);
    setCertificados(payload.certificados);
  }, []);

  const handlePortalAuthError = useCallback(() => {
    message.error("Tu sesión expiró. Inicia sesión nuevamente.");
    router.replace("/login");
  }, [router]);

  const handlePortalProfileError = useCallback(() => {
    message.error("Perfil no encontrado. Contacta a la administración.");
    router.replace("/login?error=email-no-registrado");
  }, [router]);

  const handlePortalAccessDenied = useCallback(() => {
    message.error("Esta cuenta no tiene acceso al panel de estudiante.");
    router.replace("/");
  }, [router]);

  const handlePortalUnknownError = useCallback((error: unknown) => {
    logger.error("Error:", error);
    message.error("Error cargando información del portal");
  }, []);

  const handleChecklistLoadError = useCallback((error: unknown) => {
    logger.error("No se pudo cargar checklist de insumos", error);
  }, []);

  const handleChecklistSaveError = useCallback((error: unknown) => {
    logger.error("No se pudo guardar checklist de insumos", error);
  }, []);

  const { loading, loadPortalData } = usePortalData({
    onSuccessAction: applyPortalPayload,
    onAuthErrorAction: handlePortalAuthError,
    onProfileErrorAction: handlePortalProfileError,
    onAccessDeniedAction: handlePortalAccessDenied,
    onUnknownErrorAction: handlePortalUnknownError,
  });

  const {
    buildChecklistKey,
    isChecklistItemChecked,
    setChecklistItemChecked,
  } = useChecklistInsumos({
    estudianteId: estudiante?.id || null,
    onLoadErrorAction: handleChecklistLoadError,
    onSaveErrorAction: handleChecklistSaveError,
  });

  const showLoadingUi = useDelayedLoader(loading, portalDelayedLoaderV1 ? 180 : 0);

  const actividadPorTemaMatricula = React.useMemo(() => {
    const map = new Map<string, number>();
    (calificacionesActividad || []).forEach((item: any) => {
      const temaId = String(item?.tema_id || "");
      const matriculaId = String(item?.matricula_id || "");
      if (!temaId || !matriculaId) return;

      const key = `${matriculaId}-${temaId}`;
      if (map.has(key)) return;
      const nota = Number(item?.calificacion ?? item?.nota);
      if (!Number.isFinite(nota)) return;
      map.set(key, nota);
    });
    return map;
  }, [calificacionesActividad]);

  const deduplicarLista = <T,>(items: T[], resolverClave: (item: T) => string) => {
    const vistos = new Set<string>();
    const resultado: T[] = [];
    for (const item of items || []) {
      const clave = resolverClave(item);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      resultado.push(item);
    }
    return resultado;
  };

  const {
    matriculasActivas,
    matriculaSeleccionada,
    ciclosPrograma,
    obtenerTemasCiclo,
    obtenerRecursosTema,
    obtenerInsumosTema,
    obtenerMaterialesCiclo,
  } = useTemaMaterials({
    matriculas,
    matriculaRutaId,
    pensum,
    materiales,
    materialesClase,
    materialesCiclo,
    deduplicarListaAction: deduplicarLista,
    normalizarTextoAction: normalizarTexto,
    normalizarTemaComparacionAction: normalizarTemaComparacion,
    parseTemaTituloMaterialAction: parseTemaTituloMaterial,
    getMaterialCanonicalKeyAction: getMaterialCanonicalKey,
  });

  const obtenerMatriculaDeQuiz = (quiz: any) => {
    const temaId = String(quiz?.pensum_curso_id || "");
    const temaEncontrado = (pensum || []).find((ciclo: any) =>
      (ciclo?.pensum_cursos || []).some((tema: any) => String(tema?.id) === temaId)
    );

    const programaId = String(quiz?.programa_id || temaEncontrado?.programa_id || "");
    return (matriculas || []).find(
      (matricula: any) => String(matricula?.cursos?.programa_id || "") === programaId
    ) || null;
  };

  const getMaterialIcon = (material: any) => {
    const tipo = String(material?.tipo_material || "").toLowerCase();
    const url = String(material?.url_archivo || "").toLowerCase();
    const titulo = String(material?.titulo || material?.nombre_archivo || "").toLowerCase();
    const texto = `${tipo} ${url} ${titulo}`;

    if (texto.includes("canva.com")) return <LinkOutlined />;
    if (texto.includes("gamma.app") || tipo.includes("iframe") || String(material?.mime_type || "").toLowerCase() === "iframe") return <VideoCameraOutlined />;
    if (texto.includes("youtube.com") || texto.includes("youtu.be")) return <YoutubeOutlined />;
    if (texto.match(/\.(mp4|mov|avi|mkv|webm)$/) || texto.includes("video")) return <PlayCircleOutlined />;
    if (texto.match(/\.(png|jpg|jpeg|gif|webp|svg)$/) || texto.includes("imagen")) return <PictureOutlined />;
    if (texto.match(/\.(xlsx|xls|csv)$/) || texto.includes("excel") || texto.includes("sheet")) return <FileExcelOutlined />;
    if (texto.match(/\.(ppt|pptx)$/) || texto.includes("powerpoint") || texto.includes("diapositiva")) return <FilePptOutlined />;
    if (texto.match(/\.(doc|docx)$/) || texto.includes("word")) return <FileWordOutlined />;
    if (texto.match(/\.pdf$/) || texto.includes("pdf")) return <FileTextOutlined />;
    if (url.startsWith("http")) return <LinkOutlined />;
    return <FileOutlined />;
  };

  const obtenerTextoOpcionQuiz = (pregunta: any, opcion?: string | null) => {
    const letra = normalizarClaveOpcionQuiz(opcion);
    if (!letra) return "Sin respuesta";

    const opciones: Record<string, string> = {
      A: String(pregunta?.opcion_a || ""),
      B: String(pregunta?.opcion_b || ""),
      C: String(pregunta?.opcion_c || ""),
      D: String(pregunta?.opcion_d || ""),
    };

    const texto = opciones[letra] || "";
    return texto ? `${letra}) ${texto}` : letra;
  };

  const normalizarClaveOpcionQuiz = (valor?: string | null) => {
    const raw = String(valor || "").trim().toUpperCase();
    if (!raw) return "";
    if (["A", "B", "C", "D"].includes(raw)) return raw;
    if (/^OPCION[_\s-]*A$/i.test(raw)) return "A";
    if (/^OPCION[_\s-]*B$/i.test(raw)) return "B";
    if (/^OPCION[_\s-]*C$/i.test(raw)) return "C";
    if (/^OPCION[_\s-]*D$/i.test(raw)) return "D";
    return "";
  };

  const normalizarTextoComparacionQuiz = (valor?: string | null) =>
    String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");

  const resolverClaveOpcionQuiz = (pregunta: any, valor?: string | null) => {
    const claveDirecta = normalizarClaveOpcionQuiz(valor);
    if (claveDirecta) return claveDirecta;

    const textoObjetivo = normalizarTextoComparacionQuiz(valor);
    if (!textoObjetivo) return "";

    const opciones: Array<{ key: string; texto: string }> = [
      { key: "A", texto: String(pregunta?.opcion_a || "") },
      { key: "B", texto: String(pregunta?.opcion_b || "") },
      { key: "C", texto: String(pregunta?.opcion_c || "") },
      { key: "D", texto: String(pregunta?.opcion_d || "") },
    ];

    const exacta = opciones.find((op) => normalizarTextoComparacionQuiz(op.texto) === textoObjetivo);
    if (exacta) return exacta.key;

    const contiene = opciones.find((op) => {
      const normalizado = normalizarTextoComparacionQuiz(op.texto);
      return normalizado && (textoObjetivo.includes(normalizado) || normalizado.includes(textoObjetivo));
    });

    return contiene?.key || "";
  };

  const {
    quizPreguntas,
    quizModalOpen,
    quizActivo,
    quizSaving,
    quizRespuestas,
    quizPreguntaActual,
    quizAnimando,
    quizResultado,
    quizResultadoVisible,
    setQuizRespuestas,
    setQuizPreguntaActual,
    setQuizAnimando,
    setQuizResultadoVisible,
    openQuiz: abrirQuiz,
    submitQuiz: enviarQuiz,
    resetQuizModalState,
  } = useQuizFlow({
    estudianteId: estudiante?.id || null,
    setQuizIntentosAction: setQuizIntentos,
    getMatriculaDeQuizAction: obtenerMatriculaDeQuiz,
    resolveClaveOpcionAction: resolverClaveOpcionQuiz,
    getTextoOpcionAction: obtenerTextoOpcionQuiz,
    onRefreshPortalAction: loadPortalData,
  });

  const {
    getQuizByTemaId,
    getNotaByTemaId,
    isTemaCompletadoByTemaId,
    getPrimerTemaPendienteIndex,
    getPrimerCicloIncompletoIndex,
  } = useCourseProgress({
    quizzesClase,
    quizIntentos,
    isQuizApprovedAction: quizAprobado,
  });

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

  const isPdfMaterial = (material: any) => {
    const mime = String(material?.mime_type || "").toLowerCase();
    const tipo = String(material?.tipo_material || "").toLowerCase();
    const url = String(material?.url_archivo || "").toLowerCase();
    const nombre = String(material?.nombre_archivo || "").toLowerCase();
    const titulo = String(material?.titulo || "").toLowerCase();
    const texto = `${mime} ${tipo} ${url} ${nombre} ${titulo}`;
    return mime.includes("pdf") || tipo.includes("pdf") || nombre.endsWith(".pdf") || /\.pdf(?:$|\?|#)/i.test(url) || texto.includes(" pdf ");
  };

  const obtenerPdfRelacionado = (material: any, recursosTema: any[] = []) => {
    if (!Array.isArray(recursosTema) || !recursosTema.length) return null;

    const parsedActual = parseTemaTituloMaterial(material?.titulo);
    const tituloBase = normalizarTexto(getMaterialCanonicalTitle(material, parsedActual?.tema));
    const temaBase = normalizarTemaComparacion(parsedActual?.tema || "");

    const recursosPdf = recursosTema.filter((recurso: any) => isPdfMaterial(recurso));
    if (!recursosPdf.length) return null;

    const porTitulo = recursosPdf.find((recurso: any) => {
      const parsed = parseTemaTituloMaterial(recurso?.titulo);
      const tituloRecurso = normalizarTexto(getMaterialCanonicalTitle(recurso, parsed?.tema || parsedActual?.tema));
      return Boolean(tituloBase) && tituloRecurso === tituloBase;
    });
    if (porTitulo) return porTitulo;

    const porTema = recursosPdf.find((recurso: any) => {
      if (!temaBase) return false;
      const parsed = parseTemaTituloMaterial(recurso?.titulo);
      return normalizarTemaComparacion(parsed?.tema || "") === temaBase;
    });
    if (porTema) return porTema;

    return recursosPdf[0] || null;
  };

  const abrirMaterialDidactico = (material: any, titulo: string, temaIdForQuiz?: string) => {
    const src = extractIframeSrc(material?.url_archivo);
    if (!src) {
      message.warning("Este material no tiene un enlace válido para previsualizar.");
      return;
    }

    if (isIframeMaterial(material)) {
      if (hasMalformedEmbedTokens(src)) {
        message.warning("El enlace del iframe está dañado. Pide al administrador volver a subirlo.");
        return;
      }

      if (!isAllowedEmbedHost(src)) {
        message.warning("Solo se pueden previsualizar iframes de Gamma.");
        window.open(src, "_blank", "noopener,noreferrer");
        return;
      }

      setIframePreview({
        open: true,
        title: titulo || "Presentación",
        src: toGammaEmbedUrl(src),
        temaId: String(temaIdForQuiz || material?.pensum_curso_id || material?.tema_id || ""),
      });
      return;
    }

    window.open(src, "_blank", "noopener,noreferrer");
  };

  const obtenerSaludoBienvenida = (genero?: string | null) => {
    const generoNormalizado = String(genero || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (["femenino", "femenina", "mujer"].includes(generoNormalizado)) {
      return "Bienvenida";
    }

    if (["masculino", "masculina", "hombre"].includes(generoNormalizado)) {
      return "Bienvenido";
    }

    return "Te damos la bienvenida";
  };

  const abrirWhatsapp = (telefono: string | null, mensajeBase: string) => {
    if (!telefono) {
      message.warning("No hay número de WhatsApp configurado");
      return;
    }

    const enlace = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeBase)}`;
    window.open(enlace, "_blank", "noopener,noreferrer");
  };

  const abrirWhatsappSoporte = (destino: "agente" | "academia", mensajeBase: string) => {
    const telefono = destino === "agente" ? whatsappAgente : whatsappAdmisiones;
    abrirWhatsapp(telefono, mensajeBase);
  };

  const comprimirImagenEvidencia = async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);

    const maxSide = 1280;
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo inicializar el compresor de imagen");
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((out) => resolve(out), "image/webp", 0.78);
    });

    bitmap.close();

    if (!blob) {
      throw new Error("No se pudo comprimir la imagen");
    }

    return blob;
  };

  const subirEvidenciaTema = async (temaId: string, temaNombre: string, file: File) => {
    const temaIdSafe = String(temaId || "");
    if (!temaIdSafe) {
      message.warning("Tema inválido para subir evidencia");
      return;
    }

    if (!matriculaSeleccionada?.id || !estudiante?.id) {
      message.warning("No se encontró la matrícula activa");
      return;
    }

    if (!String(file?.type || "").startsWith("image/")) {
      message.warning("Solo se permiten imágenes");
      return;
    }

    setEvidenciaUploadByTema((prev) => ({ ...prev, [temaIdSafe]: true }));

    try {
      const existente = (evidenciasTareas || []).find((item: any) =>
        String(item?.matricula_id || "") === String(matriculaSeleccionada.id)
        && String(item?.pensum_curso_id || "") === temaIdSafe
      );

      const blob = await comprimirImagenEvidencia(file);
      const extension = "webp";
      const filename = `${temaIdSafe}-${Date.now()}.${extension}`;
      const storagePath = `${estudiante.id}/${matriculaSeleccionada.id}/${filename}`;

      const { error: uploadError } = await supabaseBrowserClient.storage
        .from("evidencias-tareas")
        .upload(storagePath, blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabaseBrowserClient.storage
        .from("evidencias-tareas")
        .getPublicUrl(storagePath);

      const payload = {
        matricula_id: matriculaSeleccionada.id,
        curso_id: matriculaSeleccionada?.curso_id || matriculaSeleccionada?.cursos?.id || null,
        pensum_curso_id: temaIdSafe,
        estudiante_id: estudiante.id,
        url_imagen: publicData?.publicUrl || "",
        storage_path: storagePath,
        nombre_archivo: file.name,
        mime_type: "image/webp",
        tamano_bytes: blob.size,
        updated_at: new Date().toISOString(),
      } as any;

      let persisted: any = null;

      if (existente?.id) {
        const { data, error } = await supabaseBrowserClient
          .from("evidencias_tareas")
          .update(payload)
          .eq("id", existente.id)
          .select("*")
          .single();
        if (error) throw error;
        persisted = data;

        if (existente?.storage_path && existente.storage_path !== storagePath) {
          await supabaseBrowserClient.storage.from("evidencias-tareas").remove([String(existente.storage_path)]);
        }
      } else {
        const { data, error } = await supabaseBrowserClient
          .from("evidencias_tareas")
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (error) throw error;
        persisted = data;
      }

      setEvidenciasTareas((prev) => {
        const rest = (prev || []).filter((item: any) => String(item?.id || "") !== String(persisted?.id || ""));
        return [persisted, ...rest];
      });

      message.success(`Evidencia subida en ${temaNombre || "el tema"}. +25 XP semanal`);
    } catch (error: any) {
      logger.error("Error subiendo evidencia de tarea", error);
      message.error(error?.message || "No se pudo subir la evidencia");
    } finally {
      setEvidenciaUploadByTema((prev) => ({ ...prev, [temaIdSafe]: false }));
    }
  };

  const whatsappSoporteItems = React.useMemo(
    () => [
      {
        key: "agente",
        label: "Hablar con Agente",
        disabled: !whatsappAgente,
      },
      {
        key: "academia",
        label: "Hablar con Academia",
        disabled: !whatsappAdmisiones,
      },
    ],
    [whatsappAgente, whatsappAdmisiones]
  );

  useEffect(() => {
    loadPortalData({ includeAcademicContent: false });
  }, [loadPortalData]);

  useEffect(() => {
    if (loading) return;
    void import("@/modules/portal-estudiante/components/PortalRutaAcademicaSection");
  }, [loading]);

  useEffect(() => {
    const needsAcademicContent = activeTab === "3" || activeTab === "5";
    if (!needsAcademicContent || academicContentRequestedRef.current) return;
    if (loading) return;

    academicContentRequestedRef.current = true;
    setAcademicContentLoading(true);
    void loadPortalData({ includeAcademicContent: true }).finally(() => {
      setAcademicContentLoading(false);
      setAcademicContentReady(true);
    });
  }, [activeTab, loading, loadPortalData]);

  useEffect(() => {
    if (!matriculas.length) {
      setMatriculaRutaId(null);
      setCicloRutaId(null);
      setTemaRutaId(null);
      return;
    }

    if (!matriculaRutaId) {
      return;
    }

    const existeMatricula = matriculas.some((m: any) => String(m.id) === String(matriculaRutaId));
    if (!existeMatricula) {
      setMatriculaRutaId(String(matriculas[0].id));
      setCicloRutaId(null);
      setTemaRutaId(null);
    }
  }, [matriculas, matriculaRutaId]);

  useEffect(() => {
    if (!iframePreview.open) {
      setIframePromptVisible(false);
      setIframeTrackingSupported(true);
      return;
    }

    let intervalId: number | null = null;

    const verificarFinLectura = () => {
      const iframe = iframeEmbedRef.current;
      if (!iframe) return;

      try {
        const iframeWindow = iframe.contentWindow;
        const iframeDoc = iframeWindow?.document;
        if (!iframeWindow || !iframeDoc) return;

        setIframeTrackingSupported((prev) => (prev ? prev : true));

        const root = iframeDoc.documentElement;
        const body = iframeDoc.body;

        const scrollTop = Math.max(
          iframeWindow.scrollY || 0,
          root?.scrollTop || 0,
          body?.scrollTop || 0,
        );
        const scrollHeight = Math.max(
          root?.scrollHeight || 0,
          body?.scrollHeight || 0,
        );
        const viewportHeight = iframeWindow.innerHeight || root?.clientHeight || body?.clientHeight || 0;

        if (scrollHeight > 0 && scrollTop + viewportHeight >= scrollHeight - 24) {
          setIframePromptVisible(true);
        }
      } catch {
        setIframeTrackingSupported((prev) => (prev ? false : prev));
        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    intervalId = window.setInterval(verificarFinLectura, 1200);
    const primerCheck = window.setTimeout(verificarFinLectura, 900);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.clearTimeout(primerCheck);
    };
  }, [iframePreview.open, iframePreview.src]);

  const quizDirectoIframe = React.useMemo(() => {
    const temaId = String(iframePreview.temaId || "");

    if (temaId) {
      const found = (quizzesClase || []).find((quiz: any) => String(quiz?.pensum_curso_id || "") === temaId);
      if (found) return found;
    }

    const tituloNormalizado = normalizarTexto(iframePreview.title || "");
    if (!tituloNormalizado) return null;

    const temaPorTitulo = (pensum || [])
      .flatMap((ciclo: any) => ciclo?.pensum_cursos || [])
      .find((tema: any) => normalizarTexto(tema?.nombre_curso || tema?.titulo || "") === tituloNormalizado);

    if (!temaPorTitulo?.id) return null;
    
    const found = (quizzesClase || []).find((quiz: any) => String(quiz?.pensum_curso_id || "") === String(temaPorTitulo.id));
    return found || null;
  }, [quizzesClase, iframePreview.temaId, iframePreview.title, pensum]);

  const cerrarIframeAPensum = () => {
    setActiveTab("5");
    setIframePromptVisible(false);
    setIframeTrackingSupported(true);
    setIframePreview({ open: false, title: "", src: "", temaId: "" });
  };

  const irQuizDesdeIframe = async () => {
    let quiz = quizDirectoIframe;

    // Si no encontró por temaId, buscar por título normalizado
    if (!quiz && iframePreview.title && quizzesClase?.length) {
      const tituloNormalizado = normalizarTexto(iframePreview.title);
      
      quiz = (quizzesClase || []).find((q: any) => {
        const tituloQuiz = normalizarTexto(q?.titulo || "");
        return tituloQuiz === tituloNormalizado;
      });
    }

    if (!quiz) {
      message.info("Este tema aún no tiene quiz activo. Revisa el pensum.");
      cerrarIframeAPensum();
      return;
    }

    setIframePromptVisible(false);
    setIframeTrackingSupported(true);
    setIframePreview({ open: false, title: "", src: "", temaId: "" });
    setActiveTab("5");
    
    // Pequeño delay para asegurar que el estado se actualice antes de abrir el quiz
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await abrirQuiz(quiz);
    } catch (error) {
      console.error("❌ Error abriendo quiz:", error);
      message.error("No se pudo abrir el quiz");
    }
  };

  const descargarCertificado = async (matricula: any) => {
    try {
      await descargarCertificadoPDF({
        estudianteName: estudiante?.nombre_completo || "Estudiante",
        courseName: construirNombreGrupo(matricula?.cursos) || "Curso",
        fechaFinalizacion: matricula?.cursos?.fecha_fin || new Date().toISOString(),
        folio: String(matricula?.id || "FOLIO"),
      });
      message.success("Certificado descargado");
    } catch (err: any) {
      logger.error(err);
      message.error("No se pudo descargar el certificado");
    }
  };

  const parseDuracionMeses = (valor?: string | number | null) => {
    if (typeof valor === "number" && Number.isFinite(valor)) return Math.max(valor, 0);
    const texto = String(valor || "");
    const match = texto.match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const parseNumeroCuota = (pago: any): number | null => {
    const numero = Number(pago?.numero_cuota);
    if (Number.isFinite(numero) && numero > 0) return numero;
    const raw = String(pago?.periodo_pagado || "");
    const match = raw.match(/\d+/);
    return match ? Number(match[0]) : null;
  };

  const CLASES_POR_MENSUALIDAD = 4;

  /**
   * Devuelve las fechas únicas de clases DICTADAS para una matrícula,
   * sin importar si el estudiante asistió o no.
   *
   * Regla de negocio:
   *   - Si el profesor enseñó y el estudiante asistió → asistencias.estado = "presente" → clase dictada ✅
   *   - Si el profesor enseñó y el estudiante NO vino → asistencias.estado = "ausente" → clase dictada ✅ (el estudiante debe pagar)
   *   - Si el profesor NO vino → no existe registro en asistencias para esa fecha → clase no dictada ⛔ (no habilita cobro)
   *
   * Se cuenta cualquier registro en `asistencias` (estado presente O ausente) como evidencia
   * de que la clase fue dictada por el profesor.
   */
  const getFechasClaseDictadaByMatricula = useCallback((matriculaId: string | number | null | undefined) => {
    if (!matriculaId) return [] as dayjs.Dayjs[];

    const vistas = new Set<string>();
    const fechas: dayjs.Dayjs[] = [];

    // Se recorre SIN filtrar por estado: "ausente" también cuenta porque el
    // registro existe solo cuando el profesor tomó la asistencia (clase dictada).
    (asistencias || []).forEach((registro: any) => {
      if (String(registro?.matricula_id || "") !== String(matriculaId)) return;
      const fechaRaw = String(registro?.fecha || "").trim();
      if (!fechaRaw || vistas.has(fechaRaw)) return;

      const fecha = dayjs(fechaRaw).startOf("day");
      if (!fecha.isValid()) return;

      vistas.add(fechaRaw);
      fechas.push(fecha);
    });

    return fechas.sort((a, b) => a.valueOf() - b.valueOf());
  }, [asistencias]);

  const getFechaHabilitacionPorClases = useCallback((matriculaId: string | number | null | undefined, numeroCuota: number) => {
    if (!matriculaId || numeroCuota <= 1) return null;

    const clasesPreviasRequeridas = (numeroCuota - 1) * CLASES_POR_MENSUALIDAD;
    const fechasDictadas = getFechasClaseDictadaByMatricula(matriculaId);

    if (fechasDictadas.length < clasesPreviasRequeridas) {
      return null;
    }

    return fechasDictadas[clasesPreviasRequeridas - 1] || null;
  }, [getFechasClaseDictadaByMatricula]);

  // Fecha de vencimiento = fecha_vencimiento almacenada en BD (fecha_inicio_curso + (n-1) meses).
  // Las ausencias del profesor o festivos se manejan internamente y NO afectan el calendario.
  const getFechaVencimientoEfectiva = useCallback((pago: any): dayjs.Dayjs | null => {
    const base = pago?.fecha_vencimiento ? dayjs(pago.fecha_vencimiento).startOf("day") : null;
    return base && base.isValid() ? base : null;
  }, []);

  const getVisiblePaymentStatusWithGrace = (pago: any) => {
    return getVisiblePaymentStatus(pago);
  };

  const obtenerMensualidad = (matricula: any) =>
    Number(
      matricula?.valor_mensual_plan ||
      getPaymentPlan(matricula?.modalidad_pago).montoMensual ||
      matricula?.cursos?.precio_mensualidad ||
      matricula?.cursos?.programas?.precio_mensualidad ||
      matricula?.cursos?.precio ||
      0
    );

  const pagosConPendientes = React.useMemo(() => {
    const base = Array.isArray(pagos) ? pagos : [];
    if (!matriculas.length) return base;

    const extras: any[] = [];
    const pagosNormalizados = base.map((pago: any) => {
      const numeroCuota = parseNumeroCuota(pago);
      const estado = String(pago?.estado || "").toLowerCase();
      const montoActual = Number(pago?.monto ?? 0);

      if (!numeroCuota || numeroCuota < 1 || estado !== "pendiente" || montoActual > 0) {
        return pago;
      }

      const matricula = matriculas.find((m: any) => String(m?.id) === String(pago?.matricula_id));
      const mensualidad = obtenerMensualidad(matricula);
      if (mensualidad <= 0) {
        return pago;
      }

      return {
        ...pago,
        monto: mensualidad,
      };
    });

    matriculas.forEach((matricula: any) => {
      const modalidadPago = normalizeModalidadPago(matricula?.modalidad_pago);
      if (modalidadPago === "POR_CLASE") return;

      const totalCuotas = parseDuracionMeses(
        matricula?.cursos?.duracion ??
        matricula?.cursos?.programas?.duracion ??
        matricula?.cursos?.numero_cuotas ??
        matricula?.numero_cuotas
      );
      if (!totalCuotas) return;

      const pagosMatricula = base.filter((p) => String(p?.matricula_id) === String(matricula?.id));
      const cuotasExistentes = new Set<number>();

      pagosMatricula.forEach((p) => {
        const cuota = parseNumeroCuota(p);
        if (cuota && cuota >= 1 && cuota <= totalCuotas) {
          cuotasExistentes.add(cuota);
        }
      });

      for (let i = 1; i <= totalCuotas; i += 1) {
        if (cuotasExistentes.has(i)) continue;
        const fechaInicio = matricula?.fecha_inicio ? dayjs(matricula.fecha_inicio) : null;
        const fechaVencimiento = fechaInicio ? fechaInicio.add(i - 1, "month").format("YYYY-MM-DD") : null;

        extras.push({
          id: `pendiente-${matricula?.id}-${i}`,
          matricula_id: matricula?.id,
          numero_cuota: i,
          periodo_pagado: `Cuota ${i} de ${totalCuotas}`,
          fecha_vencimiento: fechaVencimiento,
          monto: obtenerMensualidad(matricula) || null,
          estado: "pendiente",
        });
      }
    });

    return [...pagosNormalizados, ...extras];
  }, [pagos, matriculas]);

  /** true si el estudiante tiene al menos una cuota vencida sin pagar */
  const enMora = React.useMemo(() => {
    const hoy = dayjs().startOf("day");
    return pagosConPendientes.some((p: any) => {
      if (p.estado !== "pendiente") return false;
      const fechaVencimientoEfectiva = getFechaVencimientoEfectiva(p);
      if (!fechaVencimientoEfectiva) return false;
      // vencida = la fecha de cobro ya pasó
      return hoy.isAfter(fechaVencimientoEfectiva);
    });
  }, [getFechaVencimientoEfectiva, pagosConPendientes]);

  const hasMonthlyEnrollment = React.useMemo(() => {
    return (matriculas || []).some((m: any) => normalizeModalidadPago(m?.modalidad_pago) !== "POR_CLASE");
  }, [matriculas]);

  // El bloqueo global de contenidos aplica solo a planes mensuales en mora.
  const enMoraBloqueante = enMora && hasMonthlyEnrollment;

  type MobileDetailRow = {
    label: string;
    value: React.ReactNode;
  };

  const renderMobileDetailRows = (rows: MobileDetailRow[]) => {
    const visibleRows = rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== "");

    return (
      <div className="portal-mobile-rows-grid">
        {visibleRows.map((row) => (
          <div key={row.label} className="portal-mobile-row" style={{ minWidth: 0 }}>
            <Text type="secondary" className="portal-mobile-row-label" style={{ display: "block", fontSize: 11, marginBottom: 4 }}>
              {row.label}
            </Text>
            <div className="portal-mobile-row-value" style={{ minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{row.value}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderMobileListCards = <T,>(
    items: T[],
    getCard: (item: T) => {
      key: React.Key;
      title: React.ReactNode;
      extra?: React.ReactNode;
      rows: MobileDetailRow[];
      footer?: React.ReactNode;
    },
    emptyText: string = "No hay información disponible"
  ) => (
    items.length === 0 ? <Empty description={emptyText} /> :
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {items.map((item) => {
        const card = getCard(item);
        return (
          <Card key={card.key} size="small" title={card.title} extra={card.extra} className="portal-mobile-data-card">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              {renderMobileDetailRows(card.rows)}
              {card.footer ? <div>{card.footer}</div> : null}
            </Space>
          </Card>
        );
      })}
    </Space>
  );

  const limpiarTemaAsistencia = (valor?: string | null, claseNumero?: number | string | null) => {
    const texto = String(valor || "").replace(/\s+/g, " ").trim();
    if (!texto) return "-";

    const numero = Number(claseNumero || 0);
    if (Number.isFinite(numero) && numero > 0) {
      return texto
        .replace(new RegExp(`^(?:Clase\\s*#?\\s*${numero}\\s*[-:–]\\s*)+`, "i"), "")
        .trim() || texto;
    }

    return texto;
  };

  const textoAportaInformacion = (valor?: string | null, referencia?: string | null) => {
    const texto = String(valor || "").replace(/\s+/g, " ").trim();
    const base = String(referencia || "").replace(/\s+/g, " ").trim();

    if (!texto) return false;
    if (!base) return true;

    return normalizarTexto(texto) !== normalizarTexto(base);
  };

  const limpiarConceptoCalificacion = (valor?: string | null) => {
    const raw = String(valor || "").replace(/\s+/g, " ").trim();
    if (!raw) return "Calificación";

    const limpio = raw
      .replace(/^quiz\s+de\s+clase\s*:\s*/i, "")
      .replace(/^quiz\s*[-:–]\s*/i, "")
      .replace(/^evaluaci[oó]n\s*[-:–]\s*/i, "")
      .replace(/^calificaci[oó]n\s*[-:–]\s*/i, "")
      .trim();

    return limpio || "Calificación";
  };

  const observacionUtilCalificacion = (registro: any) => {
    const observacion = String(registro?.observaciones || "").trim();
    if (!observacion) return undefined;

    const conceptoNormalizado = normalizarTexto(String(registro?.concepto || ""));
    const observacionNormalizada = normalizarTexto(observacion);
    if (!observacionNormalizada) return undefined;

    // Evita repetir información cuando es un quiz y la observación solo reitera el concepto.
    if (conceptoNormalizado && observacionNormalizada.includes(conceptoNormalizado)) {
      return undefined;
    }

    return observacion;
  };

  const renderFinanciero = () => (
    <PortalFinancieroSection
      isMobile={isMobile}
      matriculas={matriculas}
      pagosConPendientes={pagosConPendientes}
      renderMobileListCards={renderMobileListCards}
      getVisiblePaymentStatusWithGrace={getVisiblePaymentStatusWithGrace}
      getFechaVencimientoEfectiva={getFechaVencimientoEfectiva}
    />
  );

  const renderRutaAcademica = (vista: "plan" | "kits" | "ciclo", showCertificates = false) => (
    <PortalRutaAcademicaSection
      vista={vista}
      showCertificates={showCertificates}
      isMobile={isMobile}
      matriculas={matriculas}
      matriculasActivas={matriculasActivas}
      matriculaSeleccionada={matriculaSeleccionada}
      ciclosPrograma={ciclosPrograma}
      pagosConPendientes={pagosConPendientes}
      certificados={certificados}
      cicloRutaId={cicloRutaId}
      actividadPorTemaMatricula={actividadPorTemaMatricula}
      evidenciasTareas={evidenciasTareas}
      evidenciaUploadByTema={evidenciaUploadByTema}
      parseNumeroCuotaAction={parseNumeroCuota}
      getVisiblePaymentStatusWithGraceAction={getVisiblePaymentStatusWithGrace}
      getFechaVencimientoEfectivaAction={getFechaVencimientoEfectiva}
      getPrimerCicloIncompletoIndexAction={getPrimerCicloIncompletoIndex}
      getPrimerTemaPendienteIndexAction={getPrimerTemaPendienteIndex}
      getQuizByTemaIdAction={getQuizByTemaId}
      getNotaByTemaIdAction={getNotaByTemaId}
      isTemaCompletadoByTemaIdAction={isTemaCompletadoByTemaId}
      obtenerTemasCicloAction={obtenerTemasCiclo}
      obtenerMaterialesCicloAction={obtenerMaterialesCiclo}
      obtenerRecursosTemaAction={obtenerRecursosTema}
      obtenerInsumosTemaAction={obtenerInsumosTema}
      deduplicarListaAction={deduplicarLista}
      isIframeMaterialAction={isIframeMaterial}
      extractIframeSrcAction={extractIframeSrc}
      resolveTemaVisualAction={resolveTemaVisual}
      buildTemaImageDataUriAction={buildTemaImageDataUri}
      buildChecklistKeyAction={buildChecklistKey}
      isChecklistItemCheckedAction={isChecklistItemChecked}
      setChecklistItemCheckedAction={setChecklistItemChecked}
      obtenerPdfRelacionadoAction={obtenerPdfRelacionado}
      isPdfMaterialAction={isPdfMaterial}
      getMaterialIconAction={getMaterialIcon}
      onOpenMaterialAction={abrirMaterialDidactico}
      onOpenQuizAction={abrirQuiz}
      onUploadEvidenceAction={subirEvidenciaTema}
      onWarnAction={(warnMessage) => message.warning(warnMessage)}
      renderMobileListCardsAction={renderMobileListCards}
      onDownloadCertificadoAction={descargarCertificado}
      setMatriculaRutaIdAction={setMatriculaRutaId}
      setCicloRutaIdAction={setCicloRutaId}
      setTemaRutaIdAction={setTemaRutaId}
    />
  );

  const renderPensum = () => renderRutaAcademica("plan", true);

  const renderMaterialesKits = () => renderRutaAcademica("kits");

  const renderMaterialesCiclo = () => renderRutaAcademica("ciclo");

  const menuSecciones = [
    { key: "1", label: "Mis Cursos", icon: <BookOutlined /> },
    { key: "5", label: enMoraBloqueante ? "🔒 Pensum" : "Pensum", icon: <BookOutlined /> },
    { key: "2", label: enMora ? "💰 Financiero ⚠️" : "Financiero", icon: <DollarCircleOutlined /> },
    { key: "3", label: enMoraBloqueante ? "🔒 Materiales" : (isMobile ? "Materiales" : "Lista de materiales"), icon: <FileOutlined /> },
  ];

  const programaIdPorCursoId = React.useMemo(() => {
    const map = new Map<string, string>();
    (matriculas || []).forEach((matricula: any) => {
      const cursoId = String(matricula?.cursos?.id || matricula?.curso_id || "");
      const programaId = String(matricula?.cursos?.programa_id || "");
      if (!cursoId || !programaId || map.has(cursoId)) return;
      map.set(cursoId, programaId);
    });
    return map;
  }, [matriculas]);

  const temaPorProgramaClase = React.useMemo(() => {
    const map = new Map<string, string>();
    (pensum || []).forEach((ciclo: any) => {
      const programaId = String(ciclo?.programa_id || "");
      if (!programaId) return;

      const temasOrdenados = (ciclo?.pensum_cursos || [])
        .slice()
        .sort((a: any, b: any) => {
          const ordenA = Number(a?.orden || 0);
          const ordenB = Number(b?.orden || 0);
          if (ordenA !== ordenB) return ordenA - ordenB;
          return Number(a?.id || 0) - Number(b?.id || 0);
        });

      temasOrdenados.forEach((tema: any) => {
        const numero = Number(tema?.orden || 0);
        if (!Number.isFinite(numero) || numero <= 0) return;
        const key = `${programaId}-${numero}`;
        if (!map.has(key)) {
          map.set(key, String(tema?.nombre_curso || tema?.titulo || `Clase ${numero}`));
        }
      });
    });
    return map;
  }, [pensum]);

  const totalClasesPorPrograma = React.useMemo(() => {
    const map = new Map<string, number>();
    temaPorProgramaClase.forEach((_nombreTema, key) => {
      const [programaId, numeroTexto] = key.split("-");
      const numero = Number(numeroTexto || 0);
      if (!programaId || !Number.isFinite(numero) || numero <= 0) return;
      const actual = map.get(programaId) || 0;
      if (numero > actual) {
        map.set(programaId, numero);
      }
    });
    return map;
  }, [temaPorProgramaClase]);

  const claseNumeroAsistenciaCanonicoById = React.useMemo(() => {
    const porMatricula = new Map<
      string,
      Array<{ id: string; fecha: dayjs.Dayjs; numeroDeclarado: number | null; programaId: string }>
    >();

    (asistencias || []).forEach((item: any) => {
      const id = String(item?.id || "");
      const matriculaId = String(item?.matricula_id || "");
      const cursoId = String(item?.matriculas?.curso_id || "");
      const programaId = programaIdPorCursoId.get(cursoId) || "";
      const fecha = dayjs(String(item?.fecha || ""));
      const numeroDeclaradoRaw = Number(item?.clase_numero || extractClassNumber(item?.tema_visto || item?.registro_clase || ""));
      const numeroDeclarado = Number.isFinite(numeroDeclaradoRaw) && numeroDeclaradoRaw > 0 ? numeroDeclaradoRaw : null;

      if (!id || !matriculaId || !programaId || !fecha.isValid()) return;

      const current = porMatricula.get(matriculaId) || [];
      current.push({ id, fecha, numeroDeclarado, programaId });
      porMatricula.set(matriculaId, current);
    });

    const map = new Map<string, number>();

    porMatricula.forEach((registros) => {
      if (!registros.length) return;

      const programaId = registros[0]?.programaId || "";
      const totalClases = totalClasesPorPrograma.get(programaId) || 0;
      if (!totalClases) return;

      const usados = new Set<number>();
      const pendientes: typeof registros = [];

      const ordenados = [...registros].sort((a, b) => {
        const diff = a.fecha.valueOf() - b.fecha.valueOf();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      ordenados.forEach((registro) => {
        const n = Number(registro.numeroDeclarado || 0);
        if (Number.isFinite(n) && n > 0 && n <= totalClases && !usados.has(n)) {
          usados.add(n);
          map.set(registro.id, n);
        } else {
          pendientes.push(registro);
        }
      });

      let siguiente = 1;
      const siguienteLibre = () => {
        while (siguiente <= totalClases && usados.has(siguiente)) {
          siguiente += 1;
        }
        return siguiente <= totalClases ? siguiente : null;
      };

      pendientes.forEach((registro) => {
        const libre = siguienteLibre();
        if (!libre) return;
        usados.add(libre);
        map.set(registro.id, libre);
      });
    });

    return map;
  }, [asistencias, programaIdPorCursoId, totalClasesPorPrograma]);

  const estadoCalendarioAsistenciaById = React.useMemo(() => {
    const grupos = new Map<string, Array<{ id: string; fecha: dayjs.Dayjs; claseNumero: number }>>();

    (asistencias || []).forEach((item: any) => {
      const id = String(item?.id || "");
      const matriculaId = String(item?.matricula_id || "");
      const fecha = dayjs(String(item?.fecha || ""));
      const claseNumero = claseNumeroAsistenciaCanonicoById.get(id);

      if (!id || !matriculaId || !fecha.isValid() || !Number.isFinite(claseNumero)) {
        return;
      }

      const current = grupos.get(matriculaId) || [];
      current.push({ id, fecha, claseNumero: Number(claseNumero) });
      grupos.set(matriculaId, current);
    });

    const statusMap = new Map<string, { label: string; color: string }>();

    grupos.forEach((registros) => {
      const porFecha = [...registros].sort((a, b) => {
        const diff = a.fecha.valueOf() - b.fecha.valueOf();
        if (diff !== 0) return diff;
        return a.claseNumero - b.claseNumero;
      });

      const porClase = [...registros].sort((a, b) => {
        const diff = a.claseNumero - b.claseNumero;
        if (diff !== 0) return diff;
        return a.fecha.valueOf() - b.fecha.valueOf();
      });

      const posFecha = new Map<string, number>();
      const posClase = new Map<string, number>();

      porFecha.forEach((item, index) => posFecha.set(item.id, index + 1));
      porClase.forEach((item, index) => posClase.set(item.id, index + 1));

      registros.forEach((item) => {
        const pf = posFecha.get(item.id);
        const pc = posClase.get(item.id);
        if (!pf || !pc || pf === pc) return;

        if (pf < pc) {
          statusMap.set(item.id, { label: "Clase adelantada", color: "green" });
        } else {
          statusMap.set(item.id, { label: "Clase reprogramada", color: "orange" });
        }
      });
    });

    return statusMap;
  }, [asistencias, claseNumeroAsistenciaCanonicoById]);

  const temaSincronizadoAsistenciaById = React.useMemo(() => {
    const map = new Map<string, string>();

    (asistencias || []).forEach((registro: any) => {
      const id = String(registro?.id || "");
      if (!id) return;

      const cursoId = String(registro?.matriculas?.curso_id || "");
      const programaId = programaIdPorCursoId.get(cursoId) || "";
      const claseNumero = claseNumeroAsistenciaCanonicoById.get(id);

      if (!programaId || typeof claseNumero !== "number" || !Number.isFinite(claseNumero) || claseNumero <= 0) return;

      const nombreOficial = temaPorProgramaClase.get(`${programaId}-${claseNumero}`);
      if (!nombreOficial) return;

      map.set(id, `Clase #${claseNumero} - ${nombreOficial}`);
    });

    return map;
  }, [asistencias, programaIdPorCursoId, temaPorProgramaClase, claseNumeroAsistenciaCanonicoById]);

  const resumenAsistenciaPorMatricula = React.useMemo(() => {
    const map = new Map<string, {
      dictadas: number;
      presentes: number;
      ausentes: number;
      ultimaClaseNumero: number;
      ultimaFecha: string | null;
    }>();

    (asistencias || []).forEach((item: any) => {
      const matriculaId = String(item?.matricula_id || "");
      if (!matriculaId) return;

      const current = map.get(matriculaId) || {
        dictadas: 0,
        presentes: 0,
        ausentes: 0,
        ultimaClaseNumero: 0,
        ultimaFecha: null,
      };

      const estado = String(item?.estado || "").trim().toLowerCase();
      const claseNumero = Number(claseNumeroAsistenciaCanonicoById.get(String(item?.id || "")) || 0);
      const fecha = String(item?.fecha || "").trim() || null;

      current.dictadas += 1;
      if (estado === "presente") {
        current.presentes += 1;
      } else if (estado === "ausente" || estado === "falta") {
        current.ausentes += 1;
      }

      if (Number.isFinite(claseNumero) && claseNumero > current.ultimaClaseNumero) {
        current.ultimaClaseNumero = claseNumero;
      }

      if (fecha && (!current.ultimaFecha || dayjs(fecha).isAfter(dayjs(current.ultimaFecha)))) {
        current.ultimaFecha = fecha;
      }

      map.set(matriculaId, current);
    });

    return map;
  }, [asistencias, claseNumeroAsistenciaCanonicoById]);

  const notaPromedioPorMatricula = React.useMemo(() => {
    const acumulados = new Map<string, { total: number; cantidad: number }>();

    (calificaciones || []).forEach((item: any) => {
      const matriculaId = String(item?.matricula_id || "");
      const nota = Number(item?.calificacion ?? item?.nota);
      if (!matriculaId || !Number.isFinite(nota)) return;

      const actual = acumulados.get(matriculaId) || { total: 0, cantidad: 0 };
      actual.total += nota;
      actual.cantidad += 1;
      acumulados.set(matriculaId, actual);
    });

    const map = new Map<string, number>();
    acumulados.forEach((value, key) => {
      if (!value.cantidad) return;
      map.set(key, value.total / value.cantidad);
    });

    return map;
  }, [calificaciones]);

  const cantidadCalificacionesPorMatricula = React.useMemo(() => {
    const map = new Map<string, number>();

    (calificaciones || []).forEach((item: any) => {
      const matriculaId = String(item?.matricula_id || "");
      if (!matriculaId) return;
      map.set(matriculaId, (map.get(matriculaId) || 0) + 1);
    });

    return map;
  }, [calificaciones]);

  const misCursosResumen = React.useMemo(() => {
    return (matriculas || []).map((matricula: any) => {
      const matriculaId = String(matricula?.id || "");
      const programaId = String(matricula?.cursos?.programa_id || "");
      const totalClasesCurso = Number(matricula?.cursos?.total_clases || 0);
      const totalClasesPrograma = Number(matricula?.cursos?.programas?.total_clases || 0);
      const totalClasesPensum = totalClasesPorPrograma.get(programaId) || 0;
      const totalClases = totalClasesCurso || totalClasesPrograma || totalClasesPensum || 0;
      const resumenAsistencia = resumenAsistenciaPorMatricula.get(matriculaId) || {
        dictadas: 0,
        presentes: 0,
        ausentes: 0,
        ultimaClaseNumero: 0,
        ultimaFecha: null,
      };

      const notaMatricula = Number(matricula?.nota_final);
      const notaPromedio = notaPromedioPorMatricula.get(matriculaId);
      const cantidadCalificaciones = cantidadCalificacionesPorMatricula.get(matriculaId) || 0;
      const notaReal = Number.isFinite(notaMatricula)
        ? notaMatricula
        : Number.isFinite(notaPromedio)
        ? Number(notaPromedio)
        : 0;
      const tieneNotaRegistrada = (Number.isFinite(notaMatricula) && notaMatricula > 0) || (Number.isFinite(notaPromedio) && Number(notaPromedio) > 0);
      const tieneRegistrosAcademicos = resumenAsistencia.dictadas > 0 || cantidadCalificaciones > 0 || tieneNotaRegistrada;

      const escalaCinco = notaReal > 0 && notaReal <= 5;
      const umbralAprobacion = escalaCinco ? 3.0 : 70;
      const porcentajeNota = escalaCinco
        ? Math.round((notaReal / 5) * 100)
        : Math.round(notaReal);
      const metaAprobatoria = escalaCinco
        ? Math.round((notaReal / umbralAprobacion) * 100)
        : Math.round((notaReal / umbralAprobacion) * 100);
      const porcentajeAsistencia = resumenAsistencia.dictadas > 0
        ? Math.round((resumenAsistencia.presentes / resumenAsistencia.dictadas) * 100)
        : 0;
      const progresoCursoPercent = totalClases > 0
        ? Math.round((resumenAsistencia.dictadas / totalClases) * 100)
        : 0;

      const estadoAcademico = String(matricula?.estado_academico || "").trim().toLowerCase();
      const estadoMatricula = String(matricula?.estado || "").trim().toLowerCase();
      let estadoReal = estadoAcademico || estadoMatricula || "pendiente";

      if (!estadoAcademico) {
        if (estadoMatricula === "cancelado") {
          estadoReal = "cancelado";
        } else if (totalClases > 0 && resumenAsistencia.dictadas >= totalClases) {
          estadoReal = notaReal >= umbralAprobacion ? "aprobado" : "finalizado";
        } else if (!tieneRegistrosAcademicos && estadoMatricula === "activo") {
          estadoReal = "por iniciar";
        } else if (estadoMatricula === "activo" || resumenAsistencia.dictadas > 0) {
          estadoReal = "en curso";
        }
      }

      return {
        matriculaId,
        curso: construirNombreGrupo(matricula?.cursos),
        programa: matricula?.cursos?.programas?.nombre,
        programaId,
        diasSemana: matricula?.cursos?.dias_semana || null,
        horaInicio: matricula?.cursos?.hora_inicio || null,
        horaFin: matricula?.cursos?.hora_fin || null,
        horario: matricula?.cursos?.horario || null,
        nota: notaReal,
        notaDisplay: tieneNotaRegistrada ? (escalaCinco ? `${notaReal.toFixed(1)}/5.0` : `${Math.round(notaReal)}/100`) : "Sin nota",
        notaPercent: Math.max(0, Math.min(100, porcentajeNota)),
        metaPercent: Math.max(0, Math.min(100, metaAprobatoria)),
        umbralAprobacion,
        escalaCinco,
        tieneRegistrosAcademicos,
        estado: estadoReal,
        estadoColor:
          estadoReal === "aprobado" ? "green" :
          estadoReal === "por iniciar" ? "gold" :
          estadoReal === "reprobado" || estadoReal === "cancelado" ? "red" :
          estadoReal === "en curso" || estadoReal === "activo" ? "blue" : "orange",
        asistencias: resumenAsistencia.presentes,
        faltas: resumenAsistencia.ausentes,
        clasesDictadas: resumenAsistencia.dictadas,
        porcentajeAsistencia,
        progresoCursoPercent: Math.max(0, Math.min(100, progresoCursoPercent)),
        totalClases,
        ultimaClaseNumero: resumenAsistencia.ultimaClaseNumero,
        ultimaFechaClase: resumenAsistencia.ultimaFecha,
      };
    });
  }, [matriculas, notaPromedioPorMatricula, cantidadCalificacionesPorMatricula, resumenAsistenciaPorMatricula, totalClasesPorPrograma]);

  const gamification = useGamificationMetrics({
    misCursosResumen,
    asistencias,
    quizIntentos,
    evidenciasTareas,
  });

  const renderSeccionActiva = () => {
    if (activeTab === "1") {
      return (
        <>
          <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 12 }}>
            <GamificationHeader
              nivel={gamification.nivel}
              xpSemanal={gamification.xpSemanal}
              totalXp={gamification.totalXp}
              xpNivelActual={gamification.xpNivelActual}
              xpPorNivel={gamification.xpPorNivel}
              misionSiguienteTitulo={gamification.misionSiguiente?.titulo || null}
            />

            <StreakCard
              rachaActual={gamification.rachaActual}
              mejorRacha={gamification.mejorRacha}
              asistenciaPromedio={gamification.asistenciaPromedio}
            />

            <AchievementsStrip logros={gamification.logros} />

            <WeeklyMissionsCard misiones={gamification.misiones} />
          </Space>

          {misCursosResumen.length === 0 ? (
            <Empty description="No estás inscrito en ningún curso activo" />
          ) : (
            <Row gutter={16}>
              {misCursosResumen.map((curso: any, idx: number) => (
                <Col xs={24} sm={12} lg={8} key={idx}>
                  <Card className="course-card" title={curso.curso}>
                    <div className="course-card__hero">
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                          Progreso del curso
                        </Text>
                        <Text strong style={{ fontSize: isMobile ? 22 : 24, lineHeight: 1.1 }}>
                          {curso.clasesDictadas}{curso.totalClases ? `/${curso.totalClases}` : ""}
                        </Text>
                        <Text type="secondary" style={{ display: "block", marginTop: 2, fontSize: 12 }}>
                          clases registradas
                        </Text>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Tag color={curso.estadoColor}>{String(curso.estado || "pendiente").toUpperCase()}</Tag>
                        <Text strong style={{ display: "block", marginTop: 8, fontSize: isMobile ? 20 : 22 }}>
                          {curso.tieneRegistrosAcademicos ? `${curso.progresoCursoPercent}%` : "Sin avance"}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          avance actual
                        </Text>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <Progress
                        percent={curso.tieneRegistrosAcademicos ? curso.progresoCursoPercent : 0}
                        showInfo={false}
                        strokeColor={curso.estado === "aprobado" ? "#16a34a" : "#d81b87"}
                        trailColor="#e5e7eb"
                      />
                    </div>

                    <CourseFinishTrack
                      completadas={curso.clasesDictadas}
                      total={curso.totalClases}
                    />

                    <div style={{ marginTop: 12 }}>
                      {curso.tieneRegistrosAcademicos ? (
                        <div className="course-card__stats-grid">
                          <div className="course-card__stat-box">
                            <Text type="secondary">Nota</Text>
                            <Text strong>{curso.notaDisplay}</Text>
                          </div>
                          <div className="course-card__stat-box">
                            <Text type="secondary">Asistencia</Text>
                            <Text strong>{curso.porcentajeAsistencia}%</Text>
                          </div>
                          <div className="course-card__stat-box">
                            <Text type="secondary">Asistencias</Text>
                            <Text strong>{curso.asistencias}</Text>
                          </div>
                          <div className="course-card__stat-box">
                            <Text type="secondary">Faltas</Text>
                            <Text strong style={{ color: curso.faltas > 0 ? "#cf1322" : undefined }}>{curso.faltas}</Text>
                          </div>
                        </div>
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Aún no hay asistencias ni calificaciones registradas"
                          description={curso.totalClases ? `Este curso tiene ${curso.totalClases} clases programadas. La información aparecerá cuando se registren las primeras asistencias o notas.` : "La información aparecerá cuando se registren las primeras asistencias o notas."}
                        />
                      )}
                    </div>

                    {(() => {
                      const siguiente = obtenerSiguienteClase(curso);
                      const nombreTema = siguiente?.tema?.nombre_curso || "Tema por definir";
                      const nombreCiclo = siguiente?.ciclo?.nombre_ciclo || "Ciclo por definir";
                      const descripcionTema = siguiente?.tema?.descripcion || "Introducción al ciclo";
                      const horarioSiguienteClase = curso.horario || [curso.diasSemana, curso.horaInicio].filter(Boolean).join(" ");

                      return (
                        <div className="course-card__next-block">
                          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                            {siguiente?.completado ? "Curso completado" : "Siguiente clase"}
                          </Text>
                          <Text strong style={{ display: "block", lineHeight: 1.35 }}>
                            {siguiente?.completado ? "Repaso final disponible" : nombreTema}
                          </Text>
                          <Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                            {siguiente?.completado
                              ? `Registraste asistencia en ${siguiente?.vistos}/${siguiente?.total} clases del programa.`
                              : [nombreCiclo, horarioSiguienteClase].filter(Boolean).join(" · ") || "Horario por definir"}
                          </Text>
                          {!siguiente?.completado ? (
                            <Text style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                              {descripcionTema}
                            </Text>
                          ) : null}
                          <Button
                            type="link"
                            style={{ paddingLeft: 0, marginTop: 6, height: "auto" }}
                            onClick={() => irAMaterialesSiguienteClase(curso, siguiente)}
                          >
                            {siguiente?.completado
                              ? "Ver materiales del último tema"
                              : "Ir a lista de materiales de esta clase"}
                          </Button>
                        </div>
                      );
                    })()}
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          <Card
            size="small"
            title="Asistencia"
            style={{ marginTop: 16 }}
          >
            {isMobile ? renderMobileListCards(asistencias, (r: any) => {
              const asistenciaId = String(r?.id || "");
              const claseNumero = claseNumeroAsistenciaCanonicoById.get(asistenciaId) || r?.clase_numero || null;
              const temaRaw = temaSincronizadoAsistenciaById.get(asistenciaId) || r?.tema_visto || r?.registro_clase || "-";
              const tema = limpiarTemaAsistencia(temaRaw, claseNumero);
              const estadoCalendario = estadoCalendarioAsistenciaById.get(String(r?.id || ""));
              const titulo = (
                <Space size={8} wrap>
                  <Text strong style={{ fontSize: 14, color: "#0f172a" }}>{formatDate(r?.fecha)}</Text>
                  {claseNumero ? <Tag color="blue" style={{ borderRadius: 999, marginInlineEnd: 0 }}>Clase {claseNumero}</Tag> : null}
                </Space>
              );

              return {
                key: String(r?.id || Math.random()),
                title: titulo,
                extra: (
                  <Tag
                    color={r?.estado === "presente" ? "green" : "red"}
                    style={{ borderRadius: 999, marginInlineEnd: 0, fontWeight: 700 }}
                  >
                    {String(r?.estado || "-").toUpperCase()}
                  </Tag>
                ),
                rows: [
                  { label: "Tema", value: <Text style={{ color: "#1f2937", fontWeight: 600 }}>{tema}</Text> },
                  { label: "Calendario", value: estadoCalendario ? <Tag color={estadoCalendario.color}>{estadoCalendario.label}</Tag> : undefined },
                ],
              };
            }, "No hay registros de asistencia") : <Table
              dataSource={asistencias}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5 }}
              scroll={{ x: 520 }}
              locale={{ emptyText: "No hay registros de asistencia" }}
              columns={[
                { title: "Fecha", dataIndex: "fecha", render: (f) => formatDate(f) },
                { title: "Clase #", dataIndex: "clase_numero", width: 90, render: (n) => n || "-" },
                {
                  title: "Tema visto",
                  dataIndex: "tema_visto",
                  render: (t, r: any) => {
                    const asistenciaId = String(r?.id || "");
                    const claseNumero = claseNumeroAsistenciaCanonicoById.get(asistenciaId) || r?.clase_numero || null;
                    const temaRaw = temaSincronizadoAsistenciaById.get(asistenciaId) || t || r?.registro_clase || "-";
                    const tema = limpiarTemaAsistencia(temaRaw, claseNumero);
                    const estadoCalendario = estadoCalendarioAsistenciaById.get(asistenciaId);

                    return (
                      <Space direction="vertical" size={2}>
                        <span>{tema}</span>
                        {estadoCalendario ? <Tag color={estadoCalendario.color}>{estadoCalendario.label}</Tag> : null}
                      </Space>
                    );
                  },
                },
                { title: "Estado", dataIndex: "estado", render: (e) => <Tag color={e === "presente" ? "green" : "red"}>{e?.toUpperCase()}</Tag> },
              ]}
            />}
          </Card>

          {calificaciones.length > 0 && (
            <Card
              size="small"
              title={<><TrophyOutlined /> Calificaciones</>}
              style={{ marginTop: 16 }}
            >
              {isMobile ? renderMobileListCards(calificaciones, (r: any) => {
                const nota = Number(r.calificacion ?? r.nota);
                const esEscala5 = nota <= 5;
                const aprobado = esEscala5 ? nota >= 3.0 : nota >= 60;
                const display = Number.isFinite(nota) ? (esEscala5 ? nota.toFixed(1) : `${nota}/100`) : "-";
                const tipo = String(r?.tipo_evaluacion || "otro");
                const observaciones = observacionUtilCalificacion(r);
                const colores: Record<string, string> = {
                  examen: "blue",
                  quiz: "purple",
                  taller: "cyan",
                  participacion: "green",
                  otro: "default",
                };
                const titulo = limpiarConceptoCalificacion(r?.concepto);
                const mostrarTagTipo = tipo !== "quiz";
                const fechaDisplay = r?.fecha_evaluacion ? dayjs(r.fecha_evaluacion).format("DD/MM/YYYY") : "-";

                return {
                  key: String(r?.id || Math.random()),
                  title: <Text strong style={{ fontSize: 14, color: "#0f172a" }}>{titulo}</Text>,
                  extra: mostrarTagTipo
                    ? <Tag color={colores[tipo] || "default"} style={{ borderRadius: 999, marginInlineEnd: 0, fontWeight: 700 }}>{tipo.toUpperCase()}</Tag>
                    : undefined,
                  rows: [
                    {
                      label: "Resultado",
                      value: (
                        <Space size={8} wrap>
                          <Tag
                            color={aprobado ? "success" : "error"}
                            style={{ borderRadius: 999, marginInlineEnd: 0, fontWeight: 700 }}
                          >
                            Nota {display}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                            {fechaDisplay}
                          </Text>
                        </Space>
                      ),
                    },
                    { label: "Feedback", value: observaciones },
                  ],
                };
              }, "No hay calificaciones registradas") : <Table
                dataSource={calificaciones}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 480 }}
                locale={{ emptyText: "No hay calificaciones registradas" }}
                columns={[
                  {
                    title: "Curso",
                    render: (_: any, r: any) => {
                      const mat = matriculas.find((m: any) => String(m.id) === String(r.matricula_id));
                      return construirNombreGrupo(mat?.cursos) || "-";
                    },
                  },
                  {
                    title: "Tipo",
                    dataIndex: "tipo_evaluacion",
                    render: (t: string) => {
                      const colores: Record<string, string> = {
                        examen: "blue",
                        quiz: "purple",
                        taller: "cyan",
                        participacion: "green",
                        otro: "default",
                      };
                      return <Tag color={colores[t] || "default"}>{(t || "").toUpperCase()}</Tag>;
                    },
                  },
                  {
                    title: "Concepto",
                    dataIndex: "concepto",
                    render: (v: string) => v || "-",
                  },
                  {
                    title: "Nota",
                    render: (_: any, r: any) => {
                      const nota = Number(r.calificacion ?? r.nota);
                      if (!Number.isFinite(nota)) return "-";
                      // Escala 0-5 (Colombia) si nota <= 5, escala 0-100 si es mayor
                      const esEscala5 = nota <= 5;
                      const aprobado = esEscala5 ? nota >= 3.0 : nota >= 60;
                      const display = esEscala5 ? nota.toFixed(1) : `${nota}/100`;
                      return (
                        <Text strong style={{ color: aprobado ? "#52c41a" : "#ff4d4f" }}>
                          {display}
                        </Text>
                      );
                    },
                  },
                  {
                    title: "Fecha",
                    dataIndex: "fecha_evaluacion",
                    render: (f: string) => (f ? dayjs(f).format("DD/MM/YYYY") : "-"),
                  },
                  ...(!isMobile
                    ? [
                        {
                          title: "Observaciones",
                          dataIndex: "observaciones",
                          render: (v: string, r: any) => (textoAportaInformacion(v, r?.concepto) ? v : "-"),
                        },
                      ]
                    : []),
                ]}
              />}
            </Card>
          )}
        </>
      );
    }

    if (activeTab === "2") return renderFinanciero();

    if ((activeTab === "3" || activeTab === "5") && academicContentLoading && !academicContentReady) {
      return (
        <Card size="small">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      );
    }

    // ── Bloqueo por mora ───────────────────────────────────────────
    if (enMoraBloqueante && (activeTab === "3" || activeTab === "5")) {
      return (
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            background: "linear-gradient(135deg, #fff1f0 0%, #fff7e6 100%)",
            border: "2px solid #ff4d4f",
            padding: isMobile ? "24px 16px" : "40px 48px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: isMobile ? 48 : 64, lineHeight: 1, marginBottom: 12 }}>🔒</div>
          <div
            style={{
              background: "#ff4d4f",
              color: "#fff",
              fontWeight: 800,
              fontSize: isMobile ? 16 : 20,
              borderRadius: 8,
              padding: "8px 24px",
              display: "inline-block",
              marginBottom: 16,
              letterSpacing: 0.5,
            }}
          >
            ⚠️ ACCESO BLOQUEADO — PAGO PENDIENTE
          </div>
          <div style={{ fontSize: isMobile ? 14 : 16, color: "#333", marginBottom: 8, lineHeight: 1.7 }}>
            Tienes <strong>una o más cuotas vencidas</strong> sin pagar.
            <br />
            Para acceder a los materiales y el pensum del curso debes estar al día con tus pagos.
          </div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
            Consulta la pestaña <strong>💰 Financiero</strong> para ver los detalles.
          </div>
          <Space wrap>
            <Button
              type="primary"
              danger
              size="large"
              onClick={() => setActiveTab("2")}
              style={{ borderRadius: 8, fontWeight: 700 }}
            >
              Ver mis pagos pendientes
            </Button>
            {whatsappAdmisiones && (
              <Button
                size="large"
                icon={<WhatsAppOutlined />}
                style={{
                  background: "#25D366", color: "#fff", border: "none",
                  borderRadius: 8, fontWeight: 700,
                }}
                onClick={() => {
                  const texto = `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Tengo pagos pendientes y necesito regularizar mi situación para acceder al material del curso.`;
                  window.open(`https://wa.me/${whatsappAdmisiones}?text=${encodeURIComponent(texto)}`, "_blank");
                }}
              >
                Contactar Admisiones
              </Button>
            )}
          </Space>
        </div>
      );
    }
    // ──────────────────────────────────────────────────────────────

    if (activeTab === "3") {
      return (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {renderMaterialesKits()}
        </Space>
      );
    }

    if (activeTab === "5") return renderPensum();

    return null;
  };

  const obtenerRutaTemasPrograma = (programaId: string | number | null | undefined) => {
    const ciclos = (pensum || [])
      .filter((p: any) => String(p?.programa_id) === String(programaId))
      .sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
        const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });

    const ruta: Array<{ ciclo: any; tema: any }> = [];
    ciclos.forEach((ciclo: any) => {
      const temasOrdenados = (ciclo?.pensum_cursos || [])
        .slice()
        .sort((a: any, b: any) => {
          const ordenA = Number(a?.orden ?? 0);
          const ordenB = Number(b?.orden ?? 0);
          if (ordenA !== ordenB) return ordenA - ordenB;
          return Number(a?.id || 0) - Number(b?.id || 0);
        });

      temasOrdenados.forEach((tema: any) => {
        ruta.push({ ciclo, tema });
      });
    });

    return ruta;
  };

  const obtenerSiguienteClase = (curso: any) => {
    const ruta = obtenerRutaTemasPrograma(curso?.programaId);
    if (!ruta.length) return null;

    const clasesVistas = new Set(
      (asistencias || [])
        .filter((asistencia: any) => String(asistencia?.matricula_id) === String(curso?.matriculaId))
        .map((asistencia: any) => claseNumeroAsistenciaCanonicoById.get(String(asistencia?.id || "")))
        .filter((numero: any) => Number.isFinite(numero) && Number(numero) > 0)
        .map((numero: any) => Number(numero))
    );

    const siguiente = ruta.find((_item, index) => !clasesVistas.has(index + 1));
    if (siguiente) {
      return {
        ...siguiente,
        completado: false,
        total: ruta.length,
        vistos: clasesVistas.size,
      };
    }

    const ultima = ruta[ruta.length - 1];
    return {
      ...ultima,
      completado: true,
      total: ruta.length,
      vistos: ruta.length,
    };
  };

  const irAMaterialesSiguienteClase = (curso: any, siguienteParam?: any) => {
    const siguiente = siguienteParam || obtenerSiguienteClase(curso);
    if (!siguiente) {
      message.info("Este curso aún no tiene ciclo/tema configurado");
      return;
    }

    const matriculaId = curso?.matriculaId ? String(curso.matriculaId) : null;
    const cicloId = siguiente?.ciclo?.id ? String(siguiente.ciclo.id) : null;
    const temaId = siguiente?.tema?.id ? String(siguiente.tema.id) : null;

    if (!matriculaId || !cicloId || !temaId) {
      message.info("No se pudo abrir la clase objetivo. Intenta de nuevo.");
      return;
    }

    setMatriculaRutaId(matriculaId);
    setCicloRutaId(cicloId);
    setTemaRutaId(temaId);
    setActiveTab("7");
  };

  if (loading && showLoadingUi) {
    return (
      <div style={{ padding: 16, maxWidth: 1080, margin: "0 auto" }}>
        <Card style={{ borderRadius: 14 }}>
          <Skeleton active title={{ width: "48%" }} paragraph={{ rows: 1 }} />
          <div style={{ marginTop: 12 }}>
            <Skeleton.Button active block style={{ height: 44 }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Skeleton active title={false} paragraph={{ rows: 6 }} />
          </div>
        </Card>
        <div style={{ marginTop: 12 }}>
          <Card style={{ borderRadius: 14 }}>
            <Skeleton active title={{ width: "36%" }} paragraph={{ rows: 4 }} />
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  // ── Generar imagen del logro y compartir en redes ──
  const generarImagenLogro = async (): Promise<File | null> => {
    if (!logrocardRef.current) return null;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(logrocardRef.current, {
        backgroundColor: "#1a0533",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 8000,
      } as any);
      return await new Promise<File | null>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          resolve(new File([blob], "logro-crystal.png", { type: "image/png" }));
        }, "image/png");
      });
    } catch (err) {
      console.error("[compartir] Error generando imagen:", err);
      return null;
    }
  };

  const compartirLogro = async (plataforma: "whatsapp" | "facebook" | "instagram") => {
    if (!quizResultado) return;
    const texto = `🏆 ¡Acabo de aprobar con ${quizResultado.calificacion.toFixed(1)}/5.0 (${quizResultado.porcentaje}%)${quizResultado.tituloQuiz ? ` el quiz "${quizResultado.tituloQuiz}"` : ""} en Academia Crystal Diamante! 💪✨ Sigo superando mis metas. ¿Y tú? #AcademiaCrystalDiamante #Logro #Aprendizaje`;

    const imageFile = await generarImagenLogro();

    // 1️⃣ Web Share API con archivo (funciona en móvil Android/iOS)
    if (imageFile && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
      try {
        await navigator.share({ files: [imageFile], text: texto });
        return;
      } catch (_) { /* usuario canceló o error */ }
    }

    // 2️⃣ Fallback: descargar imagen y abrir la red social
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = "logro-crystal.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setTimeout(() => {
        if (plataforma === "whatsapp") {
          message.info("🖼️ Imagen descargada. Envíala por WhatsApp junto con el mensaje 💪");
          window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
        } else if (plataforma === "facebook") {
          message.info("🖼️ Imagen descargada. Súbela a tu publicación de Facebook 📘");
          window.open(`https://www.facebook.com/`, "_blank");
        } else {
          navigator.clipboard.writeText(texto).catch(() => {});
          message.success("🖼️ ¡Imagen descargada y texto copiado! Pégalos en tu historia de Instagram 🎉");
          window.open("https://www.instagram.com/", "_blank");
        }
      }, 600);
    } else {
      // 3️⃣ Sin imagen: solo texto
      if (plataforma === "whatsapp") {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
      } else if (plataforma === "facebook") {
        window.open(`https://www.facebook.com/sharer.php?quote=${encodeURIComponent(texto)}&u=${encodeURIComponent(window.location.origin)}`, "_blank");
      } else {
        navigator.clipboard.writeText(texto).catch(() => {});
        message.success("📋 ¡Texto copiado! Pégalo en tu historia de Instagram 🎉");
        window.open("https://www.instagram.com/", "_blank");
      }
    }
  };

  return (
    <div className="portal-estudiante" style={{ padding: isMobile ? "0" : "20px", maxWidth: "1200px", margin: "0 auto" }}>

      {/* ────── HEADER MODERNO ────── */}
      <div className="portal-header-banner">
        {/* Header Content */}
        <div className="portal-header-content">
          <div>
            <div className="portal-header-title">
              {obtenerSaludoBienvenida(estudiante?.genero)},{" "}
              {estudiante?.nombre_completo
                ? estudiante.nombre_completo.split(" ")[0]
                : "Estudiante"}
            </div>
            <div className="portal-header-subtitle">
              Al llegar hasta aqui seras una Artista en unas 💅
            </div>
          </div>
        </div>
      </div>

      {/* ────── MENÚ DE NAVEGACIÓN ────── */}
      <div className="portal-nav-bar">
        {menuSecciones.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              className={`portal-nav-item ${active ? "portal-nav-item--active" : ""}`}
              onClick={() => setActiveTab(item.key)}
            >
              <span className="portal-nav-icon">{item.icon}</span>
              <span className="portal-nav-label">{item.label}</span>
              {active && <span className="portal-nav-indicator" />}
            </button>
          );
        })}
      </div>

      <div className="portal-section-wrap">
        {renderSeccionActiva()}
      </div>

      {/* ── Funciones de compartir con imagen ── */}

      {/* ── Modal resultado del quiz ── */}
      <Modal
        open={quizResultadoVisible}
        onCancel={() => setQuizResultadoVisible(false)}
        footer={null}
        width={quizResultado?.aprobado ? (isMobile ? "96vw" : 480) : (isMobile ? "94vw" : 560)}
        centered
        title={null}
        closable
        styles={{
          body: { padding: 0, maxHeight: "92vh", overflowY: "auto" },
          content: quizResultado?.aprobado
            ? { background: "linear-gradient(160deg, #1a0533 0%, #2d0a5c 40%, #0d2a6e 100%)", borderRadius: 16, overflow: "hidden" }
            : { borderRadius: 16, overflow: "hidden" },
        }}
      >
        {quizResultado && quizResultado.aprobado ? (
          <QuizApprovedResult
            isMobile={isMobile}
            quizResultado={quizResultado}
            estudianteNombre={estudiante?.nombre_completo}
            logoAcademia={logoAcademia}
            logrocardRef={logrocardRef}
            onShareAction={compartirLogro}
            onCloseAction={() => setQuizResultadoVisible(false)}
          />
        ) : quizResultado && !quizResultado.aprobado ? (
          <QuizFailedResult
            isMobile={isMobile}
            quizResultado={quizResultado}
            umbralNota={UMBRAL_APROBACION_QUIZ_NOTA}
            umbralPorcentaje={UMBRAL_APROBACION_QUIZ_PORCENTAJE}
            onCloseAction={() => setQuizResultadoVisible(false)}
          />
        ) : null}
      </Modal>

      <Modal
        title={quizActivo?.titulo || "Responder quiz"}
        open={quizModalOpen}
        confirmLoading={quizSaving}
        onCancel={resetQuizModalState}
        width={isMobile ? "96vw" : 820}
        styles={{ body: { maxHeight: isMobile ? "70vh" : "75vh", overflowY: "auto" } }}
        footer={(
          <QuizFlowFooter
            totalPreguntas={quizPreguntas?.length || 0}
            quizPreguntaActual={quizPreguntaActual}
            quizSaving={quizSaving}
            quizAnimando={quizAnimando}
            isMobile={isMobile}
            onPreviousAction={() => setQuizPreguntaActual((prev) => Math.max(0, prev - 1))}
            onSubmitAction={enviarQuiz}
          />
        )}
      >
        <QuizQuestionFlow
          quizPreguntas={quizPreguntas}
          quizRespuestas={quizRespuestas}
          quizPreguntaActual={quizPreguntaActual}
          quizAnimando={quizAnimando}
          setQuizRespuestasAction={setQuizRespuestas}
          setQuizPreguntaActualAction={setQuizPreguntaActual}
          setQuizAnimandoAction={setQuizAnimando}
        />
      </Modal>

      <IframeMaterialModal
        iframePreview={iframePreview}
        logoAcademia={logoAcademia}
        iframePromptVisible={iframePromptVisible}
        iframeTrackingSupported={iframeTrackingSupported}
        quizDirectoIframe={quizDirectoIframe}
        whatsappSoporteItems={whatsappSoporteItems}
        iframeEmbedRef={iframeEmbedRef}
        onCancelAction={cerrarIframeAPensum}
        onShowPromptAction={() => setIframePromptVisible(true)}
        onSupportMenuClickAction={(key) => {
          const destino = key === "agente" ? "agente" : "academia";
          abrirWhatsappSoporte(
            destino,
            `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Necesito apoyo con este material del portal.`
          );
        }}
        onGoQuizAction={irQuizDesdeIframe}
        onIframeLoadAction={() => setIframePromptVisible(false)}
      />
      <style jsx global>{`
        /* ──────────────────────────────────────
           HEADER COMPACTO
        ────────────────────────────────────── */
        .portal-header-banner {
          position: relative;
          overflow: hidden;
          background: linear-gradient(160deg, #d81b87 0%, #b81775 100%);
          padding: 10px 14px;
          margin-bottom: 0;
          border-bottom-left-radius: 18px;
          border-bottom-right-radius: 18px;
          box-shadow: 0 6px 16px rgba(216,27,135,0.14);
        }

        .portal-header-content {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .portal-header-title {
          color: #fff;
          font-size: clamp(15px, 4vw, 18px);
          font-weight: 700;
          line-height: 1.2;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 0.2px;
        }

        .portal-header-subtitle {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(255,255,255,0.16);
          border: 1px solid rgba(255,255,255,0.22);
          color: #fff7fb;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          box-shadow: 0 8px 18px rgba(0,0,0,0.08);
          backdrop-filter: blur(8px);
        }

        /* ──────────────────────────────────────
           BARRA DE NAVEGACIÓN
        ────────────────────────────────────── */
        .portal-nav-bar {
          display: flex;
          align-items: center;
          background: #fff;
          border: 1px solid #f0f0f0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.04);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          margin-bottom: 16px;
          border-radius: 16px;
          margin: 10px 12px 16px;
          position: relative;
          z-index: 3;
          padding: 4px;
        }
        .portal-nav-bar::-webkit-scrollbar { display: none; }
        .portal-nav-item {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1;
          min-width: 72px;
          padding: 10px 8px;
          background: none;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          color: #8c8c8c;
          font-size: 11px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .portal-nav-item:hover {
          background: #fdf0f7;
          color: #d81b87;
        }
        .portal-nav-item--active {
          background: #fdf0f7;
          color: #d81b87;
          font-weight: 700;
        }
        .portal-nav-icon {
          font-size: 20px;
          margin-bottom: 2px;
        }
        /* Eliminar el indicador inferior, usamos background */
        .portal-nav-indicator {
          display: none;
        }

        /* ──────────────────────────────────────
           SECCIÓN DE CONTENIDO
        ────────────────────────────────────── */
        .portal-section-wrap {
          padding: 0 12px 24px;
          min-height: 300px;
        }
        .portal-estudiante {
          background: #f7f7f8;
          min-height: 100vh;
        }
        .portal-estudiante,
        .portal-estudiante * {
          box-sizing: border-box;
        }
        .portal-estudiante .ant-row > .ant-col,
        .portal-estudiante .ant-space,
        .portal-estudiante .ant-space-item,
        .portal-estudiante .ant-collapse-header,
        .portal-estudiante .ant-collapse-header-text,
        .portal-estudiante .ant-list-item-meta,
        .portal-estudiante .ant-list-item-meta-content {
          min-width: 0;
        }
        .portal-estudiante .ant-typography,
        .portal-estudiante .ant-alert-message,
        .portal-estudiante .ant-alert-description,
        .portal-estudiante .ant-collapse-header-text,
        .portal-estudiante .ant-table-cell {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .portal-estudiante .ant-btn {
          max-width: 100%;
        }
        .portal-estudiante .ant-btn > span {
          white-space: normal;
          overflow-wrap: anywhere;
          text-align: center;
        }
        .portal-estudiante .ant-statistic-content,
        .portal-estudiante .ant-statistic-title {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .portal-estudiante .portal-mobile-data-card {
          border-radius: 18px;
          border: 1px solid #e6e9f2;
          background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(250,251,255,0.95) 100%);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(4px);
        }
        .portal-estudiante .portal-mobile-data-card .ant-card-head {
          min-height: auto;
          padding: 12px 14px 8px;
          border-bottom: 1px solid #edf0f6;
        }
        .portal-estudiante .portal-mobile-data-card .ant-card-body {
          padding: 12px 14px 14px;
        }
        .portal-estudiante .portal-mobile-data-card .ant-card-head-title {
          font-weight: 700;
          letter-spacing: 0.1px;
          color: #0f172a;
        }
        .portal-estudiante .portal-mobile-data-card .ant-card-head-wrapper {
          align-items: center;
        }
        .portal-estudiante .portal-mobile-data-card__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .portal-estudiante .portal-mobile-rows-grid {
          display: grid;
          gap: 10px;
        }
        .portal-estudiante .portal-mobile-row {
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px solid #eef2f7;
          background: #ffffff;
        }
        .portal-estudiante .portal-mobile-row-label {
          text-transform: uppercase;
          letter-spacing: 0.4px;
          font-weight: 700;
        }
        .portal-estudiante .portal-mobile-row-value {
          color: #1f2937;
        }
        .portal-estudiante .portal-mobile-data-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 12px;
        }
        .portal-estudiante .portal-finance-summary {
          border-radius: 16px;
          border: 1px solid transparent;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .portal-estudiante .portal-finance-summary--pending {
          background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
          border-color: #fdba74;
        }
        .portal-estudiante .portal-finance-summary--alert {
          background: linear-gradient(180deg, #fff1f2 0%, #ffffff 100%);
          border-color: #fda4af;
        }
        .portal-estudiante .portal-finance-summary--paid {
          background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
          border-color: #86efac;
        }
        .portal-estudiante .portal-finance-card {
          border-radius: 18px;
          overflow: hidden;
        }
        .portal-estudiante .portal-finance-card .ant-card-head {
          border-bottom-width: 1px;
        }
        .portal-estudiante .portal-finance-card--pending .ant-card-head {
          background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
          border-bottom-color: #fed7aa;
        }
        .portal-estudiante .portal-finance-card--paid .ant-card-head {
          background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
          border-bottom-color: #bbf7d0;
        }
        .portal-estudiante .portal-finance-card--pending .portal-mobile-data-card {
          border-left: 4px solid #f59e0b;
          background: linear-gradient(180deg, #fffdf8 0%, #ffffff 100%);
        }
        .portal-estudiante .portal-finance-card--paid .portal-mobile-data-card {
          border-left: 4px solid #22c55e;
          background: linear-gradient(180deg, #f8fff9 0%, #ffffff 100%);
        }
        .portal-estudiante .portal-finance-row--pending .ant-table-cell {
          background: #fffaf0;
        }
        .portal-estudiante .portal-finance-row--partial .ant-table-cell {
          background: #fffbeb;
        }
        .portal-estudiante .portal-finance-row--overdue .ant-table-cell {
          background: #fff1f2;
        }
        .portal-estudiante .portal-finance-row--paid .ant-table-cell {
          background: #f6ffed;
        }
        @media (min-width: 576px) {
          .portal-section-wrap {
            padding: 0 4px 24px;
          }
        }

        .portal-estudiante .quiz-question-transition {
          transition: opacity 0.18s ease, transform 0.18s ease;
          opacity: 1;
          transform: translateX(0);
        }
        .portal-estudiante .quiz-question-transition.is-leaving {
          opacity: 0.2;
          transform: translateX(10px);
        }
        .portal-estudiante .quiz-option-card {
          width: 100%;
          display: block;
          border: 1px solid #d9d9d9;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fff;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .portal-estudiante .quiz-option-card:hover {
          border-color: #91caff;
          background: #f5faff;
        }
        .portal-estudiante .quiz-option-card.is-active {
          border-color: #1677ff;
          background: #e6f4ff;
          box-shadow: inset 0 0 0 1px #1677ff22;
        }
        .portal-estudiante .ciclo-bloqueado {
          pointer-events: none;
        }
        .portal-estudiante .tema-bloqueado {
          opacity: 0.45;
          background: #f5f5f5;
          border-radius: 8px;
          padding: 6px 0;
          filter: grayscale(0.6);
        }
        .portal-estudiante .tema-bloqueado .ant-typography {
          color: #b8b8b8 !important;
        }
        .portal-estudiante .tema-bloqueado .ant-btn,
        .portal-estudiante .tema-bloqueado .ant-tag {
          opacity: 0.4;
          pointer-events: none;
        }
        .portal-estudiante .tema-completado {
          background: linear-gradient(to right, #f0fdf4, #ffffff);
          border-radius: 8px;
          border-left: 3px solid #4ade80;
          padding: 6px 0 6px 8px;
        }
        .portal-estudiante .tema-completado .ant-list-item-meta-title .ant-typography {
          color: #15803d;
        }
        .portal-estudiante .tema-activo {
          background: linear-gradient(to right, #fdf4ff, #ffffff);
          border-radius: 8px;
          border-left: 3px solid #d81b87;
          padding: 6px 0 6px 8px;
        }
        .portal-estudiante .tema-card-layout {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .portal-estudiante .tema-card-header {
          display: grid;
          grid-template-columns: 84px minmax(0, 1fr);
          align-items: start;
          gap: 12px;
          width: 100%;
        }
        .portal-estudiante .tema-card-header--compact {
          grid-template-columns: 64px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
        }
        .portal-estudiante .tema-card-header-content {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 2px;
        }
        .portal-estudiante .tema-card-layout--compact .tema-card-header-content {
          gap: 2px;
          padding-top: 0;
        }
        .portal-estudiante .tema-card-body {
          width: 100%;
        }
        .portal-estudiante .tema-card-layout--compact .tema-card-body {
          margin-top: -2px;
        }
        .portal-estudiante .student-menu-btn {
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 64px;
          padding: 6px;
          font-weight: 600;
          border-color: #d9e2f5;
        }
        .portal-estudiante .student-menu-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
        }
        .portal-estudiante .student-menu-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          line-height: 1;
        }
        .portal-estudiante .student-menu-label {
          font-size: 11px;
          line-height: 1.15;
          text-align: center;
          white-space: normal;
        }
        .portal-estudiante .student-menu-btn.is-active {
          box-shadow: 0 4px 12px rgba(24, 144, 255, 0.22);
        }
        .portal-estudiante .course-card {
          border-radius: 18px;
          overflow: hidden;
        }
        .portal-estudiante .course-card .ant-card-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .portal-estudiante .course-card__hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          background: linear-gradient(180deg, #fff7fb 0%, #ffffff 100%);
          border: 1px solid #f3d7e7;
        }
        .portal-estudiante .course-card .ant-progress-bg {
          height: 10px !important;
          border-radius: 999px;
        }
        .portal-estudiante .course-card .ant-progress-inner {
          border-radius: 999px;
          background: #eceff5;
        }
        .portal-estudiante .course-card__stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .portal-estudiante .course-card__stat-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
        }
        .portal-estudiante .course-card__next-block {
          padding: 12px 14px;
          border-radius: 16px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          border: 1px solid #e5e7eb;
        }
        .portal-estudiante .tema-cover-wrap {
          position: relative;
          width: 84px;
          min-width: 84px;
          height: 84px;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
          background: #fff;
        }
        .portal-estudiante .tema-cover-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .portal-estudiante .tema-cover-order {
          position: absolute;
          top: 8px;
          left: 8px;
          min-width: 28px;
          height: 28px;
          padding: 0 8px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
        }
        .portal-estudiante .tema-cover-chip {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.94);
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .portal-estudiante .tema-card-layout--compact .tema-cover-wrap {
          width: 64px;
          min-width: 64px;
          height: 64px;
          border-radius: 14px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
        }
        .portal-estudiante .tema-card-layout--compact .tema-cover-order {
          top: 6px;
          left: 6px;
          min-width: 24px;
          height: 24px;
          font-size: 11px;
          padding: 0 6px;
        }
        .portal-estudiante .tema-card-layout--compact .tema-cover-chip {
          left: 6px;
          right: 6px;
          bottom: 6px;
          padding: 3px 6px;
          font-size: 8px;
        }
        /* ── Pensum: contenedor de material + botones ── */
        .portal-estudiante .tema-material-row {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          border: 1px solid #f0f0f0;
          border-radius: 8px;
          padding: 6px 8px;
          min-width: 0;
        }
        .portal-estudiante .tema-material-row .ant-btn {
          min-width: 0;
          white-space: nowrap;
        }
        /* Tags que no desborden */
        .portal-estudiante .ant-tag {
          white-space: normal;
          word-break: break-word;
          max-width: 100%;
        }
        /* Lista de temas: título sin desborde */
        .portal-estudiante .ant-list-item-meta-title {
          word-break: break-word;
        }
        /* Tabla con scroll horizontal en todos los tamaños */
        .portal-estudiante .ant-table-wrapper {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        /* Collapse ciclo: sin recortar texto */
        .portal-estudiante .ant-collapse-header {
          align-items: center !important;
          padding: 10px 12px !important;
        }

        /* ── Tablets (≤768px) ── */
        @media (max-width: 768px) {
          .portal-estudiante .ant-card-head {
            padding-inline: 14px;
          }
          .portal-estudiante .ant-card-body {
            padding-inline: 14px;
          }
          .portal-estudiante .ant-list-item {
            padding-inline: 0;
          }
          .portal-estudiante .ant-collapse-content-box {
            padding-inline: 8px !important;
          }
        }

        /* ── Móvil (≤576px) ── */
        @media (max-width: 576px) {
          .portal-header-banner {
            padding: 10px 10px;
          }
          .portal-header-content {
            gap: 8px;
          }
          .portal-header-title {
            font-size: 14px;
          }
          .portal-header-subtitle {
            margin-top: 6px;
            font-size: 11px;
            padding: 6px 10px;
            white-space: normal;
          }
          .portal-nav-bar {
            margin: 8px 8px 14px;
            border-radius: 12px;
          }
          .portal-nav-item {
            min-width: 64px;
            padding: 10px 6px 8px;
          }
          .portal-nav-icon {
            font-size: 18px;
          }
          .portal-estudiante .ant-card-head-title {
            white-space: normal;
            font-size: 14px;
          }
          .portal-estudiante .ant-card-head {
            padding-inline: 10px;
            min-height: 40px;
          }
          .portal-estudiante .ant-card-body {
            padding: 10px !important;
          }
          .portal-estudiante .ant-btn {
            height: auto;
            min-height: 34px;
            padding: 6px 10px;
          }
          .portal-estudiante .portal-mobile-data-card .ant-card-head {
            padding: 10px 10px 7px;
          }
          .portal-estudiante .portal-mobile-data-card .ant-card-body {
            padding: 10px;
          }
          .portal-estudiante .portal-mobile-row {
            padding: 8px 9px;
            border-radius: 10px;
          }
          .portal-estudiante .portal-mobile-data-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 8px;
          }
          .portal-estudiante .portal-mobile-data-card__header {
            align-items: stretch;
            flex-direction: column;
          }
          .portal-estudiante .portal-finance-card .ant-card-head {
            padding-inline: 12px;
          }
          .portal-estudiante .course-card .ant-card-body {
            gap: 10px;
          }
          .portal-estudiante .course-card__hero {
            padding: 10px 12px;
            align-items: stretch;
          }
          .portal-estudiante .course-card__stats-grid {
            gap: 8px;
          }
          .portal-estudiante .course-card__stat-box {
            padding: 8px 10px;
          }
          .portal-estudiante .course-card__next-block {
            padding: 10px 12px;
          }
          .portal-estudiante .tema-cover-wrap {
            width: 72px;
            min-width: 72px;
            height: 72px;
            border-radius: 16px;
          }
          .portal-estudiante .tema-card-header {
            grid-template-columns: 72px minmax(0, 1fr);
            gap: 10px;
          }
          .portal-estudiante .tema-card-header--compact {
            grid-template-columns: 60px minmax(0, 1fr);
            gap: 8px;
          }
          .portal-estudiante .tema-card-layout {
            gap: 8px;
          }
          .portal-estudiante .tema-cover-chip {
            font-size: 9px;
          }
          .portal-estudiante .tema-card-layout--compact .tema-cover-wrap {
            width: 60px;
            min-width: 60px;
            height: 60px;
            border-radius: 12px;
          }
          .portal-estudiante .tema-card-layout--compact .tema-cover-chip {
            font-size: 8px;
          }
          .portal-estudiante .ant-table {
            font-size: 12px;
          }
          .portal-estudiante .ant-table-cell {
            white-space: normal;
            padding: 6px 6px !important;
          }
          .portal-estudiante .ant-modal-content {
            padding: 0;
          }
          /* Ciclo avatar más pequeño en móvil */
          .portal-estudiante .ciclo-avatar {
            width: 36px !important;
            height: 36px !important;
            font-size: 18px !important;
            border-radius: 10px !important;
          }
          /* Pensum: fila de material apila en móvil */
          .portal-estudiante .tema-material-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
          }
          .portal-estudiante .tema-material-row > * {
            width: 100%;
            justify-content: flex-start;
          }
          /* Botones de quiz/descarga en móvil: inline flex */
          .portal-estudiante .tema-acciones-row {
            display: flex;
            gap: 8px;
            width: 100%;
          }
          .portal-estudiante .tema-acciones-row .ant-btn {
            flex: 1;
          }
          /* Collapse pensum */
          .portal-estudiante .ant-collapse-header {
            padding: 8px 10px !important;
          }
          .portal-estudiante .ant-collapse-content-box {
            padding: 8px 4px !important;
          }
          /* Modal quiz */
          .portal-estudiante .ant-modal-footer {
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .portal-estudiante .ant-modal-footer .ant-btn {
            width: 100%;
            margin: 0;
          }

          .gamma-iframe-topbar {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 56px;
            background: #fff;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px;
            z-index: 4;
          }
          .gamma-iframe-menu {
            border: 1px solid #e5e7eb;
            background: #fff;
            color: #4b5563;
            min-width: 70px;
            height: 34px;
            border-radius: 10px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            padding: 0 10px;
            font-size: 12px;
            font-weight: 600;
          }
          .gamma-iframe-center-logo {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
          }
          .gamma-iframe-actions {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .gamma-iframe-finish {
            border: 1px solid #f2d2e5;
            background: #fff;
            color: #b81775;
            height: 34px;
            border-radius: 10px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 10px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .gamma-iframe-logo {
            max-width: 116px;
            max-height: 34px;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
          }
          .gamma-iframe-logo-fallback {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid #f2d2e5;
            background: #fff;
            color: #d81b87;
            font-size: 15px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .gamma-iframe-whatsapp {
            border: 1px solid #d9f7e2;
            background: #fff;
            color: #059669;
            height: 34px;
            width: 34px;
            border-radius: 10px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0;
            padding: 0;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
          }
          .gamma-iframe-whatsapp .anticon {
            color: #25d366;
            font-size: 14px;
          }

          .gamma-iframe-quiz-cta {
            position: absolute;
            left: 10px;
            right: 10px;
            bottom: 10px;
            z-index: 6;
            background: rgba(255,255,255,0.98);
            border: 1px solid #f2d2e5;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            padding: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }
          .gamma-iframe-quiz-text {
            color: #374151;
            font-size: 12px;
            line-height: 1.4;
          }
          .gamma-iframe-quiz-btn {
            border: none;
            background: #d81b87;
            color: #fff;
            height: 34px;
            border-radius: 10px;
            padding: 0 12px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            flex-shrink: 0;
          }
          .gamma-iframe-quiz-btn:hover {
            background: #b81775;
          }
          .gamma-iframe-whatsapp:hover,
          .gamma-iframe-menu:hover {
            background: #f9fafb;
            border-color: #d1d5db;
          }
          @media (max-width: 400px) {
            .gamma-iframe-menu {
              min-width: 62px;
              padding: 0 8px;
              font-size: 11px;
            }
            .gamma-iframe-finish {
              display: none;
            }
            .gamma-iframe-quiz-cta {
              flex-direction: column;
              align-items: stretch;
              gap: 8px;
            }
          }
        }

        /* ── Muy pequeño (≤400px) ── */
        @media (max-width: 400px) {
          .portal-estudiante .student-menu-label {
            display: none;
          }
          .portal-estudiante .student-menu-icon {
            font-size: 20px;
          }
          .portal-estudiante .student-menu-btn {
            min-height: 46px;
          }
          .portal-estudiante .ant-card-body {
            padding: 8px 6px !important;
          }
        }
      `}</style>
    </div>
  );
}
