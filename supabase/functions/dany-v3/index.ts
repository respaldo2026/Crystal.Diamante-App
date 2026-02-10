// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.1";

// 🔑 TUS CREDENCIALES
const SUPABASE_URL = "https://xqcsftjkvcrbcetrdulq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3NmdGprdmNyYmNldHJkdWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAxMjU2NCwiZXhwIjoyMDgxNTg4NTY0fQ.xnDqgCaW1R77wM-TfjKMDfUehKt4BZ2UnHvDikqk-w4";
const GEMINI_API_KEY = "AIzaSyCwqKow9vv79mpQNe7CQyW-TmK0nB7ayBk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body?.phone || !body?.message_body) {
      return new Response(JSON.stringify({ error: "Faltan datos" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Lead
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .upsert({ telefono: body.phone, nombre: body.name ?? null, ultima_interaccion: new Date().toISOString() }, { onConflict: "telefono" })
      .select("id").single();
    if (leadError || !leadRow) throw new Error("Error Lead");
    const leadId = leadRow.id;

    // 2. Contexto
    const likeQuery = `%${body.message_body.slice(0, 100)}%`;
    const [_, history, faq] = await Promise.all([
      supabase.from("whatsapp_mensajes").insert({ lead_id: leadId, role: "user", mensaje_texto: body.message_body, tipo: "text", creado_en: new Date().toISOString() }),
      supabase.from("whatsapp_mensajes").select("role, mensaje_texto").eq("lead_id", leadId).order("creado_en", { ascending: false }).limit(6),
      supabase.from("faq").select("pregunta, respuesta").or(`pregunta.ilike.${likeQuery},respuesta.ilike.${likeQuery}`).limit(3)
    ]);

    // 3. IA
    const historyText = (history.data || []).reverse().map(m => `${m.role === 'assistant' ? 'Dany' : 'Cliente'}: ${m.mensaje_texto}`).join('\n');
    const faqText = (faq.data || []).map(f => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n');
    
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`
      Eres Dany, asistente de Academia Crystal Diamante.
      FAQ: ${faqText || "Sin datos."}
      Chat: ${historyText}
      Cliente: "${body.message_body}"
      Responde corto, amable y vende. Si no sabes precio, pide humano.
    `);
    
    const reply = result.response.text().trim();

    // 4. Fin
    await supabase.from("whatsapp_mensajes").insert({ lead_id: leadId, role: "assistant", mensaje_texto: reply, tipo: "text", creado_en: new Date().toISOString() });
    
    return new Response(JSON.stringify({ reply }), { status: 200, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});