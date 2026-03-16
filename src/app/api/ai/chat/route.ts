/**
 * POST /api/ai/chat
 * 
 * Endpoint para el agente IA conversacional con personalidad configurable.
 * Jerárquico: Muestra TODOS programas + GRUPOS del programa que pregunta
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { getAgentImageSuggestion, withMediaSuggestion } from "@/utils/agent-media-suggestions";
import { 
  getProgramsForAgent, 
  getCoursesForQuery, 
  getCoursesByProgram,
  detectProgramFromMessage,
  buildHierarchicalContext,
  buildHierarchicalContextWithPensum,
  getAcademyInfo,
  getMediosPago,
  getStudentContextByIdentification,
  getProfileByPhone
} from "@/utils/supabase/agent-courses";

export const dynamic = "force-dynamic";

/**
 * Sanitizar texto para JSON válido
 * Remover/reemplazar caracteres problemáticos antes de JSON.stringify
 */
function sanitizeForJSON(text: string | null | undefined): string {
  if (!text) return '';

  const str = String(text);

  // Preservar formato de WhatsApp (negrita/cursiva/monoespacio, emojis y saltos)
  // Solo remover caracteres de control inválidos para JSON.
  return str
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function parseKeyValueLines(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_\-]+)\s*[:=]\s*(.+?)\s*$/);
    if (match) {
      const key = (match[1] || "").toLowerCase();
      const value = match[2] || "";
      if (key) {
        output[key] = value;
      }
    }
  }
  return output;
}

async function readRequestBody(req: NextRequest): Promise<any> {
  const contentType = req.headers.get("content-type") || "";
  const raw = await req.text();

  if (!raw) return {};

  if (contentType.includes("application/json")) {
    const parsed = safeJsonParse(raw);
    if (parsed) return parsed;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }

  const parsed = safeJsonParse(raw);
  if (parsed) return parsed;

  const kv = parseKeyValueLines(raw);
  if (Object.keys(kv).length > 0) {
    return kv;
  }

  return { message: raw };
}

/**
 * Limpiar markdown de respuesta para WhatsApp
 * Convierte **texto** a *texto* (negrita en WhatsApp)
 */
function cleanMarkdownForWhatsApp(text: string): string {
  if (!text) return '';
  
  // Convertir **texto** a *texto* (negrita en WhatsApp)
  return text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
}

/**
 * Formatear precios colombianos con separador de mil
 * 1000000 → $1.000.000
 */
function formatPrices(text: string): string {
  if (!text) return '';
  
  // Buscar patrones: $123456 o números después de $
  return text.replace(/\$(\d+)(?![\d,.])/g, (match, number) => {
    const num = parseInt(number, 10);
    if (isNaN(num)) return match;
    
    // Formatear con separador de mil (punto en Colombia)
    const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$${formatted}`;
  });
}

/**
 * Remover la palabra COP de precios
 * "$1.000.000 COP" → "$1.000.000"
 */
function removeCOPCurrency(text: string): string {
  if (!text) return '';
  
  // Remover COP preservando saltos de línea para formato WhatsApp-friendly
  return text
    .replace(/[ \t]*COP\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function enforceCourseInfoBlocks(text: string): string {
  if (!text) return "";

  let output = String(text)
    .replace(/\*{2,}/g, "*")
    .replace(/(curso)\s+\*([^*\n]+)\*/gi, "$1 $2")
    .replace(/💎\s*\*([^*\n]+)\*/g, "💎 $1")
    .replace(/📅\s*([^\n*]+)\*([^\n*]+)\*/g, "📅 $1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const hasCoursePattern = /(💎|pr[oó]ximo\s+inicio|horario|inscripci[oó]n|mensualidad|s[ií]guenos|instagram)/i.test(output);
  if (!hasCoursePattern) {
    return output;
  }

  output = output
    .replace(/:\s*(?=💎)/g, ":\n\n")
    .replace(/\s*(🗓️\s*Pr[oó]ximo\s+inicio:?)/gi, "\n$1")
    .replace(/\s*(📅\s*)/g, "\n\n$1")
    .replace(/\s*(⏰\s*Horario:)/gi, "\n$1")
    .replace(/\s*(💰\s*Inscripci[oó]n:)/gi, "\n$1")
    .replace(/\s*(💰\s*Mensualidad:)/gi, "\n\n$1")
    .replace(/\s*(📲\s*S[ií]guenos)/gi, "\n\n$1")
    .replace(/\s*(¿Te\s+gustar[ií]a[^\n?]*\?\s*😊?)/i, "\n\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return output;
}

function enforceReadableLineBreaks(text: string): string {
  if (!text) return "";

  let output = String(text);
  const hasEmojiList = /(incluye\s*:|incluye)\s*(👚|📃|🎉|🎓|🧴|💅|📌|✅)/i.test(output);

  if (hasEmojiList) {
    output = output
      .replace(/(incluye\s*:?)\s*(?=(👚|📃|🎉|🎓|🧴|💅|📌|✅))/gi, "$1\n\n")
      .replace(/\s*(👚|📃|🎉|🎓|🧴|💅|📌|✅)\s*/g, "\n$1 ");
  }

  output = output
    .replace(/([.!?])\s+(¿)/g, "$1\n\n$2")
    // Separar bullets amontonados: "• texto • texto" → cada uno en su línea
    .replace(/([^\n])\s*[•·▪◦]\s+/g, "$1\n• ")
    // Separar bloques "Mes X –" que vienen pegados
    .replace(/([^\n])\s*(Mes\s+\d)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return output;
}

function formatFinalWhatsAppResponse(text: string): string {
  let output = cleanMarkdownForWhatsApp(text || "");
  output = formatPrices(output);
  output = removeCOPCurrency(output);
  output = enforceCourseInfoBlocks(output);
  output = enforceReadableLineBreaks(output);
  return output;
}

/**
 * Formato para respuestas a comentarios de Instagram.
 * Instagram no soporta markdown de WhatsApp (*bold*, _italic_) en comentarios públicos.
 * Se eliminan los marcadores y se mantiene el texto limpio y natural.
 */
function formatInstagramCommentResponse(text: string): string {
  let output = String(text || "");
  // Eliminar marcadores WhatsApp (* _ ~ `)
  output = output.replace(/\*([^*]+)\*/g, "$1");
  output = output.replace(/_([^_]+)_/g, "$1");
  output = output.replace(/~([^~]+)~/g, "$1");
  output = output.replace(/`([^`]+)`/g, "$1");
  // Limpiar emojis duplicados y saltos excesivos
  output = output.replace(/\n{3,}/g, "\n\n");
  output = formatPrices(output);
  output = removeCOPCurrency(output);
  // Mantener respuesta corta para comentarios (max 1 parrafo + CTA)
  const lines = output.split("\n\n").filter((l) => l.trim());
  if (lines.length > 3) {
    // Para comentarios públicos, usar solo 1–2 párrafos
    output = lines.slice(0, 2).join("\n\n");
  }
  return output.trim();
}

/**
 * Enriquece cualquier payload de respuesta con metadatos del evento de comentario.
 * Si no hay commentEvent, devuelve el payload sin cambios.
 * Para comentarios:
 *  - Reformatea `response` sin markdown WhatsApp (* _ ~ `)
 *  - Añade: reply_type, comment_id, media_id, media_type
 *  - Elimina: media_suggestion y media_send_order (no aplican en comentarios)
 */
function addCommentMeta(
  payload: Record<string, any>,
  commentEvent: ReturnType<typeof extractInstagramCommentEvent>
): Record<string, any> {
  if (!commentEvent) return payload;
  const cleanResponse = payload.response
    ? formatInstagramCommentResponse(String(payload.response))
    : payload.response;
  const result: Record<string, any> = { ...payload, response: cleanResponse };
  delete result.media_suggestion;
  delete result.media_send_order;
  result.reply_type = "instagram_comment";
  result.comment_id = commentEvent.commentId;
  if (commentEvent.mediaId) result.media_id = commentEvent.mediaId;
  if (commentEvent.mediaType) result.media_type = commentEvent.mediaType;
  return result;
}

/**
 * Validar entrada del usuario antes de procesar
 */
function validateUserInput(message: string, maxLength: number = 2000): { valid: boolean; error?: string; message?: string } {
  if (!message) {
    return { valid: false, error: "Mensaje vacío" };
  }
  
  const trimmed = message.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: "Mensaje contiene solo espacios" };
  }
  
  if (trimmed.length > maxLength) {
    return { valid: false, error: `Mensaje demasiado largo (máx ${maxLength} caracteres)` };
  }
  
  return { valid: true, message: trimmed };
}

/**
 * Rate limiting simple por teléfono (máx 20 mensajes por minuto)
 */
const requestLimits = new Map<string, number[]>();

/**
 * Deduplicación de webhooks: guarda los message_id recientes para evitar
 * procesar el mismo mensaje dos veces cuando Instagram/WhatsApp reenvía el webhook.
 */
const processedMessageIds = new Map<string, number>();

function checkRateLimit(phone: string, maxRequests: number = 20, windowMs: number = 60000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const key = phone || "unknown";
  
  if (!requestLimits.has(key)) {
    requestLimits.set(key, []);
  }
  
  const timestamps = requestLimits.get(key)!;
  
  // Limpiar timestamps antiguos
  const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);
  requestLimits.set(key, recentTimestamps);
  
  const allowed = recentTimestamps.length < maxRequests;
  
  if (allowed) {
    recentTimestamps.push(now);
  }
  
  return {
    allowed,
    remaining: Math.max(0, maxRequests - recentTimestamps.length)
  };
}

/**
 * Truncar respuesta si es demasiado larga (máx 1000 caracteres para chat)
 */
function truncateResponse(text: string, maxLength: number = 1000): string {
  const hasDetailedTemario = /TEMARIO DETALLADO POR CLASES/i.test(text);
  const limit = hasDetailedTemario ? 3000 : maxLength;

  if (text.length <= limit) {
    return text;
  }
  
  // Buscar último punto/pregunta antes del límite
  const truncated = text.substring(0, limit);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!')
  );
  
  if (lastPeriod > limit * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  return truncated + '...';
}

function normalizeForComparison(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getColombiaNowDate(): Date {
  const colombiaIso = new Date().toLocaleString("sv-SE", {
    timeZone: "America/Bogota",
    hour12: false,
  });
  return new Date(colombiaIso.replace(" ", "T"));
}

function getTimeSlotGreeting(hour: number): "Buenos días" | "Buenas tardes" | "Buenas noches" {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function normalizeWhatsAppReadability(text: string): string {
  let output = String(text || "");

  output = output
    .replace(/\bhttps?:\s*\/\/\s*/gi, (match) => (match.toLowerCase().startsWith("https") ? "https://" : "http://"))
    .replace(/\bwww\.\s*/gi, "www.")
    .replace(/instagram\.\s*com/gi, "instagram.com")
    .replace(/facebook\.\s*com/gi, "facebook.com")
    .replace(/wa\.\s*me/gi, "wa.me")
    .replace(/(https?:\/\/[^\s\n]+)\n(?=[a-z0-9./_-])/gi, "$1")
    .replace(/([a-z0-9])\s*\.\s*([a-z0-9])/g, "$1.$2")
    .replace(/([a-z0-9])\s*\/\s*([a-z0-9])/g, "$1/$2");

  let previous = "";
  while (previous !== output) {
    previous = output;
    output = output.replace(/(\d)\s*[.]\s*(\d{3}\b)/g, "$1.$2");
  }

  return output;
}

function enforceParagraphBlocks(text: string): string {
  const input = (text || "").trim();
  if (!input) return "";

  const hasBlockBreaks = /\n\n/.test(input);
  if (hasBlockBreaks) {
    return input
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  const singleLine = input.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!singleLine) return "";

  const hasUrlLikeContent = /https?:\/\/|www\./i.test(singleLine);
  if (hasUrlLikeContent || singleLine.length < 220) {
    return singleLine;
  }

  const sentences = singleLine
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9💎📌👉])/u)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 2) return sentences.join(" ").trim();

  const blocks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const block = sentences.slice(i, i + 2).join(" ").trim();
    if (block) blocks.push(block);
  }

  return blocks.join("\n\n").trim();
}

function sanitizeAgentVisibleResponse(rawText: string, fallbackResponse: string): string {
  const fallback = (fallbackResponse || "Déjame confirmarlo y te respondo en breve.").trim();
  if (!rawText) return fallback;

  let output = stripMediaMarkersForPrompt(String(rawText)).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const leakedBlockPatterns: RegExp[] = [
    /🔒\s*MODO\s+RESPUESTA\s+A\s+PLANTILLAS[\s\S]*?cualquier\s+texto\s+de\s+ventas\.?/gi,
    /#\s*SYSTEM\s+PROMPT:[\s\S]*?(?=\n\s*(?:Usuario:|Mensaje del usuario:|#\s*Mensaje del usuario:|$))/gi,
    /#\s*DIRECTIVA\s+CONTEXTUAL[\s\S]*?(?=\n\s*(?:Usuario:|Mensaje del usuario:|#\s*Mensaje del usuario:|$))/gi,
    /#\s*🎯\s*INSTRUCCI[ÓO]N\s+DE\s+RESPUESTA:[\s\S]*?(?=\n\s*(?:Usuario:|Mensaje del usuario:|#\s*Mensaje del usuario:|$))/gi,
  ];

  for (const pattern of leakedBlockPatterns) {
    output = output.replace(pattern, " ");
  }

  const leakedLinePatterns: RegExp[] = [
    /cambia\s+a\s+modo\s+soporte\s+estudiante/i,
    /^\s*acceso\s+a\s+la\s+app\s*,?\s*$/i,
    /^\s*visualizacion\s+de\s+asistencias\/?notas\/?materiales\s*,?\s*$/i,
    /^\s*orientacion\s+basica\s+de\s+uso\s*\.?\s*$/i,
    /modo\s+respuesta\s+a\s+plantillas/i,
    /no\s+vender\s+cursos\s+ni\s+iniciar\s+discurso\s+comercial/i,
    /responder\s+corto,?\s+claro\s+y\s+operativo/i,
    /priorizar\s+ayuda\s+en\s+este\s+orden/i,
    /si\s+pide\s+datos\s+sensibles\s+o\s+no\s+se\s+puede\s+validar\s+identidad/i,
    /si\s+hay\s+problema\s+de\s+pago,?\s+bloqueo\s+de\s+cuenta\s+o\s+error\s+t[eé]cnico\s+persistente/i,
    /cerrar\s+siempre\s+con\s+una\s+pregunta\s+de\s+avance/i,
    /frases\s+prohibidas\s+en\s+este\s+modo/i,
    /te\s+interesa\s+inscribirte/i,
    /te\s+comparto\s+nuestros\s+cursos/i,
    /^\s*(intenci[oó]n|objeci[oó]n|se[ñn]al\s+de\s+compra\s+expl[ií]cita)\s+detectada\s*:/i,
    /^\s*acci[oó]n\s+obligatoria\s*:/i,
    /^\s*prohibido\s+responder\s+con\s*:/i,
    /^\s*\[📷\s*https?:\/\/\S+/i,
    /^\s*📷\s*https?:\/\/\S+/i,
    /^\s*https?:\/\/[^\s]*supabase[^\s]*\/storage\/v1\/object\/public\/marketing\//i,
  ];

  const cleanedLines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      return !leakedLinePatterns.some((pattern) => pattern.test(line));
    });

  output = cleanedLines.join("\n").trim();

  output = output
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  output = normalizeWhatsAppReadability(output);

  return enforceParagraphBlocks(output || fallback) || fallback;
}

function wordOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(normalizeForComparison(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeForComparison(b).split(" ").filter(Boolean));
  if (!wordsA.size || !wordsB.size) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
  }

  const base = Math.min(wordsA.size, wordsB.size);
  return base ? intersection / base : 0;
}

function isRepetitiveResponse(
  newResponse: string,
  history: Array<{ user: string; agent: string }>,
  newUserMessage: string
): boolean {
  const last = history[history.length - 1];
  if (!last?.agent) return false;

  const normalizedNewUser = normalizeForComparison(newUserMessage);
  const normalizedLastUser = normalizeForComparison(last.user || "");
  const userMessagesAreDifferent = normalizedNewUser && normalizedLastUser && normalizedNewUser !== normalizedLastUser;

  const overlap = wordOverlapRatio(newResponse, last.agent);
  const almostEqual = normalizeForComparison(newResponse) === normalizeForComparison(last.agent);

  return (almostEqual || overlap >= 0.9) && Boolean(userMessagesAreDifferent);
}

function validateRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.WHATSAPP_API_KEY;
  if (apiKey && apiKey === expectedKey) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.includes("Bearer")) return true;

  return false;
}

function isPlaceholderMessage(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase().trim();
  return [
    "text",
    "audio",
    "image",
    "video",
    "document",
    "sticker",
    "message",
    "mensaje",
    "type",
  ].includes(normalized);
}

function applyTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(tokens, key)
      ? String(tokens[key] ?? "")
      : match;
  });
}

const DEFAULT_AGENT_SYSTEM_PROMPT = `# System Prompt: Agente {{persona_name}} (v3.1 – Embudo Progresivo + Redes)

🧠 Identidad
Eres {{persona_name}}, {{persona_bio}}.
Tu misión es convertir interesados en estudiantes, guiándolos paso a paso con información dosificada, clara y persuasiva.

Tu estrategia es NO dar toda la información en un solo mensaje, sino generar conversación, interés y seguimiento.

1️⃣ Reglas de Oro de Interacción
🔹 Saludo
{{greeting_rule}}

🔹 Estilo WhatsApp
• Usa espacios en blanco (doble salto de linea) para separar bloques de informacion
• Usa viñetas para listas
• Usa negrilla SOLO para: **Nombres de Cursos**, **Fechas**, **Horarios**, **Precios**
• **Estilo / tono preferido:** {{speaking_style}}

🔹 Regla de Información Progresiva (MUY IMPORTANTE)
🚫 PROHIBIDO entregar toda la información en una sola respuesta, incluso si el usuario dice “quiero información”.

Sigue siempre este orden:

1️⃣ Primera respuesta
👉 Solo:
- De qué trata el curso
- A quién va dirigido
- Pregunta de avance
- Invitación a redes

2️⃣ Segunda respuesta (si muestran interés)
👉 Solo:
- Duración
- Fechas de inicio
- Días y horarios
- Invitación a redes

3️⃣ Tercera respuesta (si preguntan por precio, costo, valor, etc.)
👉 Solo:
- Inscripción
- Mensualidad
- Medios de pago
- CTA a Admisiones
- Mejor di: Visítanos en Redes Sociales (link de Instagram)

❗ Variantes como precio, presio, preccio, costo, pessio, prexio significan PRECIO.

🔹 Manejo del contexto conversacional (MUY IMPORTANTE)
⚠️ NUNCA reinicies el embudo si el cliente ya identificó su programa o ya está en medio de una conversación activa.
⚠️ Si el cliente confirma algo con una sola palabra o frase corta (ej: "sí", "sí claro", "porfavor", "dale", "ok", "claro", "sí señor"), SIEMPRE interpreta esa respuesta como confirmación de la pregunta que acabas de hacer y responde en consecuencia. NUNCA vuelvas a preguntar "¿prefieres horarios, inversión o inscripción?" si ya se lo preguntaste antes.
⚠️ EXCEPCIÓN — pregunta de DOBLE OPCIÓN (A o B): si tu mensaje anterior ofrecía DOS caminos distintos (ej: "¿te comparto horarios e inversión o prefieres ir directo a separar cupo?") y el usuario responde "sí"/"dale"/"ok" sin especificar cuál, NO asumas ninguna opción. Pide clarificación de forma breve y natural. Ejemplo: "😊 ¿Cuál prefieres: que te comparta *horarios e inversión* o vamos directo a *separar tu cupo*?" — máximo una línea, sin repetir información.
⚠️ Si el cliente dice "en curso" o "ya estoy estudiando", cambia a modo soporte: ayúdale con su duda puntual sin ofrecer inscripciones.
⚠️ "Por los horarios" / "los horarios" / "horario" / "horarios" SIEMPRE significa que quiere ver horarios — NUNCA lo confundas con "inversión" ni le muestres precios. Responde directamente con días y horas.
⚠️ "Son todos los días?" / "Todos los días hay?" / "¿Es todos los días?" → responde DIRECTAMENTE sí o no con el horario. NUNCA devuelvas el menú de horarios/inversión/inscripción.
⚠️ Preguntas de sí/no (ej: "¿Solo es un día a la semana?", "¿Es presencial?", "¿Hay cupos?") → responde PRIMERO sí o no de forma directa y breve, luego agrega el detalle relevante.
⚠️ Si el cliente explica que no puede en el horario actual (ej: trabajo lunes-viernes, necesita sábados) → NO le ofrezcas el grupo que ya sabe que no le sirve. Valida su situación, confirma que aún no hay ese horario y pregunta si quiere quedar en lista de espera o si alguna otra opción le funcionaría.
⚠️ "Aparte los [número]" / "Aparte de la inscripción" / "¿Y aparte de eso?" → el usuario está en una conversación de precios y pregunta por costos adicionales. Explica directamente: mensualidad $260.000/mes (incluye kit). NO muestres el menú inicial.
⚠️ "Si que trae" / "sí que trae" / "que trae" / "qué trae" / "qué incluye" / "qué viene en el kit" → el usuario confirma que quiere saber el contenido del kit mensual. Responde SIEMPRE sobre el kit (contiene ~70% de los productos que se usan ese mes) y pregunta de qué ciclo o mes quiere el detalle. NUNCA muestres el bloque de horarios/curso/inscripción como respuesta a esta pregunta.
⚠️ "Puedo ir personal" / "¿Puedo ir en persona?" → confirma que SÍ pueden atenderte en la academia y pide que indique cuándo puede ir. NO muestres el menú de horarios/inversión/inscripción.
⚠️ Si el usuario muestra frustración ("cuando atienda una persona de verdad", "no me entiendes", "siempre lo mismo") → pide disculpas brevemente, reconoce la limitación y da el número de Admisiones directamente.
⚠️ Si el usuario ya dijo "Horarios" y recibió el menú en respuesta — y lo repite — es porque el sistema no respondió su pregunta. Responde INMEDIATAMENTE con los horarios, sin preguntar de nuevo qué tema prefiere.
⚠️ "Y el uniforme" / "y el uniforme?" / cualquier mensaje que contenga la palabra "uniforme" → SIEMPRE responde directamente: el uniforme (camiseta) se entrega al momento de inscribirse, sin costo adicional. NUNCA muestres el bloque de curso, horarios ni precio en respuesta a esto.
⚠️ "Ya viene ahí" / "ya viene" / "viene incluido" / "viene con eso" / "viene con la inscripción" → el usuario está CONFIRMANDO que algo viene incluido (generalmente el uniforme o el kit). Confirma directamente con un "¡Así es! [lo que preguntó] viene incluido..." y continúa el flujo natural. NUNCA interpretes estas frases como una señal de que el usuario quiere ver horarios o información del curso.
⚠️ Patrón "Y el X" / "Y la X" → el usuario está AGREGANDO una pregunta puntual sobre X a la conversación en curso. SIEMPRE responde primero esa pregunta concreta y luego retoma el hilo si aplica. NUNCA ignores la pregunta agregada ni la reemplaces con el bloque de curso/horarios.
⚠️ SALUDO SIMPLE ("hola", "hola buenas", "hola buena tarde", "buenas tardes", "buenas noches", "buenos días") → SIEMPRE responde primero el saludo con calidez ("¡Buenas tardes! 😊 Bienvenida a Crystal Diamante...") antes de retomar cualquier contexto previo. NUNCA empieces directamente con "Perfecto, te refieres a [curso]" sin saludar.
⚠️ "Te estoy saludando" / "solo te saludé" / "te dije hola" / "solo te digo hola" → el usuario está indicando que el bot se adelantó demasiado rápido. DEBES: 1) disculparte brevemente ("¡Perdona! 😊"), 2) saludar con calidez, 3) preguntar "¿En qué te puedo ayudar?". NUNCA continúes con información del curso cuando recibes esta respuesta.
⚠️ "Que incluye" / "qué incluye" / "qué incluye el curso" cuando ya hay un programa identificado → responde directamente con lo que incluye EL CURSO: temario completo, kit mensual (~70% de productos), uniforme, certificado y ceremonia de grado. NUNCA devuelvas el menú de doble opción "¿horarios e inversión o separar cupo?".
⚠️ "Y cuántas horas son" / "cuántas horas" / "cuántas horas dura" / "cuántas horas tiene" → responde DIRECTAMENTE con las horas por sesión. Ejemplo: "Son 3 horas por clase (de 4:00 PM a 7:00 PM), una vez a la semana. En total son 20 clases en 5 meses." NUNCA repitas el bloque completo de inicio/horario/cupo como respuesta a esta pregunta.
⚠️ "desde cero" / "enseñan desde cero" / "aprenden desde cero" / "es desde cero" / "se aprende desde cero" → el usuario está preguntando si el curso es para PRINCIPIANTES (sin experiencia previa). NO es el nombre de un programa. SIEMPRE confirma: "¡Sí! No necesitas ninguna experiencia previa, el programa está diseñado desde cero." NUNCA respondas que "desde cero no está disponible como programa" ni listes otros cursos como alternativa.
⚠️ "manicura", "pedicura", "manicuría", "pedi-spa" o errores de escritura similares (ej: "maniura") se refieren al programa de uñas. Interprétalo como *Artista Integral en Uñas* y responde con ese programa.
⚠️ "X favor" / "por favor" / "xfa" cuando el usuario acaba de pedir información específica que NO recibió completamente → el usuario INSISTE en recibir lo que ya pidió. Revisa el mensaje anterior del usuario, identifica qué información faltó, y dála directamente. NUNCA reinicies el embudo preguntando "¿te comparto horarios e inversión o separar cupo?".
⚠️ "Tienes otros horarios?" / "hay otros horarios?" / "otros horarios" → si solo hay un grupo activo en ese programa, di claramente: "Por ahora solo tenemos ese grupo los [día/horario]. ¿Quieres quedar en lista de espera si abrimos otro horario?" NUNCA repitas el bloque del mismo horario como si fuera nuevo.
⚠️ "Cuántos días se estudia" / "cuántos días son" / "cuántos días a la semana" / "es 1 vez a la semana" / "cuántas veces a la semana" / "es todos los días" → responde DIRECTAMENTE la frecuencia: "Es 1 vez a la semana (los [día]), de [hora] a [hora]." NUNCA respondas esta pregunta con Google Maps, proceso de inscripción ni datos de pago. Es una pregunta de frecuencia, no una señal de querer inscribirse.
⚠️ "???" / "????" / múltiples signos de interrogación solos → el usuario está confundido o frustrado por una respuesta que no tuvo nada que ver con lo que preguntó. DEBES: 1) disculparte brevemente ("¡Perdona! 😊"), 2) reconocer que la respuesta anterior no fue lo que esperaba, 3) preguntar concretamente "¿Sobre qué querías información?" NUNCA muestres el menú de 3 opciones como respuesta a esta señal de frustración.
⚠️ "X favor inversión y horarios" / cualquier mensaje que combine explícitamente "inversión" y "horarios" / "precio y horario" → el usuario pide DOS cosas a la vez. DEBES dar ambas en la misma respuesta: primero el horario, luego el precio (inscripción + mensualidad). NUNCA des solo una de las dos.

🔹 Guía de respuestas cercanas (preguntas frecuentes)
Responde con empatía, una sola idea por mensaje y cierre con pregunta breve.

- Precio: confirma inscripción + mensualidad, incluye 1-2 beneficios clave y pregunta si desea medios/fechas de pago.
- Precio (formato obligatorio): muestra siempre *3 opciones de pago* en este orden y con negrilla: *Por Clase*, *Mensual Opción A*, *Mensual Opción B*. Hazlo en formato corto y comercial (sin texto técnico largo). Debes aclarar materiales en cada una: Por Clase = no incluye materiales; Opción A = incluye ~70% de materiales; Opción B = incluye 100% de materiales del mes.
- "Efectivo" / confirmación de medio de pago: NO reinicies el embudo. Confirma que efectivo está disponible y da el siguiente paso: "¡Perfecto! Entonces puedes separar tu cupo pagando la inscripción en efectivo directamente en la academia. ¿Quieres que te diga los pasos para hacerlo?"
- "Sí" / "sí porfavor" / "porfavor" después de preguntar si quiere medios y fechas de pago: da inmediatamente la lista de medios de pago y la fecha límite de mensualidad. NO preguntes de nuevo qué quiere saber.
- Medios/fechas de pago: lista los medios disponibles (💵 Efectivo • 💜 Nequi: 3006402575 • 🟡 Bancolombia • 🟢 Sistecredito • 💳 Tarjeta), indica que la mensualidad tiene plazo hasta la segunda clase, y pregunta si quiere guía de inscripción.
- "¿Por todo cuánto se paga?" / "¿Cuánto es en total?": responde inscripción + (mensualidad × meses del programa). Ej: para Artista Integral en Uñas = $190.000 inscripción + 5 mensualidades de $260.000 = $1.490.000 en total aproximado. Luego pregunta si quiere separar cupo.
- Horarios (cuando ya se identificó el programa): da directamente la información de días y horarios del programa en cuestión. NO preguntes de nuevo qué quiere saber.
- Sábados (cuando hay grupo en sábado): confirma el horario disponible y pregunta si le queda bien.
- Sábados (cuando NO hay grupo en sábado): di claramente que por ahora no hay grupo los sábados. Valida que es una situación entendible si trabajan entre semana. Pregunta si quieren quedar en lista de espera para cuando se abra un grupo en ese horario. NO ofrezcas el grupo de martes ni ningún otro día como alternativa sin que te lo pidan.
- Uniforme / kit primer día: el uniforme (camiseta) se entrega al momento de la inscripción. El kit de materiales se entrega al inicio de cada mes junto con el pago de mensualidad; contiene aproximadamente el 70% de los productos que se usan durante ese mes de clases. El primer día puedes venir con ropa cómoda, no necesitas llevar nada.
- "¿Cuántas clases cubre la mensualidad?": cada mensualidad cubre 4 clases aproximadamente (el programa es de 20 clases en 5 meses). Ofrece detallar el contenido de algún mes específico.
- "¿No le rebajan a la mensualidad?" / negociación de precio: la mensualidad tiene un precio fijo de $260.000. Sin embargo, Sistecredito permite financiar en cuotas. ¿Quieres que te explique cómo funciona esa opción?
- Fotos del kit: di que puedes conseguirlas, pide confirmar programa/ciclo para enviar las correctas.
- ¿Qué trae el kit?: explica que el kit incluye aproximadamente el 70% de los productos que se usan durante ese mes de clases (varía por ciclo). Pregunta si quiere el detalle del primer mes o de un ciclo específico.
- ¿Es kit básico?: confirma que el kit cubre aproximadamente el 70% de los productos que se usan ese mes (lo esencial para practicar); aclara que los materiales específicos varían por ciclo y ofrece detallar el primer ciclo.
- ¿Qué enseñan?: responde con enfoque del programa (cejas/pestañas, práctico desde cero) y pregunta qué le interesa más.
- ¿Puedo ir personal?: confirma atención personal y pide día y hora para agendar.
- ¿Hay sede más cerca?: valida la inquietud, indica sede disponible y pide zona/barrio para sugerir la opción más conveniente.
- "El primer día qué materiales toca llevar": responde claramente — el primer día no necesitas llevar nada. El uniforme y el kit se entregan en la academia al momento de inscribirte. Solo ven con ropa cómoda y ganas de aprender 💪

2️⃣ Estructura de Respuesta (cuando aplique)

Nombre del Curso + duración (Ej: 5 meses / 20 clases)

🗓️ Próximo Inicio:
📅 Días:
⏰ Horario:
(Formato obligatorio para horas: AM/PM – NO usar horario militar)

💰 Inscripción: $
💰 Mensualidad: $
(Formato obligatorio: $1.000.000 – NO usar COP)

📚 ¿Qué aprenderás?
• Tema 1
• Tema 2
• Tema 3

🎁 Beneficios:
✅ Certificación
✅ Kit / uniforme

🔹 Pregunta estratégica de avance
🔹 Invitación a redes sociales

3️⃣ Invitación a Redes (OBLIGATORIO EN CADA RESPUESTA)

En TODAS las respuestas agrega al final algo como:
"📲 Mientras tanto, te invito a seguirnos en redes para que veas trabajos reales de nuestras estudiantes y el ambiente de la academia 💎\n¿Te gustaría que te pase el link?"

❗ Nunca des el link sin invitar primero.

4️⃣ Precios y Pagos

❌ NO des el valor total del curso si no lo piden.
Enfócate en: Inscripción y Mensualidad.
💳 Medios de pago solo si lo preguntan.

Usa estos emojis obligatorios cuando aplique:
💵 Efectivo
💜 Nequi: 3006402575
🟡 Bancolombia
🟢 Sistecredito
💳 Tarjeta

Cierre sugerido:
¿Tienes alguna otra pregunta antes de inscribirte? 😊

5️⃣ Datos y Veracidad
• **Estatico:** Duración, temario, beneficios
• **Dinamico:** Cupos, fechas, horarios
• **Falta de datos:** "{{fallback_response}}"
⚠️ NUNCA inventes información.

6️⃣ Embudo de Cierre
📱 WhatsApp Admisiones (número de la academia): {{admissions_number}}

⚠️ IMPORTANTE: Este número ({{admissions_number}}) ES el número de la academia. Si alguien pregunta "¿cuál es el número de la academia?", "¿me das el teléfono?", "¿cómo los contacto?" → responde SIEMPRE con este número.

Entrega el número cuando:
✔ Preguntan por precios
✔ Preguntan por horarios
✔ Dicen: me interesa, quiero inscribirme, cómo pago, cuándo empiezo

Cierre tipo:
"¡Perfecto! Me encanta tu interés en convertirte en profesional 💎
Para reservar tu cupo, escribe directamente a Admisiones:
📱 {{admissions_number}}"

7️⃣ Pensum – Curso de Uñas
(SOLO si preguntan por contenido o pensum)

Mes 1: Fundamentos y Cuidado
🛡️ Bioseguridad
💅 Manicuría Tradicional
🎨 Esmaltado Clásico
🦶 Pedi-Spa y Anatomía

Mes 2: Semipermanentes
5. 💡 Semipermanente
6. ⚡ Press-on
7. 💎 Tendencias I
8. ✨ Tendencias II

Mes 3: Gel y Polygel
9. 🖌️ Nail Art
10. 🧊 Gel
11. 🧬 Polygel
12. 🛠️ Mantenimiento

Mes 4: Acrílico
13. ⚪ Control de Perla
14. 📏 Square
15. 📐 Almond/Coffin
16. 🏗️ Cutícula

Mes 5: Avanzado
17. 🌟 3D
18. 🏆 Acrílico Avanzado
19. 💎 Perfeccionamiento
20. 🎓 Proyecto Final + Marketing

## Reglas no negociables
⚠️ Solo usa información explícita del contexto jerárquico
⚠️ Si un curso no aparece en contexto, di que no está disponible
⚠️ No inventes horarios, precios, fechas ni nombres
⚠️ Formato de hora SIEMPRE en AM/PM
⚠️ No uses formato militar

{{sales_protocol}}
`;

function pickFirstNonEmptyString(...candidates: Array<any>): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return "";
}

function normalizePhoneIdentifier(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "unknown";

  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }

  if (digits.startsWith("00") && digits.length > 2) {
    return digits.slice(2);
  }

  return digits;
}

function detectInboundChannel(body: any): "whatsapp" | "instagram" | "unknown" {
  const rootObject = String(body?.object || "").toLowerCase();
  if (rootObject === "instagram") return "instagram";
  if (rootObject === "whatsapp_business_account") return "whatsapp";

  // Comentarios / menciones de Instagram (changes.field = "comments" | "mentions")
  const changesField = String(body?.entry?.[0]?.changes?.[0]?.field || "").toLowerCase();
  if (changesField === "comments" || changesField === "mentions") return "instagram";

  const messagingProduct = String(
    body?.entry?.[0]?.changes?.[0]?.value?.messaging_product ||
      body?.messaging_product ||
      body?.metadata?.messaging_product ||
      ""
  ).toLowerCase();

  if (messagingProduct === "instagram") return "instagram";
  if (messagingProduct === "whatsapp") return "whatsapp";

  const channelHint = String(
    body?.channel || body?.source || body?.platform || body?.provider || ""
  ).toLowerCase();
  if (channelHint.includes("instagram")) return "instagram";
  if (channelHint.includes("whatsapp")) return "whatsapp";

  // Fallback para payloads simplificados que llegan desde Make:
  // si el remitente tiene 16+ dígitos es muy probable que sea IG sender id
  // (wa_id telefónico normalmente es máximo 15 dígitos).
  const senderDigits = String(
    body?.p_whatsapp_id || body?.telefono_whatsapp || body?.from || body?.wa_id ||
    body?.entry?.[0]?.messaging?.[0]?.sender?.id ||
    body?.entry?.[0]?.changes?.[0]?.value?.sender?.id ||
    body?.entry?.[0]?.changes?.[0]?.value?.from?.id ||
    body?.sender?.id ||
    ""
  ).replace(/\D/g, "");
  if (senderDigits.length >= 16) return "instagram";

  return "unknown";
}

/**
 * Extrae datos de un evento de comentario de Instagram.
 * Retorna null si el payload NO es un comentario.
 */
function extractInstagramCommentEvent(body: any): {
  commentId: string;
  mediaId: string;
  mediaType: string;
  senderId: string;
  senderUsername: string;
  text: string;
  parentId: string | null;
} | null {
  const field = String(body?.entry?.[0]?.changes?.[0]?.field || "").toLowerCase();
  if (field !== "comments") return null;

  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;

  const commentId = String(value?.id || "").trim();
  const text = String(value?.text || "").trim();
  const senderId = String(value?.from?.id || "").trim();
  const senderUsername = String(value?.from?.username || "").trim();
  const mediaId = String(value?.media?.id || "").trim();
  const mediaType = String(value?.media?.media_product_type || "").toLowerCase(); // post | reel | story
  const parentId = value?.parent_id ? String(value.parent_id) : null;

  // Un comentario válido necesita al menos id + texto + sender
  if (!commentId || !text || !senderId) return null;

  return { commentId, mediaId, mediaType, senderId, senderUsername, text, parentId };
}

function isSelfOriginatedInstagramEvent(body: any): boolean {
  // Verificar is_echo PRIMERO, antes de cualquier detección de canal.
  // Cuando Instagram refleja el mensaje del bot, is_echo=true independientemente
  // de cómo Make envíe el payload.
  const isEcho =
    body?.entry?.[0]?.messaging?.[0]?.message?.is_echo === true ||
    body?.is_echo === true ||
    body?.message?.is_echo === true;
  if (isEcho) return true;

  if (detectInboundChannel(body) !== "instagram") return false;

  const entryNode = Array.isArray(body?.entry) ? body?.entry?.[0] : body?.entry;

  const senderId = String(
    body?.entry?.[0]?.messaging?.[0]?.sender?.id ||
      entryNode?.messaging?.[0]?.sender?.id ||
      entryNode?.sender?.id ||
      body?.entry?.[0]?.changes?.[0]?.value?.sender?.id ||
      entryNode?.changes?.[0]?.value?.sender?.id ||
      body?.entry?.[0]?.changes?.[0]?.value?.from?.id || // comentarios
      entryNode?.changes?.[0]?.value?.from?.id ||
      body?.sender?.id ||
      ""
  ).trim();

  if (!senderId) return false;

  const recipientId = String(
    body?.entry?.[0]?.messaging?.[0]?.recipient?.id ||
      entryNode?.messaging?.[0]?.recipient?.id ||
      entryNode?.recipient?.id ||
      ""
  ).trim();

  const ownIds = new Set(
    [
      body?.entry?.[0]?.id,
      entryNode?.id,
      body?.entry?.[0]?.messaging?.[0]?.recipient?.id,
      entryNode?.messaging?.[0]?.recipient?.id,
      entryNode?.recipient?.id,
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      process.env.INSTAGRAM_ACCOUNT_ID,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  // Caso típico en Make para ecos: sender == own_id y recipient == usuario
  if (recipientId && ownIds.has(senderId) && senderId !== recipientId) {
    return true;
  }

  return ownIds.has(senderId);
}

function isOwnInstagramConversationIdentifier(phone: string, body: any): boolean {
  const normalizedPhone = String(phone || "").trim().toLowerCase();
  if (!normalizedPhone.startsWith("ig:")) return false;

  const senderId = normalizedPhone.replace(/^ig:/, "").trim();
  if (!senderId) return false;

  const entryNode = Array.isArray(body?.entry) ? body?.entry?.[0] : body?.entry;
  const ownIds = new Set(
    [
      body?.entry?.[0]?.id,
      entryNode?.id,
      body?.entry?.[0]?.messaging?.[0]?.recipient?.id,
      entryNode?.messaging?.[0]?.recipient?.id,
      entryNode?.recipient?.id,
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      process.env.INSTAGRAM_ACCOUNT_ID,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  return ownIds.has(senderId);
}

function findPhoneCandidateDeep(candidates: string[]): string {
  for (const value of candidates) {
    if (!value) continue;

    const normalized = String(value).trim();
    if (!normalized) continue;

    const fromJid = normalized.match(/(?:^|\s|:)(\d{10,15})(?:@c\.us|@s\.whatsapp\.net|@g\.us|@)/i);
    if (fromJid?.[1]) {
      return fromJid[1];
    }

    const fromQuotedPhone = normalized.match(/(?:\+|00)?\d{10,15}/);
    if (fromQuotedPhone?.[0]) {
      const digits = fromQuotedPhone[0].replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) {
        return digits;
      }
    }

    const digits = normalized.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return digits;
    }
  }

  return "";
}

function extractStringsDeep(input: any, maxDepth = 4): string[] {
  const result: string[] = [];
  const visited = new Set<any>();

  const walk = (value: any, depth: number) => {
    if (depth < 0 || value == null) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) result.push(trimmed);
      return;
    }
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth - 1);
      return;
    }

    for (const v of Object.values(value)) {
      walk(v, depth - 1);
    }
  };

  walk(input, maxDepth);
  return result;
}

function extractPhoneCandidatesByKey(input: any, maxDepth = 6): string[] {
  const result: string[] = [];
  const visited = new Set<any>();
  // Solo claves que suelen traer identificador del cliente real.
  // Evita chat/conversation/session IDs técnicos que contaminarían phone_number.
  const keyPattern = /(phone|telefono|wa_?id|from|contact|jid|author|participant|customer|cliente|remotejid)/i;

  const pushCandidate = (value: any) => {
    if (typeof value === "string" && value.trim()) {
      result.push(value.trim());
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      result.push(String(value));
    }
  };

  const walk = (value: any, depth: number) => {
    if (depth < 0 || value == null) return;
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth - 1);
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (keyPattern.test(key)) {
        pushCandidate(nestedValue);
      }
      walk(nestedValue, depth - 1);
    }
  };

  walk(input, maxDepth);
  return result;
}

function normalizeProfileName(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (/^[0-9_\-.]{6,}$/.test(compact)) return "";
  return compact.slice(0, 120);
}

function extractProfileCandidatesByKey(input: any, maxDepth = 5): string[] {
  const result: string[] = [];
  const visited = new Set<any>();
  const keyPattern = /(profile[_-]?name|contact[_-]?name|sender[_-]?name|display[_-]?name|username|nombre|name)$/i;

  const pushCandidate = (value: any) => {
    const normalized = normalizeProfileName(typeof value === "string" ? value : "");
    if (!normalized) return;
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  };

  const walk = (value: any, depth: number) => {
    if (depth < 0 || value == null) return;
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth - 1);
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (keyPattern.test(key)) {
        pushCandidate(nestedValue);
      }
      walk(nestedValue, depth - 1);
    }
  };

  walk(input, maxDepth);
  return result;
}

function extractProfileName(body: any): string {
  const keyedCandidates = extractProfileCandidatesByKey({
    body,
    payload: body?.payload,
    data: body?.data,
    sender: body?.sender,
    contact: body?.contact,
    contacts: body?.contacts,
    entry: body?.entry,
  });

  const name = pickFirstNonEmptyString(
    body?.profile_name,
    body?.nombre_perfil,
    body?.contact_name,
    body?.nombre_contacto,
    body?.sender_name,
    body?.from_name,
    body?.full_name,
    body?.display_name,
    body?.customer_name,
    body?.lead_name,
    body?.instagram_profile_name,
    body?.instagram_username,
    body?.username,
    body?.sender?.display_name,
    body?.sender?.username,
    body?.sender?.name,
    body?.contact?.name,
    body?.contact?.full_name,
    body?.entry?.[0]?.messaging?.[0]?.sender?.username,
    body?.entry?.[0]?.messaging?.[0]?.sender?.name,
    body?.entry?.[0]?.changes?.[0]?.value?.from?.username,
    body?.entry?.[0]?.changes?.[0]?.value?.from?.name,
    body?.entry?.[0]?.changes?.[0]?.value?.sender?.username,
    body?.entry?.[0]?.changes?.[0]?.value?.sender?.name,
    body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name,
    body?.payload?.profile_name,
    body?.payload?.contact_name,
    body?.payload?.sender_name,
    body?.payload?.from_name,
    body?.payload?.instagram_username,
    body?.payload?.username,
    body?.data?.profile_name,
    body?.data?.contact_name,
    body?.data?.sender_name,
    body?.data?.from_name,
    body?.data?.instagram_username,
    body?.data?.username,
    body?.contact?.profile?.name,
    ...keyedCandidates,
  );

  return normalizeProfileName(name);
}

/**
 * Llama la Graph API de Meta para obtener el username/nombre de un usuario de Instagram DM.
 * El webhook de Instagram solo envía el IGSID (ID numérico), no el username.
 * Usa INSTAGRAM_PAGE_ACCESS_TOKEN si existe, si no intenta con WHATSAPP_ACCESS_TOKEN.
 */
async function fetchInstagramSenderUsername(igsid: string): Promise<string> {
  if (!igsid || igsid === "unknown" || !/^\d{10,20}$/.test(igsid)) return "";
  const token =
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return "";
  try {
    const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(igsid)}?fields=name,username&access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return "";
    const data = await resp.json();
    return normalizeProfileName(data?.username || data?.name || "");
  } catch {
    return "";
  }
}

function extractMessageAndPhone(body: any): { message: string; phone: string; channel: "instagram" | "whatsapp" | "unknown"; profileName: string } {
  const channel = detectInboundChannel(body);
  const profileName = extractProfileName(body);
  const webhookMessage = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
  const webhookMessageAlt = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text;
  const webhookPhone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const webhookContactPhone = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;
  const instagramMessagingMessage = body?.entry?.[0]?.messaging?.[0]?.message?.text;
  const instagramChangeMessageText = body?.entry?.[0]?.changes?.[0]?.value?.message?.text;
  const instagramMessagingSenderId = body?.entry?.[0]?.messaging?.[0]?.sender?.id;
  const instagramChangeSenderId = body?.entry?.[0]?.changes?.[0]?.value?.sender?.id;
  // Comentarios de Instagram (changes.field = "comments")
  const instagramCommentText = body?.entry?.[0]?.changes?.[0]?.field === "comments"
    ? String(body?.entry?.[0]?.changes?.[0]?.value?.text || "").trim()
    : undefined;
  const instagramCommentSenderId = body?.entry?.[0]?.changes?.[0]?.field === "comments"
    ? String(body?.entry?.[0]?.changes?.[0]?.value?.from?.id || "").trim()
    : undefined;

  const nestedMessage = body?.messages?.[0]?.text?.body;
  const nestedPhone = body?.messages?.[0]?.from;

  const deepCandidates = extractStringsDeep({
    text: body?.text,
    message: body?.message,
    messages: body?.messages,
    // No incluir body.entry en deep scan cuando viene de Make (evita que el JSON crudo sea tomado como mensaje)
    data: body?.data,
    payload: body?.payload,
  });

  const deepKeyCandidates = extractPhoneCandidatesByKey(body);

  const deepPhoneCandidate = findPhoneCandidateDeep([...deepKeyCandidates, ...deepCandidates]);

  // Si Make envía el entry completo, extraer texto de historia/DM directamente
  const entryMessagingText = body?.entry?.[0]?.messaging?.[0]?.message?.text;
  const entryStoryReplyText = body?.entry?.[0]?.messaging?.[0]?.message?.reply_to?.story?.id
    ? (body?.entry?.[0]?.messaging?.[0]?.message?.text || "")
    : undefined;

  const rawMessage = pickFirstNonEmptyString(
    body?.message,
    body?.mensaje,
    body?.mensaje_whatsapp,
    body?.mensaje_original,
    body?.user_message,
    body?.text?.body,
    body?.text?.text,
    body?.text,
    body?.prompt,
    instagramCommentText,      // comentarios de IG (priority antes de deep)
    entryMessagingText,        // texto extraído del entry completo enviado por Make
    entryStoryReplyText,       // respuesta a historia
    instagramMessagingMessage,
    instagramChangeMessageText,
    nestedMessage,
    webhookMessage,
    webhookMessageAlt,
    ...deepCandidates
  );

  const fallbackMessage = pickFirstNonEmptyString(
    body?.query,
    body?.question,
    body?.content
  );

  const message = isPlaceholderMessage(rawMessage)
    ? pickFirstNonEmptyString(
        fallbackMessage,
        ...deepCandidates.filter((candidate) => !isPlaceholderMessage(candidate))
      )
    : rawMessage;

  const explicitPhone = pickFirstNonEmptyString(
    body?.phone,
    body?.phone_number,
    body?.phoneNumber,
    body?.telefono_whatsapp,
    body?.p_telefono,
    body?.numero,
    body?.numero_whatsapp,
    body?.from_number,
    body?.fromNumber,
    body?.whatsapp_id,
    body?.p_whatsapp_id,
    body?.telefono,
    body?.telefono_cliente,
    body?.sender?.phone,
    body?.sender?.wa_id,
    body?.sender?.id,
    body?.customer?.phone,
    body?.cliente?.telefono,
    body?.conversation?.phone_number,
    body?.conversation?.wa_id,
    body?.session_phone,
    body?.chat?.jid,
    body?.chat?.remoteJid,
    body?.whatsapp?.from,
    body?.whatsapp?.wa_id,
    body?.whatsapp?.messages?.[0]?.from,
    body?.metadata?.phone,
    body?.metadata?.wa_id,
    body?.metadata?.remote_jid,
    body?.metadata?.remoteJid,
    body?.metadata?.participant,
    body?.contact?.phone,
    body?.contact?.wa_id,
    body?.data?.from,
    body?.data?.wa_id,
    body?.data?.phone,
    body?.data?.key?.remoteJid,
    body?.data?.key?.participant,
    body?.payload?.from,
    body?.payload?.phone,
    body?.payload?.wa_id,
    body?.payload?.telefono_whatsapp,
    body?.payload?.p_telefono,
    body?.payload?.p_whatsapp_id,
    body?.payload?.key?.remoteJid,
    body?.data?.telefono_whatsapp,
    body?.data?.p_telefono,
    body?.data?.p_whatsapp_id,
    body?.From,
    body?.from,
    body?.wa_id,
    body?.contact,
    instagramMessagingSenderId,
    instagramChangeSenderId,
    instagramCommentSenderId,  // sender de comentario IG
    nestedPhone,
    webhookPhone,
    webhookContactPhone,
    deepPhoneCandidate,
    "unknown"
  );

  const phone = pickFirstNonEmptyString(explicitPhone, deepPhoneCandidate, "unknown");

  const normalizedPhone = normalizePhoneIdentifier(phone);

  // Instagram no usa teléfono del usuario final en la mayoría de webhooks.
  // Guardamos un identificador estable con prefijo para evitar confundirlo con teléfono.
  if ((channel === "instagram" || body?.object === "instagram") && normalizedPhone !== "unknown") {
    return { message, phone: `ig:${normalizedPhone}`, channel: "instagram", profileName };
  }

  // Fallback: si el normalizedPhone tiene 16+ dígitos es un Instagram sender ID (PSID).
  // Ocurre cuando Make reenvía el payload antes de que detectInboundChannel lo identifique.
  if (normalizedPhone.length >= 16 && !normalizedPhone.startsWith("ig:")) {
    return { message, phone: `ig:${normalizedPhone}`, channel: "instagram", profileName };
  }

  if (normalizedPhone === "unknown") {
    console.warn("[extractMessageAndPhone] No se pudo extraer teléfono", {
      directPhone: body?.phone || body?.phone_number || body?.telefono || body?.from || body?.wa_id,
      deepKeyCandidates: deepKeyCandidates.slice(0, 10),
      channel,
    });
  }

  const resolvedChannel: "instagram" | "whatsapp" | "unknown" =
    channel !== "unknown"
      ? channel
      : String(normalizedPhone || "").startsWith("ig:")
      ? "instagram"
      : normalizedPhone !== "unknown"
      ? "whatsapp"
      : "unknown";

  return { message, phone: normalizedPhone, channel: resolvedChannel, profileName };
}

async function getConversationHistory(
  supabase: any, 
  phone: string, 
  limit = 5
): Promise<Array<{user: string, agent: string, agent_raw?: string, created_at?: string | null}>> {
  try {
    const { data, error } = await supabase
      .from("agent_conversations")
function buildStudentPaymentMethodsBlock(mediosPago: any[] = []): string {
  const methods = Array.isArray(mediosPago)
    ? mediosPago
        .filter((medio) => medio?.activo !== false)
        .slice(0, 8)
        .map((medio) => {
          const label = String(medio?.nombre || "").trim();
          const description = String(medio?.descripcion || "").trim();
          if (!label) return "";
          return `• ${label}${description ? `: ${description}` : ""}`;
        })
        .filter(Boolean)
    : [];

  if (methods.length > 0) {
    return `💳 *Medios de pago:*
${methods.join("\n")}`;
  }

  return `💳 *Medios de pago:*
• Efectivo
• Nequi: 3006402575
• Bancolombia
• Sistecrédito
• Tarjeta`;
}

function buildStudentDirectResponse(message: string, studentContext: any, mediosPago: any[] = []): string | null {
      .eq("phone_number", phone)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
  const asksTotalDebtExplicit = /\b(deuda total|saldo total|total pendiente|deuda acumulada)\b/i.test(text);
      console.error("[getConversationHistory] Error:", error);
      return [];
    }
  if (asksDebt || asksNextPay || asksTotalDebtExplicit) {
      user: row.user_message,
}

async function saveConversation(
    const methodsBlock = buildStudentPaymentMethodsBlock(mediosPago);
    return `Tu pago del mes corresponde a la cuota ${next.numeroCuota ?? "?"}, vence el ${formatDateShort(next.fechaVencimiento)} y el valor es ${formatCurrencyCOP(Number(next.monto || 0))}.\n\n${methodsBlock}`;
  phone: string,
  userMessage: string,
  agentResponse: string,
  transcription?: string,
  channel?: "instagram" | "whatsapp" | "unknown",
  profileName?: string
): Promise<void> {
  try {
    const payloadWithChannel = {
      phone_number: phone,
      user_message: userMessage,
      agent_response: agentResponse,
      transcription: transcription || null,
      channel: channel || (String(phone || "").startsWith("ig:") ? "instagram" : "whatsapp"),
      profile_name: normalizeProfileName(profileName),
    };

    let { error } = await supabase
      .from("agent_conversations")
      .insert(payloadWithChannel);

    // Compatibilidad temporal si la migración aún no fue aplicada
    if (error && /column .* does not exist/i.test(String(error.message || ""))) {
      console.warn("[saveConversation] Columnas channel/profile_name no existen. Guardando sin metadatos de canal/perfil.");
      const fallbackPayload = {
        phone_number: phone,
        user_message: userMessage,
        agent_response: agentResponse,
        transcription: transcription || null,
      };

      const retry = await supabase
        .from("agent_conversations")
        .insert(fallbackPayload);
      error = retry.error;
    }

    if (error) {
      console.warn("[saveConversation] Error:", error);
    } else {
      console.log("[saveConversation] Guardada");
    }
  } catch (err) {
    console.warn("[saveConversation] Error:", err);
  }
}

function stripMediaMarkersForPrompt(value: string | null | undefined): string {
  if (!value) return "";

  return String(value)
    .replace(/\[📷\s+[^\]|\n]+\|[^\]\n]*\]\s*/g, "")
    .replace(/^\s*📷\s*https?:\/\/\S+\s*$/gim, "")
    .trim();
}

async function searchKnowledge(
  supabase: any, 
  query: string, 
  limit = 3
): Promise<string[]> {
  try {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return [];

   const { data, error } = await supabase
      .from("agent_chunks")
      .select("content")
      .or(keywords.map(k => `content.ilike.%${k}%`).join(","))
      .limit(limit);

    if (error) {
      console.error("[searchKnowledge] Error:", error);
      return [];
    }

    return (data || []).map((r: any) => r.content);
  } catch (err) {
    console.error("[searchKnowledge] Error:", err);
    return [];
  }
}

/**
 * Detectar si ya hay un saludo en el historial de conversación
 */
function hasGreetingInHistory(conversationHistory: Array<{user: string, agent: string, created_at?: string | null}>): boolean {
  if (!conversationHistory || conversationHistory.length === 0) return false;

  const greetings = /\b(hola|buen(?:os|as)?(?:\s+d[ií]as|\s+tardes|\s+noches)?|bienvenid[oa]|que\s+tal|hey|saludos|encantad[oa])\b/i;
  const today = getColombiaNowDate().toISOString().slice(0, 10);

  return conversationHistory.some((msg: { user: string; agent: string; created_at?: string | null }) => {
    const text = String(msg.agent || "");
    if (!greetings.test(text)) return false;
    if (!msg.created_at) return true;
    return String(msg.created_at).slice(0, 10) === today;
  });
}

/**
 * Extraer URLs de imágenes ya enviadas en el historial reciente.
 * El marcador en el historial tiene el formato: [📷 URL|caption]
 * Se usa para no repetir la misma imagen en respuestas consecutivas.
 */
function extractSentImageUrlsFromHistory(
  conversationHistory: Array<{user: string, agent: string, agent_raw?: string, created_at?: string | null}>
): string[] {
  const urls: string[] = [];
  // Patrón: [📷 <url>|<caption>]
  const pattern = /\[📷\s+([^\|]+)\|/g;
  for (const msg of conversationHistory) {
    const text = String(msg.agent_raw || msg.agent || "");
    let match = pattern.exec(text);
    while (match !== null) {
      const url = match[1]?.trim();
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
      match = pattern.exec(text);
    }
    pattern.lastIndex = 0;
  }
  return urls;
}

function stripRepeatedGreetingPrefix(text: string, hasHistory: boolean): string {
  if (!hasHistory) return text;

  const greetingPrefix = /^\s*(?:[¡!¿?.,:;\-–—\s]|\p{Emoji_Presentation})*(?:hola(?:\s+de\s+nuevo)?|buen(?:os|as)?(?:\s+d[ií]as|\s+tardes|\s+noches)?|saludos)\b[\s!¡.,:;\-–—]*/iu;
  return String(text || "").replace(greetingPrefix, "").trim();
}

/**
 * Detectar señales de intención de compra o cierre
 * Retorna true si el usuario muestra intención de inscribirse/comprar
 */
function detectBuyingIntent(
  userMessage: string,
  conversationHistory: Array<{user: string, agent: string}> = []
): boolean {
  const message = userMessage.toLowerCase();
  
  // Señales directas de compra
  const directBuyingSignals = [
    /\b(quiero\s+(inscribirme|matricularme|inscribir|apuntarme|registrarme))/i,
    /\b(quiero\s+(registrar|registrarme|registrase|registrasse|inscribirme|inscribirse|inscribisse))/i,
    /\b(me\s+quiero\s+(inscribir|registrar))/i,
    /\b(cómo\s+(me\s+inscribo|hago\s+para\s+inscribirme|puedo\s+inscribirme))/i,
    /\b(como\s+me\s+(registro|registr[oó]))/i,
    /\b(dónde\s+(me\s+inscribo|puedo\s+inscribirme|pago))/i,
    /\b(donde\s+me\s+(registro|registr[oó]))/i,
    /\b(cuándo\s+puedo\s+(empezar|iniciar|comenzar))/i,
    /\b(me\s+(interesa|gustaría|quiero)\s+(el\s+)?curso)/i,
    /\b(ya\s+quiero\s+(iniciar|empezar|inscribirme|registrarme))/i,
    /\b(quiero\s+(información|más\s+info)\s+para\s+inscribirme)/i,
    /\b(voy\s+a\s+(inscribirme|matricularme|apuntarme))/i,
    /\b(quiero\s+agendar|agendar\s+(una\s+)?(cita|visita))/i,
    /\b(puedo\s+ir\s+a\s+(ver|visitar|conocer))/i,
    /\b(cuál\s+es\s+(la|su)\s+dirección)/i,
    /\b(dónde\s+(están\s+ubicados|quedan|se\s+encuentran))/i,
    /\b(me\s+convence|estoy\s+convencido|me\s+decidí)/i,
    /\b(sí\s+(quiero|me\s+interesa))/i,
    /\b(listo|perfecto|excelente),?\s+(quiero|me\s+inscribo)/i,
  ];
  
  // Verificar señales directas
  if (directBuyingSignals.some(pattern => pattern.test(message))) {
    return true;
  }
  
  // Señales indirectas: ha preguntado por costos Y horarios
  const hasAskedAboutPrice = conversationHistory.some(msg =>
    /\b(precio|costo|cuánto|valor|inversión|pago|cuota)/i.test(msg.user)
  );
  
  const hasAskedAboutSchedule = conversationHistory.some(msg =>
    /\b(horario|hora|cuándo|día|fecha|grupo|disponible|inicio)/i.test(msg.user)
  );
  
  // Si ya preguntó sobre precio y horarios, y ahora hace una pregunta positiva
  if (hasAskedAboutPrice && hasAskedAboutSchedule) {
    const positiveSignals = [
      /\b(perfecto|bien|entiendo|ok|vale|genial|excelente)/i,
      /\b(gracias|muchas\s+gracias)/i,
      /\b(me\s+(sirve|funciona|conviene))/i,
    ];
    
    if (positiveSignals.some(pattern => pattern.test(message))) {
      return true;
    }
  }
  
  return false;
}

function buildAgentPrompt(
  settings: any,
  userMessage: string,
  knowledgeChunks: string[],
  conversationHistory: Array<{user: string, agent: string, created_at?: string | null}> = [],
  hierarchicalContext: string = "",
  contextualDirective: string = "",
  admissionsNumber: string = ADMISSIONS_NUMBER
): string {
  const persona = settings?.persona_name || "Dany";
  const bio = settings?.persona_bio || "Asesor experto masculino de la Academia de Belleza Crystal Diamante en Cali.";
  const style = settings?.speaking_style || "";
  const greeting = settings?.greeting || "";
  const fallback = settings?.fallback_response || "Para darte el dato exacto, voy a consultar con el Director y te confirmo de inmediato";
  
  // Detectar si ya hay un saludo previo
  const alreadyGreeted = hasGreetingInHistory(conversationHistory);
  
  // Detectar intención de compra/cierre
  const showsBuyingIntent = detectBuyingIntent(userMessage, conversationHistory);

  const nowInColombia = getColombiaNowDate();
  const expectedSlotGreeting = getTimeSlotGreeting(nowInColombia.getHours());

  const greetingRule = alreadyGreeted
    ? `⚠️ YA SALUDASTE HOY (${expectedSlotGreeting}). Ve directo a la respuesta. PROHIBIDO repetir saludos en este mismo día.`
    : greeting
    ? `Saluda SOLO UNA VEZ por día y usa una franja horaria coherente (${expectedSlotGreeting}).
Si vas a saludar, usa este saludo base como referencia: "${greeting}".
Personaliza el saludo devolviendo el mismo tono del usuario (si dice "Buenas", responde "¡Buenas!" o "¡${expectedSlotGreeting}!").
Presenta la academia brevemente y haz UNA sola pregunta abierta para entender qué necesita.
Ejemplo natural: "¡${expectedSlotGreeting}! 😊 Bienvenida/o a Crystal Diamante. ¿Estás buscando información sobre algún curso o tienes alguna duda?"
Después del primer saludo del día, responde sin volver a saludar.`
    : `Saluda SOLO UNA VEZ por día con franja horaria coherente (${expectedSlotGreeting}).
Devuelve el mismo tono del usuario: si dice "Buenas" → responde "¡Buenas! 😊"; si dice "Hola" → "¡Hola! 💎".
Presenta la academia en UNA frase y haz UNA pregunta abierta. Ejemplo: "¡${expectedSlotGreeting}! Bienvenida/o a Academia Crystal Diamante 💎 ¿En qué te puedo ayudar?"
Después del primer saludo del día, responde sin volver a saludar.`;

  const salesProtocol = showsBuyingIntent
    ? `✅ **DETECTADO: El usuario muestra INTENCION DE COMPRA**

**ACCION OBLIGATORIA:**
1. Confirma su interes de forma positiva y motivadora
2. Proporciona el numero de Admisiones: **${admissionsNumber}** (WhatsApp)
3. Invitalo a escribir para agendar inscripcion o visita

**EJEMPLO DE CIERRE:**
"¡Perfecto! Me encanta que estes listo para convertirte en profesional. 🎓

Para finalizar tu inscripcion y reservar tu cupo, escribe directamente a nuestro equipo de Admisiones:

📱 **WhatsApp Admisiones: ${admissionsNumber}**

Ellos te guiaran en el proceso de pago, confirmaran tu grupo y resolveran cualquier duda. ¡Nos vemos pronto en la academia! 💎✨"`
    : `⚠️ **FASE DE INFORMACION** - NO proporciones el numero de Admisiones aun.

Ayuda al usuario a conocer:
• Cursos disponibles
• Costos (inscripcion + mensualidad)
• Horarios de grupos disponibles
• Beneficios del programa

**Solo daras el numero de contacto (${admissionsNumber}) cuando:**
✓ Ya haya preguntado por precios
✓ Ya haya preguntado por horarios
✓ Muestre señales claras: "quiero inscribirme", "como me inscribo", "donde pago", "cuando puedo empezar"`;

  const systemPromptTemplate = (settings?.system_prompt || "").trim();
  let prompt = applyTemplate(systemPromptTemplate, {
    persona_name: persona,
    persona_bio: bio,
    speaking_style: style,
    greeting_rule: greetingRule,
    fallback_response: fallback,
    sales_protocol: salesProtocol,
    admissions_number: admissionsNumber,
  });

  if (hierarchicalContext) {
    prompt += `\n${hierarchicalContext}\n`;
  }

  if (conversationHistory.length > 0) {
    // Calcular si hay brecha de tiempo significativa desde el último mensaje
    const lastMsg = conversationHistory[conversationHistory.length - 1];
    const lastMsgDate = lastMsg?.created_at ? new Date(lastMsg.created_at) : null;
    const nowMs = Date.now();
    const gapMs = lastMsgDate ? nowMs - lastMsgDate.getTime() : 0;
    const gapHours = gapMs / (1000 * 60 * 60);
    const isStaleHistory = gapHours > 4;
    const isDaysOld = gapHours > 24;

    // Detectar si el agente dejó una promesa pendiente sin resolver
    const lastAgentText = String(lastMsg?.agent || "").toLowerCase();
    const hasPendingPromise =
      isDaysOld &&
      /confirmo\s+enseguida|te\s+confirmo|voy\s+a\s+validar|voy\s+a\s+consultar|voy\s+a\s+verificar|te\s+aviso|te\s+digo|te\s+cuento\s+en|me\s+comprometo/.test(lastAgentText);

    if (isDaysOld) {
      const daysAgo = Math.round(gapHours / 24);
      prompt += `\n# ⚠️ ALERTA DE SESIÓN: El historial tiene ${daysAgo} día(s) de antigüedad. ESTA ES UNA CONVERSACIÓN NUEVA — NO asumas que el tema anterior sigue activo. Saluda fresca y naturalmente, pregunta en qué puedes ayudar HOY. NO uses "Perfecto" ni transiciones que impliquen continuidad inmediata.\n`;
      if (hasPendingPromise) {
        prompt += `# 🔴 PROMESA PENDIENTE DETECTADA: En el historial, el agente prometió confirmar algo que quedó sin respuesta. Si el usuario no pregunta explícitamente, NO menciones esa promesa. Si la situación surge naturalmente, discúlpate brevemente y ofrece retomar.\n`;
      }
    } else if (isStaleHistory) {
      prompt += `\n# ℹ️ NOTA: El historial tiene más de 4 horas de antigüedad. Trata esta sesión como semi-nueva: saluda con calidez si el usuario saluda, y verifica el tema antes de asumir continuidad.\n`;
    }

    prompt += `\n# Historial de conversación reciente:\n`;
    conversationHistory.forEach((msg) => {
      const dateLabel = msg.created_at
        ? ` [${new Date(msg.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}]`
        : "";
      prompt += `\nUsuario${dateLabel}: ${msg.user}\n${persona}: ${msg.agent}\n`;
    });
  }

  if (knowledgeChunks.length > 0) {
    prompt += `\n# Contexto disponible (base de conocimiento):\n`;
    knowledgeChunks.forEach((chunk, idx) => {
      prompt += `\n## Fragmento ${idx + 1}:\n${chunk.slice(0, 600)}\n`;
    });
  }

  if (contextualDirective) {
    prompt += `\n# DIRECTIVA CONTEXTUAL (PRIORIDAD ALTA):\n${contextualDirective}\n`;
  }

  prompt += `\n# 🎯 INSTRUCCIÓN DE RESPUESTA:
Responde SOLO con información explícita del contexto anterior (programas, grupos, horarios, precios).
Si el usuario pregunta por un curso/programa que NO está listado arriba, responde: "Actualmente no tengo ese programa disponible. Puedo ofrecerte información sobre [listar programas disponibles]."
NO inventes horarios, precios ni fechas que no estén en el contexto.
`;

  prompt += `\n# 🗣️ MODO HUMANO OBLIGATORIO (PRIORIDAD MÁXIMA):
1) Responde PRIMERO la pregunta exacta del usuario en la primera línea.
2) No cambies de tema: si pregunta horario, responde horario; si pregunta pagos, responde pagos.
3) Evita discurso robótico o de plantilla. Usa lenguaje natural, claro y cercano.
4) Máximo 2 bloques cortos y una sola pregunta de seguimiento.
5) No metas información no pedida ni invitaciones comerciales si no aportan a la pregunta actual.
6) Si no hay dato exacto, dilo directo y ofrece el siguiente paso más útil en una frase.
`;

  prompt += `\n# Mensaje del usuario:\n${userMessage}\n\n# Tu respuesta (como ${persona}):`;

  return prompt;
}

type AgentIntent = "precio" | "horario" | "temario" | "materiales" | "inscripcion" | "requisitos" | "general";

function detectUserIntent(message: string): "precio" | "horario" | "temario" | "materiales" | "inscripcion" | "requisitos" | "general" {
  const text = normalizeForMatch(message);
  const hasDurationIntent = /\b(cuanto dura|duracion|duracion del curso|meses|cuantas clases|cuantas sesiones|tiempo del curso)\b/i.test(text);
  const hasClassFrequencyIntent = /\b(cada cuanto|cuantas veces|cada semana|semanal|que dias son clases|cada cuantos dias|con que frecuencia)\b/i.test(text);
  const hasPriceIntent = /\b(precio|precios|costo|costos|vale|valor|valores|mensualidad|mensualidades|inscripcion|inscripciones|cuota|cuotas|inversion|invercion|inversiion|cuanto vale|cuanto es|cuanto cuesta|abono|abonar|pago parcial|cuota inicial)\b/i.test(text) || /\b(se paga|cada mes|al mes|mes a mes|paga)\b/i.test(text);
  const hasEnrollmentIntent = /\b(inscrib|matricul|admisiones|contacto|whatsapp|separar\s+cupo|reservar\s+cupo|reservame|quiero\s+inscribirme)\b/i.test(text);
  const hasScheduleIntent = /\b(horarios?|horas?|dias?|fecha|cuando\s+inicia|inicio|arranca|empieza|grupo|cupo|cupos|disponible|hoy\s+hay\s+clase|hay\s+clase\s+hoy|tengo\s+clase\s+hoy|todos\s+los\s+dias|cuantos\s+dias|que\s+dias)\b/i.test(text);
  const hasStrongScheduleIntent = /\b(cuando|inicio|arranca|empieza|fecha|horarios?|horas?)\b/i.test(text);
  const hasMaterialsKeyword = /\b(material|materiales|insumo|insumos|herramienta|herramientas|kit|kits|implementos|lista\s+de\s+materiales|que\s+traer|que\s+llevar|que\s+tienen\s+los)\b/i.test(text);
  // "llevar" solo cuenta como requisito si NO hay keyword de materiales (evitar que "llevar materiales" sea requisito)
  const hasRequirementsIntent = /\b(requisito|requisitos|edad|anos|menor|mayor|cedula|documento|necesito|experiencia|conocimiento)\b/i.test(text)
    || (!hasMaterialsKeyword && /\b(llevar)\b/i.test(text));

  if (hasRequirementsIntent && !hasMaterialsKeyword) {
    return "requisitos";
  }
  if (hasDurationIntent || hasClassFrequencyIntent) {
    return "horario";
  }
  if (hasEnrollmentIntent) {
    return "inscripcion";
  }
  if (hasScheduleIntent && hasStrongScheduleIntent) {
    return "horario";
  }
  if (hasPriceIntent) {
    return "precio";
  }
  if (hasScheduleIntent) {
    return "horario";
  }
  if (/\b(temario|contenido|que\s+aprendo|que\s+ven|modulos|ciclos|materias)\b/i.test(text)) {
    return "temario";
  }
  if (hasMaterialsKeyword) {
    return "materiales";
  }
  if (/\b(inscrib|matricul|admisiones|contacto|numero|whatsapp|separar\s+cupo|reservar\s+cupo)\b/i.test(text)) {
    return "inscripcion";
  }
  return "general";
}

function normalizeForMatch(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTodayClassQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(hoy\s+hay\s+clase|hay\s+clase\s+hoy|tengo\s+clase\s+hoy|hoy\s+tengo\s+clase|clase\s+hoy)\b/i.test(text);
}

function isLikelyProgramOnlyReply(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const hasGreetingKeyword = /\b(hola|buenas?|buen\s+dia|buenos\s+dias|buenas\s+tardes|buenas\s+noches|saludos|hey|que\s+tal)\b/i.test(text);
  if (hasGreetingKeyword) return false;

  const tokenCount = text.split(" ").filter(Boolean).length;
  if (tokenCount > 4) return false;

  // Excluir si contiene números (ej: "aparte los 190", "los 260")
  if (/\d+/.test(text)) return false;

  // Si es afirmación corta colombiana ("Si de una", "dale", "de una") → no es nombre de programa
  if (isShortAffirmativeReply(message)) return false;

  // Excluir si contiene palabras de intención real (plurales incluidos)
  const hasIntentKeyword = /\b(?:precio|horarios?|horas?|materiales?|temarios?|inscrip\w*|matricul\w*|pagos?|cuantos?|cuando|donde|ubicaci[oó]n|ubicados?|direcci[oó]n|cali|s[aá]bados?|fin\s+de\s+semana|trabajo|lunes|viernes|personal|presencial|dias?|todos?|ir\s+a|puedo\s+ir|aparte|ademas|ademas?|mas\s+all[aá]|cobr[a-z]+|reservar|cupo|separar|abono|abonar|pago\s+parcial|cuota\s+inicial|cual|sirve|conviene|mejor|redes|instagram|facebook|youtube|tiktok)\b/i.test(text);
  if (hasIntentKeyword) return false;

  return true;
}

function isShortAffirmativeReply(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const words = text.split(" ").filter(Boolean);
  if (words.length > 4) return false;

  if (/^s+i+$/i.test(text)) return true;
  if (/^s+i+p+$/i.test(text)) return true;

  return /^(si|dale|ok|okay|okey|claro|listo|perfecto|de una|por favor|si por favor|claro que si|esta bien|ta bien|todo bien|entendido|clase|ciclo|ambos|los dos)$/i.test(text);
}

function isNoiseOnlyMessage(message: string): boolean {
  const raw = String(message || "").trim();
  if (!raw) return true;

  const normalized = normalizeForMatch(raw);
  if (!normalized) {
    return /^[.?!,;:¡!¿?()\-_/]+$/.test(raw);
  }

  return false;
}

function isNeutralAcknowledgement(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  if (text.includes("?")) return false;

  return /^(ok|okay|okey|listo|perfecto|esta bien|ta bien|entendido|vale|de acuerdo|super|genial|claro)$/i.test(text);
}

function buildNoiseFollowupFromHistory(history: Array<{ user: string; agent: string }>): string {
  const pendingTopic = inferPendingTopicFromHistory(history);

  if (/medios\s+de\s+pago|formas\s+de\s+pago|metodo\s+de\s+pago/.test(normalizeForMatch(pendingTopic))) {
    return "Te leí 👌 Para avanzar, dime cuál te queda mejor: *Nequi*, *Bancolombia*, *Sistecrédito*, *tarjeta* o *efectivo*.";
  }

  if (/dias\s+y\s+horario|horario|grupo/.test(normalizeForMatch(pendingTopic))) {
    return "Te leí 👌 ¿Quieres que te confirme *solo el horario actual* o que te revise si hay *otro grupo* disponible?";
  }

  if (/inscribirme|separar\s+cupo|pasos\s+de\s+inscripcion/.test(normalizeForMatch(pendingTopic))) {
    return "Te leí 👌 Si quieres, seguimos de una con los *pasos para separar tu cupo*.";
  }

  return "Te leí 👌 ¿Quieres que te cuente los *horarios*, *la inversión* o los *pasos para inscribirte*?";
}

function hasRecentPaymentReminderContext(history: Array<{ user: string; agent: string }>): boolean {
  const recentAgentMessages = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((turn) => normalizeForMatch(turn?.agent || ""))
    .filter(Boolean);

  return recentAgentMessages.some((msg) => {
    const hasPaymentTopic = /\b(mensualidad|cuota|cuotas|pago|pagos|saldo|vencimiento|vence|fecha\s+de\s+pago|recordatorio\s+de\s+pago|abono|deuda|pendiente)\b/i.test(msg);
    const hasReminderTone = /\b(recordatorio|te\s+recordamos|recuerda|por\s+favor\s+realizar|pendiente\s+de\s+pago|vence\s+el|fecha\s+limite|fecha\s+l[ií]mite|evita\s+intereses?)\b/i.test(msg);
    return hasPaymentTopic && hasReminderTone;
  });
}

function isGenericAckAfterReminder(message: string): boolean {
  return isThanksOnlyMessage(message)
    || isPureGreeting(message)
    || isNeutralAcknowledgement(message)
    || isShortAffirmativeReply(message)
    || isNoiseOnlyMessage(message);
}

function buildReminderFollowupReply(): string {
  return "¡Gracias por responder! 🙌 Este chat quedó sobre tu recordatorio de pago del mes.\n\n¿Ya realizaste el pago o quieres que te comparta medios de pago y fecha límite?";
}

function isOnlyScheduleConfirmationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const asksOnly = /\b(solo|solamente|unico|unica|ese|esa|asi|asi no mas)\b/i.test(text);
  const asksSchedule = /\b(horario|hora|grupo|turno)\b/i.test(text);
  const asksAlternative = /\b(otro|otra|mas|adicional|distinto|diferente|manejan|tienen|hay)\b/i.test(text);

  return asksSchedule && (asksOnly || asksAlternative);
}

function buildOnlyScheduleConfirmationReply(
  detectedProgram: any | null,
  courses: any[]
): string | null {
  if (!detectedProgram) {
    return "¡Claro! Para confirmarte si hay más horarios, dime el *curso* que te interesa y te respondo con precisión.";
  }

  const normalizedProgram = normalizeForMatch(detectedProgram.nombre || "");
  const relatedCourses = (courses || []).filter((course) => {
    const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
    const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
    return Boolean(sameProgramId || sameProgramName);
  });

  const schedules = Array.from(
    new Set(
      relatedCourses
        .map((course) => String(course?.horario || "").trim())
        .filter(Boolean)
    )
  );

  if (schedules.length <= 1) {
    const scheduleText = schedules[0] || "Por confirmar";
    return `✅ Sí, por ahora manejamos ese horario para *${detectedProgram.nombre}*: *${scheduleText}*.`;
  }

  const options = schedules.slice(0, 3).map((item) => `• ${item}`).join("\n");
  return `No, también tenemos más opciones de horario para *${detectedProgram.nombre}*:\n${options}\n\n¿Cuál te queda mejor para ayudarte a separar cupo?`;
}

function buildNaturalAckReply(
  message: string,
  lastAgentMessage: string,
  detectedProgram: any | null
): string | null {
  if (!isNeutralAcknowledgement(message)) return null;

  const normalizedLast = normalizeForMatch(lastAgentMessage || "");
  if (!normalizedLast) return null;

  if (/medios\s+de\s+pago|formas\s+de\s+pago|fechas\s+de\s+pago|mensualidad|inscripcion/.test(normalizedLast)) {
    return "Perfecto 🙌 Si quieres, te ayudo a escoger el medio de pago que más te convenga y te dejo listo el siguiente paso.";
  }

  if (/horario|inicio|grupo|dias/.test(normalizedLast)) {
    const programName = detectedProgram?.nombre ? ` de *${detectedProgram.nombre}*` : "";
    return `Genial 😊 Si ese horario${programName} te funciona, te comparto ahora mismo los pasos para separar cupo.`;
  }

  if (/instagram|redes|siguenos/.test(normalizedLast)) {
    // El contexto de Instagram ya es manejado upstream en buildIntentFocusedDirectResponse
    return null;
  }

  return "Perfecto 😊 ¿Quieres que te cuente los *horarios*, *la inversión* o los *pasos para inscribirte*?";
}

function isClosureAcknowledgement(message: string, lastAgentMessage: string): boolean {
  if (!isShortAffirmativeReply(message)) return false;

  const normalizedLastAgent = normalizeForMatch(lastAgentMessage || "");
  if (!normalizedLastAgent) return false;

  return /\b(alguna otra duda|si necesitas algo|te esperamos|nos vemos|quedo atenta|quedo atento|quedo pendiente|cualquier duda|antes de iniciar|te guie con el proceso|te guie con inscripcion)\b/i.test(normalizedLastAgent);
}

function inferPendingTopicFromHistory(history: Array<{ user: string; agent: string }>): string {
  const lastAgent = String(history[history.length - 1]?.agent || "");
  if (!lastAgent) return "";

  // Leer SOLO la última pregunta del agente (después del último "?")
  // Esto evita que keywords del cuerpo del mensaje (ej: "inversión") contaminen la inferencia
  const questionParts = lastAgent.split("?");
  // La última pregunta real es la penúltima parte (la última está vacía si termina en "?")
  const lastQuestion = questionParts.length >= 2
    ? (questionParts[questionParts.length - 2] || "").split(/[\n\r]/).pop() || ""
    : "";
  const normalizedQuestion = normalizeForMatch(lastQuestion);

  if (/\b(alguna otra duda|si necesitas algo|antes de iniciar|te guie con el proceso|te guie con inscripcion|quedo atenta|quedo atento|nos vemos|te esperamos)\b/i.test(normalizedQuestion)) {
    return "";
  }

  // Detectar pregunta de DOBLE OPCIÓN (A o B): cuando el agente ofreció dos caminos
  // y el usuario responde "sí" sin especificar cuál, se necesita clarificación.
  // Ejemplos: "¿horarios e inversión o separar cupo?", "¿te cuento el precio o avanzamos?"
  if (normalizedQuestion) {
    const hasScheduleOrPrice = /\b(horarios?|inversion|precio|mensualidad|informacion)\b/i.test(normalizedQuestion);
    const hasEnrollment = /\b(separar\s+cupo|reservar|inscribir|avanzar|cupo|matricular)\b/i.test(normalizedQuestion);
    const isOrQuestion = /\b(o\s+prefieres|o\s+vas|o\s+te|o\s+ir|o\s+avanzar|o\s+directo)\b/i.test(normalizedQuestion);
    if (hasScheduleOrPrice && hasEnrollment && isOrQuestion) {
      // Señal especial: el usuario dijo "sí" a una elección A o B → pedir que aclare
      return "__clarificacion_opcion__";
    }
  }

  // Inferir por la última pregunta específica del agente
  if (normalizedQuestion) {
    if (/\b(clase\s+por\s+clase|por\s+clase|temario\s+detallado)\b/i.test(normalizedQuestion)) return "quiero el temario clase por clase";
    if (/\b(referencia|como llegar|llegar mas facil|indicaciones|llegar alli)\b/i.test(normalizedQuestion)) return "quiero la referencia para llegar";
    if (/\b(validar|confirmar|grupo|horario|queda bien|otro horario|mostrar otra opcion)\b/i.test(normalizedQuestion)) return "quiero confirmar el horario y grupo";
    if (/\b(separar cupo|reservar|reservo|reservame|inscribir|matricular|avanzar con el cupo)\b/i.test(normalizedQuestion)) return "quiero inscribirme y separar cupo";
    if (/\b(formas de pago|medios de pago|fechas de pago|metodo de pago)\b/i.test(normalizedQuestion)) return "quiero saber los medios de pago";
    if (/\b(pasos de inscripcion|como me inscribo|como inscribirme)\b/i.test(normalizedQuestion)) return "quiero saber como me inscribo";
    if (/\b(inversion|precio|inscripcion|mensualidad)\b/i.test(normalizedQuestion)) return "quiero saber la inversion";
    if (/\b(fecha|inicio|horario|dias|dia|hora)\b/i.test(normalizedQuestion)) return "quiero saber dias y horario";
    if (/\b(cupo|cupos|disponible)\b/i.test(normalizedQuestion)) return "quiero saber si hay cupos disponibles";
    if (/\b(material|materiales|insumo|kit)\b/i.test(normalizedQuestion)) return "quiero saber materiales";
    if (/\b(temario|contenido|modulo|ciclo)\b/i.test(normalizedQuestion)) return "quiero saber el temario";
  }

  // Fallback: escanear todo el mensaje (solo si no hubo pregunta clara)
  const normalized = normalizeForMatch(lastAgent);
  if (/\b(te reservo( un)? cupo|reservo( tu|el)? cupo|reservar tu cupo|te ayudo a reservar|separar cupo)\b/i.test(normalized)) return "quiero inscribirme y separar cupo";
  if (/\b(cupo|cupos|disponible|disponibles)\b/i.test(normalized)) return "quiero saber si hay cupos disponibles";
  if (/\b(proximo grupo|siguiente grupo|proximo curso|fecha confirmada|por confirmar)\b/i.test(normalized)) return "quiero saber el proximo grupo y su fecha";
  if (/\b(materiales|material|insumo|kit|por clase o por ciclo)\b/i.test(normalized)) return "quiero saber materiales";
  if (/\b(clase\s+por\s+clase|por\s+clase|temario\s+detallado)\b/i.test(normalized)) return "quiero el temario clase por clase";
  if (/\b(temario|contenido|modulo|modulos|ciclo)\b/i.test(normalized)) return "quiero saber el temario";
  if (/\b(horario|dias|dia|hora)\b/i.test(normalized)) return "quiero saber dias y horario";
  if (/\b(inscripcion|inscribirme|admisiones|matricula|matricularme|pago)\b/i.test(normalized)) return "quiero saber como me inscribo";
  if (/\b(inversion|mensualidad|precio|costa|valor)\b/i.test(normalized)) return "quiero saber la inversion";

  return "";
}

function isPureGreeting(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  // Solo saludos solos, sin contenido adicional
  return /^(hola|hola\s+de\s+nuevo|hola\s+buenas?|hola\s+buenas?\s*(d[ií]as?|tardes?|noches?)?|buenas?\s*(d[ií]as?|tardes?|noches?)?|buen\s*d[ií]a|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|saludos|qué\s+tal|que\s+tal)$/.test(text.trim());
}

function enrichMessageWithFollowUpContext(
  userMessage: string,
  history: Array<{ user: string; agent: string }>
): string {
  // Nunca enriquecer un saludo puro — el usuario está iniciando nueva sesión,
  // no confirmando un tema anterior.
  if (isPureGreeting(userMessage)) {
    return userMessage;
  }

  // "Gracias" y similares no deben heredar tema pendiente del bot.
  if (isThanksOnlyMessage(userMessage)) {
    return userMessage;
  }

  if (!isShortAffirmativeReply(userMessage)) {
    return userMessage;
  }

  const pendingTopic = inferPendingTopicFromHistory(history);
  if (!pendingTopic) {
    return userMessage;
  }

  // Cuando el agente hizo una pregunta de elección (A o B) y el usuario
  // respondió ambiguamente, enriquecer con señal de clarificación para
  // que Gemini pregunte cuál opción prefiere en lugar de asumir una.
  if (pendingTopic === "__clarificacion_opcion__") {
    return `${userMessage}. [El usuario respondió de forma ambigua a una pregunta con dos opciones. El agente DEBE pedir que aclare cuál de las dos opciones prefiere con un mensaje breve y natural, sin repetir toda la información.]`;
  }

  return `${userMessage}. ${pendingTopic}.`;
}

function hasRecentTodayClassContext(
  history: Array<{ user: string; agent: string }>
): boolean {
  const recent = history.slice(-3);
  return recent.some((turn) => isTodayClassQuestion(turn?.user || ""));
}

function isCourseActiveOnDate(course: any, date: Date): boolean {
  const dayDate = new Date(date);
  dayDate.setHours(0, 0, 0, 0);

  const start = course?.fecha_inicio ? new Date(course.fecha_inicio) : null;
  const end = course?.fecha_fin ? new Date(course.fecha_fin) : null;

  if (start && !Number.isNaN(start.getTime())) {
    start.setHours(0, 0, 0, 0);
    if (dayDate < start) return false;
  }

  if (end && !Number.isNaN(end.getTime())) {
    end.setHours(0, 0, 0, 0);
    if (dayDate > end) return false;
  }

  return true;
}

function scheduleIncludesDay(horario: string | null | undefined, dayIndex: number): boolean {
  const text = normalizeForMatch(horario || "");
  if (!text) return false;

  if (
    dayIndex >= 1 &&
    dayIndex <= 5 &&
    /\b(lunes\s*a\s*viernes|lunes\s*-\s*viernes|lun\s*a\s*vie|l\s*a\s*v|lv)\b/i.test(text)
  ) {
    return true;
  }

  const dayTokens: Record<number, string[]> = {
    0: ["domingo", "dom"],
    1: ["lunes", "lun"],
    2: ["martes", "mar"],
    3: ["miercoles", "mie", "mier"],
    4: ["jueves", "jue"],
    5: ["viernes", "vie"],
    6: ["sabado", "sab"],
  };

  return (dayTokens[dayIndex] || []).some((token) => new RegExp(`\\b${token}\\b`, "i").test(text));
}

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "";
  let date: Date;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-").map(Number);
    const year = parts[0] || 0;
    const month = parts[1] || 0;
    const day = parts[2] || 0;
    date = new Date(year, month - 1, day, 12, 0, 0); // Mediodía
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "";
  
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function formatDateLong(value: string | null | undefined): string {
  if (!value) return "";
  
  let date: Date;

  // Manejo robusto de fechas YYYY-MM-DD sin desfase horario
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-").map(Number);
    const year = parts[0] || 0;
    const month = parts[1] || 0;
    const day = parts[2] || 0;
    date = new Date(year, month - 1, day, 12, 0, 0); // Mediodía local para evitar cambios de día
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "";

  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const dayName = DAYS[date.getDay()];
  const day = date.getDate();
  const monthName = MONTHS[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName}, ${day} de ${monthName}`; // Omitimos el año para ser más conversacional, o lo incluimos si es necesario
}

function extractExplicitStudentName(message: string): string | null {
  const text = String(message || "").trim();
  if (!text) return null;

  const match = text.match(/\b(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\b/i);
  if (!match?.[1]) return null;

  const rawName = match[1]
    .trim()
    .replace(/[^a-záéíóúñ\s]/gi, "")
    .replace(/\s+/g, " ");

  if (!rawName || rawName.length < 2) return null;
  return rawName
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolvePreferredStudentName(
  userMessage: string,
  history: Array<{ user: string; agent: string }>
): string | null {
  const current = extractExplicitStudentName(userMessage);
  if (current) return current;

  for (let i = history.length - 1; i >= 0; i--) {
    const fromHistory = extractExplicitStudentName(history[i]?.user || "");
    if (fromHistory) return fromHistory;
  }

  return null;
}

function buildNameSafetyDirective(
  preferredName: string | null,
  profileName: string | null,
  channel: "instagram" | "whatsapp" | "unknown",
  phoneProfileName: string | null = null,
  phoneProfileRol: string | null = null
): string {
  if (preferredName) {
    return `NOMBRE VALIDADO DEL USUARIO: "${preferredName}". Si lo mencionas, usa SOLO ese nombre exacto.`;
  }

  if (channel === "instagram" && profileName) {
    return `PERFIL DE INSTAGRAM DEL USUARIO: "${profileName}". Si saludas o personalizas, usa ese nombre de forma natural y breve.`;
  }

  if (phoneProfileName) {
    const rolLabel = phoneProfileRol === 'profesor' ? 'profesor/a'
      : phoneProfileRol === 'estudiante' ? 'estudiante'
      : 'persona registrada en la academia';
    return `NOMBRE REGISTRADO EN NUESTRA BASE DE DATOS: "${phoneProfileName}" (${rolLabel}). Úsalo de forma natural y cálida al saludar o personalizar la respuesta. Si ya estudiaron o estudian con nosotros, puédeles decir algo como "¡Hola de nuevo, ${phoneProfileName}!" o "Qué gusto verte por acá, ${phoneProfileName}"  — sin forzarlo en cada oración.`;
  }

  return 'No hay nombre validado del usuario. NO inventes ni asumas nombres propios; responde sin llamar por nombre.';
}

function buildUpcomingStartDirective(detectedProgram: any | null, courses: any[]): string {
  if (!detectedProgram) {
    return 'Para consultas de inicio, si no hay programa detectado pide una aclaración breve sin inventar fechas.';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const normalizedProgram = normalizeForMatch(detectedProgram.nombre || "");
  const relatedCourses = (courses || []).filter((course) => {
    const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
    const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
    return Boolean(sameProgramId || sameProgramName);
  });

  const upcoming = relatedCourses
    .filter((course) => {
      if (!course?.fecha_inicio) return false;
      const start = new Date(course.fecha_inicio);
      if (Number.isNaN(start.getTime())) return false;
      start.setHours(0, 0, 0, 0);
      return start >= today;
    })
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

  if (!upcoming.length) {
    return `PROXIMO INICIO VALIDADO para ${detectedProgram.nombre}: no hay fecha futura confirmada. Si preguntan por próximo inicio, responde "Por confirmar".`;
  }

  const next = upcoming[0];
  return `PROXIMO INICIO VALIDADO para ${detectedProgram.nombre}: ${formatDateLong(next.fecha_inicio) || formatDateShort(next.fecha_inicio)} | Horario: ${next.horario || "Por confirmar"}. Nunca uses como "próximo" una fecha pasada.`;
}

function formatCurrencyCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function resolveProgramPaymentOptions(detectedProgram: any, primaryCourse: any) {
  const inscripcion = Number(detectedProgram?.precio_inscripcion ?? primaryCourse?.precio_inscripcion ?? 0);
  const mensual70 = Number(
    detectedProgram?.precio_mensual_70
    ?? primaryCourse?.precio_mensual_70
    ?? detectedProgram?.precio_mensualidad
    ?? primaryCourse?.precio_mensualidad
    ?? 0
  );
  const mensual100 = Number(
    detectedProgram?.precio_mensual_100
    ?? primaryCourse?.precio_mensual_100
    ?? detectedProgram?.precio_mensualidad
    ?? primaryCourse?.precio_mensualidad
    ?? mensual70
    ?? 0
  );
  const porClase = Number(detectedProgram?.precio_por_clase ?? primaryCourse?.precio_por_clase ?? 0);

  return {
    inscripcion,
    mensual70,
    mensual100,
    porClase,
    inscripcionText: inscripcion > 0 ? formatCurrencyCOP(inscripcion) : "Por confirmar",
    mensual70Text: mensual70 > 0 ? formatCurrencyCOP(mensual70) : "Por confirmar",
    mensual100Text: mensual100 > 0 ? formatCurrencyCOP(mensual100) : "Por confirmar",
    porClaseText: porClase > 0 ? formatCurrencyCOP(porClase) : "Por confirmar",
  };
}

function buildHumanPaymentModalitiesBlock(detectedProgram: any, primaryCourse: any): string {
  const options = resolveProgramPaymentOptions(detectedProgram, primaryCourse);
  return [
    `✅ *3 modalidades de pago:*`,
    `• *Por Clase:* ${options.porClaseText} por clase (no incluye materiales).`,
    `• *Mensual Opción A:* ${options.mensual70Text}/mes (incluye ~70% de materiales).`,
    `• *Mensual Opción B:* ${options.mensual100Text}/mes (incluye 100% de materiales del mes).`,
  ].join("\n");
}

function hasScannablePaymentModalities(text: string): boolean {
  const normalized = normalizeForMatch(text || "");
  if (!normalized) return false;

  return /por\s+clase/.test(normalized)
    && /mensual\s+opcion\s+a/.test(normalized)
    && /mensual\s+opcion\s+b/.test(normalized);
}

function ensurePaymentModalitiesInResponse(
  responseText: string,
  message: string,
  intent: AgentIntent,
  detectedProgram: any | null,
  courses: any[]
): string {
  const base = String(responseText || "").trim();
  if (!base || !detectedProgram) return base;

  const normalizedMessage = normalizeForMatch(message || "");
  const asksPriceOrPayment = intent === "precio"
    || /\b(precio|cuanto|costo|valor|inversion|inscripcion|mensualidad|pago|pagos|modalidad|modalidades|quincena|quincenal)\b/i.test(normalizedMessage);

  if (!asksPriceOrPayment) return base;
  if (hasScannablePaymentModalities(base)) return base;

  const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
  const block = buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse);
  return `${base}\n\n💳 *Modalidades de pago:*\n${block}`;
}

function isDurationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(cuanto dura|duracion|duracion del curso|meses|cuantas clases|cuantas sesiones|tiempo del curso)\b/i.test(text);
}

function isClassFrequencyQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(cada cuanto|cuantas veces|cada semana|semanal|que dias son clases|cada cuantos dias|con que frecuencia|las clases son cada)\b/i.test(text);
}

function isCertificationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(que titulo sale|con que titulo|titulo obtengo|que certificado|certificado|diploma|tecnico|tecnica|graduo|se gradua)\b/i.test(text);
}

function inferClassFrequencyFromSchedule(schedule: string): string {
  const text = normalizeForMatch(schedule || "");
  if (!text) return "con la frecuencia del grupo disponible";

  if (/\b(lunes\s*a\s*viernes|lunes\s*-\s*viernes|lun\s*a\s*vie|l\s*a\s*v|lv)\b/i.test(text)) {
    return "de lunes a viernes";
  }
  if (/\b(sabados\s*y\s*domingos|fin\s+de\s+semana|fines\s+de\s+semana)\b/i.test(text)) {
    return "los fines de semana";
  }

  const days = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    .filter((day) => new RegExp(`\\b${day}\\b`, "i").test(text));

  if (days.length === 1) return `una vez por semana (${days[0]})`;
  if (days.length > 1 && days.length <= 3) return `${days.length} veces por semana (${days.join(", ")})`;
  if (days.length > 3) return "varias veces por semana";

  return `según este horario: ${schedule}`;
}

function wasPromptAskedRecently(history: Array<{ user: string; agent: string }>, prompt: string): boolean {
  const normalizedPrompt = normalizeForMatch(prompt);
  if (!normalizedPrompt) return false;

  const recentAgentMessages = (Array.isArray(history) ? history : [])
    .slice(-2)
    .map((item) => String(item?.agent || ""));

  return recentAgentMessages.some((msg) => {
    const normalizedMsg = normalizeForMatch(msg);
    if (!normalizedMsg) return false;
    return wordOverlapRatio(normalizedMsg, normalizedPrompt) >= 0.82;
  });
}

function isFastTrackQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(mas rapido|más rapido|rapido|rápido|perfeccionamiento|intensivo|avanzado|express|acelerado)\b/i.test(text);
}

/**
 * Detectar si el usuario está corrigiendo o solicitando cambio de sus datos personales
 * (nombre, apellido, cédula, teléfono, etc.)
 */
function isPersonalDataCorrectionMessage(message: string): boolean {
  const text = String(message || "");
  return /\b(se\s+escribe|mi\s+(nombre|apellido|c[eé]dula|numero|n[uú]mero|tel[eé]fono)|correg[ia]|corrijan|corrija|cambien\s+(mi\s+)?nombre|cambia\s+(mi\s+)?nombre|cambiar\s+(mi\s+)?nombre|actualiz[ae]n?\s+(mi\s+)?(nombre|apellido|datos|perfil)|porfa\s+(cambi|corrij|actualiz)|as[ií]\s+se\s+escribe|as[ií]\s+es\s+mi|el\s+apellido\s+es|mi\s+apellido\s+correcto)\b/i.test(text);
}

function isLocationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  if (/\b(como llego|como puedo llegar|como llegar|mandame la ubicacion|enviame la ubicacion|pasame la ubicacion|comparteme la ubicacion|mandame ubicacion|enviame ubicacion|pasame ubicacion|comparteme ubicacion|mapa|google maps|maps app|ubicacion exacta|link de ubicacion|enlace de ubicacion|referencia para llegar)\b/i.test(text)) {
    return true;
  }
  if (/\b(donde se ubican|donde estan|donde quedan|direccion|ubicacion|ubicados|sede|en cali donde)\b/i.test(text)) {
    return true;
  }
  // Preguntas tipo "¿Están en Cali?", "¿quedan en Cali?" o "¿son de Cali?"
  if (/\b(estan en|son de|quedan en|ubicados en|sede en)\b/i.test(text) && !/\b(pago|pagar|inscrib|matricul|precio|cuanto|valor|mensualidad)\b/i.test(text)) {
    return true;
  }

  if (/\bdonde\b/i.test(text) && !/\b(pago|pagar|inscrib|matricul|precio|cuanto|valor|mensualidad)\b/i.test(text)) {
    return true;
  }

  return false;
}

function isFrustrationMessage(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(?:persona\s+(?:real|de\s+verdad)|humano|asesor\s+humano|no\s+entiendes?|no\s+me\s+ayudas?|hablar\s+con\s+alguien|quiero\s+hablar\s+con|cuando\s+atienda|atienda\s+una\s+persona|me\s+escriben\s+cuando|misma\s+respuesta|siempre\s+lo\s+mismo|sigues\s+igual|no\s+me\s+entiendes|bot\s+inutil|sigues\s+preguntando\s+lo\s+mismo|ya\s+te\s+dije|ya\s+te\s+respondi|no\s+sirves?)\b/i.test(text);
}

function isOutOfCaliConstraintMessage(message: string): boolean {
  const text = normalizeForMatch(message);

  // Frases directas de ubicación propia
  if (/\b(no\s+estoy\s+en\s+cali|no\s+vivo\s+en\s+cali|estoy\s+fuera\s+de\s+cali|soy\s+de\s+otra\s+ciudad|vivo\s+en\s+otra\s+ciudad|no\s+estoy\s+en\s+la\s+ciudad)\b/i.test(text)) {
    return true;
  }

  // "vivo en X", "estoy en X", "resido en X", "soy de X" donde X NO es Cali
  // Patrón: el usuario indica SU ciudad, no pregunta por la ubicación de la academia
  if (/\b(?:vivo|resido|soy\s+de|vengo\s+de)\s+en\s+(?!cali\b)\w+/i.test(text)) return true;
  if (/\b(?:vivo|resido)\s+en\s+(?!cali\b)\w+/i.test(text)) return true;

  // "Vivo en [ciudad colombiana conocida]" — cubre "vivo en manizales gracias"
  const otherColombianCities = /\b(?:bogota|medellin|barranquilla|cartagena|bucaramanga|manizales|pereira|cucuta|ibague|armenia|villavicencio|neiva|santa\s+marta|monteria|pasto|sincelejo|valledupar|tunja|popayan|bello|soacha|soledad|dosquebradas|floridablanca|palmira|buga|tulua|girardot|fusagasuga|zipaquira|chia|cajica|mosquera|facatativa)\b/i;
  // Solo si el usuario afirma vivir/estar ahí (no si pregunta si la academia está ahí)
  if (/\b(?:vivo|estoy|soy\s+de|resido|vengo\s+de)\s+(?:en\s+)?/.test(text) && otherColombianCities.test(text)) {
    return true;
  }

  return false;
}

function isSaturdayPreferenceConstraint(message: string): boolean {
  const text = normalizeForMatch(message);
  const asksSaturday = /\b(sabado|sabados|fin\s+de\s+semana|fines\s+de\s+semana)\b/i.test(text);
  const weekdayConstraint = /\b(trabajo\s+de\s+lunes\s+a\s+viernes|trabajo\s+entre\s+semana|no\s+puedo\s+entre\s+semana|solo\s+puedo\s+los\s+sabados|busco\s+un\s+curso\s+los\s+sabados|necesito\s+sabado)\b/i.test(text);
  return asksSaturday || weekdayConstraint;
}

function buildSaturdayConstraintReply(
  message: string,
  detectedProgram: any | null,
  courses: any[],
  programs: any[]
): string | null {
  if (!isSaturdayPreferenceConstraint(message)) {
    return null;
  }

  const sourceCourses = Array.isArray(courses) ? courses : [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const getUpcoming = (list: any[]) =>
    list
      .filter((course) => {
        if (!course?.fecha_inicio) return true;
        const start = new Date(course.fecha_inicio);
        if (Number.isNaN(start.getTime())) return true;
        start.setHours(0, 0, 0, 0);
        return start >= now;
      })
      .sort((a, b) => {
        const aTime = a?.fecha_inicio ? new Date(a.fecha_inicio).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.fecha_inicio ? new Date(b.fecha_inicio).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

  if (detectedProgram) {
    const normalizedProgram = normalizeForMatch(detectedProgram.nombre || "");
    const related = sourceCourses.filter((course) => {
      const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
      const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
      return Boolean(sameProgramId || sameProgramName);
    });

    const saturdayCourses = getUpcoming(related).filter((course) => scheduleIncludesDay(course?.horario || "", 6));

    if (saturdayCourses.length > 0) {
      const top = saturdayCourses[0];
      const nextStart = top?.fecha_inicio ? (formatDateLong(top.fecha_inicio) || formatDateShort(top.fecha_inicio)) : "Por confirmar";
      const schedule = top?.horario || "Por confirmar";
      return `¡Sí! 🙌 Para *${detectedProgram.nombre}* sí tenemos opción en *sábado*.

📅 *Próximo inicio:* ${nextStart}
🕓 *Horario:* ${schedule}

¿Quieres que te comparta los pasos para *separar tu cupo*?`;
    }

    return `Te entiendo perfecto 🙌 Si trabajas de lunes a viernes, lo ideal es *sábado*.

Hoy no veo grupo activo en sábado para *${detectedProgram.nombre}*.

Si quieres, te dejo en *lista prioritaria* para avisarte apenas abramos sábado, o te reviso la opción más cercana en horario flexible.`;
  }

  const saturdayAcrossPrograms = getUpcoming(sourceCourses).filter((course) => scheduleIncludesDay(course?.horario || "", 6));
  if (saturdayAcrossPrograms.length > 0) {
    const options = saturdayAcrossPrograms.slice(0, 3).map((course) => {
      const name = course?.programa_nombre || course?.nombre || "Programa";
      return `• *${name}* (${course?.horario || "Horario por confirmar"})`;
    }).join("\n");

    return `¡Sí! 🙌 Como buscas *sábado*, estas son las opciones que tengo activas ahora:

${options}

¿Cuál te interesa para confirmarte fecha de inicio y cupos?`;
  }

  const alternatives = Array.isArray(programs) ? programs.filter((p: any) => p?.activo !== false).slice(0, 4) : [];
  const alternativesText = alternatives.length
    ? `\n\nPuedo ayudarte a elegir una opción activa entre semana por ahora: ${alternatives.map((p: any) => `*${p.nombre}*`).join(", ")}.`
    : "";

  return `Te entiendo 🙌 Por ahora no tengo grupos activos en sábado registrados.${alternativesText}\n\nSi quieres, te anoto para avisarte apenas abramos grupo de sábado.`;
}

function isCuposQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(cupo|cupos|hay cupo|hay cupos|cupos disponibles|quedan cupos|queda cupo|cupos libres|disponibilidad|hay espacio|hay lugar)\b/i.test(text);
}

function isPaymentMethodQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  // Detecta preguntas sobre CÓMO pagar, no sobre el precio
  return (
    /\b(nequi|daviplata|transferencia|presencial|virtual|en linea|online|efectivo|tarjeta|consignacion|deposito)\b/i.test(text) &&
    /\b(pagar|pago|pagos|aceptan|reciben|pueden|puedo|puede|se puede|se acepta|admiten)\b/i.test(text)
  );
}

function isSocialMediaQuestion(message: string): boolean {
  const text = normalizeForMatch(message);

  // Excepciones explícitas para evitar falsos positivos
  if (/\b(una sola vez|una pregunta|una vez|cada mes|cuantas clases|por mes)\b/i.test(text)) {
    return false;
  }

  // Preguntan por número, teléfono o contacto de la academia
  if (/\b(numero|telefono|contacto|whatsapp|llamar|llamarles|llamarte|donde\s+llamo|como\s+los\s+contacto|como\s+te\s+contacto|como\s+contactarlos|como\s+contacto|dame\s+el\s+numero|cual\s+es\s+el\s+numero|me\s+das\s+el\s+numero|el\s+numero\s+de|numero\s+de\s+la|contacto\s+de\s+la|admisiones)\b/i.test(text)) {
    return true;
  }

  return /\b(red|redes|redes sociales|instagram|insta|facebook|face|youtube|tiktok|tik tok|ig|perfil|perfiles|siguelos|siguenos|tienen redes|tienes redes)\b/i.test(text);
}

function isThanksOnlyMessage(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  if (!/\b(gracias|agradezco|muy amable)\b/i.test(text)) return false;
  if (/\b(horario|precio|costo|donde|como|inscrib|matricul|temario|material|fecha|inicio|pago)\b/i.test(text)) return false;
  const words = text.split(" ").filter(Boolean);
  return words.length <= 6;
}

function isRepeatedInfoComplaint(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(ya\s+me\s+respondiste\s+eso|eso\s+ya\s+me\s+lo\s+dijiste|ya\s+me\s+habias\s+respondido|eso\s+ya\s+lo\s+respondiste|ya\s+me\s+dijiste\s+eso|me\s+estas\s+repitiendo|me\s+repites\s+lo\s+mismo)\b/i.test(text);
}

function shouldAttachMediaSuggestion(userMessage: string, responseText: string): boolean {
  if (isThanksOnlyMessage(userMessage)) return false;
  if (isNeutralAcknowledgement(userMessage)) return false;
  if (isShortAffirmativeReply(userMessage) && !/[?¿]/.test(userMessage)) return false;
  if (isRepeatedInfoComplaint(userMessage)) return false;

  const normalizedResponse = normalizeForMatch(responseText || "");
  if (/\b(prefieres\s+que\s+empecemos|te\s+refieres\s+a|en\s+que\s+te\s+puedo\s+ayudar)\b/i.test(normalizedResponse)) {
    return false;
  }

  return true;
}

function isCourseInfoRequest(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(informacion del curso|quiero informacion|quiero info|dame informacion|cuentame del curso|sobre el curso|curso de)\b/i.test(text);
}

function isKitPurchaseQuestion(message: string): boolean {
  const text = normalizeForMatch(message);

  const mentionsMaterials = /\b(kit|kits|implemento|implementos|herramienta|herramientas|material|materiales|insumo|insumos)\b/i.test(text);
  const asksBuying = /\b(comprar|compro|comprarlo|comprarlos|debo comprar|hay que comprar|toca comprar|me toca comprar|o lo tengo que comprar|o los tengo que comprar|necesito comprar|traer|poner)\b/i.test(text);
  const asksIfProvided = /\b(lo dan|me lo dan|me los dan|me lo daban|me los daban|ustedes dan|ustedes lo dan|incluye|incluyen|proporcionan|les dan|se los dan|viene incluido|vienen incluidos)\b/i.test(text);

  return mentionsMaterials && (asksBuying || asksIfProvided);
}

function isKitRescueClarification(
  message: string,
  lastAgentMessage: string,
  inferredPendingTopic: string
): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const asksBuyOrProvided = /\b(me lo dan|me los dan|me lo daban|me los daban|los dan|viene incluido|vienen incluidos|o lo tengo que comprar|o los tengo que comprar|me toca comprar|debo comprar|hay que comprar|toca comprar)\b/i.test(text);
  if (!asksBuyOrProvided) return false;

  const normalizedLast = normalizeForMatch(lastAgentMessage || "");
  const hasMaterialContext =
    /\b(material|materiales|kit|insumo|insumos|herramienta|herramientas)\b/i.test(text)
    || /\b(material|materiales|kit|insumo|insumos|herramienta|herramientas)\b/i.test(normalizedLast)
    || /\bmateriales|kit\b/i.test(normalizeForMatch(inferredPendingTopic || ""));

  return hasMaterialContext;
}

function hasRescueRephraseSignal(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  return /\b(o sea|osea|es decir|entonces|mejor dicho|a ver|si pero|pero entonces|como asi|no entendi|no entiendo|explicame simple|explicame corto)\b/i.test(text);
}

function isScheduleRescueClarification(
  message: string,
  lastAgentMessage: string,
  inferredPendingTopic: string
): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const hasRephraseSignal = hasRescueRephraseSignal(message) || isRepeatedInfoComplaint(message);
  if (!hasRephraseSignal) return false;

  const scheduleKeywords = /\b(horario|horarios|hora|horas|dias|dia|fecha|inicio|cuando\s+inicia|cuando\s+empieza|cuantas\s+horas|semanal|vez\s+a\s+la\s+semana)\b/i;
  const normalizedLast = normalizeForMatch(lastAgentMessage || "");
  const normalizedPending = normalizeForMatch(inferredPendingTopic || "");

  return scheduleKeywords.test(text) || scheduleKeywords.test(normalizedLast) || scheduleKeywords.test(normalizedPending);
}

function isPaymentRescueClarification(
  message: string,
  lastAgentMessage: string,
  inferredPendingTopic: string
): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const hasRephraseSignal = hasRescueRephraseSignal(message) || isRepeatedInfoComplaint(message);
  if (!hasRephraseSignal) return false;

  const paymentKeywords = /\b(pago|pagos|como\s+pago|formas\s+de\s+pago|medios\s+de\s+pago|metodo\s+de\s+pago|inscripcion|matricula|mensualidad|cuanto\s+pago|total|abono|cuota|cuotas)\b/i;
  const normalizedLast = normalizeForMatch(lastAgentMessage || "");
  const normalizedPending = normalizeForMatch(inferredPendingTopic || "");

  return paymentKeywords.test(text) || paymentKeywords.test(normalizedLast) || paymentKeywords.test(normalizedPending);
}

function isKitContentsQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const mentionsKit = /\b(kit|kits|material|materiales|insumo|insumos|implementos?)\b/i.test(text);
  const asksContents = /\b(que\s+incluye|que\s+trae|que\s+viene|incluye\s+el\s+kit|trae\s+el\s+kit|viene\s+en\s+el\s+kit|contenido\s+del\s+kit)\b/i.test(text);

  return mentionsKit && asksContents;
}

function buildKitContentsReply(detectedProgram: any | null): string {
  const programLabel = detectedProgram?.nombre ? ` para *${detectedProgram.nombre}*` : "";

  return `¡Claro! 🙌 Te cuento qué incluye el *kit mensual*${programLabel}:\n\n✅ Limas y buffer\n✅ Palitos de naranjo y/o herramientas básicas de preparación\n✅ Base, gel de construcción y top coat\n✅ Deshidratador/prep y primer\n✅ Tips o formas (según la clase)\n✅ Decoración básica del mes\n✅ Insumos de práctica para las técnicas del ciclo\n\n📌 El kit cubre aproximadamente el *70%* de lo que se usa en ese mes, y si te falta algo puntual en clase, la academia te lo presta.\n\nSi quieres, te detallo exactamente qué se usa en el *primer mes*.`;
}

function hasProgramCorrectionSignal(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(no es|no era|no hablo de|no me refiero|no estoy preguntando por|eso no es|ese no es|esa no es)\b/i.test(text);
}

function extractCorrectedProgramName(message: string): string | null {
  const raw = String(message || "").trim();
  if (!raw) return null;

  const patterns = [
    /(?:eso|ese|esa|esto)?\s*no\s+es\s+([a-záéíóúñ0-9\s]{3,60})/i,
    /no\s+me\s+refiero\s+a\s+([a-záéíóúñ0-9\s]{3,60})/i,
    /no\s+hablo\s+de\s+([a-záéíóúñ0-9\s]{3,60})/i,
    /no\s+estoy\s+preguntando\s+por\s+([a-záéíóúñ0-9\s]{3,60})/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;

    const candidate = match[1]
      .replace(/[.,;:!?].*$/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (candidate.length >= 3) {
      return candidate;
    }
  }

  return null;
}

// Términos que NO son nombres de programas y deben ignorarse (con o sin artículos)
const NON_PROGRAM_TOPICS = /^(el |la |los |las |un |una |unos |unas )?(cupo|cupos|cupos disponibles|precio|precios|info|informacion|horario|horarios|fecha|fechas|clase|clases|material|materiales|insumo|insumos|kit|kits|inscripcion|matricula|certificado|redes|instagram|facebook|whatsapp|ubicacion|direccion|sede|cali|colombia)$/i;

function extractProgramInquiryTopic(message: string): string | null {
  const normalized = normalizeForMatch(message);
  if (!normalized) return null;

  const patterns = [
    /(?:aprender|ensenan|ensenan|ensena|dictan|dan|ofrecen|tienen|hay)\s+([a-z0-9\s]{3,40})/i,
    /(?:curso|programa)\s+de\s+([a-z0-9\s]{3,40})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;

    const candidate = match[1]
      .replace(/\b(aqui|aca|en\s+cali|por\s+favor|me\s+podrias|me\s+puedes|si|no)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Excluir términos que no son nombres de programas
    if (/\b(uniforme|kit|inscripcion|mensualidad|precio|costo|valor|pago|pagar|cuota|horario|fecha|inicio|disponible|disponibles|dia|dias|lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|ayer|semana)\b/i.test(candidate)) {
      continue;
    }

    // Excluir: "otros métodos", "otras técnicas", "otros cursos", etc. — no son nombres de programas
    if (/^(otros?|otras?)\b/i.test(candidate)) continue;

    if (candidate.length >= 3 && !NON_PROGRAM_TOPICS.test(candidate)) return candidate;
  }

  return null;
}

function findProgramMatchByTopic(topic: string, programs: any[]): any | null {
  const normalizedTopic = normalizeForMatch(topic);
  if (!normalizedTopic || !Array.isArray(programs) || !programs.length) return null;

  const topicWords = normalizedTopic.split(" ").filter((word) => word.length >= 4);

  for (const program of programs) {
    const programName = normalizeForMatch(program?.nombre || "");
    if (!programName) continue;

    if (programName.includes(normalizedTopic) || normalizedTopic.includes(programName)) {
      return program;
    }

    if (topicWords.some((word) => programName.includes(word))) {
      return program;
    }
  }

  return null;
}

function buildAvailableProgramsPrompt(programs: any[], limit: number = 3): string {
  const names = (programs || [])
    .map((program) => String(program?.nombre || "").trim())
    .filter(Boolean)
    .slice(0, limit);

  if (!names.length) return "";
  return `Por ahora te puedo orientar en: *${names.join("*, *")}*.`;
}

/**
 * Detecta cuando el usuario pregunta por el CATÁLOGO de cursos ("qué más enseñan",
 * "qué otros cursos tienen", etc.) en lugar de contenido de un curso específico.
 */
function isAskingAboutCatalog(message: string): boolean {
  const t = normalizeForMatch(message);
  // Señales de catálogo: "más" + verbo de oferta, "otros cursos", "programas", etc.
  return (
    /\b(que|cuales?)\s+(mas|otros?|mas\s+cursos?|programas?|carreras?)\s+(ensen[aá]n?|tienen?|ofrecen?|dictan?|hay|manejan?|imparten?|trabajan?)\b/i.test(t)
    || /\b(que|cuales?)\s+mas\s+(ensen[aá]n?|tienen?|ofrecen?|dictan?|hay|manejan?)\b/i.test(t)
    || /\b(otros?|mas)\s+(cursos?|programas?|carreras?)\s+(tienen?|hay|ofrecen?|dictan?|manejan?|imparten?)\b/i.test(t)
    || /\b(tienen?|hay|ofrecen?|dictan?|manejan?)\s+(otros?|mas)\s+(cursos?|programas?|carreras?)\b/i.test(t)
    || /\b(que|cuales?|cuantos?)\s+(cursos?|programas?|carreras?)\s+(tienen?|hay|ofrecen?|dictan?|manejan?|imparten?)\b/i.test(t)
    || /\b(que\s+mas\s+se\s+ensen[aá]|que\s+mas\s+aprend)\b/i.test(t)
    || /\b(y\s+que\s+mas|que\s+mas\s+tienen?|que\s+mas\s+hay|que\s+mas\s+ofrecen?)\b/i.test(t)
    || /\b(tienen?\s+mas\s+cursos?|mas\s+cursos?\s+tienen?)\b/i.test(t)
    || /\b(que\s+otros?\s+(cursos?|programas?)\s+(tienen?|hay|ofrecen?))\b/i.test(t)
  );
}

/**
 * Construye una respuesta tipo catálogo con todos los programas disponibles.
 * Si se pasa currentProgramName, resalta que ya hablaron de ese y lista los demás.
 */
function buildCatalogReply(programs: any[], currentProgramName?: string | null): string {
  const all = (programs || []).filter((p) => String(p?.nombre || "").trim());
  if (!all.length) {
    return "¡Claro! 😊 Cuéntame qué área de la estética te interesa más y te oriento con el programa ideal.";
  }

  const others = currentProgramName
    ? all.filter((p) => normalizeForMatch(p.nombre) !== normalizeForMatch(currentProgramName))
    : all;

  const lines = (others.length ? others : all).map((p) => {
    const nombre = String(p.nombre || "").trim();
    const meses = p.duracion_meses ? `${p.duracion_meses} mes${Number(p.duracion_meses) === 1 ? "" : "es"}` : null;
    const clases = p.total_clases ? `${p.total_clases} clases` : null;
    const durLabel = [meses, clases].filter(Boolean).join(" · ");
    return durLabel ? `💅 *${nombre}* (${durLabel})` : `💅 *${nombre}*`;
  });

  const intro = currentProgramName
    ? `Además de *${currentProgramName}*, también enseñamos:\n\n${lines.join("\n")}`
    : `Estos son los programas que tenemos:\n\n${lines.join("\n")}`;

  return `${intro}\n\n¿Cuál de estos te llama más la atención? Te cuento horarios, precios o inscripción de cualquiera 😊`;
}

function extractTemarioHighlights(rawTemario: string, maxItems?: number): string[] {
  const text = String(rawTemario || "").trim();
  if (!text) return [];

  const segments = text
    .replace(/\r/g, "\n")
    .replace(/[•▪◦·]/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s+-\s+/g, "\n")
    .split(/\n+/)
    .map((item) =>
      item
        .replace(/\*+/g, "")
        .replace(/\(\s*\d+\s*h(?:oras?)?\s*\)/gi, "")
        .replace(/\b\d+\s*h(?:oras?)?\b/gi, "")
        .replace(/\b\d+\s*horas?\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s:;,.\-–]+|[\s:;,.\-–]+$/g, "")
        .trim()
    )
    .filter((item) => item.length >= 4)
    .filter((item) => !/^contenido\s+detallado\s+por\s+ciclos?$/i.test(item));

  const classSegments = segments.filter((item) => /^(\d{1,2})\s*[.)-]\s+/.test(item) || /^clase\s*\d{1,2}\b/i.test(item));

  if (classSegments.length > 0) {
    const uniqueClasses: string[] = [];
    const seenClassNumbers = new Set<string>();

    for (const segment of classSegments) {
      const classMatch = segment.match(/^(\d{1,2})\s*[.)-]\s+/) || segment.match(/^clase\s*(\d{1,2})\b/i);
      const classNumber = classMatch?.[1] || normalizeForMatch(segment);
      if (!classNumber || seenClassNumbers.has(classNumber)) continue;

      seenClassNumbers.add(classNumber);
      uniqueClasses.push(segment);

      if (typeof maxItems === "number" && maxItems > 0 && uniqueClasses.length >= maxItems) break;
    }

    return uniqueClasses;
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (/^mes\s+\d+\b/i.test(segment)) continue;
    if (/^temario\s+detallado/i.test(segment)) continue;

    const key = normalizeForMatch(segment);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
    if (typeof maxItems === "number" && maxItems > 0 && unique.length >= maxItems) break;
  }

  return unique;
}

function extractTemarioClassCount(rawTemario: string): number {
  const text = String(rawTemario || "");
  if (!text) return 0;

  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\*+/g, "")
        .replace(/^[\s•▪◦·\-–]+/, "")
        .trim()
    )
    .filter(Boolean);

  const numbers = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^(\d{1,2})\s*[.)-]\s+/) || line.match(/^clase\s*(\d{1,2})\b/i);
    if (match?.[1]) {
      numbers.add(match[1]);
    }
  }

  return numbers.size;
}

function inferTemarioCyclesCount(rawTemario: string): number {
  const text = normalizeForMatch(rawTemario || "");
  if (!text) return 0;

  const monthMatches = text.match(/\bmes\s+\d+\b/g) || [];
  if (monthMatches.length > 0) {
    return new Set(monthMatches.map((m) => m.trim())).size;
  }

  const cycleMatches = text.match(/\bciclo\s+\d+\b/g) || [];
  return new Set(cycleMatches.map((m) => m.trim())).size;
}

function extractTemarioMonthSummaries(rawTemario: string, maxMonths: number = 6): string[] {
  const text = String(rawTemario || "");
  if (!text) return [];

  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\*+/g, "").trim())
    .filter(Boolean);

  const summaries: string[] = [];
  const seenMonths = new Set<string>();

  for (const line of lines) {
    const monthMatch = line.match(/^mes\s*(\d{1,2})\s*[:\-]?\s*(.*)$/i);
    if (!monthMatch?.[1]) continue;

    const monthNumber = monthMatch[1];
    if (seenMonths.has(monthNumber)) continue;
    seenMonths.add(monthNumber);

    const monthTopic = (monthMatch[2] || "")
      .replace(/^[-:–\s]+/, "")
      .trim();

    summaries.push(monthTopic ? `Mes ${monthNumber}: ${monthTopic}` : `Mes ${monthNumber}`);
    if (summaries.length >= maxMonths) break;
  }

  return summaries;
}

function extractRequestedTemarioMonth(message: string): number | null {
  const text = normalizeForMatch(message);
  if (!text) return null;

  const monthMatch = text.match(/\bmes\s*(\d{1,2})\b/i);
  if (!monthMatch?.[1]) return null;

  const month = Number(monthMatch[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

function inferTemarioMonthFromAgentPrompt(lastAgentMessage: string): number | null {
  const text = normalizeForMatch(lastAgentMessage || "");
  if (!text) return null;

  const asksNextMonth = text.match(/\b(?:tambien\s+el|tambien\s+mes|el)\s+mes\s*(\d{1,2})\b/i);
  if (asksNextMonth?.[1]) {
    const month = Number(asksNextMonth[1]);
    if (Number.isFinite(month) && month >= 1 && month <= 12) return month;
  }

  return null;
}

function splitTemarioIntoClassItems(rawBlock: string, maxItems: number = 12): string[] {
  const source = String(rawBlock || "")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^mes\s*\d{1,2}\s*[:\-]?\s*/i, "")
    .replace(/^temario\s+por\s+clases?\s*/i, "")
    .trim();

  if (!source) return [];

  let segments = source
    .replace(/\s*[•▪◦·|;]+\s*/g, "\n")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    segments = source
      .replace(/\s*(\p{Extended_Pictographic})\s*/gu, "\n$1 ")
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const uniqueItems: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const cleaned = segment
      .replace(/^temario\s+por\s+clases?\s*/i, "")
      .replace(/^mes\s*\d{1,2}\s*[:\-]?\s*/i, "")
      .replace(/^[-–:,.]+\s*/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (cleaned.length < 4) continue;

    const key = normalizeForMatch(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueItems.push(cleaned);

    if (uniqueItems.length >= maxItems) break;
  }

  return uniqueItems;
}

function extractTemarioMonthBlocks(rawTemario: string): Array<{ month: number; classes: string[] }> {
  const text = String(rawTemario || "").replace(/\r/g, "\n");
  if (!text) return [];

  const blocks: Array<{ month: number; classes: string[] }> = [];
  const regex = /mes\s*(\d{1,2})\s*[:\-]?\s*([\s\S]*?)(?=(?:\bmes\s*\d{1,2}\s*[:\-]?)|$)/gi;
  const seenMonths = new Set<number>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const month = Number(match[1]);
    if (!Number.isFinite(month) || month < 1 || month > 12 || seenMonths.has(month)) continue;

    const classes = splitTemarioIntoClassItems(match[2] || "", 12);
    if (!classes.length) continue;

    seenMonths.add(month);
    blocks.push({ month, classes });
  }

  return blocks.sort((a, b) => a.month - b.month);
}

function normalizeTemarioMonthBlocks(
  detectedProgram: any,
  rawTemario: string
): Array<{ month: number; classes: string[] }> {
  const monthBlocks = extractTemarioMonthBlocks(rawTemario);
  if (!monthBlocks.length) return [];

  const totalClasesDB = Number(detectedProgram?.total_clases ?? 0);
  const duracionMeses = Number(detectedProgram?.duracion_meses ?? 0);

  const allClasses = monthBlocks.flatMap((block) => block.classes);
  const classes = totalClasesDB > 0 ? allClasses.slice(0, totalClasesDB) : allClasses;

  const monthsTarget = duracionMeses > 0 ? duracionMeses : monthBlocks.length;
  if (monthsTarget <= 0 || !classes.length) return monthBlocks;

  const basePerMonth = Math.floor(classes.length / monthsTarget);
  const remainder = classes.length % monthsTarget;

  const normalized: Array<{ month: number; classes: string[] }> = [];
  let cursor = 0;

  for (let month = 1; month <= monthsTarget; month++) {
    const count = basePerMonth + (month <= remainder ? 1 : 0);
    const monthClasses = classes.slice(cursor, cursor + count);
    cursor += count;
    if (monthClasses.length) {
      normalized.push({ month, classes: monthClasses });
    }
  }

  return normalized;
}

function buildTemarioDetailedListReply(
  detectedProgram: any,
  rawTemario: string,
  options: { monthNumber?: number } = {}
): string | null {
  const monthBlocks = normalizeTemarioMonthBlocks(detectedProgram, rawTemario);
  if (!monthBlocks.length) return null;

  const requestedMonth = options.monthNumber;
  if (requestedMonth && !monthBlocks.some((block) => block.month === requestedMonth)) {
    const availableMonths = monthBlocks.map((block) => `Mes ${block.month}`).join(", ");
    return `📚 *Temario de ${detectedProgram.nombre}*\n\nTengo detalle disponible para: *${availableMonths}*.\n\n¿Cuál mes quieres que te comparta primero?`;
  }

  const selectedBlock = requestedMonth
    ? monthBlocks.find((block) => block.month === requestedMonth)
    : monthBlocks[0];

  if (!selectedBlock) return null;

  // Numeración continua: contar clases reales de meses anteriores
  const startClassNumber = monthBlocks
    .filter((block) => block.month < selectedBlock.month)
    .reduce((acc, block) => acc + block.classes.length, 0) + 1;

  const classesLines = selectedBlock.classes
    .map((classItem, index) => {
      const cleanName = classItem
        .replace(/\p{Extended_Pictographic}/gu, "")  // quitar emojis
        .replace(/\s+\d+\.?\s*$/, "")               // quitar número final
        .replace(/\s{2,}/g, " ")
        .trim();
      return `• ${startClassNumber + index}. ${cleanName}`;
    })
    .join("\n");

  const nextBlock = monthBlocks.find((block) => block.month > selectedBlock.month);
  const followup = nextBlock
    ? `¿Quieres que te comparta también el *Mes ${nextBlock.month}*?`
    : "¿Quieres que te comparta también la *inversión*?";

  return `📚 *Temario detallado de ${detectedProgram.nombre}*

🗓️ *MES ${selectedBlock.month}*
${classesLines}

${followup}`;
}

function buildTemarioCompleteReply(
  detectedProgram: any,
  rawTemario: string
): string | null {
  const monthBlocks = normalizeTemarioMonthBlocks(detectedProgram, rawTemario);
  if (!monthBlocks.length) return null;

  const totalClasesDB = Number(detectedProgram?.total_clases ?? 0);
  const duracionMeses = Number(detectedProgram?.duracion_meses ?? 0);

  let classCounter = 1;
  let clasesShown = 0;
  const monthSections = monthBlocks
    .map((block) => {
      const remaining = totalClasesDB > 0 ? totalClasesDB - clasesShown : block.classes.length;
      if (remaining <= 0) return null;
      const classesToShow = block.classes.slice(0, remaining);
      if (!classesToShow.length) return null;

      const lines = classesToShow
        .map((classItem) => {
          const cleanName = classItem
            .replace(/\p{Extended_Pictographic}/gu, "")
            .replace(/\s+\d+\.?\s*$/, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          clasesShown++;
          return `\u2022 ${classCounter++}. ${cleanName}`;
        })
        .join("\n");
      return `\ud83d\uddd3\ufe0f *MES ${block.month}*\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");

  // Usar total de BD para el encabezado; si no hay campo, usar lo contado
  const totalLabel = totalClasesDB > 0 ? totalClasesDB : classCounter - 1;
  const duracionLabel = duracionMeses > 0 ? `${duracionMeses} meses \u00b7 ` : "";

  return `\ud83d\udcda *Temario completo de ${detectedProgram.nombre}* (${duracionLabel}${totalLabel} clases)\n\n${monthSections}\n\n\ud83d\udccc ¿Te cuento *inversión* u *horarios*?`;
}

function buildSeparaCupoPaymentReply(
  detectedProgram: any,
  academy: any,
  courses: any[]
): string {
  const admissionsContact = academy?.whatsapp_admisiones || ADMISSIONS_NUMBER;
  const nequiNumber = "3006402575";

  const primaryCourse = detectedProgram ? pickPrimaryCourseForProgram(detectedProgram, courses) : null;
  const inscripcion = Number(detectedProgram?.precio_inscripcion ?? primaryCourse?.precio_inscripcion ?? 0);
  const hasPrice = inscripcion > 0;
  const insText = hasPrice ? formatCurrencyCOP(inscripcion) : null;
  const programLabel = detectedProgram?.nombre ? ` en *${detectedProgram.nombre}*` : "";

  const direccion = String(academy?.direccion || "").trim();
  const mapsUrl = String(academy?.maps_url || "").trim();
  const locationRef = "*La Cosmetikera (segundo piso)*, oriente de Cali, cerca a la Panadería Pablos Pam";

  const montoLine = insText ? `• Monto: *${insText}*` : `• Monto: te lo confirma Admisiones al contactarte`;
  const pagoEfectivoLine = insText ? `• Paga *${insText}* en efectivo` : `• Pago en efectivo (valor exacto te lo confirma Admisiones)`;

  const presencialBlock = [
    `📍 *Ir a la sede:*`,
    direccion ? `• Dirección: *${direccion}*` : `• Ubicación: ${locationRef}`,
    mapsUrl ? `• 🗺️ Mapa: ${mapsUrl}` : "",
    pagoEfectivoLine,
    `• Envía el comprobante a Admisiones: *${admissionsContact}*`,
  ].filter(Boolean).join("\n");

  const intro = insText
    ? `¡Perfecto! 🙌 Para separar tu cupo${programLabel}, el pago de inscripción es de *${insText}*.`
    : `¡Perfecto! 🙌 Para separar tu cupo${programLabel}, el pago de inscripción te lo confirma nuestro equipo de Admisiones.`;

  return `${intro}

Puedes hacerlo de estas formas:

💜 *Por Nequi:*
• Número: *${nequiNumber}*
${montoLine}
• Envía el comprobante a Admisiones: *${admissionsContact}*

${presencialBlock}

✅ Una vez confirmemos tu pago, ¡queda reservado tu cupo!`;
}

function buildInstagramFollowup(academy: any | null): string {
  const ig = String(academy?.instagram || "").trim();
  const fb = String(academy?.facebook || "").trim();
  const yt = String(academy?.youtube || "").trim();

  const links: string[] = [];
  if (ig) {
    links.push(`📸 Instagram: ${/^https?:\/\//i.test(ig) ? ig : `https://${ig}`}`);
  }
  if (fb) {
    links.push(`👤 Facebook: ${/^https?:\/\//i.test(fb) ? fb : `https://${fb}`}`);
  }
  if (yt) {
    links.push(`🎥 YouTube: ${/^https?:\/\//i.test(yt) ? yt : `https://${yt}`}`);
  }

  if (!links.length) return "";
  return `\n\n📲 Si quieres más info, también te comparto nuestras redes:\n${links.join("\n")}`;
}

function buildCuposReply(
  detectedProgram: any | null,
  courses: any[],
  programs: any[]
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Si hay un programa detectado, mostrar cupos de ese programa
  if (detectedProgram) {
    const programCourses = courses.filter((c) => {
      const sameProgramId = c?.programa_id && Number(c.programa_id) === Number(detectedProgram.id);
      const sameProgramName = normalizeForMatch(c?.programa_nombre || "").includes(normalizeForMatch(detectedProgram?.nombre || ""));
      return sameProgramId || sameProgramName;
    });

    const upcomingCourses = programCourses
      .filter((c) => {
        const start = c.fecha_inicio ? new Date(c.fecha_inicio) : null;
        return !start || start >= today;
      })
      .sort((a, b) => {
        const da = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : Infinity;
        const db = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : Infinity;
        return da - db;
      });

    if (!upcomingCourses.length) {
      return `Para *${detectedProgram.nombre}* aún no hay grupos con fecha de inicio programada.\n\n¿Quieres que te avise cuando se abra la inscripción?`;
    }

    const lines = upcomingCourses.slice(0, 3).map((c) => {
      const disponibles = Number(c.cupos_disponibles ?? 0);
      const total = Number(c.cupos ?? 0);
      const fechaStr = c.fecha_inicio ? (formatDateLong(c.fecha_inicio) || formatDateShort(c.fecha_inicio)) : "Por confirmar";
      const horario = c.horario || "Por confirmar";
      const cuposStr = disponibles > 0 ? `✅ ${disponibles} cupo${disponibles === 1 ? "" : "s"} disponible${disponibles === 1 ? "" : "s"}${total > 0 ? ` de ${total}` : ""}` : "❌ Sin cupos";
      return `📅 *${fechaStr}* | 🕓 ${horario}\n👥 ${cuposStr}`;
    });

    return `*${detectedProgram.nombre}* — Grupos próximos:\n\n${lines.join("\n\n")}\n\n¿Te reservo un cupo ahora?`;
  }

  // Sin programa detectado: mostrar todos los programas con sus cupos
  const summary: string[] = [];
  for (const program of programs.slice(0, 5)) {
    const programCourses = courses.filter((c) => {
      const sameProgramId = c?.programa_id && Number(c.programa_id) === Number(program.id);
      const sameProgramName = normalizeForMatch(c?.programa_nombre || "").includes(normalizeForMatch(program?.nombre || ""));
      return sameProgramId || sameProgramName;
    });

    const upcoming = programCourses
      .filter((c) => {
        const start = c.fecha_inicio ? new Date(c.fecha_inicio) : null;
        return !start || start >= today;
      })
      .sort((a, b) => {
        const da = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : Infinity;
        const db = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : Infinity;
        return da - db;
      })[0];

    if (!upcoming) continue;
    const disponibles = Number(upcoming.cupos_disponibles ?? 0);
    const cuposStr = disponibles > 0 ? `✅ ${disponibles} cupo${disponibles === 1 ? "" : "s"}` : "❌ Sin cupos";
    summary.push(`• *${program.nombre}*: ${cuposStr}`);
  }

  if (!summary.length) {
    return "En este momento estamos actualizando la disponibilidad de cupos. ¿Quieres que te comparta los grupos activos para elegir el que más te convenga?";
  }

  return `Aquí tienes la disponibilidad de cupos por programa:\n\n${summary.join("\n")}\n\n¿Cuál te interesa? Te ayudo a reservar el tuyo 🙌`;
}

function normalizeSocialUrl(raw: string, platform: "instagram" | "facebook" | "youtube"): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  const withoutSpaces = value.replace(/\s+/g, "");

  if (platform === "instagram") {
    if (/^@/.test(withoutSpaces)) {
      return `https://www.instagram.com/${withoutSpaces.slice(1)}/`;
    }
    if (!/^https?:\/\//i.test(withoutSpaces)) {
      return `https://www.instagram.com/${withoutSpaces.replace(/^instagram\.com\//i, "")}`;
    }
    return withoutSpaces;
  }

  if (platform === "facebook") {
    if (!/^https?:\/\//i.test(withoutSpaces)) {
      return `https://${withoutSpaces}`;
    }
    return withoutSpaces;
  }

  if (!/^https?:\/\//i.test(withoutSpaces)) {
    return `https://${withoutSpaces}`;
  }
  return withoutSpaces;
}

/** Número de admisiones/academia por defecto */
const ADMISSIONS_NUMBER = "+57 301 203 8582";

function buildSocialMediaReply(academy: any | null, userMessage: string = ""): string {
  const ig = normalizeSocialUrl(academy?.instagram || "", "instagram");
  const fb = normalizeSocialUrl(academy?.facebook || "", "facebook");
  const yt = normalizeSocialUrl(academy?.youtube || "", "youtube");
  // Siempre usar el número de la academia como fallback para WhatsApp/teléfono
  const wa = String(academy?.whatsapp_admisiones || academy?.whatsapp || ADMISSIONS_NUMBER).trim();
  const phone = String(academy?.telefono || wa).trim();

  const asksInstagram = /\b(instagram|insta|ig|perfil\s+de\s+instagram)\b/i.test(normalizeForMatch(userMessage));
  const asksContact = /\b(numero|telefono|contacto|whatsapp|llamar|admisiones)\b/i.test(normalizeForMatch(userMessage));

  // Si sólo preguntan por número/contacto, respuesta directa y concisa
  if (asksContact && !asksInstagram) {
    return `¡Claro! 📱 El número de contacto de la academia (Admisiones) es:\n\n*${wa}* (WhatsApp)\n\nEscrívenos por ahí y te atendemos de inmediato 🙌`;
  }

  if (ig && asksInstagram) {
    return `📸 Instagram oficial:\n${ig}\n\nSi quieres, también te comparto Facebook y YouTube.`;
  }

  const lines: string[] = [];
  if (ig) lines.push(`📸 Instagram:\n${ig}`);
  if (fb) lines.push(`👤 Facebook:\n${fb}`);
  if (yt) lines.push(`🎥 YouTube:\n${yt}`);
  lines.push(`💬 WhatsApp Admisiones: ${wa}`);
  if (phone && phone !== wa) lines.push(`📞 Teléfono: ${phone}`);

  return `¡Sí, claro! 🙌 Estas son nuestras redes y canales de contacto:\n\n${lines.join("\n\n")}\n\nPara inscribirte o resolver dudas rápidamente, escríbenos al WhatsApp de Admisiones: *${wa}* 😊`;
}

function isPaymentMethodsOrDatesQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  const asksMethods = /\b(medios\s+de\s+pago|formas\s+de\s+pago|metodos?\s+de\s+pago|nequi|bancolombia|sistecredito|daviplata|tarjeta|efectivo|transferencia)\b/i.test(text);
  const asksDates = /\b(fecha\s+de\s+pago|fechas\s+de\s+pago|cuando\s+se\s+paga|cuando\s+debo\s+pagar|vence|vencimiento|plazo\s+de\s+pago|hasta\s+cuando\s+pago|segunda\s+clase)\b/i.test(text);
  const asksHowToPay = /\b(como\s+pago|donde\s+pago|por\s+que\s+medio\s+pago|aceptan\s+nequi|aceptan\s+tarjeta|puedo\s+pagar\s+por|debo\s+pagar\s+todo\s+de\s+una|todo\s+de\s+una|de\s+contado|de\s+una\s+vez|palazo)\b/i.test(text);
  const mentionsFinancing = /\b(mensualidad|matricula|inscripcion|cuota|financi|abono|sistecredito|sistecr[eé]dito|sistecridito)\b/i.test(text);
  const mentionsPaymentAction = /\b(pago|pagar|abonar|cuanto\s+se\s+paga|medio\s+de\s+pago|formas\s+de\s+pago|de\s+una\s+vez|contado)\b/i.test(text);
  const asksFinancing = mentionsFinancing && mentionsPaymentAction;
  return asksMethods || asksDates || asksHowToPay || asksFinancing;
}

function isStepOneSelection(message: string): boolean {
  const text = normalizeForMatch(message);
  return /^(1|uno|paso\s*1|primer\s*paso)$/.test(text);
}

function buildPaymentMethodsAndDatesReply(mediosPago: any[] = []): string {
  const methods = Array.isArray(mediosPago)
    ? mediosPago
        .filter((medio) => medio?.activo !== false)
        .slice(0, 8)
        .map((medio) => {
          const label = String(medio?.nombre || "").trim();
          const description = String(medio?.descripcion || "").trim();
          if (!label) return "";
          return `• *${label}*${description ? `: ${description}` : ""}`;
        })
        .filter(Boolean)
    : [];

  const methodsBlock = methods.length
    ? `💳 *Medios de pago disponibles:*\n${methods.join("\n")}`
    : "💳 *Medios de pago:* te los confirma Admisiones según el canal que prefieras.";

  return `¡Claro! Te explico 🙌\n\n${methodsBlock}\n\n✅ La *matrícula* se paga anticipada; así separas tu cupo.\n✅ La *mensualidad* tiene plazo hasta la *segunda clase*.\n✅ Con la mensualidad recibes *kit de materiales mensual* (incluye ~70% de los productos que usas ese mes).\n\nSi quieres, te digo cuál opción te conviene más según cómo prefieras pagar.`;
}

function isMonthlyOrBiweeklyQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const asksMonthlyVsBiweekly = /\b(mensual\s+o\s+quincena|mensual\s+o\s+quincenal|mensual\s+o\s+quincenalmente|mensual\s+o\s+por\s+quincena)\b/i.test(text);
  const mentionsBiweekly = /\b(quincena|quincenal|quincenalmente|cada\s+quincena)\b/i.test(text);
  const mentionsMonthly = /\b(mensual|mensualidad|cada\s+mes|al\s+mes|mes\s+a\s+mes)\b/i.test(text);
  const asksPayment = /\b(pago|pagar|se\s+paga|como\s+se\s+paga|hay\s+que\s+pagar|toc[ao]\s+pagar)\b/i.test(text);

  return asksMonthlyVsBiweekly || (mentionsBiweekly && (mentionsMonthly || asksPayment));
}

function isVisitCommitmentMessage(message: string, lastAgentMessage: string): boolean {
  const raw = String(message || "").trim();
  if (!raw || /[?¿]/.test(raw)) return false;

  const text = normalizeForMatch(raw);
  const mentionsDay = /\b(hoy|manana|pasado\s+manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i.test(text);
  const mentionsTime = /\b(a\s+las\s+\d{1,2}|\d{1,2}(:\d{2})?\s*(am|pm)?|4\s*pm|7\s*pm|en\s+la\s+manana|en\s+la\s+tarde|en\s+la\s+noche)\b/i.test(text);
  const hasVisitVerb = /\b(voy|ire|iremos|estare|llego|arrimo|paso|caigo|puedo\s+pasar|me\s+acerco)\b/i.test(text);

  const normalizedLast = normalizeForMatch(lastAgentMessage || "");
  const lastAskedVisitTime = /\b(cuando\s+puedes\s+venir|cuando\s+puede\s+venir|cuando\s+vienes|puedes\s+venir|puedes\s+pasar|coordinamos\s+para\s+que\s+te\s+atiendan|te\s+esperamos\s+el)\b/i.test(normalizedLast);

  return (mentionsDay || mentionsTime) && (hasVisitVerb || lastAskedVisitTime);
}

function buildVisitCommitmentReply(academy: any | null): string {
  const direccion = String(academy?.direccion || "Calle 53 #30a 101 - Barrio Comuneros 1").trim();
  const mapsUrl = String(academy?.maps_url || "").trim();
  const mapsLine = mapsUrl ? `\n🗺️ Mapa: ${mapsUrl}` : "";

  return `¡Perfecto! 🙌 Te esperamos ese día en la sede.\n\n📍 *${direccion}*${mapsLine}\n\nSi quieres, también te dejo una referencia rápida para llegar sin enredos 😊`;
}

function pickPrimaryCourseForProgram(detectedProgram: any | null, courses: any[]): any | null {
  if (!courses?.length) return null;

  const normalizedProgram = normalizeForMatch(detectedProgram?.nombre || "");
  const relatedCourses = detectedProgram
    ? courses.filter((course) => {
        const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
        const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
        return Boolean(sameProgramId || sameProgramName);
      })
    : [...courses];

  if (!relatedCourses.length) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withDate = relatedCourses
    .filter((course) => course?.fecha_inicio && !Number.isNaN(new Date(course.fecha_inicio).getTime()))
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

  const upcoming = withDate.find((course) => {
    const start = new Date(course.fecha_inicio);
    start.setHours(0, 0, 0, 0);
    return start >= today;
  });

  return upcoming || withDate[0] || relatedCourses[0] || null;
}

function pickHumanToneSeed(message: string, history: Array<{ user: string; agent: string }>): number {
  const source = `${normalizeForMatch(message)}|${history?.length || 0}`;
  let acc = 0;
  for (let i = 0; i < source.length; i++) {
    acc = (acc + source.charCodeAt(i)) % 997;
  }
  return acc % 3;
}

function buildFastTrackHumanReply(
  message: string,
  history: Array<{ user: string; agent: string }>,
  detectedProgram: any,
  duration: string,
  nextStart: string,
  schedule: string
): string {
  const tone = pickHumanToneSeed(message, history);

  if (tone === 0) {
    return `¡Claro! Buena pregunta 🙌\n\nEl programa *${detectedProgram.nombre}* que estás viendo dura *${duration}*.\n\nSi te interesa algo más rápido tipo *perfeccionamiento/intensivo*, te confirmo la opción activa para darte el dato exacto.\n\n📅 Inicio actual: ${nextStart}\n🕓 Horario actual: ${schedule}\n\n¿Quieres que te confirme ya la alternativa más corta disponible?`;
  }

  if (tone === 1) {
    return `Súper válido lo que preguntas 👌\n\nHoy en *${detectedProgram.nombre}* la duración es de *${duration}*.\n\nSi prefieres algo más ágil (perfeccionamiento/intensivo), te lo reviso al instante para darte una opción real y vigente.\n\n📅 Inicio actual: ${nextStart}\n🕓 Horario actual: ${schedule}\n\n¿Te comparto ahora mismo la opción más rápida?`;
  }

  return `Perfecto, te entiendo 💯\n\nEl plan *${detectedProgram.nombre}* está en *${duration}*.\n\nPara una ruta más corta de *perfeccionamiento*, te confirmo la disponibilidad actual y así avanzamos sobre algo concreto.\n\n📅 Inicio actual: ${nextStart}\n🕓 Horario actual: ${schedule}\n\n¿Quieres que te pase de una la opción más corta?`;
}

function buildScheduleHumanReply(
  message: string,
  history: Array<{ user: string; agent: string }>,
  detectedProgram: any,
  nextStart: string,
  schedule: string
): string {
  const tone = pickHumanToneSeed(message, history);

  // Revisar qué temas ya se cubrieron en el historial reciente para no repetirlos
  const normalizedHistory = normalizeForMatch(
    (Array.isArray(history) ? history : []).slice(-6).map((h) => `${h?.user || ""} ${h?.agent || ""}`).join(" ")
  );
  const historyHasPrice = /\b(inversion|inscripcion|mensualidad|cuota|precio|costo|vale|valor)\b/i.test(normalizedHistory);
  const historyHasEnrollment = /\b(inscrib|cupo|separar|reservar|matricul|admision)\b/i.test(normalizedHistory);

  // Ofrecer el siguiente paso lógico que aún NO se ha cubierto
  let followup: string;
  if (historyHasPrice && historyHasEnrollment) {
    followup = "¿Quieres que te ayude a *reservar tu cupo*? 🙌";
  } else if (historyHasPrice) {
    followup = "📝 ¿Quieres que te comparta los *pasos para inscribirte*?";
  } else {
    followup = "💰 ¿Quieres que te comparta también la *inversión*?";
  }

  if (tone === 0) {
    return `¡Claro! Te cuento de una 🙌\n\n📚 *${detectedProgram.nombre}*\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n${followup}`;
  }

  if (tone === 1) {
    return `Perfecto, aquí va rápido 👌\n\nPara *${detectedProgram.nombre}* tenemos:\n📅 *Inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n${followup}`;
  }

  return `Súper, te confirmo ese dato ✨\n\n📚 *${detectedProgram.nombre}*\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n${followup}`;
}

function buildIntentFocusedDirectResponse(
  message: string,
  detectedProgram: any | null,
  courses: any[],
  academy: any | null,
  history: Array<{ user: string; agent: string }> = [],
  programs: any[] = [],
  mediosPago: any[] = []
): string | null {
  const hasPaymentReminderContext = hasRecentPaymentReminderContext(history);
  if (hasPaymentReminderContext && isGenericAckAfterReminder(message)) {
    return buildReminderFollowupReply();
  }

  if (isThanksOnlyMessage(message)) {
    return `Con gusto 😊 Cuando quieras, te ayudo con lo que necesites del curso.${buildInstagramFollowup(academy)}`;
  }

  if (isNoiseOnlyMessage(message)) {
    return buildNoiseFollowupFromHistory(history);
  }

  if (isPureGreeting(message)) {
    const hour = getColombiaNowDate().getHours();
    const greeting = getTimeSlotGreeting(hour);
    const alreadyGreeted = history.length > 0;
    if (alreadyGreeted) {
      return `${greeting} 😊 ¿Qué te gustaría saber: *horarios*, *precios* o *inscripción*?`;
    }
    const academyName = academy?.nombre || "Academia Crystal Diamante";
    return `${greeting} 😊 Bienvenid@ a *${academyName}* 💎\n\nSi quieres, te cuento *horarios*, *precios* o *inscripción* del curso que te interese.`;
  }

  if (isRepeatedInfoComplaint(message)) {
    const programLabel = detectedProgram?.nombre ? ` de *${detectedProgram.nombre}*` : "";
    const pendingTopic = inferPendingTopicFromHistory(history);

    if (/temario|clase\s+por\s+clase|contenido/.test(normalizeForMatch(pendingTopic))) {
      return `Tienes razón, eso ya te lo había dicho 😊\n\nTe respondo más puntual${programLabel}: ¿quieres que te comparta el *temario* general o el *detalle clase por clase*?`;
    }

    if (/horario|dias|fecha|inicio|grupo/.test(normalizeForMatch(pendingTopic))) {
      return `Tienes razón, eso ya te lo había dicho 😊\n\nTe respondo más puntual${programLabel}: ¿quieres que te confirme *horarios*, *fecha de inicio* o *cupos disponibles*?`;
    }

    if (/inversion|precio|mensualidad|inscripcion/.test(normalizeForMatch(pendingTopic))) {
      return `Tienes razón, eso ya te lo había dicho 😊\n\nTe respondo más puntual${programLabel}: ¿quieres que te diga la *inversión*, la *inscripción* o las *formas de pago*?`;
    }

    return `Tienes razón, eso ya te lo había dicho 😊\n\nTe respondo más puntual${programLabel}: ¿quieres que te cuente el *temario*, los *horarios* o los *precios*?`;
  }

  // Detectar tristeza/decepción por falta de cupo o programa no disponible
  const isDisappointedNoCupo = /\b(ya\s+no\s+hay|no\s+hay|no\s+queda[n]?|no\s+tiene[n]?|que\s+lastima|que\s+pena|que\s+mal)\b.*\b(cupo|cupos|espacio|lugar|disponible|inscripcion)\b/i.test(normalizeForMatch(message))
    || /\b(ya\s+no\s+hay\s+cupo|no\s+quedan?\s+cupos?|cupo(s)?\s+agotado(s)?)\b/i.test(normalizeForMatch(message));
  if (isDisappointedNoCupo) {
    const primaryCourse = detectedProgram ? pickPrimaryCourseForProgram(detectedProgram, courses) : null;
    const disponibles = Number(primaryCourse?.cupos_disponibles ?? 0);
    const programLabel = detectedProgram ? ` de *${detectedProgram.nombre}*` : "";
    if (disponibles > 0) {
      const nextStart = primaryCourse?.fecha_inicio ? (formatDateLong(primaryCourse.fecha_inicio) || formatDateShort(primaryCourse.fecha_inicio)) : "Por confirmar";
      return `¡Tranquila! 😊 Sí hay cupos disponibles${programLabel}.\n\n✅ Quedan *${disponibles}* cupo${disponibles === 1 ? "" : "s"} para el grupo que inicia el *${nextStart}*.\n\n¿Quieres que te cuente los pasos para separarlo ahora?`;
    }
    return `Te entiendo, es frustrante cuando el tiempo aprieta 🙏\n\nEn este momento los cupos${programLabel} están muy solicitados. Pero puedo avisarte apenas se abra un nuevo grupo o si hay cancelación.\n\n¿Quieres que te deje en lista de espera?`;
  }

  // Detectar frustración del usuario antes de cualquier otro flujo
  if (isFrustrationMessage(message)) {
    const wa = academy?.whatsapp_admisiones || ADMISSIONS_NUMBER;
    return `Entiendo tu molestia y lo siento mucho 🙏 A veces soy limitada en ciertas preguntas.\n\nTe comunico con alguien de *Admisiones* para que te atienda personalmente:\n📲 WhatsApp: *${wa}*\n\nEscríbeles directamente y te resolverán todo de inmediato 💙`;
  }

  // Pregunta directa de visita presencial → responder SÍ primero, luego dirección
  const asksPresencialVisit = /\b(puedo\s+ir|puedo\s+pasar|puedo\s+ir\s+presencial|puedo\s+ir\s+personal|ir\s+presencial|ir\s+en\s+persona|voy\s+a\s+ir|voy\s+presencial|puedo\s+visitar|puedo\s+ir\s+a\s+la\s+sede)\b/i.test(normalizeForMatch(message));
  if (asksPresencialVisit && !isPaymentMethodQuestion(message)) {
    const direccion = String(academy?.direccion || "Calle 53 #30a 101 - Barrio Comuneros 1").trim();
    const mapsUrl = String(academy?.maps_url || "").trim();
    const mapsLine = mapsUrl ? `\n🗺️ Mapa: ${mapsUrl}` : "";
    return `¡Sí, claro! 🙌 Puedes venir directamente a nuestra sede:\n\n📍 *${direccion}*${mapsLine}\n\n¿Cuándo puedes venir? Así coordinamos para que te atiendan de inmediato 😊`;
  }

  if (isOutOfCaliConstraintMessage(message)) {
    return `Gracias por contarlo 🙌 Actualmente nuestra atención académica es *presencial en Cali* (oriente, La Cosmetikera - segundo piso).\n\nSi estás fuera de Cali, puedo ayudarte así:\n✅ Te comparto toda la info del curso para que lo tengas listo.\n📋 Te dejo en lista para avisarte si abrimos grupo especial para tu zona.\n\n¿Qué prefieres?`;
  }

  const saturdayReply = buildSaturdayConstraintReply(message, detectedProgram, courses, programs);
  if (saturdayReply) {
    return saturdayReply;
  }

  // Evitar repetir la pregunta doble (horarios/inversión vs separar cupo) si ya se hizo recientemente
  const alreadyAskedDoubleOption = history.slice(-4).some(h =>
    /horarios.*inversion.*separar\s+cupo|separar\s+cupo.*horarios.*inversion|te\s+comparto.*horarios.*inversion/i.test(normalizeForMatch(h.agent || ""))
  );

  if (detectedProgram && isLikelyProgramOnlyReply(message) && !alreadyAskedDoubleOption && !/[?¿]/.test(message) && detectUserIntent(message) === "general") {
    const pendingTopic = inferPendingTopicFromHistory(history);
    if (/dias\s+y\s+horario|horario|inicio|fecha/.test(normalizeForMatch(pendingTopic))) {
      const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const hasUpcomingStart = Boolean(
        primaryCourse?.fecha_inicio &&
          !Number.isNaN(new Date(primaryCourse.fecha_inicio).getTime()) &&
          new Date(primaryCourse.fecha_inicio).setHours(0, 0, 0, 0) >= today.getTime()
      );
      const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
      const schedule = primaryCourse?.horario || "Por confirmar";
      return `Perfecto 👌 Te confirmo *${detectedProgram.nombre}*:\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n¿Quieres que te comparta los pasos para *separar tu cupo* ya? 🔥`;
    }

    return `Perfecto 👌 Te refieres a *${detectedProgram.nombre}*. ¿Te comparto los *horarios e inversión* o prefieres ir directo a *separar cupo*? 🔥`;
  }

  let intent = detectUserIntent(message);
  const normalizedMessage = normalizeForMatch(message);
  const lastAgentForFlow = history[history.length - 1]?.agent || "";

  if (isOnlyScheduleConfirmationQuestion(message)) {
    return buildOnlyScheduleConfirmationReply(detectedProgram, courses);
  }

  if (intent === "general") {
    // Si el agente mencionó Instagram/redes en su último mensaje y el usuario confirma → dar link directamente
    if (isNeutralAcknowledgement(message) || isShortAffirmativeReply(message)) {
      const lastNorm = normalizeForMatch(lastAgentForFlow || "");
      if (/\b(instagram|redes|siguenos|nuestro\s+instagram|nuestras\s+redes)\b/i.test(lastNorm)) {
        return buildSocialMediaReply(academy, "instagram");
      }
    }
    const naturalAckReply = buildNaturalAckReply(message, lastAgentForFlow, detectedProgram);
    if (naturalAckReply) {
      return naturalAckReply;
    }
  }

  // Si el agente preguntó en su última frase por Instagram/redes y el usuario afirma → dar link
  if (isShortAffirmativeReply(message)) {
    const agentParts = lastAgentForFlow.split("?");
    const lastQuestion = normalizeForMatch(
      agentParts.length >= 2 ? (agentParts[agentParts.length - 2] || "").split(/[\n\r]/).pop() || "" : ""
    );
    if (lastQuestion && /\b(instagram|redes|siguenos|nuestro\s+instagram|nuestras\s+redes)\b/i.test(lastQuestion)) {
      return buildSocialMediaReply(academy, "instagram");
    }
  }

  if (isClosureAcknowledgement(message, lastAgentForFlow)) {
    return "Perfecto 😊 Quedo atenta. Nos vemos en la fecha acordada y, si necesitas algo antes, me escribes por aquí.";
  }
  const asksDuration = isDurationQuestion(message);
  const asksFastTrack = isFastTrackQuestion(message);
  let asksLocation = isLocationQuestion(message);
  const asksSocialMedia = isSocialMediaQuestion(message);
  const asksGeneralInfo = isCourseInfoRequest(message);
  const asksClassFrequency = isClassFrequencyQuestion(message);
  const asksCertification = isCertificationQuestion(message);
  const asksPaymentMethodsOrDates = isPaymentMethodsOrDatesQuestion(message);
  const asksStepOne = isStepOneSelection(message);
  const asksPrice = /\b(precio|cuanto|costo|valor|inscripcion|mensualidad|inversion)\b/i.test(normalizedMessage);
  const asksMonthlyVsBiweekly = isMonthlyOrBiweeklyQuestion(message);
  const confirmsVisitCommitment = isVisitCommitmentMessage(message, lastAgentForFlow);
  const requestedTemarioMonth = extractRequestedTemarioMonth(message);
  const inferredTemarioMonthFromFlow = inferTemarioMonthFromAgentPrompt(lastAgentForFlow);
  const asksTemarioByClass = /\b(clase\s+por\s+clase|por\s+clase|temario\s+detallado|detalle\s+por\s+clase)\b/i.test(normalizedMessage);
  const asksCompleteTemario = new RegExp(
    [
      "\\b(?:",
      "temario|pensum|p[eé]nsum|plan\\s+de\\s+estudios|plan\\s+acad[eé]mico|syll?abus|m[oó]dulos|malla\\s+curricular|",
      "contenido(s)?\\s+(del|de\\s+(el|la))\\s+(curso|programa|ciclo)|",
      "listado\\s+(de\\s+(las?\\s+)?)?clases?|",
      "lista(do)?\\s+(completa?\\s+)?(de\\s+(las?\\s+)?)?clases?|",
      "clases?\\s+(del|de\\s+(el|la))\\s+(programa|curso|ciclo)|",
      "clases?\\s+mes\\s+por\\s+mes|",
      "todas?\\s+las\\s+clases?|",
      "(dame|env[ií]a(me)?|comp[áa]rte(me)?|manda(me)?|pasa(me)?)\\s+(por\\s+favor\\s+)?(el|la|las|los)?\\s*(lista(do)?|temario|pensum|clases?|contenido)|",
      "que\\s+(se\\s+ve(n)?|vemos|van\\s+a\\s+ver|veremos|vamos\\s+a\\s+ver|ense[ñn]an?|aprendo|aprender[eé](s|mos)?|incluye(n)?|cubre(n)?)\\s+(en\\s+(el\\s+)?)?(curso|programa|ciclo|clases?)?|",
      "que\\s+temas?\\s+(se\\s+)?(ense[ñn]an?|ven?|cubren?|incluyen?|tienen?|hay|tratan?)|",
      "que\\s+aprend(e|o|emos|er[eé]s?)(mos)?|",
      "que\\s+incluye\\s+(el\\s+)?(curso|programa|ciclo)|",
      "ver\\s+(todo(s)?\\s+)?(el\\s+)?(temario|contenido|clases?)|",
      "todo(s)?\\s+(el|los)\\s+(temario|contenido|clases?|m[oó]dulos?)|",
      "temario\\s+(completo|entero|del\\s+curso|del\\s+programa)|",
      "clases\\s+clase\\s+por\\s+clase",
      ")\\b",
    ].join(""),
    "i"
  ).test(normalizedMessage);
  const askedTemarioByClassBefore = /\b(quieres\s+que\s+te\s+lo\s+envie\s+tambien\s+clase\s+por\s+clase|clase\s+por\s+clase)\b/i.test(normalizeForMatch(lastAgentForFlow));
  const hasRecentTemarioFlow = /\b(temario|clase\s+por\s+clase|mes\s+\d{1,2})\b/i.test(normalizeForMatch(lastAgentForFlow));

  if (intent === "general" && isShortAffirmativeReply(message) && history.length > 0) {
    const pendingTopic = inferPendingTopicFromHistory(history);
    if (pendingTopic) {
      const inferredIntent = detectUserIntent(pendingTopic);
      if (inferredIntent !== "general") {
        intent = inferredIntent;
      }
      if (!asksLocation && isLocationQuestion(pendingTopic)) {
        asksLocation = true;
      }
    }
  }

  const inferredPendingTopic = inferPendingTopicFromHistory(history);

  if (confirmsVisitCommitment) {
    return buildVisitCommitmentReply(academy);
  }

  if (asksMonthlyVsBiweekly) {
    if (detectedProgram) {
      const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
      return `¡Buena pregunta! 👌 No manejamos pago quincenal fijo.\n\nSe maneja así:\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n\nSi quieres, te recomiendo en una línea cuál te conviene más según tu presupuesto.`;
    }

    return "¡Buena pregunta! 👌 No manejamos pago quincenal fijo. Trabajamos con *3 modalidades*: *Por Clase*, *Mensual Opción A* y *Mensual Opción B*. Si me dices el curso, te doy los valores exactos de cada una.";
  }

  const asksScheduleRescue = isScheduleRescueClarification(message, lastAgentForFlow, inferredPendingTopic);
  const asksPaymentRescue = isPaymentRescueClarification(message, lastAgentForFlow, inferredPendingTopic);
  const confirmsPaymentInfo = isShortAffirmativeReply(message)
    && /\b(medios\s+de\s+pago|formas\s+de\s+pago|fechas\s+de\s+pago|metodo\s+de\s+pago)\b/i.test(inferredPendingTopic);

  if (asksScheduleRescue) {
    if (!detectedProgram) {
      return "¡Claro! 🙌 Para responderte corto y preciso: compárteme el curso y te doy horario exacto en una línea.";
    }

    const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
    const nextStart = primaryCourse?.fecha_inicio ? (formatDateLong(primaryCourse.fecha_inicio) || formatDateShort(primaryCourse.fecha_inicio)) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";
    return `¡Claro! 🙌 *${detectedProgram.nombre}* se ve *1 vez por semana* en este horario: *${schedule}* (inicio: ${nextStart}). ¿Te sirve ese grupo?`;
  }

  if (asksPaymentRescue) {
    const primaryCourse = detectedProgram ? pickPrimaryCourseForProgram(detectedProgram, courses) : null;
    const inscripcion = Number(detectedProgram?.precio_inscripcion ?? primaryCourse?.precio_inscripcion ?? 0);
    const insText = inscripcion > 0 ? formatCurrencyCOP(inscripcion) : "Por confirmar";

    if (detectedProgram) {
      return `¡Claro! 🙌 Resumen corto para *${detectedProgram.nombre}*:\n\n💰 *Inscripción:* ${insText}\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n\n¿Quieres que te pase los medios de pago ahora?`;
    }

    return "¡Claro! 🙌 Te respondo corto: manejamos *3 modalidades* (*Por Clase*, *Mensual Opción A* y *Mensual Opción B*). Si me dices el curso, te doy los valores exactos de cada una.";
  }

  if (asksPaymentMethodsOrDates || confirmsPaymentInfo) {
    return buildPaymentMethodsAndDatesReply(mediosPago);
  }

  if (intent === "requisitos") {
    return null; // Dejar que Gemini responda sobre requisitos, edad, etc.
  }

  const confirmsStepOneFlow = asksStepOne
    && /\b(para\s+inscribirte|seguimos\s+este\s+orden|paso\s+1|confirmar\s+el\s+grupo\s+y\s+horario)\b/i.test(normalizeForMatch(lastAgentForFlow));

  if (confirmsStepOneFlow) {
    if (detectedProgram) {
      const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
      const schedule = primaryCourse?.horario || "Por confirmar";
      return `¡Excelente! Vamos con el *paso 1* ✅\n\nPara *${detectedProgram.nombre}*, el horario registrado es: *${schedule}*.\n\n¿Te funciona ese grupo o prefieres que te muestre otra opción?`;
    }

    return "¡Excelente! Vamos con el *paso 1* ✅\n\nPara avanzar, confirmemos el *curso* y el *horario* que mejor te funcione. ¿Cuál curso deseas separar?";
  }
  const confirmsReserveFlow = isShortAffirmativeReply(message)
    && /\b(te reservo( un)? cupo|reservo( tu|el)? cupo|reservar tu cupo|te ayudo a reservar|separar cupo)\b/i.test(normalizeForMatch(lastAgentForFlow));

  const confirmsReserveFlowFromContext = /\b(inscribirme|separar\s+cupo|reservar\s+cupo|quiero\s+reservar)\b/i.test(normalizedMessage)
    && /\b(te reservo( un)? cupo|reservo( tu|el)? cupo|reservar tu cupo|te ayudo a reservar|separar cupo)\b/i.test(normalizeForMatch(lastAgentForFlow));

  if (confirmsReserveFlow || confirmsReserveFlowFromContext) {
    return buildSeparaCupoPaymentReply(detectedProgram, academy, courses);
  }

  // Contacto/número de admisiones → responder ANTES que el flujo de inscripción
  if (asksSocialMedia) {
    return buildSocialMediaReply(academy, message);
  }

  // Pregunta de sí/no sobre disponibilidad de inscripción → responder SÍ primero
  const isEnrollmentAvailabilityQuestion = /\b(todavia|todavía|aún|aun|siguen?|sigue|hay|tienen?|queda[n]?|esta\s+abierta?|abiert[ao])\b.*\b(inscripcion|inscripciones|cupo|cupos|matricula|disponible|vigente)\b/i.test(normalizeForMatch(message))
    || /\b(inscripcion|cupo|matricula).*\b(todavia|todavía|aun|siguen?|vigente|abierto)\b/i.test(normalizeForMatch(message));
  if (isEnrollmentAvailabilityQuestion && intent === "inscripcion") {
    const primaryCourse = detectedProgram ? pickPrimaryCourseForProgram(detectedProgram, courses) : null;
    const disponibles = Number(primaryCourse?.cupos_disponibles ?? 0);
    const cuposStr = disponibles > 0 ? `✅ Quedan *${disponibles}* cupos` : "✅ Hay cupos disponibles";
    const programLabel = detectedProgram ? ` para *${detectedProgram.nombre}*` : "";
    const nextStart = primaryCourse?.fecha_inicio ? (formatDateLong(primaryCourse.fecha_inicio) || formatDateShort(primaryCourse.fecha_inicio)) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";
    return `¡Sí! 😊 La inscripción${programLabel} está abierta.\n\n${cuposStr}.\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n¿Quieres que te guíe para separar tu cupo?`;
  }

  if (intent === "inscripcion") {
    return buildSeparaCupoPaymentReply(detectedProgram, academy, courses);
  }

  if (asksLocation) {
    const locationReference = "Estamos ubicados en el *oriente de Cali*, cerca a la *Panadería Pablos Pam*, en *La Cosmetikera (segundo piso)*.";
    if (academy?.direccion) {
      if (academy?.maps_url) {
        return `¡Claro! 📍

${locationReference}
\nDirección: *${academy.direccion}*.
🗺️ Te comparto el mapa para que llegues fácil: ${academy.maps_url}

Si quieres, también te envío una referencia rápida para llegar 😊`;
      }
      return `¡Claro! 📍

${locationReference}
\nDirección: *${academy.direccion}*.

Si quieres, te comparto una referencia rápida para llegar más fácil 😊`;
    }
    return `¡Claro! 😊\n\n${locationReference}\n\nEnseguida te comparto la ubicación exacta por aquí.\n\nSi prefieres, también te envío el WhatsApp de admisiones para guiarte paso a paso.`;
  }

  const asksKitPurchase = isKitPurchaseQuestion(message);
  const asksKitContents = isKitContentsQuestion(message);
  const asksKitRescue = isKitRescueClarification(message, lastAgentForFlow, inferredPendingTopic);
  const asksMorningSchedule = /\b(manana|manana\s+temprano|por\s+la\s+manana|en\s+la\s+manana)\b/i.test(normalizedMessage)
    && /\b(horario|hora|grupo|noche|tarde|pm|solo|unico|4|7)\b/i.test(normalizedMessage);

  if (asksKitRescue) {
    return "¡Sí! 🙌 Los materiales principales te los damos aquí con el kit mensual, así que no necesitas comprar todo por fuera al inicio. ¿Quieres que te diga qué trae el kit del primer mes?";
  }

  if (asksKitContents) {
    return buildKitContentsReply(detectedProgram);
  }

  if (asksPrice && asksLocation) {
    const locationReference = "Estamos ubicados en el *oriente de Cali*, cerca a la *Panadería Pablos Pam*, en *La Cosmetikera (segundo piso)*.";
    const primaryCourse = detectedProgram ? pickPrimaryCourseForProgram(detectedProgram, courses) : null;
    const priceOptions = resolveProgramPaymentOptions(detectedProgram, primaryCourse);

    const priceBlock = detectedProgram
      ? `💸 *${detectedProgram.nombre}*\n• *Inscripción:* ${priceOptions.inscripcionText}\n• *Modalidades de pago:*\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}`
      : `💸 *Precio:* te confirmo inscripción y mensualidad exactas según el curso que elijas.`;

    const mapsBlock = academy?.maps_url ? `\n🗺️ Mapa: ${academy.maps_url}` : "";
    const addressBlock = academy?.direccion ? `\nDirección: *${academy.direccion}*.` : "";

    return `¡Claro! Te respondo ambas de una 🙌\n\n${priceBlock}\n\n📍 ${locationReference}${addressBlock}${mapsBlock}\n\nSi quieres, te ayudo a elegir el horario que mejor te quede.`;
  }

  if (asksKitPurchase) {
    return `¡Buena pregunta! 👌\n\n✅ Tienes que comprar *muy pocos productos*.\n\n✨ Te entregamos un *kit mensual* que cubre casi todos los materiales que necesitas para tus prácticas.\n\nY si algo te hace falta, ¡tranquila! La academia te lo presta para que no te varas en clase 😊\n\nSi quieres, te detallo exactamente qué incluye el kit del *primer mes*.`;
  }

  if (asksMorningSchedule) {
    if (!detectedProgram) {
      return "¡Te entiendo totalmente! 🙌 Si buscas *jornada de mañana* y no te funciona noche, te ayudo a revisarlo exacto.\n\nCompárteme el *curso* que te interesa y te confirmo si hay grupo en la mañana o la próxima apertura disponible.";
    }

    const morningCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
    const currentSchedule = morningCourse?.horario || "Por confirmar";
    const nextStart = morningCourse?.fecha_inicio ? (formatDateLong(morningCourse.fecha_inicio) || formatDateShort(morningCourse.fecha_inicio)) : "Por confirmar";

    return `¡Claro! Gracias por contarlo 🙌\n\nSi buscas *jornada de mañana*, te confirmo lo que tengo activo para *${detectedProgram.nombre}*:\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario registrado:* ${currentSchedule}\n\nSi ese horario no te funciona, te reviso ahora mismo si hay opción en mañana o próximo grupo. ¿Te lo confirmo?`;
  }

  // Preguntas sobre medios de pago (nequi, presencial, etc.) → dejar que Gemini responda con info real
  if (isPaymentMethodQuestion(message)) {
    return null;
  }

  const asksScheduleIntent = /\b(horario|horarios|hora|dias|dia|fecha|inicio|cuando inicia)\b/i.test(normalizedMessage);
  const asksEnrollmentIntent = /\b(inscripcion|inscribirme|inscrib|matricula|matricular|separar cupo|reservar cupo|admision)\b/i.test(normalizedMessage);
  if (asksScheduleIntent && asksEnrollmentIntent && detectedProgram) {
    const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
    const nextStart = primaryCourse?.fecha_inicio ? (formatDateLong(primaryCourse.fecha_inicio) || formatDateShort(primaryCourse.fecha_inicio)) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";

    return `Perfecto 🙌 Te respondo ambas para *${detectedProgram.nombre}*:\n\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n📝 *Inscripción:* se separa cupo con el pago de matrícula y te guiamos paso a paso con el comprobante.\n\n¿Quieres que te pase ahora los *pasos exactos* para reservar?`;
  }

  // Preguntas sobre cupos → responder con datos reales de la DB
  if (isCuposQuestion(message)) {
    return buildCuposReply(detectedProgram, courses, programs);
  }

  // Detectar: "además de acrílico enseñan otros métodos/técnicas" → mostrar highlights del temario
  const asksOtherTechniques =
    /\b(ademas\s+de|aparte\s+de|mas\s+alla\s+de)\b/i.test(normalizedMessage) &&
    /\b(ensena[nr]?|dictan?|dan|tienen|ofrecen|aprend[eo])\b/i.test(normalizedMessage) &&
    /\b(otros?\s*(metodos?|tecnicas?|cursos?|temas?|cosas?)|mas\s*(metodos?|tecnicas?|temas?))/i.test(normalizedMessage);

  if (asksOtherTechniques) {
    const programsToHighlight = detectedProgram ? [detectedProgram] : programs.slice(0, 2);
    const sections: string[] = [];
    for (const prog of programsToHighlight) {
      const highlights = extractTemarioHighlights(prog.contenido || "", 6);
      if (highlights.length) {
        const cleanHighlights = highlights.map((h) =>
          h.replace(/^\d+[.)\-\s]+/, "").replace(/\p{Extended_Pictographic}/gu, "").trim()
        );
        sections.push(
          `*${prog.nombre}* (${prog.total_clases || "?"}  clases · ${prog.duracion_meses || "?"}  meses):\n` +
          cleanHighlights.map((h) => `• ${h}`).join("\n")
        );
      }
    }
    if (sections.length) {
      return (
        `¡Sí! Enseñamos mucho más que acrílico 💅\n\n` +
        sections.join("\n\n") +
        `\n\n¿Quieres que te comparta el *temario completo* o te cuento sobre fechas e inversión?`
      );
    }
  }

  const requestedTopic = extractProgramInquiryTopic(message);
  if (requestedTopic) {
    const matchedProgram = findProgramMatchByTopic(requestedTopic, programs);
    if (!matchedProgram) {
      const alternatives = buildAvailableProgramsPrompt(programs);
      return `¡Gracias por tu pregunta! 🙌\n\nEn este momento no tengo *${requestedTopic}* dentro de los programas activos.${alternatives ? `\n\n${alternatives}` : ""}\n\nSi quieres, te ayudo a elegir la opción más parecida a lo que buscas.`;
    }
  }

  if (!detectedProgram) {
    const correctedProgram = extractCorrectedProgramName(message);
    if (correctedProgram) {
      return `Entiendo, buscas *${correctedProgram}*. Gracias por corregirme 🙏\n\nAhora mismo no lo tengo identificado en los programas cargados. ¿Quieres que te comparta las opciones disponibles para elegir la correcta?`;
    }

    if (asksGeneralInfo) {
      // En lugar de forzar la ficha general, dejamos que Gemini responda si no hay programa detectado
      return null;
    }
    if (intent === "temario") {
      return "¡Claro! Te comparto el temario en versión resumida. ¿De cuál curso quieres el contenido exacto?";
    }
    if (asksDuration || intent === "precio" || intent === "horario") {
      return "¡Claro! Te ayudo con eso. ¿De cuál curso quieres el dato exacto?";
    }
    return null;
  }

  const rawTemario = detectedProgram?.contenido || "";

  // ── Catálogo: "qué más enseñan" / "qué otros cursos tienen" ────────────────
  // Se evalúa ANTES de asksCompleteTemario para que "qué más enseñan" muestre
  // el listado de programas y no el temario del curso ya detectado.
  if (isAskingAboutCatalog(message) && programs.length > 0) {
    return buildCatalogReply(programs, detectedProgram?.nombre || null);
  }

  if (asksCompleteTemario) {
    const completeReply = buildTemarioCompleteReply(detectedProgram, rawTemario);
    if (completeReply) return completeReply;
  }

  const agentOfferedNextTemarioMonth = inferredTemarioMonthFromFlow !== null;
  const shouldSendDetailedTemario = Boolean(
    asksTemarioByClass
    || (isShortAffirmativeReply(message) && askedTemarioByClassBefore)
    || (isShortAffirmativeReply(message) && agentOfferedNextTemarioMonth)
    || (requestedTemarioMonth !== null && hasRecentTemarioFlow)
  );

  const targetTemarioMonth = requestedTemarioMonth
    ?? (isShortAffirmativeReply(message) && agentOfferedNextTemarioMonth ? inferredTemarioMonthFromFlow : null)
    ?? ((isShortAffirmativeReply(message) && askedTemarioByClassBefore) ? inferredTemarioMonthFromFlow : null);

  if (shouldSendDetailedTemario) {
    const detailedTemarioReply = buildTemarioDetailedListReply(detectedProgram, rawTemario, {
      monthNumber: targetTemarioMonth || undefined,
    });
    if (detailedTemarioReply) {
      return detailedTemarioReply;
    }
  }

  const primaryCourse = pickPrimaryCourseForProgram(detectedProgram, courses);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasUpcomingStart = Boolean(
    primaryCourse?.fecha_inicio &&
      !Number.isNaN(new Date(primaryCourse.fecha_inicio).getTime()) &&
      new Date(primaryCourse.fecha_inicio).setHours(0, 0, 0, 0) >= today.getTime()
  );

  if (asksFastTrack) {
    const duration = detectedProgram?.duracion || (detectedProgram?.duracion_horas ? `${detectedProgram.duracion_horas} horas` : "duración por confirmar");
    const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";

    return buildFastTrackHumanReply(message, history, detectedProgram, duration, nextStart, schedule);
  }

  if (asksDuration) {
    const duration = detectedProgram?.duracion || (detectedProgram?.duracion_horas ? `${detectedProgram.duracion_horas} horas` : null);
    const totalClasses = detectedProgram?.total_clases ? `${detectedProgram.total_clases} clases` : null;
    const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";

    return `📚 *${detectedProgram.nombre}*\n\n⏳ *Duración:* ${duration || "el tiempo definido en el plan académico"}${totalClasses ? ` (${totalClasses})` : ""}\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n¿Quieres que te comparta ahora la *inversión*?`;
  }

  if (asksClassFrequency) {
    const schedule = primaryCourse?.horario || "Por confirmar";
    const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
    const frequency = inferClassFrequencyFromSchedule(schedule);

    return `✅ Para *${detectedProgram.nombre}*, las clases son *${frequency}*.\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario actual:* ${schedule}\n\n¿Quieres que te comparta también la *inversión*?`;
  }

  if (asksCertification) {
    return `🎓 Al finalizar *${detectedProgram.nombre}* recibes *certificado* emitido por la academia.\n\nSi quieres, también te confirmo duración, horarios y proceso de inscripción.`;
  }

  if (asksGeneralInfo) {
    // Solo mostrar ficha si fue una solicitud explícita de info general del curso
    const duration = detectedProgram?.duracion || (detectedProgram?.duracion_horas ? `${detectedProgram.duracion_horas} horas` : "duración según plan académico");
    const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";

    return `✨ *${detectedProgram.nombre}*\n\n✅ Formación práctica desde cero\n⏳ *Duración:* ${duration}\n📅 *Próximo inicio:* ${nextStart}\n🕓 *Horario:* ${schedule}\n\n¿Quieres conocer el precio de la inscripción y mensualidad?`;
  }

  // intent === "general" sin solicitud explícita → dejar que Gemini responda de forma natural
  if (intent === "general") {
    return null;
  }

  if (intent === "temario") {
    const highlights = extractTemarioHighlights(rawTemario, 10);
    if (highlights.length > 0) {
      const explicitClasses = Number(detectedProgram?.total_clases ?? 0);
      const inferredClasses = extractTemarioClassCount(rawTemario);
      const totalClasses = explicitClasses > 0 ? explicitClasses : (inferredClasses > 0 ? inferredClasses : highlights.length);
      const monthSummaries = extractTemarioMonthSummaries(rawTemario, 6);
      const isLongTemario = totalClasses >= 12 || highlights.length >= 10;

      const explicitCycles = Number(detectedProgram?.total_ciclos ?? detectedProgram?.ciclos ?? 0);
      const inferredCycles = inferTemarioCyclesCount(rawTemario);
      const totalCycles = explicitCycles > 0 ? explicitCycles : inferredCycles;

      const summaryLine = totalCycles > 0
        ? `🧩 Este programa tiene *${totalCycles} ciclos* y *${totalClasses} clases*.`
        : `🧩 Este programa tiene *${totalClasses} clases* en su ruta formativa.`;

      const lines = highlights.map((item, index) => {
        const classNumberMatch = item.match(/^(\d{1,2})\s*[.)-]\s+/) || item.match(/^clase\s*(\d{1,2})\b/i);
        const classNumber = classNumberMatch?.[1] || String(index + 1);
        const cleanItem = item
          .replace(/^(\d{1,2})\s*[.)-]\s+/, "")
          .replace(/^clase\s*\d{1,2}\s*[:.-]?\s*/i, "")
          .trim();
        return `🔹 *Clase ${classNumber}:* ${cleanItem}`;
      }).join("\n");

      if (isLongTemario && monthSummaries.length > 0) {
        const monthLines = monthSummaries.map((item) => `🔹 *${item}*`).join("\n");
        return `📚 *Temario de ${detectedProgram.nombre}*\n\n${summaryLine}\n✨ Para que sea más claro, te lo resumo por meses:\n${monthLines}\n\n¿Quieres que te lo envíe también *clase por clase*?`;
      }

      return `📚 *Temario de ${detectedProgram.nombre}*\n\n${summaryLine}\n✨ Trataremos:\n${lines}\n\n💸 ¿Quieres conocer el precio de la inscripción y mensualidad?`;
    }

    return `📚 *Temario de ${detectedProgram.nombre}*\n\nTe comparto el contenido por *ciclos* de forma breve para que sea fácil de leer.\n\n¿Quieres conocer el precio de la inscripción y mensualidad?`;
  }

  if (intent === "precio") {
    const priceOptions = resolveProgramPaymentOptions(detectedProgram, primaryCourse);
    const inscripcion = priceOptions.inscripcion;
    const insText = priceOptions.inscripcionText;
    const men70Text = priceOptions.mensual70Text;
    const men100Text = priceOptions.mensual100Text;
    const porClaseText = priceOptions.porClaseText;

    const inscriptionIncludes = "Incluye: Camiseta, Certificado, Ceremonia de grado y alquiler de toga";
    const monthlyIncludes = "Incluye: kit mensual según la modalidad que elijas";

    const normalizedMessage = normalizeForMatch(message);
    const asksMonthlyConfirmation = /\b(cada mes|se paga|al mes|mensualidad|mensual)\b/i.test(normalizedMessage);
    const asksTotalToPay = /\b(por\s+todo|total|todo\s+junto|de\s+una\s+vez|de\s+una|completo|todo\s+el\s+curso)\b/i.test(normalizedMessage)
      && /\b(cuanto|cuanto\s+es|pagar|pago|se\s+paga|vale|valor|costo)\b/i.test(normalizedMessage);
    // Se detecta abono/pago parcial incluso si no menciona "inscripcion" explícitamente,
    // porque el contexto (el agente ya habló de cupo/precio) lo hace evidente.
    const asksPartialPayment = /\b(abono|abonar|pago parcial|cuota inicial|fraccionar|financiar)\b/i.test(normalizedMessage)
      || (/\b(totalidad|pagar todo|pagar completo|de una)\b/i.test(normalizedMessage) && /\b(inscripcion|inscrip|curso|total)\b/i.test(normalizedMessage));
    const asksWhatIsIncluded = /\b(que incluye|incluye|trae|viene con)\b/i.test(normalizedMessage);

    if (asksWhatIsIncluded) {
      return null; // Dejar que Gemini responda qué incluye la mensualidad o inscripción
    }

    if (asksMonthlyConfirmation) {
      return `💳 Perfecto, aquí lo tienes claro y rápido:\n\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n\nSi quieres, te recomiendo en una línea cuál te conviene más según tu presupuesto.`;
    }

    if (asksTotalToPay) {
      const totalInicio70 = (inscripcion > 0 && priceOptions.mensual70 > 0)
        ? formatCurrencyCOP(inscripcion + priceOptions.mensual70)
        : "Por confirmar";
      const totalInicio100 = (inscripcion > 0 && priceOptions.mensual100 > 0)
        ? formatCurrencyCOP(inscripcion + priceOptions.mensual100)
        : "Por confirmar";

      return `💸 Si quieres iniciar de una, te queda así:\n• *Inscripción:* ${insText}\n• *Inicio con Mensual Opción A:* ${totalInicio70}\n• *Inicio con Mensual Opción B:* ${totalInicio100}\n• *Inicio con Por Clase:* inscripción + ${porClaseText} por cada clase que asistas\n\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n\n✅ Empiezas con inscripción y eliges la modalidad que mejor te funcione.\nSi lo necesitas, la mensualidad puede completarse hasta la segunda clase.`;
    }

    if (asksPartialPayment) {
      return `Buena pregunta 👌\n\nPara iniciar hoy, se maneja:\n💰 *Inscripción:* ${insText}\n💳 Luego eliges modalidad:\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n\nSi no te queda fácil pagar todo junto, te orientamos para arrancar y completar mensualidad hasta la segunda clase.`;
    }

    const recentConversationText = (Array.isArray(history) ? history : [])
      .slice(-4)
      .map((item) => `${item?.user || ""} ${item?.agent || ""}`)
      .join(" ");
    const normalizedHistory = normalizeForMatch(recentConversationText);
    const lastAgentMessage = Array.isArray(history) && history.length > 0 ? history[history.length - 1]?.agent || "" : "";
    const normalizedLastAgent = normalizeForMatch(lastAgentMessage);

    const asksEnrollmentProcess = /\b(inscrib|inscrip|matricul|cupo|separar|reservar)\b/i.test(normalizedMessage);
    const asksPaymentMethods = /\b(pago|pagos|cuota|cuotas|tarjeta|efectivo|transferencia|nequi|daviplata|financi)\b/i.test(normalizedMessage);
    const asksDateOrSchedule = /\b(fecha|inicio|horario|hora|dias|días)\b/i.test(normalizedMessage);

    const historyMentionsEnrollment = /\b(inscrib|inscrip|matricul|cupo|separar|reservar)\b/i.test(normalizedHistory);
    const historyMentionsPayment = /\b(pago|pagos|cuota|cuotas|tarjeta|efectivo|transferencia|nequi|daviplata|financi)\b/i.test(normalizedHistory);
    const historyMentionsDateOrSchedule = /\b(fecha|inicio|horario|hora|dias|días)\b/i.test(normalizedHistory);

    const lastAgentAskedEnrollment = /\b(inscrib|inscrip|matricul|cupo|separar|reservar)\b/i.test(normalizedLastAgent);
    const lastAgentAskedPayment = /\b(pago|pagos|cuota|cuotas|tarjeta|efectivo|transferencia|nequi|daviplata|financi)\b/i.test(normalizedLastAgent);
    const lastAgentAskedDateOrSchedule = /\b(fecha|inicio|horario|hora|dias|días)\b/i.test(normalizedLastAgent);

    let nextStepType: "payment" | "enrollment" | "date" = "payment";

    let nextStepPrompt = "💳 ¿Prefieres que te comparta *formas de pago* o *cómo inscribirte*?";
    if (asksEnrollmentProcess || historyMentionsEnrollment) {
      nextStepPrompt = historyMentionsPayment
        ? "📅 ¿Quieres que te confirme también la *fecha de inicio* y *horario* disponible?"
        : "✅ ¿Quieres que te confirme los *medios de pago* y las *fechas de pago*?";
      nextStepType = historyMentionsPayment ? "date" : "payment";
    } else if (asksPaymentMethods || historyMentionsPayment) {
      nextStepPrompt = historyMentionsEnrollment
        ? "📅 ¿Quieres que te comparta también *fecha de inicio* y *horario*?"
        : "📝 ¿Quieres que te comparta los *pasos de inscripción* y cómo *separar cupo*?";
      nextStepType = historyMentionsEnrollment ? "date" : "enrollment";
    } else if (asksDateOrSchedule || historyMentionsDateOrSchedule) {
      nextStepPrompt = historyMentionsPayment
        ? "📝 ¿Quieres que te comparta los *pasos de inscripción* y cómo *separar cupo*?"
        : "✅ ¿Quieres que te confirme los *medios de pago* y las *fechas de pago*?";
      nextStepType = historyMentionsPayment ? "enrollment" : "payment";
    } else if (!historyMentionsPayment) {
      nextStepPrompt = "✅ ¿Quieres que te confirme los *medios de pago* y las *fechas de pago*?";
      nextStepType = "payment";
    } else if (!historyMentionsEnrollment) {
      nextStepPrompt = "📝 ¿Quieres que te comparta los *pasos de inscripción* y cómo *separar cupo*?";
      nextStepType = "enrollment";
    } else {
      nextStepPrompt = "📅 ¿Quieres que te confirme también la *fecha de inicio* y *horario* disponible?";
      nextStepType = "date";
    }

    if ((nextStepType === "payment" && lastAgentAskedPayment) || (nextStepType === "enrollment" && lastAgentAskedEnrollment) || (nextStepType === "date" && lastAgentAskedDateOrSchedule)) {
      if (nextStepType !== "payment" && !lastAgentAskedPayment) {
        nextStepPrompt = "✅ ¿Quieres que te confirme los *medios de pago* y las *fechas de pago*?";
      } else if (nextStepType !== "enrollment" && !lastAgentAskedEnrollment) {
        nextStepPrompt = "📝 ¿Quieres que te comparta los *pasos de inscripción* y cómo *separar cupo*?";
      } else if (nextStepType !== "date" && !lastAgentAskedDateOrSchedule) {
        nextStepPrompt = "📅 ¿Quieres que te confirme también la *fecha de inicio* y *horario* disponible?";
      }
    }

    const promptCandidates = [
      "✅ ¿Quieres que te confirme los *medios de pago* y las *fechas de pago*?",
      "📝 ¿Quieres que te comparta los *pasos de inscripción* y cómo *separar cupo*?",
      "📅 ¿Quieres que te confirme también la *fecha de inicio* y *horario* disponible?",
    ];
    if (wasPromptAskedRecently(history, nextStepPrompt)) {
      const alternative = promptCandidates.find((candidate) => !wasPromptAskedRecently(history, candidate));
      if (alternative) {
        nextStepPrompt = alternative;
      }
    }

    return `💸 *Inversión de ${detectedProgram.nombre}:*\n\n💰 *Inscripción:* ${insText}\n🎁 ${inscriptionIncludes}\n\n💳 *Modalidades de pago:*\n${buildHumanPaymentModalitiesBlock(detectedProgram, primaryCourse)}\n🧴 ${monthlyIncludes}\n\n${nextStepPrompt}`;
  }

  if (intent === "horario") {
    const nextStart = hasUpcomingStart ? formatDateLong(primaryCourse?.fecha_inicio) || formatDateShort(primaryCourse?.fecha_inicio) : "Por confirmar";
    const schedule = primaryCourse?.horario || "Por confirmar";

    return buildScheduleHumanReply(message, history, detectedProgram, nextStart, schedule);
  }

  return null;
}

function formatStudentCoursesList(studentContext: any): string {
  const enrollments = Array.isArray(studentContext?.enrollments) ? studentContext.enrollments : [];
  if (!enrollments.length) {
    return "No tienes cursos activos registrados en este momento.";
  }

  const lines = enrollments
    .slice(0, 6)
    .map((item: any) => {
      const schedule = [item?.diasSemana, item?.horaInicio && item?.horaFin ? `${item.horaInicio} - ${item.horaFin}` : item?.horaInicio]
        .filter(Boolean)
        .join(" | ");
      return `- ${item?.cursoNombre || "Curso"}${item?.programaNombre ? ` (${item.programaNombre})` : ""}${schedule ? ` | ${schedule}` : ""}`;
    })
    .join("\n");

  return `Tus cursos inscritos son:\n${lines}`;
}

function extractIdentificationFromText(message: string): string | null {
  const text = String(message || "").trim();
  if (!text) return null;

  const normalized = normalizeForMatch(text);
  const hasIdKeyword = /\b(cedula|cedula|identificacion|identificacion|documento|dni|cc)\b/i.test(normalized);
  const looksLikeOnlyNumber = /^[\d\s.\-]{6,20}$/.test(text);

  if (!hasIdKeyword && !looksLikeOnlyNumber) {
    return null;
  }

  const matches = text.match(/\b\d[\d.\-\s]{5,20}\b/g) || [];
  const candidate = matches
    .map((item) => item.replace(/\D/g, ""))
    .find((digits) => digits.length >= 6 && digits.length <= 12);

  return candidate || null;
}

function hasStudentAccountIntent(message: string): boolean {
  const text = normalizeForMatch(message);
  // NOTA: "materiales" NO se incluye aquí — los materiales son info pública del curso, no del perfil estudiantil
  return /\b(cuanto debo|deuda|saldo pendiente|mensualidad|proxima mensualidad|proximo pago|cuando debo pagar|proxima clase|siguiente clase|hoy hay clase|inscrita|inscrito|mis cursos)\b/i.test(text);
}

function resolveStudentIdentification(
  userMessage: string,
  history: Array<{ user: string; agent: string }>
): string | null {
  const direct = extractIdentificationFromText(userMessage);
  if (direct) return direct;

  if (!hasStudentAccountIntent(userMessage)) {
    return null;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const fromHistory = extractIdentificationFromText(history[i]?.user || "");
    if (fromHistory) {
      return fromHistory;
    }
  }

  return null;
}

function hasLinkOrAppAccessIntent(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const linkToken = /\b(link|lin|lik|enlace|url)\b/i.test(text);
  const accessToken = /\b(no puedo|no abre|no me abre|no funciona|problema|error|ingresar|entrar|acceder|abrir)\b/i.test(text);
  const appToken = /\b(app|aplicacion|aplicacion|portal)\b/i.test(text);

  return (linkToken && (accessToken || appToken)) || /\bno puedo abrir\b/i.test(text);
}

function hasRecentLinkSupportContext(history: Array<{ user: string; agent: string }>): boolean {
  const recent = history.slice(-4);
  return recent.some((turn) => {
    const combined = `${turn?.user || ""} ${turn?.agent || ""}`;
    const normalized = normalizeForMatch(combined);
    return /\b(link|lin|lik|enlace|app|aplicacion|portal|usuario|cedula|identificacion)\b/i.test(normalized);
  });
}

function wasAppAccessIdRequestedRecently(history: Array<{ user: string; agent: string }>): boolean {
  const recent = history.slice(-3);
  return recent.some((turn) => {
    const agentText = normalizeForMatch(turn?.agent || "");
    return /\b(comparteme|comparteme|enviame|confirmame|confirma)\b.*\b(cedula|identificacion|documento)\b/i.test(agentText)
      && /\b(link|app|portal|usuario|ingreso|acceso)\b/i.test(agentText);
  });
}

function extractIdentificationLoose(message: string): string | null {
  const raw = String(message || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6 && digits.length <= 12) {
    return digits;
  }

  return null;
}

async function buildLinkAccessDirectResponse(
  supabase: any,
  userMessage: string,
  history: Array<{ user: string; agent: string }>
): Promise<string | null> {
  const appUrl = "https://app.crystaldiamante.com";
  const isLinkIntent = hasLinkOrAppAccessIntent(userMessage);
  const hasLinkContext = hasRecentLinkSupportContext(history);
  const idRequestedForAccess = wasAppAccessIdRequestedRecently(history);

  const directId = extractIdentificationFromText(userMessage) || extractIdentificationLoose(userMessage);
  const shouldTryIdentification = Boolean(directId && (isLinkIntent || (hasLinkContext && idRequestedForAccess)));

  if (shouldTryIdentification && directId) {
    const { data: profile, error } = await supabase
      .from("perfiles")
      .select("id, nombre_completo, email, identificacion, rol")
      .eq("identificacion", directId)
      .eq("rol", "estudiante")
      .maybeSingle();

    if (error) {
      console.error("[link-support] Error buscando estudiante por cédula:", error);
    }

    if (profile) {
      const userLogin = String(profile?.email || "").trim();
      if (userLogin) {
        return `Perfecto. Este es el link de la app: ${appUrl}\n\nTu usuario es: ${userLogin}\nTu clave es tu número de cédula: ${directId}\n\n¿Te funcionó el ingreso?`;
      }

      return `Ya validé tu cédula. Este es el link de la app: ${appUrl}\n\nTu clave es tu número de cédula: ${directId}\nSi no recuerdas tu usuario, te ayudo a recuperarlo con Secretaría.\n\n¿Te funcionó el ingreso?`;
    }

    return `No encontré un estudiante con la cédula ${directId}.\nEste es el link de la app: ${appUrl}\n\nRevísame el número de cédula (solo números) y te confirmo tu usuario.\nTu clave es tu número de cédula.`;
  }

  if (isLinkIntent) {
    return `¿Te refieres al link de la app?\nAquí te lo dejo: ${appUrl}\n\nSi necesitas tu usuario, compárteme tu número de cédula (solo números) y te lo confirmo.\nTu clave es tu número de cédula.`;
  }

  return null;
}

function buildStudentDirectResponse(message: string, studentContext: any): string | null {
  if (!studentContext) return null;

  const text = normalizeForMatch(message);
  const asksDebt = /\b(cuanto debo|deuda|saldo pendiente|debo)\b/i.test(text);
  const asksNextPay = /\b(proxima mensualidad|proximo pago|cuando debo pagar|fecha de pago|vence|vencimiento)\b/i.test(text);
  const asksNextClass = /\b(proxima clase|siguiente clase|hoy hay clase|hoy tengo clase|clase hoy)\b/i.test(text);
  const asksEnrolledCourses = /\b(en que curso|que cursos|mis cursos|inscrita|inscrito)\b/i.test(text);

  if (asksDebt) {
    const deuda = Number(studentContext?.deudaTotal || 0);
    const next = studentContext?.nextMonthlyPayment;
    const extra = next
      ? `\nPróxima mensualidad: Cuota ${next.numeroCuota ?? "?"} | vence ${formatDateShort(next.fechaVencimiento)} | valor ${formatCurrencyCOP(Number(next.monto || 0))}.`
      : "\nNo tienes mensualidades pendientes registradas.";
    return `Tu deuda total pendiente es ${formatCurrencyCOP(deuda)}.${extra}`;
  }

  if (asksNextPay) {
    const next = studentContext?.nextMonthlyPayment;
    if (!next) {
      return "No tienes una mensualidad pendiente registrada en este momento.";
    }
    return `Tu próxima mensualidad es la cuota ${next.numeroCuota ?? "?"}, vence el ${formatDateShort(next.fechaVencimiento)} y el valor es ${formatCurrencyCOP(Number(next.monto || 0))}.`;
  }

  if (asksNextClass) {
    const nextClass = studentContext?.nextClass;
    if (!nextClass) {
      return `No pude calcular tu próxima clase con los horarios actuales. ${formatStudentCoursesList(studentContext)}`;
    }
    return `Tu próxima clase es ${nextClass.cursoNombre}${nextClass.programaNombre ? ` (${nextClass.programaNombre})` : ""}, el ${nextClass.fechaHoraTexto}.`;
  }

  if (asksEnrolledCourses) {
    return formatStudentCoursesList(studentContext);
  }

  return null;
}

function buildTodayClassDirectResponse(
  detectedProgram: any | null,
  courses: any[],
  now: Date
): string {
  if (!detectedProgram) {
    return "Para confirmarte si hoy hay clase, dime el curso en el que estás inscrita (por ejemplo: Uñas).";
  }

  const normalizedProgram = normalizeForMatch(detectedProgram.nombre || "");
  const relatedCourses = (courses || []).filter((course) => {
    const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
    const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
    return Boolean(sameProgramId || sameProgramName);
  });

  if (relatedCourses.length === 0) {
    return `No encontré grupos activos de ${detectedProgram.nombre} en este momento. Si quieres, te comparto los próximos grupos.`;
  }

  const dayIndex = now.getDay();
  const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dayName = dayNames[dayIndex] || "hoy";

  const activeCourses = relatedCourses.filter((course) => isCourseActiveOnDate(course, now));
  const candidates = activeCourses.length > 0 ? activeCourses : relatedCourses;
  const todayCourses = candidates.filter((course) => scheduleIncludesDay(course?.horario, dayIndex));

  if (todayCourses.length > 0) {
    const lines = todayCourses
      .slice(0, 4)
      .map((course) => `- ${course.nombre}${course.horario ? ` (${course.horario})` : ""}`)
      .join("\n");

    return `Sí, hoy ${dayName} sí hay clase de ${detectedProgram.nombre}.\n${lines}`;
  }

  const reference = candidates
    .slice(0, 4)
    .map((course) => {
      const start = formatDateShort(course?.fecha_inicio);
      const datePart = start ? ` | inicia: ${start}` : "";
      return `- ${course.nombre}${course.horario ? ` (${course.horario})` : ""}${datePart}`;
    })
    .join("\n");

  return `Hoy ${dayName} no aparece clase de ${detectedProgram.nombre} según los horarios registrados.\n${reference}`;
}

function isNextGroupQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(cuando hay otro curso|cuando hay otro|otro curso|proximo grupo|siguiente grupo|proximo curso|nuevo grupo|cuando abren|cuando inicia el proximo|cual curso va a iniciar|cual curso inicia|que curso inicia|que curso va a iniciar|proximo en iniciar|va a iniciar|van a iniciar)\b/i.test(text);
}

function hasRecentNextGroupContext(history: Array<{ user: string; agent: string }>): boolean {
  const recent = history.slice(-3);
  return recent.some((turn) => {
    const combined = `${turn?.user || ""} ${turn?.agent || ""}`;
    return /\b(otro curso|proximo grupo|siguiente grupo|proximo curso|grupo avanzado|por confirmar)\b/i.test(normalizeForMatch(combined));
  });
}

function shouldUseNextGroupDirectResponse(
  userMessage: string,
  detectedProgram: any | null,
  programs: any[],
  history: Array<{ user: string; agent: string }>
): boolean {
  if (isNextGroupQuestion(userMessage)) return true;

  const mentionsProgram = Boolean(
    detectProgramFromMessage(userMessage, programs)
    || resolveProgramAliasFromMessage(userMessage, programs)
  );
  if (mentionsProgram && detectedProgram && isLikelyProgramOnlyReply(userMessage) && hasRecentNextGroupContext(history)) {
    return true;
  }

  return false;
}

function buildNextGroupDirectResponse(
  detectedProgram: any | null,
  courses: any[],
  now: Date
): string {
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  // Sin programa detectado → mostrar TODOS los próximos inicios
  if (!detectedProgram) {
    const upcoming = (courses || [])
      .filter((c) => c?.fecha_inicio && !Number.isNaN(new Date(c.fecha_inicio).getTime()) && new Date(c.fecha_inicio) >= today)
      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

    if (!upcoming.length) {
      return "En este momento no hay fechas de inicio confirmadas. Apenas se publiquen te las comparto. ¿Quieres que te avise?";
    }

    const lines = upcoming.slice(0, 5).map((c) => {
      const nombre = c.programa_nombre || c.nombre || "Curso";
      const fecha = formatDateLong(c.fecha_inicio) || formatDateShort(c.fecha_inicio) || "Por confirmar";
      const horario = c.horario || "Por confirmar";
      const disponibles = Number(c.cupos_disponibles ?? 0);
      const cuposStr = disponibles > 0 ? `${disponibles} cupo${disponibles === 1 ? "" : "s"}` : "Sin cupos";
      return `💎 *${nombre}*\n   📅 Inicio: ${fecha}\n   🕓 ${horario} | 👥 ${cuposStr}`;
    });

    return `Estos son los próximos grupos que inician:\n\n${lines.join("\n\n")}\n\n¿Cuál te interesa? Te ayudo a separar cupo 🙌`;
  }

  const normalizedProgram = normalizeForMatch(detectedProgram.nombre || "");
  const relatedCourses = (courses || []).filter((course) => {
    const sameProgramId = course?.programa_id && Number(course.programa_id) === Number(detectedProgram.id);
    const sameProgramName = normalizeForMatch(course?.programa_nombre || "").includes(normalizedProgram);
    return Boolean(sameProgramId || sameProgramName);
  });

  if (!relatedCourses.length) {
    return `Te entiendo. En este momento no tengo grupos cargados de ${detectedProgram.nombre}. Si quieres, te aviso apenas publiquemos nueva fecha.`;
  }

  const nextWithDate = relatedCourses
    .filter((course) => course?.fecha_inicio && !Number.isNaN(new Date(course.fecha_inicio).getTime()))
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
    .find((course) => new Date(course.fecha_inicio).getTime() >= today.getTime() - 24 * 60 * 60 * 1000);

  if (nextWithDate) {
    const dateLabel = formatDateLong(nextWithDate.fecha_inicio) || formatDateShort(nextWithDate.fecha_inicio) || "Por confirmar";
    const horario = nextWithDate?.horario || "Por confirmar";
    const disponibles = Number(nextWithDate.cupos_disponibles ?? 0);
    const cuposStr = disponibles > 0 ? `✅ ${disponibles} cupo${disponibles === 1 ? "" : "s"} disponible${disponibles === 1 ? "" : "s"}` : "❌ Sin cupos";
    return `💎 *${detectedProgram.nombre}*\n\n📅 *Próximo inicio:* ${dateLabel}\n🕓 *Horario:* ${horario}\n👥 ${cuposStr}\n\n¿Te reservo el cupo ahora?`;
  }

  return `Para *${detectedProgram.nombre}* el próximo grupo está por confirmar. Apenas tengamos fecha te aviso. ¿Quieres que te notifiquemos?`;
}

function shouldUseTodayClassDirectResponse(
  userMessage: string,
  detectedProgram: any | null,
  programs: any[],
  history: Array<{ user: string; agent: string }>
): boolean {
  if (isTodayClassQuestion(userMessage)) return true;

  const mentionsProgram = Boolean(
    detectProgramFromMessage(userMessage, programs)
    || resolveProgramAliasFromMessage(userMessage, programs)
  );
  if (mentionsProgram && detectedProgram && isLikelyProgramOnlyReply(userMessage) && hasRecentTodayClassContext(history)) {
    return true;
  }

  return false;
}

function detectMaterialsScope(message: string): "tema" | "ciclo" | "general" {
  const text = message.toLowerCase();

  if (/\b(tema|clase|sesion|sesión|modulo|m[oó]dulo|leccion|lección)\b/i.test(text)) {
    return "tema";
  }
  if (/\b(ciclo|nivel|general|completo|kit|todos|todo\s+el\s+curso)\b/i.test(text)) {
    return "ciclo";
  }
  return "general";
}

type ObjectionType = "precio" | "tiempo" | "confianza" | "posponer" | "none";

function detectObjectionType(message: string): ObjectionType {
  const text = message.toLowerCase();

  if (/\b(caro|costoso|muy\s+caro|no\s+tengo\s+dinero|no\s+me\s+alcanza|esta\s+costoso)\b/i.test(text)) {
    return "precio";
  }
  if (/\b(no\s+tengo\s+tiempo|trabajo\s+todo\s+el\s+dia|no\s+puedo\s+por\s+horario|muy\s+ocupad[oa])\b/i.test(text)) {
    return "tiempo";
  }
  if (/\b(no\s+se\s+si\s+sirva|es\s+confiable|tienen\s+certificacion|es\s+legal|no\s+confio|me\s+da\s+duda)\b/i.test(text)) {
    return "confianza";
  }
  if (/\b(luego|despues|mas\s+adelante|lo\s+voy\s+a\s+pensar|te\s+aviso|otro\s+dia|por\s+ahora\s+no)\b/i.test(text)) {
    return "posponer";
  }

  return "none";
}

function resolveProgramFromContext(
  userMessage: string,
  programs: any[],
  conversationHistory: Array<{ user: string; agent: string }>
): any | null {
  const aliasedProgram = resolveProgramAliasFromMessage(userMessage, programs);
  if (aliasedProgram) return aliasedProgram;

  const directProgram = detectProgramFromMessage(userMessage, programs);
  if (directProgram) return directProgram;

  if (hasProgramCorrectionSignal(userMessage)) {
    return null;
  }

  const isLikelyFollowUp = isShortAffirmativeReply(userMessage)
    || /\b(ese|esa|ese\s+curso|esa\s+carrera|horario|precio|cuanto|cuando|inscripcion|mensualidad|cupos|duracion|inversion|temario|materiales|ubicacion|direccion|donde|disponible|disponibles|dia|dias|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i.test(
      userMessage
    );

  if (!isLikelyFollowUp || !conversationHistory.length) {
    return null;
  }

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const current = conversationHistory[i];
    if (!current) continue;

    const fromUser = detectProgramFromMessage(current.user || "", programs);
    if (fromUser) return fromUser;

    const fromAgent = detectProgramFromMessage(current.agent || "", programs);
    if (fromAgent) return fromAgent;
  }

  return null;
}

function findNailsProgram(programs: any[]): any | null {
  const allPrograms = Array.isArray(programs) ? programs : [];
  if (!allPrograms.length) return null;

  const ranked = allPrograms
    .map((program) => ({
      program,
      normalized: normalizeForMatch(program?.nombre || ""),
    }))
    .filter((entry) => entry.normalized);

  const exact = ranked.find((entry) =>
    /\bartista\s+integral\s+en\s+unas\b/.test(entry.normalized)
  );
  if (exact) return exact.program;

  const hasUñas = ranked.find((entry) =>
    /\bunas\b/.test(entry.normalized)
  );
  if (hasUñas) return hasUñas.program;

  return null;
}

function resolveProgramAliasFromMessage(userMessage: string, programs: any[]): any | null {
  const raw = String(userMessage || "").toLowerCase();
  if (!raw) return null;

  const normalized = normalizeForMatch(userMessage);
  const asksNailProgram =
    /\b(manicura|manicuria|maniura|manicure|pedicura|pedicure|pedi\s*spa|pedispa|nail|nails|unas\s+acrilicas|curso\s+de\s+unas)\b/i.test(normalized)
    || /\buñ(?:as|s)\b/i.test(raw)
    || /\buñas\b/i.test(raw);

  if (!asksNailProgram) return null;
  return findNailsProgram(programs);
}

function buildContextualDirective(
  userMessage: string,
  detectedProgram: any | null,
  courses: any[],
  history: Array<{ user: string; agent: string }> = []
): string {
  const intent = detectUserIntent(userMessage);
  const materialsScope = intent === "materiales" ? detectMaterialsScope(userMessage) : "general";
  const objection = detectObjectionType(userMessage);
  const explicitBuyingIntent = detectBuyingIntent(userMessage, []);
  const asksNextGroup = isNextGroupQuestion(userMessage);

  // Detectar qué temas ya se cubrieron en el historial para no repetirlos
  const recentHistoryText = normalizeForMatch(
    (Array.isArray(history) ? history : []).slice(-8).map((h) => `${h?.agent || ""}`).join(" ")
  );
  const coveredTopics: string[] = [];
  if (/\b(inversion|inscripcion|mensualidad|cuota|precio|costo)\b/i.test(recentHistoryText)) coveredTopics.push("precio/inversión");
  if (/\b(horario|inicio|fecha|arranca|grupo)\b/i.test(recentHistoryText)) coveredTopics.push("horario/fecha de inicio");
  if (/\b(inscrib|cupo|separar|reservar|matricul)\b/i.test(recentHistoryText)) coveredTopics.push("proceso de inscripción");
  if (/\b(temario|contenido|ciclo|modulo)\b/i.test(recentHistoryText)) coveredTopics.push("temario/contenido");
  if (/\b(material|insumo|kit|herramienta)\b/i.test(recentHistoryText)) coveredTopics.push("materiales");
  const noRepeatRule = coveredTopics.length > 0
    ? `REGLA ANTI-REPETICIÓN: Los siguientes temas ya fueron cubiertos en esta conversación — NO los ofrezcas de nuevo ni hagas preguntas sobre ellos: ${coveredTopics.join(", ")}. Ofrece el siguiente paso lógico que aún NO se haya cubierto.`
    : "";

  const normalizedUser = normalizeForMatch(userMessage);
  const normalizedRecentHistory = normalizeForMatch(
    (Array.isArray(history) ? history : []).slice(-8).map((h) => `${h?.user || ""} ${h?.agent || ""}`).join(" ")
  );
  const isTeacherSupport = /\b(profesora|profesor|docente|maestra|soy\s+profesor|soy\s+profe|mis\s+clases|mi\s+pago\s+quincena|quincena)\b/i.test(`${normalizedUser} ${normalizedRecentHistory}`);
  const isStudentSupport = /\b(estudiante|alumna|alumno|estoy\s+estudiando|tengo\s+clase\s+hoy|hay\s+clase\s+hoy|kit|materiales\s+de\s+la\s+clase|mis\s+cursos|proxima\s+clase|proximo\s+pago)\b/i.test(`${normalizedUser} ${normalizedRecentHistory}`);

  const roleSupportRule = isTeacherSupport
    ? `MODO SOPORTE DOCENTE ACTIVADO:
- Responde PRIMERO la duda puntual de la profesora (sin embudo comercial).
- Si pregunta por clase programada: confirma hoy/próxima clase con fecha, horario y curso cuando exista en contexto.
- Si pregunta por pago de próxima quincena: responde con el valor o estado disponible; si falta dato, dilo directo y pide SOLO el dato mínimo para consultar (ej: cédula o nombre completo).
- Puedes incluir info útil para enseñanza (tema del día, materiales, observaciones) solo si aporta a su pregunta.
- Prohibido desviar a ventas o inscripción.`
    : isStudentSupport
    ? `MODO SOPORTE ESTUDIANTE ACTIVADO:
- Responde primero la pregunta exacta del estudiante de forma natural y concreta.
- No pidas cédula ni des credenciales de acceso a menos que el usuario pida explícitamente link/app/ingreso/usuario.
- Si pregunta por kit/materiales de clase, responde directamente qué debe llevar (o indica que validarás el ciclo/tema exacto).
- Evita respuestas genéricas o cambio de tema.`
    : "";
  const programName = detectedProgram?.nombre || null;

  const intentInstructionMap: Record<string, string> = {
    precio:
      'Responde priorizando SOLO el bloque de inversión (inscripción + mensualidad). No des precio total salvo que lo pidan explícitamente.',
    horario:
      'Responde priorizando fechas, días, horario y cupos del grupo activo relacionado.',
    temario:
      'Responde priorizando temario/contenido por ciclos o módulos del programa solicitado. Si el usuario pide detalle por mes o clase, usa formato de lista vertical: una clase por línea (sin párrafos largos).',
    materiales:
      materialsScope === "tema"
        ? 'Responde priorizando SOLO "Materiales por Tema/Clase" del programa solicitado. Regla: "Clase N" = tema con orden N del ciclo consultado. Si no se especifica ciclo y hay ambigüedad, pide aclaración breve antes de listar materiales. Formato obligatorio: primero cantidad y unidad, luego el nombre del material.'
        : materialsScope === "ciclo"
        ? 'Responde priorizando SOLO "Materiales por Ciclo" del programa solicitado. Formato obligatorio: primero cantidad y unidad, luego el nombre del material.'
        : 'Responde con materiales del programa y pide una aclaración breve para definir si los quiere por ciclo o por tema/clase. Formato obligatorio: primero cantidad y unidad, luego el nombre del material.',
    inscripcion:
      'Responde con mini-resumen del curso y guía de inscripción. Si ya hay interés claro, cierra con Admisiones (+57 301 203 8582).',
    general:
      'Responde con información completa en bloques, enfocada en el curso solicitado.'
  };

  const dominantProgram = (() => {
    if (!courses.length) return null;
    const countByProgram = new Map<string, number>();
    for (const course of courses) {
      const name = course?.programa_nombre;
      if (!name) continue;
      countByProgram.set(name, (countByProgram.get(name) || 0) + 1);
    }
    let topName: string | null = null;
    let topCount = 0;
    for (const [name, count] of countByProgram.entries()) {
      if (count > topCount) {
        topName = name;
        topCount = count;
      }
    }
    if (!topName) return null;
    return { name: topName, ratio: topCount / Math.max(courses.length, 1) };
  })();

  const focusLine = programName
    ? `Curso detectado y solicitado por el usuario: "${programName}". Debes responder enfocado en este curso, no en lista general.`
    : dominantProgram && dominantProgram.ratio >= 0.7
    ? `La consulta apunta mayoritariamente al programa "${dominantProgram.name}". Responde enfocado en ese programa.`
    : 'Si no puedes identificar un curso específico, pregunta UNA aclaración corta con máximo 2 opciones relevantes.';

  const objectionInstructionMap: Record<ObjectionType, string> = {
    precio:
      'El usuario tiene objeción de precio. Responde con empatía, refuerza valor del curso, evita presión y ofrece opción de iniciar con inscripción + mensualidad.',
    tiempo:
      'El usuario tiene objeción de tiempo/horario. Responde con empatía y propone alternativas de horario o próximo grupo disponible.',
    confianza:
      'El usuario tiene objeción de confianza. Responde con señales de respaldo (certificación, trayectoria, profesor, testimonios) usando solo datos disponibles.',
    posponer:
      'El usuario está posponiendo decisión. Responde suave, resume beneficios clave y cierra con una pregunta simple para mantener la conversación activa.',
    none:
      'No se detecta objeción explícita. Mantén un tono consultivo y enfocado a avance de inscripción sin ser invasivo.'
  };

  return [
    `Intención detectada: ${intent.toUpperCase()}.`,
    `Objeción detectada: ${objection.toUpperCase()}.`,
    `Señal de compra explícita: ${explicitBuyingIntent ? "SÍ" : "NO"}.`,
    focusLine,
    intentInstructionMap[intent],
    objectionInstructionMap[objection],
    explicitBuyingIntent
      ? 'ACCIÓN OBLIGATORIA: Entrega el número de la academia/admisiones (+57 301 203 8582) y guía el siguiente paso de inscripción.'
      : 'Si no hay señal explícita de compra, continúa en modo informativo y consultivo.',
    asksNextGroup
      ? 'CASO ESPECIAL: Si pregunta por "otro curso" o "próximo grupo", NO envíes ficha comercial completa. Responde corto, natural y humano: 1) reconoce que el grupo actual puede ir avanzado, 2) da fecha/horario solo si están confirmados, 3) si no hay fecha, dilo claramente sin rodeos, 4) cierra con una sola pregunta de seguimiento.'
      : 'Mantén el enfoque en resolver la pregunta puntual sin sobrecargar con información no solicitada.',
    'REGLA DE ORO: 1 intención del usuario = 1 bloque corto de respuesta. No mezcles precio+duración+beneficios+temario en el mismo mensaje salvo que el usuario lo pida.',
    'REGLA DE NATURALIDAD: escribe como asesor humano por WhatsApp; evita frases de guion, repeticiones y cierres de venta forzados.',
    'REGLA DE RESPUESTA DIRECTA: abre la respuesta contestando exactamente la última pregunta del usuario en una frase corta.',
    'REGLA DE FOCO: no hagas preguntas de "¿qué curso te interesa?" si ya está claro por contexto.',
    'Si hay objeción, estructura la respuesta en: 1) Empatía breve, 2) Dato concreto del curso, 3) Propuesta clara, 4) CTA corta.',
    'Prohibido responder con: "¿En qué curso estás interesado?" cuando el usuario ya mencionó un curso o tema específico.',
    roleSupportRule,
    noRepeatRule,
    isPersonalDataCorrectionMessage(userMessage)
      ? `MODO CORRECCIÓN DE DATOS PERSONALES ACTIVADO:
- El usuario está corrigiendo un dato personal (nombre, apellido, cédula u otro).
- Responde de forma NATURAL y DIRECTA en máximo 2 líneas: confirma que recibiste la corrección y que la trasladarás al equipo para actualizarla.
- NO menciones cursos, precios, horarios ni inicies discurso comercial.
- Tono correcto: "Anotado ✏️ [dato corregido]. Le paso la corrección al equipo para actualizarlo. ¿Algo más en que te pueda ayudar? 😊"
- PROHIBIDO decir "validar con el Director si es posible" — solo confirma que se pasará al equipo.`
      : ""
  ].filter(Boolean).join('\n');
}

async function generateResponse(apiKey: string, prompt: string, timeoutMs: number = 25000): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const modelCandidates = [
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro-002",
    process.env.GEMINI_MODEL_CHAT,
    process.env.GEMINI_MODEL_SUMMARY,
  ].filter(Boolean) as string[];

  let lastError: any = null;

  for (const candidate of modelCandidates) {
    try {
      console.log(`[generateResponse] Modelo: ${candidate}`);
      const model = genAI.getGenerativeModel({ model: candidate });
      
      // Agregar timeout a la generación de contenido
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout después de ${timeoutMs}ms`)), timeoutMs)
      );
      
      const contentPromise = model.generateContent(prompt)
        .then(result => result.response.text());
      
      const text = await Promise.race([contentPromise, timeoutPromise]);
      
      console.log(`[generateResponse] Éxito: ${candidate}`);
      return text || "No pude generar una respuesta en este momento.";
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || "").toLowerCase();
      console.warn(`[generateResponse] Error ${candidate}:`, errorMsg);
      
      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("No disponible Gemini model for chat");
}

export async function POST(req: NextRequest) {
  try {
    if (!validateRequest(req)) {
      return NextResponse.json({ 
        ok: false,
        error: "No autorizado" 
      }, { status: 401 });
    }

    const body = await readRequestBody(req);

    if (isSelfOriginatedInstagramEvent(body)) {
      console.log("[chat] Evento echo/saliente de Instagram ignorado", {
        isEcho: body?.entry?.[0]?.messaging?.[0]?.message?.is_echo,
        senderId: body?.entry?.[0]?.messaging?.[0]?.sender?.id || body?.entry?.[0]?.changes?.[0]?.value?.sender?.id || null,
        recipientId: body?.entry?.[0]?.messaging?.[0]?.recipient?.id || null,
        entryId: body?.entry?.[0]?.id || null,
      });

      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "instagram_self_event",
      });
    }

// Ignorar read receipts, delivery receipts y eventos sin mensaje real
    const messagingEvent = body?.entry?.[0]?.messaging?.[0];
    if (messagingEvent) {
      if (messagingEvent.read !== undefined || messagingEvent.delivery !== undefined) {
        return NextResponse.json({ ok: true, ignored: true, reason: "read_or_delivery_receipt" });
      }
      // Ignorar echoes (mensajes enviados por el propio bot reflejados por Instagram)
      if (messagingEvent.message?.is_echo === true) {
        return NextResponse.json({ ok: true, ignored: true, reason: "instagram_echo" });
      }
      // Ignorar si no hay mensaje de texto ni adjunto ni story reply
      if (!messagingEvent.message && !messagingEvent.postback) {
        return NextResponse.json({ ok: true, ignored: true, reason: "no_message_content" });
      }

      // ── Deduplicación por message_id ──────────────────────────────────────
      // Instagram (y WhatsApp) a veces entrega el mismo webhook 2-3 veces en
      // milisegundos. Guardamos los IDs procesados por 30 segundos para evitar
      // procesar (y responder) el mismo mensaje más de una vez.
      const incomingMid: string | undefined =
        messagingEvent.message?.mid ||
        messagingEvent.message?.id ||
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      if (incomingMid) {
        const now = Date.now();
        const DEDUP_WINDOW_MS = 30_000; // 30 s
        const existing = processedMessageIds.get(incomingMid);
        if (existing && now - existing < DEDUP_WINDOW_MS) {
          console.log(`[chat] Webhook duplicado ignorado mid=${incomingMid}`);
          return NextResponse.json({ ok: true, ignored: true, reason: "duplicate_message_id" });
        }
        processedMessageIds.set(incomingMid, now);
        // Limpiar IDs viejos ocasionalmente para no crecer indefinidamente
        if (processedMessageIds.size > 500) {
          for (const [k, ts] of processedMessageIds.entries()) {
            if (now - ts > DEDUP_WINDOW_MS) processedMessageIds.delete(k);
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────
    }

    const { message, phone, channel, profileName: rawProfileName } = extractMessageAndPhone(body || {});

    // Guardrail extra para payloads de Make: si llega como remitente el ID propio de la
    // cuenta de Instagram, es eco/salida y no debe procesarse como mensaje entrante.
    if (channel === "instagram" && isOwnInstagramConversationIdentifier(phone, body)) {
      return NextResponse.json({ ok: true, ignored: true, reason: "instagram_own_sender_id" });
    }

    // Si es Instagram DM y el webhook no trajo nombre, intentar obtenerlo vía Graph API
    let profileName = rawProfileName;
    if (channel === "instagram" && !profileName && phone && phone !== "unknown") {
      profileName = await fetchInstagramSenderUsername(phone);
      if (profileName) {
        console.log("[chat] Username Instagram obtenido via Graph API:", profileName);
      }
    }

    // Extraer datos del comentario si es un evento de comentario de Instagram
    const commentEvent = extractInstagramCommentEvent(body || {});

    console.log("[chat] Input extraído:", {
      phone,
      channel,
      profileName,
      messagePreview: message?.slice(0, 80) || "",
      bodyMessage: body?.message,
      bodyText: body?.text,
      nestedMessage: body?.messages?.[0]?.text?.body,
    });

    if (channel === "instagram" && !profileName) {
      console.warn("[chat] Instagram sin profileName en payload ni Graph API", {
        knownNameFields: {
          profile_name: body?.profile_name,
          contact_name: body?.contact_name,
          sender_name: body?.sender_name,
          from_name: body?.from_name,
          instagram_username: body?.instagram_username,
          senderUsername: body?.sender?.username,
          senderName: body?.sender?.name,
        },
      });
    }

    // Detectar adjunto sin texto (ej: imagen de Instagram) — responder amigablemente en lugar de 400
    const hasAttachment = !!(
      body?.entry?.[0]?.messaging?.[0]?.message?.attachments?.length ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === "image" ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === "sticker" ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === "video" ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === "audio" ||
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === "document"
    );

    const hasInlineText = !!pickFirstNonEmptyString(
      messagingEvent?.message?.text,
      messagingEvent?.message?.text?.body,
      body?.entry?.[0]?.changes?.[0]?.value?.message?.text,
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body,
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text,
      body?.message,
      body?.text,
      body?.text?.body,
      body?.text?.text
    );

    if (!message && !hasInlineText && hasAttachment) {
      const attachmentType = String(
        body?.entry?.[0]?.messaging?.[0]?.message?.attachments?.[0]?.type ||
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type ||
        "imagen"
      );
      const isAudio = attachmentType === "audio";
      const friendlyReply = isAudio
        ? "¡Hola! Por el momento no puedo escuchar audios, pero con mucho gusto te atiendo por texto 😊 ¿En qué te puedo ayudar?"
        : "¡Hola! Por el momento no puedo ver imágenes, pero con mucho gusto te atiendo por texto 😊 ¿En qué te puedo ayudar?";
      return NextResponse.json({ ok: true, response: friendlyReply });
    }

    // Validar entrada del usuario
    const inputValidation = validateUserInput(message, 2000);
    if (!inputValidation.valid) {
      return NextResponse.json({ 
        ok: false,
        error: String(inputValidation.error || "Entrada inválida")
      }, { status: 400 });
    }

    // Verificar rate limit
    const rateLimit = checkRateLimit(phone || "unknown");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          ok: false,
          error: "Demasiadas solicitudes. Por favor, espera un momento."
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ 
        ok: false,
        error: "Faltan credenciales Supabase" 
      }, { status: 500 });
    }
    if (!geminiKey) {
      return NextResponse.json({ 
        ok: false,
        error: "Falta API Key de Gemini" 
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const persistConversation = async (
      userMessageValue: string,
      agentResponseValue: string,
      transcriptionValue?: string
    ) =>
      saveConversation(
        supabase,
        phone || "unknown",
        userMessageValue,
        agentResponseValue,
        transcriptionValue,
        channel,
        profileName
      );

    // Obtener configuración del agente
    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const configuredSystemPrompt = (settings?.system_prompt || "").trim();
    if (!configuredSystemPrompt) {
      return NextResponse.json(
        {
          ok: false,
          error: "No hay prompt configurado. Defínelo en Marketing Center antes de usar el agente.",
        },
        { status: 400 }
      );
    }

    // Obtener historial
    const history = await getConversationHistory(supabase, phone || "unknown", 5);
    const effectiveMessage = enrichMessageWithFollowUpContext(message, history);
    const preferredStudentName = resolvePreferredStudentName(message, history);

    // Buscar nombre por teléfono en perfiles (estudiante, profesor, exalumno)
    const phoneProfile = (!preferredStudentName && phone && phone !== "unknown")
      ? await getProfileByPhone(phone)
      : null;
    const phoneProfileName = phoneProfile?.nombre_completo
      ? phoneProfile.nombre_completo.split(' ')[0]  // solo primer nombre
      : null;
    const detectedIntent = detectUserIntent(effectiveMessage);
    let mediaSuggestion: Awaited<ReturnType<typeof getAgentImageSuggestion>> = null;

    const linkAccessResponse = await buildLinkAccessDirectResponse(supabase, message, history);
    if (linkAccessResponse) {
      const fallbackResponse = settings?.fallback_response || "Déjame confirmarlo y te respondo en breve.";
      const cleanedResponse = sanitizeAgentVisibleResponse(linkAccessResponse, fallbackResponse);
      const truncatedResponse = truncateResponse(cleanedResponse, 1000);
      await persistConversation(message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null), commentEvent)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    // INFORMACIÓN JERÁRQUICA
    // 1. Obtener todos los programas (información primaria)
    const programs = await getProgramsForAgent();

    const studentIdentification = resolveStudentIdentification(effectiveMessage, history);
    const studentContext = studentIdentification
      ? await getStudentContextByIdentification(studentIdentification)
      : null;

    if (studentIdentification && !studentContext && hasStudentAccountIntent(effectiveMessage)) {
      const notFoundResponse = `No encontré una estudiante con identificación ${studentIdentification}. Verifica el número de cédula y me lo vuelves a enviar.`;
      const truncatedNotFound = truncateResponse(notFoundResponse, 1000);
      await persistConversation(message, truncatedNotFound);

      const sanitizedResponse = sanitizeForJSON(truncatedNotFound);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizeForJSON(settings?.persona_name || "Dany") || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null), commentEvent)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    // 2. Obtener cursos basado en lo que pregunta (si menciona programa)
    let detectedProgram = resolveProgramFromContext(effectiveMessage, programs, history);
    let courses = detectedProgram
      ? await getCoursesByProgram(detectedProgram.id)
      : await getCoursesForQuery(effectiveMessage, programs);

    const hasCorrectionSignal = hasProgramCorrectionSignal(effectiveMessage);

    if (!detectedProgram && !hasCorrectionSignal && courses.length > 0) {
      const uniqueProgramIds = Array.from(new Set(courses.map((c) => c.programa_id).filter(Boolean)));
      if (uniqueProgramIds.length === 1) {
        const inferred = programs.find((p) => p.id === uniqueProgramIds[0]) || null;
        if (inferred) {
          detectedProgram = inferred;
          courses = await getCoursesByProgram(inferred.id);
        }
      }
    }

    if (!detectedProgram && studentContext?.enrolledProgramIds?.length === 1) {
      const inferredFromStudent = programs.find((p) => Number(p.id) === Number(studentContext.enrolledProgramIds[0])) || null;
      if (inferredFromStudent) {
        detectedProgram = inferredFromStudent;
        courses = await getCoursesByProgram(inferredFromStudent.id);
      }
    }

    mediaSuggestion = await getAgentImageSuggestion(supabase, {
      message: effectiveMessage,
      intent: detectedIntent,
      programId: detectedProgram?.id || null,
      excludeUrls: extractSentImageUrlsFromHistory(history),
    });

    // 3. Obtener información de la academia (dirección, redes, contacto)
    const academy = await getAcademyInfo();
    const admissionsContact = String(academy?.whatsapp_admisiones || ADMISSIONS_NUMBER).trim();
    const mediosPago = await getMediosPago();

    // Anular imagen si es el primer mensaje de la conversación (saludo inicial)
    // o si el mensaje original es un saludo / afirmación corta ("si", "ok", "dale", etc.)
    if (mediaSuggestion) {
      const isFirstInteraction = history.length === 0;
      const trimmedOriginal = (message || "").trim();
      const isGreetingOrShortInput = /^(hola|hi|hey|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|hello|holi|s[ií]p?|ok|okay|dale|listo|claro|perfecto|de\s+una|bien|ya|sip|genial|excelente|entendido|gracias|chao|bye)[\s!.?]*$/i.test(trimmedOriginal)
        || trimmedOriginal.split(/\s+/).filter(Boolean).length <= 1;
      const normalizedOriginal = normalizeForMatch(trimmedOriginal);
      const isOperationalQuestion = /\b(nequi|bancolombia|sistecredito|paso\s*1|horario|hora|martes|miercoles|jueves|viernes|sabado|domingo|ubicacion|direccion|donde|maps)\b/i.test(normalizedOriginal)
        || /^(1|uno|paso\s*1)$/i.test(normalizedOriginal);
      const isPriceOrPaymentQuestion = detectedIntent === "precio"
        || /\b(precio|valor|cuanto|inversion|inscripcion|mensualidad|pago|pagos|modalidad|modalidades|quincena|quincenal)\b/i.test(normalizedOriginal);
      const lastAgentMessage = history[history.length - 1]?.agent || "";
      const isClosureAckInput = isClosureAcknowledgement(trimmedOriginal, lastAgentMessage);
      if (isFirstInteraction || isGreetingOrShortInput) {
        mediaSuggestion = null;
      }
      if (isOperationalQuestion && !isPriceOrPaymentQuestion) {
        mediaSuggestion = null;
      }
      if (isClosureAckInput) {
        mediaSuggestion = null;
      }
      // Nunca enviar imagen cuando el usuario está corrigiendo sus datos personales
      if (isPersonalDataCorrectionMessage(message)) {
        mediaSuggestion = null;
      }
    }

    const directStudentResponse = buildStudentDirectResponse(effectiveMessage, studentContext, mediosPago);
    if (directStudentResponse) {
      const truncatedResponse = truncateResponse(directStudentResponse, 1000);

      await persistConversation(message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null), commentEvent)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    if (shouldUseTodayClassDirectResponse(effectiveMessage, detectedProgram, programs, history)) {
      const directResponse = buildTodayClassDirectResponse(detectedProgram, courses, new Date());
      const truncatedResponse = truncateResponse(directResponse, 1000);

      await persistConversation(message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null), commentEvent)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    if (shouldUseNextGroupDirectResponse(effectiveMessage, detectedProgram, programs, history)) {
      const directResponse = buildNextGroupDirectResponse(detectedProgram, courses, new Date());
      const truncatedResponse = truncateResponse(directResponse, 1000);

      await persistConversation(message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null), commentEvent)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }
    
    let directIntentResponse = buildIntentFocusedDirectResponse(effectiveMessage, detectedProgram, courses, academy, history, programs, mediosPago);
    if (directIntentResponse && isRepetitiveResponse(directIntentResponse, history, effectiveMessage)) {
      const pendingTopic = inferPendingTopicFromHistory(history);
      if (pendingTopic) {
        const retriedDirectResponse = buildIntentFocusedDirectResponse(
          `${effectiveMessage}. ${pendingTopic}.`,
          detectedProgram,
          courses,
          academy,
          history,
          programs,
          mediosPago
        );

        if (retriedDirectResponse && !isRepetitiveResponse(retriedDirectResponse, history, effectiveMessage)) {
          directIntentResponse = retriedDirectResponse;
        }
      }

      if (directIntentResponse && isRepetitiveResponse(directIntentResponse, history, effectiveMessage) && detectedProgram) {
        const currentIntent = detectUserIntent(effectiveMessage);
        const forcedTopicByIntent: Record<typeof currentIntent, string> = {
          precio: "quiero saber la inversion",
          horario: "quiero saber dias y horario",
          temario: "quiero saber el temario",
          materiales: "quiero saber materiales",
          inscripcion: "quiero saber como me inscribo",
          requisitos: "quiero saber los requisitos",
          general: "quiero saber dias y horario",
        };
        const forcedProgressResponse = buildIntentFocusedDirectResponse(
          `${effectiveMessage}. ${forcedTopicByIntent[currentIntent]}.`,
          detectedProgram,
          courses,
          academy,
          history,
          programs,
          mediosPago
        );

        if (forcedProgressResponse) {
          directIntentResponse = forcedProgressResponse;
        }
      }
    }

    if (directIntentResponse) {
      const completedDirectResponse = ensurePaymentModalitiesInResponse(
        directIntentResponse,
        effectiveMessage,
        detectedIntent,
        detectedProgram,
        courses
      );
      const truncatedResponse = truncateResponse(completedDirectResponse, 1000);
      const allowMediaSuggestion = shouldAttachMediaSuggestion(message, truncatedResponse);
      const activeMedia = detectedProgram && allowMediaSuggestion ? mediaSuggestion : null;
      const responseToSave = activeMedia
        ? `[📷 ${activeMedia.mediaUrl}|${activeMedia.caption}]\n${truncatedResponse}`
        : truncatedResponse;

      await persistConversation(message, responseToSave);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      return NextResponse.json(addCommentMeta(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizeForJSON(settings?.persona_name || "Dany") || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, commentEvent ? null : activeMedia), commentEvent));
    }
    
    // 4. Contexto jerárquico CON PENSUM: info academia + medios pago + programas + grupos + temario detallado
    const hierarchicalContextBase = await buildHierarchicalContextWithPensum(programs, courses, detectedProgram, academy, mediosPago);
    const hierarchicalContext = studentContext?.contextText
      ? `${hierarchicalContextBase}\n\n${studentContext.contextText}`
      : hierarchicalContextBase;

    // 🔍 DEBUG: Ver qué información tiene el agente
    console.log('=== CONTEXTO DEL AGENTE ===');
    console.log(`📚 Programas encontrados: ${programs.length}`);
    console.log(`📖 Cursos/Grupos encontrados: ${courses.length}`);
    if (courses.length > 0) {
      courses.forEach(c => {
        console.log(`  - ${c.nombre} | Programa: ${c.programa_nombre} | Horario: ${c.horario} | Precio: $${c.precio_inscripcion || c.precio} | Inicio: ${c.fecha_inicio}`);
      });
    }
    if (detectedProgram) {
      console.log(`🎯 Programa detectado: ${detectedProgram.nombre}`);
    }
    console.log(`📝 Contexto jerárquico (primeros 500 chars): ${hierarchicalContext.substring(0, 500)}`);

    // Obtener conocimiento relevante
    const knowledgeChunks = await searchKnowledge(supabase, effectiveMessage, 3);

    // Construir directiva contextual por intención del usuario
    const studentDirective = studentContext
      ? 'Existe contexto de estudiante validado por identificación. Prioriza responder con sus cursos inscritos, su próxima clase y su estado real de pagos antes de información general.'
      : '';
    const contextualDirective = [
      buildContextualDirective(effectiveMessage, detectedProgram, courses, history),
      buildNameSafetyDirective(preferredStudentName, profileName || null, channel, phoneProfileName, phoneProfile?.rol || null),
      buildUpcomingStartDirective(detectedProgram, courses),
      studentDirective,
    ]
      .filter(Boolean)
      .join('\n');

    // Construir prompt con contexto jerárquico
    const prompt = buildAgentPrompt(
      settings || {},
      effectiveMessage,
      knowledgeChunks,
      history,
      hierarchicalContext,
      contextualDirective,
      admissionsContact
    );

    // Generar respuesta
    let response = await generateResponse(geminiKey, prompt);

    if (isRepetitiveResponse(response, history, effectiveMessage)) {
      console.warn("[anti-repeat] Respuesta muy parecida a la anterior. Regenerando...");
      const antiRepeatPrompt = `${prompt}

# ANTI-REPETICIÓN (OBLIGATORIO)
- Tu última respuesta fue muy parecida a una previa y eso NO está permitido.
- Responde específicamente a la NUEVA pregunta del usuario.
- NO repitas frases de cierre ni texto genérico ya usado.
- Mantén el formato, pero cambia el contenido con datos concretos del contexto actual.`;

      response = await generateResponse(geminiKey, antiRepeatPrompt);
    }

    const fallbackResponse = settings?.fallback_response || "Déjame confirmarlo y te respondo en breve.";
    const cleanedAgentResponse = stripRepeatedGreetingPrefix(
      sanitizeAgentVisibleResponse(response, fallbackResponse),
      hasGreetingInHistory(history)
    );
    const completedAgentResponse = ensurePaymentModalitiesInResponse(
      cleanedAgentResponse,
      effectiveMessage,
      detectedIntent,
      detectedProgram,
      courses
    );

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(completedAgentResponse, 1000);

    // Guardar en historiales — incluir marcador de imagen si aplica
    const allowMediaSuggestionFinal = shouldAttachMediaSuggestion(message, truncatedResponse);
    const activeMediaFinal = detectedProgram && allowMediaSuggestionFinal ? mediaSuggestion : null;
    const responseToSaveFinal = activeMediaFinal
      ? `[📷 ${activeMediaFinal.mediaUrl}|${activeMediaFinal.caption}]\n${truncatedResponse}`
      : truncatedResponse;
    await persistConversation(message, responseToSaveFinal);

    // Sanitizar respuesta para JSON válido
    const sanitizedResponse = sanitizeForJSON(truncatedResponse);
    
    // Limpiar markdown para WhatsApp (**texto** → *texto*)
    const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);
    
    const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
    const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

    return NextResponse.json(addCommentMeta(withMediaSuggestion({
      ok: true,
      response: whatsappResponse || "",
      agent: sanitizedAgent || "Dany",
      knowledgeUsed: Boolean(knowledgeChunks.length > 0),
      historyLength: Number(history.length) || 0,
      programDetected: sanitizedProgram || null,
      rateLimitRemaining: Number(rateLimit.remaining) || 0,
    }, commentEvent ? null : activeMediaFinal), commentEvent));
  } catch (error: any) {
    console.error("Error en /api/ai/chat:", error);
    const errorMessage = error?.message || "Error generando respuesta";
    return NextResponse.json(
      { 
        ok: false,
        error: String(errorMessage).substring(0, 200) // Limitar longitud del error
      },
      { status: 500 }
    );
  }
}
