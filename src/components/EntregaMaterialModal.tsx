import React, { useState } from "react";
import { Modal, Form, Input, Select, DatePicker, message, Radio } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";

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
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tipoMaterial, setTipoMaterial] = useState("camiseta");

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const { error } = await supabaseBrowserClient
        .from("entregas_materiales")
        .insert({
          estudiante_id: estudianteId,
          tipo_material: values.tipo_material,
          talla: values.tipo_material === "camiseta" ? values.talla : null,
          mes_ciclo: values.tipo_material === "kit" ? values.mes_ciclo : null,
          descripcion: values.descripcion,
          fecha_entrega: values.fecha_entrega.format("YYYY-MM-DD"),
          entregado_por: profesorId,
          observaciones: values.observaciones,
        });

      if (error) throw error;

      message.success("Entrega registrada correctamente");
      form.resetFields();
      onSuccess();
      onCancel();
    } catch (error: any) {
      message.error("Error al registrar entrega: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<span><GiftOutlined /> Entregar Material a {estudianteNombre}</span>}
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Registrar Entrega"
    >
      <Form form={form} layout="vertical" initialValues={{ tipo_material: "camiseta", fecha_entrega: dayjs() }}>
        <Form.Item name="tipo_material" label="Tipo de Material">
          <Radio.Group onChange={(e) => setTipoMaterial(e.target.value)}>
            <Radio.Button value="camiseta">Camiseta</Radio.Button>
            <Radio.Button value="kit">Kit de Materiales</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {tipoMaterial === "camiseta" && (
          <Form.Item name="talla" label="Talla" rules={[{ required: true, message: "Selecciona la talla" }]}>
            <Select options={["XS", "S", "M", "L", "XL", "XXL"].map(t => ({ label: t, value: t }))} />
          </Form.Item>
        )}

        {tipoMaterial === "kit" && (
          <Form.Item name="mes_ciclo" label="Mes o Ciclo" rules={[{ required: true, message: "Indica el mes o ciclo" }]}>
            <Input placeholder="Ej: Enero, Ciclo 1, Básico" />
          </Form.Item>
        )}

        <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
          <Input placeholder="Ej: Camiseta blanca logo nuevo" />
        </Form.Item>

        <Form.Item name="fecha_entrega" label="Fecha de Entrega" rules={[{ required: true }]}>
          <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.Item name="observaciones" label="Observaciones (Opcional)">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};