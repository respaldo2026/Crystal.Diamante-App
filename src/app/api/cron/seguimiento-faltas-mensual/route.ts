import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService } from '@/services/whatsapp-service';

export const runtime = 'nodejs';

const AUDIT_MARKER = '[SISTEMA] Seguimiento faltas mensual';
const FALLBACK_TEMPLATE_NAME = 'seguimiento_faltas_mensual';
const TEMPLATE_NAME = String(process.env.WHATSAPP_TEMPLATE_SEGUIMIENTO_FALTAS || FALLBACK_TEMPLATE_NAME).trim();
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_SEGUIMIENTO_FALTAS_LANG || 'es_CO').trim();
const ALLOW_TEXT_FALLBACK = String(process.env.WHATSAPP_SEGUIMIENTO_FALTAS_ALLOW_TEXT_FALLBACK || 'true').toLowerCase() === 'true';
const MAX_SENDS_PER_RUN = Number(process.env.WHATSAPP_SEGUIMIENTO_FALTAS_MAX_SENDS || 40);
const DELAY_BETWEEN_SENDS_MS = Number(process.env.WHATSAPP_SEGUIMIENTO_FALTAS_DELAY_MS || 1000);
const MAX_SENDS_PER_MONTH = Number(process.env.WHATSAPP_SEGUIMIENTO_FALTAS_MAX_PER_MONTH || 2);
const DEFAULT_COURSE_MONTHS = Number(process.env.WHATSAPP_SEGUIMIENTO_FALTAS_COURSE_MONTHS_FALLBACK || 5);

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

function getTodayBogotaIso(): string {
  const bogotaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  bogotaNow.setHours(0, 0, 0, 0);
  return bogotaNow.toISOString().slice(0, 10);
}

function getMonthKey(dateIso: string): string {
  return String(dateIso || '').slice(0, 7);
}

function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const normalized = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  return normalized;
}

function addMonthsIso(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function isInactiveEstado(estado?: string | null): boolean {
  const normalized = String(estado || '').trim().toLowerCase();
  return ['cancelado', 'cancelada', 'retirado', 'retirada', 'anulado', 'anulada', 'inactiva'].includes(normalized);
}

function isDentroVentanaCurso(hoy: string, fechaInicio?: string | null, fechaFin?: string | null): boolean {
  const inicio = toIsoDate(fechaInicio);
  if (!inicio) return false;

  const finReal = toIsoDate(fechaFin) || addMonthsIso(inicio, DEFAULT_COURSE_MONTHS);
  return hoy >= inicio && hoy <= finReal;
}

function countAusenciasEnVentana(
  fechasAusencias: string[],
  fechaInicio?: string | null,
  fechaFin?: string | null,
): number {
  const inicio = toIsoDate(fechaInicio);
  if (!inicio) return 0;

  const fin = toIsoDate(fechaFin) || addMonthsIso(inicio, DEFAULT_COURSE_MONTHS);
  return fechasAusencias.filter((fecha) => fecha >= inicio && fecha <= fin).length;
}

async function getMonthlySendsForMatricula(
  supabase: any,
  matriculaId: string,
  monthKey: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('agent_conversations')
      .select('id')
      .eq('user_message', AUDIT_MARKER)
      .ilike('agent_response', `%month:${monthKey}%`)
      .ilike('agent_response', `%matricula:${matriculaId}%`)
      .limit(10);

    if (error) {
      console.warn('[SeguimientoFaltas] Error consultando envios mensuales:', error);
      return 0;
    }

    return (data || []).length;
  } catch (error) {
    console.warn('[SeguimientoFaltas] Excepcion consultando envios mensuales:', error);
    return 0;
  }
}

async function saveAuditConversation(
  supabase: any,
  input: {
    phone: string;
    profileName?: string;
    matriculaId: string;
    cursoNombre: string;
    faltas: number;
    monthKey: string;
    templateName: string;
    templateLanguage: string;
    templateVariables: string[];
    messageId?: string;
    dryRun?: boolean;
  },
): Promise<void> {
  try {
    // No grabar si es dry-run (solo es para validación)
    if (input.dryRun) {
      console.log('[SeguimientoFaltas] Auditoría no grabada (dry-run)');
      return;
    }

    // Mensaje amigable que representa lo que se envió al cliente
    const agentResponse =
      `💬 Mensaje de seguimiento por faltas\n` +
      `Estudiante: ${input.profileName || 'N/A'}\n` +
      `Curso: ${input.cursoNombre}\n` +
      `Faltas registradas: ${input.faltas}\n` +
      `\n` +
      `Mensaje enviado:\n` +
      `"${input.templateVariables[0]}, vimos que en ${input.templateVariables[1]} acumulas ${input.templateVariables[2]} faltas. ` +
      `Queremos saber que ha pasado y como podemos apoyarte para que sigas y termines con exito. ` +
      `Tu continuidad es muy importante para lograr tu meta. Academia Crystal."\n` +
      `\n` +
      `Meta Message ID: ${input.messageId || 'sin ID'}\n` +
      `Período: ${input.monthKey}`;

    const payload = {
      phone_number: input.phone,
      user_message: AUDIT_MARKER,
      agent_response: agentResponse,
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
      console.warn('[SeguimientoFaltas] Error guardando auditoria:', error);
    } else {
      console.log('[SeguimientoFaltas] Auditoría grabada correctamente para matrícula:', input.matriculaId);
    }
  } catch (error) {
    console.warn('[SeguimientoFaltas] Excepcion guardando auditoria:', error);
  }
}

function buildFallbackText(input: { nombre: string; curso: string; faltas: number }): string {
  return (
    `Hola ${input.nombre}, notamos que en ${input.curso} registras ${input.faltas} faltas. ` +
    `Queremos saber que ha pasado y como podemos apoyarte para que sigas y termines el proceso. ` +
    `Tu continuidad es muy importante para lograr tu meta. Academia Crystal.`
  );
}

async function runSeguimientoFaltasJob(request: NextRequest): Promise<NextResponse> {
  const dryRun = String(request.nextUrl.searchParams.get('dryRun') || 'false').toLowerCase() === 'true';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan variables de Supabase para ejecutar seguimiento de faltas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const hoy = getTodayBogotaIso();
  const monthKey = getMonthKey(hoy);

  const { data: matriculasData, error: matriculasError } = await supabase
    .from('matriculas')
    .select('id, estudiante_id, curso_id, estado, fecha_inicio')
    .not('estudiante_id', 'is', null)
    .not('curso_id', 'is', null);

  if (matriculasError) throw matriculasError;

  const matriculas = (matriculasData || []).filter((m: any) => !isInactiveEstado(m?.estado));
  if (!matriculas.length) {
    return NextResponse.json({
      success: true,
      mensaje: 'No hay matrículas elegibles',
      enviados: 0,
      omitidos: 0,
      fallidos: 0,
      dryRun,
    });
  }

  const cursoIds = Array.from(new Set(matriculas.map((m: any) => Number(m.curso_id)).filter((v: any) => Number.isFinite(v))));
  const estudianteIds = Array.from(new Set(matriculas.map((m: any) => String(m.estudiante_id)).filter(Boolean)));
  const matriculaIds = matriculas.map((m: any) => String(m.id));

  const [{ data: cursosData }, { data: perfilesData }, { data: asistenciasData }] = await Promise.all([
    supabase.from('cursos').select('id, nombre, fecha_inicio, fecha_fin').in('id', cursoIds),
    supabase
      .from('perfiles')
      .select('id, nombre_completo, telefono, notif_whatsapp')
      .in('id', estudianteIds),
    supabase
      .from('asistencias')
      .select('matricula_id, fecha, estado')
      .in('matricula_id', matriculaIds)
      .eq('estado', 'ausente')
      .lte('fecha', hoy),
  ]);

  const cursosById = new Map<number, any>((cursosData || []).map((row: any) => [Number(row.id), row]));
  const perfilesById = new Map<string, any>((perfilesData || []).map((row: any) => [String(row.id), row]));

  const ausenciasByMatricula = new Map<string, string[]>();
  for (const row of asistenciasData || []) {
    const matriculaId = String((row as any)?.matricula_id || '');
    const fecha = toIsoDate((row as any)?.fecha);
    if (!matriculaId || !fecha) continue;
    const current = ausenciasByMatricula.get(matriculaId) || [];
    current.push(fecha);
    ausenciasByMatricula.set(matriculaId, current);
  }

  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;
  const telefonosProcesados = new Set<string>();

  for (const matricula of matriculas) {
    if (enviados >= MAX_SENDS_PER_RUN) break;

    const matriculaId = String(matricula.id || '');
    const curso = cursosById.get(Number(matricula.curso_id));
    const perfil = perfilesById.get(String(matricula.estudiante_id));

    if (!matriculaId || !curso || !perfil) {
      omitidos++;
      continue;
    }

    const fechaInicioCurso = toIsoDate(curso.fecha_inicio) || toIsoDate(matricula.fecha_inicio);
    const fechaFinCurso = toIsoDate(curso.fecha_fin) || (fechaInicioCurso ? addMonthsIso(fechaInicioCurso, DEFAULT_COURSE_MONTHS) : null);

    if (!isDentroVentanaCurso(hoy, fechaInicioCurso, fechaFinCurso)) {
      omitidos++;
      continue;
    }

    if (!perfil.telefono || perfil.notif_whatsapp === false) {
      omitidos++;
      continue;
    }

    const telefono = normalizePhone(String(perfil.telefono || ''));
    if (!telefono) {
      omitidos++;
      continue;
    }

    if (telefonosProcesados.has(telefono)) {
      omitidos++;
      continue;
    }

    const totalFaltas = countAusenciasEnVentana(
      ausenciasByMatricula.get(matriculaId) || [],
      fechaInicioCurso,
      fechaFinCurso,
    );

    if (totalFaltas < 1 || totalFaltas > 4) {
      omitidos++;
      continue;
    }

    const sendsThisMonth = await getMonthlySendsForMatricula(supabase, matriculaId, monthKey);
    if (sendsThisMonth >= MAX_SENDS_PER_MONTH) {
      omitidos++;
      continue;
    }

    const nombre = String(perfil.nombre_completo || 'Estudiante').trim() || 'Estudiante';
    const cursoNombre = String(curso.nombre || 'tu curso').trim() || 'tu curso';
    const templateVariables = [nombre, cursoNombre, String(totalFaltas)];

    try {
      let messageId = 'dry-run';

      if (!dryRun) {
        try {
          const response = await WhatsAppService.sendTemplate(
            telefono,
            TEMPLATE_NAME,
            templateVariables,
            TEMPLATE_LANG,
          );
          messageId = String(response.messages?.[0]?.id || 'sin ID');
        } catch (templateError) {
          if (!ALLOW_TEXT_FALLBACK) throw templateError;

          const fallbackText = buildFallbackText({ nombre, curso: cursoNombre, faltas: totalFaltas });
          const response = await WhatsAppService.sendText(telefono, fallbackText);
          messageId = String(response.messages?.[0]?.id || 'sin ID');
        }
      }

      await saveAuditConversation(supabase, {
        phone: telefono,
        profileName: nombre,
        matriculaId,
        cursoNombre,
        faltas: totalFaltas,
        monthKey,
        templateName: TEMPLATE_NAME,
        templateLanguage: TEMPLATE_LANG,
        templateVariables,
        messageId,
        dryRun,
      });

      enviados++;
      telefonosProcesados.add(telefono);

      if (!dryRun && DELAY_BETWEEN_SENDS_MS > 0) {
        await sleep(DELAY_BETWEEN_SENDS_MS);
      }
    } catch (error) {
      console.error(`[SeguimientoFaltas] Error enviando a ${nombre}:`, error);
      fallidos++;
    }
  }

  return NextResponse.json({
    success: true,
    mensaje: `${enviados} seguimientos enviados, ${fallidos} fallidos, ${omitidos} omitidos`,
    resumen: {
      enviados,
      fallidos,
      omitidos,
      monthKey,
      maxPerMonth: MAX_SENDS_PER_MONTH,
      rangoFaltasObjetivo: '1-4',
      dryRun,
      template: TEMPLATE_NAME,
      templateLanguage: TEMPLATE_LANG,
    },
    timestamp: new Date().toISOString(),
  });
}

function isAuthorized(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && process.env.CRON_API_KEY && apiKey === process.env.CRON_API_KEY) {
    return true;
  }

  const auth = request.headers.get('authorization');
  if (auth && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return await runSeguimientoFaltasJob(request);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Error ejecutando seguimiento de faltas',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return await runSeguimientoFaltasJob(request);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Error ejecutando seguimiento de faltas',
      },
      { status: 500 },
    );
  }
}
