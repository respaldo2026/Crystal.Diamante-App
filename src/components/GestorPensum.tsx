"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Table,
  Button,
  Space,
  Card,
  Tag,
  Tabs,
  App,
  Divider,
  message as antMessage,
  Upload,
  Select,
  Drawer,
  Empty,
  Progress,
  Tooltip,
  List,
  Alert,
  Radio,
  Dropdown,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  DownloadOutlined,
  FileOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  EyeOutlined,
  EllipsisOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { logger } from "@utils/logger";
import {
  getMaterialCoverageRuleDisplay,
  normalizeMaterialCoverage,
  type MaterialCoverage,
} from "@/types/payment-plans";
import type { UploadFile } from "antd";

const { Title, Text } = require("antd").Typography;

interface Pensum {
  id: string;
  programa_id: number;
  numero_ciclo: number;
  nombre_ciclo: string;
  descripcion: string;
  duracion_semanas: number;
  total_horas: number;
  orden: number;
  activo: boolean;
}

const normalizeHttpUrl = (value?: string | null): string => {
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

const hasMalformedEmbedTokens = (value?: string | null): boolean => {
  const raw = String(value || "");
  return /%_ENCODED_%|\{\"|\{"/i.test(raw);
};

const isAllowedEmbedHost = (value?: string | null): boolean => {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return false;

  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host === "gamma.app" || host.endsWith(".gamma.app");
  } catch {
    return false;
  }
};

const extractIframeSrc = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iframeMatch = raw.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
  const candidate = iframeMatch?.[1] ? iframeMatch[1].trim() : raw;
  return normalizeHttpUrl(candidate);
};

const toGammaEmbedUrl = (value?: string | null): string => {
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

const isHttpUrl = (value?: string | null): boolean => Boolean(normalizeHttpUrl(value));

interface PensumCurso {
  id: string;
  pensum_id?: string;
  nombre_curso: string;
  descripcion: string;
  horas: number;
  creditos: number;
  tipo_curso: string;
  orden: number;
}

interface MaterialDidactico {
  id: string;
  titulo: string;
  descripcion: string;
  tipo_material: string;
  nombre_archivo: string;
  url_archivo: string;
  tamano_bytes: number;
  mime_type: string;
  subido_por_nombre: string;
  created_at: string;
  pensum_id?: string;
  nombre_ciclo?: string | null;
  programa_nombre?: string | null;
}

interface MaterialClase {
  id: string;
  programa_id: number;
  pensum_id?: string | null;
  pensum_curso_id: string;
  material_ciclo_id?: string | null;
  nombre_material: string;
  cantidad?: string | null;
  unidad?: string | null;
  observaciones?: string | null;
  obligatorio: boolean;
  orden: number;
  activo: boolean;
  materiales_ciclo?: MaterialCiclo | null;
}

interface MaterialCiclo {
  id: string;
  programa_id: number;
  pensum_id: string;
  nombre: string;
  cantidad?: string | null;
  cobertura_material?: MaterialCoverage | null;
  incluido_kit: boolean;
  orden: number;
  activo: boolean;
}

interface QuizClase {
  id: string;
  programa_id: number;
  pensum_id?: string | null;
  pensum_curso_id: string;
  titulo: string;
  descripcion?: string | null;
  total_preguntas: number;
  activo: boolean;
  publicado: boolean;
  created_at?: string;
  updated_at?: string;
}

interface GestorPensumProps {
  programaId: string;
  programaNombre: string;
  onClose: () => void;
}

const HORAS_CLASE_FIJAS = 3;
const MATERIAL_IMPRIMIBLE_PROFESOR_TAG = "MATERIAL_IMPRIMIBLE_PROFESOR";

export default function GestorPensum({
  programaId,
  programaNombre,
  onClose,
}: GestorPensumProps) {
  const { message, modal } = App.useApp();
  const [formCurso] = Form.useForm();
  const [formMaterial] = Form.useForm();
  const [formCiclo] = Form.useForm();
  const [formMaterialClase] = Form.useForm();
  const [formMaterialCiclo] = Form.useForm();
  const [formQuiz] = Form.useForm();

  const renderCoverageRuleTag = (coverage?: string | null, includedKit?: boolean | null) => {
    const display = getMaterialCoverageRuleDisplay(coverage, includedKit);
    return <Tag color={display.color}>{display.shortLabel}</Tag>;
  };

  // Estados para pensum
  const [pensums, setPensums] = useState<Pensum[]>([]);
  const [loadingPensums, setLoadingPensums] = useState(false);
  interface ProgramaData {
    id: number;
    nombre: string;
    duracion: string;
    total_clases?: number;
    horas_por_clase?: number;
    [key: string]: unknown;
  }
  const [programaData, setProgramaData] = useState<ProgramaData | null>(null);

  // Estados para cursos del pensum
  const [cursosPensum, setCursosPensum] = useState<PensumCurso[]>([]);
  const [cursosPrograma, setCursosPrograma] = useState<PensumCurso[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [modalCursoVisible, setModalCursoVisible] = useState(false);
  const [editingCurso, setEditingCurso] = useState<PensumCurso | null>(null);

  // Estados para editar ciclo
  const [modalCicloVisible, setModalCicloVisible] = useState(false);
  const [editingCiclo, setEditingCiclo] = useState<Pensum | null>(null);

  // Estados para material didáctico
  const [materiales, setMateriales] = useState<MaterialDidactico[]>([]);
  const [loadingMateriales, setLoadingMateriales] = useState(false);
  const [materialesCicloGeneral, setMaterialesCicloGeneral] = useState<MaterialCiclo[]>([]);
  const [loadingMaterialesCiclo, setLoadingMaterialesCiclo] = useState(false);
  const [materialesClase, setMaterialesClase] = useState<MaterialClase[]>([]);
  const [loadingMaterialesClase, setLoadingMaterialesClase] = useState(false);
  const [drawerMaterialesVisible, setDrawerMaterialesVisible] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<MaterialDidactico | null>(null);
  const [modalMaterialClaseVisible, setModalMaterialClaseVisible] = useState(false);
  const [editingMaterialClase, setEditingMaterialClase] = useState<MaterialClase | null>(null);
  const [modalMaterialCicloVisible, setModalMaterialCicloVisible] = useState(false);
  const [editingMaterialCiclo, setEditingMaterialCiclo] = useState<MaterialCiclo | null>(null);
  const [quizzesClase, setQuizzesClase] = useState<QuizClase[]>([]);
  const [loadingQuizzesClase, setLoadingQuizzesClase] = useState(false);
  const [modalQuizVisible, setModalQuizVisible] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<QuizClase | null>(null);
  const [cursoQuizActivo, setCursoQuizActivo] = useState<PensumCurso | null>(null);
  const [generandoQuizIA, setGenerandoQuizIA] = useState(false);
  const [pdfClaseActual, setPdfClaseActual] = useState<{ url: string; nombre: string } | null>(null);
  const [pdfsCiclo, setPdfsCiclo] = useState<{ id: string; url: string; nombre: string; titulo: string }[]>([]);
  const [tipoOrigen, setTipoOrigen] = useState<'archivo' | 'enlace' | 'iframe'>('archivo');
  const [mostrarListaCompletaCiclo, setMostrarListaCompletaCiclo] = useState(false);
  const [mostrarListaCompletaNecesarios, setMostrarListaCompletaNecesarios] = useState(false);
  const [filtroCoberturaMateriales, setFiltroCoberturaMateriales] = useState<"todos" | "NINGUNO" | "MENSUAL_70" | "MENSUAL_100">("todos");
  const [mostrarTablaMaestraClases, setMostrarTablaMaestraClases] = useState(false);
  const [vistaCicloActiva, setVistaCicloActiva] = useState<"temas" | "material" | "necesarios" | "quiz">("temas");
  const [filtroTemas, setFiltroTemas] = useState<"todos" | "pendientes" | "completos">("todos");
  const [horasNormalizadas, setHorasNormalizadas] = useState(false);
  const [iframePreview, setIframePreview] = useState<{ open: boolean; title: string; src: string }>({
    open: false,
    title: "",
    src: "",
  });

  // Estados para navegación
  const [selectedCicloId, setSelectedCicloId] = useState<string | null>(null);
  const [selectedCursoId, setSelectedCursoId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>("");

  const canManageMateriales = useMemo(() => {
    return ["admin", "director", "secretaria"].includes(currentRole.toLowerCase());
  }, [currentRole]);

  // Cargar información del programa
  const cargarPrograma = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("programas")
        .select("*")
        .eq("id", programaId)
        .single();

      if (error) throw error;
      setProgramaData(data);
    } catch (error) {
      message.error("Error al cargar programa");
      logger.error(error);
    }
  }, [programaId, message]);

  const cargarRolActual = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabaseBrowserClient.auth.getUser();

      if (!user?.id) {
        setCurrentRole("");
        return;
      }

      const { data, error } = await supabaseBrowserClient
        .from("perfiles")
        .select("rol, email")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      let rolDetectado = String(data?.rol || "").toLowerCase();

      if (!rolDetectado && user.email) {
        const { data: perfilPorEmail, error: errorEmail } = await supabaseBrowserClient
          .from("perfiles")
          .select("rol")
          .eq("email", user.email)
          .maybeSingle();

        if (!errorEmail && perfilPorEmail?.rol) {
          rolDetectado = String(perfilPorEmail.rol).toLowerCase();
        }
      }

      if (!rolDetectado) {
        const rolMeta = (user.user_metadata as any)?.rol || (user.app_metadata as any)?.rol;
        rolDetectado = String(rolMeta || "").toLowerCase();
      }

      setCurrentRole(rolDetectado);
    } catch (error) {
      logger.error("Error al cargar rol actual", error);
      setCurrentRole("");
    }
  }, []);

  const cargarPensums = useCallback(async () => {
    setLoadingPensums(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("pensum")
        .select("*")
        .eq("programa_id", programaId)
        .order("numero_ciclo", { ascending: true });

      if (error) throw error;
      setPensums(data || []);
    } catch (error) {
      message.error("Error al cargar pensum");
      logger.error(error);
    } finally {
      setLoadingPensums(false);
    }
  }, [programaId, message]);

  // Verificar y crear ciclos automáticamente según la duración del programa
  const verificarYCrearCiclos = useCallback(async () => {
    if (!programaData?.duracion) {
      await cargarPensums();
      return;
    }

    // Extraer número de ciclos/meses de la duración (ej: "4 meses" -> 4)
    const duracionStr = String(programaData.duracion);
    const numeroCiclos = parseInt(duracionStr.match(/\d+/)?.[0] || "0", 10);

    if (numeroCiclos === 0) {
      await cargarPensums();
      return;
    }

    // Verificar ciclos existentes
    const { data: ciclosExistentes, error } = await supabaseBrowserClient
      .from("pensum")
      .select("numero_ciclo")
      .eq("programa_id", programaId);

    if (error) {
      logger.error("Error verificando ciclos:", error);
      await cargarPensums();
      return;
    }

    const ciclosQueExisten = new Set(ciclosExistentes?.map(c => c.numero_ciclo) || []);
    const ciclosFaltantes = [];

    // Crear los ciclos que faltan
    for (let i = 1; i <= numeroCiclos; i++) {
      if (!ciclosQueExisten.has(i)) {
        ciclosFaltantes.push({
          programa_id: programaId,
          numero_ciclo: i,
          nombre_ciclo: `Ciclo ${i}`,
          descripcion: `Contenido académico del ciclo ${i}`,
          duracion_semanas: 4,
          total_horas: 0,
          orden: i,
          activo: true,
        });
      }
    }

    if (ciclosFaltantes.length > 0) {
      try {
        // Usar API route que tiene permisos de service_role para bypasear RLS
        const response = await fetch("/api/pensum/create-ciclos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            programaId,
            ciclosFaltantes,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          logger.error("Error creando ciclos:", errorData);
          message.error("Error al crear ciclos automáticamente");
        }
      } catch (error) {
        logger.error("Error al llamar API crear ciclos:", error);
        message.error("Error de conexión al crear ciclos");
      }
    }

    await cargarPensums();
  }, [programaData, programaId, cargarPensums, message]);

  // ==================== PENSUM ====================

  const handleEditarCiclo = (e: React.MouseEvent, pensum: Pensum) => {
    e.stopPropagation();
    setEditingCiclo(pensum);
    formCiclo.setFieldsValue({
      nombre_ciclo: pensum.nombre_ciclo,
      descripcion: pensum.descripcion
    });
    setModalCicloVisible(true);
  };

  const handleGuardarCiclo = async () => {
    try {
      const values = await formCiclo.validateFields();
      if (!editingCiclo) return;

      // Actualización optimista: Actualizar el estado local inmediatamente para ver el cambio
      setPensums(prev => prev.map(p => 
        p.id === editingCiclo.id 
          ? { ...p, nombre_ciclo: values.nombre_ciclo, descripcion: values.descripcion }
          : p
      ));

      const { data, error } = await supabaseBrowserClient
        .from("pensum")
        .update({
          nombre_ciclo: values.nombre_ciclo,
          descripcion: values.descripcion,
        })
        .eq("id", editingCiclo.id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("No se pudieron guardar los cambios. Verifica permisos.");
      }

      message.success("Ciclo actualizado");
      setModalCicloVisible(false);
      setEditingCiclo(null);
      cargarPensums();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error al actualizar ciclo");
      } else {
        message.error("Error al actualizar ciclo");
      }
      cargarPensums(); // Si falla, recargamos para revertir el cambio visual
    }
  };

  // ==================== CURSOS DEL PENSUM ====================

  const normalizarOrdenTemas = useCallback(async (pensumId: string, cursos: PensumCurso[]) => {
    if (!cursos.length) return cursos;

    const cursosOrdenados = [...cursos].sort((a, b) => {
      const ordenA = Number.isFinite(Number(a.orden)) ? Number(a.orden) : Number.MAX_SAFE_INTEGER;
      const ordenB = Number.isFinite(Number(b.orden)) ? Number(b.orden) : Number.MAX_SAFE_INTEGER;
      if (ordenA !== ordenB) return ordenA - ordenB;
      return String(a.nombre_curso || "").localeCompare(String(b.nombre_curso || ""), "es", { sensitivity: "base" });
    });

    const indiceBioseguridad = cursosOrdenados.findIndex((curso) =>
      String(curso.nombre_curso || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes("bioseguridad")
    );

    const cursosFinales = [...cursosOrdenados];
    if (indiceBioseguridad > 0) {
      const [cursoBio] = cursosFinales.splice(indiceBioseguridad, 1);
      if (cursoBio) cursosFinales.unshift(cursoBio);
    }

    const actualizaciones = cursosFinales
      .map((curso, index) => ({ id: curso.id, orden: index + 1 }))
      .filter((update) => {
        const original = cursos.find((c) => c.id === update.id);
        return Number(original?.orden || 0) !== update.orden;
      });

    if (actualizaciones.length > 0) {
      await Promise.all(
        actualizaciones.map((update) =>
          supabaseBrowserClient
            .from("pensum_cursos")
            .update({ orden: update.orden })
            .eq("id", update.id)
            .eq("pensum_id", pensumId)
        )
      );
    }

    return cursosFinales.map((curso, index) => ({ ...curso, orden: index + 1 }));
  }, []);

  const cargarCursosPensum = useCallback(async (pensumId: string) => {
    setLoadingCursos(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("pensum_cursos")
        .select("*")
        .eq("pensum_id", pensumId)
        .order("orden", { ascending: true });

      if (error) throw error;
      const cursosNormalizados = await normalizarOrdenTemas(pensumId, (data || []) as PensumCurso[]);
      setCursosPensum(cursosNormalizados || []);
    } catch (error) {
      message.error("Error al cargar cursos");
    } finally {
      setLoadingCursos(false);
    }
  }, [message, normalizarOrdenTemas]);

  const cargarCursosPrograma = useCallback(async (pensumsActuales?: Pensum[]) => {
    try {
      const sourcePensums = Array.isArray(pensumsActuales) ? pensumsActuales : pensums;
      const ids = (sourcePensums || []).map((p) => String(p.id)).filter(Boolean);

      if (ids.length === 0) {
        setCursosPrograma([]);
        return;
      }

      const { data, error } = await supabaseBrowserClient
        .from("pensum_cursos")
        .select("id, pensum_id, nombre_curso, descripcion, horas, creditos, tipo_curso, orden")
        .in("pensum_id", ids);

      if (error) throw error;

      const cicloOrderByPensum = new Map<string, number>();
      (sourcePensums || []).forEach((ciclo) => {
        const order = Number(ciclo?.orden || ciclo?.numero_ciclo || 9999);
        cicloOrderByPensum.set(String(ciclo.id), Number.isFinite(order) ? order : 9999);
      });

      const sorted = ((data || []) as PensumCurso[])
        .slice()
        .sort((a, b) => {
          const cicloA = cicloOrderByPensum.get(String(a?.pensum_id || "")) ?? 9999;
          const cicloB = cicloOrderByPensum.get(String(b?.pensum_id || "")) ?? 9999;
          if (cicloA !== cicloB) return cicloA - cicloB;
          const ordenA = Number(a?.orden || 9999);
          const ordenB = Number(b?.orden || 9999);
          if (ordenA !== ordenB) return ordenA - ordenB;
          return String(a?.nombre_curso || "").localeCompare(String(b?.nombre_curso || ""), "es", { sensitivity: "base" });
        });

      setCursosPrograma(sorted);
    } catch (error) {
      console.error(error);
      setCursosPrograma([]);
    }
  }, [pensums]);

  const sincronizarListaClasesPrograma = useCallback(async () => {
    const totalEsperado = Number(programaData?.total_clases || 0);
    if (!Number.isFinite(totalEsperado) || totalEsperado <= 0) {
      message.warning("Define 'Total de clases' en el programa antes de sincronizar la lista.");
      return;
    }

    const ciclosOrdenados = (pensums || [])
      .slice()
      .sort((a, b) => Number(a?.orden || a?.numero_ciclo || 9999) - Number(b?.orden || b?.numero_ciclo || 9999));

    if (ciclosOrdenados.length === 0) {
      message.warning("No hay ciclos en el pensum. Primero configura los ciclos del programa.");
      return;
    }

    const totalActual = cursosPrograma.length;
    if (totalActual >= totalEsperado) {
      message.info(`La lista ya tiene ${totalActual} clases. No se agregaron nuevas.`);
      return;
    }

    const porCiclo = new Map<string, PensumCurso[]>();
    (cursosPrograma || []).forEach((curso) => {
      const key = String(curso?.pensum_id || "");
      const current = porCiclo.get(key) || [];
      current.push(curso);
      porCiclo.set(key, current);
    });

    const maxOrdenPorCiclo = new Map<string, number>();
    ciclosOrdenados.forEach((ciclo) => {
      const key = String(ciclo.id);
      const maxOrden = Math.max(
        0,
        ...(porCiclo.get(key) || []).map((item) => Number(item?.orden || 0)).filter((n) => Number.isFinite(n))
      );
      maxOrdenPorCiclo.set(key, maxOrden);
    });

    const inserts: Array<Record<string, any>> = [];
    const ciclosCount = ciclosOrdenados.length;

    for (let classNumber = totalActual + 1; classNumber <= totalEsperado; classNumber += 1) {
      const targetCiclo = ciclosOrdenados[(classNumber - 1) % ciclosCount] ?? ciclosOrdenados[0];
      if (!targetCiclo) {
        continue;
      }
      const cicloKey = String(targetCiclo.id);
      const ordenActual = (maxOrdenPorCiclo.get(cicloKey) || 0) + 1;
      maxOrdenPorCiclo.set(cicloKey, ordenActual);

      inserts.push({
        pensum_id: targetCiclo.id,
        nombre_curso: `Clase ${classNumber}`,
        descripcion: `Clase ${classNumber} del programa`,
        horas: HORAS_CLASE_FIJAS,
        creditos: 0,
        tipo_curso: "obligatorio",
        orden: ordenActual,
      });
    }

    if (!inserts.length) return;

    const { error } = await supabaseBrowserClient.from("pensum_cursos").insert(inserts);
    if (error) {
      message.error(`No se pudo sincronizar la lista: ${error.message}`);
      return;
    }

    await cargarCursosPrograma(ciclosOrdenados);
    if (selectedCicloId) {
      await cargarCursosPensum(selectedCicloId);
    }

    message.success(`Lista sincronizada: ${totalEsperado} clases disponibles para el programa.`);
  }, [programaData, pensums, cursosPrograma, message, cargarCursosPrograma, selectedCicloId, cargarCursosPensum]);

  const handleGuardarCurso = async () => {
    try {
      const values = await formCurso.validateFields();
      if (!selectedCicloId) return;

      const payload = {
        ...values,
        horas: HORAS_CLASE_FIJAS,
        pensum_id: selectedCicloId,
      };

      if (editingCurso) {
        const { error } = await supabaseBrowserClient
          .from("pensum_cursos")
          .update(payload)
          .eq("id", editingCurso.id);
        if (error) throw error;
        message.success("Curso actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("pensum_cursos")
          .insert([payload]);
        if (error) throw error;
        message.success("Curso agregado");
      }

      formCurso.resetFields();
      setEditingCurso(null);
      setModalCursoVisible(false);
      cargarCursosPensum(selectedCicloId);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error");
      } else {
        message.error("Error");
      }
    }
  };

  const handleEliminarCurso = (cursoId: string) => {
    modal.confirm({
      title: "Eliminar tema",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("pensum_cursos")
            .delete()
            .eq("id", cursoId);
          if (error) throw error;
          message.success("Tema eliminado");
          if (selectedCicloId) cargarCursosPensum(selectedCicloId);
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
        }
      },
    });
  };

  // ==================== MATERIAL DIDÁCTICO ====================

  const cargarMateriales = useCallback(async () => {
    setLoadingMateriales(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("v_material_completo")
        .select("*")
        .eq("programa_id", programaId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMateriales(data || []);
    } catch (error) {
      message.error("Error al cargar materiales");
      console.error(error);
    } finally {
      setLoadingMateriales(false);
    }
  }, [programaId, message]);

  const cargarMaterialesCiclo = useCallback(async () => {
    setLoadingMaterialesCiclo(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("materiales_ciclo")
        .select("*")
        .eq("programa_id", programaId)
        .eq("activo", true)
        .order("orden", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMaterialesCicloGeneral(data || []);
    } catch (error) {
      message.error("Error al cargar materiales del ciclo");
      logger.error(error);
    } finally {
      setLoadingMaterialesCiclo(false);
    }
  }, [programaId, message]);

  const cargarMaterialesClase = useCallback(async () => {
    setLoadingMaterialesClase(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("materiales_clase")
        .select("*, materiales_ciclo:material_ciclo_id (*)")
        .eq("programa_id", programaId)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (error) throw error;
      const normalizados = (data || []).map((item: any) => ({
        ...item,
        materiales_ciclo: Array.isArray(item.materiales_ciclo)
          ? item.materiales_ciclo[0] || null
          : item.materiales_ciclo || null,
      }));
      setMaterialesClase(normalizados as MaterialClase[]);
    } catch (error) {
      message.error("Error al cargar materiales por clase");
      logger.error(error);
    } finally {
      setLoadingMaterialesClase(false);
    }
  }, [programaId, message]);

  const cargarQuizzesClase = useCallback(async () => {
    setLoadingQuizzesClase(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("quizzes_clase")
        .select("id, programa_id, pensum_id, pensum_curso_id, titulo, descripcion, total_preguntas, activo, publicado, created_at, updated_at")
        .eq("programa_id", Number(programaId))
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuizzesClase((data || []) as QuizClase[]);
    } catch (error) {
      message.error("Error al cargar quizzes por clase");
      logger.error(error);
    } finally {
      setLoadingQuizzesClase(false);
    }
  }, [programaId, message]);

  const abrirModalQuiz = (curso: PensumCurso, quiz?: QuizClase | null) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar quizzes.");
      return;
    }

    setCursoQuizActivo(curso);
    setEditingQuiz(quiz || null);

    const temaCursoNorm = normalizarTema(curso.nombre_curso);

    // Recopilar PDFs del tema/clase actual
    const pdfsTema = materialesCicloDidactico
      .filter((m) => {
        if (!isPdfMaterial(m) || !m.url_archivo) return false;
        const { tema: temaMaterial } = parseTemaFromTitulo(m.titulo);
        const temaMaterialNorm = normalizarTema(temaMaterial || m.titulo);
        return temaMaterialNorm === temaCursoNorm;
      })
      .map((m) => ({
        id: m.id,
        url: m.url_archivo,
        nombre: m.nombre_archivo || m.titulo,
        titulo: m.titulo,
      }));

    // Fallback: si no hay coincidencias de tema, usar PDFs del ciclo activo
    const pensumIdBuscar = curso.pensum_id || selectedCicloId;
    const todosPdfsCiclo = materiales
      .filter(
        (m) =>
          isPdfMaterial(m) &&
          m.url_archivo &&
          (pensumIdBuscar ? m.pensum_id === pensumIdBuscar : true)
      )
      .map((m) => ({
        id: m.id,
        url: m.url_archivo,
        nombre: m.nombre_archivo || m.titulo,
        titulo: m.titulo,
      }));
    const todosPdfs = pdfsTema.length > 0 ? pdfsTema : todosPdfsCiclo;
    setPdfsCiclo(todosPdfs);

    // Preseleccionar el PDF cuyo título contenga el nombre del curso (coincidencia parcial)
    const nombreCursoNorm = curso.nombre_curso.toLowerCase();
    const pdfPreseleccionado =
      todosPdfs.find((p) =>
        p.titulo.toLowerCase().includes(nombreCursoNorm) ||
        p.nombre.toLowerCase().includes(nombreCursoNorm)
      ) || todosPdfs[0] || null;
    setPdfClaseActual(pdfPreseleccionado);

    formQuiz.setFieldsValue({
      titulo: quiz?.titulo || `Quiz - ${curso.nombre_curso}`,
      descripcion: quiz?.descripcion || "",
      total_preguntas: quiz?.total_preguntas || 25,
      publicado: quiz?.publicado ?? false,
      activo: quiz?.activo ?? true,
    });
    setModalQuizVisible(true);
  };

  const handleGuardarQuiz = async () => {
    try {
      if (!canManageMateriales) {
        message.warning("Solo administración y secretaría pueden gestionar quizzes.");
        return;
      }

      if (!cursoQuizActivo) {
        message.error("Selecciona un tema para crear el quiz.");
        return;
      }

      const values = await formQuiz.validateFields();
      const payload = {
        programa_id: Number(programaId),
        pensum_id: selectedCicloId,
        pensum_curso_id: cursoQuizActivo.id,
        titulo: String(values.titulo || "").trim(),
        descripcion: values.descripcion || null,
        total_preguntas: Number(values.total_preguntas || 25),
        publicado: Boolean(values.publicado),
        activo: values.activo ?? true,
      };

      if (editingQuiz) {
        const { error } = await supabaseBrowserClient
          .from("quizzes_clase")
          .update(payload)
          .eq("id", editingQuiz.id);
        if (error) throw error;
        message.success("Quiz actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("quizzes_clase")
          .upsert(payload, { onConflict: "pensum_curso_id" });
        if (error) throw error;
        message.success("Quiz creado para la clase");
      }

      setModalQuizVisible(false);
      setEditingQuiz(null);
      setCursoQuizActivo(null);
      formQuiz.resetFields();
      await cargarQuizzesClase();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error al guardar quiz");
      } else {
        message.error("Error al guardar quiz");
      }
    }
  };

  const handleEliminarQuiz = (quizId: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar quizzes.");
      return;
    }

    modal.confirm({
      title: "Eliminar quiz de la clase",
      content: "¿Seguro que deseas eliminar este quiz?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("quizzes_clase")
            .delete()
            .eq("id", quizId);

          if (error) throw error;
          message.success("Quiz eliminado");
          await cargarQuizzesClase();
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error al eliminar quiz");
          } else {
            message.error("Error al eliminar quiz");
          }
        }
      },
    });
  };

  const generarQuizConIA = async () => {
    if (pdfsCiclo.length === 0 && !pdfClaseActual) {
      message.error("No hay PDFs disponibles para esta clase. Sube primero el material en PDF en la sección de Materiales.");
      return;
    }
    if (!cursoQuizActivo) return;

    const pdfsSeleccionados = (pdfsCiclo || []).filter((pdf) => Boolean(pdf?.url));
    if (pdfsSeleccionados.length === 0 && pdfClaseActual?.url) {
      pdfsSeleccionados.push({
        id: "manual",
        url: pdfClaseActual.url,
        nombre: pdfClaseActual.nombre,
        titulo: pdfClaseActual.nombre,
      });
    }

    if (pdfsSeleccionados.length === 0) {
      message.error("No se encontraron PDFs válidos para generar el quiz con IA.");
      return;
    }

    setGenerandoQuizIA(true);
    try {
      // 1. Llamar al endpoint para generar preguntas con IA
      const res = await fetch("/api/ai/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdf_url: pdfsSeleccionados[0]?.url,
          pdf_urls: pdfsSeleccionados.map((pdf) => pdf.url),
          titulo_clase: cursoQuizActivo.nombre_curso,
          pensum_curso_id: cursoQuizActivo.id,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al generar preguntas con IA");
      }

      const { preguntas, total, titulo_sugerido } = await res.json();

      if (!preguntas || preguntas.length === 0) {
        throw new Error("La IA no generó preguntas. Intenta de nuevo.");
      }

      // 2. Crear o actualizar el quiz en quizzes_clase
      const quizPayload = {
        programa_id: Number(programaId),
        pensum_id: selectedCicloId,
        pensum_curso_id: cursoQuizActivo.id,
        titulo: formQuiz.getFieldValue("titulo") || titulo_sugerido,
        descripcion: formQuiz.getFieldValue("descripcion") || `Generado automáticamente con IA a partir de ${pdfsSeleccionados.length} PDF(s) de la clase.`,
        total_preguntas: total,
        publicado: formQuiz.getFieldValue("publicado") ?? false,
        activo: formQuiz.getFieldValue("activo") ?? true,
      };

      let quizId: string;
      if (editingQuiz) {
        quizId = editingQuiz.id;
        const { error } = await supabaseBrowserClient
          .from("quizzes_clase")
          .update(quizPayload)
          .eq("id", quizId);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseBrowserClient
          .from("quizzes_clase")
          .upsert(quizPayload, { onConflict: "pensum_curso_id" })
          .select("id")
          .single();
        if (error) throw error;
        quizId = data.id;
      }

      // 3. Eliminar preguntas existentes y reemplazar con las generadas
      await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .delete()
        .eq("quiz_id", quizId);

      const preguntasInsert = preguntas.map((p: any) => ({
        quiz_id: quizId,
        orden: p.orden,
        pregunta: p.pregunta,
        opcion_a: p.opcion_a,
        opcion_b: p.opcion_b,
        opcion_c: p.opcion_c,
        opcion_d: p.opcion_d,
        respuesta_correcta: p.respuesta_correcta,
        activo: true,
      }));

      const { error: insertError } = await supabaseBrowserClient
        .from("quiz_preguntas_clase")
        .insert(preguntasInsert);

      if (insertError) throw insertError;

      message.success(`✅ Quiz generado con IA usando ${pdfsSeleccionados.length} PDF(s): ${total} preguntas creadas para "${cursoQuizActivo.nombre_curso}"`);

      setModalQuizVisible(false);
      setEditingQuiz(null);
      setCursoQuizActivo(null);
      setPdfClaseActual(null);
      setPdfsCiclo([]);
      formQuiz.resetFields();
      await cargarQuizzesClase();
    } catch (error: any) {
      message.error(error?.message || "Error al generar quiz con IA");
    } finally {
      setGenerandoQuizIA(false);
    }
  };

  const abrirModalMaterialClase = (cursoId: string, material?: MaterialClase) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    setEditingMaterialClase(material || null);
    formMaterialClase.setFieldsValue({
      pensum_curso_id: material?.pensum_curso_id || cursoId,
      material_ciclo_id: material?.material_ciclo_id || null,
      material_ciclo_ids: material?.material_ciclo_id ? [material.material_ciclo_id] : [],
      nombre_material: material?.nombre_material || "",
      cantidad: material?.cantidad || "",
      unidad: material?.unidad || "",
      observaciones: material?.observaciones || "",
      orden: material?.orden ?? 1,
      activo: material?.activo ?? true,
    });
    setModalMaterialClaseVisible(true);
  };

  const handleGuardarMaterialClase = async () => {
    try {
      if (!canManageMateriales) {
        message.warning("Solo administración y secretaría pueden gestionar materiales.");
        return;
      }
      if (!selectedCicloId) return;
      const values = await formMaterialClase.validateFields();

      const selectedMaterialIds = Array.isArray(values.material_ciclo_ids)
        ? values.material_ciclo_ids.filter(Boolean)
        : [];

      const materialCicloSeleccionado = materialesCicloGeneral.find(
        (material) => String(material.id) === String(values.material_ciclo_id),
      );
      const nombreMaterial = values.nombre_material || materialCicloSeleccionado?.nombre || "";
      const cantidadMaterial = values.cantidad || materialCicloSeleccionado?.cantidad || null;

      const obligatorio = editingMaterialClase?.obligatorio ?? true;
      const payload = {
        programa_id: Number(programaId),
        pensum_id: selectedCicloId,
        pensum_curso_id: values.pensum_curso_id,
        material_ciclo_id: values.material_ciclo_id || null,
        nombre_material: nombreMaterial,
        cantidad: cantidadMaterial,
        unidad: values.unidad || null,
        observaciones: values.observaciones || null,
        obligatorio,
        orden: values.orden || 1,
        activo: true,
      };

      if (editingMaterialClase) {
        const { error } = await supabaseBrowserClient
          .from("materiales_clase")
          .update(payload)
          .eq("id", editingMaterialClase.id);
        if (error) throw error;
        message.success("Material necesario actualizado");
      } else {
        if (selectedMaterialIds.length > 1) {
          const payloads = selectedMaterialIds.map((materialId: string, index: number) => {
            const selected = materialesCicloGeneral.find((material) => String(material.id) === String(materialId));
            return {
              ...payload,
              material_ciclo_id: materialId,
              nombre_material: selected?.nombre || payload.nombre_material,
              cantidad: selected?.cantidad || payload.cantidad,
              orden: (values.orden || 1) + index,
            };
          });

          const { error } = await supabaseBrowserClient
            .from("materiales_clase")
            .insert(payloads);
          if (error) throw error;
          message.success(`${payloads.length} materiales necesarios agregados`);
        } else {
          const materialId = selectedMaterialIds[0] || values.material_ciclo_id || null;
          const selected = materialId
            ? materialesCicloGeneral.find((material) => String(material.id) === String(materialId))
            : null;

          const payloadSingle = {
            ...payload,
            material_ciclo_id: materialId,
            nombre_material: selected?.nombre || payload.nombre_material,
            cantidad: selected?.cantidad || payload.cantidad,
          };

          const { error } = await supabaseBrowserClient
            .from("materiales_clase")
            .insert([payloadSingle]);
          if (error) throw error;
          message.success("Material necesario agregado");
        }
      }

      setModalMaterialClaseVisible(false);
      setEditingMaterialClase(null);
      formMaterialClase.resetFields();
      await cargarMaterialesClase();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error al guardar material necesario");
      } else {
        message.error("Error al guardar material necesario");
      }
    }
  };

  const handleEliminarMaterialClase = (materialId: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    modal.confirm({
      title: "Eliminar material necesario",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("materiales_clase")
            .update({ activo: false })
            .eq("id", materialId);
          if (error) throw error;
          message.success("Material necesario eliminado");
          await cargarMaterialesClase();
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
        }
      },
    });
  };

  const abrirModalMaterialCiclo = (material?: MaterialCiclo) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    setEditingMaterialCiclo(material || null);
    formMaterialCiclo.setFieldsValue({
      nombre: material?.nombre || "",
      cantidad: material?.cantidad || "",
      cobertura_material: normalizeMaterialCoverage(material?.cobertura_material, material?.incluido_kit),
      orden: material?.orden ?? 1,
      activo: material?.activo ?? true,
    });
    setModalMaterialCicloVisible(true);
  };

  const handleGuardarMaterialCiclo = async () => {
    try {
      if (!canManageMateriales) {
        message.warning("Solo administración y secretaría pueden gestionar materiales.");
        return;
      }
      if (!selectedCicloId) {
        message.error("Selecciona un ciclo antes de agregar materiales.");
        return;
      }

      const values = await formMaterialCiclo.validateFields();
      const payload = {
        programa_id: Number(programaId),
        pensum_id: selectedCicloId,
        nombre: values.nombre,
        cantidad: values.cantidad || null,
        cobertura_material: normalizeMaterialCoverage(values.cobertura_material),
        incluido_kit: normalizeMaterialCoverage(values.cobertura_material) !== "NINGUNO",
        orden: values.orden || 1,
        activo: values.activo ?? true,
      };

      if (editingMaterialCiclo) {
        const { error } = await supabaseBrowserClient
          .from("materiales_ciclo")
          .update(payload)
          .eq("id", editingMaterialCiclo.id);
        if (error) throw error;
        message.success("Material del ciclo actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("materiales_ciclo")
          .insert([payload]);
        if (error) throw error;
        message.success("Material del ciclo agregado");
      }

      setModalMaterialCicloVisible(false);
      setEditingMaterialCiclo(null);
      formMaterialCiclo.resetFields();
      await cargarMaterialesCiclo();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error al guardar material del ciclo");
      } else {
        message.error("Error al guardar material del ciclo");
      }
    }
  };

  const handleEliminarMaterialCiclo = (materialId: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    modal.confirm({
      title: "Eliminar material del ciclo",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("materiales_ciclo")
            .update({ activo: false })
            .eq("id", materialId);
          if (error) throw error;
          message.success("Material del ciclo eliminado");
          await cargarMaterialesCiclo();
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
        }
      },
    });
  };

  useEffect(() => {
    cargarPrograma();
    cargarRolActual();
  }, [cargarPrograma, cargarRolActual]);

  useEffect(() => {
    if (programaData) {
      verificarYCrearCiclos();
    }
  }, [programaData, verificarYCrearCiclos]);

  useEffect(() => {
    cargarPensums();
  }, [cargarPensums]);

  useEffect(() => {
    cargarCursosPrograma();
  }, [pensums, cargarCursosPrograma]);

  useEffect(() => {
    if (selectedCicloId) {
      const cicloSeleccionado = pensums.find(p => p.id === selectedCicloId);
      if (cicloSeleccionado) {
        cargarCursosPensum(selectedCicloId);
      }
    }
  }, [selectedCicloId, pensums, cargarCursosPensum]);

  useEffect(() => {
    if (selectedCicloId) {
      setVistaCicloActiva("temas");
    }
  }, [selectedCicloId]);

  useEffect(() => {
    const normalizarHorasClases = async () => {
      if (horasNormalizadas) return;
      if (!pensums.length) return;

      const pensumIds = pensums.map((p) => String(p.id)).filter(Boolean);
      if (!pensumIds.length) return;

      try {
        const { error } = await supabaseBrowserClient
          .from("pensum_cursos")
          .update({ horas: HORAS_CLASE_FIJAS })
          .in("pensum_id", pensumIds)
          .neq("horas", HORAS_CLASE_FIJAS);

        if (error) throw error;
        setHorasNormalizadas(true);
        await cargarCursosPrograma(pensums);
        if (selectedCicloId) {
          await cargarCursosPensum(selectedCicloId);
        }
      } catch (error) {
        logger.error("No se pudieron normalizar las horas de clase", error);
      }
    };

    normalizarHorasClases();
  }, [
    horasNormalizadas,
    pensums,
    cargarCursosPrograma,
    cargarCursosPensum,
    selectedCicloId,
  ]);

  useEffect(() => {
    cargarMateriales();
  }, [cargarMateriales]);

  useEffect(() => {
    cargarMaterialesCiclo();
  }, [cargarMaterialesCiclo]);

  useEffect(() => {
    cargarMaterialesClase();
  }, [cargarMaterialesClase]);

  useEffect(() => {
    cargarQuizzesClase();
  }, [cargarQuizzesClase]);

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

  const buildTituloConTema = (titulo: string, tema?: string) => {
    if (!tema) return titulo;
    if (/^\s*tema[:\-]/i.test(titulo) || /^\s*\[tema[:\-]/i.test(titulo)) return titulo;
    return `Tema: ${tema} — ${titulo}`;
  };

  const getTemaNormalizadoDesdeMaterial = (material: Pick<MaterialDidactico, "titulo">) => {
    const parsed = parseTemaFromTitulo(String(material?.titulo || ""));
    return normalizarTema(parsed.tema || material?.titulo || "");
  };

  const isMaterialImprimibleProfesor = (material: Pick<MaterialDidactico, "descripcion" | "tipo_material">) => {
    const descripcion = String(material?.descripcion || "");
    return descripcion.includes(MATERIAL_IMPRIMIBLE_PROFESOR_TAG) || String(material?.tipo_material || "").toLowerCase() === "material_imprimible";
  };

  const limpiarDescripcionMaterial = (descripcion?: string | null) => {
    return String(descripcion || "")
      .replace(new RegExp(`\\[?${MATERIAL_IMPRIMIBLE_PROFESOR_TAG}\\]?`, "gi"), "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const isPdfMaterial = (material: Pick<MaterialDidactico, "mime_type" | "nombre_archivo" | "url_archivo" | "titulo">) => {
    const mime = String(material?.mime_type || "").toLowerCase();
    const nombre = String(material?.nombre_archivo || "").toLowerCase();
    const url = String(material?.url_archivo || "").toLowerCase();
    const titulo = String(material?.titulo || "").toLowerCase();
    return mime.includes("pdf") || nombre.endsWith(".pdf") || /\.pdf(?:$|\?|#)/i.test(url) || titulo.includes("pdf");
  };

  const abrirDrawerMaterialParaTema = (temaNombre?: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    setEditingMaterial(null);
    formMaterial.resetFields();
    setFileList([]);
    setTipoOrigen('archivo');
    formMaterial.setFieldsValue({ tema_relacionado: temaNombre, uso_material: "general" });
    setDrawerMaterialesVisible(true);
  };

  const editarMaterial = (material: MaterialDidactico, temaNombre?: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    const esIframe = material.mime_type === "iframe";
    const esEnlace = !esIframe && (material.mime_type === "link" || material.nombre_archivo === "Enlace Externo");
    setEditingMaterial(material);
    setFileList([]);
    setTipoOrigen(esIframe ? 'iframe' : esEnlace ? 'enlace' : 'archivo');
    const iframeSrc = extractIframeSrc(material.url_archivo);
    const { tituloLimpio } = parseTemaFromTitulo(material.titulo);
    const esImprimibleProfesor = isMaterialImprimibleProfesor(material);
    formMaterial.setFieldsValue({
      tema_relacionado: temaNombre,
      titulo: tituloLimpio || material.titulo,
      descripcion: limpiarDescripcionMaterial(material.descripcion),
      tipo_material: material.tipo_material,
      uso_material: esImprimibleProfesor ? "imprimible_profesor" : "general",
      url_externa: esEnlace ? material.url_archivo : undefined,
      iframe_code: esIframe && iframeSrc ? `<iframe src="${iframeSrc}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>` : undefined,
    });
    setDrawerMaterialesVisible(true);
  };

  const materialesCicloDidactico = useMemo(() => {
    return materiales.filter(m => m.pensum_id === selectedCicloId);
  }, [materiales, selectedCicloId]);

  const materialesCicloGeneralOrdenados = useMemo(() => {
    return materialesCicloGeneral
      .filter((m) => m.pensum_id === selectedCicloId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }, [materialesCicloGeneral, selectedCicloId]);

  const materialesCicloFiltrados = useMemo(() => {
    if (filtroCoberturaMateriales === "todos") return materialesCicloGeneralOrdenados;
    return materialesCicloGeneralOrdenados.filter(
      (material) => normalizeMaterialCoverage(material.cobertura_material, material.incluido_kit) === filtroCoberturaMateriales,
    );
  }, [filtroCoberturaMateriales, materialesCicloGeneralOrdenados]);

  const materialesClaseCiclo = useMemo(() => {
    return materialesClase.filter((material) => material.pensum_id === selectedCicloId);
  }, [materialesClase, selectedCicloId]);


  const handleEliminarMaterial = (materialId: string) => {
    if (!canManageMateriales) {
      message.warning("Solo administración y secretaría pueden gestionar materiales.");
      return;
    }
    modal.confirm({
      title: "Eliminar material",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("material_didactico")
            .delete()
            .eq("id", materialId);
          if (error) throw error;
          message.success("Material eliminado");
          cargarMateriales();
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
        }
      },
    });
  };

  const formatearTamano = (bytes: number) => {
    if (bytes === 0) return "Enlace";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const sanitizarNombreArchivo = (nombre: string) => {
    return nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
  };

  // Actualizar pensum_id cuando se selecciona un ciclo para subir material
  const handleSubirMaterial = async () => {
    try {
      if (!canManageMateriales) {
        message.warning("Solo administración y secretaría pueden gestionar materiales.");
        return;
      }
      if (!selectedCicloId) {
        message.error("Selecciona un ciclo antes de subir material.");
        return;
      }
      // Obtener valores del formulario
      const formValues = formMaterial.getFieldsValue();
      const tipoOrigenSeleccionado = tipoOrigen;
      const usoMaterial = String(formValues.uso_material || "general");
      const temaRelacionado = formValues.tema_relacionado as string | undefined;
      
      let urlArchivo = "";
      let nombreArchivo = "";
      let tamanoBytes = 0;
      let mimeType = "";

      if (tipoOrigenSeleccionado === 'archivo') {
        // Obtener el archivo del upload
        const fileList = formValues.archivo?.fileList;
        if (!fileList || fileList.length === 0) {
          if (!editingMaterial) {
            message.error("Por favor selecciona un archivo");
            return;
          }
        }

        if (fileList && fileList.length > 0) {
          const uploadedFile = fileList[0].originFileObj;
          const safeName = sanitizarNombreArchivo(uploadedFile.name);
          const uploadFileName = `${Date.now()}_${safeName}`;

          // Subir archivo a Supabase Storage
          const { data: uploadData, error: uploadError } = await supabaseBrowserClient.storage
            .from("material_didactico")
            .upload(`${programaId}/${uploadFileName}`, uploadedFile);

          if (uploadError) {
            if (
              uploadError.message.includes("security policy") ||
              uploadError.message.includes("row-level security")
            ) {
              throw new Error(
                "Error de permisos: Falta configurar políticas RLS en el bucket 'material_didactico'. Ejecuta el script SQL de permisos."
              );
            }
            throw uploadError;
          }

          // Obtener URL pública
          const { data: urlData } = supabaseBrowserClient.storage
            .from("material_didactico")
            .getPublicUrl(`${programaId}/${uploadFileName}`);

          urlArchivo = urlData.publicUrl;
          nombreArchivo = uploadedFile.name;
          tamanoBytes = uploadedFile.size;
          mimeType = uploadedFile.type;
        } else if (editingMaterial) {
          urlArchivo = editingMaterial.url_archivo;
          nombreArchivo = editingMaterial.nombre_archivo;
          tamanoBytes = editingMaterial.tamano_bytes;
          mimeType = editingMaterial.mime_type;
        }
      } else if (tipoOrigenSeleccionado === 'enlace') {
        // Es un enlace externo
        const urlNueva = normalizeHttpUrl(formValues.url_externa);
        if (editingMaterial && !urlNueva) {
          // Edición sin cambiar la URL — conservar la existente
          urlArchivo = editingMaterial.url_archivo;
          nombreArchivo = editingMaterial.nombre_archivo;
          tamanoBytes = editingMaterial.tamano_bytes;
          mimeType = editingMaterial.mime_type;
        } else {
          urlArchivo = urlNueva;
          if (!isHttpUrl(urlArchivo)) {
            throw new Error("La URL del enlace debe iniciar con http:// o https://");
          }
          nombreArchivo = "Enlace Externo";
          tamanoBytes = 0;
          mimeType = "link";
        }
      } else if (tipoOrigenSeleccionado === 'iframe') {
        const iframeCode = String(formValues.iframe_code || "").trim();
        const iframeSrc = extractIframeSrc(iframeCode);

        if (editingMaterial) {
          // Modo edición: si el iframe_code no cambió o es el mismo origen, usar valores existentes
          const srcExistente = String(editingMaterial.url_archivo || "");
          const srcNuevo = normalizeHttpUrl(iframeSrc);
          const cambioSrc = srcNuevo && srcNuevo !== normalizeHttpUrl(srcExistente);

          if (cambioSrc) {
            // El usuario cambió el iframe — validar el nuevo
            if (!isHttpUrl(iframeSrc)) {
              throw new Error("No se pudo detectar una URL válida dentro del iframe.");
            }
            if (hasMalformedEmbedTokens(iframeSrc)) {
              throw new Error("El iframe contiene parámetros inválidos. Vuelve a copiar el código de Gamma.");
            }
            if (!isAllowedEmbedHost(iframeSrc)) {
              throw new Error("Solo se permiten iframes de Gamma (gamma.app).");
            }
            urlArchivo = iframeSrc;
          } else {
            // Solo cambió el título/descripción — conservar los datos existentes
            urlArchivo = editingMaterial.url_archivo;
          }
          nombreArchivo = editingMaterial.nombre_archivo;
          tamanoBytes = editingMaterial.tamano_bytes;
          mimeType = editingMaterial.mime_type;
        } else {
          // Modo creación: validar el iframe completo
          if (!iframeCode) {
            throw new Error("Pega el código iframe de Gamma.");
          }
          if (!isHttpUrl(iframeSrc)) {
            throw new Error("No se pudo detectar una URL válida dentro del iframe.");
          }
          if (hasMalformedEmbedTokens(iframeSrc)) {
            throw new Error("El iframe contiene parámetros inválidos. Vuelve a copiar el código de Gamma.");
          }
          if (!isAllowedEmbedHost(iframeSrc)) {
            throw new Error("Solo se permiten iframes de Gamma (gamma.app).");
          }
          urlArchivo = iframeSrc;
          nombreArchivo = "Presentación embebida";
          tamanoBytes = 0;
          mimeType = "iframe";
        }
      }

      // Guardar en base de datos
      const { data: authData } = await supabaseBrowserClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        message.error("Debes iniciar sesión para subir material");
        return;
      }

      const temaNormalizado = normalizarTema(temaRelacionado || formValues.titulo || "");
      const materialesMismoTema = (materialesCicloDidactico || []).filter((material) => {
        if (editingMaterial && String(material.id) === String(editingMaterial.id)) return false;
        return getTemaNormalizadoDesdeMaterial(material) === temaNormalizado;
      });

      const iframeExistenteTema = materialesMismoTema.find((material) => String(material.mime_type || "").toLowerCase() === "iframe");
      const esPdfActual = mimeType.toLowerCase().includes("pdf") || nombreArchivo.toLowerCase().endsWith(".pdf");
      const esIframeActual = mimeType === "iframe";

      if (usoMaterial === "imprimible_profesor" && !esPdfActual) {
        throw new Error("El material imprimible debe ser un archivo PDF.");
      }

      const descripcionOriginal = limpiarDescripcionMaterial(formValues.descripcion);
      const prefijoRespaldo = "[PDF_RESPALDO_IFRAME]";
      let descripcionFinal = descripcionOriginal;

      if (usoMaterial === "imprimible_profesor") {
        descripcionFinal = `[${MATERIAL_IMPRIMIBLE_PROFESOR_TAG}] ${descripcionFinal}`.trim();
      }

      if (esPdfActual && (iframeExistenteTema || esIframeActual)) {
        const textoRespaldo = `${prefijoRespaldo} PDF de respaldo para el iframe del tema ${temaRelacionado || formValues.titulo || ""}`.trim();
        descripcionFinal = descripcionOriginal
          ? `${textoRespaldo} · ${descripcionOriginal}`
          : textoRespaldo;
      }

      if (esIframeActual) {
        const pdfsTema = materialesMismoTema.filter((material) => isPdfMaterial(material));
        if (pdfsTema.length > 0) {
          await Promise.all(
            pdfsTema.map(async (pdf) => {
              const descripcionPdf = String(pdf.descripcion || "");
              if (descripcionPdf.includes(prefijoRespaldo)) return;
              const nuevaDescripcion = descripcionPdf
                ? `${prefijoRespaldo} PDF de respaldo para el iframe del tema ${temaRelacionado || formValues.titulo || ""} · ${descripcionPdf}`
                : `${prefijoRespaldo} PDF de respaldo para el iframe del tema ${temaRelacionado || formValues.titulo || ""}`;

              await supabaseBrowserClient
                .from("material_didactico")
                .update({ descripcion: nuevaDescripcion })
                .eq("id", pdf.id);
            })
          );
        }
      }

      const payload = {
        programa_id: programaId,
        pensum_id: selectedCicloId,
        subido_por: authUser.id,
        titulo: buildTituloConTema(formValues.titulo, temaRelacionado),
        descripcion: descripcionFinal,
        tipo_material: usoMaterial === "imprimible_profesor" ? "documento" : (formValues.tipo_material || tipoOrigenSeleccionado),
        url_archivo: urlArchivo,
        nombre_archivo: nombreArchivo,
        tamano_bytes: tamanoBytes,
        mime_type: mimeType,
        visible: true,
      };

      if (editingMaterial) {
        const { error: updateError } = await supabaseBrowserClient
          .from("material_didactico")
          .update(payload)
          .eq("id", editingMaterial.id);

        if (updateError) throw updateError;
        message.success("Material actualizado correctamente");
      } else {
        const { error: insertError } = await supabaseBrowserClient
          .from("material_didactico")
          .insert(payload);

        if (insertError) throw insertError;
        message.success("Material subido correctamente");
      }

      formMaterial.resetFields();
      setDrawerMaterialesVisible(false);
      setFileList([]);
      setTipoOrigen('archivo');
      setEditingMaterial(null);
      await cargarMateriales();

      if (esPdfActual && iframeExistenteTema) {
        message.success("PDF subido y marcado como respaldo del iframe de este tema.");
      }
      
    } catch (error: any) {
      message.error("Error al subir material: " + error.message);
      console.error(error);
    }
  };

  const handleAbrirMaterial = (url: string, title?: string) => {
    logger.debug("Intentando abrir URL:", url);
    if (!url) {
      message.error("Error: El material no tiene una URL válida");
      return;
    }

    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl) {
      message.error("Error: El material no tiene una URL válida");
      return;
    }

    if (isAllowedEmbedHost(normalizedUrl)) {
      setIframePreview({
        open: true,
        title: String(title || "Presentación").trim() || "Presentación",
        src: toGammaEmbedUrl(normalizedUrl),
      });
      return;
    }

    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
  };

  const cicloSeleccionado = pensums.find((p) => p.id === selectedCicloId) || null;
  const totalTemas = cursosPensum.length;
  const totalTemasPrograma = cursosPrograma.length;
  const totalClasesEsperadasPrograma = Number(programaData?.total_clases || 0);
  const faltantesPrograma = totalClasesEsperadasPrograma > 0
    ? Math.max(0, totalClasesEsperadasPrograma - totalTemasPrograma)
    : 0;
  const totalMaterialDidactico = materialesCicloDidactico.length;
  const totalMaterialNecesario = materialesClaseCiclo.length;
  const quizzesPorTemaId = useMemo(() => {
    const map = new Map<string, QuizClase>();
    (quizzesClase || []).forEach((quiz) => {
      const key = String(quiz?.pensum_curso_id || "");
      if (!key) return;
      map.set(key, quiz);
    });
    return map;
  }, [quizzesClase]);

  const clasesMaestrasPrograma = useMemo(() => {
    const cicloOrderById = new Map<string, number>();
    const cicloLabelById = new Map<string, string>();

    (pensums || []).forEach((ciclo) => {
      const key = String(ciclo?.id || "");
      if (!key) return;
      cicloOrderById.set(key, Number(ciclo?.orden || ciclo?.numero_ciclo || 9999));
      cicloLabelById.set(key, ciclo?.nombre_ciclo || `Ciclo ${ciclo?.numero_ciclo || "?"}`);
    });

    return (cursosPrograma || []).map((curso, index) => {
      const cicloId = String(curso?.pensum_id || "");
      return {
        id: String(curso?.id || `clase-${index + 1}`),
        key: String(curso?.id || `clase-${index + 1}`),
        numero: index + 1,
        cicloId,
        cicloOrden: cicloOrderById.get(cicloId) ?? 9999,
        cicloNombre: cicloLabelById.get(cicloId) || "Sin ciclo",
        tema: curso?.nombre_curso || `Clase ${index + 1}`,
        descripcion: curso?.descripcion || "",
        horas: HORAS_CLASE_FIJAS,
        tipo: curso?.tipo_curso || "obligatorio",
        quiz: quizzesPorTemaId.get(String(curso?.id || "")) || null,
      };
    });
  }, [cursosPrograma, pensums, quizzesPorTemaId]);

  const cursosPensumFiltrados = useMemo(() => {
    const lista = cursosPensum || [];

    return lista.filter((curso) => {
      const materialesTema = materialesCicloDidactico.filter((material) => {
        const { tema: temaMaterial } = parseTemaFromTitulo(material.titulo);
        const temaMaterialNorm = normalizarTema(temaMaterial || material.titulo);
        const temaCursoNorm = normalizarTema(curso.nombre_curso);
        return temaMaterialNorm === temaCursoNorm;
      });

      const materialesNecesariosTema = materialesClaseCiclo.filter(
        (material) => material.pensum_curso_id === curso.id,
      );

      const tieneMaterialDidactico = materialesTema.length > 0;
      const tieneMaterialNecesario = materialesNecesariosTema.length > 0;
      const tieneQuiz = quizzesPorTemaId.has(String(curso.id));

      const estaCompletoSegunVista =
        vistaCicloActiva === "material"
          ? tieneMaterialDidactico
          : vistaCicloActiva === "necesarios"
            ? tieneMaterialNecesario
            : vistaCicloActiva === "quiz"
              ? tieneQuiz
              : tieneMaterialDidactico && tieneMaterialNecesario && tieneQuiz;

      if (filtroTemas === "completos") return estaCompletoSegunVista;
      if (filtroTemas === "pendientes") return !estaCompletoSegunVista;
      return true;
    });
  }, [
    cursosPensum,
    materialesCicloDidactico,
    materialesClaseCiclo,
    quizzesPorTemaId,
    vistaCicloActiva,
    filtroTemas,
  ]);

  const abrirClaseDesdeTabla = useCallback((record: any) => {
    const cicloId = String(record?.cicloId || "");
    if (cicloId) {
      setSelectedCicloId(cicloId);
    }
  }, []);

  const editarNombreClaseDesdeTabla = useCallback((record: any) => {
    const curso = (cursosPrograma || []).find((item) => String(item?.id) === String(record?.id));
    if (!curso) return;

    const cicloId = String(curso?.pensum_id || record?.cicloId || "");
    if (cicloId) {
      setSelectedCicloId(cicloId);
    }

    setEditingCurso(curso);
    formCurso.setFieldsValue({ ...curso, horas: HORAS_CLASE_FIJAS });
    setModalCursoVisible(true);
  }, [cursosPrograma, formCurso]);

  return (
    <Drawer
      title={`Gestión: ${programaNombre}`}
      placement="right"
      open={true}
      onClose={onClose}
      width={1200}
      destroyOnClose
    >
      {/* Vista Principal - Seleccionar Ciclo */}
      {!selectedCicloId ? (
        <div>
          {programaData && (
            <Alert
              message={`Ciclos generados automáticamente`}
              description={`Este programa tiene configurados ${pensums.length} ciclo(s) según la duración "${programaData.duracion}". Clases del programa: ${totalTemasPrograma}${totalClasesEsperadasPrograma > 0 ? ` / ${totalClasesEsperadasPrograma}` : ""}. Selecciona un ciclo para gestionar sus temas y materiales.`}
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          <Card size="small" style={{ marginBottom: 16 }}>
            <Space wrap size={12}>
              <Tag color={faltantesPrograma > 0 ? "orange" : "green"}>
                Lista de clases: {totalTemasPrograma}{totalClasesEsperadasPrograma > 0 ? ` / ${totalClasesEsperadasPrograma}` : ""}
              </Tag>
              {totalClasesEsperadasPrograma > 0 && (
                <Button type="primary" onClick={sincronizarListaClasesPrograma}>
                  {faltantesPrograma > 0 ? `Completar ${faltantesPrograma} clases faltantes` : "Sincronizar lista de clases"}
                </Button>
              )}
            </Space>
          </Card>

          <Card
            size="small"
            title="Tabla maestra de clases (vista completa)"
            style={{ marginBottom: 16 }}
            extra={(
              <Button
                type={mostrarTablaMaestraClases ? "primary" : "default"}
                onClick={() => setMostrarTablaMaestraClases((prev) => !prev)}
              >
                {mostrarTablaMaestraClases ? "Ocultar tabla" : "Ver tabla completa"}
              </Button>
            )}
          >
            {!mostrarTablaMaestraClases ? (
              <Text type="secondary">Pulsa &quot;Ver tabla completa&quot; para visualizar y gestionar todas las clases de una sola mirada.</Text>
            ) : clasesMaestrasPrograma.length === 0 ? (
              <Text type="secondary">Aún no hay clases creadas en el programa.</Text>
            ) : (
              <Table
                size="small"
                loading={loadingQuizzesClase}
                rowKey="key"
                dataSource={clasesMaestrasPrograma}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                scroll={{ x: 980 }}
                columns={[
                  {
                    title: "Clase #",
                    dataIndex: "numero",
                    width: 90,
                    sorter: (a, b) => Number(a.numero) - Number(b.numero),
                  },
                  {
                    title: "Ciclo",
                    dataIndex: "cicloNombre",
                    width: 240,
                    render: (value: string) => <Tag color="blue">{value}</Tag>,
                  },
                  {
                    title: "Tema/Clase",
                    dataIndex: "tema",
                    width: 360,
                    render: (value: string) => (
                      <Text style={{ display: "block" }} ellipsis={{ tooltip: value }}>
                        {value}
                      </Text>
                    ),
                  },
                  {
                    title: "Horas",
                    dataIndex: "horas",
                    width: 90,
                    align: "center",
                    render: () => HORAS_CLASE_FIJAS,
                  },
                  {
                    title: "Tipo",
                    dataIndex: "tipo",
                    width: 130,
                    render: (v: string) => <Tag>{v || "obligatorio"}</Tag>,
                  },
                  {
                    title: "Acciones",
                    key: "acciones",
                    width: 170,
                    render: (_: any, record: any) => (
                      <Space size={8}>
                        <Button size="small" onClick={() => abrirClaseDesdeTabla(record)}>
                          Entrar
                        </Button>
                        <Button size="small" type="primary" ghost onClick={() => editarNombreClaseDesdeTabla(record)}>
                          Editar nombre
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </Card>

          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ fontSize: 16 }}>
              Elige un ciclo para gestionar temas y subir materiales
            </Text>
          </div>

          {pensums.length === 0 ? (
            <Empty description="No hay ciclos creados" />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {pensums.map((pensum) => (
                <Card
                  key={pensum.id}
                  hoverable
                  onClick={() => setSelectedCicloId(pensum.id)}
                  style={{
                    cursor: "pointer",
                    textAlign: "center",
                    borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    position: "relative",
                  }}
                >
                  <Button 
                    type="text" 
                    icon={<EditOutlined />} 
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: '#1890ff' }}
                    onClick={(e) => handleEditarCiclo(e, pensum)}
                  />
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
                  <Text strong style={{ fontSize: 18, display: "block" }}>
                    {pensum.nombre_ciclo || `Ciclo ${pensum.numero_ciclo}`}
                  </Text>
                  {pensum.nombre_ciclo && (
                    <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                      Ciclo {pensum.numero_ciclo}
                    </div>
                  )}
                  {pensum.descripcion && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 8, fontStyle: 'italic', padding: '0 10px' }}>
                      {pensum.descripcion}
                    </div>
                  )}
                  <Divider style={{ margin: "12px 0" }} />
                  <div style={{ fontSize: 12, color: "#999" }}>
                    <div>⏱️ {pensum.duracion_semanas} semanas</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Vista Ciclo Seleccionado - Ver Temas y Materiales */
        <div>
          <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Button onClick={() => setSelectedCicloId(null)}>← Volver</Button>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {cicloSeleccionado?.nombre_ciclo || `Ciclo ${cicloSeleccionado?.numero_ciclo}`}
              </Text>
            </div>
          </div>

          {totalClasesEsperadasPrograma > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Button size="small" onClick={sincronizarListaClasesPrograma}>
                Sincronizar clases del programa
              </Button>
            </div>
          )}

          {!canManageMateriales && (
            <Alert
              type="warning"
              showIcon
              message="Modo solo lectura de materiales"
              description="Solo administración y secretaría pueden crear, editar o eliminar materiales."
              style={{ marginBottom: 16 }}
            />
          )}

          <Card size="small" style={{ marginBottom: 16 }}>
            <Tabs
              activeKey={vistaCicloActiva}
              onChange={(key) => setVistaCicloActiva(key as "temas" | "material" | "necesarios" | "quiz")}
              items={[
                { key: "temas", label: `Temas (${totalTemas})` },
                { key: "material", label: `Material didáctico (${totalMaterialDidactico})` },
                { key: "necesarios", label: `Material necesario (${totalMaterialNecesario})` },
                { key: "quiz", label: `Quiz (${quizzesClase.length})` },
              ]}
            />
          </Card>

          <div style={{ marginBottom: 16 }}>
            <Space wrap>
              {vistaCicloActiva === "temas" && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingCurso(null);
                    formCurso.resetFields();
                    formCurso.setFieldsValue({ horas: HORAS_CLASE_FIJAS });
                    setModalCursoVisible(true);
                  }}
                >
                  Agregar tema
                </Button>
              )}

              {vistaCicloActiva === "material" && (
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => {
                    const primerTema = cursosPensum[0];
                    if (!primerTema) {
                      message.warning("Primero crea al menos un tema para subir material didáctico.");
                      return;
                    }
                    abrirDrawerMaterialParaTema(primerTema.nombre_curso);
                  }}
                >
                  Subir material didáctico
                </Button>
              )}

              {vistaCicloActiva === "necesarios" && (
                <>
                  <Button
                    type="primary"
                    icon={<GiftOutlined />}
                    onClick={() => {
                      const primerTema = cursosPensum[0];
                      if (!primerTema) {
                        message.warning("Primero debes crear al menos un tema para asociar materiales.");
                        return;
                      }
                      abrirModalMaterialClase(primerTema.id);
                    }}
                  >
                    Agregar material necesario
                  </Button>
                  <Button onClick={() => setMostrarListaCompletaNecesarios((prev) => !prev)}>
                    {mostrarListaCompletaNecesarios ? "Ver insumos resumidos" : "Ver lista completa de insumos"}
                  </Button>
                </>
              )}
            </Space>
          </div>

          {vistaCicloActiva === "necesarios" && (
            <Card
              size="small"
              title="Materiales del ciclo (lista general)"
              style={{ marginBottom: 16 }}
              extra={(
                <Space wrap>
                  <Radio.Group
                    size="small"
                    value={filtroCoberturaMateriales}
                    onChange={(e) => setFiltroCoberturaMateriales(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    options={[
                      { label: `Todos (${materialesCicloGeneralOrdenados.length})`, value: "todos" },
                      {
                        label: `Lo trae (${materialesCicloGeneralOrdenados.filter((item) => normalizeMaterialCoverage(item.cobertura_material, item.incluido_kit) === "NINGUNO").length})`,
                        value: "NINGUNO",
                      },
                      {
                        label: `Plan base (${materialesCicloGeneralOrdenados.filter((item) => normalizeMaterialCoverage(item.cobertura_material, item.incluido_kit) === "MENSUAL_70").length})`,
                        value: "MENSUAL_70",
                      },
                      {
                        label: `Plan 100 (${materialesCicloGeneralOrdenados.filter((item) => normalizeMaterialCoverage(item.cobertura_material, item.incluido_kit) === "MENSUAL_100").length})`,
                        value: "MENSUAL_100",
                      },
                    ]}
                  />
                  <Button
                    onClick={() => setMostrarListaCompletaCiclo((prev) => !prev)}
                  >
                    {mostrarListaCompletaCiclo ? "Ver resumida" : "Ver lista completa"}
                  </Button>
                  {canManageMateriales ? (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => abrirModalMaterialCiclo()}
                    >
                      Agregar material del ciclo
                    </Button>
                  ) : null}
                </Space>
              )}
            >
              {materialesCicloFiltrados.length === 0 ? (
                <Text type="secondary">No hay materiales generales registrados en este ciclo.</Text>
              ) : (
                <Table
                  size="small"
                  loading={loadingMaterialesCiclo}
                  pagination={mostrarListaCompletaCiclo ? false : { pageSize: 8, hideOnSinglePage: true }}
                  rowKey={(record) => String(record?.id || record?.nombre)}
                  dataSource={materialesCicloFiltrados}
                  columns={[
                    {
                      title: "Producto",
                      dataIndex: "nombre",
                      render: (value) => <Text>{value}</Text>,
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
                      render: (_value, record: MaterialCiclo) =>
                        renderCoverageRuleTag(record?.cobertura_material, record?.incluido_kit),
                    },
                    ...(canManageMateriales
                      ? [
                          {
                            title: "Acciones",
                            key: "acciones",
                            align: "right" as const,
                            render: (_: any, record: MaterialCiclo) => (
                              <Space size={4}>
                                <Button
                                  key={`editar-ciclo-${record.id}`}
                                  type="link"
                                  icon={<EditOutlined />}
                                  onClick={() => abrirModalMaterialCiclo(record)}
                                  style={{ padding: 0, height: "auto" }}
                                />
                                <Button
                                  key={`eliminar-ciclo-${record.id}`}
                                  type="link"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleEliminarMaterialCiclo(record.id)}
                                  style={{ padding: 0, height: "auto" }}
                                />
                              </Space>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            </Card>
          )}

          {cursosPensum.length > 0 && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space wrap>
                <Text type="secondary">Mostrar:</Text>
                <Radio.Group
                  size="small"
                  value={filtroTemas}
                  onChange={(e) => setFiltroTemas(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: "Todos", value: "todos" },
                    { label: "Pendientes", value: "pendientes" },
                    { label: "Completos", value: "completos" },
                  ]}
                />
                <Text type="secondary">
                  Mostrando {cursosPensumFiltrados.length} de {cursosPensum.length} temas
                </Text>
              </Space>
            </Card>
          )}

          {cursosPensum.length === 0 ? (
            <Empty description="Sin temas en este ciclo" />
          ) : cursosPensumFiltrados.length === 0 ? (
            <Empty description="No hay temas con ese filtro en esta vista" />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
                gap: 16,
              }}
            >
              {cursosPensumFiltrados.map((curso) => {
                const materialesTema = materialesCicloDidactico.filter((material) => {
                  const { tema: temaMaterial } = parseTemaFromTitulo(material.titulo);
                  const temaMaterialNorm = normalizarTema(temaMaterial || material.titulo);
                  const temaCursoNorm = normalizarTema(curso.nombre_curso);
                  return temaMaterialNorm === temaCursoNorm;
                });
                const materialesTemaOrdenados = [...materialesTema].sort((a, b) => {
                  const prioridad = (material: MaterialDidactico) => {
                    const mime = String(material?.mime_type || "").toLowerCase();
                    if (mime === "iframe") return 0;
                    if (isPdfMaterial(material)) return 1;
                    return 2;
                  };
                  return prioridad(a) - prioridad(b);
                });
                const materialesNecesariosTema = materialesClaseCiclo.filter(
                  (material) => material.pensum_curso_id === curso.id,
                );
                const quizTema = quizzesPorTemaId.get(String(curso.id));
                const tieneMaterialDidactico = materialesTemaOrdenados.length > 0;
                const tieneMaterialNecesario = materialesNecesariosTema.length > 0;
                const tieneQuiz = Boolean(quizTema);

                return (
                  <Card
                    key={curso.id}
                    style={{
                      borderRadius: 8,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                    extra={
                      <Dropdown
                        trigger={["click"]}
                        menu={{
                          items: [
                            ...(canManageMateriales
                              ? [
                                  {
                                    key: `subir-material-${curso.id}`,
                                    label: "Subir material",
                                    icon: <UploadOutlined />,
                                    onClick: () => abrirDrawerMaterialParaTema(curso.nombre_curso),
                                  },
                                  {
                                    key: `agregar-material-necesario-${curso.id}`,
                                    label: "Agregar material necesario",
                                    icon: <PlusOutlined />,
                                    onClick: () => abrirModalMaterialClase(curso.id),
                                  },
                                  {
                                    key: `gestionar-quiz-${curso.id}`,
                                    label: quizTema ? "Editar quiz" : "Crear quiz",
                                    icon: <CheckCircleOutlined />,
                                    onClick: () => abrirModalQuiz(curso, quizTema),
                                  },
                                  ...(quizTema
                                    ? [
                                        {
                                          key: `eliminar-quiz-${curso.id}`,
                                          label: "Eliminar quiz",
                                          icon: <DeleteOutlined />,
                                          danger: true,
                                          onClick: () => handleEliminarQuiz(quizTema.id),
                                        },
                                      ]
                                    : []),
                                ]
                              : []),
                            { type: "divider" as const },
                            {
                              key: `editar-tema-${curso.id}`,
                              label: "Editar tema",
                              icon: <EditOutlined />,
                              onClick: () => {
                                setEditingCurso(curso);
                                formCurso.setFieldsValue({ ...curso, horas: HORAS_CLASE_FIJAS });
                                setModalCursoVisible(true);
                              },
                            },
                            {
                              key: `eliminar-tema-${curso.id}`,
                              label: "Eliminar tema",
                              icon: <DeleteOutlined />,
                              danger: true,
                              onClick: () => handleEliminarCurso(curso.id),
                            },
                          ],
                        }}
                      >
                        <Button type="text" icon={<EllipsisOutlined />} />
                      </Dropdown>
                    }
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                    <Text strong style={{ fontSize: 16, lineHeight: 1.35, display: "block" }}>
                      {curso.nombre_curso}
                    </Text>
                    {curso.descripcion && (
                      <p
                        style={{
                          fontSize: 14,
                          color: "#666",
                          marginTop: 10,
                          marginBottom: 10,
                        }}
                      >
                        {curso.descripcion}
                      </p>
                    )}
                    <Divider style={{ margin: "10px 0" }} />
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 14 }}>
                      <div>⏱️ {HORAS_CLASE_FIJAS} horas</div>
                      {curso.creditos && (
                        <div>⭐ {curso.creditos} créditos</div>
                      )}
                    </div>

                    <Space size={6} wrap style={{ marginBottom: 10 }}>
                      <Tag color={tieneMaterialDidactico ? "green" : "default"}>
                        Material {tieneMaterialDidactico ? "listo" : "pendiente"}
                      </Tag>
                      <Tag color={tieneMaterialNecesario ? "green" : "default"}>
                        Insumos {tieneMaterialNecesario ? "listos" : "pendientes"}
                      </Tag>
                      <Tag color={tieneQuiz ? "green" : "default"}>
                        Quiz {tieneQuiz ? "listo" : "pendiente"}
                      </Tag>
                    </Space>

                    <div style={{ marginBottom: 10 }}>
                      {vistaCicloActiva === "temas" && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => {
                            setEditingCurso(curso);
                            formCurso.setFieldsValue({ ...curso, horas: HORAS_CLASE_FIJAS });
                            setModalCursoVisible(true);
                          }}
                        >
                          Gestionar tema
                        </Button>
                      )}
                      {vistaCicloActiva === "material" && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => abrirDrawerMaterialParaTema(curso.nombre_curso)}
                        >
                          Subir material
                        </Button>
                      )}
                      {vistaCicloActiva === "necesarios" && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => abrirModalMaterialClase(curso.id)}
                        >
                          Agregar insumo
                        </Button>
                      )}
                      {vistaCicloActiva === "quiz" && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => abrirModalQuiz(curso, quizTema || null)}
                        >
                          {quizTema ? "Gestionar quiz" : "Crear quiz"}
                        </Button>
                      )}
                    </div>

                    {vistaCicloActiva === "material" && (
                      <>
                        <Text strong style={{ fontSize: 13 }}>Material didáctico</Text>
                        {materialesTemaOrdenados.length === 0 ? (
                          <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                            Sin material asignado
                          </Text>
                        ) : (
                          <List
                            size="small"
                            dataSource={materialesTemaOrdenados}
                            style={{ marginTop: 8 }}
                            renderItem={(material: MaterialDidactico) => (
                              <List.Item
                                actions={[
                                  <Button
                                    key={`ver-${material.id}`}
                                    type="link"
                                    onClick={() => handleAbrirMaterial(material.url_archivo, parseTemaFromTitulo(material.titulo).tituloLimpio || material.titulo)}
                                    icon={material.mime_type === 'link' ? <LinkOutlined /> : <EyeOutlined />}
                                    style={{ fontWeight: 500, padding: 0, height: 'auto' }}
                                  />,
                                  ...(canManageMateriales
                                    ? [
                                        <Button
                                          key={`editar-${material.id}`}
                                          type="link"
                                          icon={<EditOutlined />}
                                          onClick={() => editarMaterial(material, curso.nombre_curso)}
                                          style={{ padding: 0, height: "auto" }}
                                        />,
                                        <Button
                                          key={`eliminar-${material.id}`}
                                          type="link"
                                          danger
                                          icon={<DeleteOutlined />}
                                          onClick={() => handleEliminarMaterial(material.id)}
                                          style={{ padding: 0, height: "auto" }}
                                        />,
                                      ]
                                    : []),
                                ]}
                              >
                                <List.Item.Meta
                                  avatar={
                                    <div style={{ fontSize: 18, width: 24, textAlign: "center" }}>
                                      {material.tipo_material === "documento" && "📄"}
                                      {material.tipo_material === "video" && "🎥"}
                                      {material.tipo_material === "imagen" && "🖼️"}
                                      {material.tipo_material === "presentacion" && "📊"}
                                      {material.tipo_material === "recurso" && "🔧"}
                                      {material.tipo_material === "otro" && "📎"}
                                    </div>
                                  }
                                  title={(() => {
                                    const { tituloLimpio } = parseTemaFromTitulo(material.titulo);
                                    const esIframe = String(material.mime_type || "").toLowerCase() === "iframe";
                                    const esPdf = isPdfMaterial(material);
                                    const descripcion = String(material.descripcion || "");
                                    const esImprimibleProfesor = descripcion.includes(MATERIAL_IMPRIMIBLE_PROFESOR_TAG);
                                    const esPdfRespaldo = esPdf && (descripcion.includes("[PDF_RESPALDO_IFRAME]") || materialesTemaOrdenados.some((item) => String(item?.mime_type || "").toLowerCase() === "iframe"));

                                    return (
                                      <Space size={6} wrap>
                                        <Text>{tituloLimpio}</Text>
                                        {esImprimibleProfesor ? <Tag color="orange">Imprimible profesor</Tag> : null}
                                        {esIframe ? <Tag color="blue">Gamma</Tag> : null}
                                        {esPdfRespaldo ? <Tag color="purple">PDF respaldo</Tag> : null}
                                      </Space>
                                    );
                                  })()}
                                  description={null}
                                />
                              </List.Item>
                            )}
                          />
                        )}
                      </>
                    )}

                    {vistaCicloActiva === "quiz" && (
                      <>
                        <Divider style={{ margin: "10px 0" }} />
                        <Text strong style={{ fontSize: 13 }}>Quiz de clase</Text>
                        <div style={{ marginTop: 6, marginBottom: 10 }}>
                          {quizTema ? (
                            <Space size={8} wrap>
                              <Tag color={quizTema.publicado ? "green" : "orange"}>
                                {quizTema.publicado ? "Publicado" : "Borrador"}
                              </Tag>
                              <Tag>{quizTema.total_preguntas || 25} preguntas</Tag>
                              {canManageMateriales ? (
                                <>
                                  <Button size="small" onClick={() => abrirModalQuiz(curso, quizTema)}>
                                    Editar quiz
                                  </Button>
                                </>
                              ) : null}
                            </Space>
                          ) : (
                            <Space size={8} wrap>
                              <Text type="secondary">Sin quiz configurado para esta clase.</Text>
                              {canManageMateriales ? (
                                <Button size="small" type="primary" ghost onClick={() => abrirModalQuiz(curso, null)}>
                                  Crear quiz
                                </Button>
                              ) : null}
                            </Space>
                          )}
                        </div>
                      </>
                    )}

                    {vistaCicloActiva === "necesarios" && (
                      <>
                        <Divider style={{ margin: "10px 0" }} />
                        <Text strong style={{ fontSize: 13 }}>Materiales necesarios</Text>
                        {materialesNecesariosTema.length === 0 ? (
                          <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                            Sin materiales necesarios registrados
                          </Text>
                        ) : (
                          <Table
                            size="small"
                            loading={loadingMaterialesClase}
                            pagination={mostrarListaCompletaNecesarios ? false : { pageSize: 5, hideOnSinglePage: true }}
                            rowKey={(record) => String(record?.id || record?.nombre_material)}
                            dataSource={materialesNecesariosTema}
                            style={{ marginTop: 8 }}
                            columns={[
                              {
                                title: "Producto",
                                dataIndex: "nombre_material",
                                render: (_value, record) => <Text>{record.materiales_ciclo?.nombre || record.nombre_material}</Text>,
                              },
                              {
                                title: "Cantidad",
                                dataIndex: "cantidad",
                                render: (_value, record) =>
                                  [record.materiales_ciclo?.cantidad || record.cantidad, record.unidad]
                                    .filter(Boolean)
                                    .join(" ") || "Cantidad no especificada",
                              },
                              {
                                title: "Cobertura",
                                dataIndex: "materiales_ciclo",
                                align: "center",
                                render: (value) =>
                                  renderCoverageRuleTag(value?.cobertura_material, value?.incluido_kit),
                              },
                              ...(canManageMateriales
                                ? [
                                    {
                                      title: "Acciones",
                                      key: "acciones",
                                      align: "right" as const,
                                      render: (_: any, record: MaterialClase) => (
                                        <Space size={4}>
                                          <Button
                                            key={`editar-necesario-${record.id}`}
                                            type="link"
                                            icon={<EditOutlined />}
                                            onClick={() => abrirModalMaterialClase(curso.id, record)}
                                            style={{ padding: 0, height: "auto" }}
                                          />
                                          <Button
                                            key={`eliminar-necesario-${record.id}`}
                                            type="link"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleEliminarMaterialClase(record.id)}
                                            style={{ padding: 0, height: "auto" }}
                                          />
                                        </Space>
                                      ),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        )}
                      </>
                    )}

                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Crear/Editar Tema */}
      <Modal
        title={editingCurso ? `Editar: ${editingCurso.nombre_curso}` : "Agregar Nuevo Tema"}
        open={modalCursoVisible}
        onOk={handleGuardarCurso}
        onCancel={() => {
          setModalCursoVisible(false);
          setEditingCurso(null);
          formCurso.resetFields();
        }}
      >
        <Form form={formCurso} layout="vertical">
          <Form.Item
            name="nombre_curso"
            label="Nombre del Tema"
            rules={[{ required: true, message: "El nombre es requerido" }]}
          >
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} placeholder="Descripción breve del tema" />
          </Form.Item>

          <Form.Item name="horas" label="Horas">
            <InputNumber min={HORAS_CLASE_FIJAS} max={HORAS_CLASE_FIJAS} disabled style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="creditos" label="Créditos">
            <InputNumber min={0} placeholder="0" />
          </Form.Item>

          <Form.Item
            name="tipo_curso"
            label="Tipo"
            rules={[{ required: true, message: "Selecciona un tipo" }]}
          >
            <Select
              options={[
                { label: "Obligatorio", value: "obligatorio" },
                { label: "Electivo", value: "electivo" },
                { label: "Complementario", value: "complementario" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: Editar Ciclo */}
      <Modal
        title={`Editar Ciclo ${editingCiclo?.numero_ciclo}`}
        open={modalCicloVisible}
        onOk={handleGuardarCiclo}
        onCancel={() => setModalCicloVisible(false)}
      >
        <Form form={formCiclo} layout="vertical">
          <Form.Item 
            name="nombre_ciclo" 
            label="Nombre del Ciclo / Título"
            help="Ej: Introducción, Técnicas Avanzadas, etc."
          >
            <Input placeholder="Nombre descriptivo del ciclo" />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="¿Qué se aprenderá en este ciclo?" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingMaterialCiclo ? "Editar material del ciclo" : "Agregar material del ciclo"}
        open={modalMaterialCicloVisible}
        onOk={handleGuardarMaterialCiclo}
        onCancel={() => {
          setModalMaterialCicloVisible(false);
          setEditingMaterialCiclo(null);
          formMaterialCiclo.resetFields();
        }}
      >
        <Form form={formMaterialCiclo} layout="vertical">
          <Form.Item
            name="nombre"
            label="Nombre del material"
            rules={[{ required: true, message: "El nombre es requerido" }]}
          >
            <Input placeholder="Ej: Esmalte base" />
          </Form.Item>

          <Form.Item name="cantidad" label="Cantidad">
            <Input placeholder="Ej: 1 unidad, 2 ml" />
          </Form.Item>

          <Form.Item name="cobertura_material" label="Cobertura del material" initialValue="NINGUNO">
            <Select
              options={[
                { value: "NINGUNO", label: "No incluido en mensualidad" },
                { value: "MENSUAL_70", label: "Incluido desde Mensual 70" },
                { value: "MENSUAL_100", label: "Solo incluido en Mensual 100" },
              ]}
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Recomendación"
            description="Usa 'Mensual 70' para materiales base compartidos y 'Mensual 100' para materiales premium o completos que solo recibe ese plan."
          />

          <Form.Item name="orden" label="Orden" initialValue={1}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingQuiz ? "Editar quiz de clase" : "Crear quiz de clase"}
        open={modalQuizVisible}
        onCancel={() => {
          setModalQuizVisible(false);
          setEditingQuiz(null);
          setCursoQuizActivo(null);
          setPdfClaseActual(null);
          setPdfsCiclo([]);
          formQuiz.resetFields();
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setModalQuizVisible(false);
              setEditingQuiz(null);
              setCursoQuizActivo(null);
              setPdfClaseActual(null);
              setPdfsCiclo([]);
              formQuiz.resetFields();
            }}
            disabled={generandoQuizIA}
          >
            Cancelar
          </Button>,
          pdfClaseActual && (
            <Button
              key="ia"
              type="primary"
              style={{ background: "#722ed1", borderColor: "#722ed1" }}
              loading={generandoQuizIA}
              onClick={generarQuizConIA}
              icon={<span>✨</span>}
            >
              {generandoQuizIA ? "Generando con IA…" : "✨ Generar 25 preguntas con IA"}
            </Button>
          ),
          <Button
            key="ok"
            type="primary"
            onClick={handleGuardarQuiz}
            disabled={generandoQuizIA}
          >
            {editingQuiz ? "Guardar cambios" : "Crear quiz"}
          </Button>,
        ].filter(Boolean)}
      >
        <Form form={formQuiz} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              cursoQuizActivo
                ? `Clase: ${cursoQuizActivo.nombre_curso}`
                : "Selecciona un tema"
            }
            description="Configura el quiz de esta clase. La IA usará todos los PDFs detectados de este tema para generar las preguntas."
          />

          {pdfsCiclo.length > 0 ? (
            <Form.Item
              label={<span>📄 PDFs detectados para esta clase</span>}
              style={{ marginBottom: 12 }}
            >
              <List
                size="small"
                bordered
                dataSource={pdfsCiclo}
                renderItem={(pdf) => (
                  <List.Item>
                    <Space>
                      <FileOutlined />
                      <Text>{pdf.titulo || pdf.nombre}</Text>
                    </Space>
                  </List.Item>
                )}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#555' }}>
                <small style={{ color: '#722ed1' }}>Se usarán {pdfsCiclo.length} PDF(s) para generar el quiz con IA.</small>
              </div>
            </Form.Item>
          ) : (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Sin PDFs en esta clase"
              description="No hay PDFs asociados a esta clase. Ve a la pestaña de Materiales, sube los PDFs del tema y luego vuelve aquí a generar el quiz."
            />
          )}

          <Form.Item
            name="titulo"
            label="Título del quiz"
            rules={[{ required: true, message: "El título es obligatorio" }]}
          >
            <Input placeholder="Ej: Quiz Clase 5" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} placeholder="Instrucciones para el estudiante" />
          </Form.Item>

          <Form.Item
            name="total_preguntas"
            label="Total de preguntas"
            initialValue={25}
            rules={[{ required: true, message: "Ingresa el total de preguntas" }]}
          >
            <InputNumber min={1} max={100} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="publicado" label="Estado de publicación" initialValue={false}>
            <Select
              options={[
                { value: false, label: "Borrador (no visible para estudiantes)" },
                { value: true, label: "Publicado (visible para estudiantes)" },
              ]}
            />
          </Form.Item>

          <Form.Item name="activo" label="Activo" initialValue={true}>
            <Select
              options={[
                { value: true, label: "Sí" },
                { value: false, label: "No" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingMaterialClase ? "Editar material necesario" : "Agregar material necesario"}
        open={modalMaterialClaseVisible}
        onOk={handleGuardarMaterialClase}
        onCancel={() => {
          setModalMaterialClaseVisible(false);
          setEditingMaterialClase(null);
          formMaterialClase.resetFields();
        }}
      >
        <Form form={formMaterialClase} layout="vertical">
          <Form.Item
            name="pensum_curso_id"
            label="Tema"
            rules={[{ required: true, message: "Selecciona un tema" }]}
          >
            <Select
              options={cursosPensum.map((curso) => ({
                value: curso.id,
                label: curso.nombre_curso,
              }))}
            />
          </Form.Item>

          <Form.Item
            name={editingMaterialClase ? "material_ciclo_id" : "material_ciclo_ids"}
            label="Material del ciclo (lista general)"
            rules={materialesCicloGeneralOrdenados.length > 0 ? [{ required: true, message: "Selecciona al menos un material del ciclo" }] : []}
          >
            <Select
              allowClear
              mode={editingMaterialClase ? undefined : "multiple"}
              showSearch
              optionFilterProp="label"
              placeholder={editingMaterialClase ? "Selecciona un material del ciclo" : "Selecciona uno o varios materiales del ciclo"}
              options={materialesCicloGeneralOrdenados.map((material) => ({
                value: material.id,
                label: `${material.nombre} (${getMaterialCoverageRuleDisplay(material.cobertura_material, material.incluido_kit).shortLabel})`,
              }))}
              onChange={(value) => {
                const selectedIds = Array.isArray(value) ? value : [value].filter(Boolean);
                if (selectedIds.length !== 1) return;
                const selected = materialesCicloGeneralOrdenados.find((item) => String(item.id) === String(selectedIds[0]));
                if (!selected) return;
                if (!editingMaterialClase) {
                  formMaterialClase.setFieldsValue({
                    nombre_material: selected.nombre,
                    cantidad: selected.cantidad || "",
                  });
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="nombre_material"
            label="Material requerido"
            rules={[{ required: true, message: "El material es requerido" }]}
          >
            <Input placeholder="Ej: Cuaderno de dibujo" />
          </Form.Item>

          <Space style={{ width: "100%" }} align="start">
            <Form.Item name="cantidad" label="Cantidad" style={{ flex: 1 }}>
              <Input placeholder="Ej: 1" />
            </Form.Item>
            <Form.Item name="unidad" label="Unidad" style={{ flex: 1 }}>
              <Input placeholder="Ej: unidad(es), paquete" />
            </Form.Item>
          </Space>

          <Form.Item name="orden" label="Orden">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={3} placeholder="Detalles adicionales del material" />
          </Form.Item>
        </Form>
      </Modal>

      {/* DRAWER: Subir Material Didáctico */}
      <Drawer
        title={editingMaterial ? "Editar Material Didáctico" : "Subir Material Didáctico"}
        placement="right"
        onClose={() => {
          setDrawerMaterialesVisible(false);
          setEditingMaterial(null);
          formMaterial.resetFields();
          setFileList([]);
          setTipoOrigen('archivo');
        }}
        open={drawerMaterialesVisible}
        width={500}
      >
        <Form form={formMaterial} layout="vertical">
          <Alert
            message={`Material para: ${pensums.find(p => p.id === selectedCicloId)?.nombre_ciclo || `Ciclo ${pensums.find(p => p.id === selectedCicloId)?.numero_ciclo}`}`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="tema_relacionado"
            label="Tema relacionado (opcional)"
            help="Selecciona el tema para que el material quede claramente asociado."
          >
            <Select
              allowClear
              placeholder="Ej: Introducción, Herramientas, Técnica base"
              options={cursosPensum.map((curso) => ({
                value: curso.nombre_curso,
                label: curso.nombre_curso,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="titulo"
            label="Título del Material"
            rules={[{ required: true, message: "El título es requerido" }]}
            help={editingMaterial ? "Escribe solo el nombre corto (sin el prefijo del tema). El prefijo se agrega automáticamente." : undefined}
          >
            <Input placeholder="Ej: Guía de Práctica 1" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción breve del material" />
          </Form.Item>

          <Form.Item
            name="uso_material"
            label="Uso del material"
            initialValue="general"
          >
            <Select
              options={[
                { label: "General (visible para alumnos y profesor)", value: "general" },
                { label: "Material imprimible (solo profesor)", value: "imprimible_profesor" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="tipo_material"
            label="Tipo de Material"
            rules={[{ required: true, message: "Selecciona un tipo" }]}
          >
            <Select
              options={[
                { label: "📄 Documento (PDF, Word)", value: "documento" },
                { label: "🎥 Video", value: "video" },
                { label: "🖼️ Imagen", value: "imagen" },
                { label: "📊 Presentación", value: "presentacion" },
                { label: "🔧 Recurso", value: "recurso" },
                { label: "📎 Otro", value: "otro" },
              ]}
            />
          </Form.Item>

          <Form.Item label="Origen del Contenido" style={{ marginBottom: 12 }}>
             <Radio.Group 
               value={tipoOrigen} 
               onChange={(e) => setTipoOrigen(e.target.value)}
               buttonStyle="solid"
             >
               <Radio.Button value="archivo">Subir Archivo</Radio.Button>
               <Radio.Button value="enlace">Enlace (YouTube, Drive, etc.)</Radio.Button>
               <Radio.Button value="iframe">Código iframe (Gamma)</Radio.Button>
             </Radio.Group>
          </Form.Item>

          {tipoOrigen === 'archivo' ? (
            <Form.Item
              name="archivo"
              label="Archivo"
              rules={[{ required: true, message: "Selecciona un archivo" }]}
            >
              <Upload
                beforeUpload={() => false}
                fileList={fileList}
                onChange={(info) => setFileList(info.fileList)}
                maxCount={1}
              >
                <Button icon={<UploadOutlined />}>Seleccionar Archivo</Button>
              </Upload>
            </Form.Item>
          ) : tipoOrigen === 'enlace' ? (
            <Form.Item
              name="url_externa"
              label="URL del Enlace"
              rules={[
                { required: true, message: "Ingresa la URL" },
                { type: 'url', message: "Ingresa una URL válida (https://...)" }
              ]}
            >
              <Input prefix={<LinkOutlined />} placeholder="https://youtube.com/..." />
            </Form.Item>
          ) : (
            <Form.Item
              name="iframe_code"
              label="Código iframe de Gamma"
              rules={[{ required: true, message: "Pega el código iframe" }]}
              extra="Pega aquí el embed completo que te da Gamma."
            >
              <Input.TextArea
                rows={6}
                placeholder='<iframe src="https://gamma.app/embed/..." width="100%" height="600" frameborder="0" allowfullscreen></iframe>'
              />
            </Form.Item>
          )}

          <Space style={{ width: "100%" }}>
            <Button
              type="primary"
              loading={uploadingMaterial}
              onClick={handleSubirMaterial}
              block
            >
              Subir Material
            </Button>
            <Button
              onClick={() => {
                setDrawerMaterialesVisible(false);
                formMaterial.resetFields();
                setFileList([]);
                setTipoOrigen('archivo');
              }}
              block
            >
              Cancelar
            </Button>
          </Space>
        </Form>
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
        {iframePreview.open && iframePreview.src ? (
          <iframe
            src={iframePreview.src}
            title={iframePreview.title || "Presentación"}
            style={{ width: "100%", height: "100%", border: 0 }}
            allow="fullscreen; clipboard-read; clipboard-write"
            allowFullScreen
            loading="lazy"
          />
        ) : null}
      </Modal>
    </Drawer>
  );
}
