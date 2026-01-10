"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Show } from "@refinedev/antd";
import {
  Typography,
  Row,
  Col,
  Card,
  Button,
  Statistic,
  Table,
  Tag,
  Spin,
  Avatar,
  Alert,
  Tabs,
  Divider,
  Descriptions,
  Result,
  Space,
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
  CameraOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { message, Upload, Modal } from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";

type Matricula = {
  id: number;
  fecha_inicio: string | null;
  estado: string | null;
  monto_pagado: number | null;
  deuda_pendiente: number | null;
  nota_final: number | null;
  cursos: {
    id: string;
    nombre: string | null;
    descripcion: string | null;
    precio: number | null;
    precio_mensualidad: number | null;
    perfiles?: {
      nombre_completo: string | null;
    } | null;
  } | null;
};

type Pago = {
  id: string;
  fecha_pago: string | null;
  matricula_id: number | null;
  matriculas: {
    cursos: {
      nombre: string | null;
    } | null;
  } | null;
  monto: number | null;
  metodo_pago: string | null;
  referencia: string | null;
  observaciones: string | null;
  periodo_pagado: string | null;
  estado?: string | null;
};

type Estadisticas = {
  totalCursos: number;
  cursosActivos: number;
  cursosFinalizados: number;
  totalPagado: number;
  deudaTotal: number;
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
  const [ciclosPorMatricula, setCiclosPorMatricula] = useState<Record<number, { total: number; pagados: number; faltantes: number; periodos: string[]; inscripcionPagada: boolean }>>({});

  const cargarDatosCompletos = useCallback(async () => {
    if (!idEstudiante) return;

    try {
      setLoading(true);
      setLoadError(null);

      const { data: dataPerfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", idEstudiante)
        .single();
      if (errPerfil || !dataPerfil) {
        setLoadError("No encontramos información para este estudiante.");
        throw errPerfil ?? new Error("Perfil no encontrado");
      }
      setPerfil(dataPerfil);

      const { data: dataMatriculas, error: errMat } = await supabaseBrowserClient
        .from("matriculas")
        .select(
          `
            id, fecha_inicio, estado, monto_pagado, deuda_pendiente, nota_final, estado_academico,
            cursos ( id, nombre, descripcion, precio, precio_mensualidad, duracion, perfiles(nombre_completo) )
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
        .select("id, fecha_pago, matricula_id, periodo_pagado, monto, metodo_pago, referencia, observaciones, estado, matriculas(cursos(nombre))")
        .eq("estudiante_id", idEstudiante)
        .order("fecha_pago", { ascending: false });
      if (errPagos) {
        setLoadError("No pudimos cargar el historial de pagos.");
        throw errPagos;
      }
      const pagosList = (dataPagos as unknown as Pago[] | null) ?? [];
      setPagosHistorial(pagosList);

      // Ciclos/meses: se toma la duración declarada del curso como total de ciclos y se cuenta los pagos asociados a la matrícula
      const ciclosMap: Record<number, { total: number; pagados: number; faltantes: number; periodos: string[]; inscripcionPagada: boolean }> = {};
      listaMats.forEach((m: any) => {
        const total = Number(m?.cursos?.duracion) || 0;
        const pagosMat = pagosList.filter((p) => p.matricula_id === m.id);
        const pagados = pagosMat.length;
        const faltantes = total > 0 ? Math.max(total - pagados, 0) : 0;
        const periodos = pagosMat.map((p) => p.periodo_pagado).filter(Boolean) as string[];
        const inscripcionPagada = pagosMat.some((p) => (p.periodo_pagado || "").toLowerCase().includes("matric"));
        ciclosMap[m.id] = { total, pagados, faltantes, periodos, inscripcionPagada };
      });
      setCiclosPorMatricula(ciclosMap);
    } catch (error) {
      console.error(error);
      setLoadError((prev) => prev ?? "Ocurrió un error cargando el expediente del estudiante.");
      message.error("Error cargando datos del estudiante");
    } finally {
      setLoading(false);
    }
  }, [idEstudiante]);

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

  const columnasCursos = useMemo(
    () => [
      {
        title: "Curso",
        dataIndex: ["cursos", "nombre"],
        key: "curso",
        render: (text: string) => <Text strong>{text}</Text>,
      },
      {
        title: "Fecha Inicio",
        dataIndex: "fecha_inicio",
        key: "inicio",
        render: (val: string) => (val ? dayjs(val).format("DD/MM/YYYY") : "Sin fecha"),
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
      },
      {
        title: "Precio Total",
        dataIndex: ["cursos", "precio"],
        key: "precio",
        render: (val: number | null) => `$${(val || 0).toLocaleString()}`,
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

  const columnasPagos = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha_pago",
        key: "fecha",
        render: (val: string | null) => (val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "-"),
      },
      {
        title: "Estado",
        dataIndex: "estado",
        key: "estado",
        render: (val: string | null) => {
          const estado = (val || "pendiente").toLowerCase();
          let color: string = "default";
          if (estado === "pagado") color = "success";
          else if (estado === "pendiente") color = "warning";
          else if (estado === "en_revision") color = "processing";
          else if (estado === "vencido") color = "error";
          return <Tag color={color}>{estado.replace("_", " ")}</Tag>;
        },
      },
      {
        title: "Curso",
        dataIndex: ["matriculas", "cursos", "nombre"],
        key: "curso",
        render: (text: string) => text || "Curso no asociado",
      },
      {
        title: "Monto",
        dataIndex: "monto",
        key: "monto",
        render: (val: number | null) => (
          <Text strong style={{ color: "#52c41a" }}>
            ${(val || 0).toLocaleString()}
          </Text>
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
        render: (text: string | null) => text || "-",
      },
      {
        title: "Observaciones",
        dataIndex: "observaciones",
        key: "obs",
        render: (text: string | null) => text || "-",
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
              const telefono = perfil?.telefono || perfil?.whatsapp || "";
              if (!telefono) {
                message.warning("El estudiante no tiene teléfono registrado");
                return;
              }
              const curso = record.matriculas?.cursos?.nombre || "tu curso";
              const estado = record.estado || "pendiente";
              const monto = record.monto ? `$${record.monto.toLocaleString('es-CO')}` : "(monto no indicado)";
              const msg = `Hola ${perfil?.nombre_completo || ''}, te recuerdo el pago de ${monto} para ${curso}. Estado: ${estado.replace('_',' ')}. Por favor confirma el pago o envía el soporte. Gracias!`;
              enviarWhatsapp(telefono, msg);
            }}
          />
        ),
      },
    ],
    []
  );

  const renderCiclos = (record: any) => {
    const info = ciclosPorMatricula[record.id] || { total: 0, pagados: 0, periodos: [] };
    const total = Number(info.total) || 0;
    if (total === 0) return <Text type="secondary">Sin ciclos definidos</Text>;

    const periodos = info.periodos.length === total ? info.periodos : Array.from({ length: total }, (_, i) => info.periodos[i] || `Ciclo ${i + 1}`);
    return (
      <Space wrap>
        {periodos.map((etiqueta, idx) => {
          const pagado = idx < info.pagados;
          return (
            <Button
              key={`${record.id}-ciclo-${idx}`}
              size="small"
              type={pagado ? "primary" : "default"}
              ghost={pagado}
              style={{ minWidth: 90 }}
            >
              {etiqueta}
              <div style={{ fontSize: 11, color: pagado ? '#52c41a' : '#ff4d4f' }}>
                {pagado ? "Pagado" : "Pendiente"}
              </div>
            </Button>
          );
        })}
      </Space>
    );
  };

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
        <Button onClick={() => router.push("/estudiantes")}>← Volver a Lista</Button>
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
                      ? dayjs(perfil.fecha_nacimiento).format("DD/MM/YYYY")
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
                  <Title level={5}>Ciclos / Meses</Title>
                  <Table
                    dataSource={matriculas}
                    rowKey="id"
                    pagination={false}
                    style={{ marginBottom: 16 }}
                    columns={[
                      {
                        title: "Curso",
                        dataIndex: ["cursos", "nombre"],
                        render: (text: string) => text || "Curso no asociado",
                      },
                      {
                        title: "Matrícula",
                        render: (_: any, record: any) => {
                          const info = ciclosPorMatricula[record.id];
                          if (info?.inscripcionPagada) return <Tag color="green">Matrícula pagada</Tag>;
                          return <Tag color="red">Matrícula pendiente</Tag>;
                        },
                      },
                      {
                        title: "Ciclos totales",
                        render: (_: any, record: any) => ciclosPorMatricula[record.id]?.total ?? record.cursos?.duracion ?? "-",
                      },
                      {
                        title: "Pagados",
                        render: (_: any, record: any) => ciclosPorMatricula[record.id]?.pagados ?? 0,
                      },
                      {
                        title: "Pendientes",
                        render: (_: any, record: any) => ciclosPorMatricula[record.id]?.faltantes ?? "-",
                      },
                      {
                        title: "Periodos pagados",
                        render: (_: any, record: any) => renderCiclos(record),
                      },
                    ]}
                  />

                  <Alert
                    message={`Balance General: $${estadisticasGlobales.totalPagado.toLocaleString()} pagados / $${estadisticasGlobales.deudaTotal.toLocaleString()} pendientes`}
                    type={estadisticasGlobales.deudaTotal > 0 ? "warning" : "success"}
                    showIcon
                    style={{ marginBottom: 16 }}
                  />

                  <Title level={5}>Detalle por Matrícula</Title>
                  <Table
                    dataSource={matriculas}
                    rowKey="id"
                    pagination={false}
                    style={{ marginBottom: 24 }}
                    columns={columnasFinanciero}
                  />

                  <Divider orientation="left">Historial de Pagos</Divider>
                  {pagosHistorial.length === 0 ? (
                    <Alert message="No hay pagos registrados" type="info" />
                  ) : (
                    <Table
                      dataSource={pagosHistorial}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      columns={columnasPagos}
                    />
                  )}
                </>
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
        <img alt="Foto de perfil" style={{ width: "100%" }} src={previewImage} />
      </Modal>
    </Show>
  );
}



