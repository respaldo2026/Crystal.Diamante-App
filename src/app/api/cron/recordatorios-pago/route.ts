import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// Función para enviar WhatsApp de forma simple (sin usar el módulo completo)
async function enviarWhatsAppDirecto(telefono: string, nombre: string, monto: string, fecha: string, curso: string) {
  const mensaje = `Hola ${nombre} 👋

Te recordamos que tu cuota de ${fecha} está próxima a vencer.

💰 *Monto:* ${monto}
📖 *Curso:* ${curso}

Puedes pagar en línea o en nuestra oficina. ¡Gracias!

_Academia Crystal_`;

  try {
    const response = await fetch('https://graph.instagram.com/v21.0/794398730428114/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono.replace('+', ''),
        type: 'text',
        text: { body: mensaje },
      }),
    });

    const data = await response.json();
    console.log(`[Recordatorio] Enviado a ${telefono}: ${data.messages?.[0]?.id || 'sin ID'}`);
    return data;
  } catch (error) {
    console.error(`[Recordatorio] Error enviando a ${telefono}:`, error);
    throw error;
  }
}

type CookieOptions = {
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
};

export async function POST(request: NextRequest) {
  // Verificar x-api-key para evitar ejecuciones no autorizadas
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.CRON_API_KEY) {
    console.log('[Recordatorio] Intento no autorizado');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: (_name: string, _value: string, _options?: CookieOptions) => {
            // No-op en cron: no se requieren cookies de sesión
          },
          remove: (_name: string, _options?: CookieOptions) => {
            // No-op en cron: no se requieren cookies de sesión
          },
        },
      }
    );

    // Obtener cuotas pendientes que vencen en los próximos 3 días
    const hoy = new Date().toISOString().split('T')[0];
    const en3Dias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: cuotas, error } = await supabase
      .from('pagos')
      .select(
        `
        id,
        monto,
        fecha_vencimiento,
        numero_cuota,
        estudiante_id,
        perfiles(nombre_completo, telefono, notif_whatsapp),
        matriculas(cursos(nombre))
      `
      )
      .eq('estado', 'pendiente')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en3Dias);

    if (error) {
      console.error('[Recordatorio] Error en query:', error);
      throw error;
    }

    console.log(`[Recordatorio] Encontradas ${cuotas?.length || 0} cuotas pendientes`);

    let enviados = 0;
    let fallidos = 0;

    for (const cuota of cuotas || []) {
      const perfil = cuota.perfiles as any;
      const matricula = cuota.matriculas as any;

      // Validar que tenga teléfono y notificaciones habilitadas
      if (!perfil?.telefono) {
        console.log(`[Recordatorio] Sin teléfono para estudiante ${cuota.estudiante_id}`);
        continue;
      }

      if (perfil.notif_whatsapp === false) {
        console.log(`[Recordatorio] Notificaciones deshabilitadas para ${perfil.nombre_completo}`);
        continue;
      }

      try {
        const telefono = perfil.telefono.startsWith('+') ? perfil.telefono : `+${perfil.telefono}`;
        const fecha = new Date(cuota.fecha_vencimiento).toLocaleDateString('es-CO', { month: 'long' });
        const monto = `$${Number(cuota.monto).toLocaleString()}`;
        const curso = matricula?.cursos?.nombre || 'Curso';

        await enviarWhatsAppDirecto(
          telefono,
          perfil.nombre_completo,
          monto,
          fecha,
          curso
        );

        enviados++;
      } catch (err) {
        console.error(`[Recordatorio] Error enviando a ${perfil.nombre_completo}:`, err);
        fallidos++;
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `${enviados} recordatorios enviados, ${fallidos} fallidos`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Recordatorio] Error general:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
