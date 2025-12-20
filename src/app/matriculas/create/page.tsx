"use client";

import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, InputNumber } from "antd";
import dayjs from "dayjs";

export default function MatriculaCreate() {
  const { formProps, saveButtonProps } = useForm({
    redirect: "list", // Al guardar, vuelve a la lista
  });

  // Selector de Estudiantes
  const { selectProps: estudianteSelectProps } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
  });

  // Selector de Cursos
  const { selectProps: cursoSelectProps } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
  });

  return (
    <Create saveButtonProps={saveButtonProps} title="Nueva Matrícula">
      <Form {...formProps} layout="vertical">
        
        {/* CAMPO 1: Estudiante */}
        <Form.Item
          label="Estudiante"
          name="perfil_id"
          rules={[{ required: true, message: "¡Elige un estudiante!" }]}
        >
          <Select 
            {...estudianteSelectProps} 
            placeholder="Busca por nombre..." 
            showSearch
            filterOption={false} // Búsqueda gestionada por Refine
            onSearch={estudianteSelectProps.onSearch}
          />
        </Form.Item>

        {/* CAMPO 2: Curso */}
        <Form.Item
          label="Curso a Matricular"
          name="curso_id"
          rules={[{ required: true, message: "¡Elige un curso!" }]}
        >
          <Select {...cursoSelectProps} placeholder="Selecciona el curso..." />
        </Form.Item>

        {/* CAMPO 3: Monto */}
        <Form.Item
          label="Monto Pagado ($)"
          name="monto_pagado"
          initialValue={0}
          rules={[{ required: true }]}
        >
           <InputNumber 
                style={{ width: "100%" }}
                formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value) => value?.replace(/\$\s?|(,*)/g, "") as unknown as number}
           />
        </Form.Item>

        {/* CAMPO 4: Fecha (CON CORRECCIÓN DE GUARDADO) */}
        <Form.Item
          label="Fecha de Inicio"
          name="fecha_inicio"
          rules={[{ required: true, message: "La fecha es obligatoria" }]}
          // Convierte el texto de la BD a Objeto Calendario para mostrarlo
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
          // IMPORTANTE: Convierte el Objeto Calendario a Texto simple para la BD
          normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
        >
          <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
        </Form.Item>

      </Form>
    </Create>
  );
}