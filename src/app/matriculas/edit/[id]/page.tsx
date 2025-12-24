"use client";

import React, { useEffect, useState } from "react";
import { Edit } from "@refinedev/antd";
import { Form, Select, DatePicker, message, Row, Col, Spin, Tag } from "antd";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useParams } from "next/navigation";
import dayjs from "dayjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditMatricula() {
  const [form] = Form.useForm();
  const router = useRouter();
  const params = useParams();
  const idMatricula = params?.id as string;
  
  const [loading, setLoading] = useState(true);
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);

  useEffect(() => {
    cargarDatos();
  }, [idMatricula]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
        // 1. Cargar Listas (Estudiantes y Cursos)
        const { data: dataEst } = await supabase
            .from("perfiles")
            .select("id, nombre_completo, documento")
            .eq("rol", "estudiante") // Filtro de seguridad
            .order("nombre_completo");
        setEstudiantes(dataEst || []);

        const { data: dataCursos } = await supabase
            .from("cursos")
            .select("id, nombre, horario")
            .order("nombre");
        setCursos(dataCursos || []);

        // 2. Cargar la Matrícula Actual
        if (idMatricula) {
            const { data: matricula, error } = await supabase
                .from("matriculas")
                .select("*")
                .eq("id", idMatricula)
                .single();

            if (error) throw error;

            // Rellenar formulario
            form.setFieldsValue({
                ...matricula,
                fecha_inicio: matricula.fecha_inicio ? dayjs(matricula.fecha_inicio) : null,
                fecha_fin: matricula.fecha_fin ? dayjs(matricula.fecha_fin) : null,
            });
        }
    } catch (error: any) {
        message.error("Error cargando datos: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const onFinish = async (values: any) => {
    try {
      const { error } = await supabase
        .from("matriculas")
        .update({
            curso_id: values.curso_id,
            fecha_inicio: values.fecha_inicio ? values.fecha_inicio.format("YYYY-MM-DD") : null,
            fecha_fin: values.fecha_fin ? values.fecha_fin.format("YYYY-MM-DD") : null,
            estado: values.estado, // Importante para suspender o graduar
            // Nota: No actualizamos estudiante_id por seguridad
        })
        .eq("id", idMatricula);

      if (error) throw error;

      message.success("Matrícula actualizada correctamente");
      router.push("/matriculas");
    } catch (error: any) {
      message.error("Error al actualizar: " + error.message);
    }
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;

  return (
    <Edit title="Editar Matrícula" saveButtonProps={{ onClick: form.submit }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Estudiante" name="estudiante_id">
                    <Select 
                        disabled // Bloqueado para evitar errores de cambio de identidad
                        placeholder="Estudiante..."
                        options={estudiantes.map(e => ({ 
                            label: `${e.nombre_completo} - CC: ${e.documento || 'S/N'}`, 
                            value: e.id 
                        }))}
                    />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Curso / Cohorte" name="curso_id" rules={[{ required: true }]}>
                    <Select 
                        placeholder="Selecciona el curso..."
                        options={cursos.map(c => ({ 
                            label: `${c.nombre} (${c.horario || 'Sin horario'})`, 
                            value: c.id 
                        }))}
                    />
                </Form.Item>
            </Col>
        </Row>
        
        <Row gutter={24}>
             <Col span={8}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio" rules={[{ required: true }]}>
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
             </Col>
             <Col span={8}>
                <Form.Item label="Fecha Finalización" name="fecha_fin" tooltip="Llenar solo cuando se gradúe">
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" placeholder="Opcional" />
                </Form.Item>
             </Col>
             <Col span={8}>
                <Form.Item label="Estado Actual" name="estado" rules={[{ required: true }]}>
                    <Select options={[
                        { label: <Tag color="green">ACTIVO (Cursando)</Tag>, value: 'activo' },
                        { label: <Tag color="orange">SUSPENDIDO</Tag>, value: 'suspendido' },
                        { label: <Tag color="blue">GRADUADO</Tag>, value: 'graduado' },
                        { label: <Tag color="red">RETIRADO</Tag>, value: 'retirado' }
                    ]} />
                </Form.Item>
             </Col>
        </Row>
      </Form>
    </Edit>
  );
}