"use client";

import React, { useEffect, useState } from "react";
import { 
  List, Card, Typography, Tag, Button, Row, Col, Spin, Statistic, Divider, Tooltip 
} from "antd";
import { 
  PlusOutlined, EditOutlined, EyeOutlined, 
  ClockCircleOutlined, DollarCircleOutlined, UserOutlined, BookOutlined 
} from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { createClient } from "@supabase/supabase-js";

const { Title, Text, Paragraph } = Typography;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CursosList() {
  const { edit, create, show } = useNavigation();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    setLoading(true);
    // Traemos el curso y el nombre del profesor
    const { data, error } = await supabase
      .from("cursos")
      .select(`*, perfiles (nombre_completo)`)
      .order("created_at", { ascending: false });

    if (!error) {
        setCursos(data || []);
    }
    setLoading(false);
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center" }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 30, alignItems: 'center' }}>
        <div>
            <Title level={2} style={{ marginBottom: 0 }}>💅 Oferta Académica</Title>
            <Text type="secondary">Gestiona tus programas y talleres</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => create("cursos")}>
          Nuevo Curso
        </Button>
      </div>

      <List
        grid={{
          gutter: 24,
          xs: 1,
          sm: 1,
          md: 2,
          lg: 3,
          xl: 3,
          xxl: 4,
        }}
        dataSource={cursos}
        renderItem={(curso) => (
          <List.Item>
            <Card
              hoverable
              style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f0f0f0' }}
              actions={[
                <Tooltip title="Ver Detalles" key="show">
                    <Button type="text" icon={<EyeOutlined />} onClick={() => show("cursos", curso.id)}>Ver</Button>
                </Tooltip>,
                <Tooltip title="Editar Info" key="edit">
                    <Button type="text" icon={<EditOutlined />} onClick={() => edit("cursos", curso.id)}>Editar</Button>
                </Tooltip>,
              ]}
              cover={
                  // Banner decorativo con gradiente (ya que aun no subimos fotos reales)
                  <div style={{ 
                      height: 100, 
                      background: curso.estado === 'activo' 
                        ? 'linear-gradient(135deg, #722ed1 0%, #b37feb 100%)' // Morado si activo
                        : 'linear-gradient(135deg, #8c8c8c 0%, #bfbfbf 100%)', // Gris si inactivo
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 40
                  }}>
                      <BookOutlined style={{ opacity: 0.5 }} />
                  </div>
              }
            >
              {/* Etiqueta de Estado Flotante */}
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                  <Tag color={curso.estado === 'activo' ? 'success' : 'default'}>
                      {curso.estado === 'activo' ? 'ACTIVO' : 'INACTIVO'}
                  </Tag>
              </div>

              <Card.Meta
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: 600 }} ellipsis={{ tooltip: curso.nombre }}>
                            {curso.nombre}
                        </Text>
                    </div>
                }
                description={
                    <div>
                        <Paragraph ellipsis={{ rows: 2 }} style={{ minHeight: 44, marginBottom: 10 }}>
                            {curso.descripcion || "Sin descripción disponible."}
                        </Paragraph>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5, color: '#595959' }}>
                            <UserOutlined /> <Text type="secondary">{curso.perfiles?.nombre_completo || "Sin Docente"}</Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#595959' }}>
                            <ClockCircleOutlined /> <Text type="secondary">{curso.duracion || "Duración N/A"}</Text>
                        </div>
                    </div>
                }
              />
              
              <Divider style={{ margin: '12px 0' }} />

              {/* Precios */}
              <Row gutter={8}>
                  <Col span={12}>
                      <Statistic 
                        title="Inscripción" 
                        value={curso.precio_inscripcion} 
                        prefix="$" 
                        valueStyle={{ fontSize: 16 }}
                        formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      />
                  </Col>
                  <Col span={12}>
                      <Statistic 
                        title="Mensualidad" 
                        value={curso.precio_mensualidad} 
                        prefix="$" 
                        valueStyle={{ fontSize: 16, color: '#722ed1' }}
                        formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      />
                  </Col>
              </Row>

            </Card>
          </List.Item>
        )}
      />
    </div>
  );
}