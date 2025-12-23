"use client";

import React from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useNavigation } from "@refinedev/core";
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, Divider, message } from "antd";
import dayjs from "dayjs";

export default function CreateCurso() {
  const { list } = useNavigation();

  // 1. Extraemos 'onFinish' original para llamarlo manualmente después de limpiar los datos
  const { formProps, saveButtonProps, onFinish } = useForm({
    resource: "cursos",
    redirect: false, // No redirigir automáticamente para controlar el éxito
    onMutationSuccess: () => {
        message.success("✅ Curso creado exitosamente");
        list("cursos");
    },
    onMutationError: (error) => {
        console.error("Error al guardar:", error);
        message.error("Error guardando el curso: " + (error?.message || "Revisa la consola"));
    }
  });

  // 2. FUNCIÓN DE LIMPIEZA (El secreto para que no falle)
  const handleOnFinish = async (values: any) => {
    try {
        // A) Formatear Fechas: De objeto DayJS a Texto 'YYYY-MM-DD'
        const fechaInicioLimpia = values.fecha_inicio ? dayjs(values.fecha_inicio).format("YYYY-MM-DD") : null;
        const fechaFinLimpia = values.fecha_fin ? dayjs(values.fecha_fin).format("YYYY-MM-DD") : null;

        // B) Asegurar que el precio sea número
        const precioLimpio = values.precio ? Number(values.precio) : 0;

        // C) Crear el objeto limpio que sí le gusta a Supabase
        const datosLimpios = {
            ...values,
            fecha_inicio: fechaInicioLimpia,
            fecha_fin: fechaFinLimpia,
            precio: precioLimpio,
            // Aseguramos valores por defecto si vienen vacíos
            estado: values.estado || 'activo', 
            profesor_id: values.profesor_id // UUID
        };

        // D) Enviamos los datos ya curados
        await onFinish(datosLimpios);

    } catch (e) {
        console.error("Error interno del formulario:", e);
    }
  };

  // 3. CARGAR PROFESORES
  const { selectProps: teacherSelect } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
    filters: [{ field: "rol", operator: "eq", value: "profesor" }],
  });

  return (
    <Create saveButtonProps={{...saveButtonProps, onClick: () => formProps.form?.submit()}} title="Abrir Nuevo Curso">
      {/* IMPORTANTE: Sobrescribimos onFinish con nuestra función 'handleOnFinish'
          para limpiar los datos antes de que salgan.
      */}
      <Form {...formProps} onFinish={handleOnFinish} layout="vertical">
        
        <Row gutter={24}>
            <Col span={16}>
                <Form.Item label="Nombre del Curso" name="nombre" rules={[{ required: true, message: 'El nombre es obligatorio' }]}>
                    <Input placeholder="Ej: Inglés Básico A1" />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Estado" name="estado" initialValue="activo">
                    <Select options={[
                        { value: 'activo', label: '🟢 Activo' },
                        { value: 'inscripciones', label: '🟡 Inscripciones' },
                        { value: 'cerrado', label: '🔴 Cerrado' },
                    ]}/>
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Descripción Corta" name="descripcion">
            <Input.TextArea rows={2} placeholder="¿De qué trata este curso?" />
        </Form.Item>

        <Divider orientation="left" style={{color:'#722ed1'}}>Detalles Académicos</Divider>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Docente Encargado" name="profesor_id" rules={[{ required: true, message: 'Selecciona un profesor' }]}>
                    <Select {...teacherSelect} placeholder="Selecciona un profesor..." allowClear />
                </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
                <Form.Item label="Precio del Curso" name="precio" initialValue={0}>
                    <InputNumber 
                        style={{ width: '100%' }} 
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                    />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col span={12}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio">
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" placeholder="Selecciona fecha" />
                </Form.Item>
            </Col>
            <Col span={12}>
                 <Form.Item label="Fecha de Finalización" name="fecha_fin">
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" placeholder="Selecciona fecha" />
                </Form.Item>
            </Col>
        </Row>

      </Form>
    </Create>
  );
}