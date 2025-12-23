"use client";

import React from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, Divider, Alert } from "antd";
import dayjs from "dayjs";

export default function EditCurso() {
  // 1. Hook para cargar y guardar datos
  const { formProps, saveButtonProps, queryResult } = useForm({
    resource: "cursos",
    redirect: "list", // Al guardar, vuelve a la lista
  });

  const cursoData = queryResult?.data?.data;

  // 2. Cargar lista de profesores para cambiarlo si es necesario
  const { selectProps: teacherSelect } = useSelect({
    resource: "perfiles",
    defaultValue: cursoData?.profesor_id, // Pre-seleccionar el profesor actual
    optionLabel: "nombre_completo",
    optionValue: "id",
    filters: [
        { field: "rol", operator: "eq", value: "profesor" }
    ],
  });

  return (
    <Edit saveButtonProps={saveButtonProps} title={`Editar: ${cursoData?.nombre || "Curso"}`}>
      <Form {...formProps} layout="vertical">
        
        <Row gutter={24}>
            <Col span={16}>
                <Form.Item label="Nombre del Curso" name="nombre" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
            <Col span={8}>
                <Form.Item label="Estado Actual" name="estado">
                    <Select options={[
                        { value: 'activo', label: '🟢 Activo' },
                        { value: 'inscripciones', label: '🟡 Inscripciones' },
                        { value: 'cerrado', label: '🔴 Cerrado' },
                    ]}/>
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Descripción" name="descripcion">
            <Input.TextArea rows={3} />
        </Form.Item>

        <Divider orientation="left" style={{color:'#722ed1'}}>Configuración Académica</Divider>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Docente Encargado" name="profesor_id" rules={[{ required: true }]}>
                    <Select {...teacherSelect} placeholder="Selecciona un profesor..." />
                </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
                <Form.Item label="Precio" name="precio">
                    <InputNumber 
                        style={{ width: '100%' }} 
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                    />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            {/* TRUCO IMPORTANTE: getValueProps convierte el texto de Supabase a fecha de Calendario */}
            <Col span={12}>
                <Form.Item 
                    label="Fecha de Inicio" 
                    name="fecha_inicio" 
                    getValueProps={(value) => ({ value: value ? dayjs(value) : "" })}
                >
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col span={12}>
                 <Form.Item 
                    label="Fecha de Finalización" 
                    name="fecha_fin" 
                    getValueProps={(value) => ({ value: value ? dayjs(value) : "" })}
                >
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
        </Row>

        {cursoData?.estado === 'cerrado' && (
             <Alert message="Este curso está marcado como cerrado." type="warning" showIcon />
        )}

      </Form>
    </Edit>
  );
}