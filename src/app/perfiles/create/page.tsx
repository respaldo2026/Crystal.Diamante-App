"use client";

import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select, Divider, App } from "antd";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function CreatePerfil() {
  const { message } = App.useApp();
  const { formProps, saveButtonProps, onFinish } = useForm({
    onMutationSuccess: async (data, variables) => {
      const perfil = variables as any;
      
      if (!perfil.identificacion || !perfil.email) {
        message.warning("Falta identificación o email");
        return;
      }

      const passwordAuth = perfil.identificacion.replace(/\./g, '');
      
      try {
        // Crear usuario en Auth directamente
        const { data: authData, error: authError } = await supabaseBrowserClient.auth.signUp({
          email: perfil.email,
          password: passwordAuth,
          options: {
            data: {
              nombre_completo: perfil.nombre_completo,
              rol: perfil.rol,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (authError) {
          message.warning(`Perfil guardado. Error en Auth: ${authError.message}`);
          return;
        }

        if (authData.user) {
          message.success(`✅ Usuario creado. Ya puede hacer login con:\nEmail: ${perfil.email}\nContraseña: ${passwordAuth}`);
        }
      } catch (error: any) {
        message.info(`Perfil guardado. Credenciales: ${perfil.email} / ${passwordAuth}`);
      }
    }
  });

  return (
    <Create saveButtonProps={saveButtonProps} title="Registrar Persona">
      <div style={{ padding: '12px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: '4px', marginBottom: '16px' }}>
        <strong>🔑 Sistema de Login:</strong> El <strong>usuario es el correo</strong> y la <strong>contraseña es la cédula</strong>.
        <br />
        <small>Ejemplo: Usuario: <code>usuario@correo.com</code> / Contraseña: <code>1234567890</code></small>
      </div>
      
      <Form {...formProps} form={formProps.form} layout="vertical">
        
        <h3 style={{ marginTop: 0, color: '#722ed1' }}>Datos Personales</h3>
        
        <div style={{ display: 'flex', gap: '20px' }}>
            {/* CAMPO NUEVO: IDENTIFICACIÓN */}
            <Form.Item
              label="Número de Identificación / Cédula"
              name="identificacion"
              style={{ flex: 1 }}
              rules={[{ required: true, message: "Escribe la cédula o ID" }]}
            >
              <Input placeholder="Ej: 1.112.333.444" />
            </Form.Item>

            <Form.Item
              label="Nombre Completo"
              name="nombre_completo"
              style={{ flex: 2 }}
              rules={[{ required: true, message: "Escribe el nombre" }]}
            >
              <Input placeholder="Ej: Ana María Pérez" />
            </Form.Item>
        </div>

        <Form.Item
          label="Rol en la Academia"
          name="rol"
          initialValue="estudiante"
          rules={[{ required: true }]}
          help="Selecciona 'Profesor' para que pueda dictar cursos."
        >
          <Select
            options={[
              { value: "estudiante", label: "🎓 Estudiante (Cliente)" },
              { value: "profesor", label: "👩‍🏫 Profesor (Docente)" },
              { value: "admin", label: "👑 Administrador (Dueño)" },
            ]}
          />
        </Form.Item>

        <Divider />
        <h3 style={{ color: '#722ed1' }}>Contacto</h3>

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

      </Form>
    </Create>
  );
}