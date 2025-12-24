"use client";

import React, { useEffect, useState } from "react";
import { Create } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, InputNumber, Row, Col, message } from "antd";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
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
    // Ajusta el filtro 'rol' según tu base de datos (ej: 'profesor' o 'docente')
    // Si no usas roles en la tabla perfiles, quita el .eq('rol', 'profesor')
    const { data } = await supabase
      .from("perfiles")
      .select("id, nombre_completo")
      // .eq("rol", "profesor") 
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
        // CAMPOS NUEVOS
        precio_inscripcion: values.precio_inscripcion,
        precio_mensualidad: values.precio_mensualidad,
        duracion: values.duracion,
        fecha_inicio: values.fecha_inicio ? values.fecha_inicio.format("YYYY-MM-DD") : null,
      });

      if (error) throw error;

      message.success("Curso creado correctamente");
      router.push("/cursos"); // Redirige a la lista de cursos
    } catch (error: any) {
      message.error("Error al crear curso: " + error.message);
    }
  };

  return (
    <Create title="Abrir Nuevo Curso" saveButtonProps={{ onClick: form.submit }}>
      <Form 
        form={form} 
        layout="vertical" 
        onFinish={onFinish}
        initialValues={{ estado: 'activo', precio_inscripcion: 0, precio_mensualidad: 0 }}
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
    </Create>
  );
}