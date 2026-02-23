"use client";

import React, { useEffect, useRef, useState } from "react";
import { logger } from "@utils/logger";
import {
  Tabs,
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
  Dropdown,
  Checkbox,
  Collapse,
  Grid,
  Modal,
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
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesCicloPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";

dayjs.locale("es");

const { Title, Text } = Typography;

export default function PortalEstudiante() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeTab, setActiveTab] = useState("1");
  const [loading, setLoading] = useState(true);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [pensum, setPensum] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesCiclo, setMaterialesCiclo] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
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

  const isIframeMaterial = (material: any) => {
    const mime = String(material?.mime_type || "").toLowerCase();
    const tipo = String(material?.tipo_material || "").toLowerCase();
    const url = String(material?.url_archivo || "").toLowerCase();
    return mime === "iframe" || tipo === "iframe" || url.includes("<iframe") || url.includes("gamma.app");
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
        src,
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
            .select("curso_id, fecha, tema_visto")
            .in("curso_id", cursoIds);

          const { data: sesionesData } = await (fechaMin && fechaMax
            ? sesionesQuery.gte("fecha", fechaMin).lte("fecha", fechaMax)
            : sesionesQuery);

          const temaPorCursoFecha = new Map<string, string>();
          (sesionesData || []).forEach((sesion: any) => {
            const key = `${sesion?.curso_id || ""}-${sesion?.fecha || ""}`;
            if (!temaPorCursoFecha.has(key)) {
              temaPorCursoFecha.set(key, sesion?.tema_visto || "");
            }
          });

          asistenciasConTema = (dataAsistencias || []).map((asistencia: any) => {
            const cursoId = asistencia?.matriculas?.curso_id;
            const key = `${cursoId || ""}-${asistencia?.fecha || ""}`;
            return {
              ...asistencia,
              tema_visto: temaPorCursoFecha.get(key) || null,
            };
          });
        }

        setAsistencias(asistenciasConTema);

        // Calificaciones
        const { data: dataCalificaciones } = await supabaseBrowserClient
          .from("calificaciones")
          .select("*, matriculas(id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha_evaluacion", { ascending: false });
        setCalificaciones(dataCalificaciones || []);
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

            return {
              key: cicloId,
              label: (
                <Space size={16} align="center">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      background: colorDiferenciadorCiclo,
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
                    const insumosMarcados = insumosTema.filter((insumo: any) => {
                      const key = `${matriculaSeleccionada.id}|${temaId}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
                      return Boolean(checklistInsumos[key]);
                    }).length;

                    return (
                      <List.Item key={temaId}>
                        <List.Item.Meta
                          avatar={<span style={{ fontSize: 20, fontWeight: 700, color: colorNumeroTema }}>{tema.orden || temaIndex + 1}</span>}
                          title={<Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>}
                          description={
                            <Space direction="vertical" size={4}>
                              {tema.descripcion ? (
                                <div>
                                  <Text type="secondary">{tema.descripcion}</Text>
                                </div>
                              ) : null}

                              {vista === "plan" ? (
                                recursosTema.length ? (
                                  <Space wrap size={isMobile ? 6 : 10} direction={isMobile ? "vertical" : "horizontal"}>
                                    {recursosTema.map((item: any, itemIndex: number) => {
                                      const titulo = getMaterialCanonicalTitle(item, tema?.nombre_curso) || item.titulo || "Recurso";
                                      return (
                                        <Tag
                                          key={`${temaId}-recurso-${itemIndex}`}
                                          icon={getMaterialIcon(item)}
                                          style={{ cursor: item?.url_archivo ? "pointer" : "default" }}
                                          onClick={() => abrirMaterialDidactico(item, titulo)}
                                        >
                                          {titulo}
                                        </Tag>
                                      );
                                    })}
                                  </Space>
                                ) : (
                                  <Text type="secondary" style={{ fontSize: 12 }}>Sin material didáctico</Text>
                                )
                              ) : insumosTema.length ? (
                                <Space direction="vertical" size={4} style={{ width: "100%" }}>
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
                                          <Text type="secondary" style={{ fontSize: 12 }}>
                                            {nombreInsumo}
                                            {cantidadInsumo ? ` (${cantidadInsumo}${insumo.unidad ? ` ${insumo.unidad}` : ""})` : ""}
                                          </Text>
                                        </Checkbox>
                                      </Space>
                                    );
                                  })}
                                </Space>
                              ) : (
                                <Text type="secondary" style={{ fontSize: 12 }}>Sin materiales registrados</Text>
                              )}
                              {vista === "kits" && insumosTema.length > 0 ? (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {insumosMarcados}/{insumosTema.length} listos
                                </Text>
                              ) : null}
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

  const renderPensum = () => renderRutaAcademica("plan");

  const renderMaterialesKits = () => renderRutaAcademica("kits");

  const renderMaterialesCiclo = () => renderRutaAcademica("ciclo");

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
      <div className="portal-estudiante" style={{ padding: isMobile ? "12px" : "20px", maxWidth: "1200px", margin: "0 auto" }}>
        <Card style={{ marginBottom: 20 }}>
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: "45%" }} />
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Space size={12} wrap>
            <Skeleton.Button active size="small" style={{ width: 120 }} />
            <Skeleton.Button active size="small" style={{ width: 140 }} />
            <Skeleton.Button active size="small" style={{ width: 110 }} />
            <Skeleton.Button active size="small" style={{ width: 105 }} />
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 5 }} title={{ width: "60%" }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 5 }} title={{ width: "55%" }} />
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  return (
    <div className="portal-estudiante" style={{ padding: isMobile ? "12px" : "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16} className="header-row" align="middle">
          <Col xs={24} sm={14}>
            <Space size={16} align="center">
              {logoAcademia ? (
                <img
                  src={logoAcademia}
                  alt="Logo academia"
                  className="academy-logo"
                />
              ) : null}
              <div>
                <Text style={{ display: "block", fontSize: isMobile ? 16 : 18, fontWeight: 600 }}>
                  Te damos la Bienvenida
                </Text>
                <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                  Portal de Estudiante
                </Text>
              </div>
            </Space>
          </Col>
          <Col xs={24} sm={10} className="header-actions" style={{ textAlign: "right" }}>
            {(whatsappAgente || whatsappAdmisiones) && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "agente",
                      label: "Hablar con Agente",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAgente,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Tengo una consulta sobre mis cursos en el portal.`
                        ),
                      disabled: !whatsappAgente,
                    },
                    {
                      key: "admisiones",
                      label: "Hablar con Admisiones",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAdmisiones,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Necesito apoyo de Admisiones.`
                        ),
                      disabled: !whatsappAdmisiones,
                    },
                  ],
                }}
              >
                <Button
                  className="whatsapp-button"
                  icon={<WhatsAppOutlined />}
                  type="primary"
                  size="middle"
                  aria-label="Contactar por WhatsApp"
                  style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
                >
                  WhatsApp
                </Button>
              </Dropdown>
            )}
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Mis Cursos</span>,
            children: (
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
              </>
            ),
          },
          {
            key: "2",
            label: <span><DollarCircleOutlined /> Financiero</span>,
            children: renderFinanciero()
          },
          {
            key: "3",
            label: <span><FileOutlined /> Lista de materiales</span>,
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {renderMaterialesKits()}
              </Space>
            )
          },
          {
            key: "4",
            label: <span><BookOutlined /> Materiales del ciclo</span>,
            children: renderMaterialesCiclo(),
          },
          {
            key: "5",
            label: <span><BookOutlined /> Pensum</span>,
            children: renderPensum()
          },
          {
            key: "6",
            label: <span><CheckCircleOutlined /> Asistencia</span>,
            children: (
              <Table
                dataSource={asistencias}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Fecha", dataIndex: "fecha", render: (f) => formatDate(f) },
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Tema visto", dataIndex: "tema_visto", render: (t) => t || "-" },
                  { title: "Estado", dataIndex: "estado", render: (e) => <Tag color={e === "presente" ? "green" : "red"}>{e?.toUpperCase()}</Tag> },
                ]}
              />
            ),
          },
          {
            key: "7",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <Table
                dataSource={calificaciones}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Nota", dataIndex: "calificacion", render: (c) => <Tag color={c >= 70 ? "green" : "red"}>{c}</Tag> },
                  { title: "Fecha", dataIndex: "fecha_evaluacion", render: (f) => formatDate(f) },
                ]}
              />
            ),
          },
          {
            key: "8",
            label: <span><TrophyOutlined /> Certificados</span>,
            children: (
              <Table
                dataSource={certificados}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.cursos?.nombre },
                  { title: "Nota Final", dataIndex: "nota_final" },
                  { title: "Acción", render: (_, r) => <Button icon={<DownloadOutlined />} onClick={() => descargarCertificado(r)}>Descargar</Button> }
                ]}
              />
            ),
          }
        ]}
      />
      <Modal
        title={iframePreview.title || "Presentación"}
        open={iframePreview.open}
        onCancel={() => setIframePreview({ open: false, title: "", src: "" })}
        footer={null}
        width={isMobile ? "95%" : 980}
        destroyOnClose
      >
        <iframe
          src={iframePreview.src}
          title={iframePreview.title || "Presentación"}
          width="100%"
          height={isMobile ? 720 : 620}
          style={{ border: 0, borderRadius: 8 }}
          allow="fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </Modal>
      <style jsx global>{`
        .portal-estudiante .header-row {
          align-items: center;
        }
        .portal-estudiante .academy-logo {
          height: 60px;
          width: auto;
          object-fit: contain;
        }
        .portal-estudiante .whatsapp-button {
          padding: 0 18px;
          height: 38px;
          border-radius: 999px;
          font-weight: 600;
          letter-spacing: 0.2px;
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
        @media (max-width: 576px) {
          .portal-estudiante {
            padding: 12px !important;
          }
          .portal-estudiante .header-row {
            text-align: center;
          }
          .portal-estudiante .academy-logo {
            height: 48px;
          }
          .portal-estudiante .header-actions {
            text-align: center !important;
            margin-top: 12px;
          }
          .portal-estudiante .header-actions .ant-btn {
            width: 100%;
          }
          .portal-estudiante .ant-card-head-title {
            white-space: normal;
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
          }
        }
      `}</style>
    </div>
  );
}
