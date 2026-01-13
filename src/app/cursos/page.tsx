"use client";

import React, { useEffect, useMemo, useState } from "react";
import { App, Card, Typography, Tag, Button, Spin, Input, Space, Row, Col, Checkbox, Alert, Dropdown } from "antd";
import {
  PlusOutlined,
  EditOutlined,
  CalendarOutlined,
  UserOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  BookOutlined,
  TeamOutlined,
  DownOutlined,
  DeleteOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";
import "dayjs/locale/es";

dayjs.locale("es");

const { Title, Text } = Typography;

type ProgramaAgrupado = {
  id: number | null;
  nombre: string;
  duracion?: string | null;
  precio?: number | null;
  descripcion?: string | null;
  cohortes: any[];
};

export default function CursosList() {
  const { message, modal } = App.useApp();
  const { edit, create, show } = useNavigation();
  const { user } = useCurrentUser();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});

  useEffect(() => {
    // Cargar inmediatamente, aplicar filtros cuando user esté disponible
    cargarCursos();
  }, [mostrarFinalizados, user]);

  const cargarCursos = async () => {
    setLoading(true);
    let query = supabaseBrowserClient
      .from("cursos")
      .select(`*, perfiles (nombre_completo), programas (*)`)
      .neq("estado", "eliminado");

    // Filtrar por rol solo si user está disponible
    if (user && user.rol === "estudiante") {
      query = query.eq("perfiles.id", user.id);
    } else if (user && user.rol === "profesor") {
      query = query.eq("profesor_id", user.id);
    }
    // Admin/Director/Administrativo o sin user ven todos

    if (!mostrarFinalizados) {
      query = query.neq("estado", "finalizado");
    }

    const { data, error } = await query.order("fecha_inicio", { ascending: false });

    if (error) {
      message.error("No se pudieron cargar los cursos");
      setLoading(false);
      return;
    }

    const cursosData = data || [];
    setCursos(cursosData);
    cargarInscritosPorCurso(cursosData.map((c: any) => c.id));
    setLoading(false);
  };

  const cargarInscritosPorCurso = async (cursoIds: number[]) => {
    if (cursoIds.length === 0) return;
    const { data, error } = await supabaseBrowserClient
      .from("matriculas")
      .select("curso_id")
      .in("curso_id", cursoIds);

    if (error) {
      message.error("No se pudieron cargar los inscritos");
      return;
    }

    const conteos: Record<number, number> = {};
    cursoIds.forEach((id) => {
      conteos[id] = (data || []).filter((m: any) => m.curso_id === id).length;
    });
    setInscritosPorCurso(conteos);
  };

  const programas = useMemo<ProgramaAgrupado[]>(() => {
    const mapa: Record<string, ProgramaAgrupado> = {};

    cursos.forEach((curso) => {
      const programaId = curso.programa_id;
      const programaData = curso.programas;
      const key = programaId || `legacy_${curso.nombre}`;

      if (!mapa[key]) {
        mapa[key] = {
          id: programaId,
          nombre: programaData?.nombre || curso.nombre || "Programa",
          duracion: programaData?.duracion || curso.duracion,
          precio: programaData?.precio ?? curso.precio,
          descripcion: programaData?.descripcion || curso.descripcion,
          cohortes: [],
        };
      }

      mapa[key].cohortes.push(curso);
    });

    return Object.values(mapa).filter((p) =>
      p.nombre.toLowerCase().includes(searchText.trim().toLowerCase())
    );
  }, [cursos, searchText]);

  const clasificarCohortes = (cohortes: any[]) => {
    const hoy = dayjs();
    const activos: any[] = [];
    const proximos: any[] = [];
    const terminados: any[] = [];

    cohortes.forEach((c) => {
      if (c.estado === "finalizado") {
        terminados.push(c);
        return;
      }
      if (c.estado !== "activo") {
        proximos.push(c);
        return;
      }
      if (c.fecha_inicio && dayjs(c.fecha_inicio).isAfter(hoy)) {
        proximos.push(c);
      } else {
        activos.push(c);
      }
    });

    return { activos, proximos, terminados };
  };

  const handleSoftDelete = (grupo: any) => {
    modal.confirm({
      title: "¿Eliminar este grupo?",
      content: (
        <div>
          <p>Se ocultará de los listados, pero se conserva el historial (pagos, matrículas, asistencias).</p>
          <p>Úsalo para ocultar grupos de ejemplo o que ya no deben mostrarse.</p>
        </div>
      ),
      okText: "Sí, eliminar",
      okType: "danger",
      cancelText: "Cancelar",
      onOk: async () => {
        const { error } = await supabaseBrowserClient
          .from("cursos")
          .update({ estado: "eliminado" })
          .eq("id", grupo.id);

        if (error) {
          message.error("No se pudo eliminar el grupo");
          return;
        }

        message.success("Grupo eliminado (soft-delete)");
        cargarCursos();
      },
    });
  };

  const handleToggleEstado = (grupo: any) => {
    const esActivo = grupo.estado === "activo";
    const nuevoEstado = esActivo ? "finalizado" : "activo";

    const confirmar = async () => {
      const { error } = await supabaseBrowserClient
        .from("cursos")
        .update({ estado: nuevoEstado })
        .eq("id", grupo.id);

      if (error) {
        message.error("No se pudo actualizar el estado");
        return;
      }

      message.success(nuevoEstado === "activo" ? "Grupo reactivado" : "Grupo finalizado");
      cargarCursos();
    };

    const revisarMatriculas = async () => {
      const { data, error } = await supabaseBrowserClient
        .from("matriculas")
        .select("id")
        .eq("curso_id", grupo.id)
        .eq("estado", "activo");

      if (error) {
        message.error("No se pudieron revisar las matrículas");
        return;
      }

      if (data && data.length > 0) {
        modal.warning({
          title: "No se puede finalizar",
          content: (
            <div>
              <p>Este grupo tiene estudiantes activos. Cierra sus matrículas antes de finalizar.</p>
            </div>
          ),
          okText: "Entendido",
        });
        return;
      }

      confirmar();
    };

    modal.confirm({
      title: esActivo ? "¿Finalizar este grupo?" : "¿Reactivar este grupo?",
      content: esActivo
        ? "El grupo se ocultará de la lista principal, pero el historial se mantiene."
        : "El grupo volverá a estar disponible para nuevas inscripciones.",
      okText: esActivo ? "Finalizar" : "Reactivar",
      okType: esActivo ? "default" : "primary",
      cancelText: "Cancelar",
      onOk: async () => {
        if (esActivo) {
          await revisarMatriculas();
        } else {
          await confirmar();
        }
      },
    });
  };

  const CohorteCard = ({ cohorte }: { cohorte: any }) => {
    const esFinalizado = cohorte.estado === "finalizado";
    const esActivo = cohorte.estado === "activo";
    const inscritos = inscritosPorCurso[cohorte.id] || 0;
    const cupos = cohorte.cupos || 20;
    const disponibles = Math.max(0, cupos - inscritos);
    const lleno = disponibles === 0;

    const diaTexto = Array.isArray(cohorte.dias_semana)
      ? cohorte.dias_semana.join(" / ")
      : (cohorte.dias_semana || "")
          .toString()
          .split(",")
          .map((d: string) => d.trim())
          .filter(Boolean)
          .join(" / ");

    const horaInicio = cohorte.hora_inicio ? dayjs(cohorte.hora_inicio, "HH:mm:ss").format("h:mm A") : "";
    const horaFin = cohorte.hora_fin ? dayjs(cohorte.hora_fin, "HH:mm:ss").format("h:mm A") : "";
    const horario = [horaInicio, horaFin].filter(Boolean).join(" - ");

    return (
      <Card size="small" style={{ marginBottom: 12, borderLeft: `4px solid ${lleno ? "#ff4d4f" : "#52c41a"}` }}>
        <Row gutter={16} align="middle">
          {esFinalizado && (
            <Col span={24}>
              <Tag color="default" style={{ marginBottom: 8 }}>
                FINALIZADO
              </Tag>
            </Col>
          )}
          <Col flex="auto">
            <Space direction="vertical" size={4}>
              <Text strong>{cohorte.programas?.nombre || cohorte.nombre || "Grupo"}</Text>
              {diaTexto && (
                <Text type="secondary">
                  <CalendarOutlined /> {diaTexto}
                </Text>
              )}
              {horario && (
                <Text type="secondary">
                  <ClockCircleOutlined /> {horario}
                </Text>
              )}
              {cohorte.perfiles?.nombre_completo && (
                <Text type="secondary">
                  <UserOutlined /> {cohorte.perfiles.nombre_completo}
                </Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space direction="vertical" size={4} style={{ textAlign: "center" }}>
              <Tag color={lleno ? "red" : "blue"} style={{ margin: 0 }}>
                {inscritos}/{cupos} estudiantes
              </Tag>
              {disponibles > 0 && (
                <Text type="success" style={{ fontSize: 11 }}>
                  {disponibles} disponibles
                </Text>
              )}
              {lleno && (
                <Text type="danger" style={{ fontSize: 11 }}>
                  LLENO
                </Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button 
                size="small" 
                type="primary"
                icon={<TeamOutlined />}
                onClick={() => window.location.href = `/cursos/salon/${cohorte.id}`}
              >
                Entrar al Salón
              </Button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'editar',
                      label: 'Editar',
                      icon: <EditOutlined />,
                      onClick: () => edit("cursos", cohorte.id),
                    },
                    {
                      key: 'finalizar',
                      label: esActivo ? 'Finalizar' : 'Reactivar',
                      icon: esActivo ? <StopOutlined /> : <CheckCircleOutlined />,
                      onClick: () => handleToggleEstado(cohorte),
                      danger: esActivo,
                    },
                    {
                      type: 'divider',
                    },
                    {
                      key: 'eliminar',
                      label: 'Eliminar',
                      icon: <DeleteOutlined />,
                      onClick: () => handleSoftDelete(cohorte),
                      danger: true,
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button size="small" icon={<EditOutlined />}>
                  Editar <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 50, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 24,
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>
            Cursos (programas) y sus grupos
          </Title>
          <Text type="secondary">Cada curso académico puede tener múltiples grupos/horarios.</Text>
        </div>
        <Space wrap>
          <Input
            placeholder="Buscar programa..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />
          <Checkbox checked={mostrarFinalizados} onChange={(e) => setMostrarFinalizados(e.target.checked)}>
            Ver finalizados
          </Checkbox>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => create("cursos")}>
            Nuevo grupo
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {programas.map((programa) => {
          const { activos, proximos, terminados } = clasificarCohortes(programa.cohortes);
          const totalInscritos = programa.cohortes.reduce(
            (sum: number, c: any) => sum + (inscritosPorCurso[c.id] || 0),
            0
          );
          const totalGrupos = programa.cohortes.length;

          return (
            <Col xs={24} md={12} lg={8} key={programa.id ?? programa.nombre}>
              <Card
                title={
                  <Space>
                    <BookOutlined />
                    <Text strong>{programa.nombre}</Text>
                  </Space>
                }
                extra={<Tag color="purple">Total grupos: {totalGrupos}</Tag>}
                style={{ height: "100%" }}
              >
                <Space direction="vertical" style={{ width: "100%" }} size="small">
                  <Space size="small" wrap>
                    {programa.duracion && <Tag icon={<ClockCircleOutlined />}>{programa.duracion}</Tag>}
                    <Tag icon={<TeamOutlined />} color="blue">
                      {totalInscritos} estudiantes
                    </Tag>
                    <Tag color="green">Activos: {activos.length}</Tag>
                    <Tag color="blue">Próximos: {proximos.length}</Tag>
                    <Tag>Terminados: {terminados.length}</Tag>
                  </Space>

                  {programa.descripcion && <Text type="secondary">{programa.descripcion}</Text>}

                  <Space wrap>
                    <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => create("cursos")}>
                      Crear grupo
                    </Button>
                  </Space>

                  {totalGrupos === 0 && (
                    <Alert
                      type="warning"
                      message="Este programa aún no tiene grupos."
                      action={
                        <Button size="small" type="primary" onClick={() => create("cursos")}>
                          Crear grupo
                        </Button>
                      }
                      showIcon
                    />
                  )}

                  {totalGrupos > 0 && (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {[...activos, ...proximos, ...terminados].map((cohorte: any) => (
                        <CohorteCard key={cohorte.id} cohorte={cohorte} />
                      ))}
                    </Space>
                  )}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {programas.length === 0 && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Text type="secondary">No se encontraron programas</Text>
        </div>
      )}
    </div>
  );
}
