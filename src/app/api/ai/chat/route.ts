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
  
  // Convertir a string si no lo es
  const str = String(text);
  
  // Remover caracteres de control y reemplazar saltos de línea
  return str
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remover caracteres de control
    .replace(/[\r\n]+/g, ' ')  // Reemplazar saltos de línea reales con espacios
    .replace(/\s+/g, ' ')  // Normalizar múltiples espacios a uno solo
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
  if (text.length <= maxLength) {
    return text;
  }
  
  // Buscar último punto/pregunta antes del límite
  const truncated = text.substring(0, maxLength);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!')
  );
  
  if (lastPeriod > maxLength * 0.7) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  return truncated + '...';
}

function validateRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.WHATSAPP_API_KEY;
  if (apiKey && apiKey === expectedKey) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.includes("Bearer")) return true;

  return false;
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
  const fallback = settings?.fallback_response || "Para darte el dato exacto, voy a consultar con el Director y te confirmo de inmediato";
  
  // Detectar si ya hay un saludo previo
  const alreadyGreeted = hasGreetingInHistory(conversationHistory);
  
  // Detectar intención de compra/cierre
  const showsBuyingIntent = detectBuyingIntent(userMessage, conversationHistory);

  let prompt = `# System Prompt: Agente ${persona} (v3.0 - Optimizado para Lectura Rápida)

## Identidad
Eres ${persona}, ${bio}. Tu misión es convertir interesados en estudiantes mediante una comunicación clara, estructurada y motivadora.

## 1. Reglas de Oro de Interacción

**Memoria de Saludo:** ${alreadyGreeted ? '⚠️ YA HAS SALUDADO EN ESTA CONVERSACIÓN. Ve directo a la respuesta. PROHIBIDO repetir "Hola" o saludos de cortesía. Sé natural y conversacional.' : 'Saluda SOLO UNA VEZ al inicio del contacto. Si el usuario ya habló contigo, ve directo a la respuesta.'}

**Estilo Visual (WhatsApp Friendly):**
• Usa espacios en blanco (doble salto de línea) para separar bloques de información
• Usa viñetas para listas
• Usa negrilla exclusivamente para: **Precios**, **Fechas**, **Horarios** y **Nombres de Cursos**

**Restricción de Precios:** No des el valor total del curso a menos que el usuario lo pida explícitamente. Enfócate siempre en: **Valor de Inscripción** y **Valor de la Mensualidad**.

**Datos Faltantes:** Si no aparece en el sistema, di: "${fallback}"

## 2. Estructura de Bloques (Orden de Respuesta)

Cuando entregues información de un curso, sepárala siempre en estos bloques:

**Bloque 1 - Presentación del Curso:**
Nombre del curso y duración (Ej: 5 meses / 20 clases).

**Bloque 2 - Fechas y Horarios:**
🗓️ **Próximo Inicio:** [Fecha]
📅 **Días:** [Lunes/Martes/etc]
⏰ **Horario:** [Hora inicio - Hora fin]

**Bloque 3 - Inversión:**
💰 **Inscripción:** $[valor]
💰 **Mensualidad:** $[valor]

**Bloque 4 - Temario (breve lista):**
📚 **¿Qué aprenderás?**
• [Tema 1]
• [Tema 2]
• [Tema 3]

**Bloque 5 - Beneficios Adicionales:**
🎁 **Beneficios Especiales:**
✅ [Kit/Uniforme/etc]
✅ [Certificación]

**Bloque 6 - Cierre (CTA):**
Pregunta estratégica para visita o inscripción.

## 3. Manejo de Datos (Supabase / App)

• **Estático:** Duración, clases, horas por clase, temario, beneficios
• **Dinámico:** Cupos, fechas de inicio, días y horas
• **Falta de datos:** "${fallback}"

⚠️ **NUNCA inventes información.** Solo usa información que esté EXPLÍCITAMENTE en el contexto jerárquico proporcionado abajo.

## 4. PROTOCOLO DE CIERRE DE VENTAS 🎯

${showsBuyingIntent ? `
✅ **DETECTADO: El usuario muestra INTENCIÓN DE COMPRA**

**ACCIÓN OBLIGATORIA:**
1. Confirma su interés de forma positiva y motivadora
2. Proporciona el número de Admisiones: **+57 301 203 8582** (WhatsApp)
3. Invítalo a escribir para agendar inscripción o visita

**EJEMPLO DE CIERRE:**
"¡Perfecto! Me encanta que estés listo para convertirte en profesional. 🎓

Para finalizar tu inscripción y reservar tu cupo, escribe directamente a nuestro equipo de Admisiones:

📱 **WhatsApp Admisiones: +57 301 203 8582**

Ellos te guiarán en el proceso de pago, confirmarán tu grupo y resolverán cualquier duda. ¡Nos vemos pronto en la academia! 💎✨"
` : `
⚠️ **FASE DE INFORMACIÓN** - NO proporciones el número de Admisiones aún.

Ayuda al usuario a conocer:
• Cursos disponibles
• Costos (inscripción + mensualidad)
• Horarios de grupos disponibles
• Beneficios del programa

**Solo darás el número de contacto (+57 301 203 8582) cuando:**
✓ Ya haya preguntado por precios
✓ Ya haya preguntado por horarios
✓ Muestre señales claras: "quiero inscribirme", "cómo me inscribo", "dónde pago", "cuándo puedo empezar"
`}

## 5. Restricciones de Contenido

⚠️ Solo usa información del contexto jerárquico abajo
⚠️ Si un curso/grupo NO aparece en el contexto, di que no está disponible actualmente
⚠️ No inventes horarios, precios, fechas o nombres de cursos
⚠️ Si el usuario ya pidió un curso específico (ej: "curso de uñas"), NO respondas con "¿en qué curso estás interesado?".
⚠️ En ese caso, responde DIRECTO con la información del curso solicitado usando los bloques requeridos.
`;

  if (contextualDirective) {
    prompt += `\n\n## 6. Contexto de intención del usuario (OBLIGATORIO)\n${contextualDirective}\n`;
  }

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

  prompt += `\n# 🎯 INSTRUCCIÓN DE RESPUESTA:
Responde SOLO con información explícita del contexto anterior (programas, grupos, horarios, precios).
Si el usuario pregunta por un curso/programa que NO está listado arriba, responde: "Actualmente no tengo ese programa disponible. Puedo ofrecerte información sobre [listar programas disponibles]."
NO inventes horarios, precios ni fechas que no estén en el contexto.
`;

  prompt += `\n# Mensaje del usuario:\n${userMessage}\n\n# Tu respuesta (como ${persona}):`;

  return prompt;
}

function detectUserIntent(message: string): "precio" | "horario" | "temario" | "inscripcion" | "general" {
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
  if (/\b(inscrib|matricul|pago|admisiones|contacto|numero|whatsapp|separar\s+cupo)\b/i.test(text)) {
    return "inscripcion";
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

    const body = await req.json();
    const { message, phone } = body || {};

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

    // Obtener historial
    const history = await getConversationHistory(supabase, phone || "unknown", 5);

    // INFORMACIÓN JERÁRQUICA
    // 1. Obtener todos los programas (información primaria)
    const programs = await getProgramsForAgent();

    // 2. Obtener cursos basado en lo que pregunta (si menciona programa)
    const detectedProgram = resolveProgramFromContext(message, programs, history);
    const courses = detectedProgram
      ? await getCoursesByProgram(detectedProgram.id)
      : await getCoursesForQuery(message, programs);
    
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
    const response = await generateResponse(geminiKey, prompt);

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(response, 1000);

    // Guardar en historiales (guardar la versión truncada)
    await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

    // Sanitizar respuesta para JSON válido
    const sanitizedResponse = sanitizeForJSON(truncatedResponse);
    const sanitizedAgent = sanitizeForJSON(settings?.persona_name || "Dany");
    const sanitizedProgram = detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : "";

    return NextResponse.json({
      ok: true,
      response: sanitizedResponse || "",
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
