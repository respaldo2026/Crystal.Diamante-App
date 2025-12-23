"use client";

import React from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Row, Col, Divider, Select, InputNumber } from "antd";

export default function EditProfesor() {
  const { formProps, saveButtonProps, queryResult } = useForm({
    resource: "perfiles",
    redirect: "list",
  });

  const profesor = queryResult?.data?.data;

  return (
    <Edit saveButtonProps={saveButtonProps} title={`Editar: ${profesor?.nombre_completo || "Docente"}`}>
      <Form {...formProps} layout="vertical">
        
        <Form.Item name="rol" hidden><Input /></Form.Item>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Nombre Completo" name="nombre_completo" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Identificación" name="identificacion" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
        </Row>

        <Divider orientation="left" style={{color: '#722ed1'}}>Configuración de Pagos</Divider>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Modalidad de Pago" name="tipo_pago">
                    <Select options={[
                        { value: "porcentaje", label: "% Comisión por Alumno" },
                        { value: "valor_hora", label: "⏱️ Pago por Hora" },
                        { value: "fijo_mensual", label: "📅 Salario Fijo" },
                    ]} />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Tarifa / Valor" name="valor_pago" help="Ej: 20000 (hora) o 50 (comisión)">
                    <InputNumber 
                        style={{ width: '100%' }}
                        formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                    />
                </Form.Item>
            </Col>
        </Row>

        <Divider orientation="left" style={{color: '#722ed1'}}>Contacto</Divider>
        
        <Row gutter={24}>
             <Col span={12}><Form.Item label="Teléfono" name="telefono"><Input /></Form.Item></Col>
             <Col span={12}><Form.Item label="Email" name="email"><Input /></Form.Item></Col>
        </Row>

      </Form>
    </Edit>
  );
}