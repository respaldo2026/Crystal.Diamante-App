"use client";

import React, { useEffect, useRef, useState } from "react";
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
  Grid,
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
  StarFilled,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { formatDate } from "@utils/date";
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesCicloPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";

dayjs.locale("es");

const { Title, Text } = Typography;
const UMBRAL_APROBACION_QUIZ_PORCENTAJE = 76; // 3.8/5
const UMBRAL_APROBACION_QUIZ_NOTA = 3.8; // nota mínima para aprobar y desbloquear siguiente clase

const quizAprobado = (calificacion: number | null | undefined) =>
  Number(calificacion || 0) >= UMBRAL_APROBACION_QUIZ_NOTA;

export default function PortalEstudiante() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeTab, setActiveTab] = useState("1");
  const [loading, setLoading] = useState(true);
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
  const [quizPreguntas, setQuizPreguntas] = useState<any[]>([]);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizActivo, setQuizActivo] = useState<any | null>(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizRespuestas, setQuizRespuestas] = useState<Record<string, string>>({});
  const [quizPreguntaActual, setQuizPreguntaActual] = useState(0);
  const [quizAnimando, setQuizAnimando] = useState(false);
  const [quizResultado, setQuizResultado] = useState<{
    calificacion: number;
    porcentaje: number;
    aprobado: boolean;
    respuestasErradas: any[];
    totalPreguntas: number;
    correctas: number;
    tituloQuiz?: string;
  } | null>(null);
  const [quizResultadoVisible, setQuizResultadoVisible] = useState(false);
  const logrocardRef = useRef<HTMLDivElement>(null);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAdmisiones, setWhatsappAdmisiones] = useState<string | null>(null);
  const [logoAcademia, setLogoAcademia] = useState<string | null>(null);
  const [matriculaRutaId, setMatriculaRutaId] = useState<string | null>(null);
  const [cicloRutaId, setCicloRutaId] = useState<string | null>(null);
  const [temaRutaId, setTemaRutaId] = useState<string | null>(null);
  const [checklistInsumos, setChecklistInsumos] = useState<Record<string, boolean>>({});
  const [iframePreview, setIframePreview] = useState<{ open: boolean; title: string; src: string }>({
    open: false,
    title: "",
    src: "",
  });
  const isFetchingRef = useRef(false);
  const hasFetchedOnceRef = useRef(false);

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

  const normalizarTexto = (valor?: string | null) =>
    String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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

  const extractClassNumber = (value?: string | null): number | null => {
    const text = String(value || "");
    const match = text.match(/clase\s*#?\s*(\d{1,3})/i);
    if (!match?.[1]) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizarTemaComparacion = (valor?: string | null) =>
    normalizarTexto(valor).replace(/^\d+\s*/, "").trim();

  const limpiarTituloMaterial = (titulo?: string | null) => {
    const raw = String(titulo || "").trim();
    if (!raw) return "";

    const sinPrefijoTema = raw.replace(/^\s*tema\s*[:\-]\s*/i, "").trim();
    return sinPrefijoTema || raw;
  };

  const getMaterialCanonicalTitle = (material: any, temaReferencia?: string | null) => {
    const parsed = parseTemaTituloMaterial(material?.titulo);
    const tituloLimpio = limpiarTituloMaterial(parsed?.tituloLimpio || material?.titulo || "");

    const temaRefNorm = normalizarTemaComparacion(temaReferencia || parsed?.tema || "");
    const tituloNorm = normalizarTemaComparacion(tituloLimpio);

    if (temaRefNorm && tituloNorm === temaRefNorm) {
      return temaReferencia || parsed?.tema || tituloLimpio;
    }

    return tituloLimpio;
  };

  const getMaterialCanonicalKey = (material: any, temaReferencia?: string | null) => {
    const parsed = parseTemaTituloMaterial(material?.titulo);
    const temaKey = normalizarTemaComparacion(parsed?.tema || temaReferencia || "");
    const tituloKey = normalizarTexto(getMaterialCanonicalTitle(material, temaReferencia));
    const tipoKey = normalizarTexto(material?.tipo_material || "");
    return String(`${material?.programa_id || ''}-${material?.pensum_id || ''}-${temaKey}-${tituloKey}-${tipoKey}`);
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

  const getIndicadorVisualPreguntaQuiz = (pregunta?: string | null) => {
    const texto = normalizarTexto(pregunta);

    const reglas = [
      {
        regex: /(hepatitis|vih|vph|virus|bacteria|hongo|microorganismo|infeccion|onicomicosis|pseudomonas)/,
        emoji: "🦠",
        etiqueta: "Riesgo biológico",
        color: "red",
      },
      {
        regex: /(autoclave|estufa|esteriliz|desinfeccion|detergente|glutaraldehido|amonio|poe)/,
        emoji: "🧪",
        etiqueta: "Esterilización",
        color: "purple",
      },
      {
        regex: /(anatomia|mano|una|uña|falange|tendon|hiponiquio|lecho|matriz|placa ungueal)/,
        emoji: "🖐️",
        etiqueta: "Anatomía ungueal",
        color: "blue",
      },
      {
        regex: /(residuo|bolsa roja|bolsa negra|guardian|cortopunzante|desechar|descartar)/,
        emoji: "♻️",
        etiqueta: "Gestión de residuos",
        color: "green",
      },
      {
        regex: /(accidente biologico|sangre|riesgo|protocolo|supuracion|enrojecimiento|dolor)/,
        emoji: "⚠️",
        etiqueta: "Protocolo de seguridad",
        color: "orange",
      },
    ];

    const regla = reglas.find((item) => item.regex.test(texto));
    return regla || {
      emoji: "📘",
      etiqueta: "Bioseguridad",
      color: "geekblue",
    };
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

  const abrirMaterialDidactico = (material: any, titulo: string) => {
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
      });
      return;
    }

    window.open(src, "_blank", "noopener,noreferrer");
  };

  const descargarMaterialDidactico = (material: any, titulo: string, recursosTema: any[] = []) => {
    const materialDescarga = isPdfMaterial(material) ? material : obtenerPdfRelacionado(material, recursosTema);

    if (!materialDescarga && isIframeMaterial(material)) {
      message.warning("Este recurso usa Gamma y no tiene versión PDF asociada para descarga.");
      return;
    }

    const objetivoDescarga = materialDescarga || material;
    const src = extractIframeSrc(objetivoDescarga?.url_archivo);
    if (!src) {
      message.warning("Este material no tiene un enlace válido para descargar.");
      return;
    }

    if (isIframeMaterial(objetivoDescarga)) {
      message.info("Este material es interactivo. Se abrirá en una nueva pestaña para descarga/exportación desde origen.");
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }

    const nombreArchivo = String(objetivoDescarga?.nombre_archivo || "").trim();
    const nombreBase = String(titulo || "material-didactico").trim() || "material-didactico";
    const downloadName = nombreArchivo.toLowerCase().endsWith(".pdf")
      ? nombreArchivo
      : `${nombreBase}.pdf`;

    const enlace = document.createElement("a");
    enlace.href = src;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
    enlace.download = downloadName;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
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

  const normalizarTelefonoWhatsapp = (valor?: string | null): string | null => {
    if (!valor) return null;

    const texto = String(valor).trim();
    if (!texto) return null;

    const matchWa = texto.match(/wa\.me\/(\d+)/i);
    const base = matchWa?.[1] || texto;
    let digitos = base.replace(/\D/g, "");

    if (!digitos) return null;

    if (digitos.length === 10) {
      digitos = `57${digitos}`;
    }

    return digitos;
  };

  const abrirWhatsapp = (telefono: string | null, mensajeBase: string) => {
    if (!telefono) {
      message.warning("No hay número de WhatsApp configurado");
      return;
    }

    const enlace = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeBase)}`;
    window.open(enlace, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (hasFetchedOnceRef.current || isFetchingRef.current) return;
    cargarDatos();
  }, []);

  useEffect(() => {
    if (!estudiante?.id) return;
    try {
      const key = `portal-checklist-insumos:${estudiante.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setChecklistInsumos(parsed);
        }
      }
    } catch (error) {
      logger.error("No se pudo cargar checklist de insumos", error);
    }
  }, [estudiante?.id]);

  useEffect(() => {
    if (!estudiante?.id) return;
    try {
      const key = `portal-checklist-insumos:${estudiante.id}`;
      localStorage.setItem(key, JSON.stringify(checklistInsumos));
    } catch (error) {
      logger.error("No se pudo guardar checklist de insumos", error);
    }
  }, [checklistInsumos, estudiante?.id]);

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

  const cargarDatos = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!hasFetchedOnceRef.current) {
        setLoading(true);
      }

      const { data: { user }, error: authError } = await supabaseBrowserClient.auth.getUser();
      if (authError || !user) {
        message.error("No autenticado");
        return;
      }

      const { data: perfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (errPerfil || !perfil) {
        message.error("Perfil no encontrado. Contacta a la administración.");
        return;
      }

      setEstudiante(perfil);

      const { data: config } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const numeroAgente = normalizarTelefonoWhatsapp((config as any)?.whatsapp_agente || (config as any)?.whatsapp || null);
      const numeroAdmisiones = normalizarTelefonoWhatsapp((config as any)?.whatsapp_admisiones || (config as any)?.telefono || (config as any)?.whatsapp || null);

      setWhatsappAgente(numeroAgente);
      setWhatsappAdmisiones(numeroAdmisiones);
      setLogoAcademia((config as any)?.logo_url || null);

      // 1. Cargar Matrículas con Cursos y Programas
      const { data: dataMatriculas } = await supabaseBrowserClient
        .from("matriculas")
        .select(`
          *,
          cursos (
            *,
            programas (*)
          )
        `)
        .eq("estudiante_id", user.id)
        .neq("estado", "cancelado");

      setMatriculas(dataMatriculas || []);

      const matriculaIds = dataMatriculas?.map(m => m.id) || [];
      const programaIds = dataMatriculas?.map(m => m.cursos?.programa_id).filter(Boolean) || [];
      const cursoIds = (dataMatriculas || [])
        .map((m: any) => m?.curso_id || m?.cursos?.id)
        .filter(Boolean);

      // 2. Cargar Pagos (Independiente de matrículas activas para ver historial completo)
      const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
        .from("pagos")
        .select("*")
        .eq("estudiante_id", user.id)
        .order("fecha_vencimiento", { ascending: true });
      
      if (errPagos) logger.error("Error cargando pagos:", errPagos);

      let pagosFinales = dataPagos || [];

      if (pagosFinales.length === 0 && matriculaIds.length > 0) {
        const { data: pagosPorMatricula, error: errPagosPorMatricula } = await supabaseBrowserClient
          .from("pagos")
          .select("*")
          .in("matricula_id", matriculaIds)
          .order("fecha_vencimiento", { ascending: true });

        if (errPagosPorMatricula) {
          logger.error("Error cargando pagos por matrícula:", errPagosPorMatricula);
        } else {
          pagosFinales = pagosPorMatricula || [];
        }
      }

      setPagos(pagosFinales);

      // 3. Cargar datos relacionados a matrículas activas
      if (matriculaIds.length > 0) {
        // Asistencias
        const { data: dataAsistencias } = await supabaseBrowserClient
          .from("asistencias")
          .select("*, matriculas(id, curso_id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: false });

        let asistenciasConTema = dataAsistencias || [];

        if ((dataAsistencias || []).length > 0 && cursoIds.length > 0) {
          const fechas = (dataAsistencias || [])
            .map((a: any) => a?.fecha)
            .filter(Boolean)
            .sort();

          const fechaMin = fechas[0];
          const fechaMax = fechas[fechas.length - 1];

          const sesionesQuery = supabaseBrowserClient
            .from("sesiones_clase")
            .select("curso_id, fecha, tema_visto, observaciones")
            .in("curso_id", cursoIds);

          const { data: sesionesData } = await (fechaMin && fechaMax
            ? sesionesQuery.gte("fecha", fechaMin).lte("fecha", fechaMax)
            : sesionesQuery);

          const temaPorCursoFecha = new Map<string, string>();
          const claseNumeroPorCursoFecha = new Map<string, number | null>();
          (sesionesData || []).forEach((sesion: any) => {
            const key = `${sesion?.curso_id || ""}-${sesion?.fecha || ""}`;
            if (!temaPorCursoFecha.has(key)) {
              temaPorCursoFecha.set(key, sesion?.tema_visto || "");
              claseNumeroPorCursoFecha.set(key, extractClassNumber(sesion?.observaciones || sesion?.tema_visto));
            }
          });

          asistenciasConTema = (dataAsistencias || []).map((asistencia: any) => {
            const cursoId = asistencia?.matriculas?.curso_id;
            const key = `${cursoId || ""}-${asistencia?.fecha || ""}`;
            const temaSesion = temaPorCursoFecha.get(key) || null;
            const temaAsistencia = asistencia?.tema_visto || null;
            const detalleRegistro = String(asistencia?.observaciones || "").trim();
            return {
              ...asistencia,
              tema_visto: temaSesion || temaAsistencia,
              clase_numero: extractClassNumber(asistencia?.observaciones) ?? claseNumeroPorCursoFecha.get(key) ?? null,
              registro_clase: detalleRegistro || temaSesion || temaAsistencia || null,
            };
          });
        }

        setAsistencias(asistenciasConTema);

        if (matriculaIds.length > 0) {
          const { data: intentosQuizData } = await supabaseBrowserClient
            .from("quiz_intentos_clase")
            .select("*")
            .in("matricula_id", matriculaIds)
            .order("enviado_at", { ascending: false });
          setQuizIntentos(intentosQuizData || []);
        } else {
          setQuizIntentos([]);
        }
      }

      // 4. Cargar Pensum y Materiales si hay programas
      if (programaIds.length > 0) {
        const pensumData = await obtenerPensumPorProgramas(programaIds);
        setPensum(pensumData);

        const materialesData = await obtenerMaterialesPorProgramas(programaIds);
        const materialesUnicos = deduplicarLista(materialesData || [], (m: any) =>
          getMaterialCanonicalKey(m)
        );
        setMateriales(materialesUnicos);

        const materialesCicloData = await obtenerMaterialesCicloPorProgramas(programaIds);
        const materialesCicloUnicos = deduplicarLista(materialesCicloData || [], (m: any) => String(m?.id || ""));
        setMaterialesCiclo(materialesCicloUnicos);

        const materialesClaseData = await obtenerMaterialesClasePorProgramas(programaIds);
        const materialesClaseUnicos = deduplicarLista(materialesClaseData || [], (m: any) =>
          String(`${m?.programa_id || ''}-${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${(m?.nombre_material || '').trim().toLowerCase()}-${m?.cantidad || ''}-${(m?.unidad || '').trim().toLowerCase()}-${(m?.observaciones || '').trim().toLowerCase()}`)
        );
        setMaterialesClase(materialesClaseUnicos);

        const { data: dataQuizzes } = await supabaseBrowserClient
          .from("quizzes_clase")
          .select("*")
          .in("programa_id", programaIds)
          .eq("activo", true)
          .eq("publicado", true)
          .order("created_at", { ascending: false });

        setQuizzesClase(dataQuizzes || []);
      } else {
        setQuizzesClase([]);
        setQuizIntentos([]);
      }

      // 5. Calcular Avance y Certificados
      if (dataMatriculas) {
        const avance = dataMatriculas.map((m: any) => ({
          matriculaId: m.id,
          curso: m.cursos?.nombre,
          programa: m.cursos?.programas?.nombre,
          programaId: m.cursos?.programa_id,
          diasSemana: m.cursos?.dias_semana,
          horaInicio: m.cursos?.hora_inicio,
          horaFin: m.cursos?.hora_fin,
          nota: m.nota_final || 0,
          estado: m.estado_academico
        }));
        setAvancePorCurso(avance);

        const certs = dataMatriculas.filter((m: any) => m.estado_academico === 'aprobado' && m.nota_final >= 70);
        setCertificados(certs);
      }
    } catch (error) {
      logger.error("Error:", error);
      message.error("Error cargando información del portal");
    } finally {
      hasFetchedOnceRef.current = true;
      isFetchingRef.current = false;
      setLoading(false);
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

  const abrirQuiz = async (quiz: any) => {
    try {
      const { data: preguntasData, error } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .select("id, orden, pregunta, opcion_a, opcion_b, opcion_c, opcion_d")
        .eq("quiz_id", quiz.id)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (error) throw error;

      if (!preguntasData || preguntasData.length === 0) {
        message.warning("Este quiz aún no tiene preguntas cargadas.");
        return;
      }

      setQuizActivo(quiz);
      setQuizPreguntas(preguntasData);
      setQuizRespuestas({});
      setQuizPreguntaActual(0);
      setQuizAnimando(false);
      setQuizModalOpen(true);
    } catch (error) {
      logger.error("Error al abrir quiz", error);
      message.error("No se pudo abrir el quiz");
    }
  };

  const enviarQuiz = async () => {
    if (!quizActivo) return;

    const respuestas = quizPreguntas.map((pregunta: any) => {
      const respuesta = quizRespuestas[String(pregunta.id)] || "";
      return {
        pregunta_id: pregunta.id,
        respuesta,
      };
    });

    const sinResponder = respuestas.filter((r) => !r.respuesta).length;
    if (sinResponder > 0) {
      message.warning(`Debes responder todas las preguntas. Faltan ${sinResponder}.`);
      return;
    }

    try {
      setQuizSaving(true);

      const { data: preguntasConRespuesta, error: errorCorrectas } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .select("id, respuesta_correcta")
        .eq("quiz_id", quizActivo.id)
        .eq("activo", true);

      if (errorCorrectas) throw errorCorrectas;

      const preguntaPorId = new Map<string, any>();
      (quizPreguntas || []).forEach((pregunta: any) => {
        preguntaPorId.set(String(pregunta.id), pregunta);
      });

      const correctaPorPregunta = new Map<string, string>();
      (preguntasConRespuesta || []).forEach((pregunta: any) => {
        const preguntaBase = preguntaPorId.get(String(pregunta.id));
        correctaPorPregunta.set(String(pregunta.id), resolverClaveOpcionQuiz(preguntaBase, pregunta.respuesta_correcta));
      });

      let correctas = 0;
      respuestas.forEach((respuesta) => {
        const preguntaBase = preguntaPorId.get(String(respuesta.pregunta_id));
        const correcta = correctaPorPregunta.get(String(respuesta.pregunta_id)) || "";
        const marcada = resolverClaveOpcionQuiz(preguntaBase, respuesta.respuesta);
        if (correcta && correcta === marcada) {
          correctas += 1;
        }
      });

      const respuestasErradas = respuestas
        .map((respuesta) => {
          const pregunta = preguntaPorId.get(String(respuesta.pregunta_id));
          const correcta = resolverClaveOpcionQuiz(pregunta, correctaPorPregunta.get(String(respuesta.pregunta_id)) || "");
          const marcada = resolverClaveOpcionQuiz(pregunta, respuesta.respuesta);
          if (!correcta || marcada === correcta) return null;

          return {
            preguntaId: String(respuesta.pregunta_id || ""),
            orden: Number(pregunta?.orden || 0),
            pregunta: String(pregunta?.pregunta || "Pregunta"),
            respuestaMarcada: obtenerTextoOpcionQuiz(pregunta, marcada),
            respuestaCorrecta: obtenerTextoOpcionQuiz(pregunta, correcta),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.orden - b.orden);

      const total = respuestas.length || 1;
      const porcentaje = Number(((correctas / total) * 100).toFixed(2));
      const calificacion = Number(((correctas / total) * 5).toFixed(2));
      const matriculaQuiz = obtenerMatriculaDeQuiz(quizActivo);
      if (!matriculaQuiz?.id) {
        message.error("No se encontró matrícula para registrar el resultado del quiz.");
        return;
      }

      const aprobado = quizAprobado(calificacion);

      const payload = {
        quiz_id: quizActivo.id,
        matricula_id: Number(matriculaQuiz.id),
        estudiante_id: estudiante?.id || null,
        respuestas,
        respuestas_correctas: correctas,
        total_preguntas: total,
        calificacion,
      };

      const { data: intentosExistentes, error: errorBuscarIntento } = await supabaseBrowserClient
        .from("quiz_intentos_clase")
        .select("id")
        .eq("quiz_id", quizActivo.id)
        .eq("matricula_id", Number(matriculaQuiz.id));

      if (errorBuscarIntento) throw errorBuscarIntento;

      if ((intentosExistentes || []).length > 0) {
        const { error: errorActualizarIntento } = await supabaseBrowserClient
          .from("quiz_intentos_clase")
          .update(payload)
          .eq("quiz_id", quizActivo.id)
          .eq("matricula_id", Number(matriculaQuiz.id));

        if (errorActualizarIntento) throw errorActualizarIntento;
      } else {
        const { error: errorCrearIntento } = await supabaseBrowserClient
          .from("quiz_intentos_clase")
          .insert(payload);

        if (errorCrearIntento) throw errorCrearIntento;
      }

      const intentoLocal = {
        id: String(intentosExistentes?.[0]?.id || `${quizActivo.id}-${matriculaQuiz.id}`),
        ...payload,
        enviado_at: new Date().toISOString(),
      };

      setQuizIntentos((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const restantes = base.filter(
          (intento: any) =>
            !(
              String(intento?.quiz_id || "") === String(payload.quiz_id || "") &&
              String(intento?.matricula_id || "") === String(payload.matricula_id || "")
            )
        );
        return [intentoLocal, ...restantes];
      });

      // Cerrar el quiz siempre
      setQuizModalOpen(false);
      setQuizActivo(null);
      setQuizPreguntas([]);
      setQuizRespuestas({});
      setQuizPreguntaActual(0);
      setQuizAnimando(false);

      // Mostrar popup de resultado (grande, con nota y preguntas erradas)
      setQuizResultado({
        calificacion,
        porcentaje,
        aprobado,
        respuestasErradas: respuestasErradas as any[],
        totalPreguntas: total,
        correctas,
        tituloQuiz: quizActivo?.titulo || "",
      });
      setQuizResultadoVisible(true);

      // Auto-ocultar: si reprobó, 12s si hay errores o 8s; si aprobó no auto-cerrar
      if (!aprobado) {
        const autoCloseDelay = (respuestasErradas as any[]).length > 0 ? 12000 : 8000;
        setTimeout(() => setQuizResultadoVisible(false), autoCloseDelay);
      }

      await cargarDatos();
    } catch (error) {
      logger.error("Error enviando quiz", error);
      message.error("No se pudo enviar el quiz");
    } finally {
      setQuizSaving(false);
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
      matricula?.cursos?.precio_mensualidad ??
      matricula?.cursos?.programas?.precio_mensualidad ??
      matricula?.cursos?.precio ??
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

    const matriculasActivas = deduplicarLista(
      matriculas.filter((m: any) => m.estado !== "cancelado"),
      (m: any) => String(m?.id)
    );

    const matriculaSeleccionada =
      matriculasActivas.find((m: any) => String(m.id) === String(matriculaRutaId)) ||
      matriculasActivas[0];

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

    const programaIdSeleccionado = matriculaSeleccionada?.cursos?.programa_id;

    const ciclosPrograma = deduplicarLista(
      pensum.filter((p: any) => p.programa_id === programaIdSeleccionado),
      (ciclo: any) => String(ciclo?.id || `${ciclo?.programa_id || ''}-${ciclo?.nombre_ciclo || ''}-${ciclo?.numero_ciclo || ''}`)
    ).sort((a: any, b: any) => {
      const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
      const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
      if (ordenA !== ordenB) return ordenA - ordenB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

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

    const materialesPrograma = deduplicarLista(
      materiales.filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
      (m: any) => getMaterialCanonicalKey(m)
    );

    const materialesClasePrograma = deduplicarLista(
      materialesClase.filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
      (m: any) => String(`${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${normalizarTexto(m?.materiales_ciclo?.nombre || m?.nombre_material || '')}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`)
    );

    const materialesCicloPrograma = deduplicarLista(
      materialesCiclo.filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
      (m: any) => String(m?.id || `${normalizarTexto(m?.nombre || "")}-${m?.cantidad || ""}-${m?.pensum_id || ""}`),
    );

    const obtenerTemasCiclo = (ciclo: any) =>
      deduplicarLista(
        ciclo?.pensum_cursos || [],
        (tema: any) => String(tema?.id || normalizarTexto(tema?.nombre_curso || ""))
      ).sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? 0);
        const ordenB = Number(b?.orden ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });

    const obtenerRecursosTema = (tema: any, cicloId?: string) =>
      deduplicarLista(
        materialesPrograma.filter((material: any) => {
          if (!tema) return false;
          if (cicloId && String(material?.pensum_id || "") !== String(cicloId)) return false;

          const parsed = parseTemaTituloMaterial(material.titulo);
          const temaMaterial = normalizarTemaComparacion(parsed.tema);
          const temaObjetivo = normalizarTemaComparacion(tema.nombre_curso);
          const tituloLimpio = normalizarTexto(parsed.tituloLimpio);
          const descripcion = normalizarTexto(material.descripcion || "");

          if (!temaObjetivo) return true;
          if (temaMaterial) return temaMaterial === temaObjetivo;
          return tituloLimpio.includes(temaObjetivo) || descripcion.includes(temaObjetivo);
        }),
        (m: any) => getMaterialCanonicalKey(m, tema?.nombre_curso)
      );

    const obtenerInsumosTema = (tema: any, cicloId?: string) =>
      deduplicarLista(
        materialesClasePrograma.filter((item: any) => {
          if (!tema) return false;
          if (cicloId && item.pensum_id && String(item.pensum_id) !== String(cicloId)) return false;
          return String(item.pensum_curso_id) === String(tema.id);
        }),
        (m: any) => `${normalizarTexto(m?.materiales_ciclo?.nombre || m?.nombre_material || '')}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`
      );

    const obtenerMaterialesCiclo = (cicloId?: string) =>
      deduplicarLista(
        materialesCicloPrograma.filter((item: any) => (cicloId ? String(item?.pensum_id) === String(cicloId) : false)),
        (m: any) => String(m?.id || `${normalizarTexto(m?.nombre || "")}-${m?.cantidad || ""}`),
      );

    const temaObjetivo = (() => {
      if (!temaRutaId) return null;
      for (const ciclo of ciclosPrograma) {
        const tema = (obtenerTemasCiclo(ciclo) || []).find((t: any) => String(t?.id) === String(temaRutaId));
        if (tema) return tema;
      }
      return null;
    })();

    // ── Cascade: calcular el primer ciclo incompleto (todos los posteriores quedan bloqueados) ──
    const isCicloCompleto = (ciclo: any): boolean => {
      const temas = obtenerTemasCiclo(ciclo);
      for (const t of temas) {
        const quiz = (quizzesClase || []).find(
          (q: any) => String(q?.pensum_curso_id || "") === String(t?.id || "")
        );
        if (!quiz) continue; // sin quiz = auto-aprobado
        const intento = (quizIntentos || []).find(
          (it: any) => String(it?.quiz_id || "") === String(quiz?.id || "")
        );
        const nota = intento ? Number(intento?.calificacion || 0) : null;
        if (nota == null || !quizAprobado(nota)) return false;
      }
      return true;
    };
    let primerCicloIncompletoIndex = ciclosPrograma.length;
    for (let ci = 0; ci < ciclosPrograma.length; ci++) {
      if (!isCicloCompleto(ciclosPrograma[ci])) { primerCicloIncompletoIndex = ci; break; }
    }

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
            const primerIndexActual = cicloBloqueado ? 0 : (() => {
              for (let ti = 0; ti < temasCiclo.length; ti++) {
                const quiz = (quizzesClase || []).find(
                  (q: any) => String(q?.pensum_curso_id || "") === String(temasCiclo[ti]?.id || "")
                );
                if (!quiz) continue;
                const intento = (quizIntentos || []).find(
                  (it: any) => String(it?.quiz_id || "") === String(quiz?.id || "")
                );
                const nota = intento ? Number(intento?.calificacion || 0) : null;
                if (nota == null || !quizAprobado(nota)) return ti;
              }
              return temasCiclo.length; // todas completadas
            })();

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
                    const insumosTema = obtenerInsumosTema(tema, cicloId);
                    // Bloqueo en cascada:
                    // - vista "plan": bloqueado por módulo O por clase (quiz pendiente)
                    // - vistas de materiales/kits: solo por módulo, nunca por clase
                    const temaBloqueado = vista === "plan"
                      ? (cicloBloqueado || temaIndex > primerIndexActual)
                      : cicloBloqueado;
                    const quizTema = (quizzesClase || []).find(
                      (quiz: any) => String(quiz?.pensum_curso_id || "") === String(tema?.id || "")
                    );
                    // quizIntentos ya está filtrado por los IDs del estudiante, no hace falta filtrar por matricula_id
                    const intentoQuizTema = quizTema
                      ? (quizIntentos || []).find(
                          (intento: any) =>
                            String(intento?.quiz_id || "") === String(quizTema?.id || "")
                        )
                      : null;
                    const notaQuizTema = intentoQuizTema ? Number(intentoQuizTema?.calificacion || 0) : null;
                    const temaCompletado = notaQuizTema != null && quizAprobado(notaQuizTema);
                    const colorAvatarTema = temaBloqueado ? "#bfbfbf" : temaCompletado ? "#16a34a" : colorNumeroTema;
                    const insumosMarcados = insumosTema.filter((insumo: any) => {
                      const key = `${matriculaSeleccionada.id}|${temaId}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
                      return Boolean(checklistInsumos[key]);
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
                                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                                  <Space
                                    size={8}
                                    wrap
                                    className="tema-material-row"
                                    style={{ justifyContent: "space-between" }}
                                  >
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={recursoPrincipalTema ? getMaterialIcon(recursoPrincipalTema) : <FilePdfOutlined />}
                                      onClick={() => {
                                        if (!recursoPrincipalTema) {
                                          message.warning("Este tema aún no tiene material didáctico disponible.");
                                          return;
                                        }
                                        abrirMaterialDidactico(recursoPrincipalTema, tituloRecursoPrincipal);
                                      }}
                                      style={{ paddingInline: 0 }}
                                    >
                                      {tema?.nombre_curso || "Tema"}
                                    </Button>

                                    <Space size={4} className="tema-acciones-row">
                                      <Button
                                        size="small"
                                        type="default"
                                        icon={<DownloadOutlined />}
                                        onClick={() => {
                                          if (!recursoPrincipalTema) {
                                            message.warning("Este tema aún no tiene recurso para descargar.");
                                            return;
                                          }
                                          descargarMaterialDidactico(recursoPrincipalTema, tituloRecursoPrincipal, recursosTema);
                                        }}
                                      />

                                      <Button
                                        size="small"
                                        type={quizTema ? "primary" : "default"}
                                        ghost
                                        icon={<SafetyCertificateOutlined />}
                                        disabled={!quizTema}
                                        onClick={() => {
                                          if (!quizTema) return;
                                          abrirQuiz(quizTema);
                                        }}
                                      >
                                        Quiz
                                      </Button>
                                    </Space>
                                  </Space>

                                  <Space wrap size={8}>
                                    <Tag color="geekblue">
                                      {`Actividad evaluatoria: ${quizTema?.titulo || "Sin actividad"}`}
                                    </Tag>
                                    <Tag color={notaQuizTema == null ? "default" : quizAprobado(notaQuizTema) ? "green" : "red"}>
                                      {`Calificación: ${notaQuizTema == null ? "-" : `${notaQuizTema}/5`}`}
                                    </Tag>
                                  </Space>
                                </Space>
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
                                          const key = `${matriculaSeleccionada.id}|${temaId}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
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
                                                checked={Boolean(checklistInsumos[key])}
                                                onChange={(event) => {
                                                  setChecklistInsumos((prev) => ({
                                                    ...prev,
                                                    [key]: event.target.checked,
                                                  }));
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

  if (loading) {
    return (
      <div className="portal-splash-loading">
        <div className="portal-splash-loading-inner">
          <div className="splash-loading-logo-box">
            {logoAcademia ? (
              <img src={logoAcademia} alt="Crystal Diamante" className="splash-loading-logo" />
            ) : (
              <div className="splash-loading-fallback">CD</div>
            )}
          </div>
          <div className="splash-loading-dots">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
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
        {/* Decoración sutil */}
        <div className="portal-header-bg" />

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
        width={quizResultado?.aprobado ? (isMobile ? "96vw" : 620) : (isMobile ? "94vw" : 560)}
        centered
        title={null}
        closable
        styles={{
          body: { padding: 0 },
          content: quizResultado?.aprobado
            ? { background: "linear-gradient(160deg, #1a0533 0%, #2d0a5c 40%, #0d2a6e 100%)", borderRadius: 16, overflow: "hidden" }
            : { borderRadius: 16, overflow: "hidden" },
        }}
      >
        {quizResultado && quizResultado.aprobado ? (
          /* ——— PANTALLA DE LOGRO (aprobado) ——— */
          <div style={{ color: "#fff" }}>

            {/* Contenido capturable para imagen compartible */}
            <div ref={logrocardRef} style={{ paddingBottom: 20 }}>

            {/* Estrellas decorativas superiores */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              pointerEvents: "none", overflow: "hidden", borderRadius: 16,
            }}>
              {[...Array(12)].map((_, i) => (
                <StarFilled
                  key={i}
                  style={{
                    position: "absolute",
                    color: `rgba(255,215,0,${0.12 + (i % 4) * 0.07})`,
                    fontSize: 10 + (i % 5) * 6,
                    top: `${(i * 37) % 90}%`,
                    left: `${(i * 53 + 5) % 95}%`,
                    transform: `rotate(${i * 25}deg)`,
                  }}
                />
              ))}
            </div>

            {/* Cabecera con logo */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              paddingTop: 28, paddingBottom: 12, position: "relative",
            }}>
              {logoAcademia ? (
                <img
                  src={logoAcademia}
                  alt="Academia"
                  style={{ height: 52, maxWidth: 180, objectFit: "contain", marginBottom: 6, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
                />
              ) : (
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>ACADEMIA CRYSTAL DIAMANTE</Text>
              )}
              <div style={{ width: 48, height: 2, background: "linear-gradient(90deg, transparent, #ffd700, transparent)" }} />
            </div>

            {/* Trofeo + nota */}
            <div style={{ textAlign: "center", padding: "8px 24px 0" }}>
              <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>🏆</div>
              <div style={{
                display: "inline-flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                width: 110, height: 110, borderRadius: "50%",
                background: "linear-gradient(135deg, #ffd700 0%, #ff9500 100%)",
                boxShadow: "0 0 40px rgba(255,215,0,0.55), 0 4px 20px rgba(0,0,0,0.4)",
                margin: "4px auto 10px",
              }}>
                <span style={{ color: "#1a0533", fontSize: 38, fontWeight: 900, lineHeight: 1 }}>
                  {quizResultado.calificacion.toFixed(1)}
                </span>
                <span style={{ color: "rgba(26,5,51,0.75)", fontSize: 12, fontWeight: 600 }}>/5.0</span>
              </div>

              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>
                ¡Lo lograste{estudiante?.nombre_completo ? `, ${estudiante.nombre_completo.split(" ")[0]}` : ""}! 🎉
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, marginBottom: 2 }}>
                {quizResultado.tituloQuiz && (
                  <span>📚 <em>{quizResultado.tituloQuiz}</em></span>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                {quizResultado.correctas} de {quizResultado.totalPreguntas} correctas · {quizResultado.porcentaje}%
              </div>
            </div>

            {/* Tarjeta compartible */}
            <div style={{
              margin: "16px 20px 0",
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.09)",
              border: "1px solid rgba(255,215,0,0.25)",
              backdropFilter: "blur(4px)",
            }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
                ✨ Presume tu logro
              </div>
              <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 1.6 }}>
                {`🏆 ¡Acabo de aprobar con ${quizResultado.calificacion.toFixed(1)}/5.0 (${quizResultado.porcentaje}%)${quizResultado.tituloQuiz ? ` el quiz "${quizResultado.tituloQuiz}"` : ""} en Academia Crystal Diamante! 💪✨ Sigo superando mis metas. ¿Y tú? #AcademiaCrystalDiamante #Logro #Aprendizaje`}
              </div>
            </div>

            </div>{/* fin contenido capturable */}

            {/* Botones de compartir */}
            <div style={{ padding: "14px 20px 8px" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
                Comparte en
              </div>
              <Row gutter={[8, 8]} justify="center">
                {/* WhatsApp */}
                <Col xs={24} sm={8}>
                  <Button
                    block
                    icon={<WhatsAppOutlined />}
                    size="large"
                    style={{
                      background: "#25D366", color: "#fff",
                      border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                      height: 44,
                      boxShadow: "0 3px 12px rgba(37,211,102,0.4)",
                    }}
                    onClick={() => compartirLogro("whatsapp")}
                  >
                    WhatsApp
                  </Button>
                </Col>
                {/* Facebook */}
                <Col xs={24} sm={8}>
                  <Button
                    block
                    size="large"
                    style={{
                      background: "#1877F2", color: "#fff",
                      border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                      height: 44,
                      boxShadow: "0 3px 12px rgba(24,119,242,0.4)",
                    }}
                    onClick={() => compartirLogro("facebook")}
                  >
                    📘 Facebook
                  </Button>
                </Col>
                {/* Instagram — copia el texto y abre Instagram */}
                <Col xs={24} sm={8}>
                  <Button
                    block
                    size="large"
                    style={{
                      background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                      color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                      height: 44,
                      boxShadow: "0 3px 12px rgba(220,39,67,0.4)",
                    }}
                    onClick={() => compartirLogro("instagram")}
                  >
                    📸 Instagram
                  </Button>
                </Col>
              </Row>
            </div>

            {/* Botón cerrar */}
            <div style={{ padding: "12px 16px 24px", textAlign: "center" }}>
              <Button
                block
                type="primary"
                size="large"
                style={{
                  background: "linear-gradient(90deg, #ffd700, #ff9500)",
                  border: "none", color: "#1a0533", fontWeight: 800,
                  borderRadius: 10, fontSize: 14, height: 44,
                  boxShadow: "0 4px 16px rgba(255,215,0,0.4)",
                }}
                onClick={() => setQuizResultadoVisible(false)}
              >
                🌟 ¡Ya presumí mi logro! Cerrar
              </Button>
            </div>
          </div>
        ) : quizResultado && !quizResultado.aprobado ? (
          /* ——— PANTALLA DE REPROBADO ——— */
          <div style={{ padding: isMobile ? 16 : 28 }}>
            <Space direction="vertical" size={20} style={{ width: "100%", textAlign: "center" }}>
              <div
                style={{
                  width: 130, height: 130, borderRadius: "50%",
                  background: "linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  margin: "0 auto",
                  boxShadow: "0 8px 32px rgba(255,77,79,0.4)",
                }}
              >
                <span style={{ color: "#fff", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
                  {quizResultado.calificacion.toFixed(1)}
                </span>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>/5.0</span>
              </div>
              <div>
                <Text style={{ fontSize: 22, fontWeight: 700, display: "block" }}>
                  Sigue intentando 💪
                </Text>
                <Text type="secondary" style={{ fontSize: 15 }}>
                  {`${quizResultado.correctas} de ${quizResultado.totalPreguntas} correctas · ${quizResultado.porcentaje}%`}
                </Text>
                <br />
                <Text type="danger" style={{ fontSize: 13 }}>
                  {`Necesitas mínimo ${UMBRAL_APROBACION_QUIZ_NOTA}/5 (${UMBRAL_APROBACION_QUIZ_PORCENTAJE}%) para aprobar y desbloquear la siguiente clase.`}
                </Text>
              </div>
              {quizResultado.respuestasErradas.length > 0 && (
                <div style={{ textAlign: "left", width: "100%" }}>
                  <Text strong style={{ fontSize: 14 }}>
                    {`Preguntas por mejorar (${quizResultado.respuestasErradas.length}):`}
                  </Text>
                  <List
                    size="small"
                    bordered
                    style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}
                    dataSource={quizResultado.respuestasErradas}
                    renderItem={(item: any) => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: "100%" }}>
                          <Text strong style={{ fontSize: 12 }}>{`Pregunta ${item.orden || "-"}`}</Text>
                          <Text style={{ fontSize: 13 }}>{item.pregunta}</Text>
                          <Text type="danger" style={{ fontSize: 12 }}>{`✗ Tu respuesta: ${item.respuestaMarcada}`}</Text>
                          <Text type="success" style={{ fontSize: 12 }}>{`✓ Correcta: ${item.respuestaCorrecta}`}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </div>
              )}
              <Button type="primary" danger onClick={() => setQuizResultadoVisible(false)}>
                Entendido, volver a intentarlo
              </Button>
            </Space>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={quizActivo?.titulo || "Responder quiz"}
        open={quizModalOpen}
        confirmLoading={quizSaving}
        onCancel={() => {
          setQuizModalOpen(false);
          setQuizActivo(null);
          setQuizPreguntas([]);
          setQuizRespuestas({});
          setQuizPreguntaActual(0);
          setQuizAnimando(false);
        }}
        width={isMobile ? "96vw" : 820}
        styles={{ body: { maxHeight: isMobile ? "70vh" : "75vh", overflowY: "auto" } }}
        footer={(() => {
          const preguntasPorBloque = 5;
          const totalPreguntas = quizPreguntas?.length || 0;
          const esUltimaPregunta = quizPreguntaActual >= Math.max(0, totalPreguntas - 1);

          return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8 }}>
              <Button
                onClick={() => setQuizPreguntaActual((prev) => Math.max(0, prev - 1))}
                disabled={quizPreguntaActual <= 0 || quizSaving || quizAnimando}
              >
                Anterior
              </Button>

              {esUltimaPregunta ? (
                <Button type="primary" onClick={enviarQuiz} loading={quizSaving}>
                  Finalizar y enviar
                </Button>
              ) : (
                <Text type="secondary" style={{ fontSize: isMobile ? 11 : 13 }}>
                  {isMobile ? "Selecciona →" : "Selecciona una respuesta para continuar →"}
                </Text>
              )}
            </div>
          );
        })()}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {(() => {
            const preguntasPorBloque = 5;
            const totalPreguntas = quizPreguntas?.length || 0;
            const totalBloques = Math.max(1, Math.ceil(totalPreguntas / preguntasPorBloque));
            const quizBloqueActual = Math.floor(quizPreguntaActual / preguntasPorBloque) + 1;
            const inicioBloque = (quizBloqueActual - 1) * preguntasPorBloque;
            const finBloque = Math.min(inicioBloque + preguntasPorBloque, totalPreguntas);
            const preguntaActual = quizPreguntas[quizPreguntaActual];
            const respondidas = (quizPreguntas || []).filter((p: any) => Boolean(quizRespuestas[String(p.id)])).length;
            const progreso = totalPreguntas > 0
              ? Math.round((respondidas / totalPreguntas) * 100)
              : 0;

            return (
              <>
                <Card size="small">
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Text strong>{`Bloque ${quizBloqueActual} de ${totalBloques}`}</Text>
                      </Col>
                      <Col>
                        <Tag>{`${respondidas}/${totalPreguntas} respondidas`}</Tag>
                      </Col>
                    </Row>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Text type="secondary">{`Pregunta ${quizPreguntaActual + 1} de ${totalPreguntas}`}</Text>
                      </Col>
                      <Col>
                        <Text type="secondary">{`Rango bloque: ${inicioBloque + 1}-${finBloque}`}</Text>
                      </Col>
                    </Row>
                    <Progress percent={progreso} size="small" />
                  </Space>
                </Card>

                {preguntaActual ? (
                  <Card
                    key={String(preguntaActual.id)}
                    className={`quiz-question-transition ${quizAnimando ? "is-leaving" : ""}`}
                    size="small"
                    title={`Pregunta ${quizPreguntaActual + 1}`}
                    bodyStyle={{ paddingTop: 12 }}
                  >
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      {(() => {
                        const indicador = getIndicadorVisualPreguntaQuiz(preguntaActual.pregunta);
                        return <Tag color={indicador.color}>{`${indicador.emoji} ${indicador.etiqueta}`}</Tag>;
                      })()}

                      <Card
                        size="small"
                        title={<Text strong>Pregunta</Text>}
                        bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
                      >
                        <Text strong style={{ fontSize: 15, lineHeight: 1.45 }}>
                          {preguntaActual.pregunta}
                        </Text>
                      </Card>

                      <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        <Text strong>Opciones de respuesta</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Selecciona una opción para continuar.
                        </Text>
                      </Space>

                      <Radio.Group
                        value={quizRespuestas[String(preguntaActual.id)]}
                        onChange={(event) => {
                          const value = String(event?.target?.value || "");
                          if (!value) return;

                          setQuizRespuestas((prev) => ({
                            ...prev,
                            [String(preguntaActual.id)]: value,
                          }));

                          const totalPreguntasLocal = quizPreguntas?.length || 0;
                          const esUltima = quizPreguntaActual >= Math.max(0, totalPreguntasLocal - 1);

                          if (!esUltima && !quizAnimando) {
                            setQuizAnimando(true);
                            window.setTimeout(() => {
                              setQuizPreguntaActual((prev) => Math.min(totalPreguntasLocal - 1, prev + 1));
                              setQuizAnimando(false);
                            }, 180);
                          }
                        }}
                        style={{ width: "100%" }}
                      >
                        {(() => {
                          const opcionSeleccionada = quizRespuestas[String(preguntaActual.id)] || "";
                          const opciones = [
                            { value: "A", label: `A) ${preguntaActual.opcion_a}` },
                            { value: "B", label: `B) ${preguntaActual.opcion_b}` },
                            { value: "C", label: `C) ${preguntaActual.opcion_c}` },
                            { value: "D", label: `D) ${preguntaActual.opcion_d}` },
                          ];

                          return (
                            <Space direction="vertical" size={8} style={{ width: "100%" }}>
                              {opciones.map((opcion) => {
                                const activa = opcionSeleccionada === opcion.value;
                                return (
                                  <label
                                    key={opcion.value}
                                    className={`quiz-option-card ${activa ? "is-active" : ""}`}
                                  >
                                    <Radio value={opcion.value} style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
                                      {opcion.label}
                                    </Radio>
                                  </label>
                                );
                              })}
                            </Space>
                          );
                        })()}
                      </Radio.Group>
                    </Space>
                  </Card>
                ) : null}
              </>
            );
          })()}
        </Space>
      </Modal>

      <Modal
        title={null}
        open={iframePreview.open}
        onCancel={() => setIframePreview({ open: false, title: "", src: "" })}
        footer={null}
        width="100%"
        centered
        closable={false}
        style={{ top: 0, padding: 0 }}
        styles={{ 
          body: { padding: 0, height: "100vh", overflow: "hidden" },
          content: { padding: 0, borderRadius: 0, height: "100vh", overflow: "hidden" }
        }}
        destroyOnClose
        className="gamma-fullscreen-modal"
      >
        <div className="gamma-iframe-topbar">
          <div className="gamma-iframe-brand">
            {logoAcademia ? (
              <img src={logoAcademia} alt="Logo academia" className="gamma-iframe-logo" />
            ) : (
              <div className="gamma-iframe-logo-fallback">CD</div>
            )}
            <span className="gamma-iframe-title">{iframePreview.title || "Presentación"}</span>
          </div>
          <button
            type="button"
            className="gamma-iframe-close"
            onClick={() => setIframePreview({ open: false, title: "", src: "" })}
            aria-label="Cerrar visor"
          >
            ✕
          </button>
        </div>
        <iframe
          src={iframePreview.src}
          title={iframePreview.title || "Presentación"}
          style={{ width: "100%", height: "calc(100vh - 56px)", border: 0, marginTop: "56px" }}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          loading="lazy"
        />
      </Modal>
      <style jsx global>{`
        /* ──────────────────────────────────────
           LOADING SPLASH (reemplaza skeleton)
        ────────────────────────────────────── */
        .portal-splash-loading {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .portal-splash-loading-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          animation: splashContentIn 0.6s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes splashContentIn {
          from { transform: scale(0.7); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        .splash-loading-logo-box {
          width: 92px;
          height: 92px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          border: 1.5px solid #f2d2e5;
          box-shadow: 0 8px 24px rgba(216,27,135,0.12);
        }
        .splash-loading-logo {
          max-width: 74px;
          max-height: 74px;
          width: auto;
          height: auto;
          object-fit: contain;
          display: block;
        }
        .splash-loading-fallback {
          width: 74px;
          height: 74px;
          border-radius: 16px;
          background: linear-gradient(135deg, #fdf0f7 0%, #fff 100%);
          border: 2px solid #d81b87;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #d81b87;
          font-size: 28px;
          font-weight: 800;
        }
        .splash-loading-dots {
          display: flex;
          gap: 8px;
        }
        .splash-loading-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d81b87;
          animation: dotBounce 1.2s ease-in-out infinite;
        }
        .splash-loading-dots span:nth-child(2) { animation-delay: 0.15s; }
        .splash-loading-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.4); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* ──────────────────────────────────────
           HEADER COMPACTO
        ────────────────────────────────────── */
        .portal-header-banner {
          position: relative;
          overflow: hidden;
          background: linear-gradient(160deg, #d81b87 0%, #b81775 100%);
          padding: 12px 14px;
          margin-bottom: 0;
          border-bottom-left-radius: 18px;
          border-bottom-right-radius: 18px;
          box-shadow: 0 6px 16px rgba(216,27,135,0.14);
        }
        .portal-header-bg {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(ellipse at 20% 0%, rgba(255,255,255,0.14) 0%, transparent 60%);
          pointer-events: none;
          border-bottom-left-radius: 18px;
          border-bottom-right-radius: 18px;
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
          .gamma-iframe-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }
          .gamma-iframe-logo {
            max-width: 34px;
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
          .gamma-iframe-title {
            color: #111827;
            font-size: 14px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: min(60vw, 620px);
          }
          .gamma-iframe-close {
            border: 1px solid #e5e7eb;
            background: #fff;
            color: #6b7280;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            cursor: pointer;
            line-height: 1;
            font-size: 17px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .gamma-iframe-close:hover {
            border-color: #d1d5db;
            color: #111827;
            background: #f9fafb;
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
