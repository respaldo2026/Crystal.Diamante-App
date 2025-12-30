"use client";

import { Card, Button, Typography, Space, Modal, Form, Input, InputNumber, Table, Tag, Popconfirm, App, Spin, Checkbox } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, BookOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
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
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  useEffect(() => {
    cargarProgramas();
  }, []);

  // Refrescar cuando cambia el filtro de inactivos
  useEffect(() => {
    cargarProgramas();
  }, [mostrarInactivos]);

  const cargarProgramas = async () => {
    setLoading(true);
    try {
      let query = supabaseBrowserClient
        .from("programas")
        .select("*")
        .order("nombre", { ascending: true });
      
      // Filtrar por activos si no se quiere ver inactivos
      if (!mostrarInactivos) {
        query = query.eq("activo", true);
      }
      
      const { data, error } = await query;
      
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

  const handleToggleActivo = async (programa: any) => {
    const nuevoEstado = !programa.activo;
    const accion = nuevoEstado ? "activar" : "desactivar";
    
    try {
      // Si está desactivando, verificar grupos activos
      if (!nuevoEstado) {
        const { data: gruposActivos, error: gruposError } = await supabaseBrowserClient
          .from("cursos")
          .select("id, nombre, estado")
          .eq("programa_id", programa.id)
          .eq("estado", "activo");

        if (gruposError) throw gruposError;

        if (gruposActivos && gruposActivos.length > 0) {
          modal.warning({
            title: "No se puede desactivar el programa",
            content: (
              <div>
                <p>Este programa tiene <strong>{gruposActivos.length} grupo(s) activo(s)</strong>:</p>
                <ul style={{ maxHeight: 200, overflow: 'auto', marginTop: 10 }}>
                  {gruposActivos.map((g: any) => (
                    <li key={g.id}>{g.nombre}</li>
                  ))}
                </ul>
                <p style={{ marginTop: 10 }}>
                  <strong>Proceso recomendado:</strong>
                </p>
                <ol style={{ marginTop: 5 }}>
                  <li>Finaliza los grupos activos cambiando su estado a Finalizado</li>
                  <li>Luego podrás desactivar el programa</li>
                </ol>
                <p style={{ marginTop: 10, color: '#666', fontSize: 12 }}>
                  💡 <em>Desactivar un programa lo oculta de la lista pero mantiene todo el historial.</em>
                </p>
              </div>
            ),
            okText: "Entendido",
          });
          return;
        }
      }

      // Confirmación antes de cambiar estado
      modal.confirm({
        title: nuevoEstado ? "Activar programa" : "Desactivar programa",
        content: nuevoEstado ? (
          <p>¿Deseas activar el programa <strong>{programa.nombre}</strong>?</p>
        ) : (
          <div>
            <p>¿Deseas desactivar el programa <strong>{programa.nombre}</strong>?</p>
            <p style={{ marginTop: 10 }}>Al desactivar:</p>
            <ul style={{ marginTop: 5 }}>
              <li>El programa desaparecerá de la lista principal</li>
              <li>No podrás crear nuevos grupos de este programa</li>
              <li>Los grupos existentes seguirán funcionando</li>
              <li>Todo el historial se mantiene intacto</li>
              <li>Podrás reactivarlo cuando quieras</li>
            </ul>
          </div>
        ),
        okText: nuevoEstado ? "Sí, activar" : "Sí, desactivar",
        okType: nuevoEstado ? "primary" : "default",
        cancelText: "Cancelar",
        onOk: async () => {
          const { error } = await supabaseBrowserClient
            .from("programas")
            .update({ activo: nuevoEstado })
            .eq("id", programa.id);
          
          if (error) throw error;
          message.success(`Programa ${nuevoEstado ? "activado" : "desactivado"} correctamente`);
          cargarProgramas();
        },
      });
    } catch (error: any) {
      message.error(`Error al ${accion}: ` + (error?.message || "Desconocido"));
      console.error(error);
    }
  };

  // Función para calcular el precio total: (mensualidad * meses) + inscripción
  const calcularPrecioTotal = (programa: any): number => {
    const precio_mensualidad = Number(programa.precio_mensualidad || 0);
    const precio_inscripcion = Number(programa.precio_inscripcion || 0);
    
    // Extraer número de meses de la cadena "duracion" (ej: "4 meses" -> 4)
    const duracionStr = String(programa.duracion || "0 meses");
    const meses = parseInt(duracionStr.match(/\d+/)?.[0] || "0", 10);
    
    return (precio_mensualidad * meses) + precio_inscripcion;
  };

  // Función para calcular el valor por clase
  const calcularValorPorClase = (programa: any): number | null => {
    const mensualidad = Number(programa.precio_mensualidad || 0);
    const totalClases = Number(programa.total_clases || 0);

    if (mensualidad > 0 && totalClases > 0) {
      return Math.round(mensualidad / totalClases);
    }
    return null;
  };

  const calcularTotalHoras = (programa: any): number => {
    const horasPorClase = Number(programa.horas_por_clase || 0);
    const totalClases = Number(programa.total_clases || 0);
    return horasPorClase * totalClases;
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
      width: 120,
    },
    {
      title: "N° Clases",
      dataIndex: "total_clases",
      key: "total_clases",
      width: 100,
      render: (clases: number) => clases || "-",
    },
    {
      title: "Total Horas",
      key: "total_horas",
      width: 110,
      render: (_: any, record: any) => {
        const totalHoras = calcularTotalHoras(record);
        return totalHoras > 0 ? <Text style={{ color: '#722ed1' }}>{totalHoras} hrs</Text> : "-";
      },
    },
    {
      title: "Valor/Clase",
      key: "valor_clase",
      width: 120,
      render: (_: any, record: any) => {
        const valorClase = calcularValorPorClase(record);
        return valorClase ? <Text style={{ color: '#1890ff' }}>$ {valorClase.toLocaleString()}</Text> : "-";
      },
    },
    {
      title: "Valor Total",
      key: "precio_total",
      width: 130,
      render: (_: any, record: any) => {
        const total = calcularPrecioTotal(record);
        return total ? <Text strong style={{ color: '#3f8600' }}>$ {Number(total).toLocaleString()}</Text> : "-";
      },
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
          <Button
            type="link"
            danger={record.activo}
            onClick={() => handleToggleActivo(record)}
          >
            {record.activo ? "Desactivar" : "Activar"}
          </Button>
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
          <Space>
            <Checkbox
              checked={mostrarInactivos}
              onChange={(e: CheckboxChangeEvent) => setMostrarInactivos(e.target.checked)}
            >
              Mostrar inactivos {programas.filter(p => !p.activo).length > 0 && `(${programas.filter(p => !p.activo).length})`}
            </Checkbox>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              Nuevo Programa
            </Button>
          </Space>
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

          <Form.Item
            name="horas_por_clase"
            label="Horas por Clase/Sesión"
            rules={[{ required: true, message: "Ingresa las horas por clase" }]}
          >
            <InputNumber 
              style={{ width: "100%" }} 
              min={0.5} 
              step={0.5}
              placeholder="Ej: 2 o 2.5" 
            />
          </Form.Item>

          <Form.Item
            name="total_clases"
            label="Total de Clases/Sesiones"
            rules={[{ required: true, message: "Ingresa el número de clases" }]}
          >
            <InputNumber style={{ width: "100%" }} min={1} placeholder="Ej: 24" />
          </Form.Item>

          <Space style={{ width: "100%" }} size="large" direction="horizontal">
            <Form.Item
              label="Total Horas Programa"
              style={{ marginBottom: 0, flex: 1 }}
            >
              <div style={{
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#f9f0ff',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#722ed1'
              }}>
                {calcularTotalHoras(form.getFieldsValue())} horas
              </div>
            </Form.Item>
            <Form.Item
              label="Valor por Clase"
              style={{ marginBottom: 0, flex: 1 }}
            >
              <div style={{
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#e6f7ff',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#1890ff'
              }}>
                $ {(calcularValorPorClase(form.getFieldsValue()) || 0).toLocaleString()}
              </div>
            </Form.Item>
          </Space>

          <Space style={{ width: "100%" }} size="large" direction="horizontal">
            <Form.Item
              label="Valor Total Calculado"
              style={{ marginBottom: 0, flex: 1 }}
            >
              <div style={{
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: '#f0f2f5',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#3f8600'
              }}>
                $ {Number(calcularPrecioTotal(form.getFieldsValue())).toLocaleString()}
              </div>
            </Form.Item>
          </Space>

          <Space style={{ width: "100%" }} size="large" direction="vertical">
            <Text type="secondary" style={{fontSize: 12}}>Configura Inscripción y Mensualidad para calcular el total automáticamente</Text>
            <Form.Item
              name="precio_inscripcion"
              label="Valor Inscripción"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                placeholder="0"
                formatter={(value: any) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value: any) => parseInt(value!.replace(/\$\s?|(,*)/g, "")) || 0}
                onChange={() => form.validateFields()}
              />
            </Form.Item>

            <Form.Item
              name="precio_mensualidad"
              label="Valor Mensualidad"
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                placeholder="0"
                formatter={(value: any) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value: any) => parseInt(value!.replace(/\$\s?|(,*)/g, "")) || 0}
                onChange={() => form.validateFields()}
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
