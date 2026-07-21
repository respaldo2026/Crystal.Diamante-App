"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Typography,
  Button,
  Checkbox,
  Dropdown,
  Spin,
  Row,
  Col,
  Tag,
  Space,
  Divider,
  Progress,
  Empty,
  Tooltip,
  App,
  Grid,
  Flex,
  Modal,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  ReloadOutlined,
  MoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import "dayjs/locale/es";
import { useNavigation } from "@refinedev/core";
import { obtenerCursos, type GrupoAcademico } from "../../modules/academico/cursos.service";
import { construirNombreGrupo } from "@utils/grupos";
import { supabaseBrowserClient } from "@utils/supabase/client";

dayjs.extend(updateLocale);
dayjs.updateLocale("es", { weekStart: 1 });
dayjs.locale("es");

const { useBreakpoint } = Grid;

const { Title, Text } = Typography;

const ESTADO_META: Record<string, { label: string; color: string }> = {
  activo: { label: "Activo", color: "green" },
  proximo: { label: "Próximo", color: "blue" },
  cerrado: { label: "Cerrado", color: "orange" },
  finalizado: { label: "Finalizado", color: "default" },
};

const TOTAL_CLASES_DEFAULT = 20;

function formatearDias(dias?: string | null) {
  if (!dias) return "Sin días definidos";
  return dias
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((dia) => dia.charAt(0).toUpperCase() + dia.slice(1))
    .join(" · ");
}

function formatearHorario(inicio?: string | null, fin?: string | null) {
  if (!inicio && !fin) return "Horario no asignado";
  const formato = (valor: string | null | undefined) =>
    valor ? dayjs(valor, "HH:mm:ss").format("hh:mm A") : "";
  const inicioFmt = formato(inicio);
  const finFmt = formato(fin);
  if (inicioFmt && finFmt) {
    return `${inicioFmt} - ${finFmt}`;
  }
  return inicioFmt || finFmt || "Horario no asignado";
}

function construirMensajeInicio(fecha?: string | null) {
  if (!fecha) return null;
  const hoy = dayjs();
  const inicio = dayjs(fecha);
  const diff = inicio.startOf("day").diff(hoy.startOf("day"), "day");
  if (diff === 0) return "Inicia hoy";
  if (diff === 1) return "Inicia mañana";
  if (diff > 1) return `Inicia en ${diff} días`;
  if (diff === -1) return "Inició ayer";
  return `Inició hace ${Math.abs(diff)} días`;
}

function obtenerInscritos(grupo: GrupoAcademico) {
  return Number(grupo.matriculas?.[0]?.count || 0);
}

function obtenerEstado(grupo: GrupoAcademico) {
  const estado = (grupo.estado || "").toLowerCase();
  return ESTADO_META[estado] ?? { label: estado || "Sin estado", color: "default" };
}

function obtenerTotalClasesObjetivo(grupo: GrupoAcademico): number {
  const totalCurso = Number(grupo?.total_clases || 0);
  if (Number.isFinite(totalCurso) && totalCurso > 0) return totalCurso;

  const totalPrograma = Number(grupo?.programas?.total_clases || 0);
  if (Number.isFinite(totalPrograma) && totalPrograma > 0) return totalPrograma;

  return TOTAL_CLASES_DEFAULT;
}

function grupoCompletado(grupo: GrupoAcademico): boolean {
  const ultimaClase = Number(grupo?.ultima_clase_numero || 0);
  if (!Number.isFinite(ultimaClase) || ultimaClase <= 0) return false;
  return ultimaClase >= obtenerTotalClasesObjetivo(grupo);
}

function obtenerMetaCapacidad(inscritos: number, capacidad: number) {
  const libres = Math.max(capacidad - inscritos, 0);
  if (capacidad <= 0) {
    return { libres, color: "default" as const, texto: "Capacidad por definir" };
  }
  if (libres === 0) {
    return { libres, color: "error" as const, texto: "Grupo lleno" };
  }
  if (libres <= 2) {
    return { libres, color: "warning" as const, texto: `${libres} cupo${libres === 1 ? "" : "s"} libre${libres === 1 ? "" : "s"}` };
  }
  return { libres, color: "success" as const, texto: `${libres} cupos disponibles` };
}

const DIA_MAP: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2,
  miércoles: 3, miercoles: 3,
  jueves: 4, viernes: 5,
  sábado: 6, sabado: 6,
};

function parseDays(diasSemana?: string | null): number[] {
  if (!diasSemana) return [];
  const dias = diasSemana
    .split(",")
    .map((d) => DIA_MAP[d.trim().toLowerCase()])
    .filter((d): d is number => d !== undefined);
  return Array.from(new Set(dias));
}

function getMondayFirstRank(day: number): number {
  // dayjs: domingo=0 ... sabado=6. Queremos lunes primero.
  return day === 0 ? 6 : day - 1;
}

function getPrimaryGroupDayRank(grupo: GrupoAcademico): number {
  const dias = parseDays(grupo.dias_semana || null);
  if (!dias.length) return Number.POSITIVE_INFINITY;
  return Math.min(...dias.map(getMondayFirstRank));
}

function getHourSortValue(hora?: string | null): number {
  if (!hora) return Number.POSITIVE_INFINITY;
  const parsed = dayjs(hora, "HH:mm:ss", true);
  if (parsed.isValid()) return parsed.hour() * 60 + parsed.minute();
  const fallback = dayjs(hora, "HH:mm", true);
  if (fallback.isValid()) return fallback.hour() * 60 + fallback.minute();
  return Number.POSITIVE_INFINITY;
}

function sortGroupsBySchedule(a: GrupoAcademico, b: GrupoAcademico): number {
  const dayRankDiff = getPrimaryGroupDayRank(a) - getPrimaryGroupDayRank(b);
  if (dayRankDiff !== 0) return dayRankDiff;

  const hourDiff = getHourSortValue(a.hora_inicio) - getHourSortValue(b.hora_inicio);
  if (hourDiff !== 0) return hourDiff;

  const startDiff =
    (a.fecha_inicio ? dayjs(a.fecha_inicio).valueOf() : Number.POSITIVE_INFINITY) -
    (b.fecha_inicio ? dayjs(b.fecha_inicio).valueOf() : Number.POSITIVE_INFINITY);
  if (startDiff !== 0) return startDiff;

  return construirNombreGrupo(a).localeCompare(construirNombreGrupo(b), "es", { sensitivity: "base" });
}

function applyHourToDate(base: dayjs.Dayjs, horaInicio?: string | null): dayjs.Dayjs {
  if (!horaInicio) return base.startOf("day");
  const partes = String(horaInicio).split(":");
  const hhRaw = Number(partes[0] ?? 0);
  const mmRaw = Number(partes[1] ?? 0);
  const hh = Number.isFinite(hhRaw) ? hhRaw : 0;
  const mm = Number.isFinite(mmRaw) ? mmRaw : 0;
  return base.hour(hh).minute(mm).second(0).millisecond(0);
}

function calcularProximaClaseInfo(grupo: GrupoAcademico): { label: string; date: dayjs.Dayjs } | null {
  const { dias_semana, hora_inicio, fecha_inicio } = grupo;
  const numeroDias = parseDays(dias_semana || null);
  if (numeroDias.length === 0) return null;

  const ahora = dayjs();
  const inicioProgramado = fecha_inicio ? applyHourToDate(dayjs(fecha_inicio), hora_inicio || null) : null;
  const referencia = inicioProgramado && inicioProgramado.isAfter(ahora) ? inicioProgramado : ahora;

  for (let i = 0; i <= 14; i += 1) {
    const candidatoDia = referencia.add(i, "day");
    if (!numeroDias.includes(candidatoDia.day())) continue;

    const candidato = applyHourToDate(candidatoDia, hora_inicio || null);
    if (inicioProgramado && candidato.isBefore(inicioProgramado)) continue;
    if (candidato.isBefore(ahora)) continue;

    const horaFmt = hora_inicio ? dayjs(hora_inicio, "HH:mm:ss").format("hh:mm A") : null;
    const sufijo = horaFmt ? ` · ${horaFmt}` : "";
    const diffDias = candidato.startOf("day").diff(ahora.startOf("day"), "day");
    const label =
      diffDias === 0
        ? `Hoy${sufijo}`
        : diffDias === 1
          ? `Mañana${sufijo}`
          : `${candidatoDia.format("ddd DD MMM")}${sufijo}`;

    return { label, date: candidato };
  }

  return null;
}

function sumarClasesProgramadas(
  desde: dayjs.Dayjs,
  diasSemana?: string | null,
  horaInicio?: string | null,
  clasesPorAvanzar: number = 0,
): dayjs.Dayjs | null {
  if (clasesPorAvanzar <= 0) return desde;
  const dias = parseDays(diasSemana || null);
  if (!dias.length) return null;

  let restantes = clasesPorAvanzar;
  let cursor = desde.startOf("day").add(1, "day");
  let intentos = 0;

  while (restantes > 0 && intentos < 400) {
    if (dias.includes(cursor.day())) {
      restantes -= 1;
      if (restantes === 0) {
        return applyHourToDate(cursor, horaInicio || null);
      }
    }
    cursor = cursor.add(1, "day");
    intentos += 1;
  }

  return null;
}

function construirAvanceGrupo(grupo: GrupoAcademico) {
  const numeroClase = Number(grupo.ultima_clase_numero || 0);
  const fecha = grupo.ultima_clase_fecha ? dayjs(grupo.ultima_clase_fecha).format("DD MMM YYYY") : null;
  const tema = String(grupo.ultima_clase_tema || "").trim();
  const proximaClaseInfo = calcularProximaClaseInfo(grupo);
  const proximaClaseHorario = proximaClaseInfo?.label || null;
  const proximaClaseNumeroDetectada = Number(grupo.siguiente_clase_numero || 0);
  const proximaClaseNumero =
    Number.isFinite(proximaClaseNumeroDetectada) && proximaClaseNumeroDetectada > 0
      ? proximaClaseNumeroDetectada
      : numeroClase > 0
        ? numeroClase + 1
        : 1;
  const proximaClaseNombre = String(grupo.siguiente_clase_nombre || "").trim() || null;
  const totalClasesPrograma = Number(grupo.programas?.total_clases || 0) || null;

  const cicloActualNombre = String(grupo.ciclo_actual_nombre || "").trim();
  const cicloActualNumeroRaw = Number(grupo.ciclo_actual_numero || 0);
  const cicloActualNumero =
    Number.isFinite(cicloActualNumeroRaw) && cicloActualNumeroRaw > 0 ? cicloActualNumeroRaw : null;
  const cicloActual = cicloActualNombre || (cicloActualNumero ? `Ciclo ${cicloActualNumero}` : null);

  const proximoCicloNombre = String(grupo.proximo_ciclo_nombre || "").trim();
  const proximoCicloNumeroRaw = Number(grupo.proximo_ciclo_numero || 0);
  const proximoCicloNumero =
    Number.isFinite(proximoCicloNumeroRaw) && proximoCicloNumeroRaw > 0 ? proximoCicloNumeroRaw : null;
  const proximoCiclo = proximoCicloNombre || (proximoCicloNumero ? `Ciclo ${proximoCicloNumero}` : null);
  const maximoAlcanzado = Boolean(totalClasesPrograma && numeroClase >= totalClasesPrograma);

  const siguienteInicioCicloClase = numeroClase > 0 ? (Math.floor((numeroClase - 1) / 4) * 4) + 5 : null;
  const clasesParaProximoCiclo =
    !proximaClaseInfo || !siguienteInicioCicloClase || !proximaClaseNumero
      ? null
      : Math.max(siguienteInicioCicloClase - proximaClaseNumero, 0);
  const fechaInicioProximoCiclo =
    proximaClaseInfo && clasesParaProximoCiclo !== null
      ? sumarClasesProgramadas(
          proximaClaseInfo.date,
          grupo.dias_semana || null,
          grupo.hora_inicio || null,
          clasesParaProximoCiclo,
        )
      : null;
  const diasParaProximoCiclo = fechaInicioProximoCiclo
    ? fechaInicioProximoCiclo.startOf("day").diff(dayjs().startOf("day"), "day")
    : null;
  const fechaProximoCicloTexto = fechaInicioProximoCiclo
    ? fechaInicioProximoCiclo.format("ddd DD MMM YYYY")
    : null;

  if (numeroClase > 0) {
    return {
      titulo: `Van en clase #${numeroClase}`,
      detalle: fecha ? `Último registro: ${fecha}` : "Último registro confirmado",
      tema: tema || null,
      proximaClaseHorario: maximoAlcanzado ? null : proximaClaseHorario,
      proximaClaseNumero: maximoAlcanzado ? null : proximaClaseNumero,
      proximaClaseNombre: maximoAlcanzado ? null : proximaClaseNombre,
      cicloActual,
      cicloActualNumero,
      proximoCiclo,
      proximoCicloNumero,
      fechaProximoCicloTexto,
      diasParaProximoCiclo,
      maximoAlcanzado,
      totalClasesPrograma,
      color: "#7C3AED",
      fondo: "#F5F3FF",
      borde: "#DDD6FE",
    };
  }

  return {
    titulo: "Aún no registran clase",
    detalle: "Todavía no hay una sesión tomada en el sistema",
    tema: null,
    proximaClaseHorario,
    proximaClaseNumero,
    proximaClaseNombre,
    cicloActual,
    cicloActualNumero,
    proximoCiclo,
    proximoCicloNumero,
    fechaProximoCicloTexto,
    diasParaProximoCiclo,
    maximoAlcanzado: false,
    totalClasesPrograma,
    color: "#475569",
    fondo: "#F8FAFC",
    borde: "#E2E8F0",
  };
}

function normalizarLabelCiclo(numero?: number | null, ciclo?: string | null): string | null {
  if (Number.isFinite(numero) && Number(numero) > 0) {
    return `Ciclo #${Number(numero)}`;
  }

  const value = String(ciclo || "").trim();
  if (!value) return null;
  const match = value.match(/(\d+)/);
  if (match) return `Ciclo #${match[1]}`;
  return value;
}

function formatearLineaCambioCiclo(
  cicloActualNumero?: number | null,
  cicloSiguienteNumero?: number | null,
  cicloActual?: string | null,
  cicloSiguiente?: string | null
): string | null {
  const actual = normalizarLabelCiclo(cicloActualNumero, cicloActual);
  const siguiente = normalizarLabelCiclo(cicloSiguienteNumero, cicloSiguiente);

  if (actual && siguiente) return `${actual} -> ${siguiente}`;
  if (siguiente) return `Pasa a ${siguiente}`;
  return null;
}

function getCycleUrgency(days?: number | null) {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return {
      bg: "linear-gradient(180deg, #fff8e1 0%, #ffecb3 100%)",
      border: "#f59e0b",
      shadow: "rgba(217, 119, 6, 0.18)",
      title: "#92400e",
      accent: "#b45309",
      chipBg: "#fde68a",
      chipColor: "#92400e",
      level: "amarillo",
      label: "#f59e0b",
    };
  }

  const d = days;

  if (d <= 8) {
    return {
      bg: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
      border: "#fb7185",
      shadow: "rgba(225, 29, 72, 0.20)",
      title: "#9f1239",
      accent: "#be123c",
      chipBg: "#fecdd3",
      chipColor: "#9f1239",
      level: "rojo",
      label: "#ef4444",
    };
  }

  if (d <= 15) {
    return {
      bg: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
      border: "#f59e0b",
      shadow: "rgba(217, 119, 6, 0.18)",
      title: "#92400e",
      accent: "#b45309",
      chipBg: "#fde68a",
      chipColor: "#92400e",
      level: "amarillo",
      label: "#f59e0b",
    };
  }

  return {
    bg: "linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "#34d399",
    shadow: "rgba(5, 150, 105, 0.16)",
    title: "#065f46",
    accent: "#047857",
    chipBg: "#a7f3d0",
    chipColor: "#065f46",
    level: "verde",
    label: "#22c55e",
  };
}

export default function CursosList() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTablet = screens.md && !screens.lg;
  const { edit, create, show } = useNavigation();
  const { message } = App.useApp();
  const [grupos, setGrupos] = useState<GrupoAcademico[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [materialesModalVisible, setMaterialesModalVisible] = useState(false);
  const [materialesModalLoading, setMaterialesModalLoading] = useState(false);
  const [materialesModalGrupo, setMaterialesModalGrupo] = useState<GrupoAcademico | null>(null);
  const [materialesProximoCiclo, setMaterialesProximoCiclo] = useState<any[]>([]);
  const [materialesMarcados, setMaterialesMarcados] = useState<string[]>([]);

  const cargarGrupos = useCallback(async () => {
    try {
      const data = await obtenerCursos();
      setGrupos(data);
    } catch (error) {
      message.error("No se pudieron cargar los grupos");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    cargarGrupos();
  }, [cargarGrupos]);

  const refrescar = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await obtenerCursos();
      setGrupos(data);
    } catch (error) {
      message.error("No se pudieron actualizar los grupos");
    } finally {
      setRefreshing(false);
    }
  }, [message]);

  const gruposActivos = useMemo(() => {
    const hoy = dayjs();
    return grupos
      .filter((grupo) => {
        if (grupoCompletado(grupo)) return false;
        if ((grupo.estado || "").toLowerCase() === "activo") {
          return true;
        }
        const fechaInicio = grupo.fecha_inicio ? dayjs(grupo.fecha_inicio) : null;
        return (
          (grupo.estado || "").toLowerCase() === "proximo" &&
          fechaInicio &&
          !fechaInicio.isAfter(hoy.add(1, "day"))
        );
      })
      .sort(sortGroupsBySchedule);
  }, [grupos]);

  const gruposProximos = useMemo(() => {
    const hoy = dayjs();
    return grupos
      .filter((grupo) => {
        if (grupoCompletado(grupo)) return false;
        const estado = (grupo.estado || "").toLowerCase();
        const fechaInicio = grupo.fecha_inicio ? dayjs(grupo.fecha_inicio) : null;
        if (!fechaInicio) return estado === "proximo";
        return estado === "proximo" && fechaInicio.isAfter(hoy.add(1, "day"));
      })
      .sort(sortGroupsBySchedule);
  }, [grupos]);

  const gruposArchivados = useMemo(() => {
    return grupos
      .filter((grupo) => {
        if (grupoCompletado(grupo)) return true;
        const estado = (grupo.estado || "").toLowerCase();
        return !["activo", "proximo"].includes(estado);
      })
      .sort(sortGroupsBySchedule);
  }, [grupos]);

  const totalInscritosActivos = useMemo(
    () => gruposActivos.reduce((acc, grupo) => acc + obtenerInscritos(grupo), 0),
    [gruposActivos]
  );
  const totalCuposActivos = useMemo(
    () => gruposActivos.reduce((acc, grupo) => acc + Number(grupo.cupos || 0), 0),
    [gruposActivos]
  );
  const cuposDisponibles = Math.max(totalCuposActivos - totalInscritosActivos, 0);

  const abrirMaterialesProximoCiclo = useCallback(
    async (grupo: GrupoAcademico) => {
      const pensumId = String(grupo.proximo_ciclo_pensum_id || "").trim();
      const programaId = Number(grupo.programa_id || 0);

      if (!pensumId || !programaId) {
        message.warning("Este grupo no tiene próximo ciclo definido todavía.");
        return;
      }

      setMaterialesModalGrupo(grupo);
      setMaterialesModalVisible(true);
      setMaterialesModalLoading(true);
      setMaterialesMarcados([]);

      try {
        const { data, error } = await supabaseBrowserClient
          .from("materiales_ciclo")
          .select("id, nombre, cantidad, cobertura_material, incluido_kit, orden")
          .eq("programa_id", programaId)
          .eq("pensum_id", pensumId)
          .eq("activo", true)
          .order("orden", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMaterialesProximoCiclo(data || []);
      } catch (error) {
        console.error("Error cargando materiales del próximo ciclo:", error);
        message.error("No se pudieron cargar los materiales del próximo ciclo");
        setMaterialesProximoCiclo([]);
      } finally {
        setMaterialesModalLoading(false);
      }
    },
    [message]
  );

  const toggleMaterialMarcado = useCallback((materialId: string, checked: boolean) => {
    setMaterialesMarcados((prev) => {
      if (checked) {
        return prev.includes(materialId) ? prev : [...prev, materialId];
      }
      return prev.filter((id) => id !== materialId);
    });
  }, []);

  const imprimirChecklistMateriales = useCallback(() => {
    if (!materialesModalGrupo || materialesProximoCiclo.length === 0 || typeof window === "undefined") {
      return;
    }

    const cicloLabel = String(
      materialesModalGrupo.proximo_ciclo_nombre || materialesModalGrupo.proximo_ciclo_numero || "Próximo ciclo"
    );
    const grupoLabel = construirNombreGrupo(materialesModalGrupo);
    const printedAt = dayjs().format("DD/MM/YYYY hh:mm A");
    const itemsHtml = materialesProximoCiclo
      .map((item: any) => {
        const id = String(item?.id || "");
        const checked = materialesMarcados.includes(id);
        const cantidad = item?.cantidad ? `x${item.cantidad}` : "x1";
        const nombre = String(item?.nombre || "Material").trim();
        return `
          <div class="item-row">
            <div class="check">${checked ? "[x]" : "[ ]"}</div>
            <div class="name">${cantidad} ${nombre}</div>
          </div>
        `;
      })
      .join("");

    const printWindow = window.open("", "_blank", "width=420,height=760");
    if (!printWindow) {
      message.warning("No se pudo abrir la ventana de impresión.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Checklist materiales</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: Arial, sans-serif;
              width: 72mm;
              margin: 0 auto;
              color: #111827;
              font-size: 12px;
              line-height: 1.35;
            }
            .title {
              font-size: 15px;
              font-weight: 700;
              margin-bottom: 2mm;
            }
            .meta {
              font-size: 11px;
              margin-bottom: 1mm;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 3mm 0;
            }
            .item-row {
              display: flex;
              gap: 2mm;
              padding: 1.5mm 0;
              border-bottom: 1px dotted #cbd5e1;
            }
            .check {
              width: 10mm;
              font-weight: 700;
            }
            .name {
              flex: 1;
              font-weight: 600;
              word-break: break-word;
            }
            .footer {
              margin-top: 4mm;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <div class="title">Checklist de materiales</div>
          <div class="meta"><strong>Grupo:</strong> ${grupoLabel}</div>
          <div class="meta"><strong>Ciclo:</strong> ${cicloLabel}</div>
          <div class="meta"><strong>Impreso:</strong> ${printedAt}</div>
          <div class="divider"></div>
          ${itemsHtml}
          <div class="footer">Marca esta lista al alistar materiales.</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [materialesMarcados, materialesModalGrupo, materialesProximoCiclo, message]);

  const renderGrupo = (grupo: GrupoAcademico) => {
    const completado = grupoCompletado(grupo);
    const estado = completado ? ESTADO_META.finalizado : obtenerEstado(grupo);
    const inscritos = obtenerInscritos(grupo);
    const capacidad = Number(grupo.cupos || 0);
    const mensajeInicio = construirMensajeInicio(grupo.fecha_inicio);
    const metaCapacidad = obtenerMetaCapacidad(inscritos, capacidad);
    const avanceGrupo = construirAvanceGrupo(grupo);
    const urgenciaCiclo = getCycleUrgency(avanceGrupo.diasParaProximoCiclo);
    const cambioCicloLabel = formatearLineaCambioCiclo(
      avanceGrupo.cicloActualNumero,
      avanceGrupo.proximoCicloNumero,
      avanceGrupo.cicloActual,
      avanceGrupo.proximoCiclo
    );
    const proximoCicloVisible = normalizarLabelCiclo(avanceGrupo.proximoCicloNumero, avanceGrupo.proximoCiclo);
    const tituloSemaforo = urgenciaCiclo.level === "rojo" ? "Preparar materiales" : "Seguimiento de ciclo";
    const proximaClaseTexto = avanceGrupo.proximaClaseHorario
      ? `#${avanceGrupo.proximaClaseNumero}${avanceGrupo.proximaClaseNombre ? ` · ${avanceGrupo.proximaClaseNombre}` : ""} · ${avanceGrupo.proximaClaseHorario}`
      : avanceGrupo.maximoAlcanzado
        ? `Plan completado (${avanceGrupo.totalClasesPrograma || 0} clases)`
        : "Sin próxima clase";
    const menuAcciones = {
      items: [
        { key: "edit", label: "Editar" },
        { key: "show", label: "Ver detalle" },
      ],
      onClick: ({ key }: { key: string }) => {
        if (key === "edit") {
          edit("cursos", grupo.id);
          return;
        }
        if (key === "show") {
          show("cursos", grupo.id);
        }
      },
    };

    return (
      <Card
        key={grupo.id}
        hoverable
        style={{
          marginBottom: 8,
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          boxShadow: "0 3px 10px rgba(15, 23, 42, 0.04)",
        }}
        bodyStyle={{ padding: isMobile ? 10 : 11 }}
      >
        <Row gutter={[10, 8]} align="middle">
          <Col xs={24} xl={6}>
            <Space size={6} wrap style={{ marginBottom: 4 }}>
              <Tag
                bordered={false}
                style={{
                  borderRadius: 999,
                  fontWeight: 600,
                  background: "#F5F3FF",
                  color: "#6D28D9",
                  marginInlineEnd: 0,
                }}
              >
                {grupo.programas?.nombre || "Programa"}
              </Tag>
              <Tag color={estado.color} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                {estado.label}
              </Tag>
            </Space>
            <Text strong style={{ fontSize: 14 }}>{construirNombreGrupo(grupo)}</Text>
            <div style={{ marginTop: 2 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {grupo.profesor?.nombre_completo || "Profesor por definir"}
              </Text>
            </div>
            {cambioCicloLabel ? (
              <div style={{ marginTop: 6 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: urgenciaCiclo.bg,
                    border: `1px solid ${urgenciaCiclo.border}`,
                    color: urgenciaCiclo.title,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 0.2,
                  }}
                >
                  {cambioCicloLabel}
                </span>
              </div>
            ) : null}
          </Col>

          <Col xs={12} sm={8} md={6} xl={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>Días y horario</Text>
            <div style={{ fontWeight: 600 }}>{formatearDias(grupo.dias_semana)}</div>
            <div style={{ fontSize: 12, color: "#334155" }}>{formatearHorario(grupo.hora_inicio, grupo.hora_fin)}</div>
          </Col>

          <Col xs={12} sm={8} md={4} xl={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>Inicio</Text>
            <div style={{ fontWeight: 600 }}>{grupo.fecha_inicio ? dayjs(grupo.fecha_inicio).format("DD MMM YYYY") : "Sin fecha"}</div>
            {mensajeInicio ? <div style={{ fontSize: 12, color: "#2563EB" }}>{mensajeInicio}</div> : null}
          </Col>

          <Col xs={24} sm={12} md={7} xl={4}>
            <div
              style={{
                background: urgenciaCiclo.bg,
                border: `1px solid ${urgenciaCiclo.border}`,
                borderRadius: 12,
                padding: isMobile ? "8px 10px" : "10px 12px",
                boxShadow: `0 8px 18px ${urgenciaCiclo.shadow}`,
              }}
            >
              <Space size={6} align="center" style={{ marginBottom: 2 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: urgenciaCiclo.label,
                    display: "inline-block",
                    boxShadow: `0 0 0 3px ${urgenciaCiclo.chipBg}`,
                  }}
                />
                <Text style={{ fontSize: 12, color: urgenciaCiclo.title, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {tituloSemaforo}
                </Text>
              </Space>
              <div style={{ fontWeight: 700, lineHeight: 1.35, marginTop: 4, color: "#0f172a" }}>
                {proximaClaseTexto}
              </div>
              {proximoCicloVisible ? (
                <div style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>
                    {`Ciclo por iniciar: ${proximoCicloVisible}`}
                  </Text>
                </div>
              ) : null}
              <Space size={6} style={{ marginTop: 6 }} wrap>
                {typeof avanceGrupo.diasParaProximoCiclo === "number" ? (
                  <Tag bordered={false} style={{ borderRadius: 999, marginInlineEnd: 0, fontWeight: 700 }}>{`${avanceGrupo.diasParaProximoCiclo} días`}</Tag>
                ) : (
                  <Tag bordered={false} style={{ borderRadius: 999, marginInlineEnd: 0, fontWeight: 700 }}>Sin fecha exacta</Tag>
                )}
              </Space>
            </div>
          </Col>

          <Col xs={24} md={4} xl={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>Cupos</Text>
            <div style={{ fontWeight: 700 }}>{`${inscritos}/${capacidad || 0}`}</div>
            <div style={{ fontSize: 12, color: "#334155" }}>
              {capacidad > 0 ? `${metaCapacidad.libres} libres` : "Por definir"}
            </div>
          </Col>

          <Col xs={24} md={5} xl={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ver materiales</Text>
            <div style={{ marginTop: 4 }}>
              <Button
                type="link"
                size="small"
                icon={<FileTextOutlined />}
                style={{ paddingInline: 0, fontWeight: 700 }}
                disabled={!grupo.proximo_ciclo_pensum_id}
                onClick={() => void abrirMaterialesProximoCiclo(grupo)}
              >
                {proximoCicloVisible ? proximoCicloVisible : "Ver"}
              </Button>
            </div>
          </Col>

          <Col xs={24} xl={5}>
            <Flex justify={isMobile ? "flex-start" : "flex-end"} align="center" gap={6} wrap="wrap">
              <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
                {avanceGrupo.titulo}
              </Text>
              <Dropdown menu={menuAcciones} trigger={["click"]} placement="bottomRight">
                <Button size="small" icon={<MoreOutlined />} style={{ borderRadius: 10 }} />
              </Dropdown>
            </Flex>
          </Col>
        </Row>
      </Card>
    );
  };

  if (loading) {
    return (
      <Card style={{ minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </Card>
    );
  }

  return (
    <Card
      variant="borderless"
      style={{
        background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 32%)",
        borderRadius: 28,
      }}
      bodyStyle={{ padding: isMobile ? 14 : 22 }}
    >
      <Space direction="vertical" size={isMobile ? 16 : 24} style={{ width: "100%" }}>
        <Flex
          justify="space-between"
          align={isMobile ? "flex-start" : "center"}
          gap={12}
          vertical={isMobile}
        >
          <div>
            <Title level={isMobile ? 3 : 2} style={{ marginBottom: 0, marginTop: 0 }}>
              Grupos académicos
            </Title>
            <Text type="secondary">
              Revisa el estado, la disponibilidad y el calendario de cada grupo en un solo lugar.
            </Text>
          </div>
          <Space size={isMobile ? 8 : 12}>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={refrescar} 
              loading={refreshing}
              size={isMobile ? "middle" : "large"}
              style={{ borderRadius: 14 }}
            >
              {isMobile ? "" : "Actualizar"}
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => create("cursos")}
              size={isMobile ? "middle" : "large"}
              style={{ borderRadius: 14, boxShadow: "0 10px 24px rgba(217, 28, 130, 0.22)" }}
            >
              {isMobile ? "Nuevo" : "Nuevo grupo"}
            </Button>
          </Space>
        </Flex>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card
              variant="outlined"
              size="small"
              style={{ borderRadius: 18, borderColor: "#D6E4FF", background: "#F7FAFF" }}
            >
              <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>Grupos activos</Text>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: "#1D4ED8" }}>{gruposActivos.length}</Title>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              variant="outlined"
              size="small"
              style={{ borderRadius: 18, borderColor: "#D1FAE5", background: "#F5FFFB" }}
            >
              <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>Próximos grupos</Text>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: "#047857" }}>{gruposProximos.length}</Title>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              variant="outlined"
              size="small"
              style={{ borderRadius: 18, borderColor: "#FBCFE8", background: "#FFF7FB" }}
            >
              <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>Cupos disponibles (activos)</Text>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: "#BE185D" }}>{cuposDisponibles}</Title>
            </Card>
          </Col>
        </Row>

        <section>
          <Divider orientation="left">Grupos activos</Divider>
          {gruposActivos.length === 0 ? (
            <Empty description="No hay grupos activos en este momento" />
          ) : (
            gruposActivos.map(renderGrupo)
          )}
        </section>

        <section>
          <Divider orientation="left">Próximos grupos</Divider>
          {gruposProximos.length === 0 ? (
            <Empty description="No hay lanzamientos programados" />
          ) : (
            gruposProximos.map(renderGrupo)
          )}
        </section>

        {gruposArchivados.length > 0 && (
          <section>
            <Divider orientation="left">Archivados</Divider>
            {gruposArchivados.map(renderGrupo)}
          </section>
        )}
      </Space>

      <Modal
        title={
          materialesModalGrupo
            ? `Checklist de materiales - ${String(materialesModalGrupo.proximo_ciclo_nombre || materialesModalGrupo.proximo_ciclo_numero || "Próximo ciclo")}`
            : "Checklist de materiales"
        }
        open={materialesModalVisible}
        onCancel={() => {
          setMaterialesModalVisible(false);
          setMaterialesModalGrupo(null);
          setMaterialesProximoCiclo([]);
          setMaterialesMarcados([]);
        }}
        footer={[
          <Button key="print" onClick={imprimirChecklistMateriales} disabled={materialesProximoCiclo.length === 0}>
            Imprimir 80mm
          </Button>,
          <Button
            key="close"
            type="primary"
            onClick={() => {
              setMaterialesModalVisible(false);
              setMaterialesModalGrupo(null);
              setMaterialesProximoCiclo([]);
              setMaterialesMarcados([]);
            }}
          >
            Cerrar
          </Button>,
        ]}
        width={isMobile ? "95%" : 680}
      >
        {materialesModalLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : materialesProximoCiclo.length === 0 ? (
          <Empty description="No hay materiales cargados para el próximo ciclo" />
        ) : (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {materialesModalGrupo ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                }}
              >
                <Text strong style={{ display: "block" }}>
                  {construirNombreGrupo(materialesModalGrupo)}
                </Text>
                <Text type="secondary" style={{ display: "block", marginTop: 2 }}>
                  {`Ciclo a preparar: ${String(materialesModalGrupo.proximo_ciclo_nombre || materialesModalGrupo.proximo_ciclo_numero || "Próximo ciclo")}`}
                </Text>
              </div>
            ) : null}

            <div
              style={{
                border: "1px solid #E5E7EB",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {materialesProximoCiclo.map((item: any, index: number) => {
                const id = String(item?.id || index);
                const checked = materialesMarcados.includes(id);
                const cantidad = item?.cantidad ? `x${item.cantidad}` : "x1";
                const nombre = String(item?.nombre || "Material").trim();

                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderBottom: index === materialesProximoCiclo.length - 1 ? "none" : "1px solid #F1F5F9",
                      background: checked ? "#F0FDF4" : "#FFFFFF",
                      cursor: "pointer",
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={(event) => toggleMaterialMarcado(id, event.target.checked)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          display: "block",
                          fontWeight: 600,
                          color: "#0F172A",
                          textDecoration: checked ? "line-through" : "none",
                          opacity: checked ? 0.75 : 1,
                        }}
                      >
                        {`${cantidad} ${nombre}`}
                      </Text>
                    </div>
                  </label>
                );
              })}
            </div>
          </Space>
        )}
      </Modal>
    </Card>
  );
}
