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
      .select("*, urls_adjuntos")
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

    const msg = sanitize(messageBody);
    const wantsMedia = /foto|imagen|video|adjunto|material|brochure/.test(msg);
    const wantsDuration = /duracion|dura/.test(msg);
    const wantsPrice = /precio|costo|vale|inversion/.test(msg);
    const wantsSchedule = /hora|horario/.test(msg);
    const wantsAll = /info|informacion|detalle|completo/.test(msg);
    const isGreeting = /\b(hola|buenas|hello|hey|hi)\b/.test(msg);
    const stopWords = new Set(["curso", "cursos", "clase", "clases", "de", "del", "para", "una", "unas", "unos", "un"]);
    const palabrasClave = msg
      .split(/\W+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const scoreCurso = (curso: any) => {
      if (!curso) return -1;
      let score = 0;
      const tituloSan = sanitize(curso.titulo ?? "");
      const tipoSan = sanitize(curso.tipo ?? "");
      const slugSan = sanitize(curso.slug ?? "");
      const descSan = sanitize(curso.descripcion_corta ?? "");
      const descIaSan = sanitize(curso.descripcion_ia ?? "");
      const kwsSan = Array.isArray(curso.keywords) ? curso.keywords.map((k: string) => sanitize(String(k))) : [];

      palabrasClave.forEach((w) => {
        if (tituloSan.includes(w)) score += 2;
        if (descSan.includes(w)) score += 2;
        if (descIaSan.includes(w)) score += 2;
        if (slugSan.includes(w)) score += 1;
        if (tipoSan.includes(w)) score += 0.5;
        if (kwsSan.some((kw) => kw.includes(w))) score += 2;
      });

      if (wantsMedia && (curso.url_foto || curso.url_video || (curso.urls_adjuntos && curso.urls_adjuntos.length))) score += 2;
      if (wantsPrice) score += 1;
      if (wantsSchedule) score += 1;
      if (wantsDuration) score += 1;

      return score;
    };

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

      const saludo = name ? `👋 Hola ${name}, soy Dany del equipo Crystal Diamante ✨` : "👋 Hola, soy Dany del equipo Crystal Diamante ✨";
      const tonoHumano = "Estoy aquí para ayudarte rápido y bien.";

      const extras: string[] = [];
      if (curso.descripcion_corta && (wantsAll || wantsDuration)) {
        extras.push(`ℹ️ ${curso.descripcion_corta}`);
      }
      if (wantsSchedule && horario && !curso.descripcion_corta) {
        extras.push(`⏰ Horario: ${horario}`);
      }
      if (wantsMedia) {
        if (curso.url_foto) extras.push(`📸 Foto: ${curso.url_foto}`);
        if (curso.url_video) extras.push(`🎥 Video: ${curso.url_video}`);
        if (curso.urls_adjuntos && Array.isArray(curso.urls_adjuntos)) {
          curso.urls_adjuntos.forEach((a: any) => {
            if (a?.url) extras.push(`📎 ${a?.label ?? "Adjunto"}: ${a.url}`);
          });
        }
      }

      return [
        `${saludo}`,
        tonoHumano,
        "",
        `💎 *${curso.titulo}*`,
        `📆 *Inicio:* ${inicio}${horario ? ` | ⏰ *Horario:* ${horario}` : ""}`,
        `💰 *Inscripción/curso:* ${precioTexto}${precioLista ? ` (normal ${precioLista})` : ""}`,
        `📅 *Mensualidad:* ${mensualidadTexto}`,
        `🎯 ${cuposTexto}`,
        wantsMedia ? "" : `🔗 Asegura tu cupo: ${link}`,
        ...extras,
        "",
        "¿Te ayudo a reservar ya mismo o prefieres que te cuente un detalle más?",
      ]
        .filter(Boolean)
        .join("\n");
    };

    // Respuesta determinista sin Gemini para evitar frases no deseadas
    const mejor = (marketing ?? []).reduce<{ curso: any; score: number } | null>((best, curso) => {
      const score = scoreCurso(curso);
      if (!best || score > best.score) return { curso, score };
      return best;
    }, null);

    const pick = mejor && mejor.score > 0 ? mejor.curso : null;

    let reply = "";
    if (pick) {
      reply = construirRespuestaVendedora(pick) ?? "";
    }

    if (!reply && wantsMedia) {
      const conMedios = (marketing ?? []).find((c) => c.url_foto || c.url_video || (c.urls_adjuntos && c.urls_adjuntos.length));
      reply = construirRespuestaVendedora(conMedios) ?? "";
    }

    if (!reply && isGreeting && marketing && marketing.length > 0) {
      // Si solo saludan, responde con el mejor curso disponible (primero en la lista)
      reply = construirRespuestaVendedora(marketing[0]) ?? "";
    }

    if (!reply && marketing && marketing.length > 0) {
      const listado = marketing.slice(0, 3).map((c) => {
        const precioLinea = c.precio_promocional ?? c.precio_lista ?? "s/p";
        const linkLinea = c.url_inscripcion ?? "(pide el enlace)";
        return `- ${c.titulo} | ${precioLinea} ${c.moneda ?? ""} | ${linkLinea}`;
      });
      reply = [
        "No encuentro un curso exacto a lo que pides, pero estas opciones están activas:",
        ...listado,
        "¿Cuál te interesa y te paso más detalles?",
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (!reply) {
      reply = materialsLines[0] ?? "No tengo datos suficientes ahora; te conecto con un asesor.";
    }

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