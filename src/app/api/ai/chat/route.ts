/**
 * POST /api/ai/chat
 * 
 * Endpoint para el agente IA conversacional con personalidad configurable.
 * Jerárquico: Muestra TODOS programas + GRUPOS del programa que pregunta
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { 
  getProgramsForAgent, 
  getCoursesForQuery, 
  getCoursesByProgram,
  detectProgramFromMessage,
  buildHierarchicalContext,
  buildHierarchicalContextWithPensum,
  getAcademyInfo,
  getMediosPago
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
📱 WhatsApp Admisiones: +57 301 203 8582

Entrega el número cuando:
✔ Preguntan por precios
✔ Preguntan por horarios
✔ Dicen: me interesa, quiero inscribirme, cómo pago, cuándo empiezo

Cierre tipo:
"¡Perfecto! Me encanta tu interés en convertirte en profesional 💎
Para reservar tu cupo, escribe directamente a Admisiones:
📱 +57 301 203 8582"

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
  const keyPattern = /(phone|telefono|whatsapp|wa_?id|from|sender|contact|chat|jid|author|participant|customer|cliente|remotejid)/i;

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

function extractMessageAndPhone(body: any): { message: string; phone: string } {
  const webhookMessage = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
  const webhookPhone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const webhookContactPhone = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id;

  const nestedMessage = body?.messages?.[0]?.text?.body;
  const nestedPhone = body?.messages?.[0]?.from;

  const deepCandidates = extractStringsDeep({
    text: body?.text,
    message: body?.message,
    messages: body?.messages,
    entry: body?.entry,
    data: body?.data,
    payload: body?.payload,
  });

  const deepKeyCandidates = extractPhoneCandidatesByKey(body);

  const deepPhoneCandidate = findPhoneCandidateDeep([...deepKeyCandidates, ...deepCandidates]);

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
    nestedMessage,
    webhookMessage,
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

  const phone = pickFirstNonEmptyString(
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
    body?.chat?.id,
    body?.chatId,
    body?.session_id,
    body?.sessionId,
    body?.chat_id,
    body?.chat?.jid,
    body?.chat?.remoteJid,
    body?.conversationId,
    body?.whatsapp?.from,
    body?.whatsapp?.wa_id,
    body?.whatsapp?.messages?.[0]?.from,
    body?.whatsapp?.messages?.[0]?.id,
    body?.metadata?.phone,
    body?.metadata?.wa_id,
    body?.metadata?.remote_jid,
    body?.metadata?.remoteJid,
    body?.metadata?.participant,
    body?.contact?.phone,
    body?.contact?.wa_id,
    body?.contact?.id,
    body?.data?.from,
    body?.data?.wa_id,
    body?.data?.phone,
    body?.data?.chat?.id,
    body?.data?.key?.remoteJid,
    body?.data?.key?.participant,
    body?.payload?.from,
    body?.payload?.phone,
    body?.payload?.wa_id,
    body?.payload?.chatId,
    body?.payload?.chat?.id,
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
    nestedPhone,
    webhookPhone,
    webhookContactPhone,
    deepPhoneCandidate,
    "unknown"
  );

  const normalizedPhone = normalizePhoneIdentifier(phone);
  if (normalizedPhone === "unknown") {
    console.warn("[extractMessageAndPhone] No se pudo extraer teléfono", {
      directPhone: body?.phone || body?.phone_number || body?.telefono || body?.from || body?.wa_id,
      deepKeyCandidates: deepKeyCandidates.slice(0, 10),
    });
  }

  return { message, phone: normalizedPhone };
}

async function getConversationHistory(
  supabase: any, 
  phone: string, 
  limit = 5
): Promise<Array<{user: string, agent: string}>> {
  try {
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("user_message, agent_response")
      .eq("phone_number", phone)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getConversationHistory] Error:", error);
      return [];
    }

    return (data || []).reverse().map((row: any) => ({
      user: row.user_message,
      agent: row.agent_response,
    }));
  } catch (err) {
    console.error("[getConversationHistory] Error:", err);
    return [];
  }
}

async function saveConversation(
  supabase: any,
  phone: string,
  userMessage: string,
  agentResponse: string,
  transcription?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("agent_conversations")
      .insert({
        phone_number: phone,
        user_message: userMessage,
        agent_response: agentResponse,
        transcription: transcription || null,
      });

    if (error) {
      console.warn("[saveConversation] Error:", error);
    } else {
      console.log("[saveConversation] Guardada");
    }
  } catch (err) {
    console.warn("[saveConversation] Error:", err);
  }
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
function hasGreetingInHistory(conversationHistory: Array<{user: string, agent: string}>): boolean {
  if (!conversationHistory || conversationHistory.length === 0) return false;
  
  // Palabras de saludo comunes
  const greetings = /\b(hola|buenos|buenas|bienvenido|bienvenida|hallo|¿qué tal|hey|saludos|encantado|encantada)\b/gi;
  
  // Revisar todas las respuestas del agente en el historial
  return conversationHistory.some(msg => greetings.test(msg.agent));
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
  conversationHistory: Array<{user: string, agent: string}> = [],
  hierarchicalContext: string = "",
  contextualDirective: string = ""
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

  const greetingRule = alreadyGreeted
    ? '⚠️ YA HAS SALUDADO EN ESTA CONVERSACIÓN. Ve directo a la respuesta. PROHIBIDO repetir "Hola" o saludos de cortesía. Sé natural y conversacional.'
    : greeting
    ? `Saluda SOLO UNA VEZ al inicio del contacto usando este saludo exacto: "${greeting}". Si el usuario ya habló contigo, ve directo a la respuesta.`
    : 'Saluda SOLO UNA VEZ al inicio del contacto. Si el usuario ya habló contigo, ve directo a la respuesta.';

  const salesProtocol = showsBuyingIntent
    ? `✅ **DETECTADO: El usuario muestra INTENCION DE COMPRA**

**ACCION OBLIGATORIA:**
1. Confirma su interes de forma positiva y motivadora
2. Proporciona el numero de Admisiones: **+57 301 203 8582** (WhatsApp)
3. Invitalo a escribir para agendar inscripcion o visita

**EJEMPLO DE CIERRE:**
"¡Perfecto! Me encanta que estes listo para convertirte en profesional. 🎓

Para finalizar tu inscripcion y reservar tu cupo, escribe directamente a nuestro equipo de Admisiones:

📱 **WhatsApp Admisiones: +57 301 203 8582**

Ellos te guiaran en el proceso de pago, confirmaran tu grupo y resolveran cualquier duda. ¡Nos vemos pronto en la academia! 💎✨"`
    : `⚠️ **FASE DE INFORMACION** - NO proporciones el numero de Admisiones aun.

Ayuda al usuario a conocer:
• Cursos disponibles
• Costos (inscripcion + mensualidad)
• Horarios de grupos disponibles
• Beneficios del programa

**Solo daras el numero de contacto (+57 301 203 8582) cuando:**
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
  });

  if (hierarchicalContext) {
    prompt += `\n${hierarchicalContext}\n`;
  }

  if (conversationHistory.length > 0) {
    prompt += `\n# Historial de conversación reciente:\n`;
    conversationHistory.forEach((msg) => {
      prompt += `\nUsuario: ${msg.user}\n${persona}: ${msg.agent}\n`;
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

  prompt += `\n# Mensaje del usuario:\n${userMessage}\n\n# Tu respuesta (como ${persona}):`;

  return prompt;
}

function detectUserIntent(message: string): "precio" | "horario" | "temario" | "materiales" | "inscripcion" | "general" {
  const text = message.toLowerCase();

  if (/\b(precio|costo|cuanto|vale|valor|mensualidad|inscripcion|cuota|inversion)\b/i.test(text)) {
    return "precio";
  }
  if (/\b(horario|hora|dias|dia|fecha|cuando\s+inicia|inicio|arranca|empieza|grupo)\b/i.test(text)) {
    return "horario";
  }
  if (/\b(temario|contenido|que\s+aprendo|que\s+ven|modulos|ciclos|materias)\b/i.test(text)) {
    return "temario";
  }
  if (/\b(material|materiales|insumo|insumos|herramienta|herramientas|kit|implementos|lista\s+de\s+materiales)\b/i.test(text)) {
    return "materiales";
  }
  if (/\b(inscrib|matricul|pago|admisiones|contacto|numero|whatsapp|separar\s+cupo)\b/i.test(text)) {
    return "inscripcion";
  }
  return "general";
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
  const directProgram = detectProgramFromMessage(userMessage, programs);
  if (directProgram) return directProgram;

  const isLikelyFollowUp = /\b(ese|esa|ese\s+curso|esa\s+carrera|horario|precio|cuanto|cuando|inscripcion|mensualidad|cupos|duracion)\b/i.test(
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

function buildContextualDirective(
  userMessage: string,
  detectedProgram: any | null,
  courses: any[]
): string {
  const intent = detectUserIntent(userMessage);
  const materialsScope = intent === "materiales" ? detectMaterialsScope(userMessage) : "general";
  const objection = detectObjectionType(userMessage);
  const explicitBuyingIntent = detectBuyingIntent(userMessage, []);
  const programName = detectedProgram?.nombre || null;

  const intentInstructionMap: Record<string, string> = {
    precio:
      'Responde priorizando SOLO el bloque de inversión (inscripción + mensualidad). No des precio total salvo que lo pidan explícitamente.',
    horario:
      'Responde priorizando fechas, días, horario y cupos del grupo activo relacionado.',
    temario:
      'Responde priorizando temario/contenido por ciclos o módulos del programa solicitado.',
    materiales:
      materialsScope === "tema"
        ? 'Responde priorizando SOLO "Materiales por Tema/Clase" del programa solicitado. Si falta el tema exacto, pide una aclaración breve.'
        : materialsScope === "ciclo"
        ? 'Responde priorizando SOLO "Materiales por Ciclo" del programa solicitado.'
        : 'Responde con materiales del programa y pide una aclaración breve para definir si los quiere por ciclo o por tema/clase.',
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
    'Si hay objeción, estructura la respuesta en: 1) Empatía breve, 2) Dato concreto del curso, 3) Propuesta clara, 4) CTA corta.',
    'Prohibido responder con: "¿En qué curso estás interesado?" cuando el usuario ya mencionó un curso o tema específico.'
  ].join('\n');
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
    const { message, phone } = extractMessageAndPhone(body || {});

    console.log("[chat] Input extraído:", {
      phone,
      messagePreview: message?.slice(0, 80) || "",
      bodyMessage: body?.message,
      bodyText: body?.text,
      nestedMessage: body?.messages?.[0]?.text?.body,
    });

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

    // INFORMACIÓN JERÁRQUICA
    // 1. Obtener todos los programas (información primaria)
    const programs = await getProgramsForAgent();

    // 2. Obtener cursos basado en lo que pregunta (si menciona programa)
    let detectedProgram = resolveProgramFromContext(message, programs, history);
    let courses = detectedProgram
      ? await getCoursesByProgram(detectedProgram.id)
      : await getCoursesForQuery(message, programs);

    if (!detectedProgram && courses.length > 0) {
      const uniqueProgramIds = Array.from(new Set(courses.map((c) => c.programa_id).filter(Boolean)));
      if (uniqueProgramIds.length === 1) {
        const inferred = programs.find((p) => p.id === uniqueProgramIds[0]) || null;
        if (inferred) {
          detectedProgram = inferred;
          courses = await getCoursesByProgram(inferred.id);
        }
      }
    }
    
    // 3. Obtener información de la academia (dirección, redes, contacto)
    const academy = await getAcademyInfo();
    
    // 4. Obtener medios de pago disponibles
    const mediosPago = await getMediosPago();
    
    // 5. Contexto jerárquico CON PENSUM: info academia + medios pago + programas + grupos + temario detallado
    const hierarchicalContext = await buildHierarchicalContextWithPensum(programs, courses, detectedProgram, academy, mediosPago);

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
    const knowledgeChunks = await searchKnowledge(supabase, message, 3);

    // Construir directiva contextual por intención del usuario
    const contextualDirective = buildContextualDirective(message, detectedProgram, courses);

    // Construir prompt con contexto jerárquico
    const prompt = buildAgentPrompt(
      settings || {},
      message,
      knowledgeChunks,
      history,
      hierarchicalContext,
      contextualDirective
    );

    // Generar respuesta
    let response = await generateResponse(geminiKey, prompt);

    if (isRepetitiveResponse(response, history, message)) {
      console.warn("[anti-repeat] Respuesta muy parecida a la anterior. Regenerando...");
      const antiRepeatPrompt = `${prompt}

# ANTI-REPETICIÓN (OBLIGATORIO)
- Tu última respuesta fue muy parecida a una previa y eso NO está permitido.
- Responde específicamente a la NUEVA pregunta del usuario.
- NO repitas frases de cierre ni texto genérico ya usado.
- Mantén el formato, pero cambia el contenido con datos concretos del contexto actual.`;

      response = await generateResponse(geminiKey, antiRepeatPrompt);
    }

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(response, 1000);

    // Guardar en historiales (guardar la versión truncada)
    await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

    // Sanitizar respuesta para JSON válido
    const sanitizedResponse = sanitizeForJSON(truncatedResponse);
    
    // Limpiar markdown para WhatsApp (**texto** → *texto*)
    let whatsappResponse = cleanMarkdownForWhatsApp(sanitizedResponse);
    
    // Formatear precios con separador de mil
    whatsappResponse = formatPrices(whatsappResponse);
    
    // Remover la palabra COP de precios
    whatsappResponse = removeCOPCurrency(whatsappResponse);
    
    const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
    const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

    return NextResponse.json({
      ok: true,
      response: whatsappResponse || "",
      agent: sanitizedAgent || "Dany",
      knowledgeUsed: Boolean(knowledgeChunks.length > 0),
      historyLength: Number(history.length) || 0,
      programDetected: sanitizedProgram || null,
      rateLimitRemaining: Number(rateLimit.remaining) || 0,
    });
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
