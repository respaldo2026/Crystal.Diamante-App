import React from "react";
import { Modal, Form, Input, InputNumber, Row, Col } from "antd";

interface NuevoTemaModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
  form: any;
  initialOrden: number;
}

export const NuevoTemaModal: React.FC<NuevoTemaModalProps> = ({
  visible,
  onCancel,
  onOk,
  confirmLoading,
  form,
  initialOrden,
}) => {
  return (
    <Modal
      title="Nuevo Tema en el Pensum"
      open={visible}
      onOk={onOk}
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="orden" label="Nº" initialValue={initialOrden}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item name="titulo" label="Título" rules={[{ required: true }]}>
              <Input placeholder="Ej: Manicure Ruso" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="descripcion" label="Descripción">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};