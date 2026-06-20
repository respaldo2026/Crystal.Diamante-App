"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Typography,
  Button,
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
  List,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  ReloadOutlined,
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
  const { dias_semana, hora_inicio } = grupo;
  const numeroDias = parseDays(dias_semana || null);
  if (numeroDias.length === 0) return null;

  const ahora = dayjs();
  for (let i = 0; i <= 14; i += 1) {
    const candidatoDia = ahora.add(i, "day");
    if (!numeroDias.includes(candidatoDia.day())) continue;

    const candidato = applyHourToDate(candidatoDia, hora_inicio || null);
    if (candidato.isBefore(ahora)) continue;

    const horaFmt = hora_inicio ? dayjs(hora_inicio, "HH:mm:ss").format("hh:mm A") : null;
    const sufijo = horaFmt ? ` · ${horaFmt}` : "";
    const label = i === 0 ? `Hoy${sufijo}` : i === 1 ? `Mañana${sufijo}` : `${candidatoDia.format("ddd DD MMM")}${sufijo}`;

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
      proximoCiclo,
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
    proximoCiclo,
    fechaProximoCicloTexto,
    diasParaProximoCiclo,
    maximoAlcanzado: false,
    totalClasesPrograma,
    color: "#475569",
    fondo: "#F8FAFC",
    borde: "#E2E8F0",
  };
}

function getCycleUrgency(days?: number | null) {
  const d = Number(days);
  if (!Number.isFinite(d)) {
    return {
      bg: "linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)",
      border: "#93c5fd",
      shadow: "rgba(37, 99, 235, 0.18)",
      title: "#1e3a8a",
      accent: "#1d4ed8",
      chipBg: "#dbeafe",
      chipColor: "#1e3a8a",
      level: "normal",
    };
  }

  if (d <= 3) {
    return {
      bg: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
      border: "#fb7185",
      shadow: "rgba(225, 29, 72, 0.20)",
      title: "#9f1239",
      accent: "#be123c",
      chipBg: "#fecdd3",
      chipColor: "#9f1239",
      level: "urgente",
    };
  }

  if (d <= 7) {
    return {
      bg: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
      border: "#f59e0b",
      shadow: "rgba(217, 119, 6, 0.18)",
      title: "#92400e",
      accent: "#b45309",
      chipBg: "#fde68a",
      chipColor: "#92400e",
      level: "proximo",
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
    level: "planificable",
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
    return grupos.filter((grupo) => {
      if ((grupo.estado || "").toLowerCase() === "activo") {
        return true;
      }
      const fechaInicio = grupo.fecha_inicio ? dayjs(grupo.fecha_inicio) : null;
      return (
        (grupo.estado || "").toLowerCase() === "proximo" &&
        fechaInicio &&
        !fechaInicio.isAfter(hoy.add(1, "day"))
      );
    });
  }, [grupos]);

  const gruposProximos = useMemo(() => {
    const hoy = dayjs();
    return grupos
      .filter((grupo) => {
        const estado = (grupo.estado || "").toLowerCase();
        const fechaInicio = grupo.fecha_inicio ? dayjs(grupo.fecha_inicio) : null;
        if (!fechaInicio) return estado === "proximo";
        return estado === "proximo" && fechaInicio.isAfter(hoy.add(1, "day"));
      })
      .sort((a, b) => {
        const fechaA = a.fecha_inicio ? dayjs(a.fecha_inicio).valueOf() : Number.POSITIVE_INFINITY;
        const fechaB = b.fecha_inicio ? dayjs(b.fecha_inicio).valueOf() : Number.POSITIVE_INFINITY;
        return fechaA - fechaB;
      });
  }, [grupos]);

  const gruposArchivados = useMemo(() => {
    return grupos.filter((grupo) => {
      const estado = (grupo.estado || "").toLowerCase();
      return !["activo", "proximo"].includes(estado);
    });
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

  const renderGrupo = (grupo: GrupoAcademico) => {
    const estado = obtenerEstado(grupo);
    const inscritos = obtenerInscritos(grupo);
    const capacidad = Number(grupo.cupos || 0);
    const ocupacion = capacidad > 0 ? Math.round((inscritos / capacidad) * 100) : 0;
    const mensajeInicio = construirMensajeInicio(grupo.fecha_inicio);
    const metaCapacidad = obtenerMetaCapacidad(inscritos, capacidad);
    const avanceGrupo = construirAvanceGrupo(grupo);
    const urgenciaCiclo = getCycleUrgency(avanceGrupo.diasParaProximoCiclo);

    return (
      <Card
        key={grupo.id}
        hoverable
        style={{
          marginBottom: 18,
          borderRadius: 22,
          border: "1px solid #E5E7EB",
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
          background: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
        }}
        bodyStyle={{ padding: isMobile ? 14 : 22 }}
      >
        <Space direction="vertical" size={isMobile ? 12 : 16} style={{ width: "100%" }}>
          <Flex
            justify="space-between"
            align={isMobile ? "flex-start" : "center"}
            gap={12}
            vertical={isMobile}
          >
            <div style={{ width: isMobile ? "100%" : "auto" }}>
              <Space size={8} wrap style={{ marginBottom: 6 }}>
                <Tag
                  bordered={false}
                  style={{
                    borderRadius: 999,
                    paddingInline: 10,
                    paddingBlock: 4,
                    fontWeight: 600,
                    background: "#F5F3FF",
                    color: "#6D28D9",
                    marginInlineEnd: 0,
                  }}
                >
                  {grupo.programas?.nombre || "Programa sin asignar"}
                </Tag>
                <Tag color={estado.color} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                  {estado.label}
                </Tag>
              </Space>
              <Title level={isMobile ? 5 : 4} style={{ marginBottom: 4, marginTop: 0 }}>
                {construirNombreGrupo(grupo)}
              </Title>
              <Space size={8} wrap>
                {mensajeInicio ? (
                  <Tag bordered={false} color="blue" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                    {mensajeInicio}
                  </Tag>
                ) : null}
                <Tag bordered={false} color="cyan" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                  {formatearDias(grupo.dias_semana)}
                </Tag>
                <Tag bordered={false} color={metaCapacidad.color} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                  {metaCapacidad.texto}
                </Tag>
              </Space>
            </div>
            <Space wrap size={isMobile ? 4 : 8}>
              <Button 
                size={isMobile ? "small" : "middle"}
                icon={<EditOutlined />} 
                onClick={() => edit("cursos", grupo.id)}
                style={{ borderRadius: 12 }}
              >
                Editar
              </Button>
              <Button 
                type="link" 
                size={isMobile ? "small" : "middle"}
                onClick={() => show("cursos", grupo.id)}
                style={{ paddingInline: 4, fontWeight: 600 }}
              >
                {isMobile ? "Ver" : "Ver detalle"}
              </Button>
            </Space>
          </Flex>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Space align="start">
                <CalendarOutlined style={{ fontSize: 20, color: "#7C3AED" }} />
                <div>
                  <Text strong>Inicio</Text>
                  <div>{grupo.fecha_inicio ? dayjs(grupo.fecha_inicio).format("DD MMM YYYY") : "Sin fecha"}</div>
                  {mensajeInicio && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {mensajeInicio}
                    </Text>
                  )}
                </div>
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space align="start">
                <ClockCircleOutlined style={{ fontSize: 20, color: "#15803D" }} />
                <div>
                  <Text strong>Horario</Text>
                  <div>{formatearHorario(grupo.hora_inicio, grupo.hora_fin)}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatearDias(grupo.dias_semana)}
                  </Text>
                </div>
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space align="start">
                <TeamOutlined style={{ fontSize: 20, color: "#0284C7" }} />
                <div style={{ width: "100%" }}>
                  <Text strong>Ocupación</Text>
                  <div>{`${inscritos}/${capacidad || 0} estudiantes`}</div>
                  <Tooltip title={`Cupos libres: ${Math.max((capacidad || 0) - inscritos, 0)}`}>
                    <Progress
                      percent={ocupacion}
                      size="small"
                      strokeColor={ocupacion >= 100 ? "#EF4444" : ocupacion >= 80 ? "#F59E0B" : "#10B981"}
                      trailColor="#E5E7EB"
                      showInfo={false}
                      style={{ marginTop: 4 }}
                    />
                  </Tooltip>
                </div>
              </Space>
            </Col>
          </Row>

          <div
            style={{
              borderRadius: 16,
              padding: isMobile ? 12 : 14,
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
            }}
          >
            <Row gutter={[16, 12]}>
              <Col xs={24} md={8}>
                <Text type="secondary">Profesor asignado</Text>
                <div style={{ fontWeight: 600, color: "#0F172A" }}>
                  {grupo.profesor?.nombre_completo || "Por definir"}
                </div>
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">Disponibilidad actual</Text>
                <div style={{ fontWeight: 600, color: "#0F172A" }}>
                  {capacidad > 0 ? `${metaCapacidad.libres} de ${capacidad} cupos libres` : "Capacidad por definir"}
                </div>
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">Progreso del grupo</Text>
                <div style={{ fontWeight: 600, color: "#0F172A" }}>
                  {avanceGrupo.titulo}
                </div>
              </Col>
            </Row>
          </div>

          <div
            style={{
              borderRadius: 16,
              padding: isMobile ? 12 : 14,
              background: avanceGrupo.fondo,
              border: `1px solid ${avanceGrupo.borde}`,
            }}
          >
            <Flex justify="space-between" align="stretch" gap={isMobile ? 12 : 16} wrap="wrap">
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "rgba(255,255,255,0.72)",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: isMobile ? "10px 12px" : "11px 13px",
                }}
              >
                <Text strong style={{ color: avanceGrupo.color, display: "block", marginBottom: 6, fontSize: 14 }}>
                  {avanceGrupo.titulo}
                </Text>
                <Row gutter={[10, 8]}>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                      Último registro
                    </Text>
                    <Text style={{ display: "block", color: "#334155", fontWeight: 600, fontSize: 13 }}>
                      {avanceGrupo.detalle.replace(/^Último registro:\s*/i, "")}
                    </Text>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                      Clase actual
                    </Text>
                    <Text style={{ display: "block", color: "#0F172A", fontWeight: 700, fontSize: 13 }}>
                      {avanceGrupo.tema || "Sin tema registrado"}
                    </Text>
                  </Col>
                </Row>
                {avanceGrupo.maximoAlcanzado ? (
                  <Tag color="gold" style={{ marginTop: 8, borderRadius: 999 }}>
                    {`Límite alcanzado: ${avanceGrupo.totalClasesPrograma || 0} clases`}
                  </Tag>
                ) : null}
              </div>
              {avanceGrupo.proximaClaseHorario ? (
                <div
                  style={{
                    background: urgenciaCiclo.bg,
                    border: `1px solid ${urgenciaCiclo.border}`,
                    borderRadius: 14,
                    padding: isMobile ? "12px 13px" : "14px 16px",
                    flexShrink: 0,
                    width: isMobile ? "100%" : 380,
                    boxShadow: `0 12px 26px ${urgenciaCiclo.shadow}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <Text style={{ display: "block", fontSize: 12, fontWeight: 800, color: urgenciaCiclo.title, textTransform: "uppercase", letterSpacing: 0.45 }}>
                    Siguiente paso del grupo
                  </Text>
                  <Text style={{ display: "block", fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#0f172a", marginTop: 6, lineHeight: 1.35 }}>
                    {`Clase #${avanceGrupo.proximaClaseNumero}${avanceGrupo.proximaClaseNombre ? ` · ${avanceGrupo.proximaClaseNombre}` : ""}`}
                  </Text>
                  <Text style={{ display: "block", marginTop: 4, lineHeight: 1.4, color: urgenciaCiclo.accent, fontWeight: 700, fontSize: 14 }}>
                    {avanceGrupo.proximaClaseHorario}
                  </Text>
                  {avanceGrupo.proximoCiclo ? (
                    <Text style={{ display: "block", marginTop: 8, color: "#334155", fontWeight: 700, lineHeight: 1.45, fontSize: 14 }}>
                      {`Próximo ciclo: ${avanceGrupo.proximoCiclo}`}
                    </Text>
                  ) : null}
                  {avanceGrupo.fechaProximoCicloTexto ? (
                    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.62)", border: `1px solid ${urgenciaCiclo.border}` }}>
                      <Text style={{ display: "block", color: "#0f172a", fontWeight: 700, lineHeight: 1.4, fontSize: 13 }}>
                        {`Inicio estimado: ${avanceGrupo.fechaProximoCicloTexto}`}
                      </Text>
                      {typeof avanceGrupo.diasParaProximoCiclo === "number" ? (
                        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <Text style={{ fontSize: isMobile ? 22 : 26, lineHeight: 1, fontWeight: 900, color: urgenciaCiclo.accent }}>
                            {avanceGrupo.diasParaProximoCiclo}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: 800, color: urgenciaCiclo.title }}>
                            días restantes
                          </Text>
                          <span style={{ fontSize: 11, fontWeight: 800, color: urgenciaCiclo.chipColor, background: urgenciaCiclo.chipBg, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase" }}>
                            {urgenciaCiclo.level}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <Text style={{ display: "block", marginTop: 8, color: "#166534", fontWeight: 800, fontSize: 13 }}>
                    Preparar materiales desde ahora
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    icon={<FileTextOutlined />}
                    style={{ paddingInline: 0, marginTop: 8, fontWeight: 700, alignSelf: "flex-start" }}
                    disabled={!grupo.proximo_ciclo_pensum_id}
                    onClick={() => void abrirMaterialesProximoCiclo(grupo)}
                  >
                    Lista de materiales visible
                  </Button>
                </div>
              ) : avanceGrupo.maximoAlcanzado ? (
                <div
                  style={{
                    background: "linear-gradient(180deg, #ffffff 0%, #f7fff9 100%)",
                    border: "1px solid #bbf7d0",
                    borderRadius: 14,
                    padding: isMobile ? "10px 12px" : "12px 14px",
                    flexShrink: 0,
                    minWidth: isMobile ? "100%" : 250,
                    boxShadow: "0 8px 24px rgba(34, 197, 94, 0.10)",
                  }}
                >
                  <Text type="secondary" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Estado del grupo
                  </Text>
                  <Text style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#166534", marginTop: 4 }}>
                    Plan completado
                  </Text>
                  <Text type="secondary" style={{ display: "block", marginTop: 2, lineHeight: 1.4 }}>
                    {`Clase final registrada: #${avanceGrupo.totalClasesPrograma || 0}`}
                  </Text>
                  {avanceGrupo.proximoCiclo ? (
                    <Text style={{ display: "block", marginTop: 8, color: "#334155", fontWeight: 600, lineHeight: 1.4 }}>
                      {`Siguiente ciclo sugerido: ${avanceGrupo.proximoCiclo}`}
                    </Text>
                  ) : null}
                  <Button
                    type="link"
                    size="small"
                    icon={<FileTextOutlined />}
                    style={{ paddingInline: 0, marginTop: 8, fontWeight: 600 }}
                    disabled={!grupo.proximo_ciclo_pensum_id}
                    onClick={() => void abrirMaterialesProximoCiclo(grupo)}
                  >
                    Lista de materiales visible
                  </Button>
                </div>
              ) : null}
            </Flex>
          </div>
        </Space>
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
            ? `Materiales - ${construirNombreGrupo(materialesModalGrupo)} (${String(materialesModalGrupo.proximo_ciclo_nombre || materialesModalGrupo.proximo_ciclo_numero || "Próximo ciclo")})`
            : "Materiales del próximo ciclo"
        }
        open={materialesModalVisible}
        onCancel={() => {
          setMaterialesModalVisible(false);
          setMaterialesModalGrupo(null);
          setMaterialesProximoCiclo([]);
        }}
        footer={null}
        width={isMobile ? "95%" : 680}
      >
        {materialesModalLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : materialesProximoCiclo.length === 0 ? (
          <Empty description="No hay materiales cargados para el próximo ciclo" />
        ) : (
          <List
            dataSource={materialesProximoCiclo}
            rowKey="id"
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  title={item.nombre || "Material"}
                  description={
                    <Space size={8} wrap>
                      {item.cantidad ? <Tag color="blue">Cantidad: {item.cantidad}</Tag> : null}
                      {item.incluido_kit ? <Tag color="green">Incluido en kit</Tag> : null}
                      {item.cobertura_material ? <Tag>{item.cobertura_material}</Tag> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </Card>
  );
}
