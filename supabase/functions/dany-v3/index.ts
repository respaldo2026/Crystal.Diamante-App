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

    const sanitize = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const construirRespuestaVendedora = (curso: any) => {
      if (!curso) return null;

      const precioOferta = curso.precio_promocional ?? curso.precio_lista;
      const precioLista = curso.precio_lista && curso.precio_promocional ? `${curso.precio_lista} ${curso.moneda ?? ""}`.trim() : "";
      const precioTexto = precioOferta ? `${precioOferta} ${curso.moneda ?? ""}`.trim() : "(consúltame el precio)";
      const mensualidadTexto = curso.precio_mensualidad
        ? `${curso.precio_mensualidad} ${curso.moneda ?? ""}`.trim()
        : "Te confirmo la mensualidad en un momento.";

      const inicio = curso.fecha_inicio ?? "fecha por definir";
      const cupos = curso.cupos_disponibles;
      const horario = curso.hora_inicio && curso.hora_fin ? `${curso.hora_inicio} - ${curso.hora_fin}` : "hora por definir";
      const link = curso.url_inscripcion ?? "(pide el enlace de inscripción)";

      const cuposTexto =
        typeof cupos === "number"
          ? cupos <= 5
            ? `🔥 Quedan ${cupos} cupos, suele llenarse rápido.`
            : `Cupos disponibles: ${cupos}.`
          : "Verifico cupos contigo en un minuto.";

      const saludo = name ? `Hola ${name}, soy Dany del equipo Crystal Diamante ✨` : "Hola, soy Dany del equipo Crystal Diamante ✨";

      return [
        `${saludo}`,
        `*${curso.titulo}* arranca ${inicio}${horario ? ` | Horario: ${horario}` : ""}.`,
        `💰 Inscripción/curso: ${precioTexto}${precioLista ? ` (normal ${precioLista})` : ""}.`,
        `📅 Mensualidad: ${mensualidadTexto}`,
        `🎯 ${cuposTexto}`,
        `🔗 Link para asegurar tu cupo: ${link}`,
        "¿Te ayudo a reservar ahora mismo?",
      ]
        .filter(Boolean)
        .join("\n");
    };

    // Respuesta determinista sin Gemini para evitar frases no deseadas
    const querySanitized = sanitize(messageBody);
    const candidatos = (marketing ?? []).filter((m) => sanitize(m.titulo).includes(querySanitized));
    const pick = candidatos[0] ?? (marketing && marketing[0]);
    let reply =
      construirRespuestaVendedora(pick) ||
      (marketing && marketing.length > 0
        ? construirRespuestaVendedora(marketing[0])
        : (materialsLines[0] ?? "No tengo datos suficientes ahora; te conecto con un asesor."));

    // Filtro final anti-frase prohibida
    const bannedRegex = /(cerebro|algo\s+sal[ií]o\s+mal|brain)/i;
    const sanitizedReply = sanitize(reply ?? "");
    if (!reply || bannedRegex.test(reply) || bannedRegex.test(sanitizedReply)) {
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