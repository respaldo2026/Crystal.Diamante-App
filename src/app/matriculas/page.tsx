"use client";

import React, { useState, useEffect } from "react";
import { List, CreateButton, EditButton, DeleteButton, useDrawerForm } from "@refinedev/antd";
import { 
  Table, Space, Form, Select, DatePicker, 
  Drawer, Button, Input, Card, Row, Col, Statistic, Divider, Tag, Typography 
} from "antd";
import { 
  DollarCircleOutlined, CalendarOutlined, ClockCircleOutlined, UserAddOutlined 
} from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

const { Text, Title } = Typography;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function MatriculasPage() {
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estado para el Drawer (Formulario lateral)
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  
  // Estado para guardar el curso seleccionado y mostrar sus detalles
  const [cursoSeleccionado, setCursoSeleccionado] = useState<any>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    // 1. Cargar Matriculas con relaciones
    const { data: dataMat } = await supabase
      .from("matriculas")
      .select(`
        id, fecha_inicio, estado,
        perfiles(nombre_completo),
        cursos(nombre, precio_mensualidad, precio_inscripcion, duracion, fecha_inicio)
      `)
      .order("id", { ascending: false });

    setMatriculas(dataMat || []);

    // 2. Cargar Estudiantes (Solo perfiles con rol estudiante)
    // Ajusta el filtro 'rol' según como lo tengas en tu BD
    const { data: dataEst } = await supabase.from("perfiles").select("id, nombre_completo"); 
    setEstudiantes(dataEst || []);

    // 3. Cargar Cursos activos
    const { data: dataCur } = await supabase
      .from("cursos")
      .select("*")
      .eq("estado", "activo");
    setCursos(dataCur || []);

    setLoading(false);
  };

  // Manejar cambio en el Select de Curso
  const handleCursoChange = (cursoId: any) => {
    const curso = cursos.find((c) => c.id === cursoId);
    setCursoSeleccionado(curso);
    
    // Opcional: Si quieres que la fecha de inicio de la matrícula 
    // sea por defecto la fecha de inicio del curso:
    if (curso?.fecha_inicio) {
        form.setFieldValue("fecha_inicio", dayjs(curso.fecha_inicio));
    }
  };

  const guardarMatricula = async () => {
    try {
        const values = await form.validateFields();
        
        const { error } = await supabase.from("matriculas").insert({
            estudiante_id: values.estudiante_id,
            curso_id: values.curso_id,
            fecha_inicio: values.fecha_inicio.format("YYYY-MM-DD"), // Fecha real de inscripción
            estado: 'activo'
        });

        if (error) throw error;

        setOpen(false);
        form.resetFields();
        setCursoSeleccionado(null);
        cargarDatos(); // Recargar tabla
    } catch (error) {
        console.error(error);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={3}>Gestión de Matrículas</Title>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setOpen(true)}>
            Nueva Matrícula
        </Button>
      </div>

      <Table 
        dataSource={matriculas} 
        rowKey="id" 
        loading={loading}
        columns={[
            {
                title: 'Estudiante',
                dataIndex: ['perfiles', 'nombre_completo'],
            },
            {
                title: 'Curso',
                dataIndex: ['cursos', 'nombre'],
            },
            {
                title: 'Inicio Curso',
                render: (_, record) => record.cursos?.fecha_inicio 
                    ? dayjs(record.cursos.fecha_inicio).format("DD/MM/YYYY") 
                    : 'N/A'
            },
            {
                title: 'Costos',
                render: (_, record) => (
                    <Space direction="vertical" size={0}>
                        <Text type="secondary" style={{fontSize: 12}}>Inscripción: ${record.cursos?.precio_inscripcion}</Text>
                        <Text strong style={{fontSize: 12}}>Mensual: ${record.cursos?.precio_mensualidad}</Text>
                    </Space>
                )
            },
            {
                title: 'Estado',
                dataIndex: 'estado',
                render: (estado) => <Tag color={estado === 'activo' ? 'green' : 'red'}>{estado.toUpperCase()}</Tag>
            },
            {
                title: 'Acciones',
                render: (_, record) => (
                    <Button danger size="small" onClick={async () => {
                        await supabase.from("matriculas").delete().eq("id", record.id);
                        cargarDatos();
                    }}>Eliminar</Button>
                )
            }
        ]}
      />

      {/* DRAWER PARA NUEVA MATRÍCULA */}
      <Drawer
        title="Nueva Inscripción"
        width={500}
        onClose={() => setOpen(false)}
        open={open}
        extra={
          <Button type="primary" onClick={guardarMatricula}>
            Confirmar Matrícula
          </Button>
        }
      >
        <Form form={form} layout="vertical">
            
            <Form.Item name="estudiante_id" label="Estudiante" rules={[{ required: true }]}>
                <Select 
                    showSearch
                    placeholder="Buscar estudiante..."
                    optionFilterProp="children"
                    options={estudiantes.map(e => ({ label: e.nombre_completo, value: e.id }))}
                />
            </Form.Item>

            <Form.Item name="curso_id" label="Curso a Inscribir" rules={[{ required: true }]}>
                <Select 
                    placeholder="Selecciona un curso..."
                    onChange={handleCursoChange}
                    options={cursos.map(c => ({ label: c.nombre, value: c.id }))}
                />
            </Form.Item>

            {/* SECCIÓN DE INFORMACIÓN AUTOMÁTICA DEL CURSO */}
            {cursoSeleccionado && (
                <Card 
                    size="small" 
                    style={{ background: '#f6ffed', borderColor: '#b7eb8f', marginBottom: 24 }}
                    title={<span><DollarCircleOutlined /> Detalles Financieros del Curso</span>}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Statistic 
                                title="Valor Inscripción" 
                                value={cursoSeleccionado.precio_inscripcion} 
                                prefix="$"
                                valueStyle={{ fontSize: 18, color: '#135200' }} 
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic 
                                title="Mensualidad / Clase" 
                                value={cursoSeleccionado.precio_mensualidad} 
                                prefix="$" 
                                valueStyle={{ fontSize: 18, color: '#135200' }}
                            />
                        </Col>
                    </Row>
                    <Divider style={{ margin: '12px 0' }} />
                    <Row gutter={16}>
                        <Col span={12}>
                             <Text type="secondary"><CalendarOutlined /> Inicia:</Text><br/>
                             <Text strong>
                                {cursoSeleccionado.fecha_inicio 
                                    ? dayjs(cursoSeleccionado.fecha_inicio).format("DD MMMM YYYY") 
                                    : "Fecha flexible"}
                             </Text>
                        </Col>
                        <Col span={12}>
                             <Text type="secondary"><ClockCircleOutlined /> Duración:</Text><br/>
                             <Text strong>{cursoSeleccionado.duracion || "No especificada"}</Text>
                        </Col>
                    </Row>
                </Card>
            )}

            <Form.Item 
                name="fecha_inicio" 
                label="Fecha de registro en sistema" 
                rules={[{ required: true }]}
                initialValue={dayjs()}
                help="Esta fecha es cuando el alumno se matricula administrativamente."
            >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>

        </Form>
      </Drawer>
    </div>
  );
}