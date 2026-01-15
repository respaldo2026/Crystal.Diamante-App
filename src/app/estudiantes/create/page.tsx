"use client";

import React, { useState } from "react";
import { Create } from "@refinedev/antd";
import { useNavigation } from "@refinedev/core";
import { Form, Input, Row, Col, Divider, DatePicker, Select, message, Alert } from "antd";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function CreateEstudiante() {
  const { list } = useNavigation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleGuardarManual = async (values: any) => {
    setLoading(true);
    try {
      // Validar que tenga email para poder crear el usuario
      if (!values.email || !values.email.includes('@')) {
        throw new Error("El correo electrónico es obligatorio y debe ser válido para crear el acceso al portal");
      }

      // 1. Generar contraseña temporal (identificación)
      const passwordTemporal = values.identificacion || 'estudiante123';

      // 2. Llamar al API route seguro para crear usuario
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: values.email,
          password: passwordTemporal,
          rol: 'estudiante',
          user_metadata: {
            nombre_completo: values.nombre_completo,
            identificacion: values.identificacion,
            telefono: values.telefono,
            fecha_nacimiento: values.fecha_nacimiento ? values.fecha_nacimiento.format("YYYY-MM-DD") : null,
            genero: values.genero || null,
            talla_camiseta: values.talla_camiseta || null,
            direccion: values.direccion || null,
            acudiente_nombre: values.acudiente_nombre || null,
            acudiente_telefono: values.acudiente_telefono || null,
            observaciones: values.observaciones || null,
          }
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al crear el usuario");
      }

      // 3. Éxito
      message.success({
        content: (
          <div>
            <div>¡Estudiante matriculado correctamente!</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Email: <strong>{values.email}</strong><br/>
              Contraseña temporal: <strong>{passwordTemporal}</strong>
            </div>
          </div>
        ),
        duration: 8
      });
      
      list("estudiantes");

    } catch (error: any) {
      console.error("Error creando estudiante:", error);
      message.error(error.message || "Error al crear el estudiante");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Create 
      title="Matricular Nuevo Estudiante"
      isLoading={loading}
      saveButtonProps={{
        onClick: () => form.submit(),
        disabled: loading
      }}
    >
      <Form 
        form={form}
        layout="vertical" 
        onFinish={handleGuardarManual}
      >

        <Alert 
          message="Acceso al Portal Estudiantil" 
          description="El correo electrónico es obligatorio para crear las credenciales de acceso al portal. Se usará la identificación como contraseña temporal."
          type="info" 
          showIcon 
          style={{ marginBottom: 16 }}
        />

        <h3 style={{ color: '#5B21B6', marginTop: 0 }}>Datos Personales del Alumno</h3>
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
                        <Selec5B21B6' }}>Información de Contacto</h3>
        
        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Correo Electrónico" 
                    name="email"
                    rules={[
                        { required: true, message: "Correo obligatorio" },
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
5B21B6
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