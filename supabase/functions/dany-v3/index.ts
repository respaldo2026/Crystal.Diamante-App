// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const phone = body?.phone;
    const name = body?.name;
    const messageBody = body?.message_body ?? body?.message ?? body?.texto;

    if (!messageBody) {
      return new Response(JSON.stringify({ error: "message_body requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      return new Response(JSON.stringify({ error: "Faltan variables de entorno" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Obtener ofertas (cursos/grupos) desde el Centro de Marketing
    const { data: marketing, error: marketingErr } = await supabase
      .from("marketing_centro")
      .select(
        `titulo, tipo, slug, curso_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
         precio_lista, precio_promocional, moneda, cupos_totales, cupos_disponibles,
         estado, url_inscripcion, url_foto, url_video, urls_adjuntos, descripcion_corta, descripcion_ia`
      )
      .in("estado", ["activo", "proximo"])
      .order("fecha_inicio", { ascending: true })
      .limit(50);

    if (marketingErr) {
      console.error("Error marketing_centro", marketingErr);
    }

    // 2. Obtener materiales visibles para IA como respaldo
    const { data: assets, error: assetsErr } = await supabase
      .from("marketing_assets")
      .select("titulo, descripcion_ia, url_archivo, tipo_asset, categoria, keywords")
      .eq("visible_para_ia", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (assetsErr) {
      console.error("Error marketing_assets", assetsErr);
    }

    const contextLines = (marketing ?? []).map((m) => {
      const precio = m.precio_promocional ?? m.precio_lista ?? "s/p";
      const inicio = m.fecha_inicio ?? "fecha por definir";
      const cupos = m.cupos_disponibles ?? "cupos N/D";
      const horario = m.hora_inicio && m.hora_fin ? `${m.hora_inicio} - ${m.hora_fin}` : "hora por definir";
      const adjuntos = m.urls_adjuntos && Array.isArray(m.urls_adjuntos)
        ? m.urls_adjuntos.map((a) => `${a.label ?? "adjunto"}: ${a.url ?? ""}`).join(" | ")
        : "";
      const medios = [m.url_foto, m.url_video].filter(Boolean).join(" | ");
      return `- ${m.titulo} (${m.tipo}) | inicio: ${inicio} ${horario ? "| " + horario : ""} | precio: ${precio} ${m.moneda ?? ""} | cupos: ${cupos} | estado: ${m.estado} | inscripciones: ${m.url_inscripcion ?? "N/A"}${medios ? " | medios: " + medios : ""}${adjuntos ? " | adjuntos: " + adjuntos : ""}`;
    });

    const materialsLines = (assets ?? []).map((a) => {
      const kws = a.keywords && Array.isArray(a.keywords) ? ` | keywords: ${a.keywords.join(", ")}` : "";
      return `- ${a.titulo} [${a.tipo_asset}] ${a.descripcion_ia ?? ""} | url: ${a.url_archivo ?? "N/A"}${kws}`;
    });

    if ((!marketing || marketing.length === 0) && (!assets || assets.length === 0)) {
      return new Response(
        JSON.stringify({ reply: "No tengo cursos ni materiales cargados en este momento. Dime qué curso te interesa y lo consulto con un asesor." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = [
      "Eres Dany, asistente de la academia. Responde solo con los datos disponibles; si algo falta, di que lo consultas con un asesor y NO inventes ni uses frases como 'algo salió mal con mi cerebro'.",
      "Prioridad: da precios, fechas, horarios, cupos y links solo si están en el contexto. Si no están, di que consultarás a un asesor.",
      "Contexto cursos/grupos:",
      contextLines.join("\n") || "(sin cursos activos/próximos)",
      "Contexto materiales:",
      materialsLines.join("\n") || "(sin materiales IA)",
      "Pregunta del usuario:",
      messageBody,
    ]
      .filter(Boolean)
      .join("\n\n");

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let reply = "No tengo datos suficientes ahora; te conecto con un asesor.";

    try {
      const aiResult = await model.generateContent(prompt);
      reply = aiResult.response.text().trim() || reply;
    } catch (err) {
      console.error("Gemini generateContent error", err);
      reply = "Tuve un problema al generar la respuesta. Te conecto con un asesor para más detalles.";
    }

    const bannedRegex = /(cerebro|algo\s+sal[ií]o\s+mal|brain)/i;
    if (bannedRegex.test(reply)) {
      reply = "No tengo datos suficientes ahora; te conecto con un asesor para confirmarte precios, fechas y cupos.";
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error dany-v3", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});