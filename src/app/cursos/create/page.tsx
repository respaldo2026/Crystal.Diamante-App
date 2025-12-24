"use client";

import React, { useState, useEffect } from "react";
import { Create } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, InputNumber, Row, Col, message } from "antd";
import { 
  ClockCircleOutlined 
} from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateCourse() {
  const [form] = Form.useForm();
  const router = useRouter();
  const [profesores, setProfesores] = useState<any[]>([]);

  useEffect(() => {
    cargarProfesores();
  }, []);

  const cargarProfesores = async () => {
    const { data } = await supabase
      .from("perfiles")
      .select("id, nombre_completo")
      .eq("rol", "profesor") // <--- FILTRO AGREGADO: SOLO PROFESORES
      .order("nombre_completo");
    setProfesores(data || []);
  };

  const onFinish = async (values: any) => {
    try {
      const { error } = await supabase.from("cursos").insert({
        nombre: values.nombre,
        descripcion: values.descripcion,
        estado: values.estado,
        profesor_id: values.profesor_id,
        precio_inscripcion: values.precio_inscripcion,
        precio_mensualidad: values.precio_mensualidad,
        duracion: values.duracion,
        horario: values.horario, 
        fecha_inicio: values.fecha_inicio ? values.fecha_inicio.format("YYYY-MM-DD") : null,
        fecha_fin: values.fecha_fin ? values.fecha_fin.format("YYYY-MM-DD") : null,
      });

      if (error) throw error;
      message.success("Curso creado exitosamente");
      router.push("/cursos");
    } catch (error: any) {
      message.error("Error al crear: " + error.message);
    }
  };

  return (
    <Create title="Crear Nueva Cohorte / Curso" saveButtonProps={{ onClick: form.submit }}>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ estado: 'activo' }}>
        
        <Row gutter={24}>
          <Col span={16}>
            <Form.Item label="Nombre del Curso" name="nombre" rules={[{ required: true }]}>
              <Input placeholder="Ej: Manicure Ruso - Sábados" size="large" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Estado" name="estado">
              <Select options={[{ label: '🟢 Activo', value: 'activo' }, { label: '🔴 Inactivo', value: 'inactivo' }]} />
            </Form.Item>
          </Col>
        </Row>

        <h3 style={{ marginTop: 10, color: '#722ed1', fontSize: 16 }}>🗓️ Horarios y Fechas</h3>
        <Row gutter={24}>
            <Col span={8}>
                <Form.Item label="Horario de Clases" name="horario" rules={[{ required: true }]}>
                    <Input prefix={<ClockCircleOutlined />} placeholder="Ej: Sábados 8am - 12pm" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Fecha Fin (Estimada)" name="fecha_fin">
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
        </Row>

        <h3 style={{ marginTop: 10, color: '#722ed1', fontSize: 16 }}>🎓 Detalles Académicos</h3>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Docente Encargado" name="profesor_id" rules={[{ required: true }]}>
                    <Select 
                        placeholder="Solo aparecen profesores..."
                        options={profesores.map(p => ({ label: p.nombre_completo, value: p.id }))}
                        showSearch
                        optionFilterProp="label"
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Duración (Texto)" name="duracion">
                    <Input placeholder="Ej: 3 Meses" prefix={<ClockCircleOutlined />} />
                </Form.Item>
            </Col>
        </Row>

        <h3 style={{ marginTop: 10, color: '#722ed1', fontSize: 16 }}>💰 Precios</h3>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Valor Inscripción" name="precio_inscripcion" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} prefix="$" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Valor Mensualidad" name="precio_mensualidad" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} prefix="$" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Descripción Corta" name="descripcion">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Create>
  );
}