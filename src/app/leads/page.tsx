"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Alert,
  Divider,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
  MailOutlined,
  SendOutlined,
  PhoneOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";

const { Title, Text } = Typography;

interface Lead {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  interes?: string | null;
  canal?: string | null;
  estado?: string | null;
  notas?: string | null;
  created_at?: string | null;
}

const estadoOptions = [
  { value: "nuevo", label: "Nuevo", color: "blue" },
  { value: "contactado", label: "Contactado", color: "cyan" },
  { value: "en_seguimiento", label: "En seguimiento", color: "gold" },
  { value: "cerrado", label: "Cerrado", color: "green" },
  { value: "perdido", label: "Perdido", color: "red" },
];

const canalOptions = [
  "Instagram",
  "WhatsApp",
  "Facebook",
  "Referencia",
  "Evento",
  "Web",
  "Otro",
];

const plantillaOptions = [
  {
    key: "bienvenida",
    titulo: "Bienvenida",
    cuerpo:
      "Hola {nombre}! Soy del equipo de Academia Crystal. Gracias por tu interés en {programa}. ¿Te gustaría que te enviemos el detalle del programa y horarios?",
  },
  {
    key: "seguimiento",
    titulo: "Seguimiento",
    cuerpo:
      "Hola {nombre}, solo paso para acompañarte con cualquier duda sobre {programa}. Podemos agendar una llamada breve hoy o mañana.",
  },
  {
    key: "promo",
    titulo: "Promoción",
    cuerpo:
      "Hola {nombre}! Esta semana tenemos un cupo limitado con beneficio especial para {programa}. Si te interesa, puedo reservarte y enviarte el link de inscripción.",
  },
  {
    key: "cierre",
    titulo: "Cierre",
    cuerpo:
      "Hola {nombre}, último recordatorio sobre {programa}. Iniciamos pronto y quedan pocos cupos. Avísame si quieres asegurar tu lugar o si prefieres que te contacte más adelante.",
  },
];

const applyPlantilla = (cuerpo: string, lead: Lead) => {
  return cuerpo
    .replace(/{nombre}/gi, lead.nombre || "allí")
    .replace(/{programa}/gi, lead.interes || "tu programa de interés");
};

const normalizePhone = (value?: string | null) => {
  if (!value) return "";
  return value.replace(/\D+/g, "");
};

const buildMailTo = (lead: Lead, mensaje: string) => {
  const subject = encodeURIComponent(`Info ${lead.interes || "Academia Crystal"}`);
  const body = encodeURIComponent(mensaje);
  return `mailto:${lead.email || ""}?subject=${subject}&body=${body}`;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const [filtroCanal, setFiltroCanal] = useState<string | undefined>();
  const [filtroPrograma, setFiltroPrograma] = useState<string | undefined>();
  const [programas, setProgramas] = useState<string[]>([]);
  const [tablaInexistente, setTablaInexistente] = useState(false);

  useEffect(() => {
    cargarProgramas();
    cargarLeads();
  }, []);

  const cargarProgramas = async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("programas")
        .select("nombre")
        .eq("activo", true)
        .order("nombre");
      if (!error && data) {
        setProgramas(data.map((p: any) => p.nombre).filter(Boolean));
      }
    } catch (error) {
      console.error("Error cargando programas", error);
    }
  };

  const cargarLeads = async () => {
    setLoading(true);
    setTablaInexistente(false);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        if ((error as any)?.code === "42P01") {
          setTablaInexistente(true);
        } else {
          message.error("No se pudieron cargar los leads");
        }
        setLeads([]);
        return;
      }

      setLeads((data as Lead[]) || []);
    } catch (err) {
      console.error("Error cargando leads", err);
      message.error("No se pudieron cargar los leads");
    } finally {
      setLoading(false);
    }
  };

  const crearLead = async (values: any) => {
    try {
      const payload = {
        nombre: values.nombre,
        telefono: values.telefono || null,
        email: values.email || null,
        interes: values.interes || null,
        canal: values.canal || null,
        notas: values.notas || null,
        estado: values.estado || "nuevo",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabaseBrowserClient.from("leads").insert(payload);
      if (error) {
        message.error("No se pudo guardar el lead");
        return;
      }

      message.success("Lead guardado");
      setModalVisible(false);
      form.resetFields();
      cargarLeads();
    } catch (err) {
      console.error("Error guardando lead", err);
      message.error("No se pudo guardar el lead");
    }
  };

  const actualizarEstado = async (lead: Lead, estado: string) => {
    try {
      setLoading(true);
      const { error } = await supabaseBrowserClient
        .from("leads")
        .update({ estado })
        .eq("id", lead.id);

      if (error) {
        message.error("No se pudo actualizar el estado");
        return;
      }

      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, estado } : l)));
      message.success("Estado actualizado");
    } catch (err) {
      console.error("Error actualizando estado", err);
      message.error("No se pudo actualizar el estado");
    } finally {
      setLoading(false);
    }
  };

  const sendTemplate = (lead: Lead, plantillaKey: string, canal: "whatsapp" | "email") => {
    const plantilla = plantillaOptions.find((p) => p.key === plantillaKey);
    if (!plantilla) return;

    const mensaje = applyPlantilla(plantilla.cuerpo, lead);

    if (canal === "whatsapp") {
      if (!lead.telefono) {
        message.warning("El lead no tiene teléfono");
        return;
      }
      const phone = normalizePhone(lead.telefono);
      enviarWhatsapp(phone, mensaje);
    } else {
      if (!lead.email) {
        message.warning("El lead no tiene email");
        return;
      }
      const url = buildMailTo(lead, mensaje);
      window.open(url, "_blank");
    }
  };

  const leadsFiltrados = useMemo(() => {
    return leads.filter((l) => {
      if (filtroEstado && (l.estado || "").toLowerCase() !== filtroEstado) return false;
      if (filtroCanal && (l.canal || "").toLowerCase() !== filtroCanal.toLowerCase()) return false;
      if (filtroPrograma && (l.interes || "").toLowerCase() !== filtroPrograma.toLowerCase()) return false;
      return true;
    });
  }, [leads, filtroEstado, filtroCanal, filtroPrograma]);

  const columns = [
    {
      title: "Lead",
      dataIndex: "nombre",
      key: "nombre",
      render: (_: any, record: Lead) => (
        <Space direction="vertical" size={2}>
          <Space>
            <UserOutlined />
            <Text strong>{record.nombre}</Text>
          </Space>
          <Space size={6} wrap>
            {record.telefono && (
              <Tag icon={<PhoneOutlined />} color="blue">
                {record.telefono}
              </Tag>
            )}
            {record.email && (
              <Tag icon={<MailOutlined />} color="geekblue">
                {record.email}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: "Interés",
      dataIndex: "interes",
      key: "interes",
      render: (value: string | null) => value || "-",
    },
    {
      title: "Canal",
      dataIndex: "canal",
      key: "canal",
      render: (value: string | null) => value || "-",
    },
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      render: (_: any, record: Lead) => {
        const estado = estadoOptions.find((e) => e.value === (record.estado || ""));
        return (
          <Select
            size="small"
            value={record.estado || "nuevo"}
            onChange={(value) => actualizarEstado(record, value)}
            options={estadoOptions.map((e) => ({ value: e.value, label: e.label }))}
            style={{ minWidth: 140 }}
          />
        );
      },
    },
    {
      title: "Creado",
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string | null) => (value ? dayjs(value).format("DD MMM YYYY") : "-"),
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_: any, record: Lead) => (
        <Space>
          <Select
            placeholder="Plantilla"
            size="small"
            style={{ width: 150 }}
            options={plantillaOptions.map((p) => ({ value: p.key, label: p.titulo }))}
            onSelect={(value) => sendTemplate(record, value, "whatsapp")}
            suffixIcon={<WhatsAppOutlined style={{ color: "#25D366" }} />}
          />
          <Tooltip title="Enviar por email">
            <Select
              placeholder="Email"
              size="small"
              style={{ width: 130 }}
              options={plantillaOptions.map((p) => ({ value: p.key, label: p.titulo }))}
              onSelect={(value) => sendTemplate(record, value, "email")}
              suffixIcon={<SendOutlined />}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Card>
          <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
            <Space size="middle" wrap>
              <Title level={3} style={{ margin: 0 }}>
                Leads e interesados
              </Title>
              <Tag color="purple">WhatsApp / Email</Tag>
            </Space>
            <Space size="middle" wrap>
              <Select
                allowClear
                placeholder="Estado"
                style={{ width: 160 }}
                options={estadoOptions}
                value={filtroEstado}
                onChange={(v) => setFiltroEstado(v)}
              />
              <Select
                allowClear
                placeholder="Canal"
                style={{ width: 160 }}
                options={canalOptions.map((c) => ({ value: c.toLowerCase(), label: c }))}
                value={filtroCanal}
                onChange={(v) => setFiltroCanal(v)}
              />
              <Select
                allowClear
                showSearch
                placeholder="Programa"
                style={{ width: 200 }}
                options={programas.map((p) => ({ value: p, label: p }))}
                value={filtroPrograma}
                onChange={(v) => setFiltroPrograma(v)}
              />
              <Button icon={<ReloadOutlined />} onClick={cargarLeads}>
                Recargar
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                Nuevo lead
              </Button>
            </Space>
          </Space>
        </Card>

        {tablaInexistente && (
          <Alert
            type="warning"
            showIcon
            icon={<InfoCircleOutlined />}
            message="Crea la tabla 'leads' en Supabase"
            description={
              <div>
                La vista intentó consultar la tabla "leads" pero no existe. Crea una tabla con campos:
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>id (uuid) primary key default uuid_generate_v4()</li>
                  <li>nombre text</li>
                  <li>telefono text</li>
                  <li>email text</li>
                  <li>interes text</li>
                  <li>canal text</li>
                  <li>estado text</li>
                  <li>notas text</li>
                  <li>created_at timestamp with time zone default now()</li>
                </ul>
                Una vez creada, pulsa "Recargar".
              </div>
            }
            style={{ background: "#fffbe6" }}
          />
        )}

        <Card>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={leadsFiltrados}
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: tablaInexistente ? "Crea la tabla 'leads' y recarga." : "Sin leads" }}
          />
        </Card>
      </Space>

      <Modal
        title="Nuevo lead"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="Guardar"
        cancelText="Cancelar"
      >
        <Form layout="vertical" form={form} onFinish={crearLead}>
          <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true, message: "Ingresa el nombre" }]}> 
            <Input placeholder="Ej: Andrea Gómez" />
          </Form.Item>

          <Form.Item label="Contacto">
            <Input.Group compact>
              <Form.Item name="telefono" noStyle>
                <Input style={{ width: "50%" }} prefix={<PhoneOutlined />} placeholder="Teléfono (solo dígitos)" />
              </Form.Item>
              <Form.Item name="email" noStyle>
                <Input style={{ width: "50%" }} prefix={<MailOutlined />} placeholder="Email" />
              </Form.Item>
            </Input.Group>
          </Form.Item>

          <Form.Item name="interes" label="Programa/Interés">
            <Select
              showSearch
              placeholder="Selecciona o escribe"
              options={programas.map((p) => ({ value: p, label: p }))}
              allowClear
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  <Divider style={{ margin: "8px 0" }} />
                  <div style={{ padding: "0 8px 4px" }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Si no está en la lista, escríbelo directo
                    </Text>
                  </div>
                </div>
              )}
            />
          </Form.Item>

          <Form.Item name="canal" label="Canal de origen">
            <Select
              placeholder="Selecciona"
              allowClear
              options={canalOptions.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>

          <Form.Item name="estado" label="Estado" initialValue="nuevo">
            <Select options={estadoOptions} />
          </Form.Item>

          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={3} placeholder="Contexto, disponibilidad, motivación..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
