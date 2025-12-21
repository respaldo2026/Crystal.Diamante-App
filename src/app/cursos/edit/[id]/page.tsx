"use client";

import React from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber } from "antd";

export default function EditCurso() {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Edit saveButtonProps={saveButtonProps} title="Editar Curso">
      <Form {...formProps} layout="vertical">
        
        <Form.Item
          label="Nombre del Curso"
          name="nombre"
          rules={[{ required: true, message: "Escribe el nombre del curso" }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="Descripción Breve"
          name="descripcion"
        >
          <Input.TextArea rows={3} />
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

        {/* Campo Nuevo: Duración */}
        <Form.Item
          label="Duración (Horas/Días)"
          name="duracion"
        >
           <Input placeholder="Ej: 40 Horas" />
        </Form.Item>

      </Form>
    </Edit>
  );
}