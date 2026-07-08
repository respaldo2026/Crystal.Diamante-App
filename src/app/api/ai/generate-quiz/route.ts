/**
 * POST /api/ai/generate-quiz
 *
 * Lee uno o varios PDFs asociados a una clase del pensum y genera 25 preguntas de opción múltiple
 * usando Gemini. Devuelve el arreglo de preguntas listo para insertar en quiz_preguntas_clase.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { shouldSkipGeminiRequest } from "@/utils/ai-request-guards";

export const dynamic = "force-dynamic";

export interface PreguntaGenerada {
  orden: number;
  pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  opcion_d: string;
  respuesta_correcta: "A" | "B" | "C" | "D";
}

type ApiKeyResolution = {
  key: string;
  source: string;
};

const PROMPT_GENERAR_QUIZ = `Eres un experto en educación de belleza y cosmetología.
A continuación recibirás el contenido de uno o varios PDFs de estudio de una clase de academia de belleza.
Genera EXACTAMENTE 25 preguntas de opción múltiple en español basadas en TODO el contenido recibido.

REGLAS ESTRICTAS:
1. Devuelve ÚNICAMENTE un JSON puro, sin markdown, sin bloques de código, sin explicaciones.
2. El JSON debe ser un array de 25 objetos con esta estructura exacta:
   [
     {
       "orden": 1,
       "pregunta": "¿Texto de la pregunta?",
       "opcion_a": "Primera opción",
       "opcion_b": "Segunda opción",
       "opcion_c": "Tercera opción",
       "opcion_d": "Cuarta opción",
       "respuesta_correcta": "A"
     },
     ...
   ]
3. El campo "respuesta_correcta" debe ser ÚNICAMENTE una letra mayúscula: "A", "B", "C" o "D".
4. Las preguntas deben cubrir los conceptos más importantes del material.
5. Las opciones incorrectas deben ser plausibles pero claramente erróneas para quien estudió.
6. Las preguntas deben ser claras, precisas y de nivel apropiado para estudiantes de academia.
7. Varía la dificultad: 40% fácil, 40% medio, 20% difícil.
8. La respuesta correcta debe estar distribuida entre A, B, C y D (no siempre la misma letra).
9. Ordena del 1 al 25.

DEVUELVE ÚNICAMENTE EL JSON, nada más.`;

async function fetchPdfAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AcademiaBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Error descargando PDF: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/pdf";
  const parts = contentType.split(";");
  const mimeType = (parts[0] || "application/pdf").trim() || "application/pdf";

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return { base64, mimeType };
}

function safeParseJson(raw: string): PreguntaGenerada[] | null {
  // Intentar parseo directo
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { /* continuar */ }

  // Extraer array JSON del texto
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* continuar */ }
  }

  return null;
}

function validarPreguntas(preguntas: PreguntaGenerada[]): PreguntaGenerada[] {
  return preguntas
    .filter((p) => (
      p &&
      typeof p.pregunta === "string" && p.pregunta.trim().length > 0 &&
      typeof p.opcion_a === "string" && p.opcion_a.trim().length > 0 &&
      typeof p.opcion_b === "string" && p.opcion_b.trim().length > 0 &&
      typeof p.opcion_c === "string" && p.opcion_c.trim().length > 0 &&
      typeof p.opcion_d === "string" && p.opcion_d.trim().length > 0 &&
      ["A", "B", "C", "D"].includes(String(p.respuesta_correcta).toUpperCase())
    ))
    .map((p, idx) => ({
      orden: idx + 1,
      pregunta: p.pregunta.trim(),
      opcion_a: p.opcion_a.trim(),
      opcion_b: p.opcion_b.trim(),
      opcion_c: p.opcion_c.trim(),
      opcion_d: p.opcion_d.trim(),
      respuesta_correcta: String(p.respuesta_correcta).toUpperCase() as "A" | "B" | "C" | "D",
    }));
}

function resolveGeminiApiKey(): ApiKeyResolution | null {
  const candidates: Array<{ source: string; value?: string }> = [
    { source: "GEMINI_API_KEY", value: process.env.GEMINI_API_KEY },
    { source: "GOOGLE_GENERATIVE_AI_API_KEY", value: process.env.GOOGLE_GENERATIVE_AI_API_KEY },
    { source: "GOOGLE_API_KEY", value: process.env.GOOGLE_API_KEY },
    { source: "GOOGLE_AI_API_KEY", value: process.env.GOOGLE_AI_API_KEY },
  ];

  for (const candidate of candidates) {
    const key = String(candidate.value || "").trim();
    if (key) {
      return { key, source: candidate.source };
    }
  }

  return null;
}

function isGeminiRateLimitError(error: any): boolean {
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 429 || message.includes("429") || message.includes("too many requests") || message.includes("quota") || message.includes("resource exhausted") || message.includes("prepayment credits are depleted");
}

function isGeminiAccessDeniedError(error: any): boolean {
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 401 || status === 403 || message.includes("permission denied") || message.includes("api key") || message.includes("access denied") || message.includes("unauthorized");
}

function isGeminiModelNotFoundError(error: any): boolean {
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 404 || message.includes("not found") || message.includes("is not found for api version") || message.includes("unsupported model");
}

async function generateQuizWithModelFallback(apiKey: string, promptTexto: string, documentosPdf: Array<{ base64: string; mimeType: string; url: string }>) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const candidates = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL_ECONOMY,
        process.env.GEMINI_MODEL_CHAT,
        process.env.GEMINI_MODEL_SUMMARY,
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-1.5-flash-002",
        "gemini-1.5-flash",
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

  let lastError: any = null;

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const partesContenido = [
        ...documentosPdf.map((doc) => ({
          inlineData: {
            data: doc.base64,
            mimeType: doc.mimeType,
          },
        })),
        promptTexto,
      ];

      const result = await model.generateContent(partesContenido);
      return { result, modelName };
    } catch (error: any) {
      lastError = error;
      if (isGeminiModelNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("No hay modelos Gemini disponibles para generar el quiz");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pdf_url, pdf_urls, titulo_clase, pensum_curso_id } = body as {
      pdf_url?: string;
      pdf_urls?: string[];
      titulo_clase?: string;
      pensum_curso_id?: string;
    };

    const normalizarUrl = (value?: string | null) => String(value || "").trim();
    const urlsEntrada = [
      ...(Array.isArray(pdf_urls) ? pdf_urls : []),
      pdf_url,
    ];
    const urlsPdf = Array.from(new Set(urlsEntrada.map(normalizarUrl).filter(Boolean)));

    if (shouldSkipGeminiRequest(titulo_clase, pensum_curso_id, urlsPdf.join(" "))) {
      return NextResponse.json({ ok: true, ignored: true, reason: "automated_outbound_message" });
    }

    if (urlsPdf.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un PDF (pdf_url o pdf_urls) para generar el quiz." },
        { status: 400 }
      );
    }

    const apiKeyResolution = resolveGeminiApiKey();
    if (!apiKeyResolution?.key) {
      return NextResponse.json(
        { error: "API key no configurada. Define GEMINI_API_KEY (o GOOGLE_GENERATIVE_AI_API_KEY/GOOGLE_API_KEY)." },
        { status: 500 }
      );
    }

    // Descargar PDFs
    let documentosPdf: Array<{ base64: string; mimeType: string; url: string }> = [];
    try {
      documentosPdf = await Promise.all(
        urlsPdf.map(async (url) => {
          const result = await fetchPdfAsBase64(url);
          return { ...result, url };
        })
      );
    } catch (fetchError: any) {
      return NextResponse.json(
        { error: `No se pudo descargar uno de los PDFs: ${fetchError.message}` },
        { status: 422 }
      );
    }

    const promptTextoBase = titulo_clase
      ? `${PROMPT_GENERAR_QUIZ}\n\nEl tema de esta clase es: "${titulo_clase}". Enfoca las preguntas en este tema específico.`
      : PROMPT_GENERAR_QUIZ;

    const promptTexto = `${promptTextoBase}\n\nCantidad de PDFs recibidos: ${documentosPdf.length}. Usa de forma integrada el contenido de todos los PDFs.`;

    const { result, modelName } = await generateQuizWithModelFallback(apiKeyResolution.key, promptTexto, documentosPdf);

    const rawText = result.response.text();

    // Parsear respuesta JSON
    const preguntasRaw = safeParseJson(rawText);

    if (!preguntasRaw || preguntasRaw.length === 0) {
      return NextResponse.json(
        {
          error: "La IA no devolvió preguntas válidas. Intenta de nuevo.",
          raw: rawText.substring(0, 500),
        },
        { status: 422 }
      );
    }

    const preguntas = validarPreguntas(preguntasRaw);

    if (preguntas.length < 10) {
      return NextResponse.json(
        {
          error: `Solo se generaron ${preguntas.length} preguntas válidas. Se necesitan al menos 10. Verifica el PDF.`,
          raw: rawText.substring(0, 500),
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      preguntas,
      total: preguntas.length,
      total_pdfs_procesados: documentosPdf.length,
      model_usado: modelName,
      api_key_source: apiKeyResolution.source,
      titulo_sugerido: titulo_clase
        ? `Quiz: ${titulo_clase}`
        : "Quiz de la clase",
    });
  } catch (error: any) {
    console.error("[generate-quiz] Error:", error);

    if (isGeminiRateLimitError(error)) {
      return NextResponse.json(
        {
          error: "Gemini devolvió límite de cuota (429). Verifica facturación/cuota de la API key activa o usa otra key en GEMINI_API_KEY.",
          details: String(error?.message || ""),
        },
        { status: 429 }
      );
    }

    if (isGeminiAccessDeniedError(error)) {
      return NextResponse.json(
        {
          error: "Acceso denegado por Gemini (401/403). Revisa que la key activa tenga permisos para Generative Language API.",
          details: String(error?.message || ""),
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Error interno generando quiz." },
      { status: 500 }
    );
  }
}
