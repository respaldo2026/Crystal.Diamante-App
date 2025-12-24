"use client";

import React, { useState, useEffect } from "react";
import { 
  Table, Card, Button, Modal, Form, Select, 
  InputNumber, DatePicker, Input, Row, Col, Statistic, Tag, message, Typography, Divider 
} from "antd";
import { 
  DollarCircleOutlined, PlusOutlined, BankOutlined, RiseOutlined 
} from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

const { Title, Text } = Typography;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TesoreriaPage() {
  const [pagos, setPagos] = useState<any[]>([]);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estadísticas
  const [totalMes, setTotalMes] = useState(0);
  const [totalHoy, setTotalHoy] = useState(0);

  // Modal y Formulario
  const [modalVisible, setModalVisible] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form] = Form.useForm();
  
  // Info del curso actual del estudiante seleccionado
  const [cursoInfo, setCursoInfo] = useState<any>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
        // 1. Cargar Pagos con info del estudiante y curso
        const { data: dataPagos, error } = await supabase
            .from("pagos")
            .select(`
                id, fecha_pago, monto, periodo_pagado,
                matriculas (
                    perfiles (nombre_completo),
                    cursos (nombre)
                )
            `)
            .order("fecha_pago", { ascending: false });
        
        if (error) throw error;
        setPagos(dataPagos || []);

        // Calcular Estadísticas
        const hoy = dayjs().format("YYYY-MM-DD");
        const esteMes = dayjs().format("YYYY-MM");
        
        let sumaMes = 0;
        let sumaHoy = 0;

        dataPagos?.forEach((p: any) => {
            if (p.fecha_pago === hoy) sumaHoy += Number(p.monto);
            if (p.fecha_pago.startsWith(esteMes)) sumaMes += Number(p.monto);
        });

        setTotalMes(sumaMes);
        setTotalHoy(sumaHoy);

        // 2. Cargar estudiantes con Matricula ACTIVA para el select
        const { data: dataEst } = await supabase
            .from("matriculas")
            .select(`
                id, 
                perfiles (id, nombre_completo),
                cursos (nombre, precio_mensualidad)
            `)
            .eq("estado", "activo");
            
        setEstudiantes(dataEst || []);

    } catch (error: any) {
        message.error("Error cargando tesorería: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  // Cuando seleccionas un estudiante en el modal
  const handleEstudianteChange = (matriculaId: any) => {
      const matricula = estudiantes.find(m => m.id === matriculaId);
      if (matricula) {
          setCursoInfo(matricula.cursos);
          // Auto-rellenar el monto con la mensualidad del curso
          form.setFieldsValue({
              monto: matricula.cursos.precio_mensualidad,
              concepto: `Mensualidad ${dayjs().format("MMMM")}`
          });
      }
  };

  const guardarPago = async () => {
      try {
          const values = await form.validateFields();
          setGuardando(true);

          const { error } = await supabase.from("pagos").insert({
              matricula_id: values.matricula_id,
              fecha_pago: values.fecha_pago.format("YYYY-MM-DD"),
              monto: values.monto,
              periodo_pagado: values.concepto
          });

          if (error) throw error;

          message.success("Pago registrado correctamente");
          setModalVisible(false);
          form.resetFields();
          setCursoInfo(null);
          cargarDatos(); // Recargar tabla

      } catch (error: any) {
          message.error("Error al guardar: " + error.message);
      } finally {
          setGuardando(false);
      }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={3}><BankOutlined /> Tesorería y Caja</Title>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            Registrar Ingreso
        </Button>
      </div>

      {/* TARJETAS DE ESTADÍSTICAS */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={8}>
            <Card>
                <Statistic 
                    title="Ingresos Hoy" 
                    value={totalHoy} 
                    prefix="$" 
                    valueStyle={{ color: '#3f8600' }}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card>
                <Statistic 
                    title="Total Mes Actual" 
                    value={totalMes} 
                    prefix={<RiseOutlined />}
                    prefixCls="$"
                    formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                />
            </Card>
          </Col>
      </Row>

      {/* TABLA DE PAGOS */}
      <Card title="Historial de Transacciones">
          <Table 
            dataSource={pagos} 
            rowKey="id" 
            loading={loading}
            columns={[
                {
                    title: 'Fecha',
                    dataIndex: 'fecha_pago',
                    render: (val) => dayjs(val).format("DD/MM/YYYY"),
                    sorter: (a, b) => dayjs(a.fecha_pago).unix() - dayjs(b.fecha_pago).unix(),
                },
                {
                    title: 'Estudiante',
                    render: (_, record) => (
                        <div style={{display:'flex', flexDirection:'column'}}>
                            <Text strong>{record.matriculas?.perfiles?.nombre_completo}</Text>
                            <Text type="secondary" style={{fontSize:11}}>{record.matriculas?.cursos?.nombre}</Text>
                        </div>
                    )
                },
                {
                    title: 'Concepto / Periodo',
                    dataIndex: 'periodo_pagado',
                    render: (text) => <Tag color="blue">{text || 'Pago General'}</Tag>
                },
                {
                    title: 'Monto',
                    dataIndex: 'monto',
                    align: 'right',
                    render: (val) => <Text strong>${Number(val).toLocaleString()}</Text>
                }
            ]}
          />
      </Card>

      {/* MODAL REGISTRAR PAGO */}
      <Modal
        title="Registrar Nuevo Pago"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={guardarPago}
        confirmLoading={guardando}
      >
          <Form form={form} layout="vertical">
              <Form.Item name="matricula_id" label="Estudiante (Matrícula Activa)" rules={[{ required: true }]}>
                  <Select 
                    showSearch
                    placeholder="Buscar estudiante..."
                    optionFilterProp="children"
                    onChange={handleEstudianteChange}
                  >
                      {estudiantes.map(e => (
                          <Select.Option key={e.id} value={e.id}>
                              {e.perfiles.nombre_completo} - {e.cursos.nombre}
                          </Select.Option>
                      ))}
                  </Select>
              </Form.Item>

              {cursoInfo && (
                  <div style={{ background: '#f6ffed', padding: 10, borderRadius: 6, marginBottom: 15, border: '1px solid #b7eb8f' }}>
                      <Text type="secondary">Curso:</Text> <Text strong>{cursoInfo.nombre}</Text><br/>
                      <Text type="secondary">Valor Mensualidad:</Text> <Text strong style={{color: 'green'}}>${cursoInfo.precio_mensualidad}</Text>
                  </div>
              )}

              <Row gutter={16}>
                  <Col span={12}>
                      <Form.Item name="fecha_pago" label="Fecha Pago" initialValue={dayjs()} rules={[{ required: true }]}>
                          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                      </Form.Item>
                  </Col>
                  <Col span={12}>
                      <Form.Item name="monto" label="Monto Recibido" rules={[{ required: true }]}>
                          <InputNumber 
                            style={{ width: '100%' }} 
                            formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                          />
                      </Form.Item>
                  </Col>
              </Row>

              <Form.Item name="concepto" label="Concepto o Mes Pagado" rules={[{ required: true }]}>
                  <Input placeholder="Ej: Mensualidad Enero, Inscripción, Kit de uñas..." />
              </Form.Item>
          </Form>
      </Modal>
    </div>
  );
}