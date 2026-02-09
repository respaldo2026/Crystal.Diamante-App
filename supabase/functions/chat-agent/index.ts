// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  // Manejo de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const phone: string | undefined = body?.phone;
    const name: string | undefined = body?.name;
    const messageBody: string | undefined = body?.message_body;

    // Validación básica
    if (!phone || !messageBody) {
      return new Response(JSON.stringify({ error: "Faltan datos: phone y message_body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Inicializar clientes
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      throw new Error("Faltan variables de entorno (SUPABASE_URL, SERVICE_KEY o GEMINI_KEY)");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. GESTIÓN DE LEAD (Buscar o Crear)
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .upsert(
        { 
          telefono: phone, 
          nombre: name ?? null,
          ultima_interaccion: new Date().toISOString()
        },
        { onConflict: "telefono" }
      )
      .select("id")
      .single();

    if (leadError || !leadRow) {
      console.error("Error en Lead Upsert:", leadError);
      throw new Error("No se pudo guardar el lead");
    }

    const leadId = leadRow.id;

    // 2. GUARDAR MENSAJE DEL USUARIO
    const { error: userMsgError } = await supabase.from("whatsapp_mensajes").insert({
      lead_id: leadId,
      role: "user",
      mensaje_texto: messageBody,
      tipo: "text",
      creado_en: new Date().toISOString()
    });

    if (userMsgError) console.error("Error guardando mensaje usuario:", userMsgError);

    // 3. RECUPERAR HISTORIAL (Memoria Corto Plazo)
    const { data: historyRows } = await supabase
      .from("whatsapp_mensajes")
      .select("role, mensaje_texto")
      .eq("lead_id", leadId)
      .order("creado_en", { ascending: false })
      .limit(5);

    const conversation = (historyRows ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        role: m.role,
        content: m.mensaje_texto,
      }));

    // 4. BÚSQUEDA EN FAQ (Memoria Largo Plazo - CORREGIDO)
    // Usamos 'faq' con 'pregunta' y 'respuesta'
    const searchTerm = messageBody.slice(0, 200);
    const like = `%${searchTerm}%`;

    const { data: kbData, error: kbError } = await supabase
      .from("faq")
      .select("pregunta, respuesta")
      .or(`pregunta.ilike.${like},respuesta.ilike.${like}`)
      .limit(3);

    if (kbError) console.error("Error buscando en FAQ", kbError);

    const faqContext = (kbData ?? [])
      .map((row) => `P: ${row.pregunta}\nR: ${row.respuesta}`)
      .join("\n\n");

    const historyText = conversation
      .map((m) => `${m.role === "assistant" ? "Asesor" : "Usuario"}: ${m.content}`)
      .join("\n");

    // 5. LLAMADA A GEMINI
    const systemPrompt = `
      Eres 'Dany', el asistente virtual experto de la Academia Crystal Diamante.
      Objetivo: Responder dudas sobre cursos de belleza y agendar citas.
      
      Reglas:
      1. Responde en español, tono amable y profesional.
      2. Usa la información de 'FAQ' abajo para responder. Si no sabes, no inventes.
      3. Sé conciso (máximo 3 oraciones).
      4. Si el usuario pregunta precios y no están en el FAQ, pide que esperen a un asesor humano.

      INFORMACIÓN DE LA ACADEMIA (FAQ):
      ${faqContext}

      HISTORIAL DE CONVERSACIÓN:
      ${historyText}

      PREGUNTA ACTUAL:
      ${messageBody}
    `;

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(systemPrompt);
    const replyText = result.response.text().trim();

    // 6. GUARDAR RESPUESTA DEL ASISTENTE
    await supabase.from("whatsapp_mensajes").insert({
      lead_id: leadId,
      role: "assistant",
      mensaje_texto: replyText,
      tipo: "text",
      creado_en: new Date().toISOString()
    });

    // 7. RESPONDER A MAKE
    return new Response(JSON.stringify({ reply: replyText }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fatal en chat-agent:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});