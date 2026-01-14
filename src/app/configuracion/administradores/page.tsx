"use client";

import React, { useState } from "react";
import { Form, Input, Row, Col, Alert, Button, Card, Table, Space, Popconfirm, Spin, App } from "antd";
import { DeleteOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function AdministradoresPage() {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [adminsList, setAdminsList] = useState<any[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Cargar lista de administradores al montar
    React.useEffect(() => {
        cargarAdministradores();
    }, []);

    const cargarAdministradores = async () => {
        setListLoading(true);
        try {
            console.log("📋 Cargando administradores...");
            
            const { data, error } = await supabaseBrowserClient
                .from("perfiles")
                .select("id, nombre_completo, identificacion, email, telefono, rol, created_at")
                .eq("rol", "admin")
                .order("created_at", { ascending: false });

            console.log("✅ Respuesta de BD:", { data, error });

            if (error) {
                console.error("❌ Error en query:", error);
                throw error;
            }
            
            console.log("📊 Total de admins encontrados:", data?.length || 0);
            setAdminsList(data || []);
        } catch (error: any) {
            console.error("❌ Error cargando admins:", error);
            message.error("Error cargando administradores: " + error.message);
            setAdminsList([]);
        } finally {
            setListLoading(false);
        }
    };

    const handleGuardarAdmin = async (values: any) => {
        setLoading(true);
        try {
            const passwordAuth = values.identificacion.replace(/\./g, '');

            // 1. PRIMERO: Crear usuario en Auth vía signUp
            console.log('📝 Creando usuario en Auth...');
            const { data: authData, error: authError } = await supabaseBrowserClient.auth.signUp({
                email: values.email,
                password: passwordAuth,
                options: {
                    data: {
                        nombre_completo: values.nombre_completo,
                        rol: 'admin',
                    },
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (authError) {
                console.error('❌ Error en signUp:', authError.message);
                message.error(`Error creando usuario en Auth: ${authError.message}`);
                setLoading(false);
                return;
            }

            const authUserId = authData.user?.id;
            if (!authUserId) {
                message.error('No se pudo obtener el ID del usuario');
                setLoading(false);
                return;
            }

            console.log('✅ Usuario creado en Auth con ID:', authUserId);

            // 2. LUEGO: Actualizar el perfil creado por el trigger
            console.log('📝 Actualizando perfil...');
            const { error: updateError } = await supabaseBrowserClient
                .from("perfiles")
                .update({
                    nombre_completo: values.nombre_completo,
                    identificacion: values.identificacion,
                    email: values.email,
                    telefono: values.telefono || null,
                    rol: 'admin',
                    direccion: values.direccion || null,
                    observaciones: values.observaciones || null,
                })
                .eq('id', authUserId);

            if (updateError) {
                console.error("Error actualizando perfil:", updateError);
                // No es crítico si falla la actualización, el usuario ya existe
                message.warning('Usuario creado pero no se pudieron guardar todos los datos');
            } else {
                console.log('✅ Perfil actualizado');
                message.success(`✅ Administrador creado correctamente.\nEmail: ${values.email}\nContraseña: ${passwordAuth}`);
            }

            // 3. Limpiar formulario y recargar lista
            form.resetFields();
            setShowForm(false);
            
            // Esperar un poco para que el trigger se procese completamente
            console.log('⏳ Esperando a que se procese el trigger...');
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            console.log('🔄 Recargando lista de administradores...');
            await cargarAdministradores();

        } catch (error: any) {
            console.error("Error creando admin:", error);
            message.error("Error: " + (error.message || "No se pudo guardar"));
        } finally {
            setLoading(false);
        }
    };

    const handleEliminarAdmin = async (id: string) => {
        try {
            const { error } = await supabaseBrowserClient
                .from("perfiles")
                .delete()
                .eq("id", id);

            if (error) throw error;

            message.success("Administrador eliminado");
            await cargarAdministradores();
        } catch (error: any) {
            message.error("Error al eliminar: " + error.message);
        }
    };

    return (
        <div style={{ padding: '24px' }}>
            <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: 0 }}>👑 Administradores</h1>
                        <p style={{ color: '#666', marginTop: '8px' }}>Gestiona los usuarios con acceso total al sistema</p>
                    </div>
                    <Button
                        type="primary"
                        size="large"
                        icon={<PlusOutlined />}
                        onClick={() => setShowForm(!showForm)}
                    >
                        {showForm ? 'Cancelar' : 'Nuevo Administrador'}
                    </Button>
                </div>

                {/* FORMULARIO DE CREACIÓN */}
                {showForm && (
                    <Card style={{ marginBottom: '24px', background: '#fafafa' }}>
                        <h3 style={{ marginTop: 0 }}>Crear Nuevo Administrador</h3>
                        <Alert
                            message="Sistema de Login"
                            description="Usuario (Email) + Contraseña (Cédula)"
                            type="info"
                            style={{ marginBottom: '16px' }}
                        />

                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={handleGuardarAdmin}
                        >
                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Nombre Completo"
                                        name="nombre_completo"
                                        rules={[{ required: true, message: "Campo obligatorio" }]}
                                    >
                                        <Input placeholder="Ej: María García López" />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Cédula / ID"
                                        name="identificacion"
                                        rules={[{ required: true, message: "Campo obligatorio" }]}
                                    >
                                        <Input placeholder="Ej: 1.000.000.001" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Correo Electrónico"
                                        name="email"
                                        rules={[
                                            { required: true, message: "Campo obligatorio" },
                                            { type: "email", message: "Correo no válido" }
                                        ]}
                                    >
                                        <Input placeholder="admin@academia.crystal" />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Teléfono"
                                        name="telefono"
                                    >
                                        <Input placeholder="Ej: 300 000 0001" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                label="Observaciones"
                                name="observaciones"
                            >
                                <Input.TextArea placeholder="Notas adicionales..." rows={3} />
                            </Form.Item>

                            <Space>
                                <Button type="primary" htmlType="submit" loading={loading}>
                                    Crear Administrador
                                </Button>
                                <Button onClick={() => setShowForm(false)}>
                                    Cancelar
                                </Button>
                            </Space>
                        </Form>
                    </Card>
                )}

                {/* TABLA DE ADMINISTRADORES */}
                <Spin spinning={listLoading}>
                    <h3 style={{ marginTop: '24px', marginBottom: '16px' }}>
                        Administradores Registrados ({adminsList.length})
                    </h3>

                    {adminsList.length === 0 ? (
                        <Alert
                            message="No hay administradores creados"
                            description="Crea el primer administrador usando el botón de arriba"
                            type="warning"
                            style={{ marginBottom: '16px' }}
                        />
                    ) : (
                        <Table
                            dataSource={adminsList}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            columns={[
                                {
                                    title: 'Nombre',
                                    dataIndex: 'nombre_completo',
                                    key: 'nombre_completo',
                                    render: (text) => (
                                        <Space>
                                            <UserOutlined />
                                            <strong>{text}</strong>
                                        </Space>
                                    )
                                },
                                {
                                    title: 'Cédula',
                                    dataIndex: 'identificacion',
                                    key: 'identificacion',
                                },
                                {
                                    title: 'Correo',
                                    dataIndex: 'email',
                                    key: 'email',
                                },
                                {
                                    title: 'Teléfono',
                                    dataIndex: 'telefono',
                                    key: 'telefono',
                                },
                                {
                                    title: 'Acciones',
                                    key: 'acciones',
                                    render: (text, record) => (
                                        <Popconfirm
                                            title="Eliminar administrador"
                                            description="¿Estás seguro de que deseas eliminar este administrador?"
                                            onConfirm={() => handleEliminarAdmin(record.id)}
                                            okText="Sí, eliminar"
                                            cancelText="Cancelar"
                                        >
                                            <Button danger size="small" icon={<DeleteOutlined />}>
                                                Eliminar
                                            </Button>
                                        </Popconfirm>
                                    )
                                }
                            ]}
                        />
                    )}
                </Spin>
            </Card>
        </div>
    );
}
