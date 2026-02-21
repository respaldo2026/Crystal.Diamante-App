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

/**
 * Extraer URLs de imágenes ya enviadas en el historial reciente.
 * El marcador en el historial tiene el formato: [📷 URL|caption]
 * Se usa para no repetir la misma imagen en respuestas consecutivas.
 */
function extractSentImageUrlsFromHistory(
  conversationHistory: Array<{user: string, agent: string, created_at?: string | null}>
): string[] {
  const urls: string[] = [];
  // Patrón: [📷 <url>|<caption>]
  const pattern = /\[📷\s+([^\|]+)\|/g;
  for (const msg of conversationHistory) {
    const text = String(msg.agent || "");
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

function detectUserIntent(message: string): "precio" | "horario" | "temario" | "materiales" | "inscripcion" | "requisitos" | "general" {
  const text = normalizeForMatch(message);
  const hasPriceIntent = /\b(precio|precios|costo|costos|cuanto|vale|valor|valores|mensualidad|mensualidades|inscripcion|inscripciones|cuota|cuotas|inversion)\b/i.test(text) || /\b(se paga|cada mes|al mes|mes a mes|paga)\b/i.test(text);
  const hasScheduleIntent = /\b(horario|hora|dias|dia|fecha|cuando\s+inicia|inicio|arranca|empieza|grupo|cupo|cupos|disponible|hoy\s+hay\s+clase|hay\s+clase\s+hoy|tengo\s+clase\s+hoy)\b/i.test(text);
  const hasStrongScheduleIntent = /\b(cuando|inicio|arranca|empieza|fecha|horario|hora)\b/i.test(text);
  const hasMaterialsKeyword = /\b(material|materiales|insumo|insumos|herramienta|herramientas|kit|kits|implementos|lista\s+de\s+materiales|que\s+traer|que\s+llevar|que\s+tienen\s+los)\b/i.test(text);
  // "llevar" solo cuenta como requisito si NO hay keyword de materiales (evitar que "llevar materiales" sea requisito)
  const hasRequirementsIntent = /\b(requisito|requisitos|edad|anos|menor|mayor|cedula|documento|necesito|experiencia|conocimiento)\b/i.test(text)
    || (!hasMaterialsKeyword && /\b(llevar)\b/i.test(text));

  if (hasRequirementsIntent && !hasMaterialsKeyword) {
    return "requisitos";
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

function isShortAffirmativeReply(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;

  const words = text.split(" ").filter(Boolean);
  if (words.length > 4) return false;

  if (/^s+i+$/i.test(text)) return true;
  if (/^s+i+p+$/i.test(text)) return true;

  return /^(si|dale|ok|okay|claro|listo|perfecto|de una|por favor|si por favor|claro que si|clase|ciclo|ambos|los dos)$/i.test(text);
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

  // Inferir por la última pregunta específica del agente
  if (normalizedQuestion) {
    if (/\b(referencia|como llegar|llegar mas facil|indicaciones|llegar alli)\b/i.test(normalizedQuestion)) return "quiero la referencia para llegar";
    if (/\b(validar|confirmar|grupo|horario|queda bien|otro horario|mostrar otra opcion)\b/i.test(normalizedQuestion)) return "quiero confirmar el horario y grupo";
    if (/\b(separar cupo|reservar|inscribir|matricular|avanzar con el cupo)\b/i.test(normalizedQuestion)) return "quiero inscribirme y separar cupo";
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
  if (/\b(cupo|cupos|disponible|disponibles)\b/i.test(normalized)) return "quiero saber si hay cupos disponibles";
  if (/\b(proximo grupo|siguiente grupo|proximo curso|fecha confirmada|por confirmar)\b/i.test(normalized)) return "quiero saber el proximo grupo y su fecha";
  if (/\b(materiales|material|insumo|kit|por clase o por ciclo)\b/i.test(normalized)) return "quiero saber materiales";
  if (/\b(temario|contenido|modulo|modulos|ciclo)\b/i.test(normalized)) return "quiero saber el temario";
  if (/\b(horario|dias|dia|hora)\b/i.test(normalized)) return "quiero saber dias y horario";
  if (/\b(inscripcion|inscribirme|admisiones|matricula|matricularme|pago)\b/i.test(normalized)) return "quiero saber como me inscribo";
  if (/\b(inversion|mensualidad|precio|costa|valor)\b/i.test(normalized)) return "quiero saber la inversion";

  return "";
}

function enrichMessageWithFollowUpContext(
  userMessage: string,
  history: Array<{ user: string; agent: string }>
): string {
  if (!isShortAffirmativeReply(userMessage)) {
    return userMessage;
  }

  const pendingTopic = inferPendingTopicFromHistory(history);
  if (!pendingTopic) {
    return userMessage;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateLong(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

function buildNameSafetyDirective(preferredName: string | null): string {
  return preferredName
    ? `NOMBRE VALIDADO DEL USUARIO: "${preferredName}". Si lo mencionas, usa SOLO ese nombre exacto.`
    : 'No hay nombre validado del usuario. NO inventes ni asumas nombres propios; responde sin llamar por nombre.';
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

function isDurationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(cuanto dura|duracion|duracion del curso|meses|cuantas clases|cuantas sesiones|tiempo del curso)\b/i.test(text);
}

function isFastTrackQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(mas rapido|más rapido|rapido|rápido|perfeccionamiento|intensivo|avanzado|express|acelerado)\b/i.test(text);
}

function isLocationQuestion(message: string): boolean {
  const text = normalizeForMatch(message);
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
  return /\b(red|redes|redes sociales|instagram|insta|facebook|face|youtube|tiktok|tik tok|ig|perfil|perfiles|siguelos|siguenos|tienen redes|tienes redes)\b/i.test(text);
}

function isThanksOnlyMessage(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  return /^(gracias|muchas gracias|ok gracias|okk gracias|okei gracias|vale gracias|super gracias|listo gracias|gracias de una|gracias por la info)$/.test(text);
}

function isPureGreeting(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  // Solo es saludo si el mensaje COMPLETO es un saludo (máx 5 palabras, sin preguntas de fondo)
  const words = text.split(" ").filter(Boolean);
  if (words.length > 5) return false;
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|saludos|buen dia|buenas a todos|holi|holaa|holas|buenas!|hola!|que tal|buen dia)$/.test(text);
}

function isCourseInfoRequest(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\b(informacion del curso|quiero informacion|quiero info|dame informacion|cuentame del curso|sobre el curso|curso de)\b/i.test(text);
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

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const key = normalizeForMatch(segment);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
    if (typeof maxItems === "number" && maxItems > 0 && unique.length >= maxItems) break;
  }

  return unique;
}

function buildInstagramFollowup(academy: any | null): string {
  const ig = String(academy?.instagram || "").trim();
  const fb = String(academy?.facebook || "").trim();

  const links: string[] = [];
  if (ig) {
    links.push(`📸 Instagram: ${/^https?:\/\//i.test(ig) ? ig : `https://${ig}`}`);
  }
  if (fb) {
    links.push(`👤 Facebook: ${/^https?:\/\//i.test(fb) ? fb : `https://${fb}`}`);
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

function buildSocialMediaReply(academy: any | null): string {
  const ig = String(academy?.instagram || "").trim();
  const fb = String(academy?.facebook || "").trim();
  const yt = String(academy?.youtube || "").trim();
  const wa = String(academy?.whatsapp || "").trim();
  const phone = String(academy?.telefono || "").trim();

  const lines: string[] = [];
  if (ig) lines.push(`📸 Instagram: ${/^https?:\/\//i.test(ig) ? ig : `https://${ig}`}`);
  if (fb) lines.push(`👤 Facebook: ${/^https?:\/\//i.test(fb) ? fb : `https://${fb}`}`);
  if (yt) lines.push(`🎥 YouTube: ${/^https?:\/\//i.test(yt) ? yt : `https://${yt}`}`);
  if (wa) lines.push(`💬 WhatsApp: ${wa}`);
  if (phone) lines.push(`📞 Teléfono: ${phone}`);

  if (!lines.length) {
    return "¡Sí! 🙌 Te comparto nuestras redes en un momento. Si prefieres, también te atiendo por WhatsApp para ayudarte de inmediato.";
  }

  return `¡Sí, claro! 🙌 Estas son nuestras redes y canales de contacto:\n\n${lines.join("\n")}\n\nSi quieres, también te recomiendo por cuál canal te responden más rápido.`;
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
  programs: any[] = []
): string | null {
  if (isThanksOnlyMessage(message)) {
    return `Con gusto 😊 Cuando quieras, te ayudo con lo que necesites del curso.${buildInstagramFollowup(academy)}`;
  }

  if (isPureGreeting(message)) {
    const hour = getColombiaNowDate().getHours();
    const greeting = getTimeSlotGreeting(hour);
    const alreadyGreeted = history.length > 0;
    if (alreadyGreeted) {
      return `${greeting} 😊 ¿En qué te puedo ayudar?`;
    }
    const academyName = academy?.nombre || "Academia Crystal Diamante";
    return `${greeting}, bienvenid@ a *${academyName}* 💎\n\n¿En qué te puedo ayudar hoy? Puedo contarte sobre nuestros cursos, fechas de inicio, precios e inscripciones 🙌`;
  }

  let intent = detectUserIntent(message);
  const asksDuration = isDurationQuestion(message);
  const asksFastTrack = isFastTrackQuestion(message);
  let asksLocation = isLocationQuestion(message);
  const asksSocialMedia = isSocialMediaQuestion(message);
  const asksGeneralInfo = isCourseInfoRequest(message);

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

  if (intent === "requisitos") {
    return null; // Dejar que Gemini responda sobre requisitos, edad, etc.
  }

  if (asksLocation) {
    if (academy?.direccion) {
      return `Estamos ubicados en ${academy.direccion}. ¿Quieres que también te comparta la referencia para llegar más fácil?`;
    }
    return "Te comparto la ubicación exacta por aquí en un momento. ¿Quieres que también te envíe el WhatsApp de admisiones?";
  }

  if (asksSocialMedia) {
    return buildSocialMediaReply(academy);
  }

  // Preguntas sobre medios de pago (nequi, presencial, etc.) → dejar que Gemini responda con info real
  if (isPaymentMethodQuestion(message)) {
    return null;
  }

  // Preguntas sobre cupos → responder con datos reales de la DB
  if (isCuposQuestion(message)) {
    return buildCuposReply(detectedProgram, courses, programs);
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
    const highlights = extractTemarioHighlights(detectedProgram?.contenido || "");
    if (highlights.length > 0) {
      const totalCycles = highlights.length;
      const explicitClasses = Number(detectedProgram?.total_clases ?? 0);
      const totalClasses = explicitClasses > 0 ? explicitClasses : totalCycles * 4;
      const lines = highlights.map((item, index) => `🔹 *Ciclo ${index + 1}:* ${item}`).join("\n");
      return `📚 *Temario de ${detectedProgram.nombre}*\n\n🧩 Este programa tiene *${totalCycles} ciclos* y *${totalClasses} clases*.\n✨ Trataremos:\n${lines}\n\n💸 ¿Quieres conocer el precio de la inscripción y mensualidad?`;
    }

    return `📚 *Temario de ${detectedProgram.nombre}*\n\nTe comparto el contenido por *ciclos* de forma breve para que sea fácil de leer.\n\n¿Quieres conocer el precio de la inscripción y mensualidad?`;
  }

  if (intent === "precio") {
    const inscripcion = Number(detectedProgram?.precio_inscripcion ?? primaryCourse?.precio_inscripcion ?? 0);
    const mensualidad = Number(detectedProgram?.precio_mensualidad ?? primaryCourse?.precio_mensualidad ?? 0);
    const insText = inscripcion > 0 ? formatCurrencyCOP(inscripcion) : "Por confirmar";
    const menText = mensualidad > 0 ? formatCurrencyCOP(mensualidad) : "Por confirmar";

    const inscriptionIncludes = "Incluye: Camiseta, Certificado, Ceremonia de grado y alquiler de toga";
    const monthlyIncludes = "Incluye: Cada mes te damos kit de productos";

    const normalizedMessage = normalizeForMatch(message);
    const asksMonthlyConfirmation = /\b(cada mes|se paga|al mes|mensualidad|mensual)\b/i.test(normalizedMessage);
    const asksWhatIsIncluded = /\b(que incluye|incluye|trae|viene con)\b/i.test(normalizedMessage);

    if (asksWhatIsIncluded) {
      return null; // Dejar que Gemini responda qué incluye la mensualidad o inscripción
    }

    if (asksMonthlyConfirmation) {
      return `✅ Sí, la *mensualidad* es ${menText}.\n🧴 *Cada mes te damos kit de productos.*\n\n¿Quieres que te comparta también los *medios de pago* y las *fechas de pago*?`;
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

    return `💸 *Inversión de ${detectedProgram.nombre}:*\n\n💰 *Inscripción:* ${insText}\n🎁 ${inscriptionIncludes}\n\n💰 *Mensualidad:* ${menText}\n🧴 ${monthlyIncludes}\n\n${nextStepPrompt}`;
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

  const mentionsProgram = Boolean(detectProgramFromMessage(userMessage, programs));
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

  if (hasProgramCorrectionSignal(userMessage)) {
    return null;
  }

  const isLikelyFollowUp = isShortAffirmativeReply(userMessage)
    || /\b(ese|esa|ese\s+curso|esa\s+carrera|horario|precio|cuanto|cuando|inscripcion|mensualidad|cupos|duracion|inversion|temario|materiales|ubicacion|direccion|donde)\b/i.test(
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
    asksNextGroup
      ? 'CASO ESPECIAL: Si pregunta por "otro curso" o "próximo grupo", NO envíes ficha comercial completa. Responde corto, natural y humano: 1) reconoce que el grupo actual puede ir avanzado, 2) da fecha/horario solo si están confirmados, 3) si no hay fecha, dilo claramente sin rodeos, 4) cierra con una sola pregunta de seguimiento.'
      : 'Mantén el enfoque en resolver la pregunta puntual sin sobrecargar con información no solicitada.',
    'REGLA DE ORO: 1 intención del usuario = 1 bloque corto de respuesta. No mezcles precio+duración+beneficios+temario en el mismo mensaje salvo que el usuario lo pida.',
    'Si hay objeción, estructura la respuesta en: 1) Empatía breve, 2) Dato concreto del curso, 3) Propuesta clara, 4) CTA corta.',
    'Prohibido responder con: "¿En qué curso estás interesado?" cuando el usuario ya mencionó un curso o tema específico.',
    noRepeatRule
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
    const effectiveMessage = enrichMessageWithFollowUpContext(message, history);
    const preferredStudentName = resolvePreferredStudentName(message, history);
    const detectedIntent = detectUserIntent(effectiveMessage);
    let mediaSuggestion: Awaited<ReturnType<typeof getAgentImageSuggestion>> = null;

    const linkAccessResponse = await buildLinkAccessDirectResponse(supabase, message, history);
    if (linkAccessResponse) {
      const fallbackResponse = settings?.fallback_response || "Déjame confirmarlo y te respondo en breve.";
      const cleanedResponse = sanitizeAgentVisibleResponse(linkAccessResponse, fallbackResponse);
      const truncatedResponse = truncateResponse(cleanedResponse, 1000);
      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null)); // TEMPORAL: Desactivado hasta arreglar Router de Make
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
      await saveConversation(supabase, phone || "unknown", message, truncatedNotFound);

      const sanitizedResponse = sanitizeForJSON(truncatedNotFound);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizeForJSON(settings?.persona_name || "Dany") || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null)); // TEMPORAL: Desactivado hasta arreglar Router de Make
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

    // Anular imagen si es el primer mensaje de la conversación (saludo inicial)
    // o si el mensaje original es un saludo / afirmación corta ("si", "ok", "dale", etc.)
    if (mediaSuggestion) {
      const isFirstInteraction = history.length === 0;
      const trimmedOriginal = (message || "").trim();
      const isGreetingOrShortInput = /^(hola|hi|hey|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|hello|holi|s[ií]p?|ok|okay|dale|listo|claro|perfecto|de\s+una|bien|ya|sip|genial|excelente|entendido|gracias|chao|bye)[\s!.?]*$/i.test(trimmedOriginal)
        || trimmedOriginal.split(/\s+/).filter(Boolean).length <= 1;
      if (isFirstInteraction || isGreetingOrShortInput) {
        mediaSuggestion = null;
      }
    }

    const directStudentResponse = buildStudentDirectResponse(effectiveMessage, studentContext);
    if (directStudentResponse) {
      const truncatedResponse = truncateResponse(directStudentResponse, 1000);

      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    if (shouldUseTodayClassDirectResponse(effectiveMessage, detectedProgram, programs, history)) {
      const directResponse = buildTodayClassDirectResponse(detectedProgram, courses, new Date());
      const truncatedResponse = truncateResponse(directResponse, 1000);

      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }

    if (shouldUseNextGroupDirectResponse(effectiveMessage, detectedProgram, programs, history)) {
      const directResponse = buildNextGroupDirectResponse(detectedProgram, courses, new Date());
      const truncatedResponse = truncateResponse(directResponse, 1000);

      await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
      const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizedAgent || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: sanitizedProgram || null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, null)); // TEMPORAL: Desactivado hasta arreglar Router de Make
    }
    
    // 3. Obtener información de la academia (dirección, redes, contacto)
    const academy = await getAcademyInfo();

    let directIntentResponse = buildIntentFocusedDirectResponse(effectiveMessage, detectedProgram, courses, academy, history, programs);
    if (directIntentResponse && isRepetitiveResponse(directIntentResponse, history, effectiveMessage)) {
      const pendingTopic = inferPendingTopicFromHistory(history);
      if (pendingTopic) {
        const retriedDirectResponse = buildIntentFocusedDirectResponse(
          `${effectiveMessage}. ${pendingTopic}.`,
          detectedProgram,
          courses,
          academy,
          history,
          programs
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
          programs
        );

        if (forcedProgressResponse) {
          directIntentResponse = forcedProgressResponse;
        }
      }
    }

    if (directIntentResponse) {
      const truncatedResponse = truncateResponse(directIntentResponse, 1000);
      const activeMedia = detectedProgram ? mediaSuggestion : null;
      const responseToSave = activeMedia
        ? `[📷 ${activeMedia.mediaUrl}|${activeMedia.caption}]\n${truncatedResponse}`
        : truncatedResponse;

      await saveConversation(supabase, phone || "unknown", message, responseToSave);

      const sanitizedResponse = sanitizeForJSON(truncatedResponse);
      const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);

      return NextResponse.json(withMediaSuggestion({
        ok: true,
        response: whatsappResponse || "",
        agent: sanitizeForJSON(settings?.persona_name || "Dany") || "Dany",
        knowledgeUsed: false,
        historyLength: Number(history.length) || 0,
        programDetected: detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : null,
        rateLimitRemaining: Number(rateLimit.remaining) || 0,
      }, detectedProgram ? mediaSuggestion : null));
    }
    
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
    const knowledgeChunks = await searchKnowledge(supabase, effectiveMessage, 3);

    // Construir directiva contextual por intención del usuario
    const studentDirective = studentContext
      ? 'Existe contexto de estudiante validado por identificación. Prioriza responder con sus cursos inscritos, su próxima clase y su estado real de pagos antes de información general.'
      : '';
    const contextualDirective = [
      buildContextualDirective(effectiveMessage, detectedProgram, courses, history),
      buildNameSafetyDirective(preferredStudentName),
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
      contextualDirective
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

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(cleanedAgentResponse, 1000);

    // Guardar en historiales — incluir marcador de imagen si aplica
    const activeMediaFinal = detectedProgram ? mediaSuggestion : null;
    const responseToSaveFinal = activeMediaFinal
      ? `[📷 ${activeMediaFinal.mediaUrl}|${activeMediaFinal.caption}]\n${truncatedResponse}`
      : truncatedResponse;
    await saveConversation(supabase, phone || "unknown", message, responseToSaveFinal);

    // Sanitizar respuesta para JSON válido
    const sanitizedResponse = sanitizeForJSON(truncatedResponse);
    
    // Limpiar markdown para WhatsApp (**texto** → *texto*)
    const whatsappResponse = formatFinalWhatsAppResponse(sanitizedResponse);
    
    const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
    const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

    return NextResponse.json(withMediaSuggestion({
      ok: true,
      response: whatsappResponse || "",
      agent: sanitizedAgent || "Dany",
      knowledgeUsed: Boolean(knowledgeChunks.length > 0),
      historyLength: Number(history.length) || 0,
      programDetected: sanitizedProgram || null,
      rateLimitRemaining: Number(rateLimit.remaining) || 0,
    }, detectedProgram ? mediaSuggestion : null));
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
