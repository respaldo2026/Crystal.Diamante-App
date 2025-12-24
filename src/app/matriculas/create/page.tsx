"use client";

import React, { useState, useEffect } from "react";
import { Create } from "@refinedev/antd";
import { Form, Select, DatePicker, message, Row, Col, Card, Alert } from "antd";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateMatricula() {
  const [form] = Form.useForm();
  const router = useRouter();
  
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    // 1. Cargar SOLO ESTUDIANTES
    const { data: dataEst } = await supabase
      .from("perfiles")
      .select("id, nombre_completo, documento")
      .eq("rol", "estudiante") // <--- FILTRO: SOLO ESTUDIANTES
      .order("nombre_completo");
    setEstudiantes(dataEst || []);

    // 2. Cargar CURSOS ACTIVOS
    const { data: dataCursos } = await supabase
      .from("cursos")
      .select("id, nombre, horario")
      .eq("estado", "activo")
      .order("nombre");
    setCursos(dataCursos || []);
  };

  const onFinish = async (values: any) => {
    try {
      // Verificar si ya está matriculado en ese curso
      const { data: existe } = await supabase
        .from("matriculas")
        .select("id")
        .eq("estudiante_id", values.estudiante_id)
        .eq("curso_id", values.curso_id)
        .eq("estado", "activo")
        .single();

      if (existe) {
          message.error("⚠️ Este estudiante ya está matriculado en este curso.");
          return;
      }

      const { error } = await supabase.from("matriculas").insert({
        estudiante_id: values.estudiante_id,
        curso_id: values.curso_id,
        fecha_inicio: values.fecha_inicio.format("YYYY-MM-DD"),
        estado: "activo"
      });

      if (error) throw error;

      message.success("Matrícula creada exitosamente");
      router.push("/matriculas");
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  return (
    <Create title="Nueva Matrícula" saveButtonProps={{ onClick: form.submit }}>
      <Alert 
        message="Asegúrate de que el estudiante ya esté registrado en el sistema antes de matricularlo." 
        type="info" 
        showIcon 
        style={{marginBottom: 20}}
      />
      
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ fecha_inicio: dayjs() }}>
        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Estudiante" name="estudiante_id" rules={[{ required: true }]}>
                    <Select 
                        placeholder="Buscar estudiante..."
                        showSearch
                        optionFilterProp="label"
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
             <Col span={12}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio" rules={[{ required: true }]}>
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
             </Col>
        </Row>
      </Form>
    </Create>
  );
}