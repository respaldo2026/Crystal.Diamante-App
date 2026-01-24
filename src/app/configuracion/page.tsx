"use client";

import React, { useState, useEffect } from "react";
import { Tabs, Card, Spin, Form, Input, Button, message, Table, Switch, Select, Modal, Tag } from "antd";
import { SettingOutlined, TeamOutlined, SaveOutlined, PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { TabPane } = Tabs;
const { TextArea } = Input;
const { Option } = Select;

interface Admin {
  id: string;
  nombre_completo: string;
  email: string;
  rol: string;
  identificacion: string;
  telefono?: string;
  created_at: string;
}

interface PermisosPorRol {
  [rol: string]: {
    [modulo: string]: boolean;
  };
}

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState("academia");

  const [loadingAcademia, setLoadingAcademia] = useState(false);
  const [loadingPermisos, setLoadingPermisos] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  const [formAcademia] = Form.useForm();
  const [permisos, setPermisos] = useState<PermisosPorRol>({});
  const [adminsList, setAdminsList] = useState<Admin[]>([]);
  
  const [savingAcademia, setSavingAcademia] = useState(false);
  const [savingPermisos, setSavingPermisos] = useState(false);
  const [hasChangesPermisos, setHasChangesPermisos] = useState(false);
  
  const [formAdmin] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);

  const modulos = [
    { key: "estudiantes", label: "Estudiantes" },
    { key: "profesores", label: "Profesores" },
    { key: "cursos", label: "Cursos/Grupos" },
    { key: "leads", label: "Leads" },
    { key: "planificador", label: "Planificador" },
    { key: "matriculas", label: "Matrículas" },
    { key: "nomina", label: "Nómina" },
    { key: "tesoreria", label: "Tesorería" },
    { key: "configuracion", label: "Configuración" },
  ];

  const roles = ["administrativo", "profesor", "estudiante"];

  useEffect(() => {
    cargarConfiguracionAcademia();
  }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    
    if (key === "permisos" && Object.keys(permisos).length === 0) {
      cargarPermisos();
    } else if (key === "administradores" && adminsList.length === 0) {
      cargarAdministradores();
    }
  };

  const cargarConfiguracionAcademia = async () => {
    setLoadingAcademia(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Config load error", error);
        return;
      }
      if (data) formAcademia.setFieldsValue(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAcademia(false);
    }
  };

  const guardarConfiguracionAcademia = async () => {
    try {
      setSavingAcademia(true);
      const values = await formAcademia.validateFields();
      const { error } = await supabaseBrowserClient
        .from("configuracion")
        .upsert({ id: 1, ...values });
      if (error) throw error;
      message.success("Configuración guardada");
    } catch (error: any) {
      message.error("Error al guardar: " + error.message);
    } finally {
      setSavingAcademia(false);
    }
  };

  const cargarPermisos = async () => {
    setLoadingPermisos(true);
    try {
      const { data } = await supabaseBrowserClient.from("role_permissions").select("*");
      const permisosMap: PermisosPorRol = {};
      
      data?.forEach((row: any) => {
        permisosMap[row.rol] = row.permisos || {};
      });

      // Asegurar que existan las keys para todos los roles
      roles.forEach(rol => {
        if (!permisosMap[rol]) permisosMap[rol] = {};
      });

      setPermisos(permisosMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPermisos(false);
    }
  };

  const handleTogglePermiso = (rol: string, modulo: string, valor: boolean) => {
    setPermisos(prev => ({
      ...prev,
      [rol]: {
        ...prev[rol],
        [modulo]: valor
      }
    }));
    setHasChangesPermisos(true);
  };

  const guardarPermisos = async () => {
    try {
      setSavingPermisos(true);
      for (const rol of roles) {
        await supabaseBrowserClient
          .from("role_permissions")
          .upsert({ rol, permisos: permisos[rol] });
      }
      message.success("Permisos actualizados");
      setHasChangesPermisos(false);
    } catch (e) {
      message.error("Error al guardar permisos");
    } finally {
      setSavingPermisos(false);
    }
  };

  const cargarAdministradores = async () => {
    setLoadingAdmins(true);
    try {
      const { data } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .in("rol", ["admin", "director"])
        .order("created_at", { ascending: false });
      setAdminsList(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleOpenModalAdmin = (admin?: Admin) => {
    if (admin) {
      setEditingAdmin(admin);
      formAdmin.setFieldsValue(admin);
    } else {
      setEditingAdmin(null);
      formAdmin.resetFields();
    }
    setModalVisible(true);
  };

  const handleCloseModalAdmin = () => {
    setModalVisible(false);
    setEditingAdmin(null);
    formAdmin.resetFields();
  };

  const handleSubmitAdmin = async () => {
    try {
      setSubmittingAdmin(true);
      const values = await formAdmin.validateFields();

      if (editingAdmin) {
        const { error } = await supabaseBrowserClient
          .from("perfiles")
          .update({
            nombre_completo: values.nombre_completo,
            identificacion: values.identificacion,
            telefono: values.telefono,
            rol: values.rol,
            email: values.email // opcional si se permite cambiar email
          })
          .eq("id", editingAdmin.id);
        if (error) throw error;
        message.success("Administrador actualizado");
      } else {
        const { error } = await supabaseBrowserClient.auth.signUp({
            email: values.email,
            password: values.password,
            options: {
                data: {
                    nombre_completo: values.nombre_completo,
                    rol: values.rol,
                    identificacion: values.identificacion,
                    telefono: values.telefono
                }
            }
        });
        if (error) throw error;
        message.success("Administrador creado");
      }
      handleCloseModalAdmin();
      cargarAdministradores();
    } catch (error: any) {
      message.error("Error: " + error.message);
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const handleDeleteAdmin = (admin: Admin) => {
    Modal.confirm({
      title: "¿Eliminar administrador?",
      content: `Se eliminará a ${admin.nombre_completo}`,
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
            const { error } = await supabaseBrowserClient.from("perfiles").delete().eq("id", admin.id);
            if(error) throw error;
            message.success("Eliminado");
            cargarAdministradores();
        } catch(e: any) {
            message.error(e.message);
        }
      }
    });
  };

  const permisosColumns = [
    { title: "Módulo", dataIndex: "modulo", key: "modulo", fixed: "left" as const, width: 150 },
    ...roles.map(rol => ({
      title: rol.charAt(0).toUpperCase() + rol.slice(1),
      dataIndex: rol,
      key: rol,
      width: 120,
      render: (_: any, record: any) => (
         <Switch 
            checked={permisos[rol]?.[record.key] || false}
            onChange={(val) => handleTogglePermiso(rol, record.key, val)}
            disabled={savingPermisos}
         />
      )
    }))
  ];

  const adminColumns = [
    { title: "Nombre", dataIndex: "nombre_completo", key: "name", render: (t:string)=><span><UserOutlined/> {t}</span>},
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Rol", dataIndex: "rol", key: "rol", render: (rol:string)=><Tag color={rol==='admin'?'gold':'blue'}>{rol}</Tag> },
    { title: "Acciones", key: "actions", render: (_:any, r:Admin) => (
        <>
            <Button size="small" icon={<EditOutlined/>} onClick={()=>handleOpenModalAdmin(r)} style={{marginRight: 8}}/>
            <Button size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDeleteAdmin(r)}/>
        </>
    )}
  ];

  const permisosData = modulos.map(m => ({ key: m.key, modulo: m.label }));

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Configuración del Sistema</h2>
      <Card>
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          
          <TabPane tab={<span><SettingOutlined /> Academia</span>} key="academia">
             <Spin spinning={loadingAcademia}>
                <Form form={formAcademia} layout="vertical">
                    <Form.Item label="Nombre Academia" name="nombre_academia"><Input/></Form.Item>
                    <Form.Item label="Dirección" name="direccion"><TextArea rows={2}/></Form.Item>
                    <Form.Item label="Teléfono" name="telefono"><Input/></Form.Item>
                    <Form.Item label="Email" name="email"><Input/></Form.Item>
                    <Form.Item>
                        <Button type="primary" icon={<SaveOutlined/>} loading={savingAcademia} onClick={guardarConfiguracionAcademia}>
                            Guardar
                        </Button>
                    </Form.Item>
                </Form>
             </Spin>
          </TabPane>

          <TabPane tab={<span><TeamOutlined /> Permisos</span>} key="permisos">
             <Spin spinning={loadingPermisos}>
                <div style={{marginBottom: 16, display:'flex', justifyContent:'space-between'}}>
                    <h3>Matriz de Permisos</h3>
                    {hasChangesPermisos && (
                        <Button type="primary" icon={<SaveOutlined/>} onClick={guardarPermisos} loading={savingPermisos}>Guardar Cambios</Button>
                    )}
                </div>
                <Table dataSource={permisosData} columns={permisosColumns} pagination={false} scroll={{x: 800}} bordered />
             </Spin>
          </TabPane>

          <TabPane tab={<span><UserOutlined /> Administradores</span>} key="administradores">
             <Spin spinning={loadingAdmins}>
                <div style={{marginBottom: 16, textAlign:'right'}}>
                    <Button type="primary" icon={<PlusOutlined/>} onClick={()=>handleOpenModalAdmin()}>Nuevo Admin</Button>
                </div>
                <Table dataSource={adminsList} columns={adminColumns} rowKey="id" />
             </Spin>
          </TabPane>

        </Tabs>
      </Card>

      <Modal 
        title={editingAdmin ? "Editar Admin" : "Nuevo Admin"}
        open={modalVisible}
        onCancel={handleCloseModalAdmin}
        onOk={handleSubmitAdmin}
        confirmLoading={submittingAdmin}
      >
        <Form form={formAdmin} layout="vertical">
            <Form.Item label="Nombre" name="nombre_completo" rules={[{required:true}]}><Input/></Form.Item>
            <Form.Item label="Email" name="email" rules={[{required:true, type:'email'}]}><Input/></Form.Item>
            {!editingAdmin && (
                <Form.Item label="Contraseña" name="password" rules={[{required:true, min:6}]}><Input.Password/></Form.Item>
            )}
            <Form.Item label="Identificación" name="identificacion"><Input/></Form.Item>
            <Form.Item label="Teléfono" name="telefono"><Input/></Form.Item>
            <Form.Item label="Rol" name="rol" rules={[{required:true}]}>
                <Select>
                    <Option value="admin">Administrador</Option>
                    <Option value="director">Director</Option>
                </Select>
            </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}