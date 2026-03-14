import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService } from '@/services/whatsapp-service';
import { getPaymentPlan, normalizeModalidadPago } from '@/types/payment-plans';

export const runtime = 'nodejs';

const DEFAULT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_RECORDATORIO_PAGO || 'recordatorio_pago_v3';
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_MAX_BULK_PER_RUN || 30);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_DELAY_BETWEEN_SENDS_MS || 1200);
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_ALLOW_TEXT_FALLBACK || 'false').toLowerCase() === 'true';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(telefono: string): string {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  if (digits.startsWith('00') && digits.length > 2) return digits.slice(2);
  return digits;
}

// Función para enviar WhatsApp usando plantilla aprobada por Meta
async function enviarWhatsAppDirecto(telefono: string, nombre: string, monto: string, fecha: string, curso: string, modalidad: string) {
  const mensajeModalidad = modalidad === 'POR_CLASE'
    ? 'Este recordatorio corresponde a clases asistidas pendientes de pago.'
    : 'Te recordamos que tu mensualidad está próxima a vencer.';

  const mensaje = `Hola ${nombre} 👋

${mensajeModalidad}

💰 *Monto:* ${monto}
📖 *Curso:* ${curso}
🧾 *Modalidad:* ${modalidad}
📅 *Periodo:* ${fecha}

Puedes pagar en línea o en nuestra oficina. ¡Gracias!

_Academia Crystal_`;

  try {
    const templateVariables = [
      nombre,
      monto,
      curso,
      fecha,
    ];

    const response = await WhatsAppService.sendTemplate(
      telefono,
      DEFAULT_TEMPLATE_NAME,
      templateVariables,
      'es_CO'
    );

    console.log(`[Recordatorio] Enviado template a ${telefono}: ${response.messages?.[0]?.id || 'sin ID'}`);
    return response;
  } catch (error) {
    if (ALLOW_TEXT_FALLBACK) {
      console.warn(`[Recordatorio] Falló template, usando fallback texto para ${telefono}`);
      const fallback = await WhatsAppService.sendText(telefono, mensaje);
      return fallback;
    }

    console.error(`[Recordatorio] Error enviando a ${telefono}:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  // Verificar x-api-key para evitar ejecuciones no autorizadas
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.CRON_API_KEY) {
    console.log('[Recordatorio] Intento no autorizado');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runRecordatoriosJob();
}

async function runRecordatoriosJob(): Promise<NextResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Faltan variables de Supabase para ejecutar recordatorios');
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Obtener cuotas pendientes que vencen en los próximos 3 días
    const hoy = new Date().toISOString().split('T')[0];
    const en3Dias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: cuotas, error } = await supabase
      .from('pagos')
      .select('id, monto, fecha_vencimiento, numero_cuota, estudiante_id, matricula_id')
      .eq('estado', 'pendiente')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en3Dias);

    if (error) {
      console.error('[Recordatorio] Error en query pagos:', error);
      throw error;
    }

    if (!cuotas || cuotas.length === 0) {
      console.log('[Recordatorio] No hay cuotas próximas a vencer');
      return NextResponse.json({ success: true, mensaje: '0 recordatorios enviados, 0 fallidos, 0 omitidos', timestamp: new Date().toISOString() });
    }

    // Consultas separadas para evitar ambigüedad de FK en PostgREST
    const estudianteIds = [...new Set(cuotas.map((c: any) => c.estudiante_id).filter(Boolean))];
    const matriculaIds = [...new Set(cuotas.map((c: any) => c.matricula_id).filter(Boolean))];

    const [{ data: perfilesData }, { data: matriculasData }] = await Promise.all([
      supabase.from('perfiles').select('id, nombre_completo, telefono, notif_whatsapp').in('id', estudianteIds),
      supabase.from('matriculas').select('id, modalidad_pago, valor_mensual_plan, cursos(nombre)').in('id', matriculaIds),
    ]);

    const perfilesMap: Record<string, any> = Object.fromEntries((perfilesData || []).map((p: any) => [p.id, p]));
    const matriculasMap: Record<string, any> = Object.fromEntries((matriculasData || []).map((m: any) => [m.id, m]));

    console.log(`[Recordatorio] Encontradas ${cuotas.length} cuotas pendientes`);

    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;
    const telefonosProcesados = new Set<string>();

    for (const cuota of cuotas || []) {
      const perfil = perfilesMap[cuota.estudiante_id];
      const matricula = matriculasMap[cuota.matricula_id];

      if (enviados >= MAX_SENDS_PER_RUN) {
        console.log(`[Recordatorio] Límite por corrida alcanzado (${MAX_SENDS_PER_RUN})`);
        break;
      }

      // Validar que tenga teléfono y notificaciones habilitadas
      if (!perfil?.telefono) {
        console.log(`[Recordatorio] Sin teléfono para estudiante ${cuota.estudiante_id}`);
        omitidos++;
        continue;
      }

      if (perfil.notif_whatsapp === false) {
        console.log(`[Recordatorio] Notificaciones deshabilitadas para ${perfil.nombre_completo}`);
        omitidos++;
        continue;
      }

      const telefonoNormalizado = normalizePhone(perfil.telefono);
      if (!telefonoNormalizado) {
        console.log(`[Recordatorio] Teléfono inválido para ${perfil.nombre_completo}`);
        omitidos++;
        continue;
      }

      if (telefonosProcesados.has(telefonoNormalizado)) {
        console.log(`[Recordatorio] Duplicado evitado para ${telefonoNormalizado}`);
        omitidos++;
        continue;
      }

      try {
        const telefono = telefonoNormalizado;
        const modalidadPago = normalizeModalidadPago(matricula?.modalidad_pago);
        const plan = getPaymentPlan(modalidadPago);

        const fechaMes = cuota?.fecha_vencimiento
          ? new Date(cuota.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long' })
          : 'Próximo corte';
        const fecha = fechaMes.charAt(0).toUpperCase() + fechaMes.slice(1);

        let montoNumero = Number(cuota.monto || 0);
        if (modalidadPago === 'MENSUAL_70' || modalidadPago === 'MENSUAL_100') {
          montoNumero = Number(matricula?.valor_mensual_plan || plan.montoMensual || montoNumero || 0);
        }
        if (modalidadPago === 'POR_CLASE' && montoNumero <= 0) {
          montoNumero = plan.montoPorClase;
        }

        const monto = `$${montoNumero.toLocaleString('es-CO')}`;
        const curso = matricula?.cursos?.nombre || 'Curso';

        await enviarWhatsAppDirecto(
          telefono,
          perfil.nombre_completo,
          monto,
          fecha,
          curso,
          modalidadPago
        );

        telefonosProcesados.add(telefonoNormalizado);
        enviados++;

        if (DELAY_BETWEEN_SENDS_MS > 0) {
          await sleep(DELAY_BETWEEN_SENDS_MS);
        }
      } catch (err) {
        console.error(`[Recordatorio] Error enviando a ${perfil.nombre_completo}:`, err);
        fallidos++;
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `${enviados} recordatorios enviados, ${fallidos} fallidos, ${omitidos} omitidos`,
      recomendaciones: {
        template: DEFAULT_TEMPLATE_NAME,
        textFallback: ALLOW_TEXT_FALLBACK,
        maxSendsPerRun: MAX_SENDS_PER_RUN,
        delayBetweenSendsMs: DELAY_BETWEEN_SENDS_MS,
      },
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

/**
 * GET /api/cron/recordatorios-pago
 * Invocado automáticamente por Vercel Cron con header Authorization: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runRecordatoriosJob();
}
