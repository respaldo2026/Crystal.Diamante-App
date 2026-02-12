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

  let prompt = `${systemPrompt}

# Identidad
- Nombre: ${persona}
- Bio: ${bio}
- Estilo: ${style}

# Reglas
- Si no sabes algo con certeza, responde: "${fallback}"
- Usa el contexto de conocimiento si está disponible.
- Sé breve, claro y amable.
- No inventes datos.
- Recuerda el contexto de conversaciones anteriores.${alreadyGreeted ? "\n- YA HAS SALUDADO EN ESTA CONVERSACIÓN. No repitas saludos (no digas 'hola', 'buenos días', etc.). Ir directo al punto de forma natural y conversacional." : ""}
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
    const { message, phone } = body || {};

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
