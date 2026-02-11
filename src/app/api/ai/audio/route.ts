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
 * Descargar archivo de audio desde URL
 */
async function downloadAudio(audioUrl: string): Promise<Buffer> {
  try {
    const response = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
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
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Convertir buffer a base64
    const base64Audio = audioBuffer.toString("base64");

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/mpeg",
                data: base64Audio,
              },
            },
            {
              text: "Transcribe this audio to text. Return only the transcription, nothing else.",
            },
          ],
        },
      ],
    });

    const transcription = result.response.text().trim();
    console.log("[speechToText] Transcripción:", transcription);
    return transcription;
  } catch (err) {
    console.error("[speechToText] Error:", err);
    throw err;
  }
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
 * Construir prompt del agente
 */
function buildAgentPrompt(
  settings: any,
  userMessage: string,
  knowledgeChunks: string[]
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
`;

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
    const { audio_url, phone } = body || {};

    if (!audio_url) {
      return NextResponse.json({ error: "Falta 'audio_url' en el body" }, { status: 400 });
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

    console.log("[POST /api/ai/audio] Iniciando procesamiento de audio...");

    // 4. Descargar audio
    console.log("[POST /api/ai/audio] Descargando audio desde:", audio_url);
    const audioBuffer = await downloadAudio(audio_url);
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

    // 7. Buscar conocimiento relevante
    const knowledgeChunks = await searchKnowledge(supabase, transcription, 3);

    // 8. Generar respuesta del agente
    console.log("[POST /api/ai/audio] Generando respuesta del agente...");
    const prompt = buildAgentPrompt(settings || {}, transcription, knowledgeChunks);
    const agentResponse = await generateResponse(geminiKey, prompt);

    // 9. TTS: Convertir respuesta a audio
    console.log("[POST /api/ai/audio] Convirtiendo respuesta a audio (TTS)...");
    const responseAudioBuffer = await textToSpeech(agentResponse);

    // 10. Subir audio a Supabase storage
    const timestamp = Date.now();
    const filename = `responses/${timestamp}-${phone || "unknown"}.mp3`;
    console.log("[POST /api/ai/audio] Subiendo audio a Supabase:", filename);
    const audioUrl = await uploadAudioToSupabase(supabase, responseAudioBuffer, filename);

    return NextResponse.json({
      ok: true,
      transcription,
      agent_response: agentResponse,
      audio_url: audioUrl,
      agent: settings?.persona_name || "Dany",
    });
  } catch (error: any) {
    console.error("[POST /api/ai/audio] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error procesando audio" },
      { status: 500 }
    );
  }
}
