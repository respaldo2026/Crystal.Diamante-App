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
  getMediosPago,
  getStudentContextByIdentification
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

  const sentences = singleLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [singleLine];
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

  let output = String(rawText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

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
): Promise<Array<{user: string, agent: string, created_at?: string | null}>> {
  try {
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("user_message, agent_response, created_at")
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
      created_at: row.created_at,
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

  const nowInColombia = getColombiaNowDate();
  const expectedSlotGreeting = getTimeSlotGreeting(nowInColombia.getHours());

  const greetingRule = alreadyGreeted
    ? `⚠️ YA SALUDASTE HOY (${expectedSlotGreeting}). Ve directo a la respuesta. PROHIBIDO repetir saludos en este mismo día.`
    : greeting
    ? `Saluda SOLO UNA VEZ por día y usa una franja horaria coherente (${expectedSlotGreeting}). Si vas a saludar, usa este saludo base: "${greeting}". Después del primer saludo del día, responde sin volver a saludar.`
    : `Saluda SOLO UNA VEZ por día con franja horaria coherente (${expectedSlotGreeting}). Después del primer saludo del día, responde sin volver a saludar.`;

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
  if (/\b(horario|hora|dias|dia|fecha|cuando\s+inicia|inicio|arranca|empieza|grupo|hoy\s+hay\s+clase|hay\s+clase\s+hoy|tengo\s+clase\s+hoy)\b/i.test(text)) {
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

  const tokenCount = text.split(" ").filter(Boolean).length;
  if (tokenCount > 4) return false;

  return !/\b(precio|horario|hora|material|temario|inscrip|matricul|pago|cuanto|cuando|donde)\b/i.test(text);
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrencyCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
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
  return /\b(cuanto debo|deuda|saldo pendiente|mensualidad|proxima mensualidad|proximo pago|cuando debo pagar|proxima clase|siguiente clase|hoy hay clase|inscrita|inscrito|mis cursos|materiales)\b/i.test(text);
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

  const directId = extractIdentificationFromText(userMessage) || extractIdentificationLoose(userMessage);
  const shouldTryIdentification = Boolean(directId && (isLinkIntent || hasLinkContext));

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

function shouldUseTodayClassDirectResponse(
  userMessage: string,
  detectedProgram: any | null,
  programs: any[],
  history: Array<{ user: string; agent: string }>
): boolean {
  if (isTodayClassQuestion(userMessage)) return true;

  const mentionsProgram = Boolean(detectProgramFromMessage(userMessage, programs));
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

    const linkAccessResponse = await buildLinkAccessDirectResponse(supabase, message, history);
    if (linkAccessResponse) {
      const fallbackResponse = settings?.fallback_response || "Déjame confirmarlo y te respondo en breve.";
      const cleanedResponse = sanitizeAgentVisibleResponse(linkAccessResponse, fallbackResponse);
      const truncatedResponse = truncateResponse(cleanedResponse, 1000);
      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      let whatsappResponse = cleanMarkdownForWhatsApp(sanitizedResponse);
      whatsappResponse = formatPrices(whatsappResponse);
      whatsappResponse = removeCOPCurrency(whatsappResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      return NextResponse.json({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      });
    }

    // INFORMACIÓN JERÁRQUICA
    // 1. Obtener todos los programas (información primaria)
    const programs = await getProgramsForAgent();

    const studentIdentification = resolveStudentIdentification(message, history);
    const studentContext = studentIdentification
      ? await getStudentContextByIdentification(studentIdentification)
      : null;

    if (studentIdentification && !studentContext && hasStudentAccountIntent(message)) {
      const notFoundResponse = `No encontré una estudiante con identificación ${studentIdentification}. Verifica el número de cédula y me lo vuelves a enviar.`;
      const truncatedNotFound = truncateResponse(notFoundResponse, 1000);
      await saveConversation(supabase, phone || "unknown", message, truncatedNotFound);

      const sanitizedResponse = sanitizeForJSON(truncatedNotFound);
      let whatsappResponse = cleanMarkdownForWhatsApp(sanitizedResponse);
      whatsappResponse = formatPrices(whatsappResponse);
      whatsappResponse = removeCOPCurrency(whatsappResponse);

      return NextResponse.json({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizeForJSON(settings?.persona_name || "Dany") || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      });
    }

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

    if (!detectedProgram && studentContext?.enrolledProgramIds?.length === 1) {
      const inferredFromStudent = programs.find((p) => Number(p.id) === Number(studentContext.enrolledProgramIds[0])) || null;
      if (inferredFromStudent) {
        detectedProgram = inferredFromStudent;
        courses = await getCoursesByProgram(inferredFromStudent.id);
      }
    }

    const directStudentResponse = buildStudentDirectResponse(message, studentContext);
    if (directStudentResponse) {
      const truncatedResponse = truncateResponse(directStudentResponse, 1000);

      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      let whatsappResponse = cleanMarkdownForWhatsApp(sanitizedResponse);
      whatsappResponse = formatPrices(whatsappResponse);
      whatsappResponse = removeCOPCurrency(whatsappResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      });
    }

    if (shouldUseTodayClassDirectResponse(message, detectedProgram, programs, history)) {
      const directResponse = buildTodayClassDirectResponse(detectedProgram, courses, new Date());
      const truncatedResponse = truncateResponse(directResponse, 1000);

      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      let whatsappResponse = cleanMarkdownForWhatsApp(sanitizedResponse);
      whatsappResponse = formatPrices(whatsappResponse);
      whatsappResponse = removeCOPCurrency(whatsappResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      });
    }
    
    // 3. Obtener información de la academia (dirección, redes, contacto)
    const academy = await getAcademyInfo();
    
    // 4. Obtener medios de pago disponibles
    const mediosPago = await getMediosPago();
    
    // 5. Contexto jerárquico CON PENSUM: info academia + medios pago + programas + grupos + temario detallado
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
    const knowledgeChunks = await searchKnowledge(supabase, message, 3);

    // Construir directiva contextual por intención del usuario
    const studentDirective = studentContext
      ? 'Existe contexto de estudiante validado por identificación. Prioriza responder con sus cursos inscritos, su próxima clase y su estado real de pagos antes de información general.'
      : '';
    const contextualDirective = [buildContextualDirective(message, detectedProgram, courses), studentDirective]
      .filter(Boolean)
      .join('\n');

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

    const fallbackResponse = settings?.fallback_response || "Déjame confirmarlo y te respondo en breve.";
    const cleanedAgentResponse = stripRepeatedGreetingPrefix(
      sanitizeAgentVisibleResponse(response, fallbackResponse),
      hasGreetingInHistory(history)
    );

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(cleanedAgentResponse, 1000);

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
