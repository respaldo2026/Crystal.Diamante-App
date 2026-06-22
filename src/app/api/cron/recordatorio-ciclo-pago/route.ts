/**
 * Cron: recordatorio-ciclo-pago
 *
 * Se ejecuta diariamente. Detecta sesiones programadas en los próximos N días
 * cuyo número de clase sea un punto de corte de ciclo (2, 5, 9, 13, 17) y envía
 * recordatorio de pago por WhatsApp a las estudiantes con matrícula mensual activa
 * que aún no hayan pagado la mensualidad correspondiente a ese ciclo.
 *
 * Lógica de triggers:
 *   Clase 2  → mensualidad 1 (ciclo 1)
 *   Clase 5  → mensualidad 2 (ciclo 2)
 *   Clase 9  → mensualidad 3 (ciclo 3)
 *   Clase 13 → mensualidad 4 (ciclo 4)
 *   Clase 17 → mensualidad 5 (ciclo 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService } from '@/services/whatsapp-service';

export const runtime = 'nodejs';

// ------- Constantes configurables por variable de entorno -------
const DIAS_ANTICIPACION = Number(process.env.CICLO_PAGO_DIAS_ANTICIPACION || 3);
// Clases que disparan recordatorio (primer clase de cada nuevo ciclo de pago)
const TRIGGER_CLASES: number[] = (process.env.CICLO_PAGO_TRIGGER_CLASES || '2,5,9,13,17')
  .split(',')
  .map((n) => parseInt(n.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_RECORDATORIO_PAGO || 'recordatorio_pago_v3';
const ALLOW_TEXT_FALLBACK = String(process.env.CICLO_PAGO_ALLOW_TEXT_FALLBACK || 'false').toLowerCase() === 'true';
const MAX_SENDS_PER_RUN = Number(process.env.CICLO_PAGO_MAX_SENDS || 50);
const DELAY_MS = Number(process.env.CICLO_PAGO_DELAY_MS || 1200);
const MIN_HOURS_COOLDOWN = Number(process.env.CICLO_PAGO_COOLDOWN_HOURS || 20);
const AUTO_SESSION_PATTERN = /sesion programada automaticamente para calculo de ciclos/i;
const AUDIT_MARKER = '[SISTEMA] Recordatorio ciclo pago';

// ------- Utilidades -------
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTodayBogota(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  now.setHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
}

function getTargetDateBogota(daysAhead: number): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + daysAhead);
  return now.toISOString().slice(0, 10);
}

function normalizePhone(telefono: string): string {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  if (digits.startsWith('00') && digits.length > 2) return digits.slice(2);
  return digits;
}

function formatMes(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    const mes = d.toLocaleDateString('es-CO', { month: 'long' });
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  } catch {
    return isoDate;
  }
}

/**
 * Dado el número de clase trigger, retorna el índice 1-based de la mensualidad
 * que corresponde a ese ciclo.
 * Clase 2 → mensualidad 1, Clase 5 → mensualidad 2, etc.
 */
function mensualidadIndexParaClase(claseNum: number): number {
  const sorted = [...TRIGGER_CLASES].sort((a, b) => a - b);
  const idx = sorted.indexOf(claseNum);
  return idx >= 0 ? idx + 1 : 1;
}

/**
 * Verifica si ya se envió recordatorio de ciclo-pago a este teléfono/matricula
 * dentro del cooldown de horas configurado.
 */
async function hasCooldownActivo(
  supabase: any,
  telefono: string,
  matriculaId: string,
  mensualidadIndex: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - MIN_HOURS_COOLDOWN * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('agent_conversations')
      .select('id')
      .eq('user_message', AUDIT_MARKER)
      .eq('phone_number', telefono)
      .ilike('agent_response', `%matricula:${matriculaId}%mensualidad:${mensualidadIndex}%`)
      .gte('created_at', since)
      .limit(1);
    return Boolean((data || []).length);
  } catch {
    return false;
  }
}

async function saveAudit(
  supabase: any,
  input: {
    telefono: string;
    nombre: string;
    matriculaId: string;
    cursoNombre: string;
    mensualidadIndex: number;
    claseNumero: number;
    messageId?: string;
  },
): Promise<void> {
  try {
    const payload = {
      phone_number: input.telefono,
      user_message: AUDIT_MARKER,
      agent_response:
        `📤 Recordatorio ciclo pago enviado\n` +
        `Estudiante: ${input.nombre}\n` +
        `Curso: ${input.cursoNombre}\n` +
        `Clase disparadora: #${input.claseNumero}\n` +
        `mensualidad:${input.mensualidadIndex}\n` +
        `matricula:${input.matriculaId}\n` +
        `Meta Message ID: ${input.messageId || 'sin ID'}`,
      transcription: null,
      channel: 'whatsapp',
      profile_name: input.nombre,
    };

    let { error } = await supabase.from('agent_conversations').insert(payload);

    if (error && /column .* does not exist/i.test(String(error?.message || ''))) {
      const retry = await supabase.from('agent_conversations').insert({
        phone_number: payload.phone_number,
        user_message: payload.user_message,
        agent_response: payload.agent_response,
        transcription: null,
      });
      error = retry.error;
    }

    if (error) console.warn('[CicloPago] Error guardando auditoría:', error);
  } catch (err) {
    console.warn('[CicloPago] Excepción guardando auditoría:', err);
  }
}

// ------- Lógica principal -------
async function runRecordatorioCicloPago(): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Faltan variables de Supabase' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const hoy = getTodayBogota();
  const fechaObjetivo = getTargetDateBogota(DIAS_ANTICIPACION);

  console.log(`[CicloPago] Buscando sesiones en fecha objetivo: ${fechaObjetivo} (${DIAS_ANTICIPACION} días)`);
  console.log(`[CicloPago] Clases trigger configuradas: ${TRIGGER_CLASES.join(', ')}`);

  // 1. Obtener todos los cursos activos con sesiones
  const { data: cursosRaw, error: cursosError } = await supabase
    .from('cursos')
    .select('id, nombre, programa_id, estado, total_clases');

  if (cursosError) {
    console.error('[CicloPago] Error obteniendo cursos:', cursosError);
    return NextResponse.json({ error: 'Error obteniendo cursos' }, { status: 500 });
  }

  const cursos = (cursosRaw || []).filter((c: any) => c?.id);
  const cursoIds = cursos.map((c: any) => c.id);

  if (cursoIds.length === 0) {
    return NextResponse.json({ success: true, mensaje: 'Sin cursos activos', enviados: 0 });
  }

  // 2. Obtener todas las sesiones de todos los cursos (para numerar clases)
  const { data: sesionesRaw, error: sesionesError } = await supabase
    .from('sesiones_clase')
    .select('id, curso_id, fecha, tema_visto')
    .in('curso_id', cursoIds)
    .order('fecha', { ascending: true });

  if (sesionesError) {
    console.error('[CicloPago] Error obteniendo sesiones:', sesionesError);
    return NextResponse.json({ error: 'Error obteniendo sesiones' }, { status: 500 });
  }

  // Filtrar sesiones automáticas (marcadores de cálculo de ciclos)
  const sesiones = (sesionesRaw || []).filter(
    (s: any) => !AUTO_SESSION_PATTERN.test(String(s?.tema_visto || '')),
  );

  // 3. Agrupar sesiones por curso y numerar cronológicamente
  const sesionesByCurso = new Map<number, Array<{ id: string; fecha: string; numero: number }>>();
  const tempByCurso = new Map<number, Array<{ id: string; fecha: string }>>();

  for (const s of sesiones) {
    if (!s?.curso_id || !s?.fecha) continue;
    const arr = tempByCurso.get(s.curso_id) || [];
    arr.push({ id: s.id, fecha: s.fecha });
    tempByCurso.set(s.curso_id, arr);
  }

  for (const [cursoId, arr] of tempByCurso.entries()) {
    const sorted = [...arr].sort((a, b) => {
      if (a.fecha === b.fecha) return a.id.localeCompare(b.id);
      return a.fecha.localeCompare(b.fecha);
    });
    sesionesByCurso.set(
      cursoId,
      sorted.map((s, i) => ({ ...s, numero: i + 1 })),
    );
  }

  // 4. Identificar qué cursos tienen una sesión trigger en la fecha objetivo
  type CursoTrigger = {
    cursoId: number;
    cursoNombre: string;
    claseNumero: number;
    mensualidadIndex: number;
    fechaSesion: string;
  };

  const cursoNombreById = new Map<number, string>(cursos.map((c: any) => [c.id, c.nombre]));
  const cursosConTrigger: CursoTrigger[] = [];

  for (const [cursoId, sesionesNumeradas] of sesionesByCurso.entries()) {
    for (const sesion of sesionesNumeradas) {
      const fechaSesion = String(sesion.fecha).slice(0, 10);
      if (fechaSesion !== fechaObjetivo) continue;
      if (!TRIGGER_CLASES.includes(sesion.numero)) continue;

      cursosConTrigger.push({
        cursoId,
        cursoNombre: cursoNombreById.get(cursoId) || `Curso ${cursoId}`,
        claseNumero: sesion.numero,
        mensualidadIndex: mensualidadIndexParaClase(sesion.numero),
        fechaSesion,
      });
      break; // solo un trigger por curso por día
    }
  }

  if (cursosConTrigger.length === 0) {
    console.log(`[CicloPago] No hay sesiones trigger en ${fechaObjetivo}. Nada que enviar.`);
    return NextResponse.json({
      success: true,
      mensaje: `Sin sesiones trigger en ${fechaObjetivo}`,
      enviados: 0,
      omitidos: 0,
      fallidos: 0,
      fechaObjetivo,
      triggerClases: TRIGGER_CLASES,
    });
  }

  console.log(`[CicloPago] Cursos con trigger en ${fechaObjetivo}:`, cursosConTrigger.map((c) => `${c.cursoNombre} (clase ${c.claseNumero})`).join(', '));

  // 5. Para cada curso trigger, obtener matriculas activas con plan mensual
  const cursoIdsTrigger = cursosConTrigger.map((c) => c.cursoId);

  const { data: matriculasRaw, error: matriculasError } = await supabase
    .from('matriculas')
    .select('id, estudiante_id, curso_id, modalidad_pago, valor_mensual_plan, estado')
    .in('curso_id', cursoIdsTrigger)
    .in('modalidad_pago', ['MENSUAL_70', 'MENSUAL_100'])
    .in('estado', ['activa', 'activo', 'ACTIVA', 'ACTIVO']);

  if (matriculasError) {
    console.error('[CicloPago] Error obteniendo matrículas:', matriculasError);
    return NextResponse.json({ error: 'Error obteniendo matrículas' }, { status: 500 });
  }

  const matriculas = matriculasRaw || [];
  if (matriculas.length === 0) {
    console.log('[CicloPago] Sin matrículas activas mensuales para los cursos trigger.');
    return NextResponse.json({ success: true, mensaje: 'Sin matrículas activas mensuales', enviados: 0 });
  }

  const matriculaIds = matriculas.map((m: any) => m.id);
  const estudianteIds = [...new Set(matriculas.map((m: any) => m.estudiante_id).filter(Boolean))];

  // 6. Obtener perfiles y pagos en paralelo
  const [{ data: perfilesRaw }, { data: pagosRaw }] = await Promise.all([
    supabase
      .from('perfiles')
      .select('id, nombre_completo, telefono, notif_whatsapp')
      .in('id', estudianteIds),
    supabase
      .from('pagos')
      .select('id, matricula_id, estado, monto, tipo_cuota, numero_cuota, fecha_vencimiento')
      .in('matricula_id', matriculaIds)
      .eq('tipo_cuota', 'mensual')
      .order('numero_cuota', { ascending: true }),
  ]);

  const perfilesPorId = new Map<string, any>(
    (perfilesRaw || []).map((p: any) => [p.id, p]),
  );

  // Agrupar pagos mensuales por matricula (ordenados por numero_cuota)
  const pagosPorMatricula = new Map<string, any[]>();
  for (const pago of pagosRaw || []) {
    if (!pago?.matricula_id) continue;
    const arr = pagosPorMatricula.get(pago.matricula_id) || [];
    arr.push(pago);
    pagosPorMatricula.set(pago.matricula_id, arr);
  }

  // 7. Iterar y enviar recordatorios
  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;
  const telefonosProcesados = new Set<string>();

  // Crear índice de trigger por curso
  const triggerPorCurso = new Map<number, CursoTrigger>(
    cursosConTrigger.map((t) => [t.cursoId, t]),
  );

  for (const matricula of matriculas) {
    if (enviados >= MAX_SENDS_PER_RUN) {
      console.log(`[CicloPago] Límite ${MAX_SENDS_PER_RUN} alcanzado.`);
      break;
    }

    const trigger = triggerPorCurso.get(matricula.curso_id);
    if (!trigger) { omitidos++; continue; }

    const perfil = perfilesPorId.get(matricula.estudiante_id);
    if (!perfil?.telefono) {
      console.log(`[CicloPago] Sin teléfono para estudiante ${matricula.estudiante_id}`);
      omitidos++;
      continue;
    }

    if (perfil.notif_whatsapp === false) {
      console.log(`[CicloPago] Notificaciones deshabilitadas para ${perfil.nombre_completo}`);
      omitidos++;
      continue;
    }

    const telefono = normalizePhone(perfil.telefono);
    if (!telefono) {
      omitidos++;
      continue;
    }

    if (telefonosProcesados.has(telefono)) {
      omitidos++;
      continue;
    }

    // Obtener la N-ésima mensualidad (1-based index)
    const pagosMensuales = (pagosPorMatricula.get(matricula.id) || []).sort(
      (a: any, b: any) => Number(a.numero_cuota || 0) - Number(b.numero_cuota || 0),
    );
    const pagoObjetivo = pagosMensuales[trigger.mensualidadIndex - 1];

    if (!pagoObjetivo) {
      console.log(`[CicloPago] No hay registro de mensualidad ${trigger.mensualidadIndex} para matrícula ${matricula.id} (${perfil.nombre_completo})`);
      omitidos++;
      continue;
    }

    const estadoPago = String(pagoObjetivo.estado || '').toLowerCase();
    const estadosPendientes = ['pendiente', 'abono_parcial', 'vencido'];
    if (!estadosPendientes.includes(estadoPago)) {
      console.log(`[CicloPago] Pago ${pagoObjetivo.id} ya en estado "${estadoPago}" para ${perfil.nombre_completo}. Se omite.`);
      omitidos++;
      continue;
    }

    // Cooldown: no enviar si ya se contactó recientemente por esta mensualidad
    const cooldown = await hasCooldownActivo(supabase, telefono, matricula.id, trigger.mensualidadIndex);
    if (cooldown) {
      console.log(`[CicloPago] Cooldown activo para ${perfil.nombre_completo} / mensualidad ${trigger.mensualidadIndex}`);
      omitidos++;
      continue;
    }

    try {
      const nombre = perfil.nombre_completo || 'Estudiante';
      const cursoNombre = trigger.cursoNombre;
      const montoNum = Number(matricula.valor_mensual_plan || pagoObjetivo.monto || 0);
      const monto = montoNum > 0 ? `$${montoNum.toLocaleString('es-CO')}` : 'tu mensualidad';
      const fechaMes = pagoObjetivo.fecha_vencimiento
        ? formatMes(pagoObjetivo.fecha_vencimiento)
        : `Mensualidad ${trigger.mensualidadIndex}`;

      console.log(`[CicloPago] Enviando recordatorio a ${nombre} (${telefono}) - ${cursoNombre} - mensualidad ${trigger.mensualidadIndex} - estado: ${estadoPago}`);

      const templateVariables = [nombre, monto, cursoNombre, fechaMes];

      let messageId: string | undefined;
      let sendOk = false;

      try {
        const resp = await WhatsAppService.sendTemplate(
          telefono,
          TEMPLATE_NAME,
          templateVariables,
          'es_CO',
        );
        messageId = resp?.messages?.[0]?.id;
        sendOk = true;
      } catch (templateErr) {
        if (ALLOW_TEXT_FALLBACK) {
          console.warn(`[CicloPago] Plantilla falló para ${telefono}, usando texto plano.`);
          const textoFallback =
            `Hola ${nombre}, te recordamos que la mensualidad ${trigger.mensualidadIndex} ` +
            `de ${monto} para el curso ${cursoNombre} está pendiente de pago. ` +
            `La próxima clase es el ${trigger.fechaSesion}. ` +
            `Puedes pagar en nuestra oficina o en línea. ¡Gracias! Academia Crystal.`;
          const resp = await WhatsAppService.sendText(telefono, textoFallback);
          messageId = resp?.messages?.[0]?.id;
          sendOk = true;
        } else {
          throw templateErr;
        }
      }

      if (sendOk) {
        await saveAudit(supabase, {
          telefono,
          nombre,
          matriculaId: matricula.id,
          cursoNombre,
          mensualidadIndex: trigger.mensualidadIndex,
          claseNumero: trigger.claseNumero,
          messageId,
        });

        telefonosProcesados.add(telefono);
        enviados++;

        if (DELAY_MS > 0) await sleep(DELAY_MS);
      }
    } catch (err: any) {
      console.error(`[CicloPago] Error enviando a ${perfil.nombre_completo}:`, err?.message || err);
      fallidos++;
    }
  }

  const resumen = {
    success: true,
    mensaje: `${enviados} recordatorios enviados, ${fallidos} fallidos, ${omitidos} omitidos`,
    enviados,
    fallidos,
    omitidos,
    fechaObjetivo,
    diasAnticipacion: DIAS_ANTICIPACION,
    triggerClases: TRIGGER_CLASES,
    cursosConTrigger: cursosConTrigger.map((c) => ({
      curso: c.cursoNombre,
      clase: c.claseNumero,
      mensualidad: c.mensualidadIndex,
    })),
    timestamp: new Date().toISOString(),
  };

  console.log('[CicloPago] Resultado:', resumen.mensaje);
  return NextResponse.json(resumen);
}

// ------- Handlers HTTP -------
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  const cronSecret = request.headers.get('authorization');
  const validApiKey = process.env.CRON_API_KEY;
  const validSecret = process.env.CRON_SECRET;

  const authorized =
    (validApiKey && apiKey === validApiKey) ||
    (validSecret && cronSecret === `Bearer ${validSecret}`);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runRecordatorioCicloPago();
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  const cronSecret = request.headers.get('authorization');
  const validApiKey = process.env.CRON_API_KEY;
  const validSecret = process.env.CRON_SECRET;

  const authorized =
    (validApiKey && apiKey === validApiKey) ||
    (validSecret && cronSecret === `Bearer ${validSecret}`);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runRecordatorioCicloPago();
}
