/**
 * FASE 2 & 3: Módulo de Mensajes WhatsApp + Logs
 * 
 * Ubicación: src/services/whatsapp-messages-module.ts
 * 
 * Propósito:
 * - Funciones específicas para cada caso de uso (inscripción, pago, etc)
 * - Reemplazar variables en plantillas
 * - Guardar logs de cada mensaje
 * - Manejo centralizado de errores
 */

import { supabaseBrowserClient } from '@/utils/supabase/client';

type PlantillasRow = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  plantilla: string;
  variables?: string[] | null;
  categoria?: string | null;
  activa?: boolean | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
};

type MensajesRow = {
  id: string;
  usuario_id?: string | null;
  telefono: string;
  tipo: string;
  plantilla_id?: string | number | null;
  mensaje_texto: string;
  estado?: string | null;
  message_id?: string | null;
  metadatos?: Record<string, unknown> | null;
  respuesta_esperada?: boolean | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
};

// ============================================
// TIPOS
// ============================================

interface VariablesPlantilla {
  [key: string]: string | number | boolean | null;
}

interface ResultadoEnvio {
  exito: boolean;
  mensajeId?: string;
  error?: string;
  logId?: string;
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Reemplaza variables en una plantilla
 * Ej: "Hola {{nombre}}" + {nombre: "Juan"} = "Hola Juan"
 */
function reemplazarVariables(
  plantilla: string,
  variables: VariablesPlantilla
): string {
  let resultado = plantilla;
  
  for (const [clave, valor] of Object.entries(variables)) {
    const regex = new RegExp(`{{${clave}}}`, 'g');
    resultado = resultado.replace(regex, String(valor ?? ''));
  }
  
  // Limpiar variables no reemplazadas
  resultado = resultado.replace(/{{{.*?}}}/g, '');
  
  return resultado;
}

/**
 * Obtiene una plantilla de la BD
 */
async function obtenerPlantilla(
  nombrePlantilla: string
): Promise<PlantillasRow | null> {
  try {
    const { data, error } = await supabaseBrowserClient
      .from('plantillas_whatsapp')
      .select('*')
      .eq('nombre', nombrePlantilla)
      .eq('activa', true)
      .single();

    if (error) {
      console.error(`[WhatsApp] Error obtener plantilla ${nombrePlantilla}:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`[WhatsApp] Error crítico obtener plantilla:`, error);
    return null;
  }
}

/**
 * Envía el mensaje por WhatsApp Cloud API
 */
async function enviarPorWhatsAppAPI(
  telefono: string,
  templateName: string,
  variables: string[] = []
): Promise<{ exito: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: telefono,
        type: 'template',
        template: templateName,
        templateVariables: variables,
        templateLanguage: 'es',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        exito: false,
        error: data.error || 'Error desconocido al enviar WhatsApp',
      };
    }

    return {
      exito: true,
      messageId: data.messageId,
    };
  } catch (error) {
    return {
      exito: false,
      error: `Error crítico: ${error instanceof Error ? error.message : 'Desconocido'}`,
    };
  }
}

/**
 * Guarda un log del mensaje en la BD
 */
async function guardarLog(
  datos: Omit<MensajesRow, 'id' | 'creado_en' | 'actualizado_en'>
): Promise<string | null> {
  try {
    const { data, error } = await supabaseBrowserClient
      .from('whatsapp_mensajes')
      .insert([datos])
      .select('id')
      .single();

    if (error) {
      console.error('[WhatsApp] Error guardar log:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('[WhatsApp] Error crítico guardar log:', error);
    return null;
  }
}

/**
 * Envía un mensaje usando plantilla y guarda log
 */
async function enviarMensajeConPlantilla(
  telefono: string,
  nombrePlantilla: string,
  variables: VariablesPlantilla,
  usuarioId?: string,
  metadatos?: Record<string, any>
): Promise<ResultadoEnvio> {
  try {
    // 1. Convertir objeto variables a array ordenado
    // Los templates de Meta requieren array de strings en orden correcto
    const variablesArray = Object.values(variables).map(v => String(v || ''));

    // 2. Enviar por WhatsApp API usando template
    const resultadoEnvio = await enviarPorWhatsAppAPI(
      telefono,
      nombrePlantilla,
      variablesArray
    );

    // 3. Construir mensaje de texto para logging
    const mensajeTexto = `Template: ${nombrePlantilla} | Variables: ${JSON.stringify(variables)}`;

    // 4. Guardar log
    const logId = await guardarLog({
      usuario_id: usuarioId || null,
      telefono,
      tipo: nombrePlantilla,
      plantilla_id: null,
      mensaje_texto: mensajeTexto,
      estado: resultadoEnvio.exito ? 'enviado' : 'fallido',
      message_id: resultadoEnvio.messageId || null,
      metadatos: metadatos || null,
      respuesta_esperada: false,
    });

    return {
      exito: resultadoEnvio.exito,
      mensajeId: resultadoEnvio.messageId,
      error: resultadoEnvio.error,
      logId: logId || undefined,
    };
  } catch (error) {
    console.error('[WhatsApp] Error crítico en enviarMensajeConPlantilla:', error);
    return {
      exito: false,
      error: `Error crítico: ${error instanceof Error ? error.message : 'Desconocido'}`,
    };
  }
}

// ============================================
// FUNCIONES ESPECÍFICAS POR CASO DE USO
// ============================================

/**
 * CASO 1: Enviar confirmación de inscripción
 */
export async function enviarConfirmacionInscripcion(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    nombreCurso: string;
    fechaInicio: string;
    horario?: string;
    mensualidad: number;
    instructor?: string;
    fechaPago?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando confirmación inscripción a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'inscripcion_confirmada_v2',
    {
      nombre: datos.nombre,
      nombreCurso: datos.nombreCurso,
      fechaInicio: datos.fechaInicio,
      mensualidad: datos.mensualidad,
    },
    usuarioId,
    { tipo_evento: 'inscripcion_confirmada', curso_id: null }
  );
}

/**
 * CASO 2: Enviar recordatorio de pago
 */
export async function enviarRecordatorPago(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    mes?: string;
    monto: number;
    fechaVencimiento: string;
    nombreCurso: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando recordatorio pago a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'recordatorio_pago_v2',
    {
      nombre: datos.nombre,
      monto: datos.monto,
      nombreCurso: datos.nombreCurso,
      fechaVencimiento: datos.fechaVencimiento,
    },
    usuarioId,
    { tipo_evento: 'recordatorio_pago', mes: datos.mes || 'actual' }
  );
}

/**
 * CASO 3: Enviar confirmación de pago
 */
export async function enviarConfirmacionPago(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    referenciaPago: string;
    monto: number;
    fechaPago?: string;
    concepto?: string;
    nombreCurso: string;
    fechaVigencia?: string;
    fechaProximaClase?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando confirmación pago a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'pago_recibido_v2',
    {
      nombre: datos.nombre,
      monto: datos.monto,
      nombreCurso: datos.nombreCurso,
      referenciaPago: datos.referenciaPago,
    },
    usuarioId,
    { tipo_evento: 'pago_recibido', monto: datos.monto }
  );
}

/**
 * CASO 4: Enviar información de curso
 */
export async function enviarInformacionCurso(
  telefono: string,
  datos: {
    nombre: string;
    nombreCurso: string;
    descripcionCurso: string;
    duracion: string;
    horario: string;
    modalidad: string;
    requisitos: string;
    costoInscripcion: number;
    costoMensualidad: number;
    duracionMeses: number;
    cuposDisponibles: number;
    queIncluye: string;
    fechaProximaCohorte: string;
    fechaCierreInscripcion: string;
    linkInscripcion: string;
    usuarioId?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando información curso a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    telefono,
    'informacion_curso',
    {
      nombre: datos.nombre,
      nombre_curso: datos.nombreCurso,
      descripcion_curso: datos.descripcionCurso,
      duracion: datos.duracion,
      horario: datos.horario,
      modalidad: datos.modalidad,
      requisitos: datos.requisitos,
      costo_inscripcion: datos.costoInscripcion,
      costo_mensualidad: datos.costoMensualidad,
      duracion_meses: datos.duracionMeses,
      cupos_disponibles: datos.cuposDisponibles,
      que_incluye: datos.queIncluye,
      fecha_proxima_cohorte: datos.fechaProximaCohorte,
      fecha_cierre_inscripcion: datos.fechaCierreInscripcion,
      link_inscripcion: datos.linkInscripcion,
    },
    datos.usuarioId,
    { tipo_evento: 'informacion_curso', curso: datos.nombreCurso }
  );
}

/**
 * CASO 5: Enviar mensaje a lead (desde Make)
 */
export async function enviarFormularioInteres(
  telefono: string,
  leadId: string,
  datos: {
    nombre: string;
    cursoInteres: string;
    ciudad?: string;
    beneficioPrincipal?: string;
    beneficio1?: string;
    beneficio2?: string;
    beneficio3?: string;
    fechaInicio: string;
    cupos?: number;
    linkCatalogo?: string;
    telefonoSoporte?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando formulario interés a lead ${leadId}`);

  return enviarMensajeConPlantilla(
    telefono,
    'formulario_interes_v2',
    {
      nombre: datos.nombre,
      cursoInteres: datos.cursoInteres,
      fechaInicio: datos.fechaInicio,
    },
    undefined,
    { tipo_evento: 'lead_interes', lead_id: leadId }
  );
}

/**
 * CASO 6: Enviar certificado disponible
 */
export async function enviarCertificadoDisponible(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    nombreCurso: string;
    linkCertificadoDigital: string;
    fechaDisponible?: string;
    horarioAtencion?: string;
    direccionOficina?: string;
    fechaCeremonia?: string;
    horaCeremonia?: string;
    lugarCeremonia?: string;
    costoCopias?: number;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando certificado disponible a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'certificado_disponible_v2',
    {
      nombre: datos.nombre,
      nombreCurso: datos.nombreCurso,
      linkCertificadoDigital: datos.linkCertificadoDigital,
    },
    usuarioId,
    { tipo_evento: 'certificado_disponible', curso_id: null }
  );
}

/**
 * CASO 7: Enviar bienvenida a nuevo estudiante
 */
export async function enviarBienvenidaEstudiante(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    nombreCurso: string;
    fechaProximaClase1: string;
    fechaProximaClase2: string;
    fechaProximaClase3: string;
    horario: string;
    direccionClases: string;
    numeroSalon: string;
    nombreInstructor: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando bienvenida a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'bienvenida_nuevo_estudiante',
    {
      nombre: datos.nombre,
      nombreCurso: datos.nombreCurso,
      fechaProximaClase1: datos.fechaProximaClase1,
      fechaProximaClase2: datos.fechaProximaClase2,
      fechaProximaClase3: datos.fechaProximaClase3,
      horario: datos.horario,
      direccionClases: datos.direccionClases,
      numeroSalon: datos.numeroSalon,
      nombreInstructor: datos.nombreInstructor,
    },
    usuarioId,
    { tipo_evento: 'bienvenida', curso_id: null }
  );
}

/**
 * CASO 8: Enviar recordatorio de clase (1 hora antes)
 */
export async function enviarRecordatorioClase(
  usuarioId: string,
  datos: {
    nombre: string;
    telefono: string;
    nombreCurso: string;
    horaClase: string;
    ubicacion?: string;
    nombreInstructor?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando recordatorio clase a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    datos.telefono,
    'recordatorio_clase_v2',
    {
      nombre: datos.nombre,
      nombreCurso: datos.nombreCurso,
      horaClase: datos.horaClase,
    },
    usuarioId,
    { tipo_evento: 'recordatorio_clase' }
  );
}

/**
 * CASO 9: Enviar alerta de cierre de inscripción
 */
export async function enviarCierreInscripcion(
  telefono: string,
  datos: {
    nombre: string;
    nombreCurso: string;
    diasRestantes: number;
    fechaCierre: string;
    fechaInicio: string;
    cuposRestantes: number;
    costoTotal: number;
    fechaDescuento: string;
    linkInscripcion: string;
    telefonoSoporte: string;
    usuarioId?: string;
  }
): Promise<ResultadoEnvio> {
  console.log(`[WhatsApp] Enviando cierre inscripción a ${datos.nombre}`);

  return enviarMensajeConPlantilla(
    telefono,
    'cierre_inscripcion',
    {
      nombre: datos.nombre,
      nombreCurso: datos.nombreCurso,
      diasRestantes: datos.diasRestantes,
      fechaCierre: datos.fechaCierre,
      fechaInicio: datos.fechaInicio,
      cuposRestantes: datos.cuposRestantes,
      costoTotal: datos.costoTotal,
      fechaDescuento: datos.fechaDescuento,
      linkInscripcion: datos.linkInscripcion,
      telefonoSoporte: datos.telefonoSoporte,
    },
    datos.usuarioId,
    { tipo_evento: 'cierre_inscripcion', curso: datos.nombreCurso }
  );
}

// ============================================
// UTILIDADES PARA TESTING Y DEBUGGING
// ============================================

/**
 * Obtiene el histórico de mensajes de un usuario
 */
export async function obtenerHistoricoMensajes(
  usuarioId: string,
  limite: number = 50
): Promise<MensajesRow[]> {
  try {
    const { data, error } = await supabaseBrowserClient
      .from('whatsapp_mensajes')
      .select('*')
      .eq('usuario_id', usuarioId)
      .order('creado_en', { ascending: false })
      .limit(limite);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[WhatsApp] Error obtener histórico:', error);
    return [];
  }
}

/**
 * Obtiene estadísticas de mensajes enviados
 */
export async function obtenerEstadisticaMensajes(
  ultimosDias: number = 7
) {
  try {
    const fechaDesde = new Date();
    fechaDesde.setDate(fechaDesde.getDate() - ultimosDias);

    const { data, error } = await supabaseBrowserClient
      .from('whatsapp_mensajes')
      .select('estado, tipo')
      .gte('creado_en', fechaDesde.toISOString());

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[WhatsApp] Error obtener estadísticas:', error);
    return [];
  }
}
