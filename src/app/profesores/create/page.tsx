"use client";

import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select, Divider, InputNumber, Row, Col } from "antd";

export default function CreateProfesor() {
  // Guardamos en la tabla "perfiles"
  const { formProps, saveButtonProps } = useForm({
    resource: "perfiles",
    redirect: "list", // Al guardar, vuelve a la lista
  });

  return (
    <Create saveButtonProps={saveButtonProps} title="Registrar Nuevo Docente">
      <Form {...formProps} layout="vertical">
        
        {/* CAMPO OCULTO: ROL SIEMPRE ES PROFESOR */}
        <Form.Item name="rol" initialValue="profesor" hidden><Input /></Form.Item>

        <h3 style={{ color: '#722ed1' }}>Datos Personales</h3>
        <Row gutter={20}>
            <Col span={12}>
                <Form.Item label="Nombre Completo" name="nombre_completo" rules={[{ required: true }]}>
                    <Input placeholder="Ej: María Pérez" />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Cédula / ID" name="identificacion" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
        </Row>

        <Divider />
        <h3 style={{ color: '#722ed1' }}>Configuración de Pagos</h3>
        <Row gutter={20}>
            <Col span={12}>
                <Form.Item label="Modalidad" name="tipo_pago" initialValue="porcentaje">
                    <Select options={[
                        { value: "porcentaje", label: "% Porcentaje por Estudiante" },
                        { value: "fijo_mensual", label: "📅 Sueldo Fijo Mensual" },
                        { value: "valor_hora", label: "⏱️ Pago por Hora" },
                    ]} />
                </Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Valor de Tarifa" name="valor_pago" help="Ej: 50 (%), 1.200.000 (fijo)">
                    <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number}/>
                </Form.Item>
            </Col>
        </Row>

        <Divider />
        <h3 style={{ color: '#722ed1' }}>Contacto</h3>
        <Row gutter={20}>
            <Col span={12}>
                <Form.Item label="Email" name="email"><Input type="email" /></Form.Item>
            </Col>
            <Col span={12}>
                <Form.Item label="Teléfono" name="telefono"><Input /></Form.Item>
            </Col>
        </Row>
      </Form>
    </Create>
  );
}