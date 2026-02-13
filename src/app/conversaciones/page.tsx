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

// Función para procesar markdown simple (**texto** → <strong>)
const formatAgentResponse = (text: string) => {
  if (!text) return text;
  
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  
  return (
    <span>
      {parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={idx}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </span>
  );
};

interface Conversation {
  id: string;
  phone_number: string;
  user_message: string;
  agent_response: string;
  transcription?: string;
  created_at: string;
  updated_at: string;
}

interface ConversationThread {
  phone_number: string;
  messages: Conversation[];
  total: number;
  last_date: string;
  last_user_message: string;
  last_agent_response: string;
}

export default function ConversacionesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phoneList, setPhoneList] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [loadingDelete, setLoadingDelete] = useState(false);

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

  const threads = useMemo<ConversationThread[]>(() => {
    const grouped = new Map<string, Conversation[]>();

    for (const conv of conversations) {
      if (!grouped.has(conv.phone_number)) {
        grouped.set(conv.phone_number, []);
      }
      grouped.get(conv.phone_number)!.push(conv);
    }

    const result: ConversationThread[] = [];
    for (const [phone, items] of grouped.entries()) {
      const sorted = items
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const last = sorted[sorted.length - 1];
      result.push({
        phone_number: phone,
        messages: sorted,
        total: sorted.length,
        last_date: last?.created_at || "",
        last_user_message: last?.user_message || "",
        last_agent_response: last?.agent_response || "",
      });
    }

    return result.sort(
      (a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime()
    );
  }, [conversations]);

  // Filtrar conversaciones por hilo
  const conversationsFiltradas = useMemo(() => {
    const query = searchText.toLowerCase();
    return threads.filter((thread) => {
      const matchPhone = !selectedPhone || thread.phone_number === selectedPhone;
      if (!matchPhone) return false;

      if (!query) return true;

      if (thread.phone_number.toLowerCase().includes(query)) return true;

      return thread.messages.some((conv) =>
        conv.user_message.toLowerCase().includes(query) ||
        conv.agent_response.toLowerCase().includes(query)
      );
    });
  }, [threads, searchText, selectedPhone]);

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

  // Eliminar conversaciones por número
  const eliminarConversacionesPorTelefono = async (phone: string) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("agent_conversations")
        .delete()
        .eq("phone_number", phone);

      if (error) throw error;

      setConversations((prev) => prev.filter((c) => c.phone_number !== phone));
      alert("Conversación eliminada");
    } catch (err) {
      console.error("Error eliminando:", err);
      alert("Error al eliminar");
    }
  };

  // Eliminar múltiples conversaciones
  const eliminarMultiples = async () => {
    if (selectedRows.length === 0) {
      alert("Selecciona al menos una conversación");
      return;
    }

    if (!window.confirm(`¿Eliminar ${selectedRows.length} conversaciones?`)) {
      return;
    }

    try {
      setLoadingDelete(true);
      const { error } = await supabaseBrowserClient
        .from("agent_conversations")
        .delete()
        .in("phone_number", selectedRows);

      if (error) throw error;

      setConversations((prev) =>
        prev.filter((c) => !selectedRows.includes(c.phone_number))
      );
      setSelectedRows([]);
      alert(`${selectedRows.length} conversaciones eliminadas`);
    } catch (err) {
      console.error("Error eliminando múltiples:", err);
      alert("Error al eliminar conversaciones");
    } finally {
      setLoadingDelete(false);
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
      title: "Ultima Pregunta",
      dataIndex: "last_user_message",
      key: "last_user_message",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text.substring(0, 60)}...</span>
        </Tooltip>
      ),
    },
    {
      title: "Ultima Respuesta",
      dataIndex: "last_agent_response",
      key: "last_agent_response",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={formatAgentResponse(text)}>
          <span>{formatAgentResponse(text.substring(0, 60))}...</span>
        </Tooltip>
      ),
    },
    {
      title: "Mensajes",
      dataIndex: "total",
      key: "total",
      width: 110,
      render: (total: number) => <Tag color="blue">{total}</Tag>,
    },
    {
      title: "Fecha",
      dataIndex: "last_date",
      key: "last_date",
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
      render: (_: any, record: ConversationThread) => (
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
                if (window.confirm("¿Eliminar esta conversación completa?")) {
                  eliminarConversacionesPorTelefono(record.phone_number);
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

      {/* Acciones en lote */}
      {selectedRows.length > 0 && (
        <Card
          style={{
            marginBottom: "24px",
            backgroundColor: "#e6f7ff",
            borderRadius: "12px",
            border: "1px solid #1890ff",
          }}
        >
          <Space>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>
              {selectedRows.length} conversación(es) seleccionada(s)
            </span>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={loadingDelete}
              onClick={eliminarMultiples}
            >
              Eliminar seleccionadas
            </Button>
            <Button onClick={() => setSelectedRows([])}>Limpiar selección</Button>
          </Space>
        </Card>
      )}

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
              rowKey="phone_number"
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="middle"
              scroll={{ x: 1200 }}
              rowSelection={{
                selectedRowKeys: selectedRows,
                onChange: (keys) => setSelectedRows(keys as string[]),
                selections: [
                  Table.SELECTION_ALL,
                  Table.SELECTION_INVERT,
                  Table.SELECTION_NONE,
                ],
              }}
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
            items={phoneConversations.flatMap((conv) => {
              const items = [] as Array<{ key: string; dot: React.ReactNode; children: React.ReactNode }>;

              if (conv.user_message) {
                items.push({
                  key: `${conv.id}-user`,
                  dot: <PhoneOutlined style={{ color: "#1890ff" }} />,
                  children: (
                    <Card
                      size="small"
                      style={{
                        marginBottom: "16px",
                        backgroundColor: "#f0f5ff",
                      }}
                    >
                      <Space direction="vertical" style={{ width: "100%" }} size="small">
                        <div>
                          <Badge status="processing" text={<strong>🙋 Lead</strong>} />
                        </div>

                        <div
                          style={{
                            backgroundColor: "#fff",
                            padding: "12px",
                            borderRadius: "6px",
                            borderLeft: "3px solid #1890ff",
                          }}
                        >
                          <p style={{ margin: 0 }}>{conv.user_message}</p>
                        </div>

                        <div style={{ fontSize: "12px", color: "#999" }}>
                          <ClockCircleOutlined /> {dayjs(conv.created_at).format("DD/MM/YYYY HH:mm:ss")}
                        </div>

                        {conv.transcription && (
                          <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                            <strong>Transcripción:</strong> {conv.transcription}
                          </div>
                        )}
                      </Space>
                    </Card>
                  ),
                });
              }

              if (conv.agent_response) {
                items.push({
                  key: `${conv.id}-agent`,
                  dot: <RobotOutlined style={{ color: "#52c41a" }} />,
                  children: (
                    <Card
                      size="small"
                      style={{
                        marginBottom: "16px",
                        backgroundColor: "#f6ffed",
                      }}
                    >
                      <Space direction="vertical" style={{ width: "100%" }} size="small">
                        <div>
                          <Badge status="success" text={<strong>🤖 Agente</strong>} />
                        </div>

                        <div
                          style={{
                            backgroundColor: "#fff",
                            padding: "12px",
                            borderRadius: "6px",
                            borderLeft: "3px solid #52c41a",
                          }}
                        >
                          <p style={{ margin: 0 }}>{formatAgentResponse(conv.agent_response)}</p>
                        </div>

                        <div style={{ fontSize: "12px", color: "#999" }}>
                          <ClockCircleOutlined /> {dayjs(conv.created_at).format("DD/MM/YYYY HH:mm:ss")}
                        </div>
                      </Space>
                    </Card>
                  ),
                });
              }

              return items;
            })}
          />
        )}
      </Drawer>
    </div>
  );
}
