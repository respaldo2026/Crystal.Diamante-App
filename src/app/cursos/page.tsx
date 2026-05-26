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
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  ReloadOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import "dayjs/locale/es";
import { useNavigation } from "@refinedev/core";
import { obtenerCursos, type GrupoAcademico } from "../../modules/academico/cursos.service";
import { construirNombreGrupo } from "@utils/grupos";

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

function calcularProximaClase(grupo: GrupoAcademico): string | null {
  const { dias_semana, hora_inicio } = grupo;
  if (!dias_semana) return null;

  const numeroDias = dias_semana
    .split(",")
    .map((d) => DIA_MAP[d.trim().toLowerCase()])
    .filter((d): d is number => d !== undefined);

  if (numeroDias.length === 0) return null;

  const hoy = dayjs();
  for (let i = 0; i <= 7; i++) {
    const candidato = hoy.add(i, "day");
    if (!numeroDias.includes(candidato.day())) continue;
    if (i === 0 && hora_inicio) {
      const [h, m] = hora_inicio.split(":").map(Number);
      const horaClase = hoy.hour(h).minute(m).second(0);
      if (hoy.isAfter(horaClase)) continue;
    }
    const horaFmt = hora_inicio
      ? dayjs(hora_inicio, "HH:mm:ss").format("hh:mm A")
      : null;
    const sufijo = horaFmt ? ` · ${horaFmt}` : "";
    if (i === 0) return `Hoy${sufijo}`;
    if (i === 1) return `Mañana${sufijo}`;
    return `${candidato.format("ddd DD MMM")}${sufijo}`;
  }
  return null;
}

function construirAvanceGrupo(grupo: GrupoAcademico) {
  const numeroClase = Number(grupo.ultima_clase_numero || 0);
  const fecha = grupo.ultima_clase_fecha ? dayjs(grupo.ultima_clase_fecha).format("DD MMM YYYY") : null;
  const tema = String(grupo.ultima_clase_tema || "").trim();
  const proximaClase = calcularProximaClase(grupo);

  if (numeroClase > 0) {
    return {
      titulo: `Van en clase #${numeroClase}`,
      detalle: fecha ? `Último registro: ${fecha}` : "Último registro confirmado",
      tema: tema || null,
      proximaClase,
      color: "#7C3AED",
      fondo: "#F5F3FF",
      borde: "#DDD6FE",
    };
  }

  return {
    titulo: "Aún no registran clase",
    detalle: "Todavía no hay una sesión tomada en el sistema",
    tema: null,
    proximaClase,
    color: "#475569",
    fondo: "#F8FAFC",
    borde: "#E2E8F0",
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

  const renderGrupo = (grupo: GrupoAcademico) => {
    const estado = obtenerEstado(grupo);
    const inscritos = obtenerInscritos(grupo);
    const capacidad = Number(grupo.cupos || 0);
    const ocupacion = capacidad > 0 ? Math.round((inscritos / capacidad) * 100) : 0;
    const mensajeInicio = construirMensajeInicio(grupo.fecha_inicio);
    const metaCapacidad = obtenerMetaCapacidad(inscritos, capacidad);
    const avanceGrupo = construirAvanceGrupo(grupo);

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
            <Flex justify="space-between" align="flex-start" gap={8} wrap="wrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ color: avanceGrupo.color, display: "block", marginBottom: 4 }}>
                  {avanceGrupo.titulo}
                </Text>
                <Text type="secondary" style={{ display: "block" }}>
                  {avanceGrupo.detalle}
                </Text>
                {avanceGrupo.tema ? (
                  <Text style={{ display: "block", marginTop: 6, color: "#0F172A" }}>
                    {avanceGrupo.tema}
                  </Text>
                ) : null}
              </div>
              {avanceGrupo.proximaClase ? (
                <div
                  style={{
                    background: "linear-gradient(135deg, #FF6B35 0%, #F59E0B 100%)",
                    borderRadius: 10,
                    padding: "7px 11px",
                    flexShrink: 0,
                    textAlign: "center",
                    boxShadow: "0 2px 8px rgba(245,158,11,0.30)",
                  }}
                >
                  <Text
                    style={{
                      display: "block",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.90)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      lineHeight: 1.2,
                    }}
                  >
                    Próxima clase
                  </Text>
                  <Text
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#ffffff",
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {avanceGrupo.proximaClase}
                  </Text>
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
    </Card>
  );
}
