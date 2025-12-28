"use client";

import { Card, Button, Typography, Space, Modal, Form, Input, InputNumber, Table, Tag, Popconfirm, App, Spin } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, BookOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function ProgramasPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrograma, setEditingPrograma] = useState<any>(null);
  const [programas, setProgramas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarProgramas();
  }, []);

  const cargarProgramas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("programas")
        .select("*")
        .order("nombre", { ascending: true });
      
      if (!error && data) {
        setProgramas(data);
      }
    } catch (error) {
      message.error("Error al cargar programas");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (programa?: any) => {
    if (programa) {
      setEditingPrograma(programa);
      form.setFieldsValue(programa);
    } else {
      setEditingPrograma(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingPrograma(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingPrograma) {
        const { error } = await supabaseBrowserClient
          .from("programas")
          .update(values)
          .eq("id", editingPrograma.id);
        
        if (error) throw error;
        message.success("Programa actualizado correctamente");
      } else {
        const { error } = await supabaseBrowserClient
          .from("programas")
          .insert([values]);
        
        if (error) throw error;
        message.success("Programa creado correctamente");
      }
      
      handleCloseModal();
      cargarProgramas();
    } catch (error: any) {
      message.error("Error al guardar: " + (error?.message || "Desconocido"));
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      // Verificar si hay grupos/cursos asociados a este programa
      const { data: cursos, error: cursosError } = await supabaseBrowserClient
        .from("cursos")
        .select("id, nombre")
        .eq("programa_id", id);

      if (cursosError) throw cursosError;

      if (cursos && cursos.length > 0) {
        modal.warning({
          title: "No se puede eliminar el programa",
          content: (
            <div>
              <p>Este programa tiene <strong>{cursos.length} grupo(s)/cohorte(s)</strong> asociados:</p>
              <ul style={{ maxHeight: 200, overflow: 'auto', marginTop: 10 }}>
                {cursos.map((c: any) => (
                  <li key={c.id}>{c.nombre}</li>
                ))}
              </ul>
              <p style={{ marginTop: 10 }}>
                <strong>Solución:</strong> Elimina primero todos los grupos asociados o cambia su programa antes de eliminar este programa.
              </p>
            </div>
          ),
          okText: "Entendido",
        });
        return;
      }

      // Si no hay grupos asociados, proceder a eliminar
      const { error } = await supabaseBrowserClient
        .from("programas")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      message.success("Programa eliminado correctamente");
      cargarProgramas();
    } catch (error: any) {
      console.error("Error al eliminar:", error);
      if (error.code === '23503') {
        message.error("No se puede eliminar: existen grupos/cohortes vinculados a este programa");
      } else {
        message.error("Error al eliminar: " + (error?.message || "Desconocido"));
      }
    }
  };

  const columns = [
    {
      title: "Programa Académico",
      dataIndex: "nombre",
      key: "nombre",
      render: (text: string) => (
        <Space>
          <BookOutlined style={{ color: "#1890ff" }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: "Duración",
      dataIndex: "duracion",
      key: "duracion",
      width: 150,
    },
    {
      title: "Precio",
      dataIndex: "precio",
      key: "precio",
      width: 120,
      render: (precio: number) => precio ? `$${Number(precio).toLocaleString()}` : "-",
    },
    {
      title: "Inscripción",
      dataIndex: "precio_inscripcion",
      key: "precio_inscripcion",
      width: 120,
      render: (precio: number) => precio ? `$${Number(precio).toLocaleString()}` : "-",
    },
    {
      title: "Mensualidad",
      dataIndex: "precio_mensualidad",
      key: "precio_mensualidad",
      width: 120,
      render: (precio: number) => precio ? `$${Number(precio).toLocaleString()}` : "-",
    },
    {
      title: "Estado",
      dataIndex: "activo",
      key: "activo",
      width: 100,
      render: (activo: boolean) => (
        <Tag color={activo ? "green" : "red"}>
          {activo ? "Activo" : "Inactivo"}
        </Tag>
      ),
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            Editar
          </Button>
          <Popconfirm
            title="¿Eliminar programa?"
            description="Esto también eliminará todos los grupos asociados."
            onConfirm={() => handleDelete(record.id)}
            okText="Sí"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Eliminar
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <App>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, alignItems: "center" }}>
          <div>
            <Title level={2} style={{ marginBottom: 4 }}>Programas Académicos</Title>
            <Text type="secondary">Gestiona los cursos/programas generales. Los grupos con horarios se crean dentro de cada programa.</Text>
          </div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            Nuevo Programa
          </Button>
        </div>

      <Card>
        <Table
          dataSource={programas}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: 16, background: "#fafafa", borderRadius: 8 }}>
                <Text strong>Descripción:</Text>
                <p>{record.descripcion || "Sin descripción"}</p>
                {record.contenido && (
                  <>
                    <Text strong>Contenido:</Text>
                    <p style={{ whiteSpace: "pre-line" }}>{record.contenido}</p>
                  </>
                )}
                {record.requisitos && (
                  <>
                    <Text strong>Requisitos:</Text>
                    <p style={{ whiteSpace: "pre-line" }}>{record.requisitos}</p>
                  </>
                )}
                {record.certificacion && (
                  <>
                    <Text strong>Certificación:</Text>
                    <p>{record.certificacion}</p>
                  </>
                )}
              </div>
            ),
          }}
        />
      </Card>

      <Modal
        title={editingPrograma ? "Editar Programa" : "Nuevo Programa"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        width={700}
        okText="Guardar"
        cancelText="Cancelar"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="nombre"
            label="Nombre del Programa"
            rules={[{ required: true, message: "Ingresa el nombre del programa" }]}
          >
            <Input placeholder="Ej: Micropigmentación Profesional" />
          </Form.Item>

          <Form.Item
            name="descripcion"
            label="Descripción"
          >
            <TextArea rows={3} placeholder="Descripción breve del programa" />
          </Form.Item>

          <Form.Item
            name="duracion"
            label="Duración"
          >
            <Input placeholder="Ej: 3 meses, 120 horas" />
          </Form.Item>

          <Form.Item
            name="duracion_horas"
            label="Duración en Horas"
          >
            <InputNumber style={{ width: "100%" }} min={0} placeholder="120" />
          </Form.Item>

          <Space style={{ width: "100%" }} size="large">
            <Form.Item
              name="precio"
              label="Precio Total"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: 200 }}
                min={0}
                formatter={(value: any) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value: any) => parseInt(value!.replace(/\$\s?|(,*)/g, "")) || 0}
              />
            </Form.Item>

            <Form.Item
              name="precio_inscripcion"
              label="Inscripción"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: 200 }}
                min={0}
                formatter={(value: any) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value: any) => parseInt(value!.replace(/\$\s?|(,*)/g, "")) || 0}
              />
            </Form.Item>

            <Form.Item
              name="precio_mensualidad"
              label="Mensualidad"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: 200 }}
                min={0}
                formatter={(value: any) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value: any) => parseInt(value!.replace(/\$\s?|(,*)/g, "")) || 0}
              />
            </Form.Item>
          </Space>

          <Form.Item
            name="contenido"
            label="Contenido del Programa"
          >
            <TextArea rows={4} placeholder="Describe los temas y módulos del programa" />
          </Form.Item>

          <Form.Item
            name="requisitos"
            label="Requisitos"
          >
            <TextArea rows={2} placeholder="Requisitos previos para inscribirse" />
          </Form.Item>

          <Form.Item
            name="certificacion"
            label="Certificación"
          >
            <Input placeholder="Tipo de certificación que se otorga" />
          </Form.Item>
        </Form>
      </Modal>
      </div>
    </App>
  );
}
