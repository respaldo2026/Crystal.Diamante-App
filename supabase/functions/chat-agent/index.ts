// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  // 1. Manejo de CORS (Permitir peticiones desde cualquier origen)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Obtener datos del cuerpo de la petición
    const body = await req.json().catch(() => null);
    const phone: string | undefined = body?.phone;
    const name: string | undefined = body?.name;
    const messageBody: string | undefined = body?.message_body;

    // Validación básica: Si no hay teléfono o mensaje, error.
    if (!phone || !messageBody) {
      return new Response(
        JSON.stringify({ error: "Faltan datos obligatorios: phone y message_body" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Inicializar clientes con Variables de Entorno
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // Usa la Service Role Key para permisos de escritura
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      throw new Error("Faltan variables de entorno (SUPABASE_URL, SERVICE_KEY o GEMINI_API_KEY)");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. GESTIÓN DE LEAD (Upsert: Crear o Actualizar)
    // Buscamos al usuario por teléfono. Si existe, actualizamos 'ultima_interaccion'. Si no, lo creamos.
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .upsert(
        {
          telefono: phone,
          nombre: name ?? null, // Solo actualiza el nombre si viene en la petición
          ultima_interaccion: new Date().toISOString(),
        },
        { onConflict: "telefono" }
      )
      .select("id")
      .single();

    if (leadError || !leadRow) {
      console.error("Error gestionando Lead:", leadError);
      throw new Error("No se pudo guardar o recuperar el lead");
    }

    const leadId = leadRow.id;

    // 5. PROCESAMIENTO PARALELO (Velocidad)
    // Ejecutamos 3 tareas al tiempo: Guardar mensaje usuario, Buscar historial, Buscar en FAQ.
    
    // Preparamos búsqueda simple en FAQ (coincidencia de texto)
    const searchTerm = messageBody.slice(0, 100); 
    const likeQuery = `%${searchTerm}%`;

    const [insertUserMsg, historyResult, faqResult] = await Promise.all([
      // Tarea A: Guardar mensaje del usuario en la base de datos
      supabase.from("whatsapp_mensajes").insert({
        lead_id: leadId,
        role: "user",
        mensaje_texto: messageBody,
        tipo: "text",
        creado_en: new Date().toISOString(),
      }),

      // Tarea B: Recuperar los últimos 5 mensajes para contexto (memoria a corto plazo)
      supabase
        .from("whatsapp_mensajes")
        .select("role, mensaje_texto")
        .eq("lead_id", leadId)
        .order("creado_en", { ascending: false })
        .limit(6),

      // Tarea C: Buscar en la base de conocimiento (FAQ)
      supabase
        .from("faq")
        .select("pregunta, respuesta")
        .or(`pregunta.ilike.${likeQuery},respuesta.ilike.${likeQuery}`)
        .limit(3),
    ]);

    if (insertUserMsg.error) console.error("Error guardando mensaje usuario:", insertUserMsg.error);

    // 6. PREPARAR CONTEXTO PARA LA IA
    
    // Formatear Historial
    const conversationHistory = (historyResult.data ?? [])
      .slice()
      .reverse() // Poner en orden cronológico (antiguo -> nuevo)
      .map((m) => `${m.role === "assistant" ? "Dany" : "Usuario"}: ${m.mensaje_texto}`)
      .join("\n");

    // Formatear FAQ encontrada
    const faqContext = (faqResult.data ?? [])
      .map((row) => `P: ${row.pregunta}\nR: ${row.respuesta}`)
      .join("\n\n");

    // 7. CONSTRUIR EL PROMPT DE SISTEMA
    const systemPrompt = `
      Eres 'Dany', el asistente virtual experto de la Academia Crystal Diamante.
      Tu misión es responder dudas sobre cursos de belleza, uñas y agendar citas de forma amable y profesional.

      REGLAS DE RESPUESTA:
      1. Usa la INFORMACIÓN DE FAQ abajo como tu fuente de verdad principal.
      2. Si la respuesta está en el FAQ, úsala. Si NO está, responde: "Para esa consulta específica, voy a transferirte con un asesor humano 👩‍💻". NO inventes precios ni fechas.
      3. Sé conciso (máximo 3 oraciones). Usa emojis suaves (✨, 💅, 🎓).
      4. Habla en español latino (Colombia), trata de "tú" de forma respetuosa.
      5. Si el usuario saluda, responde el saludo y pregunta en qué puedes ayudar.

      INFORMACIÓN DE LA ACADEMIA (FAQ ENCONTRADA):
      "${faqContext || "No se encontró información específica en la base de datos para esta pregunta."}"

      HISTORIAL RECIENTE DE CHAT:
      ${conversationHistory}

      USUARIO DICE:
      "${messageBody}"

      RESPUESTA DE DANY:
    `;

    // 8. LLAMADA A GEMINI
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(systemPrompt);
    const replyText = result.response.text().trim();

    // 9. GUARDAR RESPUESTA DEL ASISTENTE (Sin bloquear la respuesta HTTP si es posible, pero await es seguro en Serverless)
    await supabase.from("whatsapp_mensajes").insert({
      lead_id: leadId,
      role: "assistant",
      mensaje_texto: replyText,
      tipo: "text",
      creado_en: new Date().toISOString(),
    });

    // 10. RETORNAR RESPUESTA AL CLIENTE (MAKE / API)
    return new Response(JSON.stringify({ reply: replyText }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error Fatal en Edge Function:", error);
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});