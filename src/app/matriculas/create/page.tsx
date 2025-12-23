"use client";

import React from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useNavigation } from "@refinedev/core";
import { Form, Select, DatePicker, Row, Col, Input, Divider } from "antd";
import dayjs from "dayjs";

export default function CreateMatricula() {
  const { list } = useNavigation();

  const { formProps, saveButtonProps } = useForm({
    resource: "matriculas",
    redirect: false,
    onMutationSuccess: () => list("matriculas"),
  });

  // SELECTOR INTELIGENTE: Solo muestra estudiantes
  const { selectProps: studentSelect } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
    filters: [{ field: "rol", operator: "eq", value: "estudiante" }],
  });

  // SELECTOR INTELIGENTE: Solo muestra cursos activos
  const { selectProps: cursoSelect } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
    filters: [{ field: "estado", operator: "eq", value: "activo" }],
  });

  return (
    <Create saveButtonProps={saveButtonProps} title="Matricular Estudiante">
      <Form {...formProps} layout="vertical">
        
        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Seleccionar Estudiante" name="estudiante_id" rules={[{ required: true }]}>
                    <Select 
                        {...studentSelect} 
                        showSearch
                        placeholder="Busca por nombre..."
                        filterOption={(input, option: any) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Seleccionar Curso" name="curso_id" rules={[{ required: true }]}>
                    <Select {...cursoSelect} placeholder="Curso a inscribir..." />
                </Form.Item>
            </Col>
        </Row>

        <Divider orientation="left" style={{color:'#722ed1'}}>Detalles de la Inscripción</Divider>

        <Row gutter={24}>
            <Col xs={24} md={8}>
                <Form.Item label="Fecha de Inicio" name="fecha_inicio" initialValue={dayjs()}>
                    <DatePicker style={{width:'100%'}} format="DD/MM/YYYY" />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                <Form.Item label="Estado Inicial" name="estado" initialValue="activo">
                    <Select options={[
                        { value: 'activo', label: '🟢 Activo' },
                        { value: 'suspendido', label: '🟠 Suspendido (Pago pendiente)' },
                    ]} />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Observaciones Iniciales" name="observaciones">
            <Input.TextArea rows={2} placeholder="Ej: Estudiante becado al 50%, o trae materiales propios..." />
        </Form.Item>

      </Form>
    </Create>
  );
}