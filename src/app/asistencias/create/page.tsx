"use client";

import React, { useState, useEffect } from "react";
import { Form, Select, DatePicker, Card, Table, Switch, Button, Row, Col, Alert, message, Tag, Space, Statistic, Typography, Spin } from "antd";
import { CheckOutlined, CloseOutlined, ArrowLeftOutlined, SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

export default function TomarAsistencia() {
  const [form] = Form.useForm();
  const router = useRouter();
  const [cursoSeleccionado, setCursoSeleccionado] = useState<number | null>(null);
  const [fecha, setFecha] = useState(dayjs());
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [cursoNombre, setCursoNombre] = useState<string>("");
  const [cursos, setCursos] = useState<any[]>([]);
  
  // Estado local para guardar la asistencia antes de enviarla
  // Formato: { "id_matricula": "presente", ... }
  const [asistenciasMap, setAsistenciasMap] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  // Cargar cursos al inicio
  useEffect(() => {
    const cargarCursos = async () => {
      const { data } = await supabaseBrowserClient
        .from("cursos")
        .select("id, nombre, profesor_id")
        .eq("estado", "activo");
      setCursos(data || []);
    };
    cargarCursos();
  }, []);

  // Cargar Alumnos cuando cambia el curso
  useEffect(() => {
    if (!cursoSeleccionado) {
      setAlumnos([]);
      return;
    }

    const cargarClase = async () => {
      setLoadingAlumnos(true);
      try {
        // Buscamos matriculas ACTIVAS de este curso
        const { data, error } = await supabaseBrowserClient
          .from("matriculas")
          .select(`id, estudiante_id, perfiles(nombre_completo, email)`)
          .eq("curso_id", cursoSeleccionado)
          .eq("estado", "activo")
          .order("perfiles(nombre_completo)");

        if (error) {
          message.error("Error cargando lista de clase");
        } else {
          setAlumnos(data || []);
          // Pre-llenar todos con "presente" para ahorrar tiempo
          const inicial: any = {};
          data?.forEach((m: any) => (inicial[m.id] = "presente"));
          setAsistenciasMap(inicial);
        }
      } catch (error) {
        console.error(error);
        message.error("Error cargando estudiantes");
      } finally {
        setLoadingAlumnos(false);
      }
    };

    cargarClase();
  }, [cursoSeleccionado]);

  // Función para cambiar estado individual
  const toggleEstado = (matriculaId: number) => {
    setAsistenciasMap((prev) => ({
      ...prev,
      [matriculaId]:
        prev[matriculaId] === "presente" ? "ausente" : "presente",
    }));
  };

  // Marcar todos como presentes
  const marcarTodoPresente = () => {
    const inicial: any = {};
    alumnos.forEach((m: any) => (inicial[m.id] = "presente"));
    setAsistenciasMap(inicial);
    message.success("Todos marcados como presentes");
  };

  // Marcar todos como ausentes
  const marcarTodoAusente = () => {
    const inicial: any = {};
    alumnos.forEach((m: any) => (inicial[m.id] = "ausente"));
    setAsistenciasMap(inicial);
    message.success("Todos marcados como ausentes");
  };

  // GUARDAR TODO EN LA BD
  const guardarAsistencia = async () => {
    if (!cursoSeleccionado || alumnos.length === 0) {
      message.warning("Selecciona un curso primero");
      return;
    }

    setGuardando(true);
    try {
      const registros = alumnos.map((alumno) => ({
        matricula_id: alumno.id,
        fecha: fecha.format("YYYY-MM-DD"),
        estado: asistenciasMap[alumno.id],
        observaciones: "Clase regular",
      }));

      const { error } = await supabaseBrowserClient
        .from("asistencias")
        .insert(registros);

      if (error) {
        if (error.message.includes("unique")) {
          message.warning(
            "⚠️ Ya se tomó asistencia para este curso en esta fecha."
          );
        } else {
          message.error("Error guardando: " + error.message);
        }
      } else {
        message.success("✅ ¡Asistencia guardada correctamente!");
        setTimeout(() => router.push("/asistencias"), 1500);
      }
    } catch (error) {
      console.error(error);
      message.error("Error al guardar asistencia");
    } finally {
      setGuardando(false);
    }
  };

  // Contar presentes y ausentes
  const presentes = Object.values(asistenciasMap).filter(
    (v) => v === "presente"
  ).length;
  const ausentes = Object.values(asistenciasMap).filter(
    (v) => v === "ausente"
  ).length;

  return (
    <div style={{ padding: "24px" }}>
      {/* ENCABEZADO */}
      <div
        style={{
          marginBottom: 24,
          background:
            "linear-gradient(135deg, #1890ff 0%, #1890ff 100%)",
          color: "white",
          padding: 20,
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, color: "white" }}>
            📋 Tomar Asistencia / Llamado de Lista
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.9)" }}>
            Registra la asistencia de tus estudiantes de forma rápida y sencilla
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          size="large"
          onClick={() => router.push("/asistencias")}
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          Volver
        </Button>
      </div>

      {/* SELECCIÓN DE CURSO Y FECHA */}
      <Card
        style={{ marginBottom: 20 }}
        title="📅 Paso 1: Selecciona Curso y Fecha"
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div>
              <Text strong>Curso:</Text>
              <Select
                style={{ width: "100%", marginTop: 8 }}
                placeholder="Selecciona un curso activo..."
                value={cursoSeleccionado}
                onChange={(val) => {
                  setCursoSeleccionado(val);
                  const curso = cursos.find((c) => c.id === val);
                  setCursoNombre(curso?.nombre || "");
                }}
                options={cursos.map((c) => ({
                  label: c.nombre,
                  value: c.id,
                }))}
              />
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div>
              <Text strong>Fecha de la Clase:</Text>
              <DatePicker
                style={{ width: "100%", marginTop: 8 }}
                value={fecha}
                onChange={(val) => setFecha(val || dayjs())}
                format="DD/MM/YYYY"
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* LISTA DE ESTUDIANTES */}
      {cursoSeleccionado && (
        <>
          <Card
            title={`👥 Paso 2: Marca Asistencia - ${cursoNombre}`}
            style={{ marginBottom: 20 }}
            extra={
              <Space>
                <Button
                  onClick={marcarTodoPresente}
                  type="dashed"
                  icon={<CheckOutlined />}
                >
                  Todos Presentes
                </Button>
                <Button
                  onClick={marcarTodoAusente}
                  type="dashed"
                  danger
                  icon={<CloseOutlined />}
                >
                  Todos Ausentes
                </Button>
              </Space>
            }
          >
            {loadingAlumnos ? (
              <div style={{ textAlign: "center", padding: 50 }}>
                <Spin size="large" />
              </div>
            ) : alumnos.length === 0 ? (
              <Alert
                message="No hay estudiantes activos en este curso"
                type="info"
                showIcon
              />
            ) : (
              <>
                {/* RESUMEN RÁPIDO */}
                <Row gutter={16} style={{ marginBottom: 20 }}>
                  <Col xs={12} md={8}>
                    <Card>
                      <Statistic
                        title="Presentes"
                        value={presentes}
                        valueStyle={{ color: "#52c41a" }}
                        suffix={`/ ${alumnos.length}`}
                      />
                    </Card>
                  </Col>
                  <Col xs={12} md={8}>
                    <Card>
                      <Statistic
                        title="Ausentes"
                        value={ausentes}
                        valueStyle={{ color: "#ff4d4f" }}
                        suffix={`/ ${alumnos.length}`}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card>
                      <Statistic
                        title="% Asistencia"
                        value={
                          alumnos.length > 0
                            ? Math.round((presentes / alumnos.length) * 100)
                            : 0
                        }
                        suffix="%"
                        valueStyle={{
                          color:
                            presentes / alumnos.length >= 0.8
                              ? "#52c41a"
                              : "#ff4d4f",
                        }}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* TABLA DE ESTUDIANTES */}
                <Table
                  dataSource={alumnos}
                  rowKey="id"
                  pagination={{ pageSize: 15 }}
                  loading={loadingAlumnos}
                  columns={[
                    {
                      title: "Estudiante",
                      dataIndex: ["perfiles", "nombre_completo"],
                      render: (txt) => (
                        <Text strong>{txt || "Sin nombre"}</Text>
                      ),
                    },
                    {
                      title: "Email",
                      dataIndex: ["perfiles", "email"],
                      ellipsis: true,
                      width: 250,
                    },
                    {
                      title: "Asistencia",
                      align: "center",
                      width: 150,
                      render: (_, record: any) => {
                        const esPresente = asistenciasMap[record.id] === "presente";
                        return (
                          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                            <Switch
                              checked={esPresente}
                              onChange={() => toggleEstado(record.id)}
                              checkedChildren={<CheckOutlined />}
                              unCheckedChildren={<CloseOutlined />}
                            />
                            <Tag
                              color={esPresente ? "success" : "error"}
                              style={{ margin: 0 }}
                            >
                              {esPresente ? "PRESENTE" : "AUSENTE"}
                            </Tag>
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </>
            )}
          </Card>

          {/* BOTONES DE ACCIÓN */}
          {alumnos.length > 0 && (
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Button
                  block
                  size="large"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push("/asistencias")}
                >
                  Cancelar
                </Button>
              </Col>
              <Col xs={24} md={12}>
                <Button
                  block
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  loading={guardando}
                  onClick={guardarAsistencia}
                >
                  💾 Guardar Asistencia
                </Button>
              </Col>
            </Row>
          )}
        </>
      )}
    </div>
  );
}