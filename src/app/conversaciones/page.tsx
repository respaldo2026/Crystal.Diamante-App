"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Alert,
  App,
  Card,
  Table,
  Input,
  Button,
  Space,
  Tag,
  Drawer,
  Modal,
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
  Grid,
  Typography,
} from "antd";
import {
  SearchOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  RobotOutlined,
  BarsOutlined,
  FileTextOutlined,
  SendOutlined,
} from "@ant-design/icons";
import Image from "next/image";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { WHATSAPP_TEMPLATES } from "@/constants/whatsappTemplates";
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
  channel?: string | null;
  profile_name?: string | null;
  user_message: string;
  agent_response: string;
  transcription?: string;
  created_at: string;
  updated_at: string;
}

interface ConversationThread {
  thread_key: string;
  phone_number: string;
  channel: "instagram" | "whatsapp" | "unknown";
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

interface ChatBubbleItem {
  key: string;
  role: "user" | "agent";
  text: string;
  created_at: string;
  imageUrl?: string;
  imageCaption?: string;
  isTemplate?: boolean;
  templateName?: string;
}

type QuickReminderPreset = {
  key: string;
  label: string;
  description: string;
  buildMessage: (contactName?: string | null) => string;
};

const META_SAFE_WINDOW_HOURS = 22;
const WHATSAPP_FREE_WINDOW_HOURS = 24;

const QUICK_REMINDER_PRESETS: QuickReminderPreset[] = [
  {
    key: "seguimiento_interes",
    label: "Seguimiento de interés",
    description: "Retoma la conversación antes de que el lead se enfríe.",
    buildMessage: (contactName) =>
      `Hola${contactName ? ` ${contactName}` : ""} 😊 Te escribimos para no dejar enfriar tu proceso en Academia Crystal Diamante. Si todavía te interesa el curso, con gusto te ayudo a resolver tus dudas y a continuar con la inscripción.`,
  },
  {
    key: "recordatorio_cupo",
    label: "Recordar separación de cupo",
    description: "Recuerda el valor y el beneficio de separar el cupo hoy.",
    buildMessage: (contactName) =>
      `Hola${contactName ? ` ${contactName}` : ""} 😊 Te recuerdo que puedes separar tu cupo con *$190.000*. Ese valor ya incluye camisa uniforme, ceremonia de grado, certificado, alquiler de toga, guías y plataforma educativa. Si quieres, te comparto los medios de pago.`,
  },
  {
    key: "recordatorio_visita",
    label: "Invitar a visitar la sede",
    description: "Invita al lead a acercarse a la academia antes de perder la ventana.",
    buildMessage: (contactName) =>
      `Hola${contactName ? ` ${contactName}` : ""} 😊 Si quieres, puedes visitarnos en barrio Comuneros 1, cerca de la panadería Pablos Pan, en La Cosmetiquera, segundo piso. Si te sirve, te comparto la ubicación y te dejamos listo el siguiente paso para tu inscripción.`,
  },
];

const isSystemTemplateConversation = (conv: Pick<Conversation, "user_message" | "agent_response">) => {
  const user = String(conv.user_message || "").trim();
  const agent = String(conv.agent_response || "").trim();
  return user.startsWith("[SISTEMA]") && /📤\s*Plantilla enviada:/i.test(agent);
};

const isSystemConversation = (conv: Pick<Conversation, "user_message">) => {
  return String(conv.user_message || "").trim().startsWith("[SISTEMA]");
};

const getTemplateNameFromAudit = (agentText: string): string => {
  const match = String(agentText || "").match(/📤\s*Plantilla enviada:\s*([^\n]+)/i);
  return (match?.[1] || "Mensaje de plantilla").trim();
};

const extractTemplateRenderedTextFromAudit = (agentText: string): string => {
  const source = String(agentText || "");
  const match = source.match(/📝\s*Texto enviado:\s*([\s\S]*?)(?:\n(?:Idioma:|Variables:|Meta Message ID:)|$)/i);
  const rendered = String(match?.[1] || "").trim();
  if (!rendered || /^no disponible$/i.test(rendered)) return "";
  return rendered;
};

const getTemplateDisplayText = (agentText: string, renderedTemplateText?: string): string => {
  const auditRenderedText = extractTemplateRenderedTextFromAudit(agentText);
  if (auditRenderedText) return auditRenderedText;
  if (renderedTemplateText) return renderedTemplateText;

  const templateName = getTemplateNameFromAudit(agentText);
  const values = extractTemplateVariablesFromAudit(agentText);
  if (values.length > 0) {
    return `Plantilla enviada (${templateName})\nVariables: ${values.join(" | ")}`;
  }
  return `Plantilla enviada (${templateName})`;
};

const normalizeTemplateKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const extractTemplateVariablesFromAudit = (agentText: string): string[] => {
  const match = String(agentText || "").match(/Variables:\s*([^\n]+)/i);
  if (!match?.[1]) return [];
  const raw = match[1].trim();
  if (!raw || raw === "-") return [];
  return raw.split("|").map((item) => item.trim()).filter(Boolean);
};

const parseTemplateVariableNames = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const value = String(raw).trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // Si no es JSON valido, intentar parseo por comas
  }

  return value
    .replace(/[\[\]"]+/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const interpolateTemplateText = (
  templateText: string,
  values: string[],
  variableNames: string[] = []
) => {
  if (!templateText) return "";

  let output = templateText;

  values.forEach((value, index) => {
    const placeholder = index + 1;
    output = output.replace(new RegExp(`{{\\s*${placeholder}\\s*}}`, "g"), value);
  });

  variableNames.forEach((name, index) => {
    const value = values[index];
    if (!name || !value) return;
    output = output.replace(new RegExp(`{{\\s*${escapeRegExp(name)}\\s*}}`, "gi"), value);
  });

  return output;
};

const escapeHtml = (value: string) =>
  (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeWhatsAppReadableText = (value: string) => {
  let output = String(value || "");

  output = output
    .replace(/\bhttps?:\s*\/\/\s*/gi, (match) => (match.toLowerCase().startsWith("https") ? "https://" : "http://"))
    .replace(/\bwww\.\s*/gi, "www.")
    .replace(/instagram\.\s*com/gi, "instagram.com")
    .replace(/facebook\.\s*com/gi, "facebook.com")
    .replace(/wa\.\s*me/gi, "wa.me")
    .replace(/([a-z0-9])\s*\.\s*([a-z0-9])/gi, "$1.$2")
    .replace(/([a-z0-9])\s*\/\s*([a-z0-9])/gi, "$1/$2");

  let previous = "";
  while (previous !== output) {
    previous = output;
    output = output.replace(/(\d)\s*[.]\s*(\d{3}\b)/g, "$1.$2");
  }

  return output
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const formatWhatsAppTextToHtml = (value: string) => {
  const normalized = normalizeWhatsAppReadableText(value || "");
  const escaped = escapeHtml(normalized);
  const withCodeBlocks = escaped.replace(/```([\s\S]*?)```/g, (_match, content) => {
    return `<code class="wa-code-block">${content}</code>`;
  });

  const withInlineCode = withCodeBlocks.replace(/`([^`\n]+)`/g, "<code class=\"wa-code\">$1</code>");
  const withBold = withInlineCode.replace(/\*(?=\S)([^*\n]*?\S)\*/g, "<strong>$1</strong>");
  const withItalic = withBold.replace(/_(?=\S)([^_\n]*?\S)_/g, "<em>$1</em>");
  const withStrike = withItalic.replace(/~(?=\S)([^~\n]*?\S)~/g, "<s>$1</s>");

  return withStrike;
};

interface SocialLinkPreview {
  url: string;
  platform: string;
  title: string;
  subtitle: string;
}

const normalizeUrlForPreview = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const extractSocialLinkPreview = (text: string): SocialLinkPreview | null => {
  if (!text) return null;

  const match = text.match(/((?:https?:\/\/|www\.)[^\s<]+)/i);
  if (!match || !match[1]) return null;

  const normalizedUrl = normalizeUrlForPreview(match[1]);
  let hostname = "";
  try {
    hostname = new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  const host = hostname.replace(/^www\./, "");

  const platforms: Array<{ domains: string[]; title: string; subtitle: string }> = [
    { domains: ["instagram.com"], title: "Instagram", subtitle: "Ver perfil/publicación" },
    { domains: ["facebook.com", "fb.com"], title: "Facebook", subtitle: "Ver página/publicación" },
    { domains: ["youtube.com", "youtu.be"], title: "YouTube", subtitle: "Ver video/canal" },
    { domains: ["tiktok.com"], title: "TikTok", subtitle: "Ver perfil/video" },
    { domains: ["maps.app.goo.gl", "google.com", "goo.gl"], title: "Google Maps", subtitle: "Ver ubicación" },
  ];

  const platform = platforms.find((item) =>
    item.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  );

  if (!platform) return null;

  return {
    url: normalizedUrl,
    platform: platform.title,
    title: platform.title,
    subtitle: platform.subtitle,
  };
};

const buildWhatsAppPreviewHtml = (threadLabel: string, messages: ChatBubbleItem[]) => {
  const bubbles = messages
    .map((item) => {
      const bubbleClass = item.role === "user" ? "bubble user" : "bubble agent";
      const sender = item.role === "user" ? "Estudiante" : "Agente";
      const content = formatWhatsAppTextToHtml(item.text);
      const time = dayjs(item.created_at).format("DD/MM/YYYY HH:mm");

      return `
        <div class="row ${item.role}">
          <div class="${bubbleClass}">
            <div class="sender">${sender}</div>
            <div class="content">${content}</div>
            <div class="time">${time}</div>
          </div>
        </div>
      `;
    })
    .join("\n");

  return `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vista WhatsApp - ${escapeHtml(threadLabel)}</title>
    <style>
      body { margin: 0; font-family: Roboto, "Noto Sans", Arial, sans-serif; background: #0b141a; }
      .app { max-width: 430px; margin: 0 auto; min-height: 100vh; background: #e5ddd5; }
      .header { background: #075e54; color: #fff; padding: 14px 16px; font-weight: 600; }
      .subheader { font-size: 12px; opacity: 0.9; margin-top: 4px; }
      .chat { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .row { display: flex; width: 100%; }
      .row.user { justify-content: flex-start; }
      .row.agent { justify-content: flex-end; }
      .bubble { max-width: 84%; border-radius: 7.5px; padding: 6px 8px; box-shadow: 0 1px 0 rgba(0,0,0,.08); }
      .bubble.user { background: #fff; }
      .bubble.agent { background: #d9fdd3; }
      .sender { display: none; }
      .content { font-size: 14.2px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; tab-size: 4; color: #111b21; }
      .content strong { font-weight: 700; }
      .content em { font-style: italic; }
      .content s { text-decoration: line-through; }
      .content .wa-code, .content .wa-code-block {
        font-family: Consolas, Monaco, 'Courier New', monospace;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 4px;
      }
      .content .wa-code { padding: 1px 4px; }
      .content .wa-code-block {
        display: block;
        padding: 8px;
        white-space: pre-wrap;
        margin: 4px 0;
      }
      .time { font-size: 11px; color: #667781; text-align: right; margin-top: 4px; }
      @media print {
        .app { max-width: 430px; }
        .header { position: sticky; top: 0; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <div class="header">
        ${escapeHtml(threadLabel)}
        <div class="subheader">Exportación rápida tipo WhatsApp</div>
      </div>
      <div class="chat">
        ${bubbles}
      </div>
    </div>
  </body>
</html>`;
};

export default function ConversacionesPage() {
  const { message } = App.useApp();
  const { Text } = Typography;
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReminderKey, setSelectedReminderKey] = useState<string>(QUICK_REMINDER_PRESETS[0]?.key || "seguimiento_interes");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [templateCatalogByKey, setTemplateCatalogByKey] = useState<
    Record<string, { text: string; variableNames: string[] }>
  >({});

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const isUnknownPhone = (value?: string | null) => {
    const normalized = (value || "").trim().toLowerCase();
    return !normalized || normalized === "unknown" || normalized === "desconocido";
  };

  const getConversationChannel = (value?: string | null, explicitChannel?: string | null): "instagram" | "whatsapp" | "unknown" => {
    const explicit = String(explicitChannel || "").toLowerCase().trim();
    if (explicit === "instagram" || explicit === "whatsapp") {
      return explicit;
    }

    const raw = (value || "").trim().toLowerCase();
    if (!raw || raw === "unknown" || raw === "desconocido") return "unknown";
    if (raw.startsWith("ig:")) return "instagram";
    // Salvaguarda: IDs de 16+ dígitos son PSIDs de Instagram (wa_id telefónico max 15 dígitos)
    if (/^\d{16,}$/.test(raw)) return "instagram";
    return "whatsapp";
  };

  const getPhoneLabel = (value?: string | null) => {
    if (isUnknownPhone(value)) return "Sin número (Make/Webhook)";
    if ((value || "").toLowerCase().startsWith("ig:")) {
      return `Instagram (${value?.slice(3) || "sin id"})`;
    }
    return value || "Sin número (Make/Webhook)";
  };

  const normalizePhoneForMatch = useCallback((value?: string | null) => {
    const raw = (value || "").trim().toLowerCase();
    if (raw.startsWith("ig:")) return raw;

    const digits = (value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10 && digits.startsWith("3")) {
      return `57${digits}`;
    }
    if (digits.startsWith("00") && digits.length > 2) {
      return digits.slice(2);
    }
    return digits;
  }, []);

  const matchesAny = (text: string, patterns: RegExp[]) =>
    patterns.some((pattern) => pattern.test(text));

  // Cargar conversaciones
  const cargarConversaciones = useCallback(async () => {
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

      const { data: templatesData, error: templatesError } = await supabaseBrowserClient
        .from("plantillas_whatsapp")
        .select("nombre, plantilla, variables")
        .limit(500);

      if (templatesError) {
        console.warn("No se pudieron cargar plantillas para previsualizacion:", templatesError.message);
      }

      const templateMap: Record<string, { text: string; variableNames: string[] }> = {};

      for (const definition of Object.values(WHATSAPP_TEMPLATES)) {
        const key = normalizeTemplateKey(definition.nombre);
        if (!key) continue;
        templateMap[key] = {
          text: String(definition.fallback || "").trim(),
          variableNames: Array.isArray(definition.variables) ? definition.variables : [],
        };
      }

      for (const tpl of (templatesData || []) as Array<{ nombre?: string | null; plantilla?: string | null; variables?: unknown }>) {
        const key = normalizeTemplateKey(tpl.nombre || "");
        const text = String(tpl.plantilla || "").trim();
        if (!key || !text) continue;
        templateMap[key] = {
          text,
          variableNames: parseTemplateVariableNames(tpl.variables),
        };
      }

      setTemplateCatalogByKey(templateMap);

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
  }, [normalizePhoneForMatch]);

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  useEffect(() => {
    setSelectedReminderKey(QUICK_REMINDER_PRESETS[0]?.key || "seguimiento_interes");
  }, [selectedThreadKey]);

  const threads = useMemo<ConversationThread[]>(() => {
    const grouped = new Map<string, Conversation[]>();

    for (const conv of conversations) {
      const channel = getConversationChannel(conv.phone_number, conv.channel);
      const normalizedPhone = normalizePhoneForMatch(conv.phone_number);
      const baseIdentity = String(conv.phone_number || "").toLowerCase().startsWith("ig:")
        ? String(conv.phone_number || "").toLowerCase()
        : normalizedPhone || String(conv.phone_number || "").toLowerCase();
      const threadKey = isUnknownPhone(conv.phone_number)
        ? `unknown:${conv.id}`
        : `${channel}:${baseIdentity}`;

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
      const channel = getConversationChannel(displayPhone, sorted[sorted.length - 1]?.channel);
      const profileName = sorted
        .slice()
        .reverse()
        .map((item) => String(item.profile_name || "").trim())
        .find(Boolean);
      const contactName = contactNames[normalizePhoneForMatch(displayPhone)];
      const combined = sorted
        .map((item) => `${item.user_message} ${item.agent_response}`)
        .join(" ");
      const combinedNormalized = normalizeText(combined);
      const lastUserByLead = sorted
        .slice()
        .reverse()
        .find((item) => !isSystemTemplateConversation(item) && String(item.user_message || "").trim());

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
        channel,
        contact_name: contactName || profileName,
        messages: sorted,
        total: sorted.length,
        last_date: last?.created_at || "",
        last_user_message: lastUserByLead?.user_message || "",
        last_agent_response: last?.agent_response || "",
        is_high_intent: isHighIntent,
        asked_contact: askedContact,
        asked_payment: askedPayment,
      });
    }

    return result.sort(
      (a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime()
    );
  }, [conversations, contactNames, normalizePhoneForMatch]);

  // Filtrar conversaciones por hilo
  const conversationsFiltradas = useMemo(() => {
    const query = searchText.toLowerCase();
    return threads.filter((thread) => {
      if (activeTab === "high" && !thread.is_high_intent) return false;
      if (activeTab === "contact" && !thread.asked_contact) return false;
      if (activeTab === "payment" && !thread.asked_payment) return false;
      if (activeTab === "instagram" && thread.channel !== "instagram") return false;
      if (activeTab === "whatsapp" && thread.channel !== "whatsapp") return false;

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
      whatsapp: threads.filter((t) => t.channel === "whatsapp").length,
      instagram: threads.filter((t) => t.channel === "instagram").length,
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

  const lastInboundConversation = useMemo(() => {
    return phoneConversations
      .slice()
      .reverse()
      .find((conv) => !isSystemTemplateConversation(conv) && String(conv.user_message || "").trim()) || null;
  }, [phoneConversations]);

  const reminderPreset = useMemo<QuickReminderPreset>(
    () =>
      QUICK_REMINDER_PRESETS.find((item) => item.key === selectedReminderKey)
      || QUICK_REMINDER_PRESETS[0]
      || {
        key: "seguimiento_interes",
        label: "Seguimiento de interés",
        description: "Retoma la conversación antes de que el lead se enfríe.",
        buildMessage: (contactName) =>
          `Hola${contactName ? ` ${contactName}` : ""} 😊 Te escribimos para no dejar enfriar tu proceso en Academia Crystal Diamante.`,
      },
    [selectedReminderKey]
  );

  const reminderPreviewText = useMemo(
    () => reminderPreset.buildMessage(selectedThread?.contact_name),
    [reminderPreset, selectedThread?.contact_name]
  );

  const reminderWindowState = useMemo(() => {
    const channel = selectedThread?.channel || "unknown";
    const isWhatsappThread = channel === "whatsapp";
    const normalizedPhone = normalizePhoneForMatch(selectedThread?.phone_number);
    const hasReachablePhone = Boolean(normalizedPhone) && !normalizedPhone.startsWith("ig:");

    if (!selectedThread) {
      return {
        enabled: false,
        severity: "info" as const,
        title: "Selecciona una conversación",
        description: "Abre un hilo para ver y enviar un recordatorio rápido.",
        elapsedHours: null as number | null,
        remainingSafeHours: null as number | null,
      };
    }

    if (!isWhatsappThread || !hasReachablePhone) {
      return {
        enabled: false,
        severity: "warning" as const,
        title: "Disponible solo para WhatsApp",
        description: "Los recordatorios rápidos solo se pueden enviar a conversaciones de WhatsApp con número válido.",
        elapsedHours: null as number | null,
        remainingSafeHours: null as number | null,
      };
    }

    if (!lastInboundConversation?.created_at) {
      return {
        enabled: false,
        severity: "warning" as const,
        title: "No hay mensaje reciente del cliente",
        description: "No encontramos el último mensaje del lead para validar la ventana segura de envío.",
        elapsedHours: null as number | null,
        remainingSafeHours: null as number | null,
      };
    }

    const now = dayjs();
    const lastInboundAt = dayjs(lastInboundConversation.created_at);
    const elapsedMinutes = Math.max(now.diff(lastInboundAt, "minute"), 0);
    const elapsedHours = elapsedMinutes / 60;
    const remainingSafeHours = Math.max(META_SAFE_WINDOW_HOURS - elapsedHours, 0);
    const remainingFreeHours = Math.max(WHATSAPP_FREE_WINDOW_HOURS - elapsedHours, 0);

    if (elapsedHours >= META_SAFE_WINDOW_HOURS) {
      return {
        enabled: false,
        severity: "error" as const,
        title: "Bloqueado por seguridad",
        description: `Ya pasaron ${elapsedHours.toFixed(1)} horas desde el último mensaje del cliente. Desde las 22 horas bloqueamos este recordatorio para evitar riesgos con Meta.`,
        elapsedHours,
        remainingSafeHours,
        remainingFreeHours,
      };
    }

    const severity = elapsedHours >= 20 ? "warning" as const : "success" as const;
    return {
      enabled: true,
      severity,
      title: elapsedHours >= 20 ? "Ventana por vencer" : "Ventana segura activa",
      description:
        elapsedHours >= 20
          ? `Han pasado ${elapsedHours.toFixed(1)} horas desde el último mensaje del cliente. Aún puedes enviar este recordatorio, pero solo quedan ${remainingSafeHours.toFixed(1)} horas antes del bloqueo automático.`
          : `Han pasado ${elapsedHours.toFixed(1)} horas desde el último mensaje del cliente. Puedes enviar un recordatorio rápido antes de cumplir ${META_SAFE_WINDOW_HOURS} horas.`,
      elapsedHours,
      remainingSafeHours,
      remainingFreeHours,
    };
  }, [lastInboundConversation, normalizePhoneForMatch, selectedThread]);

  const previewMessages = useMemo<ChatBubbleItem[]>(() => {
    if (!phoneConversations.length) return [];

    return phoneConversations.flatMap((conv) => {
      const items: ChatBubbleItem[] = [];
      const isTemplateAudit = isSystemTemplateConversation(conv);

      if ((conv.user_message || "").trim() && !isTemplateAudit && !isSystemConversation(conv)) {
        items.push({
          key: `${conv.id}-user`,
          role: "user",
          text: conv.user_message,
          created_at: conv.created_at,
        });
      }
      const rawAgentText = (conv.agent_response || "").trim();
      const templateName = isTemplateAudit ? getTemplateNameFromAudit(rawAgentText) : "";
      const templateDefinition = templateCatalogByKey[normalizeTemplateKey(templateName)];
      const renderedTemplateText = templateDefinition
        ? interpolateTemplateText(
            templateDefinition.text,
            extractTemplateVariablesFromAudit(rawAgentText),
            templateDefinition.variableNames
          )
        : "";
      const agentText = isTemplateAudit
        ? getTemplateDisplayText(rawAgentText, renderedTemplateText)
        : rawAgentText;
      if (agentText) {
        // Detectar marcador de imagen: [📷 URL|caption]\n
        const imgMatch = agentText.match(/^\[📷 ([^\|\]]+)\|([^\]]*)\]\n?/);
        if (imgMatch && imgMatch[1]) {
          items.push({
            key: `${conv.id}-img`,
            role: "agent",
            text: "",
            imageUrl: imgMatch[1].trim(),
            imageCaption: (imgMatch[2] ?? "").trim(),
            created_at: conv.created_at,
            isTemplate: isTemplateAudit,
            templateName: templateName || undefined,
          });
          const textWithoutMarker = agentText.replace(/^\[📷 [^\]]+\]\n?/, "").trim();
          if (textWithoutMarker) {
            items.push({
              key: `${conv.id}-agent`,
              role: "agent",
              text: textWithoutMarker,
              created_at: conv.created_at,
              isTemplate: isTemplateAudit,
              templateName: templateName || undefined,
            });
          }
        } else {
          items.push({
            key: `${conv.id}-agent`,
            role: "agent",
            text: agentText,
            created_at: conv.created_at,
            isTemplate: isTemplateAudit,
            templateName: templateName || undefined,
          });
        }
      }
      return items;
    });
  }, [phoneConversations, templateCatalogByKey]);

  const previewLabel = selectedThread?.contact_name || getPhoneLabel(selectedThread?.phone_number);

  const abrirHilo = (threadKey: string) => {
    setSelectedThreadKey(threadKey);
    setDrawerOpen(true);
  };

  const abrirPreviewWhatsApp = (threadKey: string) => {
    setSelectedThreadKey(threadKey);
    setPreviewOpen(true);
  };

  const enviarRecordatorioRapido = async () => {
    if (!selectedThread || !reminderWindowState.enabled || !reminderPreviewText.trim()) {
      return;
    }

    try {
      setSendingReminder(true);
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: selectedThread.phone_number,
          type: "text",
          message: reminderPreviewText,
          auditEntry: {
            userMessage: `[SISTEMA] Recordatorio rápido manual · ${reminderPreset.label}`,
            agentResponse: reminderPreviewText,
            transcription: null,
            channel: "whatsapp",
            profileName: selectedThread.contact_name || null,
          },
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "No se pudo enviar el recordatorio");
      }

      message.success("Recordatorio enviado y guardado en la conversación");
      await cargarConversaciones();
    } catch (error) {
      console.error("Error enviando recordatorio rápido:", error);
      message.error(error instanceof Error ? error.message : "No se pudo enviar el recordatorio");
    } finally {
      setSendingReminder(false);
    }
  };

  const abrirPreviewEnPestana = () => {
    if (!previewMessages.length) return;
    const html = buildWhatsAppPreviewHtml(previewLabel, previewMessages);
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const imprimirPreview = () => {
    if (!previewMessages.length) return;
    const html = buildWhatsAppPreviewHtml(previewLabel, previewMessages);
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

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

  const compactPreview = (text: string, maxChars = 90) => {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "-";
    return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
  };

  const toggleThreadSelection = (threadKey: string) => {
    setSelectedRows((prev) =>
      prev.includes(threadKey)
        ? prev.filter((item) => item !== threadKey)
        : [...prev, threadKey]
    );
  };

  // Columnas de tabla
  const columns = [
    {
      title: (
        <Tooltip title="Teléfono / Contacto">
          <span>📞</span>
        </Tooltip>
      ),
      dataIndex: "phone_number",
      key: "phone_number",
      render: (phone: string, record: ConversationThread) => (
        <div style={{ maxWidth: 210 }}>
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
      width: 210,
    },
    {
      title: (
        <Tooltip title="Última pregunta del lead">
          <span>🙋</span>
        </Tooltip>
      ),
      dataIndex: "last_user_message",
      key: "last_user_message",
      render: (text: string) => (
        <Tooltip title={text || ""}>
          <span
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.25,
            }}
          >
            {compactPreview(text, 180)}
          </span>
        </Tooltip>
      ),
      width: 380,
    },
    {
      title: (
        <Tooltip title="Cantidad de mensajes">
          <span>💬</span>
        </Tooltip>
      ),
      dataIndex: "total",
      key: "total",
      width: 70,
      render: (total: number) => <Tag color="blue">{total}</Tag>,
    },
    {
      title: (
        <Tooltip title="Fecha de último mensaje">
          <span>🕒</span>
        </Tooltip>
      ),
      dataIndex: "last_date",
      key: "last_date",
      render: (date: string) => (
        <Space size={2} direction="vertical">
          <span>{dayjs(date).format("DD/MM HH:mm")}</span>
          <Tag style={{ marginInlineEnd: 0 }}>{dayjs(date).fromNow()}</Tag>
        </Space>
      ),
      width: 120,
    },
    {
      title: (
        <Tooltip title="Acciones">
          <span>⚙️</span>
        </Tooltip>
      ),
      key: "actions",
      width: 110,
      render: (_: any, record: ConversationThread) => (
        <Space size={4}>
          <Tooltip title="Abrir hilo y acciones rápidas">
            <Button
              size="small"
              icon={<MessageOutlined />}
              onClick={() => abrirHilo(record.thread_key)}
            />
          </Tooltip>
          <Tooltip title="Ver conversación completa tipo WhatsApp">
            <Button
              type="primary"
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => abrirPreviewWhatsApp(record.thread_key)}
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
            { key: "whatsapp", label: `WhatsApp (${tabCounts.whatsapp})` },
            { key: "instagram", label: `Instagram (${tabCounts.instagram})` },
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
            isMobile ? (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                {conversationsFiltradas.map((record) => {
                  const isSelected = selectedRows.includes(record.thread_key);
                  return (
                    <Card
                      key={record.thread_key}
                      size="small"
                      style={{ borderRadius: 10 }}
                      bodyStyle={{ padding: 12 }}
                    >
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
                          <Space size={6}>
                            <PhoneOutlined />
                            <span style={{ fontWeight: 600 }}>{getPhoneLabel(record.phone_number)}</span>
                          </Space>
                          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{record.total}</Tag>
                        </Space>

                        {record.contact_name ? (
                          <Tag color="green" style={{ width: "fit-content" }}>{record.contact_name}</Tag>
                        ) : null}

                        <div style={{ fontSize: 13, lineHeight: 1.35 }}>
                          {compactPreview(record.last_user_message, 160)}
                        </div>

                        <span style={{ fontSize: 12, color: "#8c8c8c" }}>
                          {dayjs(record.last_date).format("DD/MM HH:mm")} · {dayjs(record.last_date).fromNow()}
                        </span>

                        <Space wrap>
                          <Button
                            size="small"
                            icon={<MessageOutlined />}
                            onClick={() => abrirHilo(record.thread_key)}
                          >
                            Hilo
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={() => abrirPreviewWhatsApp(record.thread_key)}
                          >
                            WhatsApp
                          </Button>
                          <Button
                            size="small"
                            onClick={() => toggleThreadSelection(record.thread_key)}
                          >
                            {isSelected ? "Quitar selección" : "Seleccionar"}
                          </Button>
                          <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              if (window.confirm("¿Eliminar esta conversación completa?")) {
                                eliminarHilos([record.thread_key]);
                              }
                            }}
                          >
                            Borrar
                          </Button>
                        </Space>
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            ) : (
              <Table
                columns={columns}
                dataSource={conversationsFiltradas}
                rowKey="thread_key"
                pagination={{ pageSize: 20, showSizeChanger: true }}
                size="small"
                tableLayout="fixed"
                scroll={{ x: 880 }}
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
            )
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
        extra={
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => setPreviewOpen(true)}
            disabled={!phoneConversations.length}
          >
            Vista WhatsApp
          </Button>
        }
        onClose={() => {
          setDrawerOpen(false);
          setSelectedThreadKey(null);
        }}
        open={drawerOpen}
        width={600}
        bodyStyle={{ padding: "24px" }}
      >
          <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <Text strong>Recordatorio rápido</Text>
                <div style={{ color: "#667085", marginTop: 4 }}>
                  Envía un seguimiento prediseñado solo dentro de la ventana segura de WhatsApp.
                </div>
              </div>

              <Alert
                type={reminderWindowState.severity}
                showIcon
                message={reminderWindowState.title}
                description={reminderWindowState.description}
              />

              <Row gutter={[12, 12]}>
                <Col xs={24} md={12}>
                  <Card size="small" style={{ borderRadius: 10, background: "#fafafa" }}>
                    <Statistic
                      title="Último mensaje del cliente"
                      value={lastInboundConversation?.created_at ? dayjs(lastInboundConversation.created_at).fromNow() : "Sin dato"}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" style={{ borderRadius: 10, background: "#fafafa" }}>
                    <Statistic
                      title="Horas seguras restantes"
                      value={reminderWindowState.remainingSafeHours !== null ? reminderWindowState.remainingSafeHours.toFixed(1) : "-"}
                      suffix="h"
                    />
                  </Card>
                </Col>
              </Row>

              <div>
                <Text strong>Plantilla prediseñada</Text>
                <Select
                  style={{ width: "100%", marginTop: 8 }}
                  value={selectedReminderKey}
                  onChange={setSelectedReminderKey}
                  options={QUICK_REMINDER_PRESETS.map((preset) => ({
                    label: `${preset.label} · ${preset.description}`,
                    value: preset.key,
                  }))}
                  disabled={!selectedThread || selectedThread.channel !== "whatsapp"}
                />
              </div>

              <div>
                <Text strong>Vista previa</Text>
                <div
                  style={{
                    marginTop: 8,
                    border: "1px solid #E5E7EB",
                    borderRadius: 10,
                    padding: 12,
                    background: "#FAFAFA",
                    whiteSpace: "pre-wrap",
                    color: "#111827",
                    lineHeight: 1.45,
                  }}
                >
                  {reminderPreviewText}
                </div>
              </div>

              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={enviarRecordatorioRapido}
                loading={sendingReminder}
                disabled={!reminderWindowState.enabled}
              >
                Enviar recordatorio rápido
              </Button>
            </Space>
          </Card>

        {phoneConversations.length === 0 ? (
          <Empty description="No hay conversaciones para este número" />
        ) : (
          <Timeline
            items={phoneConversations.flatMap((conv) => {
              const items = [] as Array<{ key: string; dot: React.ReactNode; children: React.ReactNode }>;
              const isTemplateAudit = isSystemTemplateConversation(conv);
              const templateName = getTemplateNameFromAudit(conv.agent_response || "");
              const templateDefinition = templateCatalogByKey[normalizeTemplateKey(templateName)];
              const renderedTemplateText = templateDefinition
                ? interpolateTemplateText(
                    templateDefinition.text,
                    extractTemplateVariablesFromAudit(conv.agent_response || ""),
                    templateDefinition.variableNames
                  )
                : "";

              if (conv.user_message && !isTemplateAudit && !isSystemConversation(conv)) {
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
                          <Badge
                            status="success"
                            text={
                              <strong>
                                {isTemplateAudit ? "🤖 Agente · Plantilla" : "🤖 Agente"}
                              </strong>
                            }
                          />
                        </div>

                        <div
                          style={{
                            backgroundColor: "#fff",
                            padding: "12px",
                            borderRadius: "6px",
                            borderLeft: "3px solid #52c41a",
                          }}
                        >
                          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                            {formatAgentResponse(
                              isTemplateAudit
                                ? getTemplateDisplayText(conv.agent_response || "", renderedTemplateText)
                                : conv.agent_response
                            )}
                          </p>
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

      <Modal
        title={`Vista tipo WhatsApp: ${previewLabel || "Conversación"}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width="94vw"
        style={{ maxWidth: 1280, top: 12 }}
        footer={null}
        bodyStyle={{ padding: 0, background: "#0b141a" }}
      >
        <div style={{ maxHeight: "86vh", overflow: "auto", background: "#0b141a", padding: 12 }}>
          <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "84vh", background: "#e5ddd5", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {previewMessages.length === 0 ? (
              <Empty description="No hay mensajes para previsualizar" style={{ padding: "28px 0" }} />
            ) : (
              previewMessages.map((item) => {
                const isUser = item.role === "user";
                const socialLink = !item.imageUrl ? extractSocialLinkPreview(item.text) : null;
                const textWithoutSocialLink = socialLink
                  ? item.text.replace(socialLink.url, "").trim()
                  : item.text;
                return (
                  <div
                    key={item.key}
                    style={{ display: "flex", justifyContent: isUser ? "flex-start" : "flex-end" }}
                  >
                    <div
                      style={{
                        maxWidth: "84%",
                        background: isUser ? "#fff" : "#d9fdd3",
                        borderRadius: 7.5,
                        padding: "6px 8px",
                        boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
                      }}
                    >
                      {item.isTemplate && (
                        <div style={{ marginBottom: 6 }}>
                          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                            {item.templateName ? `Plantilla: ${item.templateName}` : "Plantilla"}
                          </Tag>
                        </div>
                      )}
                      <div style={{ display: "none", fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#54656f" }}>
                        {isUser ? "Estudiante" : "Agente"}
                      </div>
                      {item.imageUrl ? (
                        <div style={{ overflow: "hidden", borderRadius: 4 }}>
                          <Image
                            src={item.imageUrl}
                            alt={item.imageCaption || "Imagen enviada"}
                            width={420}
                            height={220}
                            unoptimized
                            style={{ width: "100%", display: "block", borderRadius: 4, maxHeight: 220, objectFit: "cover" }}
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                          {item.imageCaption && (
                            <div style={{ fontSize: 13, color: "#111b21", padding: "4px 2px 2px" }}>{item.imageCaption}</div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {socialLink && (
                            <a
                              href={socialLink.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: "none" }}
                            >
                              <div
                                style={{
                                  border: "1px solid #d9d9d9",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  background: "#f5f5f5",
                                  minWidth: 220,
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#1f1f1f", marginBottom: 2 }}>
                                  {socialLink.title}
                                </div>
                                <div style={{ fontSize: 12, color: "#595959", marginBottom: 4 }}>{socialLink.subtitle}</div>
                                <div style={{ fontSize: 11, color: "#1677ff", wordBreak: "break-all" }}>{socialLink.url}</div>
                              </div>
                            </a>
                          )}
                          {textWithoutSocialLink ? (
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.35, tabSize: 4, fontSize: 14.2, color: "#111b21" }}>
                              <span
                                dangerouslySetInnerHTML={{ __html: formatWhatsAppTextToHtml(textWithoutSocialLink) }}
                              />
                            </div>
                          ) : null}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#667781", textAlign: "right", marginTop: 4 }}>
                        {dayjs(item.created_at).format("DD/MM/YYYY HH:mm")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
