/**
 * POST /api/ai/generate-quiz
 *
 * Lee el PDF asociado a una clase del pensum y genera 25 preguntas de opción múltiple
 * usando Gemini. Devuelve el arreglo de preguntas listo para insertar en quiz_preguntas_clase.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

const PROMPT_GENERAR_QUIZ = `Eres un experto en educación de belleza y cosmetología.
A continuación recibirás el contenido de un PDF de estudio de una clase de academia de belleza.
Genera EXACTAMENTE 25 preguntas de opción múltiple en español basadas en el contenido del PDF.

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pdf_url, titulo_clase, pensum_curso_id } = body as {
      pdf_url: string;
      titulo_clase?: string;
      pensum_curso_id?: string;
    };

    if (!pdf_url) {
      return NextResponse.json(
        { error: "Se requiere pdf_url para generar el quiz." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key no configurada." },
        { status: 500 }
      );
    }

    // Descargar PDF
    let base64Data: string;
    let mimeType: string;
    try {
      const result = await fetchPdfAsBase64(pdf_url);
      base64Data = result.base64;
      mimeType = result.mimeType;
    } catch (fetchError: any) {
      return NextResponse.json(
        { error: `No se pudo descargar el PDF: ${fetchError.message}` },
        { status: 422 }
      );
    }

    // Llamar a Gemini con el PDF
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const promptTexto = titulo_clase
      ? `${PROMPT_GENERAR_QUIZ}\n\nEl tema de esta clase es: "${titulo_clase}". Enfoca las preguntas en este tema específico.`
      : PROMPT_GENERAR_QUIZ;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
      promptTexto,
    ]);

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
      titulo_sugerido: titulo_clase
        ? `Quiz: ${titulo_clase}`
        : "Quiz de la clase",
    });
  } catch (error: any) {
    console.error("[generate-quiz] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno generando quiz." },
      { status: 500 }
    );
  }
}
