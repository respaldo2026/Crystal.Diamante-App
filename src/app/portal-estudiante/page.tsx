"use client";

import React, { useEffect, useState } from "react";
import { Tabs, Card, Table, Row, Col, Statistic, Spin, Alert, Progress, Button, Empty, message, Modal, Dropdown, Tag, Divider } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  TrophyOutlined,
  DownloadOutlined,
  WhatsAppOutlined,
  EllipsisOutlined,
  DollarCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";

const { Title, Text } = require("antd").Typography;

export default function PortalEstudiante() {
  const [loading, setLoading] = useState(true);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);

  useEffect(() => {
    cargarDatosEstudiante();
  }, []);

  const cargarDatosEstudiante = async () => {
    try {
      setLoading(true);
      
      // Obtener estudiante autenticado
      const { data: { user }, error: authError } = await supabaseBrowserClient.auth.getUser();
      if (authError || !user) {
        message.error("No autenticado");
        return;
      }

      // Cargar perfil
      const { data: perfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (errPerfil || !perfil) {
        message.error("Error cargando perfil");
        return;
      }

      setEstudiante(perfil);

      // Cargar asistencias
      const { data: dataAsistencias, error: errAsistencias } = await supabaseBrowserClient
        .from("asistencias")
        .select("*, matriculas(cursos(nombre))")
        .eq("matriculas.perfiles_id", user.id);

      if (!errAsistencias && dataAsistencias) {
        setAsistencias(dataAsistencias);
      }

      // Cargar calificaciones
      const { data: dataCalificaciones, error: errCalificaciones } = await supabaseBrowserClient
        .from("calificaciones")
        .select("*, matriculas(cursos(nombre))")
        .eq("matriculas.perfiles_id", user.id);

      if (!errCalificaciones && dataCalificaciones) {
        setCalificaciones(dataCalificaciones);
      }

      // Calcular avance por curso
      const { data: dataMatriculas, error: errMatriculas } = await supabaseBrowserClient
        .from("matriculas")
        .select("*, cursos(*, temas_curso(count))")
        .eq("estudiante_id", user.id)
        .eq("estado", "activo");

      if (!errMatriculas && dataMatriculas) {
        const avance = dataMatriculas.map((m: any) => ({
          curso: m.cursos?.nombre,
          cursada: m.cursos?.nota_final || 0,
          totalTemas: m.cursos?.temas_curso?.[0]?.count || 0,
          porcentaje: m.nota_final || 0,
        }));
        setAvancePorCurso(avance);
      }

      // Verificar certificados disponibles (cursos finalizados con nota >= 70)
      const { data: dataCertificados } = await supabaseBrowserClient
        .from("matriculas")
        .select("*, cursos(nombre, fecha_fin)")
        .eq("estudiante_id", user.id)
        .eq("estado_academico", "aprobado")
        .gte("nota_final", 70);

      if (dataCertificados) {
        setCertificados(dataCertificados);
      }

      // Cargar pagos (realizados y pendientes)
      const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
        .from("pagos")
        .select("*, matriculas(cursos(nombre))")
        .eq("perfiles_id", user.id)
        .order("fecha_pago", { ascending: false });

      if (!errPagos && dataPagos) {
        setPagos(dataPagos);
      }
    } catch (error) {
      console.error("Error:", error);
      message.error("Error cargando datos");
    } finally {
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
      console.error(err);
      message.error("No se pudo descargar el certificado");
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 10 }}>Cargando tu información...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Title level={2}>Bienvenido, {estudiante?.nombre_completo}! 🎓</Title>
            <Text type="secondary">Portal de Estudiante - Academy Crystal</Text>
          </Col>
          <Col xs={24} sm={12} style={{ textAlign: "right" }}>
            {estudiante?.telefono && (
              <Button
                icon={<WhatsAppOutlined />}
                type="primary"
                size="large"
                style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
                onClick={() => enviarWhatsapp(estudiante.telefono, "Hola, quiero recibir información sobre mis cursos")}
              >
                Contactar
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: "1",
            label: <span><CheckCircleOutlined /> Asistencia</span>,
            children: (
              <>
                {asistencias.length === 0 ? (
                  <Empty description="No hay registros de asistencia" />
                ) : (
                  <>
                    <Row gutter={16} style={{ marginBottom: 20 }}>
                      <Col xs={24} sm={8}>
                        <Card>
                          <Statistic
                            title="Total de Clases"
                            value={asistencias.length}
                            prefix={<BookOutlined />}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Card>
                          <Statistic
                            title="Presente"
                            value={asistencias.filter((a: any) => a.estado === "presente").length}
                            valueStyle={{ color: "#52c41a" }}
                            prefix={<CheckCircleOutlined />}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Card>
                          <Statistic
                            title="Ausente"
                            value={asistencias.filter((a: any) => a.estado === "ausente").length}
                            valueStyle={{ color: "#ff4d4f" }}
                            prefix={<CloseCircleOutlined />}
                          />
                        </Card>
                      </Col>
                    </Row>
                    <Table
                      dataSource={asistencias}
                      rowKey="id"
                      columns={[
                        {
                          title: "Fecha",
                          dataIndex: "fecha",
                          render: (fecha) => dayjs(fecha).format("DD/MM/YYYY"),
                        },
                        {
                          title: "Curso",
                          render: (_, record: any) => record.matriculas?.cursos?.nombre,
                        },
                        {
                          title: "Estado",
                          dataIndex: "estado",
                          render: (estado) => (
                            <span style={{ color: estado === "presente" ? "green" : "red" }}>
                              {estado.charAt(0).toUpperCase() + estado.slice(1)}
                            </span>
                          ),
                        },
                        {
                          title: "Observaciones",
                          dataIndex: "observaciones",
                        },
                      ]}
                    />
                  </>
                )}
              </>
            ),
          },
          {
            key: "2",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <>
                {calificaciones.length === 0 ? (
                  <Empty description="No hay calificaciones registradas" />
                ) : (
                  <Table
                    dataSource={calificaciones}
                    rowKey="id"
                    columns={[
                      {
                        title: "Curso",
                        render: (_, record: any) => record.matriculas?.cursos?.nombre,
                      },
                      {
                        title: "Tipo",
                        dataIndex: "tipo_evaluacion",
                        render: (tipo) => tipo?.charAt(0).toUpperCase() + tipo?.slice(1),
                      },
                      {
                        title: "Calificación",
                        dataIndex: "calificacion",
                        render: (cal) => (
                          <span style={{ fontWeight: "bold", color: cal >= 70 ? "green" : "red" }}>
                            {cal}/100
                          </span>
                        ),
                      },
                      {
                        title: "Fecha",
                        dataIndex: "fecha_evaluacion",
                        render: (fecha) => dayjs(fecha).format("DD/MM/YYYY"),
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: "3",
            label: <span><BookOutlined /> Avance</span>,
            children: (
              <>
                {avancePorCurso.length === 0 ? (
                  <Empty description="No hay cursos activos" />
                ) : (
                  <Row gutter={16}>
                    {avancePorCurso.map((curso: any, idx: number) => (
                      <Col xs={24} sm={12} lg={8} key={idx}>
                        <Card title={curso.curso}>
                          <Progress
                            type="circle"
                            percent={Math.min(curso.porcentaje, 100)}
                            strokeColor={curso.porcentaje >= 70 ? "#52c41a" : "#faad14"}
                          />
                          <div style={{ marginTop: 10 }}>
                            <Text>Calificación: {curso.porcentaje.toFixed(1)}/100</Text>
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: "4",
            label: <span><DollarCircleOutlined /> Pagos</span>,
            children: (
              <>
                {pagos.length === 0 ? (
                  <Empty description="No hay registros de pago" />
                ) : (
                  <>
                    <Row gutter={16} style={{ marginBottom: 20 }}>
                      <Col xs={24} sm={12}>
                        <Card>
                          <Statistic
                            title="Total Pagado"
                            value={pagos.filter((p: any) => p.estado === "confirmado").reduce((sum: number, p: any) => sum + Number(p.monto || 0), 0)}
                            prefix="$"
                            valueStyle={{ color: "#52c41a" }}
                            formatter={(value) => `$ ${Number(value).toLocaleString()}`}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Card>
                          <Statistic
                            title="Pagos Pendientes"
                            value={pagos.filter((p: any) => p.estado === "pendiente").length}
                            valueStyle={{ color: "#faad14" }}
                          />
                        </Card>
                      </Col>
                    </Row>
                    <Table
                      dataSource={pagos}
                      rowKey="id"
                      columns={[
                        {
                          title: "Fecha",
                          dataIndex: "fecha_pago",
                          render: (fecha) => dayjs(fecha).format("DD/MM/YYYY"),
                        },
                        {
                          title: "Curso",
                          render: (_, record: any) => record.matriculas?.cursos?.nombre,
                        },
                        {
                          title: "Monto",
                          dataIndex: "monto",
                          render: (monto) => `$ ${Number(monto || 0).toLocaleString()}`,
                        },
                        {
                          title: "Método",
                          dataIndex: "metodo_pago",
                          render: (metodo) => <Tag color="blue">{metodo}</Tag>,
                        },
                        {
                          title: "Estado",
                          dataIndex: "estado",
                          render: (estado) => (
                            <Tag color={estado === "confirmado" ? "success" : "warning"}>
                              {estado?.charAt(0).toUpperCase() + estado?.slice(1)}
                            </Tag>
                          ),
                        },
                        {
                          title: "Referencia",
                          dataIndex: "referencia",
                        },
                      ]}
                      pagination={{ pageSize: 10 }}
                    />
                  </>
                )}
              </>
            ),
          },
          {
            key: "5",
            label: <span><TrophyOutlined /> Certificados</span>,
            children: (
              <>
                {certificados.length === 0 ? (
                  <Alert message="Completa tus cursos para descargar certificados" type="info" showIcon />
                ) : (
                  <Table
                    dataSource={certificados}
                    rowKey="id"
                    columns={[
                      {
                        title: "Curso",
                        render: (_, record: any) => record.cursos?.nombre,
                      },
                      {
                        title: "Calificación",
                        dataIndex: "nota_final",
                        render: (nota) => <span style={{ fontWeight: "bold", color: "green" }}>{nota}/100</span>,
                      },
                      {
                        title: "Fecha Finalización",
                        render: (_, record: any) => dayjs(record.cursos?.fecha_fin).format("DD/MM/YYYY"),
                      },
                      {
                        title: "Acciones",
                        width: 90,
                        render: (_, record: any) => {
                          const items = [
                            { key: "descargar", label: "Descargar", icon: <DownloadOutlined /> },
                          ];
                          return (
                            <Dropdown
                              trigger={["click"]}
                              menu={{
                                items,
                                onClick: ({ key }) => {
                                  if (key === "descargar") descargarCertificado(record);
                                }
                              }}
                            >
                              <Button icon={<EllipsisOutlined />} />
                            </Dropdown>
                          );
                        },
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
