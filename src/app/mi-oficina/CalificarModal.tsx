import React from "react";
import { Modal, Form, Input, InputNumber, Row, Col } from "antd";
import { StarOutlined } from "@ant-design/icons";

interface CalificarModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  loading: boolean;
  form: any;
  estudiante: any;
}

export const CalificarModal: React.FC<CalificarModalProps> = ({
  visible,
  onCancel,
  onOk,
  loading,
  form,
  estudiante,
}) => {
  return (
    <Modal
      title={<span><StarOutlined /> Calificar a {estudiante?.perfiles?.nombre_completo}</span>}
      open={visible}
      onOk={onOk}
      confirmLoading={loading}
      onCancel={onCancel}
      okText="Guardar Nota"
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item 
              name="concepto" 
              label="Actividad o Evaluación" 
              rules={[{required:true, message: 'Indica qué estás calificando'}]}
            >
              <Input placeholder="Ej: Examen Teórico, Práctica Gel..." />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item 
              name="nota" 
              label="Nota (0-5)" 
              rules={[{required:true, message: 'Falta la nota'}]}
            >
              <InputNumber min={0} max={5} step={0.1} style={{width: '100%'}} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="observaciones" label="Observaciones (Opcional)">
          <Input.TextArea rows={2} placeholder="Comentarios sobre el desempeño..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};