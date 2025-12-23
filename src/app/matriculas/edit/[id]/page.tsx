"use client";

import React from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, Row, Col, Input, Alert, Tag } from "antd";
import dayjs from "dayjs";

export default function EditMatricula() {
  const { formProps, saveButtonProps, queryResult } = useForm({
    resource: "matriculas",
    redirect: "list",
  });

  const matriculaData = queryResult?.data?.data;

  // Cargar lista de cursos (por si quieres cambiarlo de curso)
  const { selectProps: cursoSelect } = useSelect({
    resource: "cursos",
    defaultValue: matriculaData?.curso_id,
    optionLabel: "nombre",
    optionValue: "id",
  });

  // Cargar lista de estudiantes (Solo para mostrar el nombre, no para editarlo)
  const { selectProps: studentSelect } = useSelect({
    resource: "perfiles",
    defaultValue: matriculaData?.estudiante_id,
    optionLabel: "nombre_completo",
    optionValue: "id",
  });

  return (
    <Edit saveButtonProps={saveButtonProps} title="Editar Matrícula">
      <Form {...formProps} layout="vertical">
        
        {/* ALERTA VISUAL DE ESTADO */}
        {matriculaData?.estado === 'suspendido' && (
            <Alert message="⚠️ Este estudiante tiene la matrícula SUSPENDIDA." type="warning" showIcon style={{marginBottom: 20}} />
        )}

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Estudiante (No editable)" name="estudiante_id">
                    <Select {...studentSelect} disabled />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Curso Inscrito" name="curso_id" rules={[{ required: true }]}>
                    <Select {...cursoSelect} />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col xs={24} md={8}>
                <Form.Item 
                    label="Fecha de Inicio" 
                    name="fecha_inicio" 
                    getValueProps={(value) => ({ value: value ? dayjs(value) : "" })}
                >
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                <Form.Item label="Estado de la Matrícula" name="estado">
                    <Select options={[
                        { value: 'activo', label: '🟢 Activo (Cursando)' },
                        { value: 'suspendido', label: '🟠 Suspendido (Mora/Sanción)' },
                        { value: 'finalizado', label: '🔵 Finalizado (Graduado)' },
                        { value: 'retirado', label: '🔴 Retirado' },
                    ]} />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                 <Form.Item 
                    label="Fecha de Finalización" 
                    name="fecha_fin"
                    getValueProps={(value) => ({ value: value ? dayjs(value) : "" })}
                >
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" placeholder="Solo si terminó" />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Observaciones / Novedades" name="observaciones">
            <Input.TextArea rows={3} />
        </Form.Item>

      </Form>
    </Edit>
  );
}