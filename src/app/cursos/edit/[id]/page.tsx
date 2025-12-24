"use client";

import React, { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, InputNumber, Row, Col, message, Spin } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import { useRouter, useParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditCourse() {
  const [form] = Form.useForm();
  const router = useRouter();
  const params = useParams();
  const idCurso = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [profesores, setProfesores] = useState<any[]>([]);

  useEffect(() => {
    cargarDatos();
  }, [idCurso]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
        // A) Cargar lista SOLO PROFESORES
        const { data: dataProfs } = await supabase
            .from("perfiles")
            .select("id, nombre_completo")
            .eq("rol", "profesor") // <--- FILTRO AGREGADO
            .order("nombre_completo");
        setProfesores(dataProfs || []);

        // B) Cargar datos del curso
        if (idCurso) {
            const { data: curso, error } = await supabase
                .from("cursos")
                .select("*")
                .eq("id", idCurso)
                .single();

            if (error) throw error;

            form.setFieldsValue({
                ...curso,
                fecha_inicio: curso.fecha_inicio ? dayjs(curso.fecha_inicio) : null,
                fecha_fin: curso.fecha_fin ? dayjs(curso.fecha_fin) : null,
            });
        }
    } catch (error: any) {
        message.error("Error: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const onFinish = async (values: any) => {
    try {
      const { error } = await supabase
        .from("cursos")
        .update({
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
        })
        .eq("id", idCurso);

      if (error) throw error;

      message.success("Curso actualizado");
      router.push("/cursos");
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;

  return (
    <Edit title="Editar Cohorte / Curso" saveButtonProps={{ onClick: form.submit }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={24}>
          <Col span={16}>
            <Form.Item label="Nombre del Curso" name="nombre" rules={[{ required: true }]}>
              <Input size="large" />
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
                <Form.Item label="Horario" name="horario" rules={[{ required: true }]}>
                    <Input prefix={<ClockCircleOutlined />} />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Fecha Inicio" name="fecha_inicio" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Fecha Fin" name="fecha_fin">
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
        </Row>

        <h3 style={{ marginTop: 10, color: '#722ed1', fontSize: 16 }}>🎓 Detalles Académicos</h3>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Docente" name="profesor_id" rules={[{ required: true }]}>
                    <Select 
                        placeholder="Solo aparecen profesores..."
                        options={profesores.map(p => ({ label: p.nombre_completo, value: p.id }))}
                        showSearch
                        optionFilterProp="label"
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Duración" name="duracion">
                    <Input prefix={<ClockCircleOutlined />} />
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

        <Form.Item label="Descripción" name="descripcion">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Edit>
  );
}