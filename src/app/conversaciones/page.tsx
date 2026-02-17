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
  Tabs,
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
  thread_key: string;
  phone_number: string;
  contact_name?: string;
  messages: Conversation[];
  total: number;
  last_date: string;
  last_user_message: string;
  last_agent_response: string;
  is_high_intent: boolean;
  asked_contact: boolean;
  asked_payment: boolean;
}

export default function ConversacionesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phoneList, setPhoneList] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [activeTab, setActiveTab] = useState("todos");

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const isUnknownPhone = (value?: string | null) => {
    const normalized = (value || "").trim().toLowerCase();
    return !normalized || normalized === "unknown" || normalized === "desconocido";
  };

  const getPhoneLabel = (value?: string | null) => {
    if (isUnknownPhone(value)) return "Sin número (Make/Webhook)";
    return value || "Sin número (Make/Webhook)";
  };

  const normalizePhoneForMatch = (value?: string | null) => {
    const digits = (value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10 && digits.startsWith("3")) {
      return `57${digits}`;
    }
    if (digits.startsWith("00") && digits.length > 2) {
      return digits.slice(2);
    }
    return digits;
  };

  const matchesAny = (text: string, patterns: RegExp[]) =>
    patterns.some((pattern) => pattern.test(text));

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

      const registros = (data || []) as Conversation[];
      setConversations(registros);

      // Extraer lista única de números de teléfono
      const phones = [...new Set(registros.map((c) => c.phone_number))];
      setPhoneList(phones);

      const [perfilesResult, leadsResult] = await Promise.all([
        supabaseBrowserClient
          .from("perfiles")
          .select("nombre_completo, telefono, telefono_2")
          .or("telefono.not.is.null,telefono_2.not.is.null")
          .limit(2000),
        supabaseBrowserClient
          .from("leads")
          .select("nombre, telefono")
          .not("telefono", "is", null)
          .limit(2000),
      ]);

      const namesByPhone: Record<string, string> = {};

      const registerName = (phoneValue?: string | null, nameValue?: string | null) => {
        const normalizedPhone = normalizePhoneForMatch(phoneValue);
        const normalizedName = (nameValue || "").trim();
        if (!normalizedPhone || !normalizedName) return;
        if (!namesByPhone[normalizedPhone]) {
          namesByPhone[normalizedPhone] = normalizedName;
        }
      };

      for (const perfil of (perfilesResult.data || []) as Array<any>) {
        registerName(perfil.telefono, perfil.nombre_completo);
        registerName(perfil.telefono_2, perfil.nombre_completo);
      }

      for (const lead of (leadsResult.data || []) as Array<any>) {
        registerName(lead.telefono, lead.nombre);
      }

      setContactNames(namesByPhone);
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
      const normalizedPhone = normalizePhoneForMatch(conv.phone_number);
      const threadKey = isUnknownPhone(conv.phone_number)
        ? `unknown:${conv.id}`
        : normalizedPhone || conv.phone_number;

      if (!grouped.has(threadKey)) {
        grouped.set(threadKey, []);
      }
      grouped.get(threadKey)!.push(conv);
    }

    const result: ConversationThread[] = [];
    for (const [threadKey, items] of grouped.entries()) {
      const sorted = items
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const last = sorted[sorted.length - 1];
      const displayPhone =
        sorted.find((item) => !isUnknownPhone(item.phone_number))?.phone_number ||
        sorted[0]?.phone_number ||
        "unknown";
      const contactName = contactNames[normalizePhoneForMatch(displayPhone)];
      const combined = sorted
        .map((item) => `${item.user_message} ${item.agent_response}`)
        .join(" ");
      const combinedNormalized = normalizeText(combined);

      const highIntentPatterns = [
        /quiero\s+(inscribirme|matricularme|inscribir|registrarme)/i,
        /quiero\s+matricularme/i,
        /quiero\s+inscribirme/i,
        /quiero\s+estudiar/i,
        /quiero\s+estudiarlo/i,
        /quiero\s+hacer\s+el\s+curso/i,
        /me\s+quiero\s+inscribir/i,
        /me\s+quiero\s+matricular/i,
        /como\s+me\s+(inscribo|registro)/i,
        /como\s+me\s+matriculo/i,
        /cuando\s+empieza/i,
        /cuando\s+inicia/i,
        /cuando\s+arranca/i,
        /como\s+hago\s+el\s+pago/i,
        /como\s+pago/i,
        /donde\s+(me\s+inscribo|pago)/i,
        /quiero\s+separar\s+cupo/i,
        /ya\s+quiero\s+(empezar|iniciar)/i,
      ];

      const contactPatterns = [
        /numero/i,
        /whatsapp/i,
        /admisiones/i,
        /contacto/i,
        /telefono/i,
      ];

      const paymentPatterns = [
        /medios\s+de\s+pago/i,
        /pago/i,
        /cuenta/i,
        /transferencia/i,
        /tarjeta/i,
        /nequi/i,
        /daviplata/i,
        /bancolombia/i,
        /cuota/i,
      ];

      const isHighIntent = matchesAny(combinedNormalized, highIntentPatterns);
      const askedContact = matchesAny(combinedNormalized, contactPatterns);
      const askedPayment = matchesAny(combinedNormalized, paymentPatterns);

      result.push({
        thread_key: threadKey,
        phone_number: displayPhone,
        contact_name: contactName,
        messages: sorted,
        total: sorted.length,
        last_date: last?.created_at || "",
        last_user_message: last?.user_message || "",
        last_agent_response: last?.agent_response || "",
        is_high_intent: isHighIntent,
        asked_contact: askedContact,
        asked_payment: askedPayment,
      });
    }

    return result.sort(
      (a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime()
    );
  }, [conversations, contactNames]);

  // Filtrar conversaciones por hilo
  const conversationsFiltradas = useMemo(() => {
    const query = searchText.toLowerCase();
    return threads.filter((thread) => {
      if (activeTab === "high" && !thread.is_high_intent) return false;
      if (activeTab === "contact" && !thread.asked_contact) return false;
      if (activeTab === "payment" && !thread.asked_payment) return false;

      const matchPhone = !selectedPhone || thread.phone_number === selectedPhone;
      if (!matchPhone) return false;

      if (!query) return true;

      if (thread.phone_number.toLowerCase().includes(query)) return true;

      return thread.messages.some((conv) =>
        conv.user_message.toLowerCase().includes(query) ||
        conv.agent_response.toLowerCase().includes(query)
      );
    });
  }, [threads, searchText, selectedPhone, activeTab]);

  // Estadísticas
  const stats = useMemo(() => {
    const knownPhones = phoneList.filter((phone) => !isUnknownPhone(phone));
    return {
      total: conversations.length,
      uniquePhones: knownPhones.length,
      today: conversations.filter((c) =>
        dayjs(c.created_at).isSame(dayjs(), "day")
      ).length,
    };
  }, [conversations, phoneList]);

  const tabCounts = useMemo(() => {
    return {
      all: threads.length,
      high: threads.filter((t) => t.is_high_intent).length,
      contact: threads.filter((t) => t.asked_contact).length,
      payment: threads.filter((t) => t.asked_payment).length,
    };
  }, [threads]);

  // Obtener conversación por teléfono
  const phoneConversations = useMemo(() => {
    if (!selectedThreadKey) return [];
    const thread = threads.find((item) => item.thread_key === selectedThreadKey);
    if (!thread) return [];
    return thread.messages
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [threads, selectedThreadKey]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadKey) return null;
    return threads.find((item) => item.thread_key === selectedThreadKey) || null;
  }, [threads, selectedThreadKey]);

  // Eliminar conversaciones por número
  const eliminarHilos = async (threadKeys: string[]) => {
    const threadMap = new Map(threads.map((thread) => [thread.thread_key, thread]));
    const idsToDelete = [...new Set(
      threadKeys.flatMap((key) => (threadMap.get(key)?.messages || []).map((m) => m.id))
    )];

    if (idsToDelete.length === 0) {
      alert("No se encontraron registros para eliminar");
      return;
    }

    try {
      setLoadingDelete(true);
      const { error } = await supabaseBrowserClient
        .from("agent_conversations")
        .delete()
        .in("id", idsToDelete);

      if (error) throw error;

      const deletedSet = new Set(idsToDelete);
      setConversations((prev) => prev.filter((c) => !deletedSet.has(c.id)));
      setSelectedRows((prev) => prev.filter((key) => !threadKeys.includes(key)));
      alert(threadKeys.length > 1 ? "Conversaciones eliminadas" : "Conversación eliminada");
    } catch (err) {
      console.error("Error eliminando:", err);
      alert("Error al eliminar");
    } finally {
      setLoadingDelete(false);
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
      await eliminarHilos(selectedRows);
    } catch (err) {
      console.error("Error eliminando múltiples:", err);
      alert("Error al eliminar conversaciones");
    }
  };

  // Columnas de tabla
  const columns = [
    {
      title: "Teléfono",
      dataIndex: "phone_number",
      key: "phone_number",
      render: (phone: string, record: ConversationThread) => (
        <div style={{ maxWidth: 180 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <PhoneOutlined />
            <span style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.2 }}>
              {getPhoneLabel(phone)}
            </span>
            {isUnknownPhone(phone) && (
              <Tag color="orange" style={{ marginInlineEnd: 0, whiteSpace: "normal" }}>
                Pendiente identificar
              </Tag>
            )}
          </div>
          {record.contact_name ? (
            <div style={{ marginTop: 4 }}>
              <Tag color="green" style={{ marginInlineEnd: 0, whiteSpace: "normal" }}>
                {record.contact_name}
              </Tag>
            </div>
          ) : null}
        </div>
      ),
      width: 190,
    },
    {
      title: "Ultima Pregunta",
      dataIndex: "last_user_message",
      key: "last_user_message",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text || ""}>
          <span>{text && text.length > 60 ? `${text.substring(0, 60)}...` : (text || "-")}</span>
        </Tooltip>
      ),
      width: 170,
    },
    {
      title: "Ultima Respuesta",
      dataIndex: "last_agent_response",
      key: "last_agent_response",
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={formatAgentResponse(text || "") }>
          <span>{text && text.length > 65 ? formatAgentResponse(`${text.substring(0, 65)}...`) : formatAgentResponse(text || "-")}</span>
        </Tooltip>
      ),
      width: 200,
    },
    {
      title: "Mensajes",
      dataIndex: "total",
      key: "total",
      width: 80,
      render: (total: number) => <Tag color="blue">{total}</Tag>,
    },
    {
      title: "Fecha",
      dataIndex: "last_date",
      key: "last_date",
      render: (date: string) => (
        <Space size="small" direction="vertical">
          <span>{dayjs(date).format("DD/MM HH:mm")}</span>
          <Tag>{dayjs(date).fromNow()}</Tag>
        </Space>
      ),
      width: 130,
    },
    {
      title: "Acciones",
      key: "actions",
      width: 105,
      render: (_: any, record: ConversationThread) => (
        <Space size="small">
          <Tooltip title="Ver conversación completa">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedThreadKey(record.thread_key);
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
                  eliminarHilos([record.thread_key]);
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
                label: contactNames[normalizePhoneForMatch(phone)]
                  ? `${contactNames[normalizePhoneForMatch(phone)]} · ${getPhoneLabel(phone)}`
                  : getPhoneLabel(phone),
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
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: "todos", label: `Todos (${tabCounts.all})` },
            { key: "high", label: `Alta intencion (${tabCounts.high})` },
            { key: "contact", label: `Pidio contacto (${tabCounts.contact})` },
            { key: "payment", label: `Medios de pago (${tabCounts.payment})` },
          ]}
          style={{ marginBottom: "12px" }}
        />
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
              rowKey="thread_key"
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="small"
              tableLayout="auto"
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
            Conversación: {selectedThread?.contact_name || getPhoneLabel(selectedThread?.phone_number)}
          </Space>
        }
        onClose={() => {
          setDrawerOpen(false);
          setSelectedThreadKey(null);
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
