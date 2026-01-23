"use client";

import React, { useState } from "react";
import { Form, Input, Row, Col, Alert, Button, Card, Table, Space, Popconfirm, Spin, App, Modal, Dropdown, Checkbox, Divider, Tag, Upload, Avatar, Select } from "antd";
import { DeleteOutlined, PlusOutlined, UserOutlined, EditOutlined, MoreOutlined, LockOutlined, CameraOutlined, UploadOutlined } from "@ant-design/icons";
import { crearUsuario, obtenerUsuariosPorRol } from "../../../modules/usuarios/usuarios.service";
import { supabaseBrowserClient } from "../../../utils/supabase/client";
import { MODULOS_DISPONIBLES } from "@hooks/useRolePermissions"; // Si se centraliza, mover a contexts/roles-permissions-context si es necesario

export default function AdministradoresPage() {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [adminsList, setAdminsList] = useState<any[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [rolSeleccionado, setRolSeleccionado] = useState<'admin' | 'secretaria'>('admin');
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<any>(null);
    const [permisos, setPermisos] = useState<Record<string, boolean>>({});
    const [fotoUrl, setFotoUrl] = useState<string>("");
    const [fotoEditUrl, setFotoEditUrl] = useState<string>("");


    // Migración: cargar administradores usando servicio modular
    const cargarAdministradores = async () => {
        setListLoading(true);
        try {
            const data = await obtenerUsuariosPorRol("admin");
            setAdminsList(data);
        } catch (err: any) {
            message.error("Error cargando administradores: " + err.message);
        } finally {
            setListLoading(false);
        }
    };

    React.useEffect(() => {
        cargarAdministradores();
    }, []);

    const handleFotoUpload = async (file: any) => {
        try {
            if (!file) return false;

            // Validar tamaño (máximo 5MB)
            if (file.size > 5 * 1024 * 1024) {
                message.error("La imagen no debe exceder 5MB");
                return false;
            }

            // Crear nombre único para el archivo
            const fileExt = file.name.split('.').pop();
            const fileName = `admin_${Date.now()}.${fileExt}`;
            const filePath = `administradores/${fileName}`;

            // Subir a Supabase Storage
            const { data, error } = await supabaseBrowserClient.storage
                .from('fotos')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            // Obtener URL pública
            const { data: publicData } = supabaseBrowserClient.storage
                .from('fotos')
                .getPublicUrl(filePath);

            setFotoUrl(publicData.publicUrl);
            message.success("Foto cargada correctamente");
            return false;
        } catch (error: any) {
            console.error("Error cargando foto:", error);
            message.error("Error al cargar la foto: " + error.message);
            return false;
        }
    };

    const handleFotoEditUpload = async (file: any) => {
        try {
            if (!file) return false;

            if (file.size > 5 * 1024 * 1024) {
                message.error("La imagen no debe exceder 5MB");
                return false;
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `admin_${editingAdmin.id}_${Date.now()}.${fileExt}`;
            const filePath = `administradores/${fileName}`;

            const { data, error } = await supabaseBrowserClient.storage
                .from('fotos')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: publicData } = supabaseBrowserClient.storage
                .from('fotos')
                .getPublicUrl(filePath);

            setFotoEditUrl(publicData.publicUrl);
            message.success("Foto cargada correctamente");
            return false;
        } catch (error: any) {
            console.error("Error cargando foto:", error);
            message.error("Error al cargar la foto: " + error.message);
            return false;
        }
    };

    // Removed cargarAdministradores function

    const handleGuardarAdmin = async (values: any) => {
        setLoading(true);
        try {
            if (!values.email || !values.email.includes('@')) {
                throw new Error("El correo electrónico es obligatorio y debe ser válido para crear el acceso");
            }

            const passwordTemporal = values.identificacion.replace(/\./g, '') || (rolSeleccionado === 'admin' ? 'admin123' : 'secretaria123');

            const response = await fetch('/api/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: values.email,
                    password: passwordTemporal,
                    rol: rolSeleccionado,
                    user_metadata: {
                        nombre_completo: values.nombre_completo,
                        identificacion: values.identificacion,
                        telefono: values.telefono || null,
                        direccion: values.direccion || null,
                        observaciones: values.observaciones || null,
                        foto_url: fotoUrl || null,
                    }
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Error al crear el usuario administrador");
            }

            message.success({
                content: (
                    <div>
                        <div>¡Administrador creado correctamente!</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            Email: <strong>{values.email}</strong><br />
                            Contraseña temporal: <strong>{passwordTemporal}</strong>
                        </div>
                    </div>
                ),
                duration: 8
            });

            // 3. Limpiar formulario
            form.resetFields();
            setShowForm(false);
            
            // Recargar inmediatamente y varias veces para asegurar
            console.log('🔄 Recargando lista de administradores...');
            obtenerUsuariosPorRol("admin")
                .then((data) => setAdminsList(data));
            
            // Esperar y recargar una vez más por si acaso
            setTimeout(async () => {
                console.log('🔄 Segunda recarga...');
                await cargarAdministradores();
            }, 2000);

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
    const abrirModalEditar = async (admin: any) => {
        setEditingAdmin(admin);
        setFotoEditUrl(admin.foto_url || "");
        editForm.setFieldsValue({
            nombre_completo: admin.nombre_completo,
            identificacion: admin.identificacion,
            email: admin.email,
            telefono: admin.telefono,
            direccion: admin.direccion,
            observaciones: admin.observaciones,
        });

        // Cargar permisos del usuario (admin o secretaria)
        try {
            const { data } = await supabaseBrowserClient
                .from("admin_permissions")
                .select("modulo")
                .eq("admin_id", admin.id);

            const permisosMap: Record<string, boolean> = {};
            data?.forEach((p: any) => {
                permisosMap[p.modulo] = true;
            });
            setPermisos(permisosMap);
        } catch (error) {
            console.error("Error cargando permisos:", error);
        }

        setEditModalVisible(true);
    };

    const handleGuardarEdicion = async (values: any) => {
        setLoading(true);
        try {
            // 1. Actualizar perfil
            const { error: updateError } = await supabaseBrowserClient
                .from("perfiles")
                .update({
                    nombre_completo: values.nombre_completo,
                    identificacion: values.identificacion,
                    email: values.email,
                    telefono: values.telefono || null,
                    direccion: values.direccion || null,
                    observaciones: values.observaciones || null,
                    foto_url: fotoEditUrl || null,
                })
                .eq("id", editingAdmin.id);

            if (updateError) throw updateError;

            // 2. Actualizar permisos
            // Eliminar permisos existentes
            await supabaseBrowserClient
                .from("admin_permissions")
                .delete()
                .eq("admin_id", editingAdmin.id);

            // Insertar nuevos permisos
            const permisosArray = Object.keys(permisos)
                .filter(key => permisos[key])
                .map(modulo => ({
                    admin_id: editingAdmin.id,
                    modulo: modulo,
                }));

            if (permisosArray.length > 0) {
                await supabaseBrowserClient
                    .from("admin_permissions")
                    .insert(permisosArray);
            }

            message.success("✅ Administrador actualizado correctamente");
            setEditModalVisible(false);
            editForm.resetFields();
            setEditingAdmin(null);
            setPermisos({});
            setFotoEditUrl("");
            await cargarAdministradores();
        } catch (error: any) {
            console.error("Error actualizando:", error);
            message.error("Error actualizando: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePermisoChange = (modulo: string, checked: boolean) => {
        setPermisos(prev => ({
            ...prev,
            [modulo]: checked
        }));
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
                            <Form.Item label="Rol" required>
                                <Select value={rolSeleccionado} onChange={setRolSeleccionado} style={{ width: 200 }}>
                                    <Select.Option value="admin">Administrador</Select.Option>
                                    <Select.Option value="secretaria">Secretaria</Select.Option>
                                </Select>
                            </Form.Item>
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

                            <Divider />

                            <Form.Item label="Foto de Perfil">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <Upload
                                        accept="image/*"
                                        beforeUpload={handleFotoUpload}
                                        maxCount={1}
                                        showUploadList={false}
                                    >
                                        <Button icon={<UploadOutlined />}>
                                            Subir Foto
                                        </Button>
                                    </Upload>
                                    {fotoUrl && (
                                        <Avatar size={64} src={fotoUrl} />
                                    )}
                                </div>
                            </Form.Item>

                            <Space>
                                <Button type="primary" htmlType="submit" loading={loading}>
                                    Crear Administrador
                                </Button>
                                <Button onClick={() => { setShowForm(false); setFotoUrl(""); }}>
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

                    {adminsList.length === 0 && !listLoading ? (
                        <Alert
                            message="No hay administradores registrados"
                            description="Crea el primer administrador usando el botón 'Nuevo Administrador'"
                            type="info"
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
                                    width: 80,
                                    render: (text, record) => {
                                        const menuItems = [
                                            {
                                                key: 'edit',
                                                label: 'Editar Perfil',
                                                icon: <EditOutlined />,
                                                onClick: () => abrirModalEditar(record),
                                            },
                                            {
                                                key: 'delete',
                                                label: 'Eliminar',
                                                icon: <DeleteOutlined />,
                                                danger: true,
                                                onClick: () => {
                                                    modal.confirm({
                                                        title: 'Eliminar administrador',
                                                        content: '¿Estás seguro de que deseas eliminar este administrador?',
                                                        okText: 'Sí, eliminar',
                                                        cancelText: 'Cancelar',
                                                        okButtonProps: { danger: true },
                                                        onOk: () => handleEliminarAdmin(record.id),
                                                    });
                                                },
                                            },
                                        ];

                                        return (
                                            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                                                <Button icon={<MoreOutlined />} size="small" />
                                            </Dropdown>
                                        );
                                    }
                                }
                            ]}
                        />
                    )}
                </Spin>

                {/* MODAL DE EDICIÓN */}
                <Modal
                    title={<span><EditOutlined /> Editar Administrador</span>}
                    open={editModalVisible}
                    onCancel={() => {
                        setEditModalVisible(false);
                        editForm.resetFields();
                        setEditingAdmin(null);
                        setPermisos({});
                        setFotoEditUrl("");
                    }}
                    footer={null}
                    width={800}
                >
                    <Form
                        form={editForm}
                        layout="vertical"
                        onFinish={handleGuardarEdicion}
                    >
                        <Divider>Información Personal</Divider>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Nombre Completo"
                                    name="nombre_completo"
                                    rules={[{ required: true, message: 'Requerido' }]}
                                >
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Cédula"
                                    name="identificacion"
                                    rules={[{ required: true, message: 'Requerido' }]}
                                >
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    label="Email"
                                    name="email"
                                    rules={[
                                        { required: true, message: 'Requerido' },
                                        { type: 'email', message: 'Email inválido' }
                                    ]}
                                >
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    label="Teléfono"
                                    name="telefono"
                                >
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item
                            label="Dirección"
                            name="direccion"
                        >
                            <Input />
                        </Form.Item>

                        <Form.Item
                            label="Observaciones"
                            name="observaciones"
                        >
                            <Input.TextArea rows={2} />
                        </Form.Item>

                        <Divider>📷 Foto de Perfil</Divider>
                        <Form.Item label=" ">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <Upload
                                    accept="image/*"
                                    beforeUpload={handleFotoEditUpload}
                                    maxCount={1}
                                    showUploadList={false}
                                >
                                    <Button icon={<UploadOutlined />}>
                                        Cambiar Foto
                                    </Button>
                                </Upload>
                                {fotoEditUrl && (
                                    <Avatar size={64} src={fotoEditUrl} />
                                )}
                            </div>
                        </Form.Item>

                        <Divider><LockOutlined /> Permisos de Acceso</Divider>
                        <Alert
                            message={`Selecciona los módulos a los que este usuario tendrá acceso (${editingAdmin?.rol === 'secretaria' ? 'Secretaria' : 'Administrador'})`}
                            type="info"
                            style={{ marginBottom: 16 }}
                            showIcon
                        />

                        <Row gutter={[16, 16]}>
                            {MODULOS_DISPONIBLES.map((modulo) => (
                                <Col span={12} key={modulo.key}>
                                    <Checkbox
                                        checked={permisos[modulo.key] || false}
                                        onChange={(e) => handlePermisoChange(modulo.key, e.target.checked)}
                                    >
                                        <Tag color={editingAdmin?.rol === 'secretaria' ? 'green' : 'blue'}>{modulo.label}</Tag>
                                    </Checkbox>
                                </Col>
                            ))}
                        </Row>

                        <Divider />

                        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                            <Space>
                                <Button type="primary" htmlType="submit" loading={loading}>
                                    Guardar Cambios
                                </Button>
                                <Button onClick={() => {
                                    setEditModalVisible(false);
                                    editForm.resetFields();
                                    setEditingAdmin(null);
                                    setPermisos({});
                                }}>
                                    Cancelar
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Modal>
            </Card>
        </div>
    );
}
