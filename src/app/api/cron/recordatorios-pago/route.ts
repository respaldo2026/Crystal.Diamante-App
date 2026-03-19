import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService } from '@/services/whatsapp-service';
import { getPaymentPlan, normalizeModalidadPago } from '@/types/payment-plans';

export const runtime = 'nodejs';

const FALLBACK_REMINDER_TEMPLATE = 'recordatorio_pago_v3';
const DEFAULT_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_RECORDATORIO_PAGO || FALLBACK_REMINDER_TEMPLATE;
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_MAX_BULK_PER_RUN || 30);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_DELAY_BETWEEN_SENDS_MS || 1200);
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_ALLOW_TEXT_FALLBACK || 'false').toLowerCase() === 'true';
const MAX_REMINDERS_PER_PAYMENT = Number(process.env.WHATSAPP_MAX_REMINDERS_PER_PAYMENT || 2);
const MIN_HOURS_BETWEEN_REMINDERS = Number(process.env.WHATSAPP_MIN_HOURS_BETWEEN_REMINDERS || 20);

function resolveReminderTemplateName(): string {
  const configured = String(DEFAULT_TEMPLATE_NAME || '').trim();
  if (!configured) return FALLBACK_REMINDER_TEMPLATE;

  const normalized = configured.toLowerCase();
  const looksLikePaymentConfirmation = /pago[_-]?recibido|confirm(acion|ar)?[_-]?pago|payment[_-]?received/.test(normalized);

  if (looksLikePaymentConfirmation) {
    console.warn(
      `[Recordatorio] Plantilla configurada parece de confirmacion de pago (${configured}). ` +
      `Se fuerza fallback seguro: ${FALLBACK_REMINDER_TEMPLATE}.`
    );
    return FALLBACK_REMINDER_TEMPLATE;
  }

  return configured;
}

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

async function saveTemplateAuditConversation(
  supabase: any,
  input: {
    phone: string;
    profileName?: string;
    templateName: string;
    templateLanguage: string;
    templateVariables: string[];
    messageId?: string;
    paymentId?: string;
    studentId?: string;
    matriculaId?: string;
  }
): Promise<void> {
  try {
    const payload = {
      phone_number: input.phone,
      user_message: '[SISTEMA] Recordatorio por plantilla',
      agent_response:
        `📤 Plantilla enviada: ${input.templateName}\n` +
        `Idioma: ${input.templateLanguage}\n` +
        `Pago ID: ${input.paymentId || '-'}\n` +
        `Estudiante ID: ${input.studentId || '-'}\n` +
        `Matrícula ID: ${input.matriculaId || '-'}\n` +
        `Variables: ${input.templateVariables.length ? input.templateVariables.join(' | ') : '-'}\n` +
        `Meta Message ID: ${input.messageId || 'sin ID'}`,
      transcription: null,
      channel: 'whatsapp',
      profile_name: input.profileName || null,
    };

    let { error } = await supabase.from('agent_conversations').insert(payload);

    if (error && /column .* does not exist/i.test(String(error.message || ''))) {
      const fallbackPayload = {
        phone_number: input.phone,
        user_message: payload.user_message,
        agent_response: payload.agent_response,
        transcription: null,
      };
      const retry = await supabase.from('agent_conversations').insert(fallbackPayload);
      error = retry.error;
    }

    if (error) {
      console.warn('[Recordatorio] Error guardando auditoria de plantilla:', error);
    }
  } catch (error) {
    console.warn('[Recordatorio] Excepcion guardando auditoria de plantilla:', error);
  }
}

async function getReminderStatsForPayment(supabase: any, paymentId: string): Promise<{ count: number; lastSentAt: Date | null }> {
  try {
    if (!paymentId) return { count: 0, lastSentAt: null };

    const { data, error } = await supabase
      .from('agent_conversations')
      .select('created_at')
      .eq('user_message', '[SISTEMA] Recordatorio por plantilla')
      .ilike('agent_response', `%Pago ID: ${paymentId}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('[Recordatorio] Error consultando historial por pago:', error);
      return { count: 0, lastSentAt: null };
    }

    const rows = data || [];
    const count = rows.length;
    const lastSentAt = rows[0]?.created_at ? new Date(rows[0].created_at) : null;
    return { count, lastSentAt };
  } catch (error) {
    console.warn('[Recordatorio] Excepción consultando historial por pago:', error);
    return { count: 0, lastSentAt: null };
  }
}

async function hasRecentReminderForPhone(supabase: any, phone: string, hours: number): Promise<boolean> {
  try {
    if (!phone) return false;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('agent_conversations')
      .select('created_at')
      .eq('user_message', '[SISTEMA] Recordatorio por plantilla')
      .eq('phone_number', phone)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[Recordatorio] Error consultando historial por teléfono:', error);
      return false;
    }

    return Boolean((data || []).length);
  } catch (error) {
    console.warn('[Recordatorio] Excepción consultando historial por teléfono:', error);
    return false;
  }
}

// Función para enviar WhatsApp usando plantilla aprobada por Meta
async function enviarWhatsAppDirecto(telefono: string, nombre: string, monto: string, fecha: string, curso: string, modalidad: string, esVencido?: boolean) {
  let mensajeModalidad: string;
  if (modalidad === 'POR_CLASE') {
    mensajeModalidad = esVencido
      ? `Tienes una clase sin pagar que venció el ${fecha}. Por favor regulariza tu pago para continuar asistiendo.`
      : `Este recordatorio corresponde a clases asistidas pendientes de pago (vence el ${fecha}).`;
  } else {
    mensajeModalidad = 'Te recordamos que tu mensualidad está próxima a vencer.';
  }

  const mensaje = `Hola ${nombre} 👋

${mensajeModalidad}

💰 *Monto:* ${monto}
📖 *Curso:* ${curso}
🧾 *Modalidad:* ${modalidad}
📅 *Periodo:* ${fecha}

Puedes pagar en línea o en nuestra oficina. ¡Gracias!

_Academia Crystal_`;

  try {
    const reminderTemplateName = resolveReminderTemplateName();
    const templateVariables = [
      nombre,
      monto,
      curso,
      fecha,
    ];

    const response = await WhatsAppService.sendTemplate(
      telefono,
      reminderTemplateName,
      templateVariables,
      'es_CO'
    );

    console.log(`[Recordatorio] Enviado template a ${telefono}: ${response.messages?.[0]?.id || 'sin ID'}`);
    return {
      response,
      usedTemplate: true,
      templateName: reminderTemplateName,
      templateVariables,
      templateLanguage: 'es_CO',
    };
  } catch (error) {
    if (ALLOW_TEXT_FALLBACK) {
      console.warn(`[Recordatorio] Falló template, usando fallback texto para ${telefono}`);
      const fallback = await WhatsAppService.sendText(telefono, mensaje);
      return {
        response: fallback,
        usedTemplate: false,
        templateName: '',
        templateVariables: [] as string[],
        templateLanguage: 'es_CO',
      };
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

    const [{ data: cuotasProximas, error }, { data: cuotasPorClaseVencidas }] = await Promise.all([
      // 1. Cuotas próximas a vencer (todos los planes)
      supabase
        .from('pagos')
        .select('id, estado, monto, fecha_vencimiento, numero_cuota, estudiante_id, matricula_id')
        .eq('estado', 'pendiente')
        .gte('fecha_vencimiento', hoy)
        .lte('fecha_vencimiento', en3Dias),
      // 2. Cobros por clase ya vencidos (>7 días sin pagar)
      supabase
        .from('pagos')
        .select('id, estado, monto, fecha_vencimiento, numero_cuota, estudiante_id, matricula_id')
        .in('estado', ['pendiente', 'vencido'])
        .eq('tipo_cuota', 'por_clase')
        .lt('fecha_vencimiento', hoy),
    ]);

    if (error) {
      console.error('[Recordatorio] Error en query pagos:', error);
      throw error;
    }

    // Deduplicar — priorizar cuotasProximas
    const seenIds = new Set<string>();
    const cuotas: any[] = [];
    for (const c of (cuotasProximas || [])) { seenIds.add(String(c.id)); cuotas.push(c); }
    for (const c of (cuotasPorClaseVencidas || [])) {
      if (!seenIds.has(String(c.id))) { seenIds.add(String(c.id)); cuotas.push(c); }
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
        const paymentId = String(cuota?.id || '');

        // Revalidar estado justo antes de enviar: si ya pagó, no enviar.
        if (paymentId) {
          const { data: pagoActual, error: pagoError } = await supabase
            .from('pagos')
            .select('estado')
            .eq('id', paymentId)
            .maybeSingle();

          if (pagoError) {
            console.warn(`[Recordatorio] No se pudo revalidar estado del pago ${paymentId}:`, pagoError);
          }

          const estadoActual = String(pagoActual?.estado || cuota?.estado || '').toLowerCase();
          if (estadoActual && estadoActual !== 'pendiente') {
            console.log(`[Recordatorio] Pago ${paymentId} ya no está pendiente (${estadoActual}). Se omite.`);
            omitidos++;
            continue;
          }
        }

        // Máximo 1-2 recordatorios por pago (configurable), con cooldown mínimo.
        const stats = await getReminderStatsForPayment(supabase, paymentId);
        if (stats.count >= MAX_REMINDERS_PER_PAYMENT) {
          console.log(`[Recordatorio] Tope por pago alcanzado (${paymentId}): ${stats.count} envíos.`);
          omitidos++;
          continue;
        }

        if (stats.lastSentAt) {
          const hoursSinceLast = (Date.now() - stats.lastSentAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLast < MIN_HOURS_BETWEEN_REMINDERS) {
            console.log(`[Recordatorio] Cooldown activo para pago ${paymentId}: ${hoursSinceLast.toFixed(1)}h.`);
            omitidos++;
            continue;
          }
        }

        const telefono = telefonoNormalizado;

        // Evitar spam por teléfono (por si hay múltiples cuotas cercanas del mismo estudiante).
        const recentlyContacted = await hasRecentReminderForPhone(supabase, telefono, MIN_HOURS_BETWEEN_REMINDERS);
        if (recentlyContacted) {
          console.log(`[Recordatorio] Teléfono ${telefono} ya recibió recordatorio reciente. Se omite.`);
          omitidos++;
          continue;
        }

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
        const esCuotaVencida = hoy && cuota?.fecha_vencimiento && cuota.fecha_vencimiento < hoy;

        const sendResult = await enviarWhatsAppDirecto(
          telefono,
          perfil.nombre_completo,
          monto,
          fecha,
          curso,
          modalidadPago,
          Boolean(esCuotaVencida)
        );

        if (sendResult.usedTemplate) {
          await saveTemplateAuditConversation(supabase, {
            phone: telefono,
            profileName: perfil.nombre_completo,
            templateName: sendResult.templateName,
            templateLanguage: sendResult.templateLanguage,
            templateVariables: sendResult.templateVariables,
            messageId: sendResult.response.messages?.[0]?.id,
            paymentId,
            studentId: String(cuota?.estudiante_id || ''),
            matriculaId: String(cuota?.matricula_id || ''),
          });
        }

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
        template: resolveReminderTemplateName(),
        textFallback: ALLOW_TEXT_FALLBACK,
        maxSendsPerRun: MAX_SENDS_PER_RUN,
        maxRemindersPerPayment: MAX_REMINDERS_PER_PAYMENT,
        minHoursBetweenReminders: MIN_HOURS_BETWEEN_REMINDERS,
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
