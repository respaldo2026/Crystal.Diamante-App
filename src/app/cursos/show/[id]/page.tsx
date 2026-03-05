"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, Tabs, Table, Tag, Row, Col, Statistic, Button, Space, Typography, Alert, Modal, Form, Input, InputNumber, DatePicker, Upload, List, Empty, App, Select, Collapse, Grid, Radio, Popover, Skeleton } from "antd";
import type { Breakpoint } from "antd/es/_util/responsiveObserver";
import {
  UserOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  BookOutlined,
  FileOutlined,
  FileTextOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileWordOutlined,
  LinkOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  YoutubeOutlined,
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
  enMora?: boolean;
  totalFaltas?: number;
  faltasDetalle?: Array<{ fecha: string | null; tema: string }>;
}

interface Tema {
  id: string;
  titulo: string;
  nombre_curso?: string;
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

const getActividadColor = (nota?: number | null): string => {
  const value = Number(nota);
  if (!Number.isFinite(value)) return "default";
  if (value >= 4) return "green";
  if (value >= 3) return "gold";
  return "red";
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

type ParamsLike = Promise<{ id: string }>;

export default function CursoShowPage({ params }: { params: ParamsLike }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;
  const { message, modal } = App.useApp();
  const [cursoId, setCursoId] = useState<string>("");
  const [curso, setCurso] = useState<any>(null);
  const [estudiantes, setEstudiantes] = useState<Student[]>([]);
  const [notaEdicion, setNotaEdicion] = useState<Record<string, number | null>>({});
  const [estadoEdicion, setEstadoEdicion] = useState<Record<string, string>>({});
  const [savingNotaId, setSavingNotaId] = useState<string | null>(null);
  const [calificacionesTema, setCalificacionesTema] = useState<Record<string, Record<string, number | null>>>({});
  const [savingCalificacionId, setSavingCalificacionId] = useState<string | null>(null);
  const [temaSeleccionadoId, setTemaSeleccionadoId] = useState<string | null>(null);
  const [modalActividadVisible, setModalActividadVisible] = useState(false);
  const [modalRadarVisible, setModalRadarVisible] = useState(false);
  const [soloPendientesActividad, setSoloPendientesActividad] = useState(false);
  const [estudianteFocoActividadId, setEstudianteFocoActividadId] = useState<string | null>(null);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [quizzesClase, setQuizzesClase] = useState<any[]>([]);
  const [resultadosQuiz, setResultadosQuiz] = useState<any[]>([]);
  const [quizProfesorSeleccionadoId, setQuizProfesorSeleccionadoId] = useState<string | null>(null);
  const [quizProfesorModalOpen, setQuizProfesorModalOpen] = useState(false);
  const [quizProfesorActivo, setQuizProfesorActivo] = useState<any | null>(null);
  const [quizProfesorPreguntas, setQuizProfesorPreguntas] = useState<any[]>([]);
  const [quizProfesorRespuestas, setQuizProfesorRespuestas] = useState<Record<string, string>>({});
  const [quizProfesorSaving, setQuizProfesorSaving] = useState(false);
  const [quizProfesorResultado, setQuizProfesorResultado] = useState<{
    quizId: string;
    titulo: string;
    calificacion: number;
    porcentaje: number;
    correctas: number;
    totalPreguntas: number;
    respuestas: Array<{
      preguntaId: string;
      orden: number;
      pregunta: string;
      respuestaMarcada: string;
      respuestaCorrecta: string;
      esCorrecta: boolean;
    }>;
  } | null>(null);
  const [iframeMaterialPreview, setIframeMaterialPreview] = useState<{
    open: boolean;
    title: string;
    src: string;
    pdfSrc: string;
  }>({ open: false, title: "", src: "", pdfSrc: "" });
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalSesionVisible, setModalSesionVisible] = useState(false);
  const [formSesion] = Form.useForm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdminView = searchParams?.get("admin") === "1";
  const returnTo = isAdminView ? "/cursos" : "/mi-oficina";

  const materialesUnicos = useMemo(
    () =>
      dedupeByKey(materiales, (mat: any) =>
        String(
          `${mat.pensum_id ?? ""}-${mat.titulo ?? mat.nombre_archivo ?? ""}-${mat.url_archivo ?? ""}-${
            mat.descripcion ?? ""
          }-${mat.tipo_material ?? ""}-${mat.orden ?? ""}`,
        ).toLowerCase(),
      ),
    [materiales],
  );

  const materialesClaseUnicos = useMemo(
    () =>
      dedupeByKey(materialesClase, (mat: any) =>
        String(
          `${mat.pensum_curso_id ?? ""}-${mat.nombre_material ?? ""}-${mat.cantidad ?? ""}-${
            mat.unidad ?? ""
          }-${mat.obligatorio ?? ""}-${mat.observaciones ?? ""}`,
        ).toLowerCase(),
      ),
    [materialesClase],
  );

  const parseTemaFromTitulo = (titulo: string) => {
    const raw = String(titulo || "").trim();
    const patrones = [
      /^\s*tema\s*[:\-]\s*(.+?)\s+[—–]\s+(.+)$/i,
      /^\s*\[\s*tema\s*[:\-]\s*(.+?)\s*\]\s*[—–]\s*(.+)$/i,
      /^\s*tema\s*[:\-]\s*(.+?)\s+-\s+(.+)$/i,
      /^\s*\[\s*tema\s*[:\-]\s*(.+?)\s*\]\s*:\s*(.+)$/i,
    ];

    for (const patron of patrones) {
      const match = raw.match(patron);
      if (!match) continue;
      const tema = String(match[1] || "").trim();
      const tituloLimpio = String(match[2] || raw).trim();
      return { tema: tema || undefined, tituloLimpio };
    }

    return { tema: undefined, tituloLimpio: raw };
  };

  const normalizarTema = (valor?: string) =>
    String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\d+\s*[\.)\-:]\s*/, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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

  const extractIframeSrc = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const match = raw.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
    return normalizeHttpUrl(String(match?.[1] || raw).trim());
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

  const ciclosOrdenados = useMemo(() => {
    const list = Array.isArray(temas) ? temas.slice() : [];
    return list.sort((a: any, b: any) => {
      const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
      const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
      if (ordenA !== ordenB) return ordenA - ordenB;
      return Number(a?.id ?? 0) - Number(b?.id ?? 0);
    });
  }, [temas]);

  const temasPorCiclo = useMemo(() => {
    const map = new Map<string, any[]>();
    ciclosOrdenados.forEach((ciclo: any) => {
      const cicloId = String(ciclo?.id ?? "sin-ciclo");
      const temasCiclo = Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos.slice() : [];
      temasCiclo.sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? 0);
        const ordenB = Number(b?.orden ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });
      if (temasCiclo.length) {
        map.set(cicloId, temasCiclo);
      }
    });

    materialesClaseUnicos.forEach((item: any) => {
      const tema = item?.pensum_cursos;
      if (!tema?.id) return;
      const cicloId = String(item?.pensum_id ?? tema?.pensum_id ?? "sin-ciclo");
      const current = map.get(cicloId) ?? [];
      if (!current.find((t: any) => String(t.id) === String(tema.id))) {
        current.push(tema);
        current.sort((a: any, b: any) => {
          const ordenA = Number(a?.orden ?? 0);
          const ordenB = Number(b?.orden ?? 0);
          if (ordenA !== ordenB) return ordenA - ordenB;
          return Number(a?.id ?? 0) - Number(b?.id ?? 0);
        });
        map.set(cicloId, current);
      }
    });

    return map;
  }, [ciclosOrdenados, materialesClaseUnicos]);

  const clasesPensum = useMemo(() => {
    const map = new Map<string, any>();
    ciclosOrdenados.forEach((ciclo: any) => {
      const cicloId = String(ciclo?.id ?? "sin-ciclo");
      const temasCiclo = temasPorCiclo.get(cicloId) ?? [];
      temasCiclo.forEach((tema: any) => {
        const temaId = String(tema?.id || "");
        if (!temaId || map.has(temaId)) return;
        map.set(temaId, tema);
      });
    });

    return Array.from(map.values());
  }, [ciclosOrdenados, temasPorCiclo]);

  const ordenTemaPorId = useMemo(() => {
    const map = new Map<string, number>();
    clasesPensum.forEach((tema: any, index: number) => {
      const temaId = String(tema?.id || "");
      if (!temaId) return;
      map.set(temaId, index + 1);
    });
    return map;
  }, [clasesPensum]);

  const formatearNombreClase = useCallback(
    (tema: any) => {
      const temaId = String(tema?.id || "");
      const orden = ordenTemaPorId.get(temaId);
      const nombre = String(tema?.nombre_curso || tema?.titulo || "Clase");
      return orden ? `${orden}. ${nombre}` : nombre;
    },
    [ordenTemaPorId]
  );

  const temasPorNombre = useMemo(() => {
    const map = new Map<string, string>();
    ciclosOrdenados.forEach((ciclo: any) => {
      const temasCiclo = Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [];
      temasCiclo.forEach((tema: any) => {
        const nombre = tema?.nombre_curso || tema?.titulo || "";
        const key = normalizarTema(nombre);
        if (key) map.set(key, String(tema.id));
      });
    });
    return map;
  }, [ciclosOrdenados]);

  const nombreTemaPorId = useMemo(() => {
    const map = new Map<string, string>();
    ciclosOrdenados.forEach((ciclo: any) => {
      const temasCiclo = Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [];
      temasCiclo.forEach((tema: any) => {
        const key = String(tema?.id || "");
        if (!key) return;
        map.set(key, String(tema?.nombre_curso || tema?.titulo || "Tema"));
      });
    });
    return map;
  }, [ciclosOrdenados]);

  const materialesNecesariosPorTema = useMemo(() => {
    const map = new Map<string, any[]>();
    materialesClaseUnicos.forEach((item: any) => {
      const temaId = String(item?.pensum_curso_id ?? "sin-tema");
      const current = map.get(temaId) ?? [];
      current.push(item);
      map.set(temaId, current);
    });
    return map;
  }, [materialesClaseUnicos]);

  const materialesDidacticosPorTema = useMemo(() => {
    const map = new Map<string, any[]>();
    materialesUnicos.forEach((item: any) => {
      const temaIdDirecto = item?.pensum_curso_id ?? item?.pensum_cursos?.id;
      let temaId = temaIdDirecto ? String(temaIdDirecto) : "";
      if (!temaId) {
        const tituloMaterial = String(item?.titulo || item?.nombre_archivo || "");
        const { tema } = parseTemaFromTitulo(tituloMaterial);
        const temaKey = normalizarTema(tema);
        if (temaKey && temasPorNombre.has(temaKey)) {
          temaId = String(temasPorNombre.get(temaKey));
        }
      }
      const finalTemaId = temaId || "sin-tema";
      const current = map.get(finalTemaId) ?? [];
      current.push(item);
      map.set(finalTemaId, current);
    });
    return map;
  }, [materialesUnicos, temasPorNombre]);

  const materialesDidacticosPorCiclo = useMemo(() => {
    const map = new Map<string, any[]>();
    materialesUnicos.forEach((item: any) => {
      const cicloId = String(item?.pensum_id ?? "sin-ciclo");
      const current = map.get(cicloId) ?? [];
      current.push(item);
      map.set(cicloId, current);
    });
    return map;
  }, [materialesUnicos]);

  const getMaterialIcon = (material: any) => {
    const tipo = String(material?.tipo_material || "").toLowerCase();
    const url = String(material?.url_archivo || "").toLowerCase();
    const titulo = String(material?.titulo || material?.nombre_archivo || "").toLowerCase();
    const texto = `${tipo} ${url} ${titulo}`;

    if (texto.includes("canva.com")) return <LinkOutlined />;
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

  const abrirMaterialTema = (material: any, titulo: string, recursosTema: any[] = []) => {
    const src = extractIframeSrc(material?.url_archivo);
    const pdfRespaldo = (isPdfMaterial(material) ? material : recursosTema.find((item: any) => isPdfMaterial(item))) || null;
    const pdfSrc = extractIframeSrc(pdfRespaldo?.url_archivo);

    if (isIframeMaterial(material)) {
      if (!src || hasMalformedEmbedTokens(src) || !isAllowedEmbedHost(src)) {
        if (pdfSrc) {
          message.warning("No se pudo abrir el iframe de Gamma. Se abrirá el PDF de respaldo.");
          window.open(pdfSrc, "_blank", "noopener,noreferrer");
          return;
        }
        message.warning("Este tema no tiene un iframe de Gamma válido ni PDF de respaldo.");
        return;
      }

      setIframeMaterialPreview({
        open: true,
        title: titulo || "Presentación",
        src: toGammaEmbedUrl(src),
        pdfSrc: pdfSrc || "",
      });
      return;
    }

    if (pdfSrc) {
      window.open(pdfSrc, "_blank", "noopener,noreferrer");
      return;
    }

    if (src) {
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }

    message.warning("Este material no tiene un enlace válido.");
  };

  const abrirMaterial = (material: any) => {
    const url = material?.url_archivo;
    if (!url) {
      message.warning("Este material no tiene enlace disponible");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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
      if (nota == null || Number.isNaN(nota) || Number(nota) < 1 || Number(nota) > 5) {
        message.warning("Ingresa una nota válida (1 a 5)");
        return;
      }

      const matriculaIdNumerico = Number(matriculaId);
      if (!Number.isFinite(matriculaIdNumerico)) {
        message.error("No se pudo guardar la nota: matrícula inválida.");
        return;
      }

      const temaActual = clasesPensum.find((t) => String(t.id) === String(temaId));
      const conceptoTema = `Actividad: ${temaActual?.nombre_curso || temaActual?.titulo || String(temaId)}`;
      const key = `${temaId}-${matriculaId}`;
      setSavingCalificacionId(key);
      try {
        const payload: any = {
          matricula_id: matriculaIdNumerico,
          concepto: conceptoTema,
          nota,
          calificacion: nota,
          tipo_evaluacion: "actividad",
          fecha_evaluacion: dayjs().format("YYYY-MM-DD"),
        };

        let queryExistente = supabaseBrowserClient
          .from("calificaciones")
          .select("id")
          .eq("matricula_id", matriculaIdNumerico)
          .in("tipo_evaluacion", ["actividad", "tema"])
          .eq("concepto", conceptoTema);

        const { data: existentes, error: errExistente } = await queryExistente
          .order("fecha_evaluacion", { ascending: false })
          .limit(1);

        if (errExistente) {
          message.error("Error validando nota de tema: " + errExistente.message);
          return;
        }

        const existenteId = Array.isArray(existentes) && existentes.length > 0 ? existentes[0]?.id : null;

        if (existenteId) {
          const { error: errUpdate } = await supabaseBrowserClient
            .from("calificaciones")
            .update({
              concepto: conceptoTema,
              nota,
              calificacion: nota,
              tipo_evaluacion: "actividad",
              fecha_evaluacion: dayjs().format("YYYY-MM-DD"),
            })
            .eq("id", existenteId);

          if (errUpdate) {
            message.error("Error actualizando nota de tema: " + errUpdate.message);
            return;
          }
        } else {
          const { error: errInsert } = await supabaseBrowserClient
            .from("calificaciones")
            .insert(payload);

          if (errInsert) {
            const detalle = [errInsert.message, errInsert.details, errInsert.hint]
              .filter(Boolean)
              .join(" | ");
            message.error("Error guardando nota de tema: " + detalle);
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
    [clasesPensum, message]
  );

  const promedioActividadPorTema = useMemo(() => {
    const map = new Map<string, number>();
    clasesPensum.forEach((tema: any) => {
      const temaId = String(tema.id);
      const notas = estudiantes
        .map((est) => calificacionesTema[temaId]?.[String(est.id)] ?? null)
        .filter((nota): nota is number => typeof nota === "number" && !Number.isNaN(nota));

      if (!notas.length) return;
      map.set(temaId, Number((notas.reduce((sum, nota) => sum + nota, 0) / notas.length).toFixed(1)));
    });
    return map;
  }, [calificacionesTema, clasesPensum, estudiantes]);

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

  useEffect(() => {
    const section = String(searchParams?.get("section") || "").toLowerCase().trim();
    if (!section) return;

    const tabBySection: Record<string, string> = {
      attendance: "3",
      grades: "5",
      materials: "2",
      default: "1",
    };

    const targetTab = tabBySection[section];
    if (targetTab) {
      setActiveTab(targetTab);
    }
  }, [searchParams]);

  // Memoized columns to avoid re-creation on every render
  const columnasSesiones = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        width: 120,
        render: (fecha: string) => dayjs(fecha).format("DD MMM YYYY"),
        sorter: (a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
      },
      {
        title: "Tema",
        dataIndex: "tema_visto",
        ellipsis: true,
        width: isMobile ? 200 : undefined,
        render: (tema: string) => (tema ? <Tag>{tema}</Tag> : <Text type="secondary">-</Text>),
      },
      {
        title: "Horas Dictadas",
        dataIndex: "horas_dictadas",
        width: 140,
        align: "center" as const,
        render: (horas: number) => <Tag color="blue">{horas}h</Tag>,
      },
      {
        title: "Observaciones",
        dataIndex: "observaciones",
        responsive: ["md"] as Breakpoint[],
        ellipsis: true,
        render: (obs: string) => (obs ? <Text type="secondary">{obs}</Text> : <Text type="secondary">-</Text>),
      },
    ],
    [isMobile]
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

  useEffect(() => {
    if (!clasesPensum.length) {
      setTemaSeleccionadoId(null);
      return;
    }

    const existeTemaSeleccionado = clasesPensum.some((tema: any) => String(tema.id) === String(temaSeleccionadoId || ""));
    if (!existeTemaSeleccionado) {
      setTemaSeleccionadoId(null);
    }
  }, [clasesPensum, temaSeleccionadoId]);

  const resultadosQuizResumen = useMemo(() => {
    const ordenados = [...(resultadosQuiz || [])].sort((a: any, b: any) => {
      const fechaA = a?.enviado_at ? new Date(a.enviado_at).getTime() : 0;
      const fechaB = b?.enviado_at ? new Date(b.enviado_at).getTime() : 0;
      return fechaB - fechaA;
    });

    const unicos = new Map<string, any>();
    ordenados.forEach((item: any) => {
      const key = `${String(item?.matricula_id || "")}-${String(item?.quiz_id || "")}`;
      if (!unicos.has(key)) {
        unicos.set(key, item);
      }
    });

    return Array.from(unicos.values());
  }, [resultadosQuiz]);

  const promedioQuizPorTema = useMemo(() => {
    const bucket = new Map<string, number[]>();

    (resultadosQuizResumen || []).forEach((item: any) => {
      const quizId = String(item?.quiz_id || "");
      if (!quizId) return;

      const quiz = (quizzesClase || []).find((q: any) => String(q?.id || "") === quizId);
      const temaId = String(quiz?.pensum_curso_id || "");
      const nota = Number(item?.calificacion ?? item?.nota);
      if (!temaId || !Number.isFinite(nota)) return;

      const current = bucket.get(temaId) ?? [];
      current.push(nota);
      bucket.set(temaId, current);
    });

    const promedioMap = new Map<string, number>();
    bucket.forEach((notas, temaId) => {
      if (!notas.length) return;
      const promedio = notas.reduce((sum, value) => sum + value, 0) / notas.length;
      promedioMap.set(temaId, Number(promedio.toFixed(1)));
    });

    return promedioMap;
  }, [quizzesClase, resultadosQuizResumen]);

  const quizzesOrdenadosPorPensum = useMemo(() => {
    const list = Array.isArray(quizzesClase) ? [...quizzesClase] : [];
    return list.sort((a: any, b: any) => {
      const temaA = String(a?.pensum_curso_id || "");
      const temaB = String(b?.pensum_curso_id || "");
      const ordenA = ordenTemaPorId.get(temaA) ?? 9999;
      const ordenB = ordenTemaPorId.get(temaB) ?? 9999;
      if (ordenA !== ordenB) return ordenA - ordenB;
      const nombreA = String(nombreTemaPorId.get(temaA) || a?.titulo || "Quiz");
      const nombreB = String(nombreTemaPorId.get(temaB) || b?.titulo || "Quiz");
      return nombreA.localeCompare(nombreB);
    });
  }, [nombreTemaPorId, ordenTemaPorId, quizzesClase]);

  const pendientesActividad = useMemo(() => {
    if (!temaSeleccionadoId) return [] as Student[];
    return estudiantes.filter((est) => {
      if (est.estado === "pendiente_pago") return false;
      const nota = calificacionesTema[String(temaSeleccionadoId)]?.[String(est.id)] ?? null;
      return nota == null || Number.isNaN(nota);
    });
  }, [calificacionesTema, estudiantes, temaSeleccionadoId]);

  const quizSeleccionado = useMemo(() => {
    if (!quizProfesorSeleccionadoId) return null;
    return quizzesOrdenadosPorPensum.find((quiz: any) => String(quiz?.id) === String(quizProfesorSeleccionadoId)) || null;
  }, [quizProfesorSeleccionadoId, quizzesOrdenadosPorPensum]);

  const pendientesQuiz = useMemo(() => {
    if (!quizSeleccionado) return [] as Student[];
    const quizId = String(quizSeleccionado.id || "");
    const presentados = new Set(
      (resultadosQuizResumen || [])
        .filter((item: any) => String(item?.quiz_id || "") === quizId)
        .map((item: any) => String(item?.matricula_id || ""))
    );

    return estudiantes.filter((est) => est.estado !== "pendiente_pago" && !presentados.has(String(est.id)));
  }, [estudiantes, quizSeleccionado, resultadosQuizResumen]);

  const temaSeleccionado = useMemo(() => {
    if (!temaSeleccionadoId) return null;
    return clasesPensum.find((tema: any) => String(tema.id) === String(temaSeleccionadoId)) || null;
  }, [clasesPensum, temaSeleccionadoId]);

  const resumenCalificacionTema = useMemo(() => {
    if (!temaSeleccionadoId) {
      return { calificadas: 0, pendientes: estudiantes.length, promedio: 0 };
    }

    const notas = estudiantes
      .map((est) => calificacionesTema[String(temaSeleccionadoId)]?.[String(est.id)] ?? null)
      .filter((nota): nota is number => typeof nota === "number" && !Number.isNaN(nota));

    const calificadas = notas.length;
    const pendientes = Math.max(estudiantes.length - calificadas, 0);
    const promedio = calificadas > 0
      ? Number((notas.reduce((sum, nota) => sum + nota, 0) / calificadas).toFixed(2))
      : 0;

    return { calificadas, pendientes, promedio };
  }, [calificacionesTema, estudiantes, temaSeleccionadoId]);

  const abrirModalActividad = useCallback((soloPendientes: boolean = false, estudianteId?: string | null) => {
    const primerTema = clasesPensum[0];
    if (!primerTema) {
      message.warning("No hay clases disponibles para calificar.");
      return;
    }

    if (!temaSeleccionadoId) {
      setTemaSeleccionadoId(String(primerTema.id));
    }
    setSoloPendientesActividad(soloPendientes);
    setEstudianteFocoActividadId(estudianteId ? String(estudianteId) : null);
    setModalActividadVisible(true);
  }, [clasesPensum, message, temaSeleccionadoId]);

  const estudiantesModalActividad = useMemo(() => {
    if (!temaSeleccionadoId) return estudiantes;
    const base = soloPendientesActividad ? pendientesActividad : estudiantes;
    if (!estudianteFocoActividadId) return base;
    return base.filter((est) => String(est.id) === String(estudianteFocoActividadId));
  }, [estudiantes, pendientesActividad, soloPendientesActividad, temaSeleccionadoId, estudianteFocoActividadId]);

  const abrirQuizProfesor = useCallback(
    async (quiz: any) => {
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

        setQuizProfesorActivo(quiz);
        setQuizProfesorPreguntas(preguntasData);
        setQuizProfesorRespuestas({});
        setQuizProfesorModalOpen(true);
      } catch (error: any) {
        console.error(error);
        message.error("No se pudo abrir el quiz del profesor");
      }
    },
    [message]
  );

  const enviarQuizProfesor = useCallback(async () => {
    if (!quizProfesorActivo) return;

    const respuestas = (quizProfesorPreguntas || []).map((pregunta: any) => ({
      pregunta_id: pregunta.id,
      respuesta: quizProfesorRespuestas[String(pregunta.id)] || "",
    }));

    const sinResponder = respuestas.filter((r) => !r.respuesta).length;
    if (sinResponder > 0) {
      message.warning(`Debes responder todas las preguntas. Faltan ${sinResponder}.`);
      return;
    }

    try {
      setQuizProfesorSaving(true);
      const { data: preguntasConRespuesta, error } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .select("id, respuesta_correcta")
        .eq("quiz_id", quizProfesorActivo.id)
        .eq("activo", true);

      if (error) throw error;

      const preguntaPorId = new Map<string, any>();
      (quizProfesorPreguntas || []).forEach((pregunta: any) => {
        preguntaPorId.set(String(pregunta.id), pregunta);
      });

      const correctaPorPregunta = new Map<string, string>();
      (preguntasConRespuesta || []).forEach((pregunta: any) => {
        const preguntaBase = preguntaPorId.get(String(pregunta.id));
        correctaPorPregunta.set(String(pregunta.id), resolverClaveOpcionQuiz(preguntaBase, pregunta.respuesta_correcta));
      });

      let correctas = 0;
      const detalleRespuestas = respuestas
        .map((respuesta: any) => {
          const pregunta = preguntaPorId.get(String(respuesta.pregunta_id));
          const correcta = resolverClaveOpcionQuiz(pregunta, correctaPorPregunta.get(String(respuesta.pregunta_id)) || "");
          const marcada = resolverClaveOpcionQuiz(pregunta, respuesta.respuesta);
          const esCorrecta = Boolean(correcta && marcada && marcada === correcta);
          if (esCorrecta) correctas += 1;

          return {
            preguntaId: String(respuesta.pregunta_id || ""),
            orden: Number(pregunta?.orden || 0),
            pregunta: String(pregunta?.pregunta || "Pregunta"),
            respuestaMarcada: obtenerTextoOpcionQuiz(pregunta, marcada),
            respuestaCorrecta: obtenerTextoOpcionQuiz(pregunta, correcta),
            esCorrecta,
          };
        })
        .sort((a: any, b: any) => a.orden - b.orden);

      const total = respuestas.length || 1;
      const porcentaje = Number(((correctas / total) * 100).toFixed(2));
      const calificacion = Number(((correctas / total) * 5).toFixed(2));

      setQuizProfesorResultado({
        quizId: String(quizProfesorActivo.id),
        titulo: String(quizProfesorActivo.titulo || "Quiz"),
        calificacion,
        porcentaje,
        correctas,
        totalPreguntas: total,
        respuestas: detalleRespuestas,
      });
      setQuizProfesorModalOpen(false);
      message.success("Quiz del profesor enviado. Ya puedes revisar tus respuestas.");
    } catch (error: any) {
      console.error(error);
      message.error("No se pudo evaluar el quiz del profesor");
    } finally {
      setQuizProfesorSaving(false);
    }
  }, [message, quizProfesorActivo, quizProfesorPreguntas, quizProfesorRespuestas]);

  useEffect(() => {
    const firstQuizId = quizzesClase?.[0]?.id;
    if (!firstQuizId) {
      setQuizProfesorSeleccionadoId(null);
      return;
    }

    if (!quizProfesorSeleccionadoId || !quizzesClase.some((quiz: any) => String(quiz.id) === String(quizProfesorSeleccionadoId))) {
      setQuizProfesorSeleccionadoId(String(firstQuizId));
    }
  }, [quizzesClase, quizProfesorSeleccionadoId]);

  const cargarDatos = useCallback(async (id: string) => {
    setLoading(true);
    try {
      let matriculaIdsCurso: number[] = [];
      let califDataCurso: any[] = [];
      const cursoIdNumerico = parseInt(id);

      // Curso
      const { data: cursoData, error: errorCurso } = await supabaseBrowserClient
        .from("cursos")
        .select("*")
        .eq("id", cursoIdNumerico)
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
          .select("nombre_completo, valor_hora")
          .eq("id", cursoData.profesor_id)
          .single();
        cursoConProfesor = { ...cursoData, perfiles: profesorData };
      }
      
      setCurso(cursoConProfesor);

      const { data: sesionesParaAsistencia } = await supabaseBrowserClient
        .from("sesiones_clase")
        .select("fecha, tema_visto")
        .eq("curso_id", cursoIdNumerico);

      const temaPorFecha = new Map<string, string>();
      (sesionesParaAsistencia || []).forEach((sesion: any) => {
        const fecha = String(sesion?.fecha || "").trim();
        if (!fecha || temaPorFecha.has(fecha)) return;
        temaPorFecha.set(fecha, String(sesion?.tema_visto || "").trim());
      });

      const esEstadoFalta = (estado?: string | null) => {
        const raw = String(estado || "").trim().toLowerCase();
        return raw === "ausente" || raw === "falta" || raw === "no_asiste" || raw === "no_asistio";
      };

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
              .select("estado, fecha, observaciones")
              .eq("matricula_id", matricula.id);

            const totalClases = asistencias?.length || 0;
            const presentes = asistencias?.filter(a => a.estado === "presente").length || 0;
            const porcentaje = totalClases > 0 ? (presentes / totalClases) * 100 : 0;
            const faltasDetalle = (asistencias || [])
              .filter((a: any) => esEstadoFalta(a?.estado))
              .map((a: any) => {
                const fecha = a?.fecha ? String(a.fecha) : null;
                const temaSesion = fecha ? String(temaPorFecha.get(fecha) || "").trim() : "";
                const tema = temaSesion || String(a?.observaciones || "").trim() || "Clase sin tema";
                return { fecha, tema };
              });

            return {
              id: matricula.id,
              nombre_completo: estudiante?.nombre_completo || "Sin nombre",
              email: estudiante?.email || "-",
              identificacion: estudiante?.identificacion || "-",
              estado: matricula.estado,
              nota_final: matricula.nota_final,
              asistencia_porcentaje: Math.round(porcentaje),
              totalClases,
              presentes,
              totalFaltas: faltasDetalle.length,
              faltasDetalle,
            };
          })
        );
        // Cargar pagos pendientes vencidos para detectar mora
        const matriculaIdsTemp = estudiantesConAsistencia.map((e) => e.id);
        let moraSet = new Set<number>();
        if (matriculaIdsTemp.length > 0) {
          const hoy: string = new Date().toISOString().slice(0, 10);
          const { data: pagosData } = await supabaseBrowserClient
            .from("pagos")
            .select("matricula_id, estado, fecha_vencimiento")
            .in("matricula_id", matriculaIdsTemp)
            .eq("estado", "pendiente");
          (pagosData || []).forEach((p: any) => {
            if (p.fecha_vencimiento && p.fecha_vencimiento < hoy) {
              moraSet.add(Number(p.matricula_id));
            }
          });
        }

        const estudiantesConMora = estudiantesConAsistencia.map((e) => ({
          ...e,
          enMora: moraSet.has(e.id),
        }));

        setEstudiantes(estudiantesConMora);
        const notasIniciales: Record<string, number | null> = {};
        const estadosIniciales: Record<string, string> = {};
        estudiantesConMora.forEach((est) => {
          notasIniciales[String(est.id)] = est.nota_final ?? null;
          estadosIniciales[String(est.id)] = est.estado;
        });
        setNotaEdicion(notasIniciales);
        setEstadoEdicion(estadosIniciales);

        const matriculaIds = estudiantesConMora.map((e) => e.id);
        matriculaIdsCurso = matriculaIds;
        if (matriculaIds.length > 0) {
          const { data: califData } = await supabaseBrowserClient
            .from("calificaciones")
            .select("matricula_id, tema_id, concepto, nota, calificacion, tipo_evaluacion, fecha_evaluacion")
            .in("matricula_id", matriculaIds)
            .in("tipo_evaluacion", ["actividad", "tema"])
            .order("fecha_evaluacion", { ascending: false });
          califDataCurso = califData || [];
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

        const temasPorNombreLocal = new Map<string, string>();
        (temasData || []).forEach((ciclo: any) => {
          const temasCiclo = Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [];
          temasCiclo.forEach((tema: any) => {
            const nombre = tema?.nombre_curso || tema?.titulo || "";
            const key = normalizarTema(nombre);
            if (key) temasPorNombreLocal.set(key, String(tema.id));
          });
        });

        const mapa: Record<string, Record<string, number | null>> = {};
        (califDataCurso || []).forEach((c: any) => {
          const tipo = String(c?.tipo_evaluacion || "").toLowerCase();
          if (tipo && tipo !== "actividad" && tipo !== "tema") return;
          const temaIdDirecto = String(c?.tema_id || "").trim();
          const concepto = String(c?.concepto || "").trim();
          const nombreDesdeConcepto = concepto.replace(/^actividad\s*:\s*/i, "").trim();
          const temaIdPorNombre = temasPorNombreLocal.get(normalizarTema(nombreDesdeConcepto));
          const temaKey = temaIdDirecto || String(temaIdPorNombre || "").trim();
          const matKey = String(c.matricula_id);
          const valor = c.calificacion ?? c.nota ?? null;
          if (!temaKey || temaKey === "undefined" || temaKey === "null") return;
          if (!mapa[temaKey]) mapa[temaKey] = {};
          if (typeof mapa[temaKey][matKey] === "number") return;
          mapa[temaKey][matKey] = valor;
        });
        setCalificacionesTema(mapa);

        setTemas(temasData || []);
        setMateriales(materialesData || []);
        setMaterialesClase(materialesClaseData || []);

        const { data: quizzesData } = await supabaseBrowserClient
          .from("quizzes_clase")
          .select("id, programa_id, pensum_curso_id, titulo, total_preguntas, activo, publicado")
          .eq("programa_id", Number(cursoConProfesor.programa_id))
          .order("created_at", { ascending: false });

        setQuizzesClase(quizzesData || []);

        if (matriculaIdsCurso.length > 0 && (quizzesData || []).length > 0) {
          const quizIds = (quizzesData || []).map((quiz: any) => quiz.id);
          const { data: intentosData } = await supabaseBrowserClient
            .from("quiz_intentos_clase")
            .select("id, quiz_id, matricula_id, respuestas_correctas, total_preguntas, calificacion, enviado_at")
            .in("quiz_id", quizIds)
            .in("matricula_id", matriculaIdsCurso)
            .order("enviado_at", { ascending: false });

          setResultadosQuiz(intentosData || []);
        } else {
          setResultadosQuiz([]);
        }
      } else {
        setCalificacionesTema({});
        setTemas([]);
        setMateriales([]);
        setMaterialesClase([]);
        setQuizzesClase([]);
        setResultadosQuiz([]);
      }

      // Sesiones de clase
      const { data: sesionesData } = await supabaseBrowserClient
        .from("sesiones_clase")
        .select("*")
        .eq("curso_id", cursoIdNumerico)
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

  const columnasEstudiantes = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "nombre_completo",
        ellipsis: true,
        width: isMobile ? 180 : 260,
        render: (text: string, record: Student) => (
          <Space size={6} align="center">
            <Text strong style={record.enMora ? { color: "#cf1322" } : undefined}>{text}</Text>
            {record.enMora && (
              <Tag
                color="error"
                style={{
                  fontWeight: 800,
                  fontSize: 11,
                  padding: "0 6px",
                  borderRadius: 6,
                  lineHeight: "20px",
                  animation: "none",
                }}
              >
                💳 MORA
              </Tag>
            )}
          </Space>
        ),
      },
      { title: "Identificación", dataIndex: "identificacion", width: 150, responsive: ["md"] as Breakpoint[] },
      { title: "Email", dataIndex: "email", ellipsis: true, responsive: ["lg"] as Breakpoint[] },
      {
        title: "Estado",
        dataIndex: "estado",
        responsive: ["sm"] as Breakpoint[],
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
        render: (porcentaje: number, record: Student) => {
          let color = "success";
          if (porcentaje < 80) color = "warning";
          if (porcentaje < 70) color = "error";

          const faltas = record?.faltasDetalle || [];
          const totalFaltas = Number(record?.totalFaltas || 0);

          return (
            <Space direction="vertical" size={2}>
              <Tag color={color}>{porcentaje}%</Tag>
              {totalFaltas > 0 ? (
                <Popover
                  trigger="click"
                  title={`Faltas (${totalFaltas})`}
                  content={
                    <Space direction="vertical" size={4} style={{ maxWidth: 320 }}>
                      {faltas.map((falta, index) => (
                        <Text key={`${String(falta.fecha || "sin-fecha")}-${index}`} style={{ fontSize: 12 }}>
                          {`${falta.fecha ? dayjs(falta.fecha).format("DD/MM/YYYY") : "Sin fecha"} · ${falta.tema}`}
                        </Text>
                      ))}
                    </Space>
                  }
                >
                  <Button type="link" size="small" style={{ padding: 0, height: "auto" }}>
                    {`Ver faltas (${totalFaltas})`}
                  </Button>
                </Popover>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>Sin faltas</Text>
              )}
            </Space>
          );
        },
        width: 100,
        sorter: (a: any, b: any) => a.asistencia_porcentaje - b.asistencia_porcentaje,
      },
    ],
    [isMobile]
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
      okText: "Ocultar grupo",
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
      },
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

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <Card style={{ borderRadius: 14 }}>
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Skeleton active title={{ width: "42%" }} paragraph={{ rows: 1 }} />
            <Row gutter={[12, 12]}>
              {[1, 2, 3].map((item) => (
                <Col key={item} xs={24} sm={8}>
                  <Card style={{ borderRadius: 10 }}>
                    <Skeleton active title={false} paragraph={{ rows: 2 }} />
                  </Card>
                </Col>
              ))}
            </Row>
            <Skeleton active title={{ width: "30%" }} paragraph={{ rows: 7 }} />
          </Space>
        </Card>
      </div>
    );
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
  const estudiantesEnMora = estudiantes.filter((e) => e.enMora).length;
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
  const totalTemas = clasesPensum.length;
  const temasConActividad = promedioActividadPorTema.size;
  const temasSinActividad = Math.max(totalTemas - temasConActividad, 0);
  const quizzesActivosPublicados = (quizzesClase || []).filter((quiz: any) => quiz?.activo === true && quiz?.publicado === true).length;
  const quizzesNoDisponibles = Math.max((quizzesClase || []).length - quizzesActivosPublicados, 0);
  const hoy = dayjs();
  const sesionesMesActual = (sesiones || []).filter((sesion: any) => {
    if (!sesion?.fecha) return false;
    const fechaSesion = dayjs(sesion.fecha);
    return fechaSesion.isValid() && fechaSesion.isSame(hoy, "month") && fechaSesion.isSame(hoy, "year");
  });
  const horasPrimeraQuincena = Number(
    sesionesMesActual
      .filter((sesion: any) => dayjs(sesion?.fecha).date() <= 15)
      .reduce((acc: number, sesion: any) => acc + Number(sesion?.horas_dictadas || 0), 0)
      .toFixed(1)
  );
  const horasSegundaQuincena = Number(
    sesionesMesActual
      .filter((sesion: any) => dayjs(sesion?.fecha).date() > 15)
      .reduce((acc: number, sesion: any) => acc + Number(sesion?.horas_dictadas || 0), 0)
      .toFixed(1)
  );
  const horasMesActual = Number((horasPrimeraQuincena + horasSegundaQuincena).toFixed(1));
  const primeraQuincenaActiva = hoy.date() <= 15;
  const horasQuincenaActual = primeraQuincenaActiva ? horasPrimeraQuincena : horasSegundaQuincena;
  const etiquetaQuincenaActual = primeraQuincenaActiva ? "Horas 1-15" : "Horas 16-fin";
  const estudiantesEvaluables = estudiantes.filter((est) => est.estado !== "pendiente_pago");
  const totalEstudiantesEvaluables = estudiantesEvaluables.length;

  const estudiantesRezagados = estudiantesEvaluables
    .map((est) => {
      const pendientesActividadEstudiante = clasesPensum.reduce((count, tema: any) => {
        const temaId = String(tema?.id || "");
        if (!temaId) return count;
        const nota = calificacionesTema[temaId]?.[String(est.id)] ?? null;
        return nota == null || Number.isNaN(nota) ? count + 1 : count;
      }, 0);

      const notaFinal = typeof est.nota_final === "number" ? est.nota_final : null;
      const riesgoNota = notaFinal !== null && notaFinal < 3.8;
      const riesgoAsistencia = est.asistencia_porcentaje < (curso.porcentaje_minimo || 80);
      const riesgoPendientes = pendientesActividadEstudiante >= 2;

      const scoreRiesgo = (riesgoAsistencia ? 2 : 0) + (riesgoNota ? 2 : 0) + (riesgoPendientes ? 1 : 0);

      return {
        ...est,
        pendientesActividadEstudiante,
        scoreRiesgo,
      };
    })
    .filter((est) => est.scoreRiesgo > 0)
    .sort((a, b) => {
      if (b.scoreRiesgo !== a.scoreRiesgo) return b.scoreRiesgo - a.scoreRiesgo;
      if (a.asistencia_porcentaje !== b.asistencia_porcentaje) return a.asistencia_porcentaje - b.asistencia_porcentaje;
      return b.pendientesActividadEstudiante - a.pendientesActividadEstudiante;
    })
    .slice(0, 6);

  const temasCriticos = clasesPensum
    .map((tema: any) => {
      const temaId = String(tema?.id || "");
      const nombreTema = formatearNombreClase(tema);
      const notasTema = estudiantesEvaluables
        .map((est) => calificacionesTema[temaId]?.[String(est.id)] ?? null)
        .filter((nota): nota is number => typeof nota === "number" && !Number.isNaN(nota));

      const promedio = notasTema.length
        ? Number((notasTema.reduce((sum, nota) => sum + nota, 0) / notasTema.length).toFixed(2))
        : null;
      const cobertura = totalEstudiantesEvaluables > 0
        ? Number(((notasTema.length / totalEstudiantesEvaluables) * 100).toFixed(1))
        : 0;

      const scoreRiesgo = (promedio !== null && promedio < 3.8 ? 2 : 0) + (cobertura < 70 ? 1 : 0);

      return {
        temaId,
        nombreTema,
        promedio,
        cobertura,
        scoreRiesgo,
      };
    })
    .filter((tema) => tema.scoreRiesgo > 0)
    .sort((a, b) => {
      if (b.scoreRiesgo !== a.scoreRiesgo) return b.scoreRiesgo - a.scoreRiesgo;
      const promedioA = a.promedio ?? 0;
      const promedioB = b.promedio ?? 0;
      if (promedioA !== promedioB) return promedioA - promedioB;
      return a.cobertura - b.cobertura;
    })
    .slice(0, 6);

  const quizzesAtencion = quizzesOrdenadosPorPensum
    .map((quiz: any) => {
      const quizId = String(quiz?.id || "");
      const intentosQuiz = (resultadosQuizResumen || []).filter((item: any) => String(item?.quiz_id || "") === quizId);
      const promedio = intentosQuiz.length
        ? Number((intentosQuiz.reduce((sum: number, item: any) => sum + Number(item?.calificacion || 0), 0) / intentosQuiz.length).toFixed(2))
        : null;
      const participacion = totalEstudiantesEvaluables > 0
        ? Number(((intentosQuiz.length / totalEstudiantesEvaluables) * 100).toFixed(1))
        : 0;

      const temaId = String(quiz?.pensum_curso_id || "");
      const nombreTema = nombreTemaPorId.get(temaId) || String(quiz?.titulo || "Quiz");
      const ordenTema = ordenTemaPorId.get(temaId);
      const nombre = ordenTema ? `${ordenTema}. ${nombreTema}` : nombreTema;

      const scoreRiesgo = (promedio !== null && promedio < 3.8 ? 2 : 0) + (participacion < 70 ? 1 : 0);

      return {
        quizId,
        nombre,
        promedio,
        participacion,
        scoreRiesgo,
      };
    })
    .filter((quiz) => quiz.scoreRiesgo > 0)
    .sort((a, b) => {
      if (b.scoreRiesgo !== a.scoreRiesgo) return b.scoreRiesgo - a.scoreRiesgo;
      const promedioA = a.promedio ?? 0;
      const promedioB = b.promedio ?? 0;
      if (promedioA !== promedioB) return promedioA - promedioB;
      return a.participacion - b.participacion;
    })
    .slice(0, 6);

  const libroCalificacionesUnificado = (() => {
    const minAsistencia = Number(curso?.porcentaje_minimo || 80);

    const ultimosIntentosPorEstudiante = new Map<string, any>();
    (resultadosQuizResumen || []).forEach((intento: any) => {
      const key = String(intento?.matricula_id || "");
      const prev = ultimosIntentosPorEstudiante.get(key);
      const fechaPrev = prev?.enviado_at ? new Date(prev.enviado_at).getTime() : 0;
      const fechaActual = intento?.enviado_at ? new Date(intento.enviado_at).getTime() : 0;
      if (!prev || fechaActual >= fechaPrev) {
        ultimosIntentosPorEstudiante.set(key, intento);
      }
    });

    return (estudiantes || []).map((est: Student) => {
      const estudianteId = String(est.id);

      const notasActividad = Object.values(calificacionesTema || {})
        .map((temaMap: any) => temaMap?.[estudianteId])
        .filter((nota): nota is number => typeof nota === "number" && !Number.isNaN(nota));

      const actividadPromedio = notasActividad.length
        ? Number((notasActividad.reduce((sum, nota) => sum + nota, 0) / notasActividad.length).toFixed(2))
        : null;

      const actividadClaseSeleccionada = temaSeleccionadoId
        ? calificacionesTema[String(temaSeleccionadoId)]?.[estudianteId] ?? null
        : null;

      const intentoQuiz = quizProfesorSeleccionadoId
        ? (resultadosQuizResumen || []).find(
            (intento: any) =>
              String(intento?.matricula_id || "") === estudianteId &&
              String(intento?.quiz_id || "") === String(quizProfesorSeleccionadoId)
          )
        : ultimosIntentosPorEstudiante.get(estudianteId) || null;

      const quizNota = intentoQuiz ? Number(intentoQuiz?.calificacion || 0) : null;

      const riesgoAsistencia = Number(est.asistencia_porcentaje || 0) < minAsistencia;
      const riesgoActividad = actividadPromedio !== null && actividadPromedio < 3.8;
      const riesgoQuiz = quizNota !== null && quizNota < 3.8;
      const scoreRiesgo = Number(riesgoAsistencia) + Number(riesgoActividad) + Number(riesgoQuiz);

      return {
        key: estudianteId,
        estudiante: est.nombre_completo,
        estado: est.estado,
        asistencia: Number(est.asistencia_porcentaje || 0),
        actividadPromedio,
        actividadClaseSeleccionada,
        quizNota,
        scoreRiesgo,
        riesgoAsistencia,
        riesgoActividad,
        riesgoQuiz,
      };
    });
  })();

  const resumenLibroRiesgo = (() => {
    const total = libroCalificacionesUnificado.length;
    const alto = libroCalificacionesUnificado.filter((item) => item.scoreRiesgo >= 2).length;
    const medio = libroCalificacionesUnificado.filter((item) => item.scoreRiesgo === 1).length;
    const bajo = Math.max(total - alto - medio, 0);
    return { total, alto, medio, bajo };
  })();

  const columnasLibroUnificado = [
      {
        title: "Estudiante",
        dataIndex: "estudiante",
        key: "estudiante",
        render: (value: string, record: any) => (
          <Space direction="vertical" size={0}>
            <Text strong>{value}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {`Estado: ${String(record?.estado || "en curso").toUpperCase()}`}
            </Text>
          </Space>
        ),
      },
      {
        title: "Asistencia",
        dataIndex: "asistencia",
        key: "asistencia",
        width: 120,
        align: "center" as const,
        render: (value: number) => {
          const color = value < Number(curso?.porcentaje_minimo || 80) ? "error" : value < 85 ? "warning" : "success";
          return <Tag color={color}>{`${value}%`}</Tag>;
        },
      },
      {
        title: temaSeleccionadoId ? "Actividad (clase)" : "Actividad (prom)",
        key: "actividad",
        width: 140,
        align: "center" as const,
        render: (_: any, record: any) => {
          const value = temaSeleccionadoId ? record.actividadClaseSeleccionada : record.actividadPromedio;
          if (value == null) return <Text type="secondary">Pendiente</Text>;
          const color = Number(value) < 3 ? "error" : Number(value) < 3.8 ? "warning" : "green";
          return <Tag color={color}>{`${Number(value).toFixed(1)}/5`}</Tag>;
        },
      },
      {
        title: quizProfesorSeleccionadoId ? "Quiz (selecc.)" : "Quiz (último)",
        dataIndex: "quizNota",
        key: "quizNota",
        width: 130,
        align: "center" as const,
        render: (value: number | null) => {
          if (value == null) return <Text type="secondary">Sin intento</Text>;
          const color = Number(value) < 3 ? "error" : Number(value) < 3.8 ? "warning" : "green";
          return <Tag color={color}>{`${Number(value).toFixed(1)}/5`}</Tag>;
        },
      },
      {
        title: "Riesgo",
        key: "riesgo",
        width: 170,
        render: (_: any, record: any) => {
          if (record.scoreRiesgo >= 2) return <Tag color="error">Alto</Tag>;
          if (record.scoreRiesgo === 1) return <Tag color="warning">Medio</Tag>;
          return <Tag color="success">Bajo</Tag>;
        },
      },
      {
        title: "Alertas",
        key: "alertas",
        render: (_: any, record: any) => {
          const alerts: string[] = [];
          if (record.riesgoAsistencia) alerts.push("Asistencia baja");
          if (record.riesgoActividad) alerts.push("Actividad baja");
          if (record.riesgoQuiz) alerts.push("Quiz bajo");
          if (!alerts.length) return <Text type="secondary">Sin alertas</Text>;
          return (
            <Space wrap>
              {alerts.map((alert) => (
                <Tag key={`${record.key}-${alert}`} color="red">
                  {alert}
                </Tag>
              ))}
            </Space>
          );
        },
      },
      {
        title: "Acciones",
        key: "acciones",
        width: 230,
        render: (_: any, record: any) => (
          <Space wrap>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                if (!temaSeleccionadoId && clasesPensum.length > 0) {
                  setTemaSeleccionadoId(String(clasesPensum[0]?.id || ""));
                }
                setActiveTab("5");
                abrirModalActividad(true, String(record.key));
              }}
            >
              Calificar
            </Button>
            <Button
              size="small"
              onClick={() => {
                setActiveTab("4");
              }}
            >
              Ver estudiante
            </Button>
            <Button
              size="small"
              onClick={() =>
                router.push(
                  `/asistencias/create?curso_id=${cursoId}&curso_nombre=${encodeURIComponent(construirNombreGrupo(curso))}`
                )
              }
            >
              Asistencia
            </Button>
          </Space>
        ),
      },
    ];

  return (
    <div style={{ padding: 24 }}>
      {/* ENCABEZADO - OFICINA DEL PROFESOR */}
      <div
        style={{
          marginBottom: 28,
          background: "linear-gradient(135deg, #4057d6 0%, #6d3fb0 100%)",
          color: "white",
          padding: 28,
          borderRadius: 14,
          boxShadow: "0 14px 30px -18px rgba(44, 52, 124, 0.7)",
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={20}>
          <Space wrap size={20} style={{ alignItems: "center" }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push(returnTo)}
              style={{
                background: "rgba(15, 23, 42, 0.28)",
                borderColor: "rgba(255,255,255,0.35)",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Volver
            </Button>
            <Title level={2} style={{ margin: 0, color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
              {construirNombreGrupo(curso)}
            </Title>
            <Space wrap size={20} style={{ marginTop: 4 }}>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => router.push(`/asistencias/create?curso_id=${cursoId}&curso_nombre=${encodeURIComponent(construirNombreGrupo(curso))}`)}
                style={{ fontWeight: 600 }}
              >
                Llamar Lista
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
          {/* RESUMEN RÁPIDO DEL CURSO */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={6}>
              <Card
                size="small"
                style={{ background: "rgba(15, 23, 42, 0.22)", borderColor: "rgba(255,255,255,0.22)" }}
                styles={{ body: { padding: 14 } }}
              >
                <Statistic
                  title={<span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Estudiantes</span>}
                  value={`${estudiantesActivos}/${totalEstudiantes}`}
                  suffix="activos"
                  valueStyle={{ color: "#fff", fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card
                size="small"
                style={{ background: "rgba(15, 23, 42, 0.22)", borderColor: "rgba(255,255,255,0.22)" }}
                styles={{ body: { padding: 14 } }}
              >
                <Statistic
                  title={<span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Promedio asistencia</span>}
                  value={promedioAsistencia}
                  suffix="%"
                  valueStyle={{ color: "#fff", fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card
                size="small"
                style={{ background: "rgba(15, 23, 42, 0.22)", borderColor: "rgba(255,255,255,0.22)" }}
                styles={{ body: { padding: 14 } }}
              >
                <Statistic
                  title={<span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Promedio nota</span>}
                  value={promedioNota}
                  precision={1}
                  suffix="/5"
                  valueStyle={{ color: "#fff", fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card
                size="small"
                style={{ background: "rgba(15, 23, 42, 0.22)", borderColor: "rgba(255,255,255,0.22)" }}
                styles={{ body: { padding: 14 } }}
              >
                <Statistic
                  title={<span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>Cupos</span>}
                  value={cuposOcupados}
                  suffix={cuposTotales ? `/ ${cuposTotales}` : ""}
                  valueStyle={{ color: "#fff", fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            style={{ marginBottom: 16, background: "rgba(15, 23, 42, 0.2)", borderColor: "rgba(255,255,255,0.22)" }}
          >
            <Space direction="vertical">
              <Text style={{ color: "#ffffff" }}><strong>Horario:</strong> {curso.dias_semana || "-"} {curso.hora_inicio && `• ${dayjs(curso.hora_inicio, 'HH:mm:ss').format('h:mm A')}`} {curso.hora_fin && ` - ${dayjs(curso.hora_fin, 'HH:mm:ss').format('h:mm A')}`}</Text>
              <Text style={{ color: "#f8fafc" }}><strong>Fecha de inicio:</strong> {curso.fecha_inicio ? dayjs(curso.fecha_inicio).format('DD MMM YYYY') : "-"}</Text>
              <Text style={{ color: "#f8fafc" }}><strong>Fecha de fin:</strong> {curso.fecha_fin ? dayjs(curso.fecha_fin).format('DD MMM YYYY') : "No definida"}</Text>
            </Space>
          </Card>
            <Text style={{ color: "rgba(255,255,255,0.94)", fontSize: 15 }}>
              👨‍🏫 Profesor: <strong>{curso.perfiles?.nombre_completo || "Sin asignar"}</strong>
            </Text>
          </div>
        </Space>
      </div>

      {/* ESTADÍSTICAS OPERATIVAS */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="En Riesgo" value={estudiantesEnRiesgo} valueStyle={{ color: estudiantesEnRiesgo > 0 ? "#ff4d4f" : "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Actividad pendiente"
              value={temasSinActividad}
              suffix={`/ ${totalTemas || 0}`}
              valueStyle={{ color: temasSinActividad > 0 ? "#faad14" : "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Quiz no habilitados"
              value={quizzesNoDisponibles}
              valueStyle={{ color: quizzesNoDisponibles > 0 ? "#faad14" : "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="En mora" value={estudiantesEnMora} valueStyle={{ color: estudiantesEnMora > 0 ? "#ff4d4f" : "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title={etiquetaQuincenaActual}
              value={horasQuincenaActual}
              suffix="h"
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Horas mes"
              value={horasMesActual}
              suffix="h"
              valueStyle={{ color: "#722ed1" }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
          <Space wrap>
            <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setActiveTab("3")}>
              Registrar sesión
            </Button>
            <Button size="small" type="primary" icon={<FormOutlined />} onClick={() => abrirModalActividad()}>
              Calificar clase
            </Button>
            <Button size="small" icon={<BarChartOutlined />} onClick={() => setModalRadarVisible(true)}>
              Ver radar pedagógico
            </Button>
          </Space>
        </div>
      </Card>

      {/* TABS - OFICINA COMPLETA DEL PROFESOR */}
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Pensum ({temas.length})</span>,
            children: (
              <Card
                title="Contenido del Curso - Pensum"
                extra={isAdminView ? (
                  <Button type="primary" icon={<BookOutlined />} onClick={() => router.push("/programas")}>
                    Gestionar en Programas
                  </Button>
                ) : null}
              >
                {ciclosOrdenados.length > 0 ? (
                  <Collapse
                    accordion
                    expandIconPosition="end"
                    items={ciclosOrdenados.map((ciclo: any, index: number) => {
                      const cicloId = String(ciclo?.id ?? "sin-ciclo");
                      const cicloNumero = ciclo?.numero_ciclo ?? ciclo?.orden ?? index + 1;
                      const cicloNombre = ciclo?.nombre_ciclo || ciclo?.titulo || `Ciclo ${cicloNumero}`;
                      const temasCiclo = temasPorCiclo.get(cicloId) ?? [];

                      return {
                        key: cicloId,
                        label: (
                          <Space size={16} align="center">
                            <div
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 16,
                                background: "#2563eb",
                                color: "#f8fafc",
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
                              <Text strong style={{ fontSize: 16 }}>{cicloNombre}</Text>
                              {ciclo?.descripcion ? (
                                <div>
                                  <Text type="secondary">{ciclo.descripcion}</Text>
                                </div>
                              ) : null}
                            </div>
                          </Space>
                        ),
                        children: temasCiclo.length ? (
                          <List
                            dataSource={temasCiclo}
                            renderItem={(tema: any, temaIndex: number) => {
                              const temaId = String(tema?.id ?? `tema-${temaIndex}`);
                              const materialesTema = materialesDidacticosPorTema.get(temaId) ?? [];
                              const presentacionesTema = dedupeByKey(
                                materialesTema.filter((item: any) => isIframeMaterial(item)),
                                (item: any) =>
                                  String(
                                    `${String(item?.pensum_id || "")}-${String(item?.pensum_curso_id || "")}-${extractIframeSrc(item?.url_archivo) || String(item?.id || item?.titulo || "")}`
                                  ).toLowerCase()
                              );
                              const mostrarEnlacePrincipal = presentacionesTema.length <= 1;
                              const recursoPrincipalTema = materialesTema.find((item: any) => isIframeMaterial(item)) || materialesTema[0] || null;
                              return (
                                <List.Item
                                  key={temaId}
                                  actions={[]}
                                >
                                  <List.Item.Meta
                                    avatar={<span style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{tema.orden || temaIndex + 1}</span>}
                                    title={<Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>}
                                    description={
                                      <Space direction="vertical" size={4}>
                                        {tema.descripcion ? <Text type="secondary">{tema.descripcion}</Text> : null}
                                        <Space wrap size={8}>
                                          {(() => {
                                            const quizTema = (quizzesClase || []).find(
                                              (quiz: any) =>
                                                String(quiz?.pensum_curso_id || "") === String(temaId) &&
                                                quiz?.activo === true &&
                                                quiz?.publicado === true
                                            );
                                            const quizTemaDisponible = (quizzesClase || []).find(
                                              (quiz: any) => String(quiz?.pensum_curso_id || "") === String(temaId)
                                            );
                                            const promedioQuiz = promedioQuizPorTema.get(String(temaId));
                                            const promedioActividad = promedioActividadPorTema.get(String(temaId));
                                            return (
                                              <>
                                                {mostrarEnlacePrincipal ? (
                                                  <Button
                                                    size="small"
                                                    type="link"
                                                    icon={recursoPrincipalTema ? getMaterialIcon(recursoPrincipalTema) : <FileTextOutlined />}
                                                    onClick={() => {
                                                      if (!recursoPrincipalTema) {
                                                        message.warning("Este tema aún no tiene material didáctico disponible.");
                                                        return;
                                                      }
                                                      abrirMaterialTema(recursoPrincipalTema, tema.nombre_curso || tema.titulo || "Tema", materialesTema);
                                                    }}
                                                    style={{ paddingInline: 0 }}
                                                  >
                                                    {tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}
                                                  </Button>
                                                ) : null}
                                                {presentacionesTema.length > 1 ? (
                                                  <Space size={6} wrap>
                                                    {presentacionesTema.map((presentacion: any, indexPresentacion: number) => {
                                                      const tituloBtn = String(parseTemaFromTitulo(presentacion?.titulo || "").tituloLimpio || presentacion?.nombre_archivo || tema.nombre_curso || tema.titulo || "Material");
                                                      return (
                                                        <React.Fragment key={String(presentacion?.id || `${temaId}-gamma-${indexPresentacion}`)}>
                                                          {indexPresentacion > 0 && (
                                                            <span style={{ color: "#d9d9d9", userSelect: "none" }}>|</span>
                                                          )}
                                                          <Button
                                                            size="small"
                                                            type="link"
                                                            icon={<PlayCircleOutlined />}
                                                            style={{ paddingInline: 0 }}
                                                            onClick={() => abrirMaterialTema(presentacion, tituloBtn, materialesTema)}
                                                          >
                                                            {tituloBtn}
                                                          </Button>
                                                        </React.Fragment>
                                                      );
                                                    })}
                                                  </Space>
                                                ) : null}
                                                <Button
                                                  size="small"
                                                  type={quizTema ? "primary" : "default"}
                                                  ghost
                                                  icon={<FormOutlined />}
                                                  disabled={!quizTema}
                                                  onClick={() => {
                                                    if (!quizTema) return;
                                                    abrirQuizProfesor(quizTema);
                                                  }}
                                                >
                                                  Quiz
                                                </Button>
                                                <Tag color={promedioQuiz == null ? "default" : promedioQuiz >= 4 ? "green" : promedioQuiz >= 3 ? "gold" : "red"}>
                                                  {`Calificación quiz: ${promedioQuiz == null ? "-" : `${promedioQuiz}/5`}`}
                                                </Tag>
                                                <Tag color={getActividadColor(promedioActividad)}>
                                                  {`Calificación actividad: ${typeof promedioActividad === "number" ? `${promedioActividad.toFixed(1)}/5` : "-"}`}
                                                </Tag>
                                                {!quizTema && quizTemaDisponible ? (
                                                  <Tag color="gold">Quiz no habilitado</Tag>
                                                ) : null}
                                              </>
                                            );
                                          })()}
                                        </Space>
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
                ) : (
                  <Empty description="No hay temas registrados en el programa." />
                )}
              </Card>
            )
          },
          {
            key: "2",
            label: <span><FileOutlined /> Lista de materiales</span>,
            children: (
              <Card
                title="Materiales necesarios por clase"
                extra={isAdminView ? (
                  <Upload maxCount={5} multiple>
                    <Button type="primary" icon={<PlusOutlined />}>
                      Subir Material
                    </Button>
                  </Upload>
                ) : null}
              >
                {materialesClaseUnicos.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <Collapse
                      accordion
                      expandIconPosition="end"
                      items={ciclosOrdenados.map((ciclo: any, index: number) => {
                        const cicloId = String(ciclo?.id ?? "sin-ciclo");
                        const cicloNumero = ciclo?.numero_ciclo ?? ciclo?.orden ?? index + 1;
                        const cicloNombre = ciclo?.nombre_ciclo || ciclo?.titulo || `Ciclo ${cicloNumero}`;
                        const temasCiclo = temasPorCiclo.get(cicloId) ?? [];

                        return {
                          key: `mat-${cicloId}`,
                          label: (
                            <Space size={16} align="center">
                              <div
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 16,
                                  background: "#16a34a",
                                  color: "#f8fafc",
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
                                <Text strong style={{ fontSize: 16 }}>{cicloNombre}</Text>
                                <br />
                                <Text type="secondary">Materiales por tema</Text>
                              </div>
                            </Space>
                          ),
                          children: temasCiclo.length ? (
                            <List
                              dataSource={temasCiclo}
                              renderItem={(tema: any, temaIndex: number) => {
                                const temaId = String(tema?.id ?? `tema-${temaIndex}`);
                                const materialesTema = materialesNecesariosPorTema.get(temaId) ?? [];
                                return (
                                  <List.Item key={`mat-${temaId}`}>
                                    <List.Item.Meta
                                      avatar={<span style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{tema.orden || temaIndex + 1}</span>}
                                      title={<Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>}
                                      description={
                                        materialesTema.length ? (
                                          <Space wrap size={10}>
                                            {materialesTema.map((item: any, itemIndex: number) => (
                                              <Space key={`${temaId}-req-${itemIndex}`} size={6}>
                                                {item.obligatorio ? (
                                                  <CheckCircleOutlined style={{ color: "#16a34a" }} />
                                                ) : (
                                                  <ClockCircleOutlined style={{ color: "#f59e0b" }} />
                                                )}
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                  {item.nombre_material}
                                                  {item.cantidad ? ` (${item.cantidad}${item.unidad ? ` ${item.unidad}` : ""})` : ""}
                                                </Text>
                                              </Space>
                                            ))}
                                          </Space>
                                        ) : (
                                          <Text type="secondary" style={{ fontSize: 12 }}>Sin materiales registrados</Text>
                                        )
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
                  </div>
                ) : (
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary">No hay materiales registrados para este programa.</Text>
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
                  size={isMobile ? "small" : "middle"}
                  tableLayout="fixed"
                  scroll={{ x: "max-content" }}
                />
              </Card>
            )
          },
          {
            key: "4",
            label: <span><UserOutlined /> Estudiantes ({totalEstudiantes})</span>,
            children: (
              <Card title="Lista de Estudiantes Matriculados">
                {(() => {
                  const enMoraCount = estudiantes.filter((e) => e.enMora).length;
                  return enMoraCount > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 12, borderRadius: 8 }}
                      message={
                        <span style={{ fontWeight: 700 }}>
                          ⚠️ {enMoraCount} estudiante{enMoraCount > 1 ? "s" : ""} con pago vencido
                        </span>
                      }
                      description="Los estudiantes marcados en rojo tienen cuotas vencidas sin pagar. Aparecen resaltados en la tabla."
                    />
                  ) : null;
                })()}
                <Table
                  dataSource={estudiantes}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                  columns={columnasEstudiantes}
                  size={isMobile ? "small" : "middle"}
                  tableLayout="fixed"
                  scroll={{ x: "max-content" }}
                  onRow={(record: Student) =>
                    record.enMora
                      ? { style: { background: "#fff1f0", borderLeft: "4px solid #ff4d4f" } }
                      : {}
                  }
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
                  message="Calificaciones de actividad por clase"
                  description="Selecciona la clase (tema) para ver y guardar la actividad calificable (1 a 5). Los estudiantes pendientes de pago no pueden ser calificados."
                  type="info"
                  showIcon
                  style={{ padding: "8px 10px" }}
                />

                <Card
                  title={<Text strong style={{ fontSize: 14 }}>Libro de calificaciones unificado</Text>}
                  bodyStyle={{ padding: 10 }}
                  headStyle={{ padding: "8px 12px", background: "#0f172a0f" }}
                >
                  <Space wrap size={8} style={{ marginBottom: 10 }}>
                    <Tag color="error">{`Riesgo alto: ${resumenLibroRiesgo.alto}`}</Tag>
                    <Tag color="warning">{`Riesgo medio: ${resumenLibroRiesgo.medio}`}</Tag>
                    <Tag color="success">{`Riesgo bajo: ${resumenLibroRiesgo.bajo}`}</Tag>
                    <Tag>{`Total: ${resumenLibroRiesgo.total}`}</Tag>
                  </Space>

                  <Table
                    size="small"
                    dataSource={libroCalificacionesUnificado}
                    columns={columnasLibroUnificado as any}
                    rowKey="key"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: "max-content" }}
                  />
                </Card>

                <Card bodyStyle={{ padding: 10 }}>
                  <Row gutter={[8, 8]}>
                    <Col xs={12} md={6}>
                      <Statistic title="Estudiantes" value={estudiantes.length} />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic title="Calificadas" value={resumenCalificacionTema.calificadas} valueStyle={{ color: "#1677ff" }} />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic title="Pendientes" value={resumenCalificacionTema.pendientes} valueStyle={{ color: resumenCalificacionTema.pendientes > 0 ? "#faad14" : undefined }} />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic title="Promedio clase" value={resumenCalificacionTema.promedio} precision={2} suffix="/5" />
                    </Col>
                  </Row>
                </Card>

                <Card
                  title={<Text strong style={{ fontSize: 14 }}>Resultados de Quiz por Clase (último intento)</Text>}
                  bodyStyle={{ padding: 10 }}
                  headStyle={{ padding: "8px 12px", background: "#0f172a0f" }}
                >
                  <Space direction={isMobile ? "vertical" : "horizontal"} size={8} style={{ width: "100%", marginBottom: 10 }}>
                    <Select
                      placeholder="Selecciona un quiz"
                      value={quizProfesorSeleccionadoId || undefined}
                      style={{ minWidth: isMobile ? "100%" : 320 }}
                      options={(quizzesOrdenadosPorPensum || []).map((quiz: any) => {
                        const temaId = String(quiz?.pensum_curso_id || "");
                        const nombreTema = nombreTemaPorId.get(temaId) || quiz?.titulo || "Quiz";
                        const ordenTema = ordenTemaPorId.get(temaId);
                        const nombreOrdenado = ordenTema ? `${ordenTema}. ${nombreTema}` : nombreTema;
                        const estado = quiz?.activo ? "Activo" : "Inactivo";
                        const publicacion = quiz?.publicado ? "Publicado" : "Borrador";
                        return { value: String(quiz.id), label: `${nombreOrdenado} • ${estado} • ${publicacion}` };
                      })}
                      onChange={(value) => setQuizProfesorSeleccionadoId(String(value))}
                    />
                    <Button
                      type="primary"
                      disabled={!quizProfesorSeleccionadoId}
                      onClick={() => {
                        const quiz = (quizzesOrdenadosPorPensum || []).find((item: any) => String(item.id) === String(quizProfesorSeleccionadoId));
                        if (!quiz) {
                          message.warning("Selecciona un quiz válido.");
                          return;
                        }
                        abrirQuizProfesor(quiz);
                      }}
                    >
                      Resolver quiz como profesor
                    </Button>
                  </Space>

                  <Table
                    size="small"
                    dataSource={resultadosQuizResumen}
                    rowKey="id"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: "max-content" }}
                    locale={{ emptyText: "No hay intentos de quiz registrados" }}
                    columns={[
                      {
                        title: "Estudiante",
                        render: (_: any, record: any) => {
                          const estudiante = estudiantes.find((item) => String(item.id) === String(record?.matricula_id));
                          return estudiante?.nombre_completo || "-";
                        },
                      },
                      {
                        title: "Clase",
                        render: (_: any, record: any) => {
                          const quiz = quizzesClase.find((item: any) => String(item?.id) === String(record?.quiz_id));
                          const temaId = String(quiz?.pensum_curso_id || "");
                          return nombreTemaPorId.get(temaId) || quiz?.titulo || "Quiz";
                        },
                      },
                      {
                        title: "Aciertos",
                        render: (_: any, record: any) => `${Number(record?.respuestas_correctas || 0)}/${Number(record?.total_preguntas || 0)}`,
                      },
                      {
                        title: "Calificación",
                        dataIndex: "calificacion",
                        render: (valor: number) => {
                          const nota = Number(valor || 0);
                          const aprobado = nota >= 3.75;
                          return <Tag color={aprobado ? "green" : "red"}>{`${nota.toFixed(1)}/5`}</Tag>;
                        },
                      },
                      {
                        title: "Fecha",
                        dataIndex: "enviado_at",
                        render: (fecha: string) => (fecha ? dayjs(fecha).format("DD/MM/YYYY HH:mm") : "-"),
                      },
                    ]}
                  />

                  {quizProfesorResultado ? (
                    <Card
                      size="small"
                      style={{ marginTop: 12 }}
                      title={<Text strong>{`Tus respuestas: ${quizProfesorResultado.titulo}`}</Text>}
                    >
                      <Space wrap size={8} style={{ marginBottom: 8 }}>
                        <Tag color={getActividadColor(quizProfesorResultado.calificacion)}>{`Nota: ${quizProfesorResultado.calificacion.toFixed(1)}/5`}</Tag>
                        <Tag color="blue">{`Aciertos: ${quizProfesorResultado.correctas}/${quizProfesorResultado.totalPreguntas}`}</Tag>
                        <Tag>{`${quizProfesorResultado.porcentaje.toFixed(1)}%`}</Tag>
                      </Space>

                      <List
                        size="small"
                        dataSource={quizProfesorResultado.respuestas}
                        renderItem={(item) => (
                          <List.Item>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                              <Text strong>{`${item.orden}. ${item.pregunta}`}</Text>
                              <Text>{`Tu respuesta: ${item.respuestaMarcada}`}</Text>
                              <Text type={item.esCorrecta ? undefined : "secondary"}>{`Correcta: ${item.respuestaCorrecta}`}</Text>
                              <Tag color={item.esCorrecta ? "green" : "red"}>{item.esCorrecta ? "Correcta" : "Incorrecta"}</Tag>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </Card>
                  ) : null}

                  <Card size="small" style={{ marginTop: 12 }} title={<Text strong>Pendientes por presentar</Text>}>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Space direction="vertical" size={6} style={{ width: "100%" }}>
                          <Tag color={pendientesQuiz.length > 0 ? "gold" : "green"}>
                            {`Quiz pendiente (${pendientesQuiz.length})`}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {quizSeleccionado
                              ? `Clase: ${nombreTemaPorId.get(String(quizSeleccionado.pensum_curso_id || "")) || quizSeleccionado.titulo || "Quiz"}`
                              : "Selecciona un quiz para ver pendientes"}
                          </Text>
                          {quizSeleccionado ? (
                            pendientesQuiz.length ? (
                              <List
                                size="small"
                                dataSource={pendientesQuiz}
                                renderItem={(est: Student) => <List.Item>{est.nombre_completo}</List.Item>}
                              />
                            ) : (
                              <Text type="secondary">Todos presentaron este quiz.</Text>
                            )
                          ) : null}
                        </Space>
                      </Col>
                      <Col xs={24} md={12}>
                        <Space direction="vertical" size={6} style={{ width: "100%" }}>
                          <Tag color={pendientesActividad.length > 0 ? "gold" : "green"}>
                            {`Actividad pendiente (${pendientesActividad.length})`}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {temaSeleccionado
                              ? `Clase: ${temaSeleccionado?.nombre_curso || temaSeleccionado?.titulo || "Clase"}`
                              : "Selecciona una clase para ver pendientes"}
                          </Text>
                          {temaSeleccionado ? (
                            pendientesActividad.length ? (
                              <>
                                <List
                                  size="small"
                                  dataSource={pendientesActividad}
                                  renderItem={(est: Student) => <List.Item>{est.nombre_completo}</List.Item>}
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  Usa Calificar Tareas para registrar estas pendientes.
                                </Text>
                              </>
                            ) : (
                              <Text type="secondary">Todos presentaron actividad en esta clase.</Text>
                            )
                          ) : null}
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                </Card>

                {clasesPensum.length === 0 ? (
                  <Card><Empty description="No hay temario cargado" /></Card>
                ) : (
                  <Card
                    title={<Text strong style={{ fontSize: 14 }}>Actividad por clase</Text>}
                    bodyStyle={{ padding: 10 }}
                    headStyle={{ padding: "8px 12px", background: "#0f172a0f" }}
                  >
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                      <Text type="secondary">
                        Selecciona una clase y abre el modal para calificar rápidamente a todos los estudiantes.
                      </Text>

                      <Space direction={isMobile ? "vertical" : "horizontal"} size={8} style={{ width: "100%" }}>
                        <Select
                          placeholder="Selecciona una clase"
                          value={temaSeleccionadoId || undefined}
                          style={{ minWidth: isMobile ? "100%" : 320 }}
                          options={clasesPensum.map((tema: any) => ({
                            value: String(tema.id),
                            label: formatearNombreClase(tema),
                          }))}
                          onChange={(value) => setTemaSeleccionadoId(String(value))}
                        />
                      </Space>

                      <Space wrap size={8}>
                        <Tag color="blue">{`Calificadas: ${resumenCalificacionTema.calificadas}/${estudiantes.length}`}</Tag>
                        <Tag color={resumenCalificacionTema.pendientes > 0 ? "gold" : "green"}>{`Pendientes: ${resumenCalificacionTema.pendientes}`}</Tag>
                        <Tag color={getActividadColor(resumenCalificacionTema.promedio)}>{`Promedio clase: ${resumenCalificacionTema.promedio.toFixed(1)}/5`}</Tag>
                      </Space>

                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Esta calificación de actividad queda visible también en el panel del estudiante.
                      </Text>
                    </Space>
                  </Card>
                )}
              </Space>
            )
          }
        ]}
      />

      <Modal
        title="Radar pedagógico (opcional)"
        open={modalRadarVisible}
        onCancel={() => setModalRadarVisible(false)}
        footer={null}
        width={isMobile ? "96%" : 1100}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap size={8}>
            <Tag color={estudiantesRezagados.length > 0 ? "red" : "green"}>
              {`Estudiantes a intervenir: ${estudiantesRezagados.length}`}
            </Tag>
            <Tag color={temasCriticos.length > 0 ? "gold" : "green"}>
              {`Temas críticos: ${temasCriticos.length}`}
            </Tag>
            <Tag color={quizzesAtencion.length > 0 ? "orange" : "green"}>
              {`Quizzes que requieren ajuste: ${quizzesAtencion.length}`}
            </Tag>
          </Space>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Card size="small" title="Estudiantes rezagados">
                {estudiantesRezagados.length ? (
                  <List
                    size="small"
                    dataSource={estudiantesRezagados}
                    renderItem={(est: any) => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: "100%" }}>
                          <Text strong>{est.nombre_completo}</Text>
                          <Space size={6} wrap>
                            <Tag color={est.asistencia_porcentaje < (curso.porcentaje_minimo || 80) ? "red" : "green"}>{`Asistencia ${est.asistencia_porcentaje}%`}</Tag>
                            <Tag color={est.nota_final != null && est.nota_final < 3.8 ? "red" : "blue"}>{`Nota ${est.nota_final != null ? Number(est.nota_final).toFixed(1) : "-"}`}</Tag>
                            <Tag color={est.pendientesActividadEstudiante > 0 ? "gold" : "green"}>{`Pendientes ${est.pendientesActividadEstudiante}`}</Tag>
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Text type="secondary">Sin estudiantes en alerta académica por ahora.</Text>
                )}
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card size="small" title="Temas críticos del pensum">
                {temasCriticos.length ? (
                  <List
                    size="small"
                    dataSource={temasCriticos}
                    renderItem={(tema: any) => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: "100%" }}>
                          <Text strong>{tema.nombreTema}</Text>
                          <Space size={6} wrap>
                            <Tag color={tema.promedio != null && tema.promedio < 3.8 ? "red" : "green"}>{`Promedio ${tema.promedio != null ? `${tema.promedio.toFixed(1)}/5` : "Sin nota"}`}</Tag>
                            <Tag color={tema.cobertura < 70 ? "gold" : "blue"}>{`Cobertura ${tema.cobertura}%`}</Tag>
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Text type="secondary">No se detectan temas con bajo promedio o baja cobertura.</Text>
                )}
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card size="small" title="Quizzes a reforzar">
                {quizzesAtencion.length ? (
                  <List
                    size="small"
                    dataSource={quizzesAtencion}
                    renderItem={(quiz: any) => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: "100%" }}>
                          <Text strong>{quiz.nombre}</Text>
                          <Space size={6} wrap>
                            <Tag color={quiz.promedio != null && quiz.promedio < 3.8 ? "red" : "green"}>{`Promedio ${quiz.promedio != null ? `${quiz.promedio.toFixed(1)}/5` : "Sin intentos"}`}</Tag>
                            <Tag color={quiz.participacion < 70 ? "orange" : "blue"}>{`Participación ${quiz.participacion}%`}</Tag>
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Text type="secondary">Sin quizzes en alerta de rendimiento o participación.</Text>
                )}
              </Card>
            </Col>
          </Row>

          <Space wrap>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                setActiveTab("5");
                setModalRadarVisible(false);
              }}
            >
              Ir a calificaciones
            </Button>
            <Button
              size="small"
              onClick={() => {
                setActiveTab("4");
                setModalRadarVisible(false);
              }}
            >
              Revisar estudiantes
            </Button>
            <Button
              size="small"
              onClick={() => {
                setActiveTab("1");
                setModalRadarVisible(false);
              }}
            >
              Reforzar temas del pensum
            </Button>
          </Space>
        </Space>
      </Modal>

      {/* MODAL REGISTRAR SESIÓN */}
      <Modal
        title="Calificar actividad por clase"
        open={modalActividadVisible}
        onCancel={() => {
          setModalActividadVisible(false);
          setSoloPendientesActividad(false);
          setEstudianteFocoActividadId(null);
        }}
        footer={null}
        width={isMobile ? "95%" : 980}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Select
            placeholder="Selecciona una clase"
            value={temaSeleccionadoId || undefined}
            options={clasesPensum.map((tema: any) => ({
              value: String(tema.id),
              label: formatearNombreClase(tema),
            }))}
            onChange={(value) => setTemaSeleccionadoId(String(value))}
            style={{ width: "100%" }}
          />

          {!temaSeleccionadoId ? (
            <Empty description="Selecciona una clase para calificar" />
          ) : (
            <>
              {estudianteFocoActividadId ? (
                <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
                  <Tag color="blue">
                    {`Foco en estudiante: ${
                      estudiantes.find((est) => String(est.id) === String(estudianteFocoActividadId))?.nombre_completo ||
                      estudianteFocoActividadId
                    }`}
                  </Tag>
                  <Button size="small" onClick={() => setEstudianteFocoActividadId(null)}>
                    Quitar foco
                  </Button>
                </Space>
              ) : null}

              {soloPendientesActividad ? (
                <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
                  <Tag color="gold">{`Mostrando solo pendientes (${estudiantesModalActividad.length})`}</Tag>
                  <Button size="small" onClick={() => setSoloPendientesActividad(false)}>Ver todos</Button>
                </Space>
              ) : null}

              <Table
                size="small"
                dataSource={estudiantesModalActividad}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                tableLayout="fixed"
                scroll={{ x: "max-content" }}
                columns={[
                {
                  title: "Estudiante",
                  dataIndex: "nombre_completo",
                  render: (text: string, record: any) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{text}</Text>
                      {record.estado === "pendiente_pago" ? <Tag color="default">PENDIENTE PAGO</Tag> : null}
                    </Space>
                  ),
                },
                {
                  title: "Asistencia",
                  dataIndex: "asistencia_porcentaje",
                  width: 110,
                  render: (valor: number) => `${Number(valor || 0)}%`,
                },
                {
                  title: "Nota actual",
                  width: 120,
                  render: (_: any, record: any) => {
                    const current = calificacionesTema[String(temaSeleccionadoId)]?.[String(record.id)] ?? null;
                    if (current == null || Number.isNaN(current)) return <Text type="secondary">Pendiente</Text>;
                    return <Tag color={getActividadColor(current)}>{current.toFixed(1)}</Tag>;
                  },
                },
                {
                  title: "Actividad (1-5)",
                  width: 150,
                  render: (_: any, record: any) => {
                    const temaId = String(temaSeleccionadoId);
                    const habilitado = record.estado !== "pendiente_pago";
                    const current = calificacionesTema[temaId]?.[String(record.id)] ?? null;

                    return (
                      <InputNumber
                        min={1}
                        max={5}
                        step={0.1}
                        value={current}
                        disabled={!habilitado}
                        onChange={(val) => {
                          setCalificacionesTema((prev) => ({
                            ...prev,
                            [temaId]: {
                              ...(prev[temaId] || {}),
                              [String(record.id)]: val === null ? null : Number(val),
                            },
                          }));
                        }}
                        style={{ width: 120 }}
                      />
                    );
                  },
                },
                {
                  title: "Guardar",
                  width: 120,
                  render: (_: any, record: any) => {
                    const temaId = String(temaSeleccionadoId);
                    const current = calificacionesTema[temaId]?.[String(record.id)] ?? null;
                    const habilitado = record.estado !== "pendiente_pago";
                    const saving = savingCalificacionId === `${temaId}-${record.id}`;
                    return (
                      <Button
                        type="primary"
                        size="small"
                        disabled={!habilitado || current == null || Number.isNaN(current)}
                        loading={saving}
                        onClick={() => guardarNotaTema(temaId, record.id, current)}
                      >
                        Guardar
                      </Button>
                    );
                  },
                },
                ]}
              />
            </>
          )}
        </Space>
      </Modal>

      <Modal
        title={iframeMaterialPreview.title || "Presentación"}
        open={iframeMaterialPreview.open}
        onCancel={() => setIframeMaterialPreview({ open: false, title: "", src: "", pdfSrc: "" })}
        footer={
          <Space>
            {iframeMaterialPreview.pdfSrc ? (
              <Button onClick={() => window.open(iframeMaterialPreview.pdfSrc, "_blank", "noopener,noreferrer")}>Ver PDF respaldo</Button>
            ) : null}
            <Button onClick={() => setIframeMaterialPreview({ open: false, title: "", src: "", pdfSrc: "" })}>Cerrar</Button>
          </Space>
        }
        width={isMobile ? "96%" : 1200}
        destroyOnClose
      >
        <iframe
          src={iframeMaterialPreview.src}
          title={iframeMaterialPreview.title || "Presentación"}
          style={{ width: "100%", height: isMobile ? "65vh" : "75vh", border: 0 }}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          loading="lazy"
        />
      </Modal>

      <Modal
        title={quizProfesorActivo ? `Quiz profesor: ${quizProfesorActivo.titulo || "Quiz"}` : "Quiz profesor"}
        open={quizProfesorModalOpen}
        onOk={enviarQuizProfesor}
        okText="Enviar respuestas"
        okButtonProps={{ loading: quizProfesorSaving }}
        onCancel={() => setQuizProfesorModalOpen(false)}
        width={760}
      >
        {!quizProfesorPreguntas.length ? (
          <Empty description="Este quiz no tiene preguntas" />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {quizProfesorPreguntas.map((pregunta: any, index: number) => {
              const preguntaId = String(pregunta.id);
              return (
                <Card
                  key={preguntaId}
                  size="small"
                  title={<Text strong>{`Pregunta ${index + 1}`}</Text>}
                  bodyStyle={{ padding: 10 }}
                >
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Text>{pregunta?.pregunta || "Sin enunciado"}</Text>
                    <Radio.Group
                      value={quizProfesorRespuestas[preguntaId]}
                      onChange={(event) => {
                        const value = String(event?.target?.value || "");
                        setQuizProfesorRespuestas((prev) => ({
                          ...prev,
                          [preguntaId]: value,
                        }));
                      }}
                    >
                      <Space direction="vertical">
                        <Radio value="A">{`A) ${pregunta?.opcion_a || ""}`}</Radio>
                        <Radio value="B">{`B) ${pregunta?.opcion_b || ""}`}</Radio>
                        <Radio value="C">{`C) ${pregunta?.opcion_c || ""}`}</Radio>
                        <Radio value="D">{`D) ${pregunta?.opcion_d || ""}`}</Radio>
                      </Space>
                    </Radio.Group>
                  </Space>
                </Card>
              );
            })}
          </Space>
        )}
      </Modal>

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
