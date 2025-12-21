"use client";

import React from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, InputNumber } from "antd";
import dayjs from "dayjs";

export default function EditMatricula() {
  const { formProps, saveButtonProps, queryResult } = useForm({
    // Aseguramos que cargue los datos necesarios
    meta: {
      select: "*, perfiles(id, nombre_completo), cursos(id, nombre)",
    },
  });

  const matriculaData = queryResult?.data?.data;

  // 1. Selector de ESTUDIANTES
  const { selectProps: studentSelectProps } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
    defaultValue: matriculaData?.estudiante_id,
  });

  // 2. Selector de CURSOS
  const { selectProps: courseSelectProps } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
    defaultValue: matriculaData?.curso_id,
  });

  return (
    <Edit saveButtonProps={saveButtonProps} title="Editar Matrícula">
      <Form {...formProps} layout="vertical">
        
        {/* Campo: Estudiante */}
        <Form.Item
          label="Estudiante"
          name="estudiante_id"
          rules={[{ required: true, message: "Selecciona un estudiante" }]}
        >
          <Select {...studentSelectProps} placeholder="Cargando estudiantes..." />
        </Form.Item>

        {/* Campo: Curso */}
        <Form.Item
          label="Curso"
          name="curso_id"
          rules={[{ required: true, message: "Selecciona un curso" }]}
        >
          <Select {...courseSelectProps} placeholder="Cargando cursos..." />
        </Form.Item>

        {/* Campo: Monto */}
        <Form.Item
          label="Monto Pagado ($)"
          name="monto_pagado"
          rules={[{ required: true, message: "Ingresa el monto" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(value) => value?.replace(/\$\s?|(,*)/g, "") as unknown as number}
          />
        </Form.Item>

        {/* Campo: Estado */}
        <Form.Item
          label="Estado de la Matrícula"
          name="estado"
          // AQUÍ ESTABA EL ERROR: Eliminé 'initialValue="activo"'
          // Ahora tomará el valor real de la base de datos automáticamente.
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: "activo", label: "🟢 Activo" },
              { value: "suspendido", label: "🔴 Suspendido/Retirado" },
              { value: "finalizado", label: "🎓 Finalizado" },
            ]}
          />
        </Form.Item>

        {/* Campo: Fecha */}
        <Form.Item
          label="Fecha de Inicio"
          name="fecha_inicio"
          getValueProps={(value) => ({
            value: value ? dayjs(value) : "",
          })}
          rules={[{ required: true, message: "Selecciona la fecha" }]}
        >
          <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
        </Form.Item>

      </Form>
    </Edit>
  );
}