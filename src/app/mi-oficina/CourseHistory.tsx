import React from "react";
import { Card, Row, Col, Typography, List, Tag, Alert } from "antd";
import { BookOutlined, ClockCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface CourseHistoryProps {
  historialCursos: any[];
}

export const CourseHistory: React.FC<CourseHistoryProps> = React.memo(({ historialCursos }) => {
  return (
    <>
      <Card style={{background: 'linear-gradient(135deg, #f3f0ff 0%, #fef3f2 100%)', border: 'none', marginBottom: 24}}>
        <Row align="middle" gutter={16}>
          <Col>
            <BookOutlined style={{fontSize: 24, color: '#dc2626'}} />
          </Col>
          <Col flex="auto">
            <Title level={3} style={{margin: 0, color: '#b91c1c'}}>Historial de Mis Grupos</Title>
            <Text type="secondary" style={{fontSize: 13}}>Todos los cursos asignados históricos</Text>
          </Col>
        </Row>
      </Card>

      {historialCursos.length === 0 ? (
        <Alert 
          message="Sin grupos registrados" 
          type="info"
          icon={<BookOutlined />}
          style={{marginBottom: 24}}
        />
      ) : (
        <Card style={{marginBottom: 24}}>
          <List
            itemLayout="horizontal"
            dataSource={historialCursos}
            renderItem={(c: any) => (
              <List.Item style={{borderBottom: '1px solid #f0f0f0', padding: '16px 0'}}>
                <List.Item.Meta
                  avatar={
                    <div style={{
                      background: c.estado === 'activo' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                             : c.estado === 'finalizado' ? 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)' 
                             : 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                      color: 'white',
                      width: 40,
                      height: 40,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      <BookOutlined style={{fontSize: 18}} />
                    </div>
                  }
                  title={
                    <Row gutter={12} align="middle">
                      <Col flex="auto">
                        <Text strong style={{fontSize: 14}}>
                          {c.nombre}
                        </Text>
                      </Col>
                      <Col>
                        <Tag color={
                          c.estado === 'activo' ? 'green' 
                          : c.estado === 'finalizado' ? 'default' 
                          : 'blue'
                        }>
                          {c.estado ? c.estado.toUpperCase() : 'SIN-ESTADO'}
                        </Tag>
                      </Col>
                    </Row>
                  }
                  description={
                    <Row gutter={8} style={{marginTop: 8}}>
                      <Col>
                        <Tag icon={<ClockCircleOutlined />}>
                          {c.fecha_inicio ? dayjs(c.fecha_inicio).format('DD/MMM/YY') : '-'}
                        </Tag>
                      </Col>
                      <Col>
                        <Text type="secondary">→</Text>
                      </Col>
                      <Col>
                        <Tag icon={<ClockCircleOutlined />}>
                          {c.fecha_fin ? dayjs(c.fecha_fin).format('DD/MMM/YY') : '-'}
                        </Tag>
                      </Col>
                    </Row>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </>
  );
});