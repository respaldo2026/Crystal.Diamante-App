"use client";

import React, { useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useCreate } from "@refinedev/core"; // Hook para crear datos manualmente
import { 
  Form, 
  Select, 
  DatePicker, 
  InputNumber, 
  Divider, 
  Button, 
  Modal, 
  Input, 
  message 
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export default function CreateMatricula() {
  // 1. Hook para el formulario principal (Matrícula)
  const { formProps, saveButtonProps } = useForm();

  // 2. Estados para controlar la Ventana Emergente (Modal)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalForm] = Form.useForm(); // Formulario pequeño del modal
  
  // 3. Hook especial para guardar el estudiante nuevo sin salir de la página
  const { mutate: createEstudiante } = useCreate();

  // 4. Selector de ESTUDIANTES (Con truco para recargar)
  const { selectProps: studentSelectProps, queryResult } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
    // Esto asegura que la lista se ordene por los últimos creados
    sorters: [{ field: "created_at", order: "desc" }],
  });

  // 5. Selector de CURSOS
  const { selectProps: courseSelectProps } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
  });

  // --- FUNCIÓN: Guardar el Estudiante desde el Modal ---
  const handleModalOk = () => {
    modalForm.validateFields().then((values) => {
      // Enviamos los datos a Supabase
      createEstudiante(
        {
          resource: "perfiles",
          values: {
            ...values,
            rol: "estudiante", // Forzamos que sea estudiante
          },
          successNotification: {
             message: "¡Estudiante creado!",
             description: "Ya puedes seleccionarlo en la lista.",
             type: "success",
          },
        },
        {
          onSuccess: (data) => {
            // Si todo sale bien:
            setIsModalOpen(false); // 1. Cerramos modal
            modalForm.resetFields(); // 2. Limpiamos formulario
            
            // 3. Refrescamos la lista de estudiantes para que aparezca el nuevo
            queryResult.refetch(); 
            
            // 4. (Opcional) Auto-seleccionamos al nuevo en el campo
            // formProps.form?.setFieldValue("estudiante_id", data.data.id);
          },
        }
      );
    });
  };

  return (
    <>
      <Create saveButtonProps={saveButtonProps} title="Nueva Matrícula">
        <Form {...formProps} layout="vertical">
          
          {/* CAMPO: ESTUDIANTE (CON EL TRUCO PRO) */}
          <Form.Item
            label="Estudiante"
            name="estudiante_id"
            rules={[{ required: true, message: "Selecciona un estudiante" }]}
          >
            <Select
              {...studentSelectProps}
              placeholder="Busca o crea un estudiante..."
              // --- AQUÍ ESTÁ LA MAGIA ---
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: "8px 0" }} />
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={() => setIsModalOpen(true)}
                    block
                    style={{ textAlign: "left", fontWeight: "bold", color: "#1677ff" }}
                  >
                    Agregar Nuevo Estudiante
                  </Button>
                </>
              )}
              // --------------------------
            />
          </Form.Item>

          <Form.Item
            label="Curso"
            name="curso_id"
            rules={[{ required: true, message: "Selecciona un curso" }]}
          >
            <Select {...courseSelectProps} placeholder="Selecciona un curso" />
          </Form.Item>

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

          <Form.Item
            label="Fecha de Inicio"
            name="fecha_inicio"
            initialValue={dayjs()} // Pone la fecha de hoy automáticamente
            getValueProps={(value) => ({
              value: value ? dayjs(value) : "",
            })}
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>

        </Form>
      </Create>

      {/* --- VENTANA EMERGENTE (MODAL) PARA CREAR ESTUDIANTE --- */}
      <Modal
        title="👤 Registrar Nuevo Estudiante Rápido"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        okText="Guardar y Usar"
        cancelText="Cancelar"
      >
        <Form form={modalForm} layout="vertical">
          <Form.Item
            name="nombre_completo"
            label="Nombre Completo"
            rules={[{ required: true, message: "Falta el nombre" }]}
          >
            <Input placeholder="Ej: Pepito Pérez" />
          </Form.Item>
          
          <Form.Item
            name="email"
            label="Correo Electrónico"
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input placeholder="correo@ejemplo.com" />
          </Form.Item>

          <Form.Item name="telefono" label="Teléfono (Opcional)">
            <Input placeholder="Ej: 300..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}