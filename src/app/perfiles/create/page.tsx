"use client";

import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select } from "antd";

export default function CreatePerfil() {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps} title="Registrar Nuevo Estudiante">
      <Form {...formProps} layout="vertical">
        
        <Form.Item
          label="Nombre Completo"
          name="nombre_completo"
          rules={[{ required: true, message: "Escribe el nombre" }]}
        >
          <Input placeholder="Ej: Ana María Pérez" />
        </Form.Item>

        <Form.Item
          label="Correo Electrónico"
          name="email"
          rules={[
            { required: true, message: "Escribe el correo" },
            { type: "email", message: "Correo no válido" }
          ]}
        >
          <Input placeholder="cliente@correo.com" />
        </Form.Item>

        <Form.Item
          label="Teléfono / WhatsApp"
          name="telefono"
        >
          <Input placeholder="Ej: 300 123 4567" />
        </Form.Item>

        <Form.Item
          label="Rol"
          name="rol"
          initialValue="estudiante"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: "estudiante", label: "🎓 Estudiante" },
              { value: "profesor", label: "👩‍🏫 Profesor" },
              { value: "admin", label: "👑 Administrador" },
            ]}
          />
        </Form.Item>

      </Form>
    </Create>
  );
}