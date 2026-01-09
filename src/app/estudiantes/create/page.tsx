"use client";

import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { useNavigation } from "@refinedev/core";
import { Form, Input, Row, Col, Divider, DatePicker, Select } from "antd";

export default function CreateEstudiante() {
  const { list } = useNavigation();

  const { formProps, saveButtonProps } = useForm({
    resource: "perfiles", // Guardamos en la tabla real de la base de datos
    redirect: false, // Desactivamos la redirección automática para controlarla nosotros
    onMutationSuccess: () => {
      // Al guardar con éxito, volvemos a la lista de Estudiantes
      list("estudiantes");
    },
  });

  return (
    <Create saveButtonProps={saveButtonProps} title="Matricular Nuevo Estudiante">
    <Form {...formProps} form={formProps.form} layout="vertical">
        
        {/* --- CAMPO OCULTO: ROL AUTOMÁTICO --- */}
        {/* Esto asegura que se cree como estudiante y no como otra cosa */}
        <Form.Item name="rol" initialValue="estudiante" hidden>
            <Input />
        </Form.Item>

        <h3 style={{ color: '#722ed1', marginTop: 0 }}>Datos Personales del Alumno</h3>
        <p style={{ color: '#888', marginBottom: 20 }}>
            Ingresa los datos completos para crear el expediente académico.
        </p>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Nombre Completo" 
                    name="nombre_completo" 
                    rules={[{ required: true, message: "El nombre es obligatorio" }]}
                >
                    <Input placeholder="Ej: Laura Valentina Martínez" />
                </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Número de Identificación / Cédula" 
                    name="identificacion" 
                    rules={[{ required: true, message: "La cédula es obligatoria" }]}
                >
                    <Input placeholder="Ej: 1.122.333.444" />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Fecha de Nacimiento" 
                    name="fecha_nacimiento"
                    help="Para enviar felicitaciones y calcular edad"
                >
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Selecciona fecha" />
                </Form.Item>
            </Col>

            <Col xs={24} md={12}>
                <Form.Item 
                    label="Género" 
                    name="genero"
                >
                    <Select placeholder="Selecciona género">
                        <Select.Option value="Masculino">Masculino</Select.Option>
                        <Select.Option value="Femenino">Femenino</Select.Option>
                        <Select.Option value="Otro">Otro</Select.Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Talla de camiseta" 
                    name="talla_camiseta"
                    help="Para uniformes o dotación"
                >
                    <Select placeholder="Selecciona talla">
                        <Select.Option value="XS">XS</Select.Option>
                        <Select.Option value="S">S</Select.Option>
                        <Select.Option value="M">M</Select.Option>
                        <Select.Option value="L">L</Select.Option>
                        <Select.Option value="XL">XL</Select.Option>
                        <Select.Option value="XXL">XXL</Select.Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>

        <Divider />

        <h3 style={{ color: '#722ed1' }}>Información de Contacto</h3>
        
        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Correo Electrónico" 
                    name="email"
                    rules={[
                        { type: 'email', message: 'Ingresa un correo válido' }
                    ]}
                >
                    <Input placeholder="correo@ejemplo.com" />
                </Form.Item>
            </Col>

            <Col xs={24} md={12}>
                <Form.Item 
                    label="Teléfono / WhatsApp" 
                    name="telefono"
                    help="Útil para notificaciones de cursos y cobros"
                    rules={[{ required: true, message: "El teléfono es obligatorio" }]}
                >
                    <Input placeholder="Ej: 300 123 4567" />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item 
            label="Dirección de Residencia" 
            name="direccion"
        >
            <Input.TextArea rows={2} placeholder="Ej: Calle 45 #12-34, Barrio Centro" />
        </Form.Item>

        <Divider />

        <h3 style={{ color: '#722ed1' }}>Información Adicional</h3>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Nombre del Acudiente / Contacto de Emergencia" 
                    name="acudiente_nombre"
                    help="Aplica para menores de edad o referencia"
                >
                    <Input placeholder="Ej: María López" />
                </Form.Item>
            </Col>

            <Col xs={24} md={12}>
                <Form.Item 
                    label="Teléfono del Acudiente" 
                    name="acudiente_telefono"
                >
                    <Input placeholder="Ej: 310 555 6789" />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item 
            label="Observaciones / Notas Especiales" 
            name="observaciones"
            help="Alergias, condiciones médicas, preferencias de horario, etc."
        >
            <Input.TextArea rows={3} placeholder="Cualquier información relevante..." />
        </Form.Item>

      </Form>
    </Create>
  );
}