import React from "react";
import { Card, Row, Col, Avatar, Typography, Space } from "antd";
import { UserOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

interface ProfesorHeaderProps {
  profesor: any;
}

export const ProfesorHeader: React.FC<ProfesorHeaderProps> = React.memo(({ profesor }) => {
  if (!profesor) return null;

  return (
    <Card 
      style={{
        marginBottom: 24, 
        background: 'linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)',
        border: 'none',
        color: 'white'
      }}
    >
      <Row align="middle" gutter={24}>
          <Col>
            <Avatar 
              size={80} 
              style={{backgroundColor: '#FFF', color: '#5B21B6'}} 
              icon={<UserOutlined />} 
              src={profesor?.foto_url}
            />
          </Col>
          <Col flex="auto">
              <Title level={2} style={{margin: 0, color: 'white'}}>Bienvenido, {profesor.nombre_completo.split(' ')[0]}</Title>
              <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 14}}>Gestor de Clases y Calificaciones</Text>
          </Col>
          <Col>
            <Space direction="vertical" align="end" style={{color: 'white'}}>
              <div><strong>Cédula:</strong> {profesor.identificacion}</div>
              <div><strong>Email:</strong> {profesor.email}</div>
            </Space>
          </Col>
      </Row>
    </Card>
  );
});