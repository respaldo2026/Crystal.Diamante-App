"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, Card, Row, Col, Divider, Spin, Tabs, Checkbox, Tag, Empty, Table, Modal, Space, Switch, Tooltip, App } from "antd";
import { 
  SaveOutlined, ShopOutlined, InstagramOutlined, 
  GlobalOutlined, PhoneOutlined, SafetyCertificateOutlined,
  LockOutlined, MessageOutlined, PlusOutlined, EditOutlined, DeleteOutlined, InfoCircleOutlined,
  DollarOutlined, SortAscendingOutlined, UserAddOutlined
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useRolesPermissions } from "@contexts/roles-permissions-context";
import { ROLES_DISPONIBLES, MODULOS_DISPONIBLES } from "@hooks/useRolePermissions";
import dynamic from "next/dynamic";

// Importar la página de administradores de forma dinámica
const AdministradoresContent = dynamic(() => import("./administradores/page"), {
  ssr: false,
  loading: () => <Spin size="large" style={{ display: 'block', margin: '50px auto' }} />
});

export default function ConfiguracionPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { permisos, loading: permisosLoading, guardarPermisos } = useRolesPermissions();
  const [tab, setTab] = useState("academia");

  // Estados para plantillas WhatsApp
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [modalPlantilla, setModalPlantilla] = useState(false);
  const [plantillaEditando, setPlantillaEditando] = useState<any>(null);
  const [formPlantilla] = Form.useForm();

  // Estados para medios de pago
  const [mediosPago, setMediosPago] = useState<any[]>([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [modalMedio, setModalMedio] = useState(false);
  const [medioEditando, setMedioEditando] = useState<any>(null);
  const [formMedio] = Form.useForm();

  // 1. Cargar la configuración actual
  useEffect(() => {
    cargarConfiguracion();
    cargarPlantillas();
    cargarMediosPago();
  }, [cargarConfiguracion, cargarPlantillas, cargarMediosPago]);

  const cargarConfiguracion = async () => {
    setLoading(true);
    try {
        // Traemos el primer registro que encontremos
        const { data, error } = await supabaseBrowserClient
            .from("configuracion")
            .select("*")
            .limit(1)
            .single();

        if (data) {
            setConfigId(data.id);
            form.setFieldsValue(data);
        }
    } catch (error) {
        // Si no hay datos, no es un error grave, simplemente el form estará vacío
        console.log("Aún no hay configuración guardada.");
    } finally {
        setLoading(false);
    }
  };

  // Cargar plantillas WhatsApp
  const cargarPlantillas = async () => {
    setLoadingPlantillas(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("plantillas_whatsapp")
        .select("*")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setPlantillas(data || []);
    } catch (error: any) {
      message.error("Error cargando plantillas: " + error.message);
    } finally {
      setLoadingPlantillas(false);
    }
  };

  // Abrir modal para crear/editar plantilla
  const abrirModalPlantilla = (plantilla?: any) => {
    if (plantilla) {
      setPlantillaEditando(plantilla);
      formPlantilla.setFieldsValue({
        ...plantilla,
        variables: plantilla.variables?.join(", ") || ""
      });
    } else {
      setPlantillaEditando(null);
      formPlantilla.resetFields();
    }
    setModalPlantilla(true);
  };

  // Guardar plantilla (crear o editar)
  const guardarPlantilla = async (values: any) => {
    try {
      const variables = values.variables 
        ? values.variables.split(",").map((v: string) => v.trim()).filter(Boolean)
        : [];

      const payload = {
        nombre: values.nombre,
        descripcion: values.descripcion,
        plantilla: values.plantilla,
        variables: variables,
        activa: values.activa ?? true
      };

      if (plantillaEditando) {
        // Actualizar
        const { error } = await supabaseBrowserClient
          .from("plantillas_whatsapp")
          .update(payload)
          .eq("id", plantillaEditando.id);
        
        if (error) throw error;
        message.success("Plantilla actualizada");
      } else {
        // Crear
        const { error } = await supabaseBrowserClient
          .from("plantillas_whatsapp")
          .insert(payload);
        
        if (error) throw error;
        message.success("Plantilla creada");
      }

      setModalPlantilla(false);
      cargarPlantillas();
      formPlantilla.resetFields();
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  // Eliminar plantilla
  const eliminarPlantilla = async (id: number) => {
    Modal.confirm({
      title: "¿Eliminar plantilla?",
      content: "Esta acción no se puede deshacer",
      okText: "Eliminar",
      okType: "danger",
      cancelText: "Cancelar",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("plantillas_whatsapp")
            .delete()
            .eq("id", id);
          
          if (error) throw error;
          message.success("Plantilla eliminada");
          cargarPlantillas();
        } catch (error: any) {
          message.error("Error: " + error.message);
        }
      }
    });
  };

  // Cambiar estado activo/inactivo
  const toggleActivaPlantilla = async (id: number, activa: boolean) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("plantillas_whatsapp")
        .update({ activa })
        .eq("id", id);
      
      if (error) throw error;
      message.success(`Plantilla ${activa ? "activada" : "desactivada"}`);
      cargarPlantillas();
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  // ========================================
  // FUNCIONES PARA MEDIOS DE PAGO
  // ========================================

  const cargarMediosPago = async () => {
    setLoadingMedios(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("medios_pago")
        .select("*")
        .order("orden", { ascending: true });

      if (error) throw error;
      setMediosPago(data || []);
    } catch (error: any) {
      message.error("Error cargando medios de pago: " + error.message);
    } finally {
      setLoadingMedios(false);
    }
  };

  const abrirModalMedio = (medio?: any) => {
    if (medio) {
      setMedioEditando(medio);
      formMedio.setFieldsValue(medio);
    } else {
      setMedioEditando(null);
      formMedio.resetFields();
      formMedio.setFieldsValue({ activo: true, orden: (mediosPago.length + 1) * 10 });
    }
    setModalMedio(true);
  };

  const guardarMedio = async (values: any) => {
    try {
      const payload = {
        nombre: values.nombre,
        codigo: values.codigo?.toLowerCase().trim(),
        descripcion: values.descripcion,
        icono: values.icono,
        activo: values.activo ?? true,
        orden: values.orden || 0
      };

      if (medioEditando) {
        const { error } = await supabaseBrowserClient
          .from("medios_pago")
          .update(payload)
          .eq("id", medioEditando.id);
        
        if (error) throw error;
        message.success("Medio de pago actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("medios_pago")
          .insert(payload);
        
        if (error) throw error;
        message.success("Medio de pago creado");
      }

      setModalMedio(false);
      cargarMediosPago();
      formMedio.resetFields();
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  const eliminarMedio = async (id: number) => {
    Modal.confirm({
      title: "¿Eliminar medio de pago?",
      content: "Los pagos existentes con este medio se mantendrán",
      okText: "Eliminar",
      okType: "danger",
      cancelText: "Cancelar",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("medios_pago")
            .delete()
            .eq("id", id);
          
          if (error) throw error;
          message.success("Medio de pago eliminado");
          cargarMediosPago();
        } catch (error: any) {
          message.error("Error: " + error.message);
        }
      }
    });
  };

  const toggleActivoMedio = async (id: number, activo: boolean) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("medios_pago")
        .update({ activo })
        .eq("id", id);
      
      if (error) throw error;
      message.success(`Medio ${activo ? "activado" : "desactivado"}`);
      cargarMediosPago();
    } catch (error: any) {
      message.error("Error: " + error.message);
    }
  };

  // 2. Guardar cambios de configuración general
  const onFinish = async (values: any) => {
    setGuardando(true);
    try {
        let error;
        
        if (configId) {
            // Actualizar existente
            const response = await supabaseBrowserClient
                .from("configuracion")
                .update(values)
                .eq("id", configId);
            error = response.error;
        } else {
            // Crear si no existía
            const response = await supabaseBrowserClient
                .from("configuracion")
                .insert(values)
                .select()
                .single();
            if (response.data) setConfigId(response.data.id);
            error = response.error;
        }

        if (error) throw error;
        message.success("¡Datos de la academia actualizados!");

    } catch (error: any) {
        message.error("Error al guardar: " + error.message);
    } finally {
        setGuardando(false);
    }
  };

  // 3. Guardar permisos por rol
  const handlePermisosChange = async (rol: string, modulo: string, value: boolean) => {
    const permisosActuales = permisos[rol] || {};
    const nuevoPermisos = {
      ...permisosActuales,
      [modulo]: value
    };
    
    const resultado = await guardarPermisos(rol, nuevoPermisos);
    if (resultado.success) {
      message.success(`Permiso actualizado para ${rol}`);
    } else {
      message.error(`Error: ${resultado.error}`);
    }
  };

  if (loading || permisosLoading) return <div style={{padding: 50, textAlign: 'center'}}><Spin size="large" /></div>;

  // Columnas para tabla de medios de pago
  const columnasMediosPago = [
    {
      title: "Orden",
      dataIndex: "orden",
      key: "orden",
      width: 80,
      render: (orden: number) => <Tag icon={<SortAscendingOutlined />}>{orden}</Tag>
    },
    {
      title: "Nombre",
      dataIndex: "nombre",
      key: "nombre",
      render: (text: string) => <Tag color="green">{text}</Tag>
    },
    {
      title: "Código",
      dataIndex: "codigo",
      key: "codigo",
      render: (text: string) => <code style={{ fontSize: 12, background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>{text}</code>
    },
    {
      title: "Descripción",
      dataIndex: "descripcion",
      key: "descripcion",
    },
    {
      title: "Activo",
      dataIndex: "activo",
      key: "activo",
      width: 80,
      render: (activo: boolean, record: any) => (
        <Switch 
          checked={activo}
          onChange={(checked) => toggleActivoMedio(record.id, checked)}
        />
      )
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => abrirModalMedio(record)}
          />
          <Button 
            type="link" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => eliminarMedio(record.id)}
          />
        </Space>
      )
    }
  ];

  // Columnas para tabla de plantillas
  const columnasPlantillas = [
    {
      title: "Nombre",
      dataIndex: "nombre",
      key: "nombre",
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: "Descripción",
      dataIndex: "descripcion",
      key: "descripcion",
    },
    {
      title: "Plantilla",
      dataIndex: "plantilla",
      key: "plantilla",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12, color: "#666" }}>
            {text.length > 80 ? text.substring(0, 80) + "..." : text}
          </span>
        </Tooltip>
      )
    },
    {
      title: "Variables",
      dataIndex: "variables",
      key: "variables",
      render: (vars: string[]) => (
        <Space size={4} wrap>
          {vars?.map((v: string, i: number) => (
            <Tag key={i} color="purple" style={{ fontSize: 11 }}>
              {`{{${v}}}`}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "Activa",
      dataIndex: "activa",
      key: "activa",
      width: 80,
      render: (activa: boolean, record: any) => (
        <Switch 
          checked={activa}
          onChange={(checked) => toggleActivaPlantilla(record.id, checked)}
        />
      )
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => abrirModalPlantilla(record)}
          />
          <Button 
            type="link" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => eliminarPlantilla(record.id)}
          />
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Tabs 
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "academia",
            label: "Datos de la Academia",
            children: (
              <Card 
                title={<span><ShopOutlined /> Configuración de la Academia</span>}
                extra={
                    <Button type="primary" icon={<SaveOutlined />} onClick={form.submit} loading={guardando}>
                        Guardar Cambios
                    </Button>
                }
              >
                <Form form={form} layout="vertical" onFinish={onFinish}>
                    
                    {/* SECCIÓN 1: DATOS LEGALES */}
                    <Divider orientation="left" style={{borderColor: '#722ed1'}}>
                        <SafetyCertificateOutlined /> Información Legal
                    </Divider>
                    <Row gutter={24}>
                        <Col xs={24} md={12}>
                            <Form.Item label="Nombre de la Academia" name="nombre_academia" rules={[{required: true}]}>
                                <Input size="large" placeholder="Ej: Academia Crystal Diamante" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item label="NIT / Documento Tributario" name="nit">
                                <Input placeholder="Ej: 900.123.456-7" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={24}>
                        <Col xs={24} md={12}>
                            <Form.Item label="Dirección Física" name="direccion">
                                <Input placeholder="Ej: Calle 5 # 40-12, Cali" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item label="Ciudad / País" name="ciudad">
                                <Input placeholder="Ej: Cali, Colombia" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* SECCIÓN 2: CONTACTO Y REDES */}
                    <Divider orientation="left" style={{borderColor: '#722ed1'}}>
                        <PhoneOutlined /> Contacto y Redes
                    </Divider>
                    <Row gutter={24}>
                        <Col xs={24} md={8}>
                            <Form.Item label="Teléfono / WhatsApp" name="telefono">
                                <Input prefix={<PhoneOutlined />} placeholder="+57 300 123 4567" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item label="Email de Contacto" name="email">
                                <Input placeholder="contacto@crystaldiamante.com" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item label="Sitio Web" name="sitio_web">
                                <Input prefix={<GlobalOutlined />} placeholder="www.tuacademia.com" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={24}>
                        <Col xs={24} md={12}>
                            <Form.Item label="Instagram / Facebook" name="instagram">
                                <Input prefix={<InstagramOutlined />} placeholder="@crystaldiamante_oficial" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* SECCIÓN 3: IMPRESIÓN Y FACTURACIÓN */}
                    <Divider orientation="left" style={{borderColor: '#722ed1'}}>
                        <SaveOutlined /> Pie de Página (Recibos)
                    </Divider>
                    <Form.Item label="Mensaje en Facturas/Recibos" name="mensaje_factura" help="Este texto saldrá al final de los recibos de pago.">
                        <Input.TextArea rows={2} placeholder="Ej: Gracias por confiar en nosotros. Conserve este recibo." />
                    </Form.Item>

                </Form>
              </Card>
            )
          },
          {
            key: "permisos",
            label: "Permisos por Rol",
            children: (
              <Card 
                title={<span><LockOutlined /> Gestionar Permisos por Rol</span>}
              >
                <p style={{ marginBottom: 24, color: '#666' }}>
                  Configura qué módulos y pestañas puede ver cada rol en la aplicación.
                </p>
                
                {Object.keys(ROLES_DISPONIBLES).length === 0 ? (
                  <Empty description="No hay roles configurados" />
                ) : (
                  <Row gutter={[24, 24]}>
                    {Object.entries(ROLES_DISPONIBLES).map(([key, rol]) => (
                      <Col xs={24} md={12} lg={8} key={key}>
                        <Card
                          title={<Tag color={rol.color}>{rol.label}</Tag>}
                          size="small"
                          style={{ height: '100%' }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {MODULOS_DISPONIBLES.map((modulo) => (
                              <Checkbox
                                key={modulo.key}
                                checked={permisos[key]?.[modulo.key] ?? false}
                                onChange={(e) => handlePermisosChange(key, modulo.key, e.target.checked)}
                              >
                                {modulo.label}
                              </Checkbox>
                            ))}
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </Card>
            )
          },
          {
            key: "plantillas",
            label: <span><MessageOutlined /> Plantillas WhatsApp</span>,
            children: (
              <Card 
                title={<span><MessageOutlined /> Plantillas de Mensajes WhatsApp</span>}
                extra={
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => abrirModalPlantilla()}
                  >
                    Nueva Plantilla
                  </Button>
                }
              >
                <div style={{ marginBottom: 16 }}>
                  <InfoCircleOutlined style={{ color: "#1890ff", marginRight: 8 }} />
                  <span style={{ color: "#666" }}>
                    Configura plantillas de mensajes con variables dinámicas. Usa {`{{variable}}`} para insertar datos.
                  </span>
                </div>

                <Table
                  dataSource={plantillas}
                  columns={columnasPlantillas}
                  rowKey="id"
                  loading={loadingPlantillas}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: "No hay plantillas configuradas" }}
                />

                <Modal
                  title={plantillaEditando ? "Editar Plantilla" : "Nueva Plantilla"}
                  open={modalPlantilla}
                  onCancel={() => {
                    setModalPlantilla(false);
                    formPlantilla.resetFields();
                    setPlantillaEditando(null);
                  }}
                  footer={null}
                  width={700}
                >
                  <Form
                    form={formPlantilla}
                    layout="vertical"
                    onFinish={guardarPlantilla}
                    initialValues={{ activa: true }}
                  >
                    <Form.Item
                      label="Nombre (clave única)"
                      name="nombre"
                      rules={[{ required: true, message: "Ingresa un nombre" }]}
                      help="Ej: inscripcion_academica, pago_confirmado, recordatorio_pago"
                    >
                      <Input placeholder="nombre_plantilla" disabled={!!plantillaEditando} />
                    </Form.Item>

                    <Form.Item
                      label="Descripción"
                      name="descripcion"
                      help="¿Cuándo se usa esta plantilla?"
                    >
                      <Input.TextArea 
                        rows={2} 
                        placeholder="Ej: Mensaje enviado al crear una inscripción académica"
                      />
                    </Form.Item>

                    <Form.Item
                      label="Plantilla del Mensaje"
                      name="plantilla"
                      rules={[{ required: true, message: "Ingresa la plantilla" }]}
                      help={`Usa {{variable}} para insertar datos dinámicos`}
                    >
                      <Input.TextArea 
                        rows={4} 
                        placeholder="Hola {{nombre}}, tu inscripción al curso {{curso}} fue confirmada."
                      />
                    </Form.Item>

                    <Form.Item
                      label="Variables disponibles"
                      name="variables"
                      help="Separa con comas. Ej: nombre, curso, fecha, monto"
                    >
                      <Input placeholder="nombre, curso, fecha" />
                    </Form.Item>

                    <Form.Item
                      label="Estado"
                      name="activa"
                      valuePropName="checked"
                    >
                      <Switch checkedChildren="Activa" unCheckedChildren="Inactiva" />
                    </Form.Item>

                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                          {plantillaEditando ? "Actualizar" : "Crear"} Plantilla
                        </Button>
                        <Button onClick={() => {
                          setModalPlantilla(false);
                          formPlantilla.resetFields();
                          setPlantillaEditando(null);
                        }}>
                          Cancelar
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </Modal>
              </Card>
            )
          },
          {
            key: "medios-pago",
            label: <span><DollarOutlined /> Medios de Pago</span>,
            children: (
              <Card 
                title={<span><DollarOutlined /> Medios de Pago Disponibles</span>}
                extra={
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => abrirModalMedio()}
                  >
                    Nuevo Medio de Pago
                  </Button>
                }
              >
                <div style={{ marginBottom: 16 }}>
                  <InfoCircleOutlined style={{ color: "#1890ff", marginRight: 8 }} />
                  <span style={{ color: "#666" }}>
                    Configura los medios de pago disponibles para registrar pagos de matrícula y cuotas.
                  </span>
                </div>

                <Table
                  dataSource={mediosPago}
                  columns={columnasMediosPago}
                  rowKey="id"
                  loading={loadingMedios}
                  pagination={false}
                  locale={{ emptyText: "No hay medios de pago configurados" }}
                />

                <Modal
                  title={medioEditando ? "Editar Medio de Pago" : "Nuevo Medio de Pago"}
                  open={modalMedio}
                  onCancel={() => {
                    setModalMedio(false);
                    formMedio.resetFields();
                    setMedioEditando(null);
                  }}
                  footer={null}
                  width={600}
                >
                  <Form
                    form={formMedio}
                    layout="vertical"
                    onFinish={guardarMedio}
                    initialValues={{ activo: true, orden: (mediosPago.length + 1) * 10 }}
                  >
                    <Row gutter={16}>
                      <Col span={16}>
                        <Form.Item
                          label="Nombre"
                          name="nombre"
                          rules={[{ required: true, message: "Ingresa el nombre" }]}
                        >
                          <Input placeholder="Ej: Nequi, Transferencia, Efectivo" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          label="Orden"
                          name="orden"
                          rules={[{ required: true, message: "Orden requerido" }]}
                          help="Para ordenar en select"
                        >
                          <Input type="number" placeholder="10" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item
                      label="Código (único e interno)"
                      name="codigo"
                      rules={[{ required: true, message: "Ingresa el código" }]}
                      help="Minúsculas sin espacios. Ej: nequi, transferencia, efectivo"
                    >
                      <Input placeholder="codigo_interno" disabled={!!medioEditando} />
                    </Form.Item>

                    <Form.Item
                      label="Descripción"
                      name="descripcion"
                    >
                      <Input.TextArea 
                        rows={2} 
                        placeholder="Ej: Pago mediante la aplicación Nequi"
                      />
                    </Form.Item>

                    <Form.Item
                      label="Icono (opcional)"
                      name="icono"
                      help="Nombre del icono de Ant Design"
                    >
                      <Input placeholder="Ej: DollarOutlined, BankOutlined" />
                    </Form.Item>

                    <Form.Item
                      label="Estado"
                      name="activo"
                      valuePropName="checked"
                    >
                      <Switch checkedChildren="Activo" unCheckedChildren="Inactivo" />
                    </Form.Item>

                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                          {medioEditando ? "Actualizar" : "Crear"} Medio
                        </Button>
                        <Button onClick={() => {
                          setModalMedio(false);
                          formMedio.resetFields();
                          setMedioEditando(null);
                        }}>
                          Cancelar
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </Modal>
              </Card>
            )
          },
          {
            key: "administradores",
            label: <span><UserAddOutlined /> Administradores</span>,
            children: <AdministradoresContent />
          }
        ]}
      />
    </div>
  );
}