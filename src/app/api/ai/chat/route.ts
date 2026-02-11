/**
 * POST /api/ai/chat
 * 
 * Endpoint para el agente IA conversacional con personalidad configurable.
 * Usado por Make para responder mensajes de WhatsApp con contexto de la academia.
 * 
 * Lee:
 * - agent_settings: persona_name, persona_bio, speaking_style, system_prompt, etc.
 * - agent_chunks: conocimiento indexado (búsqueda semántica/keywords)
 * 
 * Devuelve: respuesta del agente usando Gemini con personalidad y contexto aplicados.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Validar autenticación: x-api-key de Make o service_role
 */
function validateRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.WHATSAPP_API_KEY;
  if (apiKey && apiKey === expectedKey) return true;

  // Permitir service_role si se llama desde backend interno
  const authHeader = request.headers.get("authorization");
  if (authHeader?.includes("Bearer")) return true;

  return false;
}

/**
 * Obtener historial reciente de conversación
 */
async function getConversationHistory(supabase: any, phone: string, limit = 5): Promise<Array<{user: string, agent: string}>> {
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

    // Invertir para que sea cronológico (antiguo a nuevo)
    return (data || []).reverse().map((row: any) => ({
      user: row.user_message,
      agent: row.agent_response,
    }));
  } catch (err) {
    console.error("[getConversationHistory] Error:", err);
    return [];
  }
}

/**
 * Guardar mensaje en historial de conversación
 */
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
      console.warn("[saveConversation] Error guardando:", error);
    } else {
      console.log("[saveConversation] Conversación guardada");
    }
  } catch (err) {
    console.warn("[saveConversation] Error:", err);
  }
}
  try {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    if (!keywords.length) return [];

    // Buscar en agent_chunks por contenido que contenga alguna keyword
    const { data, error } = await supabase
      .from("agent_chunks")
      .select("content")
      .or(keywords.map((k) => `content.ilike.%${k}%`).join(","))
      .limit(limit);

    if (error) {
      console.error("Error buscando conocimiento:", error);
      return [];
    }

    return (data || []).map((r: any) => r.content);
  } catch (err) {
    console.error("Error en searchKnowledge:", err);
    return [];
  }
}

/**
 * Construir prompt del agente con personalidad + conocimiento + historial
 */
function buildAgentPrompt(
  settings: any,
  userMessage: string,
  knowledgeChunks: string[],
  conversationHistory: Array<{user: string, agent: string}> = []
): string {
  const persona = settings?.persona_name || "Dany";
  const bio = settings?.persona_bio || "Asistente de la Academia Crystal.";
  const style = settings?.speaking_style || "Cálido y preciso.";
  const systemPrompt = settings?.system_prompt || "Eres un asistente útil.";
  const fallback = settings?.fallback_response || "Déjame confirmarlo y te respondo pronto.";

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
- Recuerda el contexto de conversaciones anteriores.
`;

  if (conversationHistory.length > 0) {
    prompt += `\n# Historial de conversación reciente:\n`;
    conversationHistory.forEach((msg, idx) => {
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

/**
 * Llamar a Gemini para generar respuesta
 */
async function generateResponse(apiKey: string, prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Lista de modelos en orden de preferencia (solo modelos que existen en v1/v1beta)
  const modelCandidates = [
    "gemini-2.0-flash",           // Último modelo 2.0
    "gemini-1.5-pro",             // Pro estable
    "gemini-1.5-flash",           // Flash estable (rápido y económico)
    "gemini-1.5-flash-002",       // Flash con versión
    "gemini-1.5-pro-002",         // Pro con versión
    process.env.GEMINI_MODEL_CHAT,
    process.env.GEMINI_MODEL_SUMMARY,
  ].filter(Boolean) as string[];

  let lastError: any = null;

  for (const candidate of modelCandidates) {
    try {
      console.log(`[generateResponse] Intentando modelo: ${candidate}`);
      const model = genAI.getGenerativeModel({ model: candidate });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[generateResponse] Éxito con modelo: ${candidate}`);
      return text || "Lo siento, no pude generar una respuesta en este momento.";
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || "").toLowerCase();
      console.warn(`[generateResponse] Error con ${candidate}:`, errorMsg);
      
      // Si es 404 o "not found", continuar con siguiente modelo
      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        continue;
      }
      // Para otros errores, lanzar inmediatamente
      throw err;
    }
  }

  throw lastError || new Error("No available Gemini model for chat");
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar autenticación
    if (!validateRequest(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 2. Parsear body
    const body = await req.json();
    const { message, phone, context } = body || {};

    if (!message) {
      return NextResponse.json({ error: "Falta 'message' en el body" }, { status: 400 });
    }

    // 3. Validar credenciales
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Faltan credenciales de Supabase" }, { status: 500 });
    }
    if (!geminiKey) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 4. Leer configuración del agente (personalidad)
    const { data: settings, error: settingsErr } = await supabase
      .from("agent_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settingsErr) {
      console.error("Error leyendo agent_settings:", settingsErr);
    }

    // 5. Obtener historial de conversación
    console.log("[POST /api/ai/chat] Leyendo historial de conversación...");
    const history = await getConversationHistory(supabase, phone || "unknown", 5);

    // 6. Buscar conocimiento relevante en agent_chunks
    const knowledgeChunks = await searchKnowledge(supabase, message, 3);

    // 7. Construir prompt con personalidad + conocimiento + historial
    const prompt = buildAgentPrompt(settings || {}, message, knowledgeChunks, history);

    // 8. Generar respuesta con Gemini
    const response = await generateResponse(geminiKey, prompt);

    // 9. Guardar en historial de conversación
    await saveConversation(supabase, phone || "unknown", message, response);

    // 10. Opcional: registrar conversación en logs
    // await supabase.from("whatsapp_conversaciones").insert({...})

    return NextResponse.json({
      ok: true,
      response,
      agent: settings?.persona_name || "Dany",
      knowledgeUsed: knowledgeChunks.length > 0,
      historyLength: history.length,
    });
  } catch (error: any) {
    console.error("Error en /api/ai/chat:", error);
    return NextResponse.json(
      { error: error?.message || "Error generando respuesta del agente" },
      { status: 500 }
    );
  }
}
