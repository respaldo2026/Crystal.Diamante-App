"use client";

import React from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Select, Divider, InputNumber, message } from "antd";
import { useParams } from "next/navigation";

export default function EditPerfil() {
  const params = useParams();
  const id = params?.id as string;

  // Conectamos el formulario manualmente
  const { formProps, saveButtonProps, form, onFinish } = useForm();

  const handleOnFinish = async (values: any) => {
    const result = await onFinish(values);

    const emailActualizado = String(values?.email || "").trim().toLowerCase();
    if (id && emailActualizado) {
      try {
        const syncResponse = await fetch("/api/auth/sync-user-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: id,
            email: emailActualizado,
          }),
        });

        const syncResult = await syncResponse.json();
        if (!syncResponse.ok) {
          message.warning(
            syncResult?.error ||
            "El perfil se actualizó, pero no se pudo sincronizar el correo en Auth."
          );
        } else if (syncResult?.updated) {
          message.success("Correo sincronizado en acceso (Auth).");
        } else if (syncResult?.ok) {
          message.info("El correo ya estaba sincronizado en acceso.");
        }
      } catch (syncError: any) {
        message.warning(
          syncError?.message ||
          "El perfil se actualizó, pero falló la sincronización del correo en Auth."
        );
      }
    }

    return result;
  };

  return (
    <Edit saveButtonProps={saveButtonProps} title="Editar Datos del Usuario">
      <Form {...formProps} form={form} layout="vertical" onFinish={handleOnFinish}>
        
        {/* --- DATOS PERSONALES --- */}
        <h3 style={{ marginTop: 0, color: '#722ed1' }}>Datos Personales</h3>
        
        <div style={{ display: 'flex', gap: '20px' }}>
             <Form.Item
              label="Número de Identificación / Cédula"
              name="identificacion"
              style={{ flex: 1 }}
              rules={[{ required: true, message: "La cédula es obligatoria" }]}
            >
              <Input placeholder="Ej: 1.112.223.334" />
            </Form.Item>

            <Form.Item
              label="Nombre Completo"
              name="nombre_completo"
              style={{ flex: 2 }}
              rules={[{ required: true, message: "El nombre es obligatorio" }]}
            >
              <Input />
            </Form.Item>
        </div>

        <Form.Item
          label="Rol en la Academia"
          name="rol"
          rules={[{ required: true, message: "Selecciona un rol" }]}
          help="Cambia esto a 'Profesor' para poder asignarle cursos y configurar pagos."
        >
          <Select
            options={[
              { value: "estudiante", label: "🎓 Estudiante (Cliente)" },
              { value: "profesor", label: "👩‍🏫 Profesor (Docente)" },
              { value: "admin", label: "👑 Administrador (Dueño)" },
            ]}
          />
        </Form.Item>

        {/* --- CONFIGURACIÓN DE PAGO (CORREGIDO) --- */}
        <Divider />
        <h3 style={{ color: '#722ed1' }}>Configuración de Pago (Nómina)</h3>
        
        <div style={{ display: 'flex', gap: '20px' }}>
            <Form.Item
                label="Modalidad de Pago"
                name="tipo_pago"
                style={{ flex: 1 }}
                // SE ELIMINÓ: initialValue="porcentaje" (Esto causaba el error)
            >
                <Select
                    options={[
                        { value: "porcentaje", label: "% Porcentaje por Estudiante" },
                        { value: "fijo_mensual", label: "📅 Sueldo Fijo Mensual" },
                        { value: "valor_hora", label: "⏱️ Pago por Hora Dictada" },
                    ]}
                />
            </Form.Item>

            <Form.Item
                label="Valor de la Tarifa"
                name="valor_pago"
                style={{ flex: 1 }}
                help="Ej: 50 (si es %), 1.200.000 (si es fijo), 25.000 (si es hora)"
            >
                <InputNumber 
                    style={{ width: '100%' }} 
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                />
            </Form.Item>
        </div>

        {/* --- CONTACTO --- */}
        <Divider />
        <h3 style={{ color: '#722ed1' }}>Información de Contacto</h3>

        <Form.Item
          label="Correo Electrónico"
          name="email"
          rules={[
            { required: true, message: "El correo es obligatorio" },
            { type: "email", message: "Correo no válido" }
          ]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="Teléfono / WhatsApp"
          name="telefono"
        >
          <Input />
        </Form.Item>

      </Form>
    </Edit>
  );
}