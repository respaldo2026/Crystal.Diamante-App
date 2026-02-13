"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  Tag,
  Drawer,
  Empty,
  Spin,
  Select,
  Row,
  Col,
  Statistic,
  Tooltip,
  Badge,
  Timeline,
  Divider,
} from "antd";
import {
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  RobotOutlined,
  BarsOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";

dayjs.extend(relativeTime);
dayjs.locale("es");

interface Conversation {
  id: string;
  phone_number: string;
  user_message: string;
  agent_response: string;
  transcription?: string;
  created_at: string;
  updated_at: string;
}

export default function ConversacionesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phoneList, setPhoneList] = useState<string[]>([]);

  // Cargar conversaciones
  const cargarConversaciones = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseBrowserClient
        .from("agent_conversations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando conversaciones:", error);
        return;
      }

      setConversations(data || []);

      // Extraer lista única de números de teléfono
      const phones = [...new Set((data || []).map((c) => c.phone_number))];
      setPhoneList(phones);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarConversaciones();
  }, []);

  // Filtrar conversaciones
  const conversationsFiltradas = useMemo(() => {
    return conversations.filter((conv) => {
      const matchSearch =
        conv.phone_number.toLowerCase().includes(searchText.toLowerCase()) ||
        conv.user_message.toLowerCase().includes(searchText.toLowerCase()) ||
        conv.agent_response.toLowerCase().includes(searchText.toLowerCase());

      const matchPhone = !selectedPhone || conv.phone_number === selectedPhone;

      return matchSearch && matchPhone;
    });
  }, [conversations, searchText, selectedPhone]);

  // Estadísticas
  const stats = useMemo(() => {
    return {
      total: conversations.length,
      uniquePhones: phoneList.length,
      today: conversations.filter((c) =>
        dayjs(c.created_at).isSame(dayjs(), "day")
      ).length,
    };
  }, [conversations, phoneList]);

  // Obtener conversación por teléfono
  const phoneConversations = useMemo(() => {
    if (!selectedPhone) return [];
    return conversations
      .filter((c) => c.phone_number === selectedPhone)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [conversations, selectedPhone]);

  // Eliminar conversación
  const eliminarConversacion = async (id: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("agent_conversations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setConversations((prev) => prev.filter((c) => c.id !== id));
      alert("Conversación eliminada");
    } catch (err) {
      console.error("Error eliminando:", err);
      alert("Error al eliminar");
    }
  };

  // Columnas de tabla
  const columns = [
    {
      title: "Teléfono",
      dataIndex: "phone_number",
      key: "phone_number",
      render: (phone: string) => (
        <Space>
          <PhoneOutlined />
          <span>{phone}</span>
        </Space>
      ),
      width: 150,
    },
    {
      title: "Pregunta del Lead",
      dataIndex: "user_message",
      key: "user_message",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text.substring(0, 60)}...</span>
        </Tooltip>
      ),
    },
    {
      title: "Respuesta del Agente",
      dataIndex: "agent_response",
      key: "agent_response",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text.substring(0, 60)}...</span>
        </Tooltip>
      ),
    },
    {
      title: "Fecha",
      dataIndex: "created_at",
      key: "created_at",
      render: (date: string) => (
        <Space size="small" direction="vertical">
          <span>{dayjs(date).format("DD/MM/YYYY HH:mm")}</span>
          <Tag>{dayjs(date).fromNow()}</Tag>
        </Space>
      ),
      width: 180,
    },
    {
      title: "Acciones",
      key: "actions",
      width: 120,
      render: (_: any, record: Conversation) => (
        <Space size="small">
          <Tooltip title="Ver conversación completa">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedPhone(record.phone_number);
                setDrawerOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Eliminar">
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => {
                if (window.confirm("¿Eliminar esta conversación?")) {
                  eliminarConversacion(record.id);
                }
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      {/* Encabezado */}
      <Card style={{ marginBottom: "24px", borderRadius: "12px" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <h1 style={{ margin: 0, marginBottom: "8px" }}>
              📞 Conversaciones del Agente
            </h1>
            <p style={{ margin: 0, color: "#666" }}>
              Visualiza todas las interacciones entre el agente de IA y los leads, con historial completo de preguntas y respuestas.
            </p>
          </div>

          {/* Estadísticas */}
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Statistic
                title="Total Conversaciones"
                value={stats.total}
                prefix={<MessageOutlined />}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Statistic
                title="Números Únicos"
                value={stats.uniquePhones}
                prefix={<PhoneOutlined />}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Statistic
                title="Hoy"
                value={stats.today}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      {/* Filtros y Búsqueda */}
      <Card style={{ marginBottom: "24px", borderRadius: "12px" }}>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <label style={{ fontWeight: "600", marginBottom: "8px", display: "block" }}>
              🔍 Buscar en conversaciones:
            </label>
            <Input
              placeholder="Buscar por teléfono, pregunta o respuesta..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="large"
            />
          </div>

          <div>
            <label style={{ fontWeight: "600", marginBottom: "8px", display: "block" }}>
              📱 Filtrar por número:
            </label>
            <Select
              placeholder="Selecciona un número de teléfono (opcional)"
              allowClear
              value={selectedPhone}
              onChange={setSelectedPhone}
              options={phoneList.map((phone) => ({
                label: phone,
                value: phone,
              }))}
              style={{ width: "100%" }}
              size="large"
            />
          </div>

          <Button onClick={cargarConversaciones} loading={loading}>
            ↻ Recargar
          </Button>
        </Space>
      </Card>

      {/* Tabla de Conversaciones */}
      <Card
        style={{ borderRadius: "12px" }}
        title={
          <Space>
            <BarsOutlined />
            Historial de Conversaciones ({conversationsFiltradas.length})
          </Space>
        }
      >
        <Spin spinning={loading}>
          {conversationsFiltradas.length === 0 ? (
            <Empty
              description={
                conversations.length === 0
                  ? "No hay conversaciones aún"
                  : "No se encontraron resultados"
              }
              style={{ padding: "60px 0" }}
            />
          ) : (
            <Table
              columns={columns}
              dataSource={conversationsFiltradas}
              rowKey="id"
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="middle"
              scroll={{ x: 1200 }}
            />
          )}
        </Spin>
      </Card>

      {/* Drawer: Conversación Completa */}
      <Drawer
        title={
          <Space>
            <PhoneOutlined />
            Conversación: {selectedPhone}
          </Space>
        }
        onClose={() => {
          setDrawerOpen(false);
          setSelectedPhone(null);
        }}
        open={drawerOpen}
        width={600}
        bodyStyle={{ padding: "24px" }}
      >
        {phoneConversations.length === 0 ? (
          <Empty description="No hay conversaciones para este número" />
        ) : (
          <Timeline
            items={phoneConversations.map((conv, idx) => ({
              key: conv.id,
              dot: idx % 2 === 0 ? <PhoneOutlined style={{ color: "#1890ff" }} /> : <RobotOutlined style={{ color: "#52c41a" }} />,
              children: (
                <Card
                  size="small"
                  style={{
                    marginBottom: "16px",
                    backgroundColor: idx % 2 === 0 ? "#f0f5ff" : "#f6ffed",
                  }}
                >
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    <div>
                      <Badge
                        status={idx % 2 === 0 ? "processing" : "success"}
                        text={
                          <strong>{idx % 2 === 0 ? "🙋 Lead" : "🤖 Agente"}</strong>
                        }
                      />
                    </div>

                    <div
                      style={{
                        backgroundColor: "#fff",
                        padding: "12px",
                        borderRadius: "6px",
                        borderLeft: `3px solid ${idx % 2 === 0 ? "#1890ff" : "#52c41a"}`,
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        {idx % 2 === 0 ? conv.user_message : conv.agent_response}
                      </p>
                    </div>

                    <div style={{ fontSize: "12px", color: "#999" }}>
                      <ClockCircleOutlined /> {dayjs(conv.created_at).format("DD/MM/YYYY HH:mm:ss")}
                    </div>

                    {conv.transcription && (
                      <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                        <strong>Transcripción:</strong> {conv.transcription}
                      </div>
                    )}

                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        if (window.confirm("¿Eliminar este mensaje?")) {
                          eliminarConversacion(conv.id);
                        }
                      }}
                    >
                      Eliminar
                    </Button>
                  </Space>
                </Card>
              ),
            }))}
          />
        )}
      </Drawer>
    </div>
  );
}
