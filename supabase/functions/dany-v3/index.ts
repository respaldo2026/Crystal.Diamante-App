import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Manejo de CORS (Permisos)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Leer el cuerpo del mensaje
    const body = await req.json()
    const message = body.message || body.name || "Sin mensaje"

    // 3. Respuesta simple (Eco) para confirmar que funciona
    const respuesta = {
      reply: `¡Dany v3 actualizado! Recibí: "${message}"`,
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(respuesta), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Si algo falla, no explotamos: avisamos el error
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})