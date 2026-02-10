// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.1";

// ==========================================
// 🔑 TUS CREDENCIALES (YA CONFIGURADAS)
// ==========================================
const SUPABASE_URL = "https://xqcsftjkvcrbcetrdulq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3NmdGprdmNyYmNldHJkdWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAxMjU2NCwiZXhwIjoyMDgxNTg4NTY0fQ.xnDqgCaW1R77wM-TfjKMDfUehKt4BZ2UnHvDikqk-w4";
const GEMINI_API_KEY = "AIzaSyCwqKow9vv79mpQNe7CQyW-TmK0nB7ayBk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const phone: string | undefined = body?.phone;
    const name: string | undefined = body?.name;
    const messageBody: string | undefined = body?.message_body;

    if (!phone || !messageBody) {
      return new Response(JSON.stringify({ error: "Faltan datos: phone y message_body" }), { status: 400, headers: corsHeaders });
    }

    // Inicializar clientes
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. GESTION DE LEAD
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .upsert({ telefono: phone, nombre: name ?? null, ultima_interaccion: new Date().toISOString() }, { onConflict: "telefono" })
      .select("id")
      .single();

    if (leadError || !leadRow) throw new Error("Error guardando el lead");
    const leadId = leadRow.id;

    // 2. BUSQUEDA PARALELA
    const searchTerm = messageBody.slice(0, 100);
    const likeQuery = `%${searchTerm}%`;

    const [insertUserMsg, historyResult, faqResult] = await Promise.all([
      supabase.from("whatsapp_mensajes").insert({
        lead_id: leadId, role: "user", mensaje_texto: messageBody, tipo: "text", creado_en: new Date().toISOString()
      }),
      supabase.from("whatsapp_mensajes").select("role, mensaje_texto").eq("lead_id", leadId).order("creado_en", { ascending: false }).limit(6),
      supabase.from("faq").select("pregunta, respuesta").or(`pregunta.ilike.${likeQuery},respuesta.ilike.${likeQuery}`).limit(3)
    ]);

    // 3. IA
    const conversation = (historyResult.data ?? []).reverse().map((m) => `${m.role === "assistant" ? "Dany" : "Cliente"}: ${m.mensaje_texto}`).join("\n");
    const faqContext = (faqResult.data ?? []).map((row) => `P: ${row.pregunta}\nR: ${row.respuesta}`).join("\n\n");

    const systemPrompt = `
      Eres 'Dany', asistente virtual de la Academia Crystal Diamante.
      Objetivo: Responder dudas sobre cursos de belleza y uñas.
      
      BASE DE CONOCIMIENTO (FAQ):
      ${faqContext || "No hay información específica."}

      HISTORIAL:
      ${conversation}

      CLIENTE: "${messageBody}"
      
      INSTRUCCIONES:
      - Responde amable, corto y profesional (Español Colombia).
      - Si la respuesta está en la FAQ, úsala.
      - Si preguntan precios y NO están en la FAQ, di: "Déjame contactar a un asesor humano para darte el precio exacto 👩‍💻".
    `;

    // 4. GENERAR
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(systemPrompt);
    const replyText = result.response.text().trim();

    // 5. GUARDAR Y RESPONDER
    await supabase.from("whatsapp_mensajes").insert({
      lead_id: leadId, role: "assistant", mensaje_texto: replyText, tipo: "text", creado_en: new Date().toISOString()
    });

    return new Response(JSON.stringify({ reply: replyText }), { status: 200, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});