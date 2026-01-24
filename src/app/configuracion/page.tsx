"use client";

import React, { useState, useEffect } from "react";
import { Tabs, Card, Spin, Form, Input, Button, message, Table, Switch, Select, Modal, Tag, Divider } from "antd";
import { SettingOutlined, TeamOutlined, SaveOutlined, PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, CreditCardOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { TabPane } = Tabs;
const { TextArea } = Input;
const { Option } = Select;

// Interfaces
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

interface MedioPago {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  detalles?: any;
  created_at?: string;
}

interface PlantillaWhatsApp {
  id: string;
  nombre: string;
  tipo: string;
  mensaje: string;
  activo: boolean;
  created_at?: string;
}

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState("academia");
  const [initialized, setInitialized] = useState(false);

  // Estados para Academia
  const [formAcademia] = Form.useForm();
  const [loadingAcademia, setLoadingAcademia] = useState(false);
  const [savingAcademia, setSavingAcademia] = useState(false);
  // const [logoFileList, setLogoFileList] = useState<UploadFile[]>([]);

  // Estados para Permisos
  const [permisos, setPermisos] = useState<PermisosPorRol>({});
  const [loadingPermisos, setLoadingPermisos] = useState(false);
  const [savingPermisos, setSavingPermisos] = useState(false);
  const [hasChangesPermisos, setHasChangesPermisos] = useState(false);

  // Estados para Administradores
  const [formAdmin] = Form.useForm();
  const [adminsList, setAdminsList] = useState<Admin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [modalAdminVisible, setModalAdminVisible] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);

  // Estados para Medios de Pago
  const [formMedioPago] = Form.useForm();
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);
  const [loadingMediosPago, setLoadingMediosPago] = useState(false);
  const [modalMedioPagoVisible, setModalMedioPagoVisible] = useState(false);
  const [editingMedioPago, setEditingMedioPago] = useState<MedioPago | null>(null);
  const [submittingMedioPago, setSubmittingMedioPago] = useState(false);

  // Estados para Plantillas WhatsApp
  const [formPlantilla] = Form.useForm();
  const [plantillasWhatsApp, setPlantillasWhatsApp] = useState<PlantillaWhatsApp[]>([]);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [modalPlantillaVisible, setModalPlantillaVisible] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState<PlantillaWhatsApp | null>(null);
  const [submittingPlantilla, setSubmittingPlantilla] = useState(false);

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
    if (!initialized) {
      setInitialized(true);
      cargarConfiguracionAcademia();
    }
  }, [initialized]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === "permisos" && Object.keys(permisos).length === 0) {
      cargarPermisos();
    } else if (key === "administradores" && adminsList.length === 0) {
      cargarAdministradores();
    } else if (key === "medios-pago" && mediosPago.length === 0) {
      cargarMediosPago();
    } else if (key === "plantillas-whatsapp" && plantillasWhatsApp.length === 0) {
      cargarPlantillasWhatsApp();
    }
  };

  // ==================== FUNCIONES ACADEMIA ====================
  const cargarConfiguracionAcademia = async () => {
    setLoadingAcademia(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Config error:", error);
        return;
      }

      if (data) {
        formAcademia.setFieldsValue(data);
        // if (data.logo_url) {
        //   setLogoFileList([{
        //     uid: '-1',
        //     name: 'logo.png',
        //     status: 'done',
        //     url: data.logo_url,
        //   }]);
        // }
      }
    } catch (error) {
      console.error("Load config error:", error);
    } finally {
      setLoadingAcademia(false);
    }
  };

  const guardarConfiguracionAcademia = async () => {
    try {
      const values = await formAcademia.validateFields();
      setSavingAcademia(true);

      const { error } = await supabaseBrowserClient
        .from("configuracion")
        .upsert({ id: 1, ...values });

      if (error) throw error;

      message.success("Configuración guardada correctamente");
    } catch (error: any) {
      message.error("Error al guardar: " + error.message);
    } finally {
      setSavingAcademia(false);
    }
  };

  // ==================== FUNCIONES PERMISOS ====================
  const cargarPermisos = async () => {
    setLoadingPermisos(true);
    try {
      const { data } = await supabaseBrowserClient.from("role_permissions").select("*");
      const permisosMap: PermisosPorRol = {};
      
      data?.forEach((row: any) => {
        permisosMap[row.rol] = row.permisos || {};
      });

      roles.forEach(rol => {
        if (!permisosMap[rol]) permisosMap[rol] = {};
      });

      setPermisos(permisosMap);
    } catch (error) {
      console.error(error);
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
      message.success("Permisos actualizados correctamente");
      setHasChangesPermisos(false);
    } catch (error) {
      message.error("Error al guardar permisos");
    } finally {
      setSavingPermisos(false);
    }
  };

  // ==================== FUNCIONES ADMINISTRADORES ====================
  const cargarAdministradores = async () => {
    setLoadingAdmins(true);
    try {
      const { data } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .in("rol", ["admin", "director"])
        .order("created_at", { ascending: false });
      setAdminsList(data || []);
    } catch (error) {
      console.error(error);
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
    setModalAdminVisible(true);
  };

  const handleSubmitAdmin = async () => {
    try {
      setSubmittingAdmin(true);
      const values = await formAdmin.validateFields();

      if (editingAdmin) {
        await supabaseBrowserClient
          .from("perfiles")
          .update(values)
          .eq("id", editingAdmin.id);
        message.success("Administrador actualizado");
      } else {
        await supabaseBrowserClient.auth.signUp({
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
        message.success("Administrador creado");
      }
      setModalAdminVisible(false);
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
          await supabaseBrowserClient.from("perfiles").delete().eq("id", admin.id);
          message.success("Eliminado");
          cargarAdministradores();
        } catch (e: any) {
          message.error(e.message);
        }
      }
    });
  };

  // ==================== FUNCIONES MEDIOS DE PAGO ====================
  const cargarMediosPago = async () => {
    setLoadingMediosPago(true);
    try {
      const { data } = await supabaseBrowserClient
        .from("medios_pago")
        .select("*")
        .order("nombre", { ascending: true });
      setMediosPago(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMediosPago(false);
    }
  };

  const handleOpenModalMedioPago = (medio?: MedioPago) => {
    if (medio) {
      setEditingMedioPago(medio);
      formMedioPago.setFieldsValue(medio);
    } else {
      setEditingMedioPago(null);
      formMedioPago.resetFields();
      formMedioPago.setFieldsValue({ activo: true });
    }
    setModalMedioPagoVisible(true);
  };

  const handleSubmitMedioPago = async () => {
    try {
      setSubmittingMedioPago(true);
      const values = await formMedioPago.validateFields();

      if (editingMedioPago) {
        await supabaseBrowserClient
          .from("medios_pago")
          .update(values)
          .eq("id", editingMedioPago.id);
        message.success("Medio de pago actualizado");
      } else {
        await supabaseBrowserClient
          .from("medios_pago")
          .insert(values);
        message.success("Medio de pago creado");
      }
      setModalMedioPagoVisible(false);
      cargarMediosPago();
    } catch (error: any) {
      message.error("Error: " + error.message);
    } finally {
      setSubmittingMedioPago(false);
    }
  };

  const handleDeleteMedioPago = (medio: MedioPago) => {
    Modal.confirm({
      title: "¿Eliminar medio de pago?",
      content: `Se eliminará ${medio.nombre}`,
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          await supabaseBrowserClient.from("medios_pago").delete().eq("id", medio.id);
          message.success("Eliminado");
          cargarMediosPago();
        } catch (e: any) {
          message.error(e.message);
        }
      }
    });
  };

  // ==================== FUNCIONES PLANTILLAS WHATSAPP ====================
  const cargarPlantillasWhatsApp = async () => {
    setLoadingPlantillas(true);
    try {
      const { data } = await supabaseBrowserClient
        .from("plantillas_whatsapp")
        .select("*")
        .order("nombre", { ascending: true });
      setPlantillasWhatsApp(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingPlantillas(false);
    }
  };

  const handleOpenModalPlantilla = (plantilla?: PlantillaWhatsApp) => {
    if (plantilla) {
      setEditingPlantilla(plantilla);
      formPlantilla.setFieldsValue(plantilla);
    } else {
      setEditingPlantilla(null);
      formPlantilla.resetFields();
      formPlantilla.setFieldsValue({ activo: true });
    }
    setModalPlantillaVisible(true);
  };

  const handleSubmitPlantilla = async () => {
    try {
      setSubmittingPlantilla(true);
      const values = await formPlantilla.validateFields();

      if (editingPlantilla) {
        await supabaseBrowserClient
          .from("plantillas_whatsapp")
          .update(values)
          .eq("id", editingPlantilla.id);
        message.success("Plantilla actualizada");
      } else {
        await supabaseBrowserClient
          .from("plantillas_whatsapp")
          .insert(values);
        message.success("Plantilla creada");
      }
      setModalPlantillaVisible(false);
      cargarPlantillasWhatsApp();
    } catch (error: any) {
      message.error("Error: " + error.message);
    } finally {
      setSubmittingPlantilla(false);
    }
  };

  const handleDeletePlantilla = (plantilla: PlantillaWhatsApp) => {
    Modal.confirm({
      title: "¿Eliminar plantilla?",
      content: `Se eliminará ${plantilla.nombre}`,
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          await supabaseBrowserClient.from("plantillas_whatsapp").delete().eq("id", plantilla.id);
          message.success("Eliminado");
          cargarPlantillasWhatsApp();
        } catch (e: any) {
          message.error(e.message);
        }
      }
    });
  };

  // Columnas para las tablas
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
    { title: "Nombre", dataIndex: "nombre_completo", key: "name", render: (t: string) => <span><UserOutlined /> {t}</span> },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Identificación", dataIndex: "identificacion", key: "identificacion" },
    { title: "Teléfono", dataIndex: "telefono", key: "telefono", render: (t: string) => t || "-" },
    { title: "Rol", dataIndex: "rol", key: "rol", render: (rol: string) => <Tag color={rol === 'admin' ? 'gold' : 'blue'}>{rol}</Tag> },
    {
      title: "Acciones", key: "actions", render: (_: any, r: Admin) => (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModalAdmin(r)} style={{ marginRight: 8 }} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteAdmin(r)} />
        </>
      )
    }
  ];

  const mediosPagoColumns = [
    { title: "Nombre", dataIndex: "nombre", key: "nombre" },
    { title: "Tipo", dataIndex: "tipo", key: "tipo" },
    {
      title: "Estado",
      dataIndex: "activo",
      key: "activo",
      render: (activo: boolean) => <Tag color={activo ? "green" : "red"}>{activo ? "Activo" : "Inactivo"}</Tag>
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_: any, record: MedioPago) => (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModalMedioPago(record)} style={{ marginRight: 8 }} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteMedioPago(record)} />
        </>
      )
    }
  ];

  const plantillasColumns = [
    { title: "Nombre", dataIndex: "nombre", key: "nombre" },
    { title: "Tipo", dataIndex: "tipo", key: "tipo" },
    {
      title: "Estado",
      dataIndex: "activo",
      key: "activo",
      render: (activo: boolean) => <Tag color={activo ? "green" : "red"}>{activo ? "Activo" : "Inactivo"}</Tag>
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_: any, record: PlantillaWhatsApp) => (
        <>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModalPlantilla(record)} style={{ marginRight: 8 }} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePlantilla(record)} />
        </>
      )
    }
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
                <Divider orientation="left">Información General</Divider>
                <Form.Item label="Nombre de la Academia" name="nombre_academia" rules={[{ required: true }]}>
                  <Input placeholder="Academia Crystal" />
                </Form.Item>
                <Form.Item label="RUC / NIT" name="ruc">
                  <Input placeholder="1234567890001" />
                </Form.Item>
                <Form.Item label="Dirección" name="direccion">
                  <TextArea rows={2} placeholder="Dirección completa de la academia" />
                </Form.Item>
                <Form.Item label="Teléfono" name="telefono">
                  <Input placeholder="0987654321" />
                </Form.Item>
                <Form.Item label="Email" name="email" rules={[{ type: 'email' }]}>
                  <Input placeholder="info@academiacrystal.com" />
                </Form.Item>
                <Form.Item label="Sitio Web" name="sitio_web">
                  <Input placeholder="https://www.academiacrystal.com" />
                </Form.Item>

                <Divider orientation="left">Información Financiera</Divider>
                <Form.Item label="Moneda" name="moneda">
                  <Select placeholder="Seleccionar moneda">
                    <Option value="USD">Dólar (USD)</Option>
                    <Option value="EUR">Euro (EUR)</Option>
                    <Option value="COP">Peso Colombiano (COP)</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Impuesto (%)" name="impuesto">
                  <Input type="number" placeholder="19" />
                </Form.Item>

                <Divider orientation="left">Configuración de Pagos</Divider>
                <Form.Item label="Días de gracia para pagos" name="dias_gracia_pago">
                  <Input type="number" placeholder="5" />
                </Form.Item>
                <Form.Item label="Mora por día (%)" name="mora_por_dia">
                  <Input type="number" placeholder="2" />
                </Form.Item>

                <Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} loading={savingAcademia} onClick={guardarConfiguracionAcademia}>
                    Guardar Configuración
                  </Button>
                </Form.Item>
              </Form>
            </Spin>
          </TabPane>

          <TabPane tab={<span><TeamOutlined /> Permisos por Rol</span>} key="permisos">
            <Spin spinning={loadingPermisos}>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <h3>Matriz de Permisos por Rol</h3>
                {hasChangesPermisos && (
                  <Button type="primary" icon={<SaveOutlined />} onClick={guardarPermisos} loading={savingPermisos}>
                    Guardar Cambios
                  </Button>
                )}
              </div>
              <Table dataSource={permisosData} columns={permisosColumns} pagination={false} scroll={{ x: 800 }} bordered />
            </Spin>
          </TabPane>

          <TabPane tab={<span><UserOutlined /> Administradores</span>} key="administradores">
            <Spin spinning={loadingAdmins}>
              <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModalAdmin()}>
                  Nuevo Administrador
                </Button>
              </div>
              <Table dataSource={adminsList} columns={adminColumns} rowKey="id" />
            </Spin>
          </TabPane>

          <TabPane tab={<span><CreditCardOutlined /> Medios de Pago</span>} key="medios-pago">
            <Spin spinning={loadingMediosPago}>
              <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModalMedioPago()}>
                  Nuevo Medio de Pago
                </Button>
              </div>
              <Table dataSource={mediosPago} columns={mediosPagoColumns} rowKey="id" />
            </Spin>
          </TabPane>

          <TabPane tab={<span><WhatsAppOutlined /> Plantillas WhatsApp</span>} key="plantillas-whatsapp">
            <Spin spinning={loadingPlantillas}>
              <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModalPlantilla()}>
                  Nueva Plantilla
                </Button>
              </div>
              <Table dataSource={plantillasWhatsApp} columns={plantillasColumns} rowKey="id" />
            </Spin>
          </TabPane>

        </Tabs>
      </Card>

      {/* Modal Administradores */}
      <Modal
        title={editingAdmin ? "Editar Administrador" : "Nuevo Administrador"}
        open={modalAdminVisible}
        onCancel={() => setModalAdminVisible(false)}
        onOk={handleSubmitAdmin}
        confirmLoading={submittingAdmin}
      >
        <Form form={formAdmin} layout="vertical">
          <Form.Item label="Nombre Completo" name="nombre_completo" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
            <Input disabled={!!editingAdmin} />
          </Form.Item>
          {!editingAdmin && (
            <Form.Item label="Contraseña" name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item label="Identificación" name="identificacion" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Teléfono" name="telefono">
            <Input />
          </Form.Item>
          <Form.Item label="Rol" name="rol" rules={[{ required: true }]}>
            <Select>
              <Option value="admin">Administrador</Option>
              <Option value="director">Director</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Medios de Pago */}
      <Modal
        title={editingMedioPago ? "Editar Medio de Pago" : "Nuevo Medio de Pago"}
        open={modalMedioPagoVisible}
        onCancel={() => setModalMedioPagoVisible(false)}
        onOk={handleSubmitMedioPago}
        confirmLoading={submittingMedioPago}
      >
        <Form form={formMedioPago} layout="vertical">
          <Form.Item label="Nombre" name="nombre" rules={[{ required: true }]}>
            <Input placeholder="Ej: Efectivo, Transferencia Bancolombia" />
          </Form.Item>
          <Form.Item label="Tipo" name="tipo" rules={[{ required: true }]}>
            <Select>
              <Option value="efectivo">Efectivo</Option>
              <Option value="transferencia">Transferencia Bancaria</Option>
              <Option value="tarjeta">Tarjeta de Crédito/Débito</Option>
              <Option value="datafono">Datáfono</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Activo" name="activo" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Plantillas WhatsApp */}
      <Modal
        title={editingPlantilla ? "Editar Plantilla" : "Nueva Plantilla WhatsApp"}
        open={modalPlantillaVisible}
        onCancel={() => setModalPlantillaVisible(false)}
        onOk={handleSubmitPlantilla}
        confirmLoading={submittingPlantilla}
        width={600}
      >
        <Form form={formPlantilla} layout="vertical">
          <Form.Item label="Nombre de la Plantilla" name="nombre" rules={[{ required: true }]}>
            <Input placeholder="Ej: Recordatorio de pago" />
          </Form.Item>
          <Form.Item label="Tipo" name="tipo" rules={[{ required: true }]}>
            <Select placeholder="Selecciona un tipo">
              <Option value="recordatorio">Recordatorio</Option>
              <Option value="bienvenida">Bienvenida</Option>
              <Option value="informativo">Informativo</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Mensaje" name="mensaje" rules={[{ required: true }]}>
            <TextArea rows={6} placeholder="Escribe el mensaje de la plantilla" />
          </Form.Item>
          <Form.Item label="Activo" name="activo" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
}