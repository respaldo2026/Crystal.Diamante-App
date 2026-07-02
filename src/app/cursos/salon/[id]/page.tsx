"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Card, Tabs, Typography, Space, Tag, Button, Table, List, Progress, Statistic, Row, Col, App, Upload } from "antd";
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  BookOutlined,
  DownloadOutlined,
  TrophyOutlined,
  UploadOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";
import { formatDate, formatTime } from "@utils/date";

const { Title, Text } = Typography;

export default function SalonVirtualPage() {
  const params = useParams();
  const cursoId = params?.id as string;
  const { list } = useNavigation();
  const { message } = App.useApp();
  const { user } = useCurrentUser();
  const [curso, setCurso] = useState<any>(null);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [temas, setTemas] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    
    // Cargar información del curso
    const { data: cursoData, error: cursoError } = await supabaseBrowserClient
      .from("cursos")
      .select("*, programas(nombre, descripcion), perfiles(nombre_completo)")
      .eq("id", cursoId)
      .single();

    if (cursoError) {
      message.error("Error cargando el curso");
      setLoading(false);
      return;
    }

    setCurso(cursoData);

    if (cursoData?.programa_id) {
      const { data: temasData, error: temasError } = await supabaseBrowserClient
        .from("pensum")
        .select("*")
        .eq("programa_id", cursoData.programa_id)
        .order("orden", { ascending: true });
      if (temasError) {
        console.error("Error cargando pensum:", temasError);
      }
      setTemas(temasData || []);

      const { data: materialesData, error: materialesError } = await supabaseBrowserClient
        .from("material_didactico")
        .select("*")
        .eq("programa_id", cursoData.programa_id)
        .order("orden", { ascending: true });
      if (materialesError) {
        console.error("Error cargando material didáctico:", materialesError);
      }
      setMateriales(materialesData || []);
    } else {
      setTemas([]);
      setMateriales([]);
    }

    // Cargar estudiantes matriculados
    const { data: matriculasData, error: matriculasError } = await supabaseBrowserClient
      .from("matriculas")
      .select("*, perfiles(id, nombre_completo, email, telefono)")
      .eq("curso_id", cursoId)
      .in("estado", ["activo", "en curso"]);

    if (matriculasError) {
      console.error("Error cargando matrículas:", matriculasError);
      setEstudiantes([]);
    } else if (matriculasData) {
      setEstudiantes(matriculasData);
    }

    // Cargar asistencias solo si hay matrículas
    if (matriculasData && matriculasData.length > 0) {
      const matriculaIds = matriculasData.map(m => m.id);
      
      const { data: asistenciasData, error: asistenciasError } = await supabaseBrowserClient
        .from("asistencias")
        .select("*, matriculas!asistencias_matricula_id_fkey(perfiles(nombre_completo))")
        .in("matricula_id", matriculaIds)
        .order("fecha", { ascending: false });

      if (asistenciasError) {
        console.error("Error cargando asistencias:", asistenciasError);
      } else if (asistenciasData) {
        setAsistencias(asistenciasData);
      }
    } else {
      setAsistencias([]);
    }

    setLoading(false);
  }, [cursoId, message]);

  useEffect(() => {
    if (cursoId) {
      cargarDatos();
    }
  }, [cursoId, cargarDatos]);

  const calcularEstadisticas = useCallback(() => {
    const totalEstudiantes = estudiantes.length;
    const totalClases = asistencias.length > 0 
      ? new Set(asistencias.map(a => a.fecha)).size
      : 0;

    return { totalEstudiantes, totalClases };
  }, [estudiantes, asistencias]);

  const { totalEstudiantes, totalClases } = calcularEstadisticas();

  const gamificacionProfesor = useMemo(() => {
    const profesorAsignado = String(curso?.profesor_id || "");
    const usuarioActual = String(user?.id || "");
    const esProfesorDelCurso = user?.rol === "profesor" && Boolean(profesorAsignado) && profesorAsignado === usuarioActual;

    if (!esProfesorDelCurso) {
      return null;
    }

    const minimoAsistencia = Number(curso?.porcentaje_minimo || 80);
    const totalProgramadas = Number(curso?.total_clases || 0);

    const matriculas = estudiantes.map((e: any) => String(e?.id || "")).filter(Boolean);
    const resumenPorMatricula = new Map<string, { total: number; presentes: number }>();

    matriculas.forEach((id) => {
      resumenPorMatricula.set(id, { total: 0, presentes: 0 });
    });

    asistencias.forEach((asistencia: any) => {
      const matriculaId = String(asistencia?.matricula_id || "");
      if (!resumenPorMatricula.has(matriculaId)) return;

      const actual = resumenPorMatricula.get(matriculaId);
      if (!actual) return;

      actual.total += 1;
      if (String(asistencia?.estado || "").toLowerCase() === "presente") {
        actual.presentes += 1;
      }
      resumenPorMatricula.set(matriculaId, actual);
    });

    const totalEstudiantesGrupo = matriculas.length;
    const hayRegistrosAsistencia = Array.from(resumenPorMatricula.values()).some((r) => r.total > 0);

    const porcentajes = Array.from(resumenPorMatricula.values()).map((r) =>
      r.total > 0 ? (r.presentes / r.total) * 100 : 0
    );

    const promedioAsistenciaGrupo = porcentajes.length
      ? Math.round(porcentajes.reduce((acc, item) => acc + item, 0) / porcentajes.length)
      : 0;

    const estudiantesRiesgo = hayRegistrosAsistencia
      ? porcentajes.filter((p) => p < minimoAsistencia).length
      : 0;

    const riesgoPercent = totalEstudiantesGrupo > 0
      ? Math.round((estudiantesRiesgo / totalEstudiantesGrupo) * 100)
      : 0;

    const avanceCursoPercent = totalProgramadas > 0
      ? Math.min(100, Math.round((totalClases / totalProgramadas) * 100))
      : 0;

    // Balancea calidad de asistencia, reducción de riesgo y avance del curso.
    const scoreRaw =
      (promedioAsistenciaGrupo * 0.5) +
      ((100 - riesgoPercent) * 0.3) +
      (avanceCursoPercent * 0.2);

    const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));
    const nivel = Math.max(1, Math.min(5, Math.floor(score / 20) + 1));
    const siguienteMeta = score < 60 ? 60 : score < 80 ? 80 : 100;

    return {
      score,
      nivel,
      promedioAsistenciaGrupo,
      riesgoPercent,
      avanceCursoPercent,
      estudiantesRiesgo,
      totalEstudiantesGrupo,
      siguienteMeta,
      hayRegistrosAsistencia,
    };
  }, [curso, user, estudiantes, asistencias, totalClases]);

  // Tabs del salón virtual
  const items = [
    {
      key: "estudiantes",
      label: (
        <span>
          <UserOutlined /> Estudiantes ({totalEstudiantes})
        </span>
      ),
      children: (
        <Table
          dataSource={estudiantes}
          loading={loading}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: "Nombre",
              dataIndex: ["perfiles", "nombre_completo"],
              key: "nombre",
              render: (text) => <Text strong>{text}</Text>,
            },
            {
              title: "Email",
              dataIndex: ["perfiles", "email"],
              key: "email",
            },
            {
              title: "Teléfono",
              dataIndex: ["perfiles", "telefono"],
              key: "telefono",
            },
            {
              title: "Estado",
              dataIndex: "estado",
              key: "estado",
              render: (estado) => (
                <Tag color={estado === "activo" ? "green" : "blue"}>
                  {estado?.toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Asistencia",
              key: "asistencia",
              render: (_, record) => {
                const asistenciasEstudiante = asistencias.filter(
                  a => a.matricula_id === record.id
                );
                const presentes = asistenciasEstudiante.filter(
                  a => a.estado === "presente"
                ).length;
                const total = asistenciasEstudiante.length;
                const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

                return (
                  <Space>
                    <Progress
                      type="circle"
                      percent={porcentaje}
                      size={50}
                      status={porcentaje >= 80 ? "success" : porcentaje >= 60 ? "normal" : "exception"}
                    />
                    <Text type="secondary">{presentes}/{total}</Text>
                  </Space>
                );
              },
            },
          ]}
        />
      ),
    },
    {
      key: "asistencia",
      label: (
        <span>
          <CheckCircleOutlined /> Asistencia ({totalClases} clases)
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => {
              message.info("Funcionalidad de tomar asistencia en desarrollo");
            }}
          >
            Tomar Asistencia Hoy
          </Button>
          
          <Table
            dataSource={asistencias}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: "Fecha",
                dataIndex: "fecha",
                key: "fecha",
                render: (fecha) => formatDate(fecha),
                sorter: (a, b) => dayjs(a.fecha).unix() - dayjs(b.fecha).unix(),
              },
              {
                title: "Estudiante",
                dataIndex: ["matriculas", "perfiles", "nombre_completo"],
                key: "estudiante",
              },
              {
                title: "Estado",
                dataIndex: "estado",
                key: "estado",
                render: (estado) => {
                  const config: any = {
                    presente: { color: "success", icon: <CheckCircleOutlined />, text: "Presente" },
                    ausente: { color: "error", icon: <CloseCircleOutlined />, text: "Ausente" },
                    tardanza: { color: "warning", icon: <ClockCircleOutlined />, text: "Tardanza" },
                  };
                  const conf = config[estado] || config.ausente;
                  return (
                    <Tag color={conf.color} icon={conf.icon}>
                      {conf.text}
                    </Tag>
                  );
                },
                filters: [
                  { text: "Presente", value: "presente" },
                  { text: "Ausente", value: "ausente" },
                  { text: "Tardanza", value: "tardanza" },
                ],
                onFilter: (value, record) => record.estado === value,
              },
              {
                title: "Observaciones",
                dataIndex: "observaciones",
                key: "observaciones",
                ellipsis: true,
              },
            ]}
          />
        </Space>
      ),
    },
    {
      key: "calificaciones",
      label: (
        <span>
          <TrophyOutlined /> Calificaciones
        </span>
      ),
      children: (
        <Card>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text type="secondary">
              Sistema de calificaciones en desarrollo. Aquí podrás:
            </Text>
            <ul>
              <li>Registrar notas por módulo/tema</li>
              <li>Calcular promedios automáticos</li>
              <li>Generar reportes de rendimiento</li>
              <li>Exportar calificaciones</li>
            </ul>
            <Button type="primary" disabled>
              Próximamente
            </Button>
          </Space>
        </Card>
      ),
    },
    {
      key: "material",
      label: (
        <span>
          <FileTextOutlined /> Material Didáctico
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Card title="Subir Material">
            <Upload>
              <Button icon={<UploadOutlined />}>Subir archivo</Button>
            </Upload>
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              PDF, PPT, DOCX, imágenes, videos
            </Text>
          </Card>

          <Card title="Material Disponible">
            <List
              dataSource={[]}
              locale={{ emptyText: "No hay material didáctico cargado aún" }}
              renderItem={(item: any) => (
                <List.Item
                  actions={[
                    <Button key="download" icon={<DownloadOutlined />} size="small">
                      Descargar
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={item.nombre}
                    description={`Subido el ${formatDate(item.fecha)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <Card loading={loading}>
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }}>
          <Text>Cargando salón virtual...</Text>
        </Space>
      </Card>
    );
  }

  if (!curso) {
    return (
      <Card>
        <Space direction="vertical" style={{ width: "100%", textAlign: "center" }}>
          <Text type="danger">No se encontró el curso</Text>
          <Button onClick={() => list("cursos")}>Volver a Cursos</Button>
        </Space>
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Card>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => list("cursos")}
          >
            Volver a Grupos
          </Button>

          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Estudiantes"
                value={totalEstudiantes}
                prefix={<UserOutlined />}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Clases Impartidas"
                value={totalClases}
                prefix={<CalendarOutlined />}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Estado"
                value={curso.estado?.toUpperCase()}
                valueStyle={{ color: curso.estado === "activo" ? "#3f8600" : "#666" }}
              />
            </Col>
          </Row>

          {gamificacionProfesor ? (
            <Card
              size="small"
              style={{
                borderRadius: 14,
                border: "1px solid #dbeafe",
                background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
              }}
              title={<span><StarOutlined /> Puntuación del Profesor (Gamificación)</span>}
            >
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Statistic title="Score del curso" value={gamificacionProfesor.score} suffix="/100" />
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic title="Nivel" value={gamificacionProfesor.nivel} prefix={<TrophyOutlined style={{ color: "#ca8a04" }} />} />
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic title="Estudiantes en riesgo" value={gamificacionProfesor.estudiantesRiesgo} suffix={`/ ${gamificacionProfesor.totalEstudiantesGrupo}`} />
                  </Col>
                </Row>

                <Progress
                  percent={gamificacionProfesor.score}
                  strokeColor="#2563eb"
                  trailColor="#dbeafe"
                  format={(p) => `Score ${p}`}
                />

                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                      Asistencia grupo: {gamificacionProfesor.promedioAsistenciaGrupo}%
                    </Tag>
                  </Col>
                  <Col xs={24} md={8}>
                    <Tag color={gamificacionProfesor.riesgoPercent > 30 ? "red" : "green"} style={{ marginInlineEnd: 0 }}>
                      Riesgo: {gamificacionProfesor.riesgoPercent}%
                    </Tag>
                  </Col>
                  <Col xs={24} md={8}>
                    <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                      Avance curso: {gamificacionProfesor.avanceCursoPercent}%
                    </Tag>
                  </Col>
                </Row>

                <Text type="secondary" style={{ fontSize: 12 }}>
                  {gamificacionProfesor.hayRegistrosAsistencia
                    ? `Meta siguiente: llegar a ${gamificacionProfesor.siguienteMeta} puntos manteniendo constancia semanal y bajando el riesgo.`
                    : "Aún no hay asistencias registradas: toma la primera asistencia para activar la gamificación del curso."}
                </Text>
              </Space>
            </Card>
          ) : null}

          <Card title={`Material Didáctico (${materiales.length})`}>
            {materiales.length > 0 ? (
              (() => {
                const pensumNombre = (pensumId?: string | number | null) => {
                  if (pensumId == null) return "Sin ciclo";
                  const numericId = typeof pensumId === "string" ? Number(pensumId) : pensumId;
                  const match = temas.find((t: any) => t.id === numericId || t.id === pensumId);
                  if (match) {
                    if (match.nombre_ciclo) return match.nombre_ciclo;
                    if (match.titulo) return match.titulo;
                    if (match.numero_ciclo) return `Ciclo ${match.numero_ciclo}`;
                  }
                  return "Sin ciclo";
                };

                const grupos = materiales.reduce<Record<string, any[]>>((acc, mat) => {
                  const keyValue = mat.pensum_id ?? "sin-ciclo";
                  const key = String(keyValue);
                  acc[key] = acc[key] || [];
                  acc[key].push(mat);
                  return acc;
                }, {});

                return (
                  <Space direction="vertical" size={16} style={{ marginTop: 16, width: "100%" }}>
                    {Object.entries(grupos).map(([key, mats]) => (
                      <Card
                        key={key}
                        type="inner"
                        title={`Ciclo / Tema: ${pensumNombre(key === "sin-ciclo" ? null : key)}`}
                      >
                        <List
                          dataSource={mats}
                          renderItem={(material) => (
                            <List.Item
                              key={material.id}
                              actions={material.url_archivo ? [
                                <Button
                                  key={`descargar-${material.id}`}
                                  type="link"
                                  icon={<DownloadOutlined />}
                                  href={material.url_archivo}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Descargar
                                </Button>
                              ] : []}
                            >
                              <List.Item.Meta
                                title={<Text strong>{material.titulo || material.nombre_archivo || "Recurso"}</Text>}
                                description={
                                  <Space direction="vertical" size={2}>
                                    {material.descripcion ? <Text type="secondary">{material.descripcion}</Text> : null}
                                    <Space size={8} wrap>
                                      {material.tipo_material ? <Tag>{material.tipo_material}</Tag> : null}
                                      {material.orden ? <Tag color="blue">Orden {material.orden}</Tag> : null}
                                    </Space>
                                  </Space>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      </Card>
                    ))}
                  </Space>
                );
              })()
            ) : (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">No hay material didáctico publicado para este programa.</Text>
              </div>
            )}
          </Card>
        </Space>
      </Card>

      <Card>
        <Tabs items={items} defaultActiveKey="estudiantes" />
      </Card>
    </Space>
  );
}
