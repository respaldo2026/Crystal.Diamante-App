"use client";

import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber } from "antd";

export default function CreateCurso() {
  // Extraemos 'form' directamente para conectarlo manual si falla el automático
  const { formProps, saveButtonProps, form } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps} title="Crear Nuevo Curso">
      {/* Pasamos 'form={form}' explícitamente para corregir el error de conexión */}
      <Form {...formProps} form={form} layout="vertical">
        
        <Form.Item
          label="Nombre del Curso"
          name="nombre"
          rules={[{ required: true, message: "Escribe el nombre del curso" }]}
        >
          <Input placeholder="Ej: Diplomado en Uñas Acrílicas" />
        </Form.Item>

        <Form.Item
          label="Descripción Breve"
          name="descripcion"
        >
          <Input.TextArea rows={3} placeholder="¿Qué aprenderán en este curso?" />
        </Form.Item>

        <Form.Item
          label="Precio ($)"
          name="precio"
          rules={[{ required: true, message: "Ponle un precio" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(value) => value?.replace(/\$\s?|(,*)/g, "") as unknown as number}
          />
        </Form.Item>

        <Form.Item
          label="Duración (Horas/Días)"
          name="duracion"
        >
           <Input placeholder="Ej: 40 Horas" />
        </Form.Item>

      </Form>
    </Create>
  );
}