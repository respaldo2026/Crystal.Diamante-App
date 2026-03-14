"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  GiftOutlined,
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
import { TemaMaterialActions } from "@/modules/portal-estudiante/components/TemaMaterialActions";
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
import { getPaymentPlan, normalizeModalidadPago } from "@/types/payment-plans";

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

dayjs.locale("es");

const { Title, Text } = Typography;

export default function PortalEstudiante() {
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
    setPensum(payload.pensum);
    setMateriales(payload.materiales);
    setMaterialesCiclo(payload.materialesCiclo);
    setMaterialesClase(payload.materialesClase);
    setQuizzesClase(payload.quizzesClase);
    setAvancePorCurso(payload.avancePorCurso);
    setCertificados(payload.certificados);
  }, []);

  const handlePortalAuthError = useCallback(() => {
    message.error("No autenticado");
  }, []);

  const handlePortalProfileError = useCallback(() => {
    message.error("Perfil no encontrado. Contacta a la administración.");
  }, []);

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
    loadPortalData();
  }, [loadPortalData]);

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
        courseName: matricula?.cursos?.nombre || "Curso",
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
      if (!p.fecha_vencimiento) return false;
      // vencida = la fecha de cobro ya pasó
      return hoy.isAfter(dayjs(p.fecha_vencimiento));
    });
  }, [pagosConPendientes]);

  const renderFinanciero = () => {
    const pendientes = pagosConPendientes
      .filter(p => p.estado === 'pendiente')
      .sort((a, b) => {
        const fechaA = a?.fecha_vencimiento ? dayjs(a.fecha_vencimiento) : null;
        const fechaB = b?.fecha_vencimiento ? dayjs(b.fecha_vencimiento) : null;
        if (fechaA && fechaB) return fechaA.valueOf() - fechaB.valueOf();
        if (fechaA) return -1;
        if (fechaB) return 1;
        return (Number(a?.numero_cuota || 0) - Number(b?.numero_cuota || 0));
      });
    const realizados = pagos.filter(p => p.estado === 'pagado');

    // Función auxiliar para determinar si está vencido (estrictamente anterior a hoy)
    const isVencido = (fecha: string) => {
      return fecha && dayjs().startOf('day').isAfter(dayjs(fecha));
    };

    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<><ClockCircleOutlined /> Próximos Pagos</>} className="shadow-sm">
            {pendientes.length > 0 ? (
              <Table 
                dataSource={pendientes} 
                rowKey="id" 
                pagination={false} 
                size="small"
                scroll={{ x: 560 }}
                columns={[
                  { 
                    title: 'Concepto', 
                    dataIndex: 'periodo_pagado', 
                    render: (t, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{t || `Cuota ${r.numero_cuota}`}</span>;
                    } 
                  },
                  {
                    title: 'Plan',
                    render: (_, r: any) => {
                      const matricula = matriculas.find((m: any) => String(m.id) === String(r.matricula_id));
                      const plan = getPaymentPlan(matricula?.modalidad_pago);
                      return <Tag>{plan.label}</Tag>;
                    },
                  },
                  { 
                    title: 'Vence', 
                    dataIndex: 'fecha_vencimiento', 
                    render: (d, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{d ? dayjs(d).format("DD/MM/YYYY") : '-'}</span>;
                    }
                  },
                  { 
                    title: 'Monto', 
                    dataIndex: 'monto', 
                    render: (v, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{`$ ${Number(v).toLocaleString()}`}</span>;
                    }
                  },
                  { 
                    title: 'Estado', 
                    render: (_, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      if (vencido) return <Tag color="red">VENCIDO</Tag>;
                      return <Tag style={{ color: '#8c8c8c', borderColor: '#d9d9d9', fontSize: '11px' }}>PENDIENTE</Tag>;
                    } 
                  }
                ]}
              />
            ) : (
              <Alert message="¡Estás al día!" description="No tienes pagos pendientes." type="success" showIcon />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><CheckCircleOutlined /> Historial de Pagos</>} className="shadow-sm">
             <Table 
                dataSource={realizados} 
                rowKey="id" 
                pagination={{ pageSize: 5 }} 
                size="small"
               scroll={{ x: 520 }}
                columns={[
                  { title: 'Concepto', dataIndex: 'periodo_pagado', render: (t, r: any) => t || `Cuota ${r.numero_cuota}` },
                  {
                    title: 'Plan',
                    render: (_, r: any) => {
                      const matricula = matriculas.find((m: any) => String(m.id) === String(r.matricula_id));
                      const plan = getPaymentPlan(matricula?.modalidad_pago);
                      return <Tag>{plan.label}</Tag>;
                    },
                  },
                  { title: 'Fecha', dataIndex: 'fecha_pago', render: (d) => d ? dayjs(d).format("DD/MM/YYYY") : '-' },
                  { title: 'Monto', dataIndex: 'monto', render: (v) => `$ ${Number(v).toLocaleString()}` },
                  { title: 'Estado', render: () => <Tag color="green">PAGADO</Tag> }
                ]}
              />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderRutaAcademica = (vista: "plan" | "kits" | "ciclo") => {
    if (!matriculas.length) return <Empty description="No tienes cursos activos" />;

    const tituloPrincipal = vista === "plan"
      ? "Contenido del Curso - Pensum"
      : vista === "ciclo"
        ? "Materiales generales por ciclo"
        : "Materiales necesarios por clase";
    const colorDiferenciadorCiclo = vista === "plan" ? "#2563eb" : "#16a34a";
    const colorNumeroTema = vista === "plan" ? "#2563eb" : "#16a34a";

    const StepCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
      <Card title={title} size={isMobile ? "small" : "default"}>
        {children}
      </Card>
    );

    if (!matriculaSeleccionada) {
      return (
        <StepCard title={tituloPrincipal}>
          <Text strong>Selecciona un curso</Text>
          <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
            {matriculasActivas.map((mat: any) => (
              <Col xs={24} sm={12} lg={8} key={mat.id}>
                <Button
                  block
                  onClick={() => {
                    setMatriculaRutaId(String(mat.id));
                    setCicloRutaId(null);
                    setTemaRutaId(null);
                  }}
                >
                  {mat?.cursos?.nombre || `Curso ${mat.id}`}
                </Button>
              </Col>
            ))}
          </Row>
        </StepCard>
      );
    }

    const cicloActivo =
      cicloRutaId && ciclosPrograma.some((c: any) => String(c.id) === String(cicloRutaId))
        ? String(cicloRutaId)
        : String(ciclosPrograma[0]?.id || "");

    if (!ciclosPrograma.length) {
      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button type="text" size="small" onClick={() => setMatriculaRutaId(null)}>← Volver a cursos</Button>
            <Empty description="Este curso aún no tiene módulos/ciclos configurados" />
          </Space>
        </StepCard>
      );
    }

    // ── Cascade: calcular el primer ciclo incompleto (todos los posteriores quedan bloqueados) ──
    const primerCicloIncompletoIndex = getPrimerCicloIncompletoIndex(ciclosPrograma, obtenerTemasCiclo);

    return (
      <Card
        title={tituloPrincipal}
        size={isMobile ? "small" : "default"}
      >
        <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 12 }}>
          <Text strong>Curso activo</Text>
          <Row gutter={[10, 10]}>
            {matriculasActivas.map((mat: any) => {
              const activo = String(mat?.id) === String(matriculaSeleccionada?.id);
              return (
                <Col xs={24} sm={12} lg={8} key={mat.id}>
                  <Button
                    block
                    type={activo ? "primary" : "default"}
                    onClick={() => {
                      setMatriculaRutaId(String(mat.id));
                      setCicloRutaId(null);
                      setTemaRutaId(null);
                    }}
                  >
                    {mat?.cursos?.nombre || `Curso ${mat.id}`}
                  </Button>
                </Col>
              );
            })}
          </Row>
        </Space>

        <Collapse
          accordion
          expandIconPosition="end"
          activeKey={cicloActivo || undefined}
          onChange={(key) => {
            const value = Array.isArray(key) ? key[0] : key;
            setCicloRutaId(value ? String(value) : null);
          }}
          items={ciclosPrograma.map((ciclo: any, index: number) => {
            const cicloId = String(ciclo?.id || `ciclo-${index}`);
            const cicloNumero = ciclo?.numero_ciclo ?? ciclo?.orden ?? index + 1;
            const cicloNombre = ciclo?.nombre_ciclo || ciclo?.titulo || `Ciclo ${cicloNumero}`;
            const temasCiclo = obtenerTemasCiclo(ciclo);
            const materialesGenerales = obtenerMaterialesCiclo(cicloId);

            // Estado en cascada de este ciclo: bloqueado si hay un ciclo previo incompleto
            const cicloBloqueado = index > primerCicloIncompletoIndex;
            // Índice de la primera clase no completada (= clase "actual"); todas las posteriores bloqueadas
            const primerIndexActual = cicloBloqueado ? 0 : getPrimerTemaPendienteIndex(temasCiclo);

            return {
              key: cicloId,
              collapsible: cicloBloqueado ? "disabled" : undefined,
              className: cicloBloqueado ? "ciclo-bloqueado" : "",
              label: (
                <Space size={16} align="center" style={{ opacity: cicloBloqueado ? 0.4 : 1, filter: cicloBloqueado ? "grayscale(0.7)" : undefined }}>
                  <div
                    className="ciclo-avatar"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      background: cicloBloqueado ? "#d9d9d9" : colorDiferenciadorCiclo,
                      color: cicloBloqueado ? "#a0a0a0" : "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      fontWeight: 700,
                    }}
                  >
                    {cicloNumero}
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 16, color: cicloBloqueado ? "#bfbfbf" : undefined }}>{cicloNombre}</Text>
                    {vista === "kits" ? (
                      <div><Text type="secondary">Materiales por tema</Text></div>
                    ) : ciclo?.descripcion ? (
                      <div><Text type="secondary">{ciclo.descripcion}</Text></div>
                    ) : null}
                  </div>
                </Space>
              ),
              children: vista === "ciclo" ? (
                materialesGenerales.length ? (
                  <Table
                    dataSource={materialesGenerales}
                    rowKey={(record) => String(record?.id || record?.nombre)}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: "Producto",
                        dataIndex: "nombre",
                        render: (value) => <Text strong>{value}</Text>,
                      },
                      {
                        title: "Cantidad",
                        dataIndex: "cantidad",
                        render: (value) => value || "Cantidad por definir",
                      },
                      {
                        title: "Kit",
                        dataIndex: "incluido_kit",
                        align: "center",
                        render: (value) => (value ? <GiftOutlined style={{ color: "#d81b87" }} /> : null),
                      },
                    ]}
                  />
                ) : (
                  <Text type="secondary">No hay materiales generales registrados para este ciclo.</Text>
                )
              ) : temasCiclo.length ? (
                <List
                  dataSource={temasCiclo}
                  renderItem={(tema: any, temaIndex: number) => {
                    const temaId = String(tema?.id || `tema-${temaIndex}`);
                    const recursosTema = obtenerRecursosTema(tema, cicloId);
                    const presentacionesTema = deduplicarLista(
                      recursosTema.filter((recurso: any) => isIframeMaterial(recurso)),
                      (recurso: any) =>
                        String(
                          `${String(recurso?.pensum_id || "")}-${String(recurso?.pensum_curso_id || "")}-${extractIframeSrc(recurso?.url_archivo) || String(recurso?.id || recurso?.titulo || "")}`
                        ).toLowerCase()
                    )
                      .map((recurso: any, index: number) => ({
                        id: String(recurso?.id || `gamma-${index}`),
                        titulo: getMaterialCanonicalTitle(recurso, tema?.nombre_curso) || tema?.nombre_curso || "Material",
                        material: recurso,
                      }));
                    const insumosTema = obtenerInsumosTema(tema, cicloId);
                    // Bloqueo en cascada:
                    // - vista "plan": bloqueado por módulo O por clase (quiz pendiente)
                    // - vistas de materiales/kits: solo por módulo, nunca por clase
                    const temaBloqueado = vista === "plan"
                      ? (cicloBloqueado || temaIndex > primerIndexActual)
                      : cicloBloqueado;
                    const quizTema = getQuizByTemaId(temaId);
                    const notaQuizTema = getNotaByTemaId(temaId);
                    const notaActividadTema = actividadPorTemaMatricula.get(`${matriculaSeleccionada?.id || ""}-${temaId}`) ?? null;
                    const temaCompletado = isTemaCompletadoByTemaId(temaId);
                    const colorAvatarTema = temaBloqueado ? "#bfbfbf" : temaCompletado ? "#16a34a" : colorNumeroTema;
                    const insumosMarcados = insumosTema.filter((insumo: any) => {
                      const key = buildChecklistKey(
                        String(matriculaSeleccionada.id),
                        temaId,
                        String(insumo.id || normalizarTexto(insumo.nombre_material))
                      );
                      return isChecklistItemChecked(key);
                    }).length;
                    const recursoPdfTema = obtenerPdfRelacionado({ titulo: tema?.nombre_curso }, recursosTema);
                    const recursoPrincipalTema = recursosTema.find((recurso: any) => !isPdfMaterial(recurso)) || recursoPdfTema || recursosTema[0] || null;
                    const tituloRecursoPrincipal = recursoPrincipalTema
                      ? getMaterialCanonicalTitle(recursoPrincipalTema, tema?.nombre_curso) || tema?.nombre_curso || "Tema"
                      : tema?.nombre_curso || "Tema";

                    return (
                      <List.Item
                        key={temaId}
                        className={temaBloqueado ? "tema-bloqueado" : temaCompletado ? "tema-completado" : "tema-activo"}
                      >
                        <List.Item.Meta
                          avatar={<span style={{ fontSize: 20, fontWeight: 700, color: colorAvatarTema }}>{tema.orden || temaIndex + 1}</span>}
                          title={<Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>}
                          description={
                            <Space direction="vertical" size={4}>
                              {tema.descripcion ? (
                                <div>
                                  <Text type="secondary">{tema.descripcion}</Text>
                                </div>
                              ) : null}

                              {temaBloqueado ? null : vista === "plan" ? (
                                <TemaMaterialActions
                                  temaId={temaId}
                                  temaNombre={tema?.nombre_curso || "Tema"}
                                  recursoPrincipalTema={recursoPrincipalTema}
                                  tituloRecursoPrincipal={tituloRecursoPrincipal}
                                  presentacionesTema={presentacionesTema}
                                  quizTema={quizTema}
                                  notaQuizTema={notaQuizTema}
                                  notaActividadTema={notaActividadTema}
                                  materialIcon={recursoPrincipalTema ? getMaterialIcon(recursoPrincipalTema) : <FilePdfOutlined />}
                                  onWarnAction={(warnMessage) => message.warning(warnMessage)}
                                  onOpenMaterialAction={abrirMaterialDidactico}
                                  onOpenQuizAction={abrirQuiz}
                                />
                              ) : insumosTema.length ? (
                                <Collapse
                                  ghost
                                  size="small"
                                  style={{ marginTop: 4 }}
                                  items={[{
                                    key: temaId,
                                    label: (
                                      <Space size={8}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          {`${insumosTema.length} material${insumosTema.length !== 1 ? "es" : ""}`}
                                        </Text>
                                        {insumosMarcados > 0 && (
                                          <Tag color="green" style={{ fontSize: 11, padding: "0 5px" }}>
                                            {`${insumosMarcados}/${insumosTema.length} listos`}
                                          </Tag>
                                        )}
                                      </Space>
                                    ),
                                    children: (
                                      <Space direction="vertical" size={4} style={{ width: "100%", paddingLeft: 4 }}>
                                        {insumosTema.map((insumo: any, itemIndex: number) => {
                                          const key = buildChecklistKey(
                                            String(matriculaSeleccionada.id),
                                            temaId,
                                            String(insumo.id || normalizarTexto(insumo.nombre_material))
                                          );
                                          const nombreInsumo = insumo.materiales_ciclo?.nombre || insumo.nombre_material;
                                          const cantidadInsumo = insumo.materiales_ciclo?.cantidad || insumo.cantidad;
                                          return (
                                            <Space key={`${temaId}-insumo-${itemIndex}`} size={6} wrap>
                                              {insumo.obligatorio ? (
                                                <CheckCircleOutlined style={{ color: "#16a34a" }} />
                                              ) : (
                                                <ClockCircleOutlined style={{ color: "#f59e0b" }} />
                                              )}
                                              <Checkbox
                                                checked={isChecklistItemChecked(key)}
                                                onChange={(event) => {
                                                  setChecklistItemChecked(key, event.target.checked);
                                                  setTemaRutaId(temaId);
                                                  setCicloRutaId(cicloId);
                                                }}
                                              >
                                                <Space size={4}>
                                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {nombreInsumo}
                                                    {cantidadInsumo ? ` (${cantidadInsumo}${insumo.unidad ? ` ${insumo.unidad}` : ""})` : ""}
                                                  </Text>
                                                  {(insumo.materiales_ciclo?.incluido_kit || insumo.incluido_kit) && (
                                                    <GiftOutlined style={{ color: "#d81b87", fontSize: 12 }} />
                                                  )}
                                                </Space>
                                              </Checkbox>
                                            </Space>
                                          );
                                        })}
                                      </Space>
                                    ),
                                  }]}
                                />
                              ) : (
                                <Text type="secondary" style={{ fontSize: 12 }}>Sin materiales registrados</Text>
                              )}
                              {vista === "kits" && insumosTema.length > 0 ? null : null}
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              ) : (
                <Empty description="No hay temas registrados en este ciclo." />
              ),
            };
          })}
        />
      </Card>
    );
  };

  const renderPensum = () => (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {renderRutaAcademica("plan")}

      <Card size="small" title="Certificados">
        <Table
          dataSource={certificados}
          rowKey="id"
          size="small"
          scroll={{ x: 520 }}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: "No hay certificados disponibles" }}
          columns={[
            { title: "Curso", render: (_, r: any) => r.cursos?.nombre },
            { title: "Nota Final", dataIndex: "nota_final" },
            { title: "Acción", render: (_, r) => <Button icon={<DownloadOutlined />} onClick={() => descargarCertificado(r)}>Descargar</Button> },
          ]}
        />
      </Card>
    </Space>
  );

  const renderMaterialesKits = () => renderRutaAcademica("kits");

  const renderMaterialesCiclo = () => renderRutaAcademica("ciclo");

  const menuSecciones = [
    { key: "1", label: "Mis Cursos", icon: <BookOutlined /> },
    { key: "2", label: enMora ? "💰 Financiero ⚠️" : "Financiero", icon: <DollarCircleOutlined /> },
    { key: "3", label: enMora ? "🔒 Materiales" : (isMobile ? "Materiales" : "Lista de materiales"), icon: <FileOutlined /> },
    { key: "5", label: enMora ? "🔒 Pensum" : "Pensum", icon: <BookOutlined /> },
  ];

  const renderSeccionActiva = () => {
    if (activeTab === "1") {
      return (
        <>
          {avancePorCurso.length === 0 ? (
            <Empty description="No estás inscrito en ningún curso activo" />
          ) : (
            <Row gutter={16}>
              {avancePorCurso.map((curso: any, idx: number) => (
                <Col xs={24} sm={12} lg={8} key={idx}>
                  <Card className="course-card" title={curso.curso}>
                    <Row gutter={12}>
                      <Col xs={12}>
                        <div style={{ textAlign: "center" }}>
                          <Progress
                            type="circle"
                            percent={Math.max(0, Math.min(100, Number(curso.nota || 0)))}
                            width={isMobile ? 94 : 108}
                            format={() => `${Number(curso.nota || 0)}/100`}
                          />
                          <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                            Nota actual
                          </Text>
                        </div>
                      </Col>
                      <Col xs={12}>
                        <div style={{ textAlign: "center" }}>
                          <Progress
                            type="dashboard"
                            percent={Math.max(0, Math.min(100, Math.round((Number(curso.nota || 0) / 70) * 100)))}
                            width={isMobile ? 94 : 108}
                            format={(percent) => `${percent}%`}
                            status={Number(curso.nota || 0) >= 70 ? "success" : "active"}
                          />
                          <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                            Meta aprobatoria
                          </Text>
                        </div>
                      </Col>
                    </Row>
                    <div style={{ marginTop: 10, textAlign: 'center' }}>
                      <Tag color={curso.nota >= 70 ? "green" : "orange"}>{curso.estado?.toUpperCase()}</Tag>
                    </div>

                    {(() => {
                      const siguiente = obtenerSiguienteClase(curso);
                      const nombreTema = siguiente?.tema?.nombre_curso || "Tema por definir";
                      const nombreCiclo = siguiente?.ciclo?.nombre_ciclo || "Ciclo por definir";
                      const descripcionTema = siguiente?.tema?.descripcion || "Introducción al ciclo";

                      return (
                        <div style={{ marginTop: 12 }}>
                          <Text style={{ fontSize: 12, display: "block" }}>
                            {siguiente?.completado ? (
                              <>
                                <strong>Plan completado:</strong> ya registraste asistencia en {siguiente?.vistos}/{siguiente?.total} clases del programa. Puedes repasar materiales del último tema.
                              </>
                            ) : (
                              <>
                                <strong>Siguiente Clase:</strong> {nombreTema} del {nombreCiclo}: {descripcionTema}. Verifica la lista de materiales para esta clase.
                              </>
                            )}
                          </Text>
                          <Button
                            type="link"
                            style={{ paddingLeft: 0, marginTop: 4, height: "auto" }}
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
            <Table
              dataSource={asistencias}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5 }}
              scroll={{ x: 520 }}
              locale={{ emptyText: "No hay registros de asistencia" }}
              columns={[
                { title: "Fecha", dataIndex: "fecha", render: (f) => formatDate(f) },
                { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                { title: "Clase #", dataIndex: "clase_numero", width: 90, render: (n) => n || "-" },
                {
                  title: "Tema visto",
                  dataIndex: "tema_visto",
                  render: (t, r: any) => {
                    const tema = t || "-";
                    const registro = String(r?.registro_clase || "").trim();

                    if (!isMobile) {
                      return tema;
                    }

                    if (!registro || registro === tema) {
                      return tema;
                    }

                    return (
                      <Space direction="vertical" size={2}>
                        <span>{tema}</span>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {registro}
                        </Text>
                      </Space>
                    );
                  },
                },
                ...(!isMobile
                  ? [
                      {
                        title: "Registro de clase",
                        dataIndex: "registro_clase",
                        width: 260,
                        render: (v: string) => v || "-",
                      },
                    ]
                  : []),
                { title: "Estado", dataIndex: "estado", render: (e) => <Tag color={e === "presente" ? "green" : "red"}>{e?.toUpperCase()}</Tag> },
              ]}
            />
          </Card>
        </>
      );
    }

    if (activeTab === "2") return renderFinanciero();

    // ── Bloqueo por mora ───────────────────────────────────────────
    if (enMora && (activeTab === "3" || activeTab === "5")) {
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

    const temasVistos = new Set(
      (asistencias || [])
        .filter((asistencia: any) => String(asistencia?.matricula_id) === String(curso?.matriculaId))
        .map((asistencia: any) => asistencia?.tema_id)
        .filter(Boolean)
        .map((id: any) => String(id))
    );

    const siguiente = ruta.find((item) => !temasVistos.has(String(item.tema?.id)));
    if (siguiente) {
      return {
        ...siguiente,
        completado: false,
        total: ruta.length,
        vistos: temasVistos.size,
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
          <div className="portal-header-title">
            {obtenerSaludoBienvenida(estudiante?.genero)},{" "}
            {estudiante?.nombre_completo
              ? estudiante.nombre_completo.split(" ")[0]
              : "Estudiante"}
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
        .portal-estudiante .course-card .ant-progress {
          filter: drop-shadow(0 8px 16px rgba(15, 23, 42, 0.12));
        }
        .portal-estudiante .course-card .ant-progress-inner {
          background: radial-gradient(circle at 30% 30%, #ffffff 0%, #f3f6fb 45%, #e6ebf3 100%);
        }
        .portal-estudiante .course-card .ant-progress-circle .ant-progress-text,
        .portal-estudiante .course-card .ant-progress-dashboard .ant-progress-text {
          color: #1f2937;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .portal-estudiante .course-card .ant-progress-circle-path {
          stroke: #d81b87;
          stroke-linecap: round;
        }
        .portal-estudiante .course-card .ant-progress-dashboard-path {
          stroke: #0ea5e9;
          stroke-linecap: round;
        }
        .portal-estudiante .course-card .ant-progress-circle-trail,
        .portal-estudiante .course-card .ant-progress-dashboard-trail {
          stroke: #e3e8f1;
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
          .portal-estudiante .course-card .ant-card-body {
            display: flex;
            flex-direction: column;
            align-items: center;
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
