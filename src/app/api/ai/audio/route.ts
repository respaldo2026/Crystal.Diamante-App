/**
 * POST /api/ai/audio
 *
 * Endpoint para procesar audio de WhatsApp:
 * 1. Descargar audio desde URL
 * 2. STT: Convertir audio → texto (Google Generative AI)
 * 3. Procesar con agente IA (personalidad + conocimiento)
 * 4. TTS: Convertir respuesta → audio (Elevenlabs)
 * 5. Devolver URL del audio generado
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { 
  getProgramsForAgent, 
  getCoursesForQuery, 
  detectProgramFromMessage,
  buildHierarchicalContext 
} from "@/utils/supabase/agent-courses";

export const dynamic = "force-dynamic";

/**
 * Validar autenticación
 */
function validateRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.WHATSAPP_API_KEY;
  if (apiKey && apiKey === expectedKey) return true;

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

async function getWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string> {
  try {
    console.log(`[getWhatsAppMediaUrl] Obteniendo URL para media: ${mediaId}`);
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    if (!data.url) {
      throw new Error("No URL returned from WhatsApp API");
    }

    console.log("[getWhatsAppMediaUrl] URL obtenida exitosamente");
    return data.url;
  } catch (err) {
    console.error("[getWhatsAppMediaUrl] Error:", err);
    throw err;
  }
}

/**
 * Descargar archivo de audio desde URL
 */
async function downloadAudio(audioUrl: string, bearerToken?: string): Promise<Buffer> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };

    // Si hay bearer token, agregarlo para autenticación de WhatsApp
    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }

    console.log(`[downloadAudio] Descargando desde: ${audioUrl.split('?')[0]}...`);
    
    const response = await fetch(audioUrl, { headers });

    if (!response.ok) {
      console.error(`[downloadAudio] Status ${response.status}`);
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[downloadAudio] Descargado: ${arrayBuffer.byteLength} bytes`);
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[downloadAudio] Error:", err);
    throw err;
  }
}

/**
 * Convertir audio a texto (STT) usando Google Generative AI
 */
async function speechToText(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Usar la misma lista de modelos que funciona en el endpoint de chat
  const modelCandidates = [
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro-002",
    process.env.GEMINI_MODEL_SUMMARY,
  ].filter(Boolean) as string[];

  const base64Audio = audioBuffer.toString("base64");
  let lastError: any = null;

  for (const modelName of modelCandidates) {
    try {
      console.log(`[speechToText] Intentando modelo: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "audio/ogg",
                  data: base64Audio,
                },
              },
              {
                text: "Transcribe este audio de WhatsApp a texto. Devuelve SOLO la transcripción, sin comentarios adicionales.",
              },
            ],
          },
        ],
      });

      const transcription = result.response.text().trim();
      console.log(`[speechToText] Éxito con modelo: ${modelName}`);
      console.log("[speechToText] Transcripción:", transcription.substring(0, 100));
      return transcription;
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || "").toLowerCase();
      console.warn(`[speechToText] Error con ${modelName}:`, errorMsg);

      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("No available Gemini model for speech-to-text");
}

/**
 * Buscar chunks relevantes por keywords
 */
async function searchKnowledge(supabase: any, query: string, limit = 3): Promise<string[]> {
  try {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    if (!keywords.length) return [];

    const { data, error } = await supabase
      .from("agent_chunks")
      .select("content")
      .or(keywords.map((k) => `content.ilike.%${k}%`).join(","))
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
 * Construir prompt del agente con personalidad + contexto de cursos + conocimiento + historial
 */
function buildAgentPrompt(
  settings: any,
  userMessage: string,
  knowledgeChunks: string[],
  conversationHistory: Array<{user: string, agent: string}> = [],
  coursesContext: string = ""
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
- Sé breve, claro y amable (máx 2 líneas).
- No inventes datos.
- Recuerda el contexto de conversaciones anteriores.
`;

  // Agregar contexto de cursos disponibles
  if (coursesContext) {
    prompt += `\n# INFORMACIÓN ACTUAL DE CURSOS:\n${coursesContext}\n`;
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

/**
 * Generar respuesta con Gemini
 */
async function generateResponse(apiKey: string, prompt: string): Promise<string> {
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
      console.log(`[generateResponse] Intentando modelo: ${candidate}`);
      const model = genAI.getGenerativeModel({ model: candidate });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[generateResponse] Éxito con modelo: ${candidate}`);
      return text || "Lo siento, no pude generar una respuesta.";
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || "").toLowerCase();
      console.warn(`[generateResponse] Error con ${candidate}:`, errorMsg);

      if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("No available Gemini model for chat");
}

/**
 * Convertir texto a audio (TTS) usando Elevenlabs
 */
async function textToSpeech(text: string): Promise<Buffer> {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey) {
    throw new Error("ELEVENLABS_API_KEY no configurada");
  }

  try {
    // Usar la voz default de Elevenlabs (Rachel)
    const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Elevenlabs error: ${response.status} - ${error}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer);
  } catch (err) {
    console.error("[textToSpeech] Error:", err);
    throw err;
  }
}

/**
 * Subir audio a Supabase storage y obtener URL pública
 */
async function uploadAudioToSupabase(
  supabase: any,
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from("agent_audio_responses")
      .upload(filename, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (error) {
      console.error("[uploadAudioToSupabase] Error:", error);
      throw error;
    }

    // Obtener URL pública
    const { data: publicUrl } = supabase.storage
      .from("agent_audio_responses")
      .getPublicUrl(data.path);

    return publicUrl?.publicUrl || "";
  } catch (err) {
    console.error("[uploadAudioToSupabase] Error:", err);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar autenticación
    if (!validateRequest(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 2. Parsear body
    const body = await req.json();
    const { media_id, audio_url, phone, whatsapp_access_token } = body || {};

    // Aceptar tanto media_id como audio_url para flexibilidad
    if (!media_id && !audio_url) {
      return NextResponse.json(
        { error: "Falta 'media_id' o 'audio_url' en el body" },
        { status: 400 }
      );
    }

    // 3. Validar credenciales
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const whatsappToken = whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Faltan credenciales de Supabase" }, { status: 500 });
    }
    if (!geminiKey) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log("[POST /api/ai/audio] Iniciando procesamiento de audio...");

    // 4. Descargar audio
    let audioBuffer: Buffer;

    if (media_id && whatsappToken) {
      // Opción 2: Descargar desde WhatsApp Cloud API usando media_id
      console.log("[POST /api/ai/audio] Obteniendo URL del media desde WhatsApp...");
      const mediaUrl = await getWhatsAppMediaUrl(media_id, whatsappToken);
      
      console.log("[POST /api/ai/audio] Descargando audio desde WhatsApp...");
      audioBuffer = await downloadAudio(mediaUrl, whatsappToken);
    } else if (audio_url) {
      // Opción 1: Descargar directamente de la URL
      console.log("[POST /api/ai/audio] Descargando audio desde URL...");
      audioBuffer = await downloadAudio(audio_url, whatsappToken);
    } else {
      return NextResponse.json(
        { error: "Necesita media_id o audio_url, y WHATSAPP_ACCESS_TOKEN" },
        { status: 400 }
      );
    }

    console.log(`[POST /api/ai/audio] Audio descargado: ${audioBuffer.length} bytes`);

    // 5. STT: Convertir audio a texto
    console.log("[POST /api/ai/audio] Convirtiendo audio a texto (STT)...");
    const transcription = await speechToText(geminiKey, audioBuffer);

    // 6. Leer configuración del agente
    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    // 7. Obtener historial de conversación
    console.log("[POST /api/ai/audio] Leyendo historial de conversación...");
    const history = await getConversationHistory(supabase, phone || "unknown", 5);

    // 7.5. Obtener información JERÁRQUICA: todos los programas (primaria)
    console.log("[POST /api/ai/audio] Leyendo programas disponibles...");
    const programs = await getProgramsForAgent();

    // 7.6. Obtener cursos/grupos basado en lo que pregunta el usuario
    console.log("[POST /api/ai/audio] Detectando programa específico...");
    const detectedProgram = detectProgramFromMessage(transcription, programs);
    const courses = await getCoursesForQuery(transcription, programs);
    
    // Contexto jerárquico: todos los programas + grupos del programa que pregunta (si detecta)
    const hierarchicalContext = buildHierarchicalContext(programs, courses, detectedProgram);

    // 8. Buscar conocimiento relevante
    const knowledgeChunks = await searchKnowledge(supabase, transcription, 3);

    // 9. Generar respuesta del agente
    console.log("[POST /api/ai/audio] Generando respuesta del agente...");
    const prompt = buildAgentPrompt(settings || {}, transcription, knowledgeChunks, history, hierarchicalContext);
    const agentResponse = await generateResponse(geminiKey, prompt);

    // 10. Guardar en historial de conversación
    await saveConversation(supabase, phone || "unknown", transcription, agentResponse, transcription);

    // 11. TTS: Convertir respuesta a audio (OPCIONAL - solo si Elevenlabs está configurado)
    let audioUrl = "";
    try {
      if (process.env.ELEVENLABS_API_KEY) {
        console.log("[POST /api/ai/audio] Convirtiendo respuesta a audio (TTS)...");
        const responseAudioBuffer = await textToSpeech(agentResponse);

        // 12. Subir audio a Supabase storage
        const timestamp = Date.now();
        const filename = `responses/${timestamp}-${phone || "unknown"}.mp3`;
        console.log("[POST /api/ai/audio] Subiendo audio a Supabase:", filename);
        audioUrl = await uploadAudioToSupabase(supabase, responseAudioBuffer, filename);
      } else {
        console.warn("[POST /api/ai/audio] ELEVENLABS_API_KEY no configurada, omitiendo TTS");
      }
    } catch (ttsErr) {
      console.warn("[POST /api/ai/audio] Error en TTS, continuando sin audio:", ttsErr);
    }

    return NextResponse.json({
      ok: true,
      transcription,
      agent_response: agentResponse,
      audio_url: audioUrl || null,
      agent: settings?.persona_name || "Dany",
      historyLength: history.length,
    });
  } catch (error: any) {
    console.error("[POST /api/ai/audio] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error procesando audio" },
      { status: 500 }
    );
  }
}
