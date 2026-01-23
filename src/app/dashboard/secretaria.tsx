

import React, { useEffect, useState } from "react";
import { Card, Row, Col, Button, List, Spin, message, Modal, Input, Select, Space } from "antd";
import { Column } from "@ant-design/plots";
import { UserAddOutlined, FileTextOutlined } from "@ant-design/icons";
import { getCursosDisponibles, getPagosPendientes } from "./secretaria.api";
import { crearMatricula, registrarPago } from "./secretaria.actions";


export default function SecretariaDashboard() {
  const [cursos, setCursos] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [matriculasPorCurso, setMatriculasPorCurso] = useState<any[]>([]);
  const [matriculaModal, setMatriculaModal] = useState<{ visible: boolean, cursoId?: string }>({ visible: false });
  const [estudianteId, setEstudianteId] = useState("");
  const [registrandoPagoId, setRegistrandoPagoId] = useState<string | null>(null);

  // Simulación: lista de estudiantes (reemplazar por fetch real si es necesario)
  const [estudiantes, setEstudiantes] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [cursosRes, pagosRes, estudiantesRes, matriculasRes] = await Promise.all([
        getCursosDisponibles(),
        getPagosPendientes(),
        // Obtener estudiantes activos
        import("@utils/supabase/client").then(({ supabaseBrowserClient }) =>
          supabaseBrowserClient.from("perfiles").select("id, nombre_completo").eq("rol", "estudiante")
        ),
        // Obtener conteo de matrículas por curso
        import("@utils/supabase/client").then(({ supabaseBrowserClient }) =>
          supabaseBrowserClient.from("matriculas").select("curso_id, count:id")
        ),
      ]);
      if (cursosRes.error) message.error("Error cargando cursos");
      if (pagosRes.error) message.error("Error cargando pagos");
      setCursos(cursosRes.data || []);
      setPagosPendientes(pagosRes.data || []);
      setEstudiantes(estudiantesRes.data || []);
      // Preparar datos para la gráfica
      const cursosMap = (cursosRes.data || []).reduce((acc: any, c: any) => { acc[c.id] = c.nombre; return acc; }, {});
      setMatriculasPorCurso((matriculasRes.data || []).map((m: any) => ({
        curso: cursosMap[m.curso_id] || m.curso_id,
        matriculas: m.count
      })));
      setLoading(false);
    }
    fetchData();
  }, []);

  // Crear matrícula
  const handleCrearMatricula = async () => {
    if (!matriculaModal.cursoId || !estudianteId) {
      message.error("Selecciona estudiante y curso");
      return;
    }
    const { error } = await crearMatricula({ cursoId: matriculaModal.cursoId, estudianteId });
    if (error) {
      message.error("Error creando matrícula");
    } else {
      message.success("Matrícula creada exitosamente");
      setMatriculaModal({ visible: false });
      setEstudianteId("");
      // Refrescar datos
      setLoading(true);
      const cursosRes = await getCursosDisponibles();
      setCursos(cursosRes.data || []);
      setLoading(false);
    }
  };

  // Registrar pago
  const handleRegistrarPago = async (pagoId: string) => {
    setRegistrandoPagoId(pagoId);
    const { error } = await registrarPago({ pagoId });
    if (error) {
      message.error("Error registrando pago");
    } else {
      message.success("Pago registrado exitosamente");
      // Refrescar datos
      setLoading(true);
      const pagosRes = await getPagosPendientes();
      setPagosPendientes(pagosRes.data || []);
      setLoading(false);
    }
    setRegistrandoPagoId(null);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Panel de Secretaría</h2>
      {loading ? (
        <Spin size="large" />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={16}>
              <Card title="Matrículas por Curso">
                <Column
                  data={matriculasPorCurso}
                  xField="curso"
                  yField="matriculas"
                  color="#1890ff"
                  height={260}
                  label={{ position: 'top', style: { fill: '#000', opacity: 0.7 } }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card title="Accesos Rápidos">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button type="primary" icon={<UserAddOutlined />} size="large" onClick={() => setMatriculaModal({ visible: true })}>
                    Nueva Matrícula
                  </Button>
                  <Button icon={<FileTextOutlined />} size="large" onClick={() => window.open('/tesoreria', '_blank')}>
                    Ver Pagos
                  </Button>
                </Space>
              </Card>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Card title="Cursos Disponibles">
                <List
                  dataSource={cursos}
                  renderItem={curso => (
                    <List.Item>
                      <strong>{curso.nombre}</strong> - Cupos: {curso.cupos} - Inicio: {curso.fecha_inicio}
                      <Button type="link" style={{ marginLeft: 8 }}>Dar información</Button>
                      <Button type="primary" style={{ marginLeft: 8 }} onClick={() => setMatriculaModal({ visible: true, cursoId: curso.id })}>
                        Crear matrícula
                      </Button>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Pagos Pendientes">
                <List
                  dataSource={pagosPendientes}
                  renderItem={pago => (
                    <List.Item>
                      <strong>{pago.perfiles?.nombre_completo || ""}</strong> - ${pago.monto} - Vence: {pago.fecha_vencimiento}
                      <Button type="primary" style={{ marginLeft: 8 }} loading={registrandoPagoId === pago.id} onClick={() => handleRegistrarPago(pago.id)}>
                        Registrar pago
                      </Button>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
      {/* Modal para crear matrícula */}
      <Modal
        title="Crear Matrícula"
        open={matriculaModal.visible}
        onCancel={() => setMatriculaModal({ visible: false })}
        onOk={handleCrearMatricula}
      >
        <Select
          style={{ width: "100%", marginBottom: 16 }}
          placeholder="Selecciona estudiante"
          value={estudianteId}
          onChange={setEstudianteId}
        >
          {estudiantes.map((est: any) => (
            <Select.Option key={est.id} value={est.id}>{est.nombre_completo}</Select.Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
}
