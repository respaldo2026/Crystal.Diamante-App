import React from "react";
import { Card, Row, Col, Typography, List, Tag, Alert } from "antd";
import { DollarCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface PayrollHistoryProps {
  pagosNomina: any[];
}

export const PayrollHistory: React.FC<PayrollHistoryProps> = React.memo(({ pagosNomina }) => {
  return (
    <>
      <Card style={{background: 'linear-gradient(135deg, #f0fdf4 0%, #f0fef9 100%)', border: 'none', marginBottom: 24}}>
        <Row align="middle" gutter={16}>
          <Col>
            <DollarCircleOutlined style={{fontSize: 24, color: '#059669'}} />
          </Col>
          <Col flex="auto">
            <Title level={3} style={{margin: 0, color: '#047857'}}>Registro de Pagos</Title>
            <Text type="secondary" style={{fontSize: 13}}>Historial de nóminas procesadas</Text>
          </Col>
        </Row>
      </Card>

      {pagosNomina.length === 0 ? (
        <Alert 
          message="No tienes pagos registrados" 
          type="info"
          icon={<DollarCircleOutlined />}
          style={{marginBottom: 24}}
        />
      ) : (
        <Card style={{marginBottom: 24}}>
          <List
            itemLayout="horizontal"
            dataSource={pagosNomina}
            renderItem={(p: any) => (
              <List.Item style={{borderBottom: '1px solid #f0f0f0', padding: '16px 0'}}>
                <List.Item.Meta
                  avatar={
                    <div style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      color: 'white',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: 14
                    }}>
                      $
                    </div>
                  }
                  title={
                    <Row gutter={8}>
                      <Col>
                        <Text strong style={{fontSize: 15, color: '#059669'}}>
                          $ {Number(p.total_pagado || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}
                        </Text>
                      </Col>
                      <Col>
                        <Tag color="green">{p.total_horas || 0} horas</Tag>
                      </Col>
                    </Row>
                  }
                  description={
                    <Row gutter={16}>
                      <Col>
                        <Tag color="blue">
                          {dayjs(p.fecha_pago).format("DD/MMM/YYYY")}
                        </Tag>
                      </Col>
                      <Col>
                        <Text type="secondary" style={{fontSize: 12}}>
                          {p.observaciones || "Sin observaciones"}
                        </Text>
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