"use client";

import React, { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, InputNumber, Row, Col, message, Spin } from "antd";
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

  // 1. Cargar Profesores y Datos del Curso al iniciar
  useEffect(() => {
    cargarDatos();
  }, [idCurso]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
        // A) Cargar lista de profesores
        const { data: dataProfs } = await supabase
            .from("perfiles")
            .select("id, nombre_completo")
            .order("nombre_completo");
        setProfesores(dataProfs || []);

        // B) Cargar datos del curso actual
        if (idCurso) {
            const { data: curso, error } = await supabase
                .from("cursos")
                .select("*")
                .eq("id", idCurso)
                .single();

            if (error) throw error;

            // Rellenar el formulario
            form.setFieldsValue({
                ...curso,
                // Convertir fecha de string (BD) a objeto Dayjs (Ant Design)
                fecha_inicio: curso.fecha_inicio ? dayjs(curso.fecha_inicio) : null,
            });
        }
    } catch (error: any) {
        message.error("Error cargando curso: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  // 2. Guardar Cambios
  const onFinish = async (values: any) => {
    try {
      const { error } = await supabase
        .from("cursos")
        .update({
            nombre: values.nombre,
            descripcion: values.descripcion,
            estado: values.estado,
            profesor_id: values.profesor_id,
            // CAMPOS FINANCIEROS Y ACADÉMICOS
            precio_inscripcion: values.precio_inscripcion,
            precio_mensualidad: values.precio_mensualidad,
            duracion: values.duracion,
            fecha_inicio: values.fecha_inicio ? values.fecha_inicio.format("YYYY-MM-DD") : null,
        })
        .eq("id", idCurso); // Importante: Filtrar por ID

      if (error) throw error;

      message.success("Curso actualizado correctamente");
      router.push("/cursos"); // Volver a la lista
    } catch (error: any) {
      message.error("Error al actualizar: " + error.message);
    }
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;

  return (
    <Edit title="Editar Curso" saveButtonProps={{ onClick: form.submit }}>
      <Form 
        form={form} 
        layout="vertical" 
        onFinish={onFinish}
      >
        <Row gutter={24}>
          <Col span={16}>
            <Form.Item 
                label="Nombre del Curso" 
                name="nombre" 
                rules={[{ required: true, message: 'El nombre es obligatorio' }]}
            >
              <Input placeholder="Ej: Manicure Ruso Avanzado" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Estado" name="estado">
              <Select options={[
                { label: '🟢 Activo', value: 'activo' },
                { label: '🔴 Inactivo', value: 'inactivo' }
              ]} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Descripción Corta" name="descripcion">
          <Input.TextArea rows={3} placeholder="¿De qué trata este curso?" />
        </Form.Item>

        <h3 style={{ marginTop: 20, color: '#722ed1' }}>Detalles Académicos y Financieros</h3>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Docente Encargado" name="profesor_id" rules={[{ required: true }]}>
                    <Select 
                        placeholder="Selecciona un profesor..."
                        options={profesores.map(p => ({ label: p.nombre_completo, value: p.id }))}
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Duración (Texto)" name="duracion">
                    <Input placeholder="Ej: 3 Meses / 40 Horas" />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col span={8}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item 
                    label="Valor Inscripción" 
                    name="precio_inscripcion" 
                    rules={[{ required: true }]}
                    tooltip="Pago único al iniciar"
                >
                    <InputNumber 
                        style={{ width: '100%' }} 
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                    />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item 
                    label="Valor Mensualidad" 
                    name="precio_mensualidad" 
                    rules={[{ required: true }]}
                    tooltip="Pago periódico o por clase"
                >
                    <InputNumber 
                        style={{ width: '100%' }} 
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                    />
                </Form.Item>
            </Col>
        </Row>

      </Form>
    </Edit>
  );
}