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
  detectProgramFromMessage,
  buildHierarchicalContext,
  buildHierarchicalContextWithPensum,
  getAcademyInfo,
  getMediosPago
} from "@/utils/supabase/agent-courses";

export const dynamic = "force-dynamic";

/**
 * Marcar mensaje como leído en WhatsApp (doble check azul)
 */
async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const phoneNumberId = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken || !messageId) {
      console.warn("[markMessageAsRead] Configuración incompleta o messageId vacío");
      return false;
    }

    console.log(`[markMessageAsRead] Marcando mensaje ${messageId} como leído...`);

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[markMessageAsRead] Error ${response.status}: ${error}`);
      return false;
    }

    const result = await response.json();
    console.log("[markMessageAsRead] ✅ Mensaje marcado como leído (doble check azul)");
    return result.success === true;
  } catch (err) {
    console.error("[markMessageAsRead] Error:", err);
    return false;
  }
}

/**
 * Sanitizar texto para JSON válido
 * Solo remover caracteres de control problemáticos
 * JSON.stringify ya maneja escape de comillas, saltos de línea, etc.
 */
function sanitizeForJSON(text: string): string {
  if (!text) return '';
  // Solo remover caracteres de control problemáticos
  // JSON.stringify se encargará del resto
  return text
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
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
    /\b(cómo\s+(me\s+inscribo|hago\s+para\s+inscribirme|puedo\s+inscribirme))/i,
    /\b(dónde\s+(me\s+inscribo|puedo\s+inscribirme|pago))/i,
    /\b(cuándo\s+puedo\s+(empezar|iniciar|comenzar))/i,
    /\b(me\s+(interesa|gustaría|quiero)\s+(el\s+)?curso)/i,
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
  hierarchicalContext: string = ""
): string {
  const persona = settings?.persona_name || "Dany";
  const bio = settings?.persona_bio || "Asistente de la Academia Crystal.";
  const style = settings?.speaking_style || "Cálido y preciso.";
  const systemPrompt = settings?.system_prompt || "Eres un asistente útil.";
  const fallback = settings?.fallback_response || "Déjame confirmarlo y te respondo pronto.";
  
  // Detectar si ya hay un saludo previo
  const alreadyGreeted = hasGreetingInHistory(conversationHistory);
  
  // Detectar intención de compra/cierre
  const showsBuyingIntent = detectBuyingIntent(userMessage, conversationHistory);

  let prompt = `${systemPrompt}

# Identidad
- Nombre: ${persona}
- Bio: ${bio}
- Estilo: ${style}

# Reglas Generales
- Si no sabes algo con certeza, responde: "${fallback}"
- Usa el contexto de conocimiento si está disponible.
- Sé breve, claro y amable.
- No inventes datos.
- Recuerda el contexto de conversaciones anteriores.${alreadyGreeted ? "\n- YA HAS SALUDADO EN ESTA CONVERSACIÓN. No repitas saludos (no digas 'hola', 'buenos días', etc.). Ir directo al punto de forma natural y conversacional." : ""}

# PROTOCOLO DE CIERRE DE VENTAS 🎯
${showsBuyingIntent ? `
✅ DETECTADO: El usuario muestra INTENCIÓN DE COMPRA o está listo para inscribirse.

ACCIÓN OBLIGATORIA:
1. Confirma su interés de forma positiva
2. Menciona que un asesor de Admisiones lo guiará en el proceso de inscripción
3. Proporciona el número de contacto de Admisiones: **+57 301 203 8582** (WhatsApp)
4. Invítalo a escribir directamente para agendar su inscripción o visita

EJEMPLO DE CIERRE:
"¡Perfecto! Me encanta que estés listo para dar este paso. 🎓

Para finalizar tu inscripción y separar tu cupo, te pongo en contacto directo con nuestro equipo de Admisiones:

📱 WhatsApp: +57 301 203 8582

Escríbeles y te guiarán en el proceso de pago, te confirmarán tu grupo y responderán cualquier duda de último momento. ¡Nos vemos pronto en la academia! 💎✨"
` : `
⚠️ IMPORTANTE: NO proporciones el número de Admisiones AÚN.

El usuario aún está en fase de información. Ayúdale a:
- Conocer los cursos disponibles
- Entender costos (inscripción + mensualidad)
- Ver horarios de grupos disponibles
- Resolver dudas sobre el programa

Solo darás el número de contacto (+57 301 203 8582) cuando:
✓ Ya haya preguntado por precios
✓ Ya haya preguntado por horarios
✓ Muestre señales claras de querer inscribirse (ej: "quiero inscribirme", "cómo me inscribo", "dónde pago", "cuándo puedo empezar")
`}
`;

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

  prompt += `\n# Mensaje del usuario:\n${userMessage}\n\n# Tu respuesta (como ${persona}):`;

  return prompt;
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
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { message, phone, messageId } = body || {};

    // Marcar mensaje como leído inmediatamente (doble check azul)
    if (messageId) {
      markMessageAsRead(messageId).catch(err => 
        console.warn("[POST chat] Error al marcar como leído:", err)
      );
    }

    // Validar entrada del usuario
    const inputValidation = validateUserInput(message, 2000);
    if (!inputValidation.valid) {
      return NextResponse.json({ error: inputValidation.error }, { status: 400 });
    }

    // Verificar rate limit
    const rateLimit = checkRateLimit(phone || "unknown");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Por favor, espera un momento." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Faltan credenciales Supabase" }, { status: 500 });
    }
    if (!geminiKey) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY" }, { status: 500 });
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
    const detectedProgram = detectProgramFromMessage(message, programs);
    const courses = await getCoursesForQuery(message, programs);
    
    // 3. Obtener información de la academia (dirección, redes, contacto)
    const academy = await getAcademyInfo();
    
    // 4. Obtener medios de pago disponibles
    const mediosPago = await getMediosPago();
    
    // 5. Contexto jerárquico CON PENSUM: info academia + medios pago + programas + grupos + temario detallado
    const hierarchicalContext = await buildHierarchicalContextWithPensum(programs, courses, detectedProgram, academy, mediosPago);

    // Obtener conocimiento relevante
    const knowledgeChunks = await searchKnowledge(supabase, message, 3);

    // Construir prompt con contexto jerárquico
    const prompt = buildAgentPrompt(settings || {}, message, knowledgeChunks, history, hierarchicalContext);

    // Generar respuesta
    const response = await generateResponse(geminiKey, prompt);

    // Truncar respuesta si es muy larga (máx 1000 caracteres para chat)
    const truncatedResponse = truncateResponse(response, 1000);

    // Guardar en historiales (guardar la versión truncada)
    await saveConversation(supabase, phone || "unknown", message, truncatedResponse);

    // Sanitizar respuesta para JSON válido
    const sanitizedResponse = sanitizeForJSON(truncatedResponse);

    return NextResponse.json({
      ok: true,
      response: sanitizedResponse,
      agent: sanitizeForJSON(settings?.persona_name || "Dany"),
      knowledgeUsed: knowledgeChunks.length > 0,
      historyLength: history.length,
      programDetected: detectedProgram ? sanitizeForJSON(detectedProgram.nombre) : null,
      rateLimitRemaining: rateLimit.remaining,
    });
  } catch (error: any) {
    console.error("Error en /api/ai/chat:", error);
    return NextResponse.json(
      { error: error?.message || "Error generando respuesta" },
      { status: 500 }
    );
  }
}
