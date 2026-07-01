"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { Show } from "@refinedev/antd";
import {
  Typography,
  Row,
  Col,
  Card,
  Button,
  Statistic,
  Spin,
  Table,
  Tag,
  Avatar,
  Alert,
  Tabs,
  Divider,
  Descriptions,
  Result,
  Space,
  Tooltip,
  Modal,
  Popconfirm,
  Form,
  Select,
  DatePicker,
  Input,
} from "antd";
import {
  UserOutlined,
  DollarCircleOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  MailOutlined,
  IdcardOutlined,
  HomeOutlined,
  TeamOutlined,
  WhatsAppOutlined,
  PrinterOutlined,
  CameraOutlined,
  UploadOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  PlusOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { message, Upload } from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { formatDate } from "@utils/date";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { construirNombreGrupo } from "@utils/grupos";
import { enviarWhatsapp } from "@utils/whatsapp";
import { obtenerPensumPorProgramas } from "@modules/academico/pensum.service";
import { HistorialEntregas } from "@components/EntregaMaterialModal";
import { abrirTicketPagoDesdeBlob, formatTicketReference, generarTicketPagoBlob } from "@utils/pago-ticket";
import { subirTicketPago } from "@utils/ticket-storage";
import { getPaymentPlan, getPaymentPlanDisplay, normalizeModalidadPago } from "@/types/payment-plans";
import { getDescuentoAplicado, getMontoProgramado, getSaldoPendiente, getTotalAbonado, getVisiblePaymentStatus } from "@utils/payment-balances";

type Matricula = {
  id: number;
  fecha_inicio: string | null;
  estado: string | null;
  modalidad_pago?: string | null;
  valor_mensual_plan?: number | null;
  porcentaje_productos?: number | null;
  monto_pagado: number | null;
  deuda_pendiente: number | null;
  nota_final: number | null;
  cursos: {
    id: string;
    programa_id?: number | null;
    nombre: string | null;
    descripcion: string | null;
    precio: number | null;
    precio_inscripcion?: number | null;
    precio_mensualidad: number | null;
    perfiles?: {
      nombre_completo: string | null;
    } | null;
  } | null;
};

type Pago = {
  id: string;
  created_at?: string | null;
  fecha_pago: string | null;
  fecha_vencimiento?: string | null;
  numero_cuota?: number | null;
  matricula_id: number | null;
  matriculas: {
    modalidad_pago?: string | null;
    valor_mensual_plan?: number | null;
    porcentaje_productos?: number | null;
    cursos: {
      nombre: string | null;
    } | null;
  } | null;
  monto: number | null;
  monto_programado?: number | null;
  descuento_aplicado?: number | null;
  total_abonado?: number | null;
  saldo_pendiente?: number | null;
  motivo_descuento?: string | null;
  metodo_pago: string | null;
  referencia: string | null;
  observaciones: string | null;
  periodo_pagado: string | null;
  estado?: string | null;
  ticket_url?: string | null;
};

type Estadisticas = {
  totalCursos: number;
  cursosActivos: number;
  cursosFinalizados: number;
  totalPagado: number;
  deudaTotal: number;
};

const AUTO_SESSION_TOPIC_PATTERN = /sesi[oó]n programada autom[aá]tic[ae]mente para c[aá]lculo de ciclos/i;

type AsistenciaEstudiante = {
  id: string;
  fecha: string | null;
  estado: string | null;
  observaciones?: string | null;
  matricula_id: number | null;
  clase_numero?: number | null;
  tema_visto?: string | null;
  pago_id?: number | null;
  estado_pago?: string | null;
  monto_pago?: number | null;
  es_placeholder?: boolean;
  curso_nombre?: string | null;
  registros_duplicados?: number;
  es_divisor_ciclo?: boolean;
  ciclo_numero?: number | null;
  ciclo_nombre?: string | null;
};

const { Title, Text } = Typography;

export default function StudentDetailView() {
  const params = useParams();
  const router = useRouter();
  const idEstudiante = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<any>(null);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [pagosHistorial, setPagosHistorial] = useState<Pago[]>([]);
  const [asistenciasHistorial, setAsistenciasHistorial] = useState<AsistenciaEstudiante[]>([]);
  const [deletingAsistenciaId, setDeletingAsistenciaId] = useState<string | null>(null);
  const [modalRegistrarClase, setModalRegistrarClase] = useState(false);
  const [registrandoClase, setRegistrandoClase] = useState(false);
  const [formRegistrarClase] = Form.useForm();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [estadisticasGlobales, setEstadisticasGlobales] = useState<Estadisticas>({
    totalCursos: 0,
    cursosActivos: 0,
    cursosFinalizados: 0,
    totalPagado: 0,
    deudaTotal: 0,
  });
  const [totalClasesPorPrograma, setTotalClasesPorPrograma] = useState<Record<string, number>>({});
  const [metaCiclosPorPrograma, setMetaCiclosPorPrograma] = useState<Record<string, Record<number, { cicloNumero: number | null; cicloNombre: string | null }>>>({});
  const [ciclosPorMatricula, setCiclosPorMatricula] = useState<Record<number, { total: number; pagados: number; faltantes: number; periodos: string[]; inscripcionPagada: boolean }>>({});

  const parseDuracionMeses = (valor?: string | number | null) => {
    if (typeof valor === "number" && Number.isFinite(valor)) return Math.max(valor, 0);
    const texto = String(valor ?? "");
    const match = texto.match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const parseNumeroCuota = useCallback((pago: any): number | null => {
    const numero = Number(pago?.numero_cuota);
    if (Number.isFinite(numero) && numero > 0) return numero;
    const raw = String(pago?.periodo_pagado || pago?.observaciones || "");
    const match = raw.match(/\d+/);
    return match ? Number(match[0]) : null;
  }, []);

  const extractClassNumber = (value?: string | null): number | null => {
    const text = String(value || "");
    const patterns = [
      /clase\s*#?\s*(\d{1,3})/i,
      /\b(\d{1,3})\b\s*$/,
      /^\s*(\d{1,3})\b/,
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

  const esInscripcion = useCallback((pago: any) => {
    const texto = String(pago?.periodo_pagado || pago?.observaciones || "").toLowerCase();
    return texto.includes("matric") || Number(pago?.numero_cuota) === 0;
  }, []);

  const esPagoHistoricoPorClase = useCallback((pago: any, modalidadActual?: string | null) => {
    const modalidad = normalizeModalidadPago(modalidadActual || pago?.matriculas?.modalidad_pago);
    if (modalidad === "POR_CLASE") return false;

    const tipoCuota = String(pago?.tipo_cuota || "").toLowerCase().trim();
    const periodo = String(pago?.periodo_pagado || pago?.observaciones || "").toLowerCase().trim();
    return tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodo);
  }, []);

  const getPeriodoPagoLegible = useCallback((pago: any, modalidadActual?: string | null) => {
    const periodoActual = String(pago?.periodo_pagado || "").trim();
    const numeroCuota = Number(pago?.numero_cuota || 0);
    const modalidad = normalizeModalidadPago(modalidadActual || pago?.matriculas?.modalidad_pago);

    if (numeroCuota === 0 || esInscripcion(pago)) {
      return periodoActual || "Inscripción";
    }

    if (modalidad === "POR_CLASE") {
      return `Clase #${numeroCuota}`;
    }

    if (esPagoHistoricoPorClase(pago, modalidad)) {
      return "Pago previo por clase";
    }

    return periodoActual || `Cuota ${numeroCuota}`;
  }, [esInscripcion, esPagoHistoricoPorClase]);

  const numeroCuotaVisualPorPagoId = useMemo(() => {
    const mapa = new Map<string, number>();
    if (!Array.isArray(pagosHistorial) || !Array.isArray(matriculas) || pagosHistorial.length === 0) {
      return mapa;
    }

    const pagosPorMatricula = new Map<string, Pago[]>();
    pagosHistorial.forEach((pago) => {
      const key = String(pago?.matricula_id || "");
      if (!key) return;
      const actuales = pagosPorMatricula.get(key) || [];
      actuales.push(pago);
      pagosPorMatricula.set(key, actuales);
    });

    matriculas.forEach((matricula: any) => {
      const modalidad = normalizeModalidadPago(matricula?.modalidad_pago);
      if (modalidad === "POR_CLASE") return;

      const key = String(matricula?.id || "");
      const pagosMatricula = (pagosPorMatricula.get(key) || [])
        .filter((pago) => !esInscripcion(pago))
        .filter((pago) => !esPagoHistoricoPorClase(pago, modalidad))
        .sort((a, b) => {
          const numeroA = parseNumeroCuota(a) ?? Number.MAX_SAFE_INTEGER;
          const numeroB = parseNumeroCuota(b) ?? Number.MAX_SAFE_INTEGER;
          if (numeroA !== numeroB) return numeroA - numeroB;

          const fechaA = a?.fecha_pago ? dayjs(a.fecha_pago).valueOf() : Number.MAX_SAFE_INTEGER;
          const fechaB = b?.fecha_pago ? dayjs(b.fecha_pago).valueOf() : Number.MAX_SAFE_INTEGER;
          if (fechaA !== fechaB) return fechaA - fechaB;

          const createdA = a?.created_at ? dayjs(a.created_at).valueOf() : Number.MAX_SAFE_INTEGER;
          const createdB = b?.created_at ? dayjs(b.created_at).valueOf() : Number.MAX_SAFE_INTEGER;
          if (createdA !== createdB) return createdA - createdB;

          return String(a?.id || "").localeCompare(String(b?.id || ""));
        });

      pagosMatricula.forEach((pago, idx) => {
        if (!pago?.id) return;
        mapa.set(String(pago.id), idx + 1);
      });
    });

    return mapa;
  }, [esInscripcion, esPagoHistoricoPorClase, matriculas, pagosHistorial, parseNumeroCuota]);

  const obtenerDuracionMeses = useCallback((matricula: any) =>
    parseDuracionMeses(
      matricula?.cursos?.programas?.duracion ??
      matricula?.cursos?.duracion ??
      matricula?.cursos?.numero_cuotas ??
      matricula?.numero_cuotas
    ), []);

  const obtenerMensualidad = (matricula: any) =>
    Number(
      matricula?.valor_mensual_plan ??
      getPaymentPlan(matricula?.modalidad_pago).montoMensual ??
      matricula?.cursos?.precio_mensualidad ??
      matricula?.cursos?.programas?.precio_mensualidad ??
      0
    );

  const obtenerValorPorClase = (matricula: any) =>
    Number(
      matricula?.valor_por_clase ??
      getPaymentPlan("POR_CLASE").montoPorClase ??
      40000
    );

  const obtenerValorInscripcion = (matricula: any) =>
    Number(
      matricula?.cursos?.precio_inscripcion ??
      matricula?.precio_inscripcion ??
      matricula?.cursos?.precio ??
      0
    );

  const obtenerTotalClasesPrograma = useCallback((matricula: any) => {
    const programaId = String(matricula?.cursos?.programa_id || "");
    if (!programaId) return 0;
    return Number(totalClasesPorPrograma[programaId] || 0);
  }, [totalClasesPorPrograma]);

  const calcularFechaVencimientoCuota = (matricula: any, numeroCuota: number) => {
    if (!numeroCuota || numeroCuota < 1) return null;
    const fechaBase = matricula?.fecha_inicio
      ? dayjs(matricula.fecha_inicio)
      : null;
    if (!fechaBase || !fechaBase.isValid()) return null;
    // Cuota 1 vence el mismo día de inicio, cuota 2 un mes después, etc.
    return fechaBase.add(numeroCuota - 1, "month").format("YYYY-MM-DD");
  };

  const parseDiasSemana = (value?: string | null): number[] => {
    const raw = String(value || "").toLowerCase();
    if (!raw) return [];

    const diasMap: Array<{ keys: string[]; day: number }> = [
      { keys: ["domingo", "dom"], day: 0 },
      { keys: ["lunes", "lun"], day: 1 },
      { keys: ["martes", "mar"], day: 2 },
      { keys: ["miercoles", "miércoles", "mie", "mié"], day: 3 },
      { keys: ["jueves", "jue"], day: 4 },
      { keys: ["viernes", "vie"], day: 5 },
      { keys: ["sabado", "sábado", "sab", "sáb"], day: 6 },
    ];

    const result = new Set<number>();
    diasMap.forEach(({ keys, day }) => {
      if (keys.some((k) => raw.includes(k))) result.add(day);
    });
    return Array.from(result.values()).sort((a, b) => a - b);
  };

  const calcularFechaVencimientoClase = (matricula: any, numeroClase: number) => {
    if (!numeroClase || numeroClase < 1) return null;
    const fechaBase = matricula?.fecha_inicio ? dayjs(matricula.fecha_inicio).startOf("day") : null;
    if (!fechaBase || !fechaBase.isValid()) return null;

    const dias = parseDiasSemana(matricula?.cursos?.dias_semana);
    if (!dias.length) {
      return fechaBase.add((numeroClase - 1) * 7, "day").format("YYYY-MM-DD");
    }

    let encontradas = 0;
    for (let i = 0; i <= 365; i += 1) {
      const candidate = fechaBase.add(i, "day");
      if (!dias.includes(candidate.day())) continue;
      encontradas += 1;
      if (encontradas === numeroClase) {
        return candidate.format("YYYY-MM-DD");
      }
    }

    return fechaBase.add((numeroClase - 1) * 7, "day").format("YYYY-MM-DD");
  };

  const cargarDatosCompletos = useCallback(async () => {
    if (!idEstudiante) return;

    try {
      setLoading(true);
      setLoadError(null);

      const { data: dataPerfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", idEstudiante)
        .maybeSingle();
      if (errPerfil) {
        setLoadError("Error cargando información del estudiante.");
        throw errPerfil;
      }
      if (!dataPerfil) {
        setLoadError("No encontramos información para este estudiante.");
        return;
      }
      setPerfil(dataPerfil);

      const { data: dataMatriculas, error: errMat } = await supabaseBrowserClient
        .from("matriculas")
        .select(
          `
            *,
            cursos ( id, programa_id, nombre, descripcion, precio, precio_inscripcion, precio_mensualidad, duracion, dias_semana, hora_inicio, hora_fin, programas(nombre, duracion, precio_mensualidad), perfiles(nombre_completo) )
          `
        )
        .eq("estudiante_id", idEstudiante)
        .order("fecha_inicio", { ascending: false });
      if (errMat) {
        setLoadError("No pudimos cargar las matrículas del estudiante.");
        throw errMat;
      }
      const listaMats = (dataMatriculas as any[] | null) ?? [];
      setMatriculas(listaMats);

      const matriculaIds = listaMats.map((m: any) => m.id).filter(Boolean);
      const cursoIds = listaMats.map((m: any) => m?.cursos?.id).filter(Boolean);
      const programaIds = Array.from(
        new Set(
          listaMats
            .map((m: any) => m?.cursos?.programa_id)
            .filter((programaId: any) => programaId != null)
            .map((programaId: any) => String(programaId))
        )
      );

      const temaPorProgramaClase = new Map<string, string>();
      const temaGlobalPorProgramaClase = new Map<string, string>();
      const totalTemasPorPrograma = new Map<string, number>();
      const metaClasePorPrograma = new Map<string, Map<number, { cicloNumero: number | null; cicloNombre: string | null }>>();
      if (programaIds.length > 0) {
        const pensumData = await obtenerPensumPorProgramas(programaIds);
        const pensumOrdenado = [...(pensumData || [])].sort((a: any, b: any) => {
          const programaA = String(a?.programa_id || "");
          const programaB = String(b?.programa_id || "");
          if (programaA !== programaB) return programaA.localeCompare(programaB);
          const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 9999);
          const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 9999);
          return ordenA - ordenB;
        });

        const contadorClasesPorPrograma = new Map<string, number>();
        pensumOrdenado.forEach((ciclo: any) => {
          const programaId = String(ciclo?.programa_id || "");
          if (!programaId) return;
          const temasCiclo = (Array.isArray(ciclo?.pensum_cursos) ? ciclo.pensum_cursos : [])
            .slice()
            .sort((a: any, b: any) => Number(a?.orden ?? 9999) - Number(b?.orden ?? 9999));
          totalTemasPorPrograma.set(
            programaId,
            Number(totalTemasPorPrograma.get(programaId) || 0) + temasCiclo.length
          );
          if (!metaClasePorPrograma.has(programaId)) {
            metaClasePorPrograma.set(programaId, new Map<number, { cicloNumero: number | null; cicloNombre: string | null }>());
          }
          temasCiclo.forEach((tema: any) => {
            const orden = Number(tema?.orden ?? 0);
            if (!Number.isFinite(orden) || orden <= 0) return;
            const cicloId = String(ciclo?.id || ciclo?.numero_ciclo || "0");
            const key = `${programaId}-${cicloId}-${orden}`;
            if (temaPorProgramaClase.has(key)) return;
            temaPorProgramaClase.set(key, String(tema?.nombre_curso || tema?.titulo || `Clase ${orden}`));

            const consecutivo = Number(contadorClasesPorPrograma.get(programaId) || 0) + 1;
            contadorClasesPorPrograma.set(programaId, consecutivo);
            temaGlobalPorProgramaClase.set(
              `${programaId}-${consecutivo}`,
              String(tema?.nombre_curso || tema?.titulo || `Clase ${consecutivo}`),
            );
            metaClasePorPrograma.get(programaId)?.set(consecutivo, {
              cicloNumero: Number.isFinite(Number(ciclo?.numero_ciclo)) ? Number(ciclo?.numero_ciclo) : null,
              cicloNombre: String(ciclo?.nombre_ciclo || "").trim() || null,
            });
          });
        });
      }

      const clasesPorProgramaObj: Record<string, number> = {};
      totalTemasPorPrograma.forEach((totalTemas, programaId) => {
        clasesPorProgramaObj[programaId] = totalTemas;
      });
      setTotalClasesPorPrograma(clasesPorProgramaObj);
      const metaCiclosObj: Record<string, Record<number, { cicloNumero: number | null; cicloNombre: string | null }>> = {};
      metaClasePorPrograma.forEach((clasesMap, programaId) => {
        const clasesPorPrograma = (metaCiclosObj[programaId] = {});
        clasesMap.forEach((value, claseNumero) => {
          clasesPorPrograma[claseNumero] = value;
        });
      });
      setMetaCiclosPorPrograma(metaCiclosObj);

      if (matriculaIds.length > 0) {
        const { data: dataAsistencias, error: errAsistencias } = await supabaseBrowserClient
          .from("asistencias")
          .select("id, fecha, estado, observaciones, matricula_id, pago_id, pagos(id, estado, monto)")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: false });

        if (errAsistencias) {
          console.error("Error cargando asistencias del estudiante", errAsistencias);
          setAsistenciasHistorial([]);
        } else {
          const asistenciasBase = dataAsistencias || [];
          const fechas = asistenciasBase
            .map((a: any) => a?.fecha)
            .filter(Boolean)
            .sort();

          const fechaMin = fechas[0];
          const fechaMax = fechas[fechas.length - 1];

          const sesionesQuery = supabaseBrowserClient
            .from("sesiones_clase")
            .select("id, curso_id, fecha, tema_visto, created_at")
            .in("curso_id", cursoIds);

          const { data: sesionesData } = await (fechaMin && fechaMax
            ? sesionesQuery.gte("fecha", fechaMin).lte("fecha", fechaMax)
            : sesionesQuery);

          const temaPorCursoFecha = new Map<string, string>();
          const claseNumeroPorCursoFecha = new Map<string, number | null>();
          const sesionesOrdenadas = (sesionesData || [])
            .filter((sesion: any) => !AUTO_SESSION_TOPIC_PATTERN.test(String(sesion?.tema_visto || "")))
            .slice()
            .sort((a: any, b: any) => {
              const fechaA = String(a?.fecha || "");
              const fechaB = String(b?.fecha || "");
              if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);

              const claseA = extractClassNumber(a?.tema_visto || "") || 0;
              const claseB = extractClassNumber(b?.tema_visto || "") || 0;
              if (claseA !== claseB) return claseA - claseB;

              const createdA = String(a?.created_at || "");
              const createdB = String(b?.created_at || "");
              return createdA.localeCompare(createdB);
            });

          sesionesOrdenadas.forEach((sesion: any) => {
            const key = `${sesion?.curso_id || ""}-${sesion?.fecha || ""}`;
            if (!temaPorCursoFecha.has(key)) {
              temaPorCursoFecha.set(key, sesion?.tema_visto || "");
              claseNumeroPorCursoFecha.set(
                key,
                extractClassNumber(sesion?.tema_visto || "")
              );
            }
          });

          const cursoPorMatricula = new Map<number, any>();
          listaMats.forEach((mat: any) => {
            cursoPorMatricula.set(Number(mat.id), mat.cursos || null);
          });

          const asistenciasFormateadas: AsistenciaEstudiante[] = asistenciasBase.map((asistencia: any) => {
            const cursoData = cursoPorMatricula.get(Number(asistencia.matricula_id));
            const cursoId = cursoData?.id;
            const key = `${cursoId || ""}-${asistencia?.fecha || ""}`;
            const claseNumero =
              extractClassNumber(asistencia?.observaciones || "") ??
              claseNumeroPorCursoFecha.get(key) ??
              extractClassNumber(temaPorCursoFecha.get(key) || "") ??
              null;
            const temaSesion = String(temaPorCursoFecha.get(key) || "").trim();
            const temaSesionEsGenerico = !temaSesion || /^clase\s*#?\s*\d+/i.test(temaSesion) || /^[-–—]$/.test(temaSesion);
            const programaIdCurso = String(cursoData?.programa_id || "");
            const temaDesdePensum =
              claseNumero && programaIdCurso
                ? (temaGlobalPorProgramaClase.get(`${programaIdCurso}-${claseNumero}`) || null)
                : null;
            const temaFinal = temaSesionEsGenerico ? temaDesdePensum || temaSesion || null : temaSesion;

            return {
              id: String(asistencia.id),
              fecha: asistencia.fecha || null,
              estado: asistencia.estado || null,
              observaciones: asistencia.observaciones || null,
              matricula_id: asistencia.matricula_id || null,
              clase_numero: claseNumero,
              tema_visto: temaFinal,
              pago_id: (asistencia as any).pago_id || null,
              estado_pago: (asistencia as any)?.pagos?.estado || null,
              monto_pago: (asistencia as any)?.pagos?.monto || null,
            };
          });

          setAsistenciasHistorial(asistenciasFormateadas);
        }
      } else {
        setAsistenciasHistorial([]);
      }

      const activas = listaMats.filter((m) => m.estado === "activo").length;
      const finalizadas = listaMats.filter((m) => m.estado === "finalizado").length;
      const totalPagado = listaMats.reduce((sum, m) => sum + (m.monto_pagado || 0), 0);
      const deudaTotal = listaMats.reduce((sum, m) => sum + (m.deuda_pendiente || 0), 0);

      setEstadisticasGlobales({
        totalCursos: listaMats.length,
        cursosActivos: activas,
        cursosFinalizados: finalizadas,
        totalPagado,
        deudaTotal,
      });

      const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
        .from("pagos")
        .select(
          "id, created_at, estudiante_id, fecha_pago, fecha_vencimiento, matricula_id, periodo_pagado, numero_cuota, monto, monto_programado, descuento_aplicado, total_abonado, saldo_pendiente, motivo_descuento, metodo_pago, referencia, observaciones, estado, ticket_url, matriculas!pagos_matricula_id_fkey(modalidad_pago, valor_mensual_plan, valor_por_clase, porcentaje_productos, cursos(nombre, dias_semana, hora_inicio, hora_fin, programas(nombre, duracion, precio_mensualidad)))"
        )
        .eq("estudiante_id", idEstudiante)
        .order("matricula_id", { ascending: true })
        .order("numero_cuota", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (errPagos) {
        setLoadError("No pudimos cargar el historial de pagos.");
        throw errPagos;
      }

      let pagosList = (dataPagos as unknown as Pago[] | null) ?? [];

      if (matriculaIds.length > 0) {
        const { data: dataPagosPorMatricula, error: errPagosPorMatricula } = await supabaseBrowserClient
          .from("pagos")
          .select(
            "id, created_at, estudiante_id, fecha_pago, fecha_vencimiento, matricula_id, periodo_pagado, numero_cuota, monto, monto_programado, descuento_aplicado, total_abonado, saldo_pendiente, motivo_descuento, metodo_pago, referencia, observaciones, estado, ticket_url, matriculas!pagos_matricula_id_fkey(modalidad_pago, valor_mensual_plan, valor_por_clase, porcentaje_productos, cursos(nombre, dias_semana, hora_inicio, hora_fin, programas(nombre, duracion, precio_mensualidad)))"
          )
          .in("matricula_id", matriculaIds)
          .order("matricula_id", { ascending: true })
          .order("numero_cuota", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (!errPagosPorMatricula) {
          const pagosPorMatricula = (dataPagosPorMatricula as unknown as Pago[] | null) ?? [];
          if (pagosPorMatricula.length > 0) {
            const pagosMap = new Map<string, Pago>();
            [...pagosList, ...pagosPorMatricula].forEach((p) => {
              pagosMap.set(String(p.id), p);
            });
            pagosList = Array.from(pagosMap.values());
          }
        }
      }

      console.log("🔍 Pagos estudiante:", pagosList.length, pagosList);
      setPagosHistorial(pagosList);

      const totalPagadoReal = pagosList
        .reduce((sum, p) => sum + getTotalAbonado(p), 0);
      console.log("💰 Total Pagado Real calculado:", totalPagadoReal);
      
      const deudaPendienteReal = listaMats.reduce((sum, m: any) => {
        const pagosMat = pagosList.filter((p) => p.matricula_id === m.id);
        const modalidadPago = normalizeModalidadPago(m?.modalidad_pago);
        const pagoInscripcion = pagosMat.find((p) => esInscripcion(p));
        const deudaInscripcion = pagoInscripcion
          ? getSaldoPendiente(pagoInscripcion)
          : obtenerValorInscripcion(m);

        if (modalidadPago === "POR_CLASE") {
          const deudaClasesGeneradas = pagosMat
            .filter((p) => !esInscripcion(p))
            .reduce((acc, p) => acc + getSaldoPendiente(p), 0);
          return sum + deudaInscripcion + deudaClasesGeneradas;
        }

        const meses = obtenerDuracionMeses(m);
        const mensualidad = obtenerMensualidad(m);
        const totalMensualidadEsperada = meses * mensualidad;
        const totalMensualidadPagada = pagosMat
          .filter((p) => !esInscripcion(p))
          .filter((p) => !esPagoHistoricoPorClase(p, modalidadPago))
          .reduce((acc, p) => acc + getTotalAbonado(p), 0);

        return sum + deudaInscripcion + Math.max(totalMensualidadEsperada - totalMensualidadPagada, 0);
      }, 0);
      console.log("📊 Deuda Pendiente Real calculada:", deudaPendienteReal);

      setEstadisticasGlobales((prev) => ({
        ...prev,
        totalPagado: totalPagadoReal,
        deudaTotal: deudaPendienteReal,
      }));
      console.log("✅ Actualizando estadisticasGlobales con:", {
        totalPagado: totalPagadoReal,
        deudaTotal: deudaPendienteReal
      });

      // Ciclos/meses: duración + 1 inscripción. Ej: 5 ciclos = 6 pagos (1 inscripción + 5 cuotas)
      const ciclosMap: Record<number, { total: number; pagados: number; faltantes: number; periodos: string[]; inscripcionPagada: boolean }> = {};
      listaMats.forEach((m: any) => {
        const modalidadPago = normalizeModalidadPago(m?.modalidad_pago);
        const duracionMeses = obtenerDuracionMeses(m);
        const totalClasesPrograma = Number(clasesPorProgramaObj[String(m?.cursos?.programa_id || "")] || 0);
        const totalPagosEsperados = modalidadPago === "POR_CLASE" ? totalClasesPrograma + 1 : duracionMeses + 1; // inscripción + clases/cuotas
        const pagosMat = pagosList.filter((p) => p.matricula_id === m.id);
        const pagosValidosPorModalidad = modalidadPago === "POR_CLASE"
          ? pagosMat
          : pagosMat.filter((p) => !esPagoHistoricoPorClase(p, modalidadPago));
        const pagados = pagosValidosPorModalidad.filter((p) => (p.estado || "").toLowerCase() === "pagado").length;
        const faltantes = totalPagosEsperados > 0 ? Math.max(totalPagosEsperados - pagados, 0) : 0;
        const periodos = pagosValidosPorModalidad.map((p) => p.periodo_pagado).filter(Boolean) as string[];
        const inscripcionPagada = pagosMat.some((p) => (p.periodo_pagado || "").toLowerCase().includes("matric") || (p.numero_cuota === 0 && (p.estado || "").toLowerCase() === "pagado"));
        ciclosMap[m.id] = { total: totalPagosEsperados, pagados, faltantes, periodos, inscripcionPagada };
      });
      setCiclosPorMatricula(ciclosMap);
    } catch (error) {
      console.error(error);
      setLoadError((prev) => prev ?? "Ocurrió un error cargando el expediente del estudiante.");
      message.error("Error cargando datos del estudiante");
    } finally {
      setLoading(false);
    }
  }, [esInscripcion, esPagoHistoricoPorClase, idEstudiante, obtenerDuracionMeses]);

  // Matrículas con modalidad POR_CLASE (para mostrar el botón "Registrar Clase")
  const matriculasPorClase = useMemo(
    () => (matriculas as any[]).filter((m) => normalizeModalidadPago(m?.modalidad_pago) === "POR_CLASE"),
    [matriculas]
  );

  const handleRegistrarAsistencia = useCallback(
    async (values: any) => {
      if (!idEstudiante) return;
      setRegistrandoClase(true);
      try {
        const response = await fetch("/api/asistencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matricula_id: values.matricula_id,
            fecha: values.fecha.format("YYYY-MM-DD"),
            estado: values.estado,
            observaciones: values.observaciones || null,
            tema: values.tema || null,
          }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Error al registrar asistencia");

        if (values.estado === "presente" && result.pagoCreado) {
          const { monto, claseNumero, fechaVencimiento } = result.pagoCreado;
          const vencFmt = dayjs(fechaVencimiento).format("DD/MM/YYYY");
          message.success(
            `Clase #${claseNumero} registrada. Cobro generado: $${Number(monto).toLocaleString("es-CO")} (vence ${vencFmt})`,
            6
          );

          // Notificar al estudiante por WhatsApp
          if (perfil?.telefono && perfil?.notif_whatsapp !== false) {
            try {
              const mat = (matriculas as any[]).find((m: any) => String(m.id) === String(values.matricula_id));
              const cursoNombre = construirNombreGrupo(mat?.cursos) || "tu curso";
              const fechaClaseFmt = values.fecha.format("DD/MM/YYYY");
              const montoFmt = `$${Number(monto).toLocaleString("es-CO")}`;
              const mensajeWA =
                `Hola ${perfil.nombre_completo} 👋\n\n` +
                `Se registró tu asistencia a clase del *${fechaClaseFmt}* en *${cursoNombre}*.\n\n` +
                `💰 Cobro generado: *${montoFmt}*\n` +
                `⏰ Vence: *${vencFmt}*\n\n` +
                `Puedes pagar en nuestra oficina. ¡Gracias!\n\n_Academia Crystal_`;
              await enviarWhatsapp(perfil.telefono, mensajeWA);
            } catch (waErr) {
              console.warn("Error enviando WhatsApp de asistencia:", waErr);
            }
          }
        } else {
          message.success("Asistencia registrada correctamente");
        }

        setModalRegistrarClase(false);
        formRegistrarClase.resetFields();
        await cargarDatosCompletos();
      } catch (err: any) {
        console.error("Error registrando asistencia:", err);
        message.error(err.message || "No se pudo registrar la asistencia");
      } finally {
        setRegistrandoClase(false);
      }
    },
    [idEstudiante, perfil, matriculas, cargarDatosCompletos, formRegistrarClase]
  );

  const eliminarAsistencia = async (asistenciaId: string) => {
    try {
      setDeletingAsistenciaId(asistenciaId);

      const { error } = await supabaseBrowserClient
        .from("asistencias")
        .delete()
        .eq("id", asistenciaId);

      if (error) throw error;

      setAsistenciasHistorial((prev) => prev.filter((item) => String(item.id) !== String(asistenciaId)));
      message.success("Asistencia eliminada correctamente");
    } catch (error) {
      console.error("Error eliminando asistencia", error);
      message.error("No se pudo eliminar la asistencia");
    } finally {
      setDeletingAsistenciaId(null);
    }
  };

  useEffect(() => {
    cargarDatosCompletos();
  }, [cargarDatosCompletos]);

  const handleUploadPhoto = async (file: File) => {
    try {
      setUploadingPhoto(true);
      
      // Crear nombre único para el archivo
      const fileExt = file.name.split(".").pop();
      const fileName = `${idEstudiante}_${Date.now()}.${fileExt}`;
      const filePath = `perfiles/${fileName}`;

      // Subir a Supabase Storage
      const { error: uploadError } = await supabaseBrowserClient.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: urlData } = supabaseBrowserClient.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Actualizar perfil con la nueva URL
      const { error: updateError } = await supabaseBrowserClient
        .from("perfiles")
        .update({ foto_url: urlData.publicUrl })
        .eq("id", idEstudiante);

      if (updateError) throw updateError;

      message.success("Foto actualizada correctamente");
      
      // Recargar datos
      await cargarDatosCompletos();
    } catch (error: any) {
      console.error("Error subiendo foto:", error);
      message.error("Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
    }
    return false; // Prevenir upload automático de antd
  };

  const handleWhatsAppClick = () => {
    if (!perfil?.telefono) {
      message.warning("El estudiante no tiene teléfono registrado");
      return;
    }
    const mensaje = `Hola ${perfil.nombre_completo}, te contacto desde Academia Crystal.`;
    enviarWhatsapp(perfil.telefono, mensaje);
  };

  const handleReimprimirTicket = (ticketUrl: string) => {
    const printWindow = window.open(ticketUrl, "_blank");

    if (!printWindow) {
      message.warning("No se pudo abrir el ticket para imprimir");
      return;
    }

    const fallbackTimeout = window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
      }
    }, 2500);

    printWindow.addEventListener(
      "load",
      () => {
        window.clearTimeout(fallbackTimeout);
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
        }
      },
      { once: true }
    );
  };

  const handleRegenerarTicket = useCallback(async (record: Pago) => {
    try {
      const { data: configAcademia } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const cursoNombre = construirNombreGrupo(record?.matriculas?.cursos) || "Curso";
      const periodoLegible = getPeriodoPagoLegible(record, record?.matriculas?.modalidad_pago);
      const fechaPagoLegible = record?.fecha_pago ? dayjs(record.fecha_pago).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY");

      const ticketData = {
        academia: {
          nombre: configAcademia?.nombre_academia || "Academia Crystal Diamante",
          ruc: configAcademia?.ruc || undefined,
          logoUrl: configAcademia?.logo_url || undefined,
          telefono: configAcademia?.telefono || configAcademia?.whatsapp || undefined,
          direccion: configAcademia?.direccion || undefined,
          email: configAcademia?.email || undefined,
          ticketTitulo: configAcademia?.ticket_titulo || undefined,
          ticketNota: configAcademia?.ticket_nota || undefined,
          ticketPie: configAcademia?.ticket_pie || undefined,
          ticketCampos: configAcademia?.ticket_campos || undefined,
        },
        estudiante: {
          nombre: perfil?.nombre_completo || "Estudiante",
          identificacion: perfil?.identificacion || undefined,
          telefono: perfil?.telefono || undefined,
        },
        pago: {
          referencia: formatTicketReference(record?.referencia || record?.id, "FAC"),
          metodo: record?.metodo_pago || "efectivo",
          monto: Number(record?.monto || 0),
          fecha: fechaPagoLegible,
          concepto: `${periodoLegible} - ${cursoNombre}`,
          periodo: periodoLegible,
          numeroCuota: typeof record?.numero_cuota === "number" ? record.numero_cuota : undefined,
        },
        curso: {
          nombre: cursoNombre,
        },
      } as const;

      const blob = await generarTicketPagoBlob(ticketData);
      const placeholder = window.open("", "_blank");
      if (placeholder) {
        abrirTicketPagoDesdeBlob(blob, placeholder);
      } else {
        abrirTicketPagoDesdeBlob(blob);
      }

      const { publicUrl } = await subirTicketPago({
        blob,
        pagoId: String(record.id),
        estudianteId: String(idEstudiante),
      });

      await supabaseBrowserClient
        .from("pagos")
        .update({ ticket_url: publicUrl } as any)
        .eq("id", record.id);

      await supabaseBrowserClient
        .from("movimientos_financieros")
        .update({ ticket_url: publicUrl })
        .eq("pago_id", record.id);

      setPagosHistorial((prev) => prev.map((p) => (
        String(p.id) === String(record.id)
          ? { ...p, ticket_url: publicUrl }
          : p
      )));

      message.success("Ticket regenerado correctamente");
    } catch (error) {
      console.error("Error regenerando ticket del pago:", error);
      message.error("No se pudo regenerar el ticket");
    }
  }, [getPeriodoPagoLegible, idEstudiante, perfil]);

  const columnasCursos = useMemo(
    () => [
      {
        title: "Curso",
        dataIndex: ["cursos", "nombre"],
        key: "curso",
        render: (_: string, record: any) => <Text strong>{construirNombreGrupo(record.cursos)}</Text>,
      },
      {
        title: "Fecha Inicio",
        dataIndex: "fecha_inicio",
        key: "inicio",
        render: (val: string) => (val ? formatDate(val) : "Sin fecha"),
      },
      {
        title: "Estado",
        dataIndex: "estado",
        key: "estado",
        render: (estado: string) => {
          const map: Record<string, { color: string; icon: React.ReactNode | null }> = {
            activo: { color: "blue", icon: <CheckCircleOutlined /> },
            finalizado: { color: "green", icon: <CheckCircleOutlined /> },
            cancelado: { color: "red", icon: <CloseCircleOutlined /> },
          };
          const visual = map[estado] ?? { color: "default", icon: null };
          return (
            <Tag color={visual.color} icon={visual.icon}>
              {estado || "Sin estado"}
            </Tag>
          );
        },
      },
      {
        title: "Plan de Pago",
        key: "plan",
        render: (_: any, record: any) => {
          const plan = getPaymentPlanDisplay({
            modalidadPago: record?.modalidad_pago,
            valorMensualPlan: record?.valor_mensual_plan,
            porcentajeProductos: record?.porcentaje_productos,
          });
          return <Tag color={plan.color}>{`${plan.label} · ${plan.detail}`}</Tag>;
        },
      },
      {
        title: "Nota Final",
        dataIndex: "nota_final",
        key: "nota",
        render: (nota: number | null) =>
          typeof nota === "number" ? (
            <Tag color="purple">{nota}</Tag>
          ) : (
            <Text type="secondary">Pendiente</Text>
          ),
      },
      {
        title: "Profesor",
        dataIndex: ["cursos", "perfiles", "nombre_completo"],
        key: "profesor",
        render: (text: string) => text || "No asignado",
      },
    ],
    []
  );

  const columnasFinanciero = useMemo(
    () => [
      {
        title: "Curso",
        dataIndex: ["cursos", "nombre"],
        key: "curso",
        render: (_: string, record: any) => construirNombreGrupo(record.cursos),
      },
      {
        title: "Precio Total",
        dataIndex: ["cursos", "precio"],
        key: "precio",
        render: (val: number | null) => `$${(val || 0).toLocaleString()}`,
      },
      {
        title: "Modalidad",
        key: "modalidad",
        render: (_: any, record: any) => {
          const plan = getPaymentPlanDisplay({
            modalidadPago: record?.modalidad_pago,
            valorMensualPlan: record?.valor_mensual_plan,
            porcentajeProductos: record?.porcentaje_productos,
          });
          return <Tag color={plan.color}>{`${plan.label} · ${plan.detail}`}</Tag>;
        },
      },
      {
        title: "Pagado",
        dataIndex: "monto_pagado",
        key: "pagado",
        render: (val: number | null) => (
          <Text style={{ color: "#52c41a" }}>${(val || 0).toLocaleString()}</Text>
        ),
      },
      {
        title: "Deuda",
        dataIndex: "deuda_pendiente",
        key: "deuda",
        render: (val: number | null) => (
          <Text
            style={{
              color: val && val > 0 ? "#ff4d4f" : "#52c41a",
              fontWeight: "bold",
            }}
          >
            ${(val || 0).toLocaleString()}
          </Text>
        ),
      },
    ],
    []
  );

  const contactoPerfil = useMemo(
    () => ({
      nombre: perfil?.nombre_completo ?? "",
      telefono: perfil?.telefono ?? "",
      whatsapp: perfil?.whatsapp ?? "",
    }),
    [perfil]
  );

  const pagosHistorialCompleto = useMemo(() => {
    const base = Array.isArray(pagosHistorial) ? pagosHistorial : [];
    if (!matriculas.length) return base;

    const extras: Pago[] = [];

    matriculas.forEach((matricula: any) => {
      const modalidadPago = normalizeModalidadPago(matricula?.modalidad_pago);
      if (modalidadPago === "POR_CLASE") return;

      const totalCiclos = Math.max(obtenerDuracionMeses(matricula), 0);
      if (!totalCiclos) return;

      const pagosMatricula = base.filter((p) => p.matricula_id === matricula.id);
      const cuotasExistentes = new Set<number>();

      pagosMatricula.forEach((p) => {
        if (esInscripcion(p)) return;
        const cuota = numeroCuotaVisualPorPagoId.get(String(p?.id || "")) ?? parseNumeroCuota(p);
        if (cuota && cuota >= 1 && cuota <= totalCiclos) {
          cuotasExistentes.add(cuota);
        }
      });

      for (let i = 1; i <= totalCiclos; i += 1) {
        if (cuotasExistentes.has(i)) continue;
        extras.push({
          id: `pendiente-${matricula.id}-${i}`,
          created_at: null,
          fecha_pago: null,
          numero_cuota: i,
          matricula_id: matricula.id,
          matriculas: {
            modalidad_pago: matricula?.modalidad_pago ?? null,
            valor_mensual_plan: matricula?.valor_mensual_plan ?? null,
            porcentaje_productos: matricula?.porcentaje_productos ?? null,
            cursos: matricula.cursos,
          },
          monto: obtenerMensualidad(matricula),
          monto_programado: obtenerMensualidad(matricula),
          descuento_aplicado: 0,
          total_abonado: 0,
          saldo_pendiente: obtenerMensualidad(matricula),
          motivo_descuento: null,
          metodo_pago: null,
          referencia: null,
          observaciones: `Ciclo mensual ${i} de ${totalCiclos}`,
          periodo_pagado: `Ciclo mensual ${i} de ${totalCiclos}`,
          fecha_vencimiento: calcularFechaVencimientoCuota(matricula, i),
          estado: "pendiente",
          ticket_url: null,
        });
      }
    });

    const combinado = [...base, ...extras];

    const obtenerOrdenCuota = (pago: any): number => {
      if (esInscripcion(pago)) return 0;
      const cuota = parseNumeroCuota(pago);
      if (cuota && cuota > 0) return cuota;
      return Number.MAX_SAFE_INTEGER;
    };

    return combinado.sort((a: any, b: any) => {
      const matriculaA = Number(a?.matricula_id || 0);
      const matriculaB = Number(b?.matricula_id || 0);
      if (matriculaA !== matriculaB) return matriculaA - matriculaB;

      const ordenCuotaA = obtenerOrdenCuota(a);
      const ordenCuotaB = obtenerOrdenCuota(b);
      if (ordenCuotaA !== ordenCuotaB) return ordenCuotaA - ordenCuotaB;

      const fechaVencA = a?.fecha_vencimiento ? dayjs(a.fecha_vencimiento) : null;
      const fechaVencB = b?.fecha_vencimiento ? dayjs(b.fecha_vencimiento) : null;
      if (fechaVencA && fechaVencB && !fechaVencA.isSame(fechaVencB, "day")) {
        return fechaVencA.valueOf() - fechaVencB.valueOf();
      }
      if (fechaVencA && !fechaVencB) return -1;
      if (!fechaVencA && fechaVencB) return 1;

      const createdA = a?.created_at ? dayjs(a.created_at) : null;
      const createdB = b?.created_at ? dayjs(b.created_at) : null;
      if (createdA && createdB && !createdA.isSame(createdB)) {
        return createdA.valueOf() - createdB.valueOf();
      }

      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }, [esInscripcion, numeroCuotaVisualPorPagoId, pagosHistorial, matriculas, obtenerDuracionMeses, parseNumeroCuota]);

  const columnasPagos = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha_pago",
        key: "fecha",
        render: (val: string | null) => (val ? `${formatDate(val)} ${dayjs(val).format("h:mm A")}` : "-"),
      },
      {
        title: "Estado",
        dataIndex: "estado",
        key: "estado",
        render: (val: string | null, record: Pago) => {
          const estado = getVisiblePaymentStatus(record);

          let color: string = "default";
          if (estado === "pagado") color = "success";
          else if (estado === "pendiente") color = "warning";
          else if (estado === "abono_parcial") color = "gold";
          else if (estado === "vencido") color = "error";
          return <Tag color={color}>{estado === "abono_parcial" ? "abono parcial" : estado.replace("_", " ")}</Tag>;
        },
      },
      {
        title: "Curso",
        dataIndex: ["matriculas", "cursos", "nombre"],
        key: "curso",
        render: (_: string, record: any) => construirNombreGrupo(record.matriculas?.cursos) || "Curso no asociado",
      },
      {
        title: "Plan",
        key: "plan",
        render: (_: any, record: any) => {
          const plan = getPaymentPlanDisplay({
            modalidadPago: record?.matriculas?.modalidad_pago,
            valorMensualPlan: record?.matriculas?.valor_mensual_plan,
            porcentajeProductos: record?.matriculas?.porcentaje_productos,
          });
          return <Tag color={plan.color}>{`${plan.label} · ${plan.detail}`}</Tag>;
        },
      },
      {
        title: "Monto",
        dataIndex: "monto",
        key: "monto",
        render: (_val: number | null, record: Pago) => (
          <Text strong style={{ color: getVisiblePaymentStatus(record) === "pagado" ? "#52c41a" : "#1677ff" }}>
            ${getMontoProgramado(record).toLocaleString()}
          </Text>
        ),
      },
      {
        title: "Abonado",
        key: "abonado",
        render: (_: any, record: Pago) => <Text>${getTotalAbonado(record).toLocaleString()}</Text>,
      },
      {
        title: "Descuento",
        key: "descuento",
        render: (_: any, record: Pago) => (
          <Text>{getDescuentoAplicado(record) > 0 ? `$${getDescuentoAplicado(record).toLocaleString()}` : "-"}</Text>
        ),
      },
      {
        title: "Método",
        dataIndex: "metodo_pago",
        key: "metodo",
        render: (val: string | null) => <Tag>{val || "No especificado"}</Tag>,
      },
      {
        title: "Referencia",
        dataIndex: "referencia",
        key: "ref",
        render: (text: string | null, record: Pago) => text || (record?.fecha_pago ? String(record?.id || "-") : "-"),
      },
      {
        title: "Observaciones",
        dataIndex: "observaciones",
        key: "obs",
        render: (_: string | null, record: any) => {
          if (esInscripcion(record)) return "Inscripción";
          const modalidadPago = normalizeModalidadPago(record?.matriculas?.modalidad_pago);
          const numero = numeroCuotaVisualPorPagoId.get(String(record?.id || "")) ?? parseNumeroCuota(record);
          if (esPagoHistoricoPorClase(record, modalidadPago)) return "Pago previo por clase";
          if (modalidadPago === "POR_CLASE" && numero) return `Clase #${numero}`;
          const totalCiclos = Math.max(obtenerDuracionMeses(record?.matriculas), 0);
          if (numero && totalCiclos) {
            return `Ciclo mensual ${numero} de ${totalCiclos}`;
          }
          return record?.observaciones || record?.periodo_pagado || "-";
        },
      },
      {
        title: "Ticket",
        dataIndex: "ticket_url",
        key: "ticket",
        render: (url: string | null, record: Pago) => {
          const esVirtual = String(record?.id || "").startsWith("pendiente-");
          const puedeRegenerar = !esVirtual && getTotalAbonado(record) > 0;

          if (url) {
            return (
            <Space size={6} wrap>
              <Tooltip title="Ver PDF">
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => window.open(url, "_blank")} />
              </Tooltip>
              <Tooltip title="Reimprimir">
                <Button size="small" icon={<PrinterOutlined />} onClick={() => handleReimprimirTicket(url)} />
              </Tooltip>
              <Tooltip title="Regenerar ticket">
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void handleRegenerarTicket(record)} />
              </Tooltip>
              <Tooltip title="Enviar por WhatsApp">
                <Button
                  size="small"
                  icon={<WhatsAppOutlined />}
                  onClick={() => {
                    const telefono = contactoPerfil.telefono || contactoPerfil.whatsapp;
                    if (!telefono) {
                      message.warning("El estudiante no tiene teléfono registrado");
                      return;
                    }

                    const curso = construirNombreGrupo(record.matriculas?.cursos) || "tu curso";
                    const monto = record.monto ? `$${record.monto.toLocaleString("es-CO")}` : "(monto no indicado)";
                    const msg = `Hola ${contactoPerfil.nombre}, te compartimos tu ticket de pago (${monto}) del curso ${curso}: ${url}`;
                    enviarWhatsapp(telefono, msg);
                  }}
                />
              </Tooltip>
            </Space>
            );
          }

          if (puedeRegenerar) {
            return (
              <Space size={6} wrap>
                <Text type="secondary">No disponible</Text>
                <Tooltip title="Regenerar ticket">
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => void handleRegenerarTicket(record)} />
                </Tooltip>
              </Space>
            );
          }

          return <Text type="secondary">-</Text>;
        },
      },
      {
        title: "Recordatorio",
        key: "acciones",
        render: (_: any, record: Pago) => (
          <Button
            icon={<WhatsAppOutlined />}
            size="small"
            type="default"
            onClick={() => {
              const telefono = contactoPerfil.telefono || contactoPerfil.whatsapp;
              if (!telefono) {
                message.warning("El estudiante no tiene teléfono registrado");
                return;
              }
              const curso = construirNombreGrupo(record.matriculas?.cursos) || "tu curso";
              const estado = record.estado || "pendiente";
              const monto = record.monto ? `$${record.monto.toLocaleString('es-CO')}` : "(monto no indicado)";
              const msg = `Hola ${contactoPerfil.nombre}, te recuerdo el pago de ${monto} para ${curso}. Estado: ${estado.replace('_',' ')}. Por favor confirma el pago o envía el soporte. Gracias!`;
              enviarWhatsapp(telefono, msg);
            }}
          />
        ),
      },
    ],
    [contactoPerfil, esInscripcion, esPagoHistoricoPorClase, handleRegenerarTicket, numeroCuotaVisualPorPagoId, obtenerDuracionMeses, parseNumeroCuota]
  );

  const renderCuotasPorMatricula = (record: any) => {
    // Obtener todas las cuotas de esta matrícula
    const cuotasMatricula = pagosHistorial
      .filter(p => p.matricula_id === record.id)
      .sort((a, b) => {
        const ordenA = esInscripcion(a) ? 0 : (parseNumeroCuota(a) || Number.MAX_SAFE_INTEGER);
        const ordenB = esInscripcion(b) ? 0 : (parseNumeroCuota(b) || Number.MAX_SAFE_INTEGER);
        if (ordenA !== ordenB) return ordenA - ordenB;

        const fechaA = a?.fecha_vencimiento ? dayjs(a.fecha_vencimiento) : null;
        const fechaB = b?.fecha_vencimiento ? dayjs(b.fecha_vencimiento) : null;
        if (fechaA && fechaB && !fechaA.isSame(fechaB, "day")) return fechaA.valueOf() - fechaB.valueOf();
        if (fechaA && !fechaB) return -1;
        if (!fechaA && fechaB) return 1;

        return String(a?.id || "").localeCompare(String(b?.id || ""));
      });

    const modalidadRawMatricula = String(record?.modalidad_pago || "").trim();
    const modalidadPago = modalidadRawMatricula
      ? normalizeModalidadPago(modalidadRawMatricula)
      : null;
    const modalidadRawDesdePagos = cuotasMatricula
      .map((p) => String(p?.matriculas?.modalidad_pago || "").trim())
      .find(Boolean);
    const modalidadDesdePagos = modalidadRawDesdePagos
      ? normalizeModalidadPago(modalidadRawDesdePagos)
      : null;
    const modalidadEfectiva = modalidadPago || modalidadDesdePagos || "MENSUAL_70";
    const esPorClase = modalidadEfectiva === "POR_CLASE";
    const cuotasRelevantes = esPorClase
      ? cuotasMatricula
      : cuotasMatricula.filter((p) => !esPagoHistoricoPorClase(p, modalidadEfectiva));
    const totalCiclos = Math.max(obtenerDuracionMeses(record), 0);
    const totalClasesPrograma = Math.max(obtenerTotalClasesPrograma(record), 0);
    const maxClasePagada = cuotasRelevantes.reduce((max, p) => {
      const n = parseNumeroCuota(p);
      return n && n > max ? n : max;
    }, 0);
    const totalPeriodos = esPorClase ? Math.max(totalClasesPrograma, maxClasePagada) : totalCiclos;
    const valorPorClase = obtenerValorPorClase(record);
    const pagosMap = new Map<number, Pago>();
    cuotasRelevantes.forEach((p) => {
      if (esInscripcion(p)) return;
      const numeroCuota = esPorClase
        ? parseNumeroCuota(p)
        : (numeroCuotaVisualPorPagoId.get(String(p?.id || "")) ?? parseNumeroCuota(p));

      if (!numeroCuota || numeroCuota <= 0) return;
      if (!pagosMap.has(numeroCuota)) {
        pagosMap.set(numeroCuota, p);
      }
    });

    const inscripcionPago = cuotasMatricula.find((p) =>
      (p.periodo_pagado || "").toLowerCase().includes("matric") || p.numero_cuota === 0,
    );
    if (inscripcionPago) {
      pagosMap.set(0, inscripcionPago);
    }

    const pagosEsperados: Pago[] = [];
    for (let ciclo = 0; ciclo <= totalPeriodos; ciclo += 1) {
      const pago = pagosMap.get(ciclo);
      if (pago) {
        const fechaVencimientoAjustada = ciclo === 0
          ? (pago?.fecha_vencimiento || null)
          : (esPorClase
            ? (calcularFechaVencimientoClase(record, ciclo) || pago?.fecha_vencimiento || null)
            : (pago?.fecha_vencimiento || calcularFechaVencimientoCuota(record, ciclo)));
        pagosEsperados.push({
          ...pago,
          numero_cuota: ciclo,
          fecha_vencimiento: fechaVencimientoAjustada,
          periodo_pagado: ciclo === 0
            ? "Inscripción"
            : esPorClase
              ? `Clase #${ciclo}`
              : `Ciclo mensual ${ciclo} de ${totalCiclos}`,
        });
        continue;
      }

      pagosEsperados.push({
        id: `pendiente-${record.id}-${ciclo}`,
        created_at: null,
        fecha_pago: null,
        fecha_vencimiento: ciclo === 0
          ? null
          : (esPorClase
            ? calcularFechaVencimientoClase(record, ciclo)
            : calcularFechaVencimientoCuota(record, ciclo)),
        numero_cuota: ciclo,
        matricula_id: record.id,
        matriculas: record.matriculas ?? null,
        monto: ciclo === 0 ? obtenerValorInscripcion(record) || null : (esPorClase ? valorPorClase : obtenerMensualidad(record)),
        monto_programado: ciclo === 0 ? obtenerValorInscripcion(record) || null : (esPorClase ? valorPorClase : obtenerMensualidad(record)),
        descuento_aplicado: 0,
        total_abonado: 0,
        saldo_pendiente: ciclo === 0 ? obtenerValorInscripcion(record) || 0 : (esPorClase ? valorPorClase : obtenerMensualidad(record)),
        motivo_descuento: null,
        metodo_pago: null,
        referencia: null,
        observaciones: null,
        periodo_pagado: ciclo === 0
          ? "Inscripción"
          : esPorClase
            ? `Clase #${ciclo}`
            : `Ciclo mensual ${ciclo} de ${totalCiclos}`,
        estado: "pendiente",
        ticket_url: null,
      });
    }

    if (pagosEsperados.length === 0) {
      return <Text type="secondary">No hay ciclos generados</Text>;
    }

    return (
      <Space wrap size="small">
        {pagosEsperados.map((cuota) => {
          const estadoVisible = getVisiblePaymentStatus(cuota);
          const isPagado = estadoVisible === 'pagado';
          const isVencido = estadoVisible === 'vencido';
          const isAbonoParcial = estadoVisible === 'abono_parcial';
          const isPorVencer = cuota.fecha_vencimiento && dayjs(cuota.fecha_vencimiento).diff(dayjs(), 'day') <= 7 && !isPagado && !isVencido;
          
          let buttonType: "primary" | "default" | "dashed" = "default";
          let buttonColor = "";
          let statusText = "";
          let statusColor = "";

          if (isPagado) {
            buttonType = "primary";
            statusText = "Pagado";
            statusColor = "#52c41a";
          } else if (isAbonoParcial) {
            buttonColor = "#d48806";
            statusText = "Abono parcial";
            statusColor = "#d48806";
          } else if (isVencido) {
            buttonColor = "#ff4d4f";
            statusText = "Vencido";
            statusColor = "#ff4d4f";
          } else if (isPorVencer) {
            buttonColor = "#faad14";
            statusText = "Por vencer";
            statusColor = "#faad14";
          } else {
            statusText = "Pendiente";
            statusColor = "#1890ff";
          }

          const etiqueta = cuota.numero_cuota === 0
            ? "Inscripción"
            : esPorClase
              ? `Clase #${cuota.numero_cuota}`
              : `Ciclo mensual ${cuota.numero_cuota} de ${totalCiclos}`;

          return (
            <Tooltip
              key={cuota.id}
              title={
                <div>
                  <div><strong>{etiqueta}</strong></div>
                  <div>Valor programado: ${getMontoProgramado(cuota).toLocaleString()}</div>
                  <div>Abonado: ${getTotalAbonado(cuota).toLocaleString()}</div>
                  <div>Descuento: ${getDescuentoAplicado(cuota).toLocaleString()}</div>
                  <div>Saldo: ${getSaldoPendiente(cuota).toLocaleString()}</div>
                  {cuota.fecha_vencimiento && (
                    <div>Vence: {formatDate(cuota.fecha_vencimiento)}</div>
                  )}
                  {cuota.fecha_pago && (
                    <div>Pagado: {formatDate(cuota.fecha_pago)}</div>
                  )}
                  <div>Estado: {statusText}</div>
                </div>
              }
            >
              <Button
                size="small"
                type={buttonType}
                style={{
                  minWidth: 100,
                  borderColor: buttonColor || undefined,
                  color: isPagado ? '#fff' : buttonColor || undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  height: 'auto',
                  padding: '4px 8px',
                  alignItems: 'flex-start'
                }}
                onClick={() => {
                  if (!isPagado) {
                    Modal.confirm({
                      title: `Registrar pago de ${etiqueta}`,
                      content: (
                        <div>
                          <p>Saldo actual: <strong>${getSaldoPendiente(cuota).toLocaleString()}</strong></p>
                          {getDescuentoAplicado(cuota) > 0 && <p>Descuento acumulado: <strong>${getDescuentoAplicado(cuota).toLocaleString()}</strong></p>}
                          {getTotalAbonado(cuota) > 0 && <p>Abonado acumulado: <strong>${getTotalAbonado(cuota).toLocaleString()}</strong></p>}
                          {cuota.fecha_vencimiento && (
                            <p>Vencimiento: {formatDate(cuota.fecha_vencimiento)}</p>
                          )}
                          <p>¿Deseas redirigir a tesorería para registrar este pago?</p>
                        </div>
                      ),
                      onOk: () => {
                        window.location.href = `/tesoreria/create?estudiante_id=${idEstudiante}&matricula_id=${record.id}&monto=${getSaldoPendiente(cuota)}&periodo=${cuota.periodo_pagado || ''}`;
                      },
                    });
                  }
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 500 }}>
                  {etiqueta}
                </span>
                <span style={{ fontSize: 10, color: statusColor, marginTop: 2 }}>
                  {statusText}
                </span>
                {cuota.fecha_vencimiento && !isPagado && (
                  <span style={{ fontSize: 9, color: '#8c8c8c', marginTop: 1 }}>
                    {dayjs(cuota.fecha_vencimiento).format("DD-MMM")} 
                  </span>
                )}
              </Button>
            </Tooltip>
          );
        })}
      </Space>
    );
  };

  const estadoCalendarioAsistenciaById = useMemo(() => {
    const grupos = new Map<string, Array<{ id: string; fecha: dayjs.Dayjs; claseNumero: number }>>();

    (asistenciasHistorial || []).forEach((item) => {
      const id = String(item?.id || "");
      const matriculaId = String(item?.matricula_id || "");
      const fecha = dayjs(String(item?.fecha || ""));
      const claseNumero = Number(item?.clase_numero);

      if (!id || !matriculaId || !fecha.isValid() || !Number.isFinite(claseNumero) || claseNumero <= 0) {
        return;
      }

      const current = grupos.get(matriculaId) || [];
      current.push({ id, fecha, claseNumero });
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
  }, [asistenciasHistorial]);

  const asistenciasHistorialCompleto = useMemo(() => {
    const matriculasOrdenadas = [...matriculas].sort((a, b) => {
      const nombreA = construirNombreGrupo(a?.cursos) || "";
      const nombreB = construirNombreGrupo(b?.cursos) || "";
      return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    });

    const registrosPorMatricula = new Map<number, Map<number, AsistenciaEstudiante[]>>();
    const extrasSinClase: AsistenciaEstudiante[] = [];

    (asistenciasHistorial || []).forEach((item) => {
      const matriculaId = Number(item?.matricula_id);
      const claseNumero = Number(item?.clase_numero);

      if (!Number.isFinite(matriculaId) || matriculaId <= 0) return;

      if (!Number.isFinite(claseNumero) || claseNumero <= 0) {
        extrasSinClase.push(item);
        return;
      }

      if (!registrosPorMatricula.has(matriculaId)) {
        registrosPorMatricula.set(matriculaId, new Map<number, AsistenciaEstudiante[]>());
      }

      const porClase = registrosPorMatricula.get(matriculaId)!;
      const actuales = porClase.get(claseNumero) || [];
      actuales.push(item);
      porClase.set(claseNumero, actuales);
    });

    const filas: AsistenciaEstudiante[] = [];

    matriculasOrdenadas.forEach((matricula) => {
      const matriculaId = Number(matricula?.id);
      if (!Number.isFinite(matriculaId) || matriculaId <= 0) return;

      const totalPrograma = Math.max(obtenerTotalClasesPrograma(matricula), 0);
      const programaId = String(matricula?.cursos?.programa_id || "");
      const metaPrograma = metaCiclosPorPrograma[programaId] || {};
      const porClase = registrosPorMatricula.get(matriculaId) || new Map<number, AsistenciaEstudiante[]>();
      const maxRegistrada = Math.max(0, ...Array.from(porClase.keys()));
      const totalClases = Math.max(totalPrograma, maxRegistrada);
      const cursoNombre = construirNombreGrupo(matricula?.cursos) || matricula?.cursos?.nombre || null;
      let cicloActual: number | null = null;

      for (let clase = 1; clase <= totalClases; clase += 1) {
        const metaCiclo = metaPrograma[clase] || null;
        const cicloNumero = metaCiclo?.cicloNumero ?? (Math.floor((clase - 1) / 4) + 1);
        const cicloNombre = metaCiclo?.cicloNombre || `Ciclo ${cicloNumero}`;

        if (cicloNumero && cicloNumero !== cicloActual) {
          filas.push({
            id: `divisor-${matriculaId}-${clase}`,
            fecha: null,
            estado: null,
            observaciones: null,
            matricula_id: matriculaId,
            clase_numero: clase,
            tema_visto: null,
            pago_id: null,
            estado_pago: null,
            monto_pago: null,
            curso_nombre: cursoNombre,
            es_divisor_ciclo: true,
            ciclo_numero: cicloNumero,
            ciclo_nombre: cicloNombre,
          });
          cicloActual = cicloNumero;
        }

        const registros = (porClase.get(clase) || [])
          .slice()
          .sort((a, b) => {
            const fechaA = String(a?.fecha || "9999-12-31");
            const fechaB = String(b?.fecha || "9999-12-31");
            if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
            return String(a?.id || "").localeCompare(String(b?.id || ""));
          });

        const principal = registros[0];
        if (principal) {
          filas.push({
            ...principal,
            curso_nombre: cursoNombre,
            registros_duplicados: registros.length,
            ciclo_numero: cicloNumero,
            ciclo_nombre: cicloNombre,
          });
          continue;
        }

        filas.push({
          id: `virtual-${matriculaId}-${clase}`,
          fecha: null,
          estado: null,
          observaciones: null,
          matricula_id: matriculaId,
          clase_numero: clase,
          tema_visto: null,
          pago_id: null,
          estado_pago: null,
          monto_pago: null,
          es_placeholder: true,
          curso_nombre: cursoNombre,
          registros_duplicados: 0,
          ciclo_numero: cicloNumero,
          ciclo_nombre: cicloNombre,
        });
      }
    });

    return [...filas, ...extrasSinClase];
  }, [asistenciasHistorial, matriculas, metaCiclosPorPrograma, obtenerTotalClasesPrograma]);

  if (loading) {
    return (
      <div style={{ padding: 50, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Show
        title="Expediente no disponible"
        headerButtons={() => (
          <Button onClick={() => router.push("/estudiantes")}>← Volver a Lista</Button>
        )}
      >
        <Result
          status="404"
          title="No se encontró información"
          subTitle={loadError}
          extra={
            <Button type="primary" onClick={() => router.push("/estudiantes")}>
              Ir al listado de estudiantes
            </Button>
          }
        />
      </Show>
    );
  }

  return (
    <Show
      title={`Expediente Completo: ${perfil?.nombre_completo ?? "Estudiante"}`}
      headerButtons={() => (
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={cargarDatosCompletos}
            title="Refrescar datos"
          >
            Actualizar
          </Button>
          <Button onClick={() => router.push("/estudiantes")}>← Volver a Lista</Button>
        </Space>
      )}
    >
      <Card
        style={{
          marginBottom: 24,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          border: 0,
        }}
      >
        <Row align="middle" gutter={24}>
          <Col>
            <div style={{ position: "relative", display: "inline-block" }}>
              <Avatar
                size={100}
                style={{ backgroundColor: "#fff", color: "#667eea", fontSize: 40, cursor: perfil?.foto_url ? "pointer" : "default" }}
                icon={<UserOutlined />}
                src={perfil?.foto_url}
                onClick={() => {
                  if (perfil?.foto_url) {
                    setPreviewImage(perfil.foto_url);
                    setPreviewVisible(true);
                  }
                }}
              />
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  handleUploadPhoto(file);
                  return false;
                }}
                accept="image/*"
              >
                <Button
                  icon={<CameraOutlined />}
                  shape="circle"
                  size="small"
                  loading={uploadingPhoto}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    backgroundColor: "#fff",
                    border: "2px solid #667eea",
                  }}
                />
              </Upload>
            </div>
          </Col>
          <Col flex={1}>
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              {perfil?.nombre_completo || "Sin nombre"}
            </Title>
            <div style={{ marginTop: 8 }}>
              <Tag icon={<IdcardOutlined />} color="purple" style={{ marginRight: 8 }}>
                {perfil?.identificacion || "Sin ID"}
              </Tag>
              <Tag icon={<MailOutlined />} color="purple">
                {perfil?.email || "Sin email"}
              </Tag>
              {perfil?.telefono && (
                <Tag icon={<PhoneOutlined />} color="purple" style={{ marginLeft: 8 }}>
                  {perfil.telefono}
                </Tag>
              )}
              {perfil?.telefono && (
                <Button
                  type="primary"
                  icon={<WhatsAppOutlined />}
                  onClick={handleWhatsAppClick}
                  style={{
                    backgroundColor: "#25D366",
                    borderColor: "#25D366",
                    marginLeft: 8,
                  }}
                  size="small"
                >
                  WhatsApp
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Alerta de matrículas pendientes de pago */}
      {matriculas.some(m => m.estado === "pendiente") && (
        <Alert
          message="⚠️ Inscripciones Pendientes de Pago"
          description={
            <div>
              <p>Este estudiante tiene inscripciones académicas registradas pero pendientes de pago:</p>
              <ul>
                {matriculas
                  .filter(m => m.estado === "pendiente")
                  .map(m => (
                    <li key={m.id}>
                      <strong>{construirNombreGrupo(m.cursos)}</strong>
                      {" - "}
                      <Button 
                        type="link" 
                        size="small"
                        onClick={() => router.push(`/matriculas/pago-inscripcion/${m.id}`)}
                      >
                        Ir a completar pago
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          }
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Cursos Inscritos"
              value={estadisticasGlobales.totalCursos}
              prefix={<BookOutlined />}
              valueStyle={{ color: "#1890ff" }}
            />
            <Text type="secondary">{estadisticasGlobales.cursosActivos} activos</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Pagado"
              value={estadisticasGlobales.totalPagado}
              prefix="$"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Deuda Pendiente"
              value={estadisticasGlobales.deudaTotal}
              prefix="$"
              valueStyle={{ color: estadisticasGlobales.deudaTotal > 0 ? "#ff4d4f" : "#52c41a" }}
            />
            {estadisticasGlobales.deudaTotal > 0 && (
              <Tag color="red" style={{ marginTop: 8 }}>
                Requiere pago
              </Tag>
            )}
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: "1",
              label: (
                <span>
                  <UserOutlined /> Información Personal
                </span>
              ),
              children: (
                <Descriptions bordered column={{ xs: 1, sm: 2 }}>
                  <Descriptions.Item label="Nombre Completo">
                    {perfil?.nombre_completo || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Identificación">
                    {perfil?.identificacion || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Fecha de Nacimiento">
                    {perfil?.fecha_nacimiento
                      ? formatDate(perfil.fecha_nacimiento)
                      : "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Género">
                    {perfil?.genero || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Talla camiseta">
                    {perfil?.talla_camiseta || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email">
                    {perfil?.email || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Teléfono">
                    {perfil?.telefono || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label={
                    <>
                      <HomeOutlined /> Dirección
                    </>
                  } span={2}>
                    {perfil?.direccion || "No registrada"}
                  </Descriptions.Item>
                  <Descriptions.Item label={
                    <>
                      <TeamOutlined /> Acudiente
                    </>
                  }>
                    {perfil?.acudiente_nombre || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Teléfono Acudiente">
                    {perfil?.acudiente_telefono || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Observaciones" span={2}>
                    {perfil?.observaciones || "Ninguna"}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: "2",
              label: (
                <span>
                  <BookOutlined /> Cursos e Inscripciones
                </span>
              ),
              children: (
                <Table
                  dataSource={matriculas}
                  rowKey="id"
                  pagination={false}
                  columns={columnasCursos}
                />
              ),
            },
            {
              key: "3",
              label: (
                <span>
                  <DollarCircleOutlined /> Información Financiera
                </span>
              ),
              children: (
                <>
                  <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col xs={24} sm={8}>
                      <Card>
                        <Statistic
                          title="Total Pagado"
                          value={estadisticasGlobales.totalPagado}
                          prefix="$"
                          valueStyle={{ color: "#52c41a" }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card>
                        <Statistic
                          title="Deuda Pendiente"
                          value={estadisticasGlobales.deudaTotal}
                          prefix="$"
                          valueStyle={{ color: estadisticasGlobales.deudaTotal > 0 ? "#ff4d4f" : "#52c41a" }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card>
                        <Statistic
                          title="Total a Pagar"
                          value={estadisticasGlobales.totalPagado + estadisticasGlobales.deudaTotal}
                          prefix="$"
                          valueStyle={{ color: "#1890ff" }}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Title level={5}>Estado de Pagos por Curso</Title>
                  <Table
                    dataSource={matriculas}
                    rowKey="id"
                    pagination={false}
                    style={{ marginBottom: 24 }}
                    columns={[
                      {
                        title: "Curso",
                        dataIndex: ["cursos", "nombre"],
                        render: (_: string, record: any) => <Text strong>{construirNombreGrupo(record.cursos) || "Curso no asociado"}</Text>,
                      },
                      {
                        title: "Ciclos / Clases de Pago",
                        render: (_: any, record: any) => renderCuotasPorMatricula(record),
                        width: 600,
                      },
                    ]}
                  />

                  <Divider orientation="left">Historial Completo de Transacciones</Divider>
                  {pagosHistorialCompleto.length === 0 ? (
                    <Alert message="No hay pagos registrados para este estudiante" type="info" showIcon />
                  ) : (
                    <Table
                      dataSource={pagosHistorialCompleto}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      columns={columnasPagos}
                    />
                  )}
                </>
              ),
            },
            {
              key: "4",
              label: (
                <span>
                  <CheckCircleOutlined /> Asistencia y Temas
                </span>
              ),
              children: (
                <>
                  {matriculasPorClase.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Alert
                        message="Modalidad: Pago Por Clase"
                        description="Cada vez que este estudiante asiste a clase, se genera automáticamente un cobro de $40.000 pendiente de pago en Caja. Registra aquí la asistencia."
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          formRegistrarClase.setFieldsValue({
                            matricula_id: matriculasPorClase[0]?.id,
                            fecha: dayjs(),
                            estado: "presente",
                          });
                          setModalRegistrarClase(true);
                        }}
                      >
                        Registrar Clase Asistida
                      </Button>
                    </div>
                  )}
                  <Table
                    dataSource={asistenciasHistorialCompleto}
                    rowKey="id"
                    pagination={false}
                    locale={{ emptyText: "No hay asistencias registradas" }}
                    onRow={(record: AsistenciaEstudiante) => {
                      if (record?.es_divisor_ciclo) {
                        const cicloNumero = Number(record?.ciclo_numero || 0);
                        const colores = ["#fff7e6", "#f6ffed", "#e6f4ff", "#f9f0ff", "#fff1f0"];
                        const color = colores[(Math.max(cicloNumero, 1) - 1) % colores.length];
                        return {
                          style: {
                            background: color,
                            borderTop: "2px solid #d9d9d9",
                          },
                        };
                      }

                      const numeroClase = Number(record?.clase_numero || 0);
                      const ciclo = Number(record?.ciclo_numero || (numeroClase > 0 ? Math.floor((numeroClase - 1) / 4) + 1 : 0));
                      const fondoCiclo = ciclo > 0
                        ? (ciclo % 2 === 0 ? "#fcfaff" : "#fffefe")
                        : undefined;
                      return {
                        style: {
                          background: record?.es_placeholder
                            ? (ciclo % 2 === 0 ? "#f7f4fb" : "#fafafa")
                            : fondoCiclo,
                        },
                      };
                    }}
                    columns={[
                      {
                        title: "Fecha",
                        dataIndex: "fecha",
                        width: 130,
                        render: (val: string | null, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) {
                            const cicloNumero = Number(record?.ciclo_numero || 0);
                            const colores = ["#d46b08", "#389e0d", "#0958d9", "#7a3db8", "#cf1322"];
                            const color = colores[(Math.max(cicloNumero, 1) - 1) % colores.length];
                            return {
                              children: (
                                <div style={{ padding: "6px 4px", fontWeight: 700, color }}>
                                  {`Ciclo ${record?.ciclo_numero || ""}${record?.ciclo_nombre ? ` · ${record.ciclo_nombre}` : ""}`}
                                </div>
                              ),
                              props: { colSpan: 6 },
                            };
                          }

                          return val
                            ? formatDate(val)
                            : record?.es_placeholder
                              ? <Text type="secondary">Pendiente</Text>
                              : "-";
                        },
                      },
                      {
                        title: "N° Clase",
                        dataIndex: "clase_numero",
                        width: 90,
                        render: (val: number | null, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) return { children: null, props: { colSpan: 0 } };
                          return val ? <Text strong>{val}</Text> : <Text type="secondary">-</Text>;
                        },
                      },
                      {
                        title: "Tema visto",
                        dataIndex: "tema_visto",
                        render: (val: string | null, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) return { children: null, props: { colSpan: 0 } };
                          const estadoCalendario = estadoCalendarioAsistenciaById.get(String(record?.id || ""));
                          if (!val && !estadoCalendario && !record?.es_placeholder) return <Text type="secondary">-</Text>;

                          return (
                            <Space direction="vertical" size={2}>
                              <span>{val || (record?.es_placeholder ? "Clase pendiente por registrar" : "-")}</span>
                              {estadoCalendario ? <Tag color={estadoCalendario.color}>{estadoCalendario.label}</Tag> : null}
                              {record?.es_placeholder ? <Tag>Sin registro</Tag> : null}
                              {Number(record?.registros_duplicados || 0) > 1 ? <Tag color="orange">Registros multiples</Tag> : null}
                            </Space>
                          );
                        },
                      },
                      {
                        title: "Estado",
                        dataIndex: "estado",
                        width: 120,
                        render: (estado: string | null, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) return { children: null, props: { colSpan: 0 } };
                          return (
                          estado ? (
                            <Tag color={estado === "presente" ? "green" : estado === "tardanza" ? "orange" : "red"}>
                              {String(estado || "-").toUpperCase()}
                            </Tag>
                          ) : (
                            <Tag>POR DICTAR</Tag>
                          )
                        );
                        },
                      },
                      {
                        title: "Cobro Clase",
                        key: "estado_pago",
                        width: 150,
                        render: (_: any, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) return { children: null, props: { colSpan: 0 } };
                          if (!record.pago_id) {
                            return record.estado === "presente" ? (
                              <Tag color="default">Sin cobro</Tag>
                            ) : (
                              <Text type="secondary">-</Text>
                            );
                          }
                          const ep = String(record.estado_pago || "pendiente").toLowerCase();
                          const color = ep === "pagado" ? "green" : ep === "vencido" ? "red" : "orange";
                          const label = ep === "pagado" ? "✅ Pagado" : ep === "vencido" ? "⚠️ Vencido" : "⏳ Pendiente";
                          return (
                            <Space direction="vertical" size={2}>
                              <Tag color={color}>{label}</Tag>
                              {record.monto_pago ? (
                                <Text style={{ fontSize: 12 }}>
                                  ${Number(record.monto_pago).toLocaleString("es-CO")}
                                </Text>
                              ) : null}
                            </Space>
                          );
                        },
                      },
                      {
                        title: "Acciones",
                        key: "acciones",
                        width: 110,
                        render: (_: any, record: AsistenciaEstudiante) => {
                          if (record?.es_divisor_ciclo) return { children: null, props: { colSpan: 0 } };
                          if (record?.es_placeholder) return <Text type="secondary">-</Text>;
                          return (
                          <Popconfirm
                            title="¿Eliminar asistencia?"
                            description="Este cambio impacta panel profesor, panel estudiante y este perfil."
                            okText="Eliminar"
                            cancelText="Cancelar"
                            okButtonProps={{ danger: true, loading: deletingAsistenciaId === String(record.id) }}
                            onConfirm={() => eliminarAsistencia(String(record.id))}
                          >
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              loading={deletingAsistenciaId === String(record.id)}
                            >
                              Borrar
                            </Button>
                          </Popconfirm>
                          );
                        },
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "5",
              label: (
                <span>
                  <BookOutlined /> Materiales Entregados
                </span>
              ),
              children: (
                <HistorialEntregas estudianteId={idEstudiante} />
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
      >
        <Image
          alt="Foto de perfil"
          src={previewImage}
          width={600}
          height={600}
          style={{ width: "100%", height: "auto" }}
        />
      </Modal>

      {/* ── Modal: Registrar Asistencia Por Clase ─────────────────── */}
      <Modal
        open={modalRegistrarClase}
        title={
          <Space>
            <CalendarOutlined style={{ color: "#d46b08" }} />
            <span>Registrar Clase Asistida</span>
          </Space>
        }
        onCancel={() => {
          setModalRegistrarClase(false);
          formRegistrarClase.resetFields();
        }}
        onOk={() => formRegistrarClase.submit()}
        okText="Registrar"
        okButtonProps={{ loading: registrandoClase, type: "primary" }}
        cancelText="Cancelar"
        width={500}
        destroyOnClose
      >
        <Alert
          message="Una clase 'Presente' genera automáticamente un cobro pendiente de $40.000"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={formRegistrarClase}
          layout="vertical"
          onFinish={handleRegistrarAsistencia}
          initialValues={{ estado: "presente", fecha: dayjs() }}
        >
          {matriculasPorClase.length > 1 && (
            <Form.Item
              name="matricula_id"
              label="Curso (Plan Por Clase)"
              rules={[{ required: true, message: "Seleccione el curso" }]}
            >
              <Select
                options={matriculasPorClase.map((m: any) => ({
                  label: construirNombreGrupo(m.cursos) || `Matrícula #${m.id}`,
                  value: m.id,
                }))}
                placeholder="Seleccionar curso"
              />
            </Form.Item>
          )}
          {matriculasPorClase.length === 1 && (
            <Form.Item name="matricula_id" hidden>
              <Input />
            </Form.Item>
          )}

          <Form.Item
            name="fecha"
            label="Fecha de la clase"
            rules={[{ required: true, message: "Ingrese la fecha" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              disabledDate={(d) => d.isAfter(dayjs(), "day")}
              placeholder="Seleccionar fecha"
            />
          </Form.Item>

          <Form.Item
            name="estado"
            label="Estado de asistencia"
            rules={[{ required: true, message: "Seleccione el estado" }]}
          >
            <Select
              options={[
                { label: "✅  Presente (genera cobro)", value: "presente" },
                { label: "❌  Ausente", value: "ausente" },
                { label: "⏰  Tardanza", value: "tardanza" },
                { label: "📋  Justificado", value: "justificado" },
              ]}
            />
          </Form.Item>

          <Form.Item name="tema" label="Tema de la clase (opcional)">
            <Input placeholder="Ej: Estilismo de cejas, Keratina..." />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones (opcional)">
            <Input.TextArea rows={2} placeholder="Notas adicionales..." />
          </Form.Item>
        </Form>
      </Modal>
    </Show>
  );
}



