"use client";

import React, { useState } from "react";
import { Modal, Form, Select, Input, DatePicker, Button, message as antMessage, Tag, Table, Space, Card, App } from "antd";
import { GiftOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";

interface EntregaMaterialModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  estudianteId: string;
  estudianteNombre: string;
  profesorId: string;
}

export const EntregaMaterialModal: React.FC<EntregaMaterialModalProps> = ({
  visible,
  onCancel,
  onSuccess,
  estudianteId,
  estudianteNombre,
  profesorId,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tipoMaterial, setTipoMaterial] = useState<'camiseta' | 'kit'>('kit');

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const entregaData = {
        estudiante_id: estudianteId,
        tipo_material: values.tipo_material,
        descripcion: values.descripcion,
        talla: values.tipo_material === 'camiseta' ? values.talla : null,
        mes_ciclo: values.tipo_material === 'kit' ? values.mes_ciclo : null,
        fecha_entrega: values.fecha_entrega ? values.fecha_entrega.toISOString() : new Date().toISOString(),
        entregado_por: profesorId,
        observaciones: values.observaciones || null,
      };

      const { error } = await supabaseBrowserClient
        .from("entregas_materiales")
        .insert([entregaData]);

      if (error) throw error;

      message.success(`✅ ${values.tipo_material === 'camiseta' ? 'Camiseta' : 'Kit'} registrado correctamente`);
      form.resetFields();
      onSuccess();
      onCancel();
    } catch (error: any) {
      console.error("Error registrando entrega:", error);
      message.error("Error: " + (error.message || "No se pudo registrar"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`🎁 Registrar Entrega - ${estudianteNombre}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          tipo_material: 'kit',
          fecha_entrega: dayjs(),
        }}
      >
        <Form.Item
          label="Tipo de Material"
          name="tipo_material"
          rules={[{ required: true, message: "Selecciona el tipo" }]}
        >
          <Select
            onChange={(value) => setTipoMaterial(value)}
            options={[
              { value: 'camiseta', label: '👕 Camiseta' },
              { value: 'kit', label: '📦 Kit Mensual' },
            ]}
          />
        </Form.Item>

        {tipoMaterial === 'camiseta' && (
          <Form.Item
            label="Talla"
            name="talla"
            rules={[{ required: true, message: "Selecciona la talla" }]}
          >
            <Select
              placeholder="Selecciona talla"
              options={[
                { value: 'XS', label: 'XS' },
                { value: 'S', label: 'S' },
                { value: 'M', label: 'M' },
                { value: 'L', label: 'L' },
                { value: 'XL', label: 'XL' },
                { value: 'XXL', label: 'XXL' },
              ]}
            />
          </Form.Item>
        )}

        {tipoMaterial === 'kit' && (
          <Form.Item
            label="Mes/Ciclo"
            name="mes_ciclo"
            rules={[{ required: true, message: "Indica el mes o ciclo" }]}
          >
            <Input placeholder="Ej: Enero 2026, Ciclo 1" />
          </Form.Item>
        )}

        <Form.Item
          label="Descripción"
          name="descripcion"
        >
          <Input.TextArea
            rows={2}
            placeholder="Ej: Camiseta blanca con logo, Kit con cuaderno y lapiceros"
          />
        </Form.Item>

        <Form.Item
          label="Fecha de Entrega"
          name="fecha_entrega"
          rules={[{ required: true }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item
          label="Observaciones"
          name="observaciones"
        >
          <Input.TextArea
            rows={2}
            placeholder="Opcional: Notas adicionales"
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={onCancel}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={loading} icon={<GiftOutlined />}>
              Registrar Entrega
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

// Componente para mostrar el historial de entregas
interface HistorialEntregasProps {
  estudianteId: string;
}

export const HistorialEntregas: React.FC<HistorialEntregasProps> = ({ estudianteId }) => {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState<any>(null);

  React.useEffect(() => {
    cargarEntregas();
    cargarResumen();
  }, [estudianteId]);

  const cargarEntregas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("v_entregas_materiales_completa")
        .select("*")
        .eq("estudiante_id", estudianteId)
        .order("fecha_entrega", { ascending: false });

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error("Error cargando entregas:", error);
    } finally {
      setLoading(false);
    }
  };

  const cargarResumen = async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .rpc("obtener_resumen_entregas", { p_estudiante_id: estudianteId });

      if (error) throw error;
      if (data && data.length > 0) {
        setResumen(data[0]);
      }
    } catch (error) {
      console.error("Error cargando resumen:", error);
    }
  };

  const columns = [
    {
      title: "Tipo",
      dataIndex: "tipo_material",
      key: "tipo_material",
      render: (tipo: string) => (
        <Tag color={tipo === 'camiseta' ? 'blue' : 'green'}>
          {tipo === 'camiseta' ? '👕 Camiseta' : '📦 Kit'}
        </Tag>
      ),
    },
    {
      title: "Detalles",
      key: "detalles",
      render: (_: any, record: any) => (
        <div>
          {record.tipo_material === 'camiseta' && record.talla && (
            <Tag>Talla: {record.talla}</Tag>
          )}
          {record.tipo_material === 'kit' && record.mes_ciclo && (
            <Tag>{record.mes_ciclo}</Tag>
          )}
          {record.descripcion && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
              {record.descripcion}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Fecha Entrega",
      dataIndex: "fecha_entrega",
      key: "fecha_entrega",
      render: (fecha: string) => dayjs(fecha).format("DD/MM/YYYY"),
    },
    {
      title: "Entregado por",
      dataIndex: "entregado_por_nombre",
      key: "entregado_por_nombre",
    },
  ];

  return (
    <div>
      {resumen && (
        <Space style={{ marginBottom: 16 }}>
          <Tag color={resumen.tiene_camiseta ? 'success' : 'default'} icon={<CheckCircleOutlined />}>
            {resumen.tiene_camiseta ? '✅ Camiseta entregada' : '⏳ Sin camiseta'}
          </Tag>
          <Tag color={resumen.total_kits > 0 ? 'success' : 'default'}>
            📦 {resumen.total_kits} {resumen.total_kits === 1 ? 'Kit' : 'Kits'} recibidos
          </Tag>
          {resumen.ultimo_kit_mes && (
            <Tag color="processing">Último: {resumen.ultimo_kit_mes}</Tag>
          )}
        </Space>
      )}

      <Table
        dataSource={entregas}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 5 }}
        locale={{ emptyText: "No hay entregas registradas" }}
      />
    </div>
  );
};
