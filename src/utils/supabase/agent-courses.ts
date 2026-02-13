import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdrdcpnqcqazxnhnjxyj.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkcmRjcG5xY3Fhenhuo2h0dHBzOi8vc2RyZGNwbnFjcWF6eG5obmp4eWouc3VwYWJhc2UuY28iLCJpYXQiOjE3MzA3NzkyMzgsImV4cCI6MjA0NjM1OTIzOH0.nZ_Q2J7u-sIAm9_HZEoG0fL8LiDo-a6XfP_R8CgKnOE'

interface AcademyInfo {
  id: string
  nombre_academia: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  ruc: string | null
  logo_url: string | null
  instagram: string | null
  facebook: string | null
  youtube: string | null
  website: string | null
  whatsapp: string | null
}

interface ProgramInfo {
  id: number
  nombre: string
  descripcion: string | null
  duracion: string | null
  duracion_horas: number | null
  precio: number | null
  precio_inscripcion: number | null
  precio_mensualidad: number | null
  contenido: string | null
  requisitos: string | null
  certificacion: string | null
  activo: boolean
  total_clases: number | null
}

interface PensumCiclo {
  id: string
  numero_ciclo: number
  nombre_ciclo: string | null
  descripcion: string | null
  duracion_semanas: number | null
  total_horas: number | null
  orden: number | null
  cursos: PensumCurso[]
}

interface PensumCurso {
  id: string
  nombre_curso: string
  descripcion: string | null
  horas: number | null
  creditos: number | null
  tipo_curso: string | null
  orden: number | null
}

interface MedioPago {
  id: number
  nombre: string
  codigo: string
  descripcion: string | null
  icono: string | null
  activo: boolean
  orden: number
}

interface CourseInfo {
  id: number
  nombre: string
  descripcion: string | null
  horario: string | null
  cupos: number
  precio: number | null
  precio_inscripcion: number | null
  precio_mensualidad: number | null
  estado: string
  fecha_inicio: string | null
  fecha_fin: string | null
  profesor_nombre: string | null
  programa_nombre: string | null
  resumen_texto_ia: string | null
  matriculados: number
  cupos_disponibles: number
  programa_id: number
}

/**
 * Obtener medios de pago activos
 */
export async function getMediosPago(): Promise<MedioPago[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data, error } = await supabase
      .from('medios_pago')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true })

    if (error) {
      console.error('[getMediosPago] Error:', error)
      return []
    }

    return data as MedioPago[]
  } catch (err) {
    console.error('[getMediosPago] Error:', err)
    return []
  }
}

/**
 * Formatear medios de pago para el agente
 */
export function formatMediosPago(mediosPago: MedioPago[]): string {
  if (!mediosPago.length) {
    return ''
  }

  let info = `\n## MEDIOS DE PAGO ACEPTADOS\n\n`
  info += `Aceptamos los siguientes medios de pago:\n`
  
  mediosPago.forEach(medio => {
    const descripcion = medio.descripcion ? ` - ${medio.descripcion}` : ''
    info += `  💳 **${medio.nombre}**${descripcion}\n`
  })
  
  info += `\n`
  return info
}

/**
 * Obtener información de la academia (dirección, redes sociales, contacto)
 */
export async function getAcademyInfo(): Promise<AcademyInfo | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[getAcademyInfo] Error:', error)
      return null
    }

    return data as AcademyInfo | null
  } catch (err) {
    console.error('[getAcademyInfo] Error:', err)
    return null
  }
}

/**
 * Obtener pensum (temario) de un programa específico
 */
export async function getPensumByProgram(programaId: number): Promise<PensumCiclo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Obtener ciclos del pensum
    const { data: ciclos, error: errorCiclos } = await supabase
      .from('pensum')
      .select('*')
      .eq('programa_id', programaId)
      .eq('activo', true)
      .order('orden', { ascending: true })

    if (errorCiclos) {
      console.error('[getPensumByProgram] Error obteniendo ciclos:', errorCiclos)
      return []
    }

    if (!ciclos || ciclos.length === 0) {
      return []
    }

    // Para cada ciclo, obtener sus cursos
    const pensumCompleto: PensumCiclo[] = []
    for (const ciclo of ciclos) {
      const { data: cursos, error: errorCursos } = await supabase
        .from('pensum_cursos')
        .select('*')
        .eq('pensum_id', ciclo.id)
        .order('orden', { ascending: true })

      pensumCompleto.push({
        id: ciclo.id,
        numero_ciclo: ciclo.numero_ciclo,
        nombre_ciclo: ciclo.nombre_ciclo,
        descripcion: ciclo.descripcion,
        duracion_semanas: ciclo.duracion_semanas,
        total_horas: ciclo.total_horas,
        orden: ciclo.orden,
        cursos: (cursos || []).map((c: any) => ({
          id: c.id,
          nombre_curso: c.nombre_curso,
          descripcion: c.descripcion,
          horas: c.horas,
          creditos: c.creditos,
          tipo_curso: c.tipo_curso,
          orden: c.orden,
        }))
      })
    }

    return pensumCompleto
  } catch (err) {
    console.error('[getPensumByProgram] Error:', err)
    return []
  }
}

/**
 * Obtener TODOS los programas activos (información primaria)
 */
export async function getProgramsForAgent(): Promise<ProgramInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data, error } = await supabase
      .from('programas')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true })

    if (error) {
      console.error('[getProgramsForAgent] Error:', error)
      return []
    }

    return data as ProgramInfo[]
  } catch (error) {
    console.error('[getProgramsForAgent] Exception:', error)
    return []
  }
}

/**
 * Obtener cursos/grupos de un programa específico (información secundaria)
 */
export async function getCoursesByProgram(programId: number): Promise<CourseInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data, error } = await supabase
      .from('vw_cursos_para_ia')
      .select('*')
      .eq('programa_id', programId)
      .eq('estado', 'activo')
      .order('fecha_inicio', { ascending: true })

    if (error) {
      console.error('[getCoursesByProgram] Error:', error)
      return []
    }

    return data as CourseInfo[]
  } catch (error) {
    console.error('[getCoursesByProgram] Exception:', error)
    return []
  }
}

/**
 * Detectar qué programa menciona el usuario en su mensaje
 */
export function detectProgramFromMessage(message: string, programs: ProgramInfo[]): ProgramInfo | null {
  const lowerMessage = message.toLowerCase()
  
  // Buscar coincidencias con nombres de programas
  for (const program of programs) {
    const programName = program.nombre.toLowerCase()
    // Búsqueda flexible: contiene el nombre completo o es bastante similar
    if (lowerMessage.includes(programName) || 
        (programName.length > 5 && lowerMessage.includes(programName.substring(0, 5)))) {
      return program
    }
  }
  
  return null
}

/**
 * Obtener cursos para consulta actual (jerarquía: si menciona programa, solo esos cursos)
 */
export async function getCoursesForQuery(message: string, programs: ProgramInfo[]): Promise<CourseInfo[]> {
  const detectedProgram = detectProgramFromMessage(message, programs)
  
  if (detectedProgram) {
    // Si menciona un programa específico, obtener solo sus cursos
    return getCoursesByProgram(detectedProgram.id)
  }
  
  // Si no menciona programa específico, obtener todos los cursos
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data, error } = await supabase
      .from('vw_cursos_para_ia')
      .select('*')
      .eq('estado', 'activo')
      .order('programa_nombre', { ascending: true })
      .order('fecha_inicio', { ascending: true })

    if (error) {
      console.error('[getCoursesForQuery] Error:', error)
      return []
    }

    return data as CourseInfo[]
  } catch (error) {
    console.error('[getCoursesForQuery] Exception:', error)
    return []
  }
}

export function formatCoursesForAgent(courses: CourseInfo[]): string {
  if (!courses.length) {
    return 'No hay cursos disponibles en este momento.'
  }

  const coursesList = courses
    .map((course) => {
      const cuposText = course.cupos_disponibles > 0 
        ? `✅ ${course.cupos_disponibles} cupos disponibles`
        : '❌ SIN CUPOS'
      
      const precioText = course.precio_inscripcion || course.precio_mensualidad
        ? `Precio: $${course.precio_inscripcion || course.precio_mensualidad} COP`
        : 'Precio a definir'
      
      const scheduleText = course.horario 
        ? `Horario: ${course.horario}`
        : 'Horario a confirmar'

      const datesText = course.fecha_inicio 
        ? `Inicia: ${course.fecha_inicio}`
        : 'Fecha a confirmar'

      return `
📚 **${course.nombre}** (${course.programa_nombre})
   ${cuposText}
   📅 ${datesText}
   ⏰ ${scheduleText}
   💵 ${precioText}
   👨‍🏫 Profesor: ${course.profesor_nombre || 'A confirmar'}
   ${course.descripcion ? `   ℹ️ ${course.descripcion.substring(0, 100)}...` : ''}`.trim()
    })
    .join('\n\n')

  return `📖 **CURSOS DISPONIBLES**\n\n${coursesList}`
}

/**
 * Formato de contexto JERÁRQUICO:
 * 1. Todos los programas disponibles (información primaria)
 * 2. Si el usuario pregunta por un programa específico, sus cursos
 */

/**
 * Convertir URLs de redes sociales a formato corto y amigable
 */
function shortenSocialUrl(url: string, platform: 'instagram' | 'facebook' | 'youtube'): string {
  if (!url) return url
  
  // Limpiar URL
  let cleanUrl = url.trim()
  
  // Remover protocolo
  cleanUrl = cleanUrl.replace(/^https?:\/\/(www\.)?/, '')
  
  // Procesar según plataforma
  if (platform === 'instagram') {
    // instagram.com/username → @username
    const match = cleanUrl.match(/instagram\.com\/([^\/\?\s]+)/)
    if (match && match[1]) {
      return `@${match[1]}`
    }
    return cleanUrl
  }
  
  if (platform === 'facebook') {
    // facebook.com/username → fb.com/username
    // facebook.com/pages/name/123 → fb.com/name
    let cleaned = cleanUrl.replace(/facebook\.com/, 'fb.com')
    // Simplificar /pages/name/id a /name
    cleaned = cleaned.replace(/\/pages\/([^\/]+)\/\d+/, '/$1')
    // Remover parámetros query
    cleaned = cleaned.split('?')[0] || cleaned
    return cleaned
  }
  
  if (platform === 'youtube') {
    // youtube.com/channel/UC123 → youtube.com/c/NombreCanal (si existe)
    // youtube.com/@username → @username
    const atMatch = cleanUrl.match(/youtube\.com\/@([^\/\?\s]+)/)
    if (atMatch && atMatch[1]) {
      return `@${atMatch[1]}`
    }
    
    // Acortar youtube a yt para canales
    let cleaned = cleanUrl.replace(/youtube\.com/, 'yt.com')
    cleaned = cleaned.split('?')[0] || cleaned
    return cleaned
  }
  
  return cleanUrl
}

/**
 * Formatear información de la academia para el agente
 */
export function formatAcademyInfo(academy: AcademyInfo | null): string {
  if (!academy) {
    return ''
  }

  let info = `\n## INFORMACIÓN DE LA ACADEMIA\n\n`

  if (academy.nombre_academia) {
    info += `**${academy.nombre_academia}**\n\n`
  }

  // Datos de contacto
  const contactInfo = []
  if (academy.direccion) contactInfo.push(`📍 Dirección: ${academy.direccion}`)
  if (academy.telefono) contactInfo.push(`📞 Teléfono: ${academy.telefono}`)
  if (academy.whatsapp) contactInfo.push(`💬 WhatsApp: ${academy.whatsapp}`)
  if (academy.email) contactInfo.push(`📧 Email: ${academy.email}`)
  if (academy.website) contactInfo.push(`🌐 Web: ${academy.website}`)
  if (academy.ruc) contactInfo.push(`🏢 RUC/NIT: ${academy.ruc}`)

  if (contactInfo.length > 0) {
    info += `### Contacto:\n${contactInfo.join('\n')}\n\n`
  }

  // Redes sociales (URLs cortas y amigables)
  const socialMedia = []
  if (academy.instagram) {
    const shortUrl = shortenSocialUrl(academy.instagram, 'instagram')
    socialMedia.push(`📸 Instagram: ${shortUrl}`)
  }
  if (academy.facebook) {
    const shortUrl = shortenSocialUrl(academy.facebook, 'facebook')
    socialMedia.push(`👤 Facebook: ${shortUrl}`)
  }
  if (academy.youtube) {
    const shortUrl = shortenSocialUrl(academy.youtube, 'youtube')
    socialMedia.push(`🎥 YouTube: ${shortUrl}`)
  }

  if (socialMedia.length > 0) {
    info += `### Redes Sociales:\n${socialMedia.join('\n')}\n\n`
  }

  return info
}

export function buildHierarchicalContext(
  programs: ProgramInfo[],
  courses: CourseInfo[],
  detectedProgram: ProgramInfo | null,
  academy: AcademyInfo | null = null
): string {
  let context = ``

  // Agregar información de la academia si está disponible
  if (academy) {
    context += formatAcademyInfo(academy)
  }

  context += `
## PROGRAMAS Y GRUPOS DISPONIBLES

### 📚 Programas Activos:
${programs
  .map((prog) => {
    const durationText = prog.duracion_horas 
      ? `(${prog.duracion_horas} horas)`
      : prog.duracion 
      ? `(${prog.duracion})`
      : ''
    
    const clasesText = prog.total_clases ? ` - ${prog.total_clases} clases` : ''
    
    const priceText = prog.precio 
      ? `$${prog.precio} COP`
      : prog.precio_inscripcion &&  prog.precio_mensualidad
      ? `Inscripción: $${prog.precio_inscripcion} + Mensualidad: $${prog.precio_mensualidad}`
      : 'Precio a definir'
    
    const reqText = prog.requisitos ? `Requisitos: ${prog.requisitos}` : ''
    const certText = prog.certificacion ? `Certificación: ${prog.certificacion}` : ''
    const contenidoText = prog.contenido ? `Temario: ${prog.contenido.substring(0, 200)}${prog.contenido.length > 200 ? '...' : ''}` : ''
    
    return `
- **${prog.nombre}** ${durationText}${clasesText}
  Descripción: ${prog.descripcion || 'N/A'}
  ${contenidoText ? `${contenidoText}` : ''}
  ${reqText ? `${reqText}` : ''}
  ${certText ? `${certText}` : ''}
  Inversión: ${priceText}`
  })
  .join('\n')}

${detectedProgram ? `
### 📖 Grupos Disponibles del Programa "${detectedProgram.nombre}":
${courses.length > 0 
  ? courses
      .map((course) => {
        const matriculados = course.matriculados || 0
        const cupos = course.cupos || 0
        const disponibles = course.cupos_disponibles || 0
        
        return `
- **${course.nombre}**
  📅 Inicio: ${course.fecha_inicio || 'A confirmar'} | Fin: ${course.fecha_fin || 'A confirmar'}
  ⏰ Horario: ${course.horario || 'A confirmar'}
  👥 Cupos: ${matriculados}/${cupos} (${disponibles} disponibles)
  👨‍🏫 Profesor: ${course.profesor_nombre || 'A confirmar'}`
      })
      .join('\n') + '\n\n💰 Inversión: Ver información del programa arriba'
  : 'No hay grupos disponibles para este programa en este momento.'
}
` : ''}

Cuando un cliente pregunte por un programa específico, muestra sus grupos con horarios y cupos disponibles.
Los PRECIOS están en el PROGRAMA (nivel superior), NO en los grupos individuales.
Si pregunta "¿Qué programas tienen?", lista todos los programas con precios y temario.
Si pregunta "¿Cuándo inicia [programa]?", muestra los grupos disponibles con fechas y horarios específicos.
Si pregunta "¿Cuánto cuesta [programa]?", usa el precio del PROGRAMA, no del grupo.
`

  return context.trim()
}

/**
 * Versión async de buildHierarchicalContext que incluye información detallada del pensum
 * cuando se detecta un programa específico
 */
export async function buildHierarchicalContextWithPensum(
  programs: ProgramInfo[],
  courses: CourseInfo[],
  detectedProgram: ProgramInfo | null,
  academy: AcademyInfo | null = null,
  mediosPago: MedioPago[] = []
): Promise<string> {
  let context = ``

  // Agregar información de la academia si está disponible
  if (academy) {
    context += formatAcademyInfo(academy)
  }
  
  // Agregar medios de pago si están disponibles
  if (mediosPago.length > 0) {
    context += formatMediosPago(mediosPago)
  }

  context += `
## PROGRAMAS Y GRUPOS DISPONIBLES

### 📚 Programas Activos:
`

  for (const prog of programs) {
    const durationText = prog.duracion_horas 
      ? `${prog.duracion_horas} horas`
      : prog.duracion 
      ? prog.duracion
      : 'Duración a definir'
    
    const clasesText = prog.total_clases ? ` (${prog.total_clases} clases)` : ''
    
    const priceText = prog.precio 
      ? `$${prog.precio} COP`
      : prog.precio_inscripcion && prog.precio_mensualidad
      ? `Inscripción: $${prog.precio_inscripcion} + Mensualidad: $${prog.precio_mensualidad}`
      : 'Precio a definir'
    
    context += `
- **${prog.nombre}**
  Duración: ${durationText}${clasesText}
  Descripción: ${prog.descripcion || 'N/A'}`
    
    if (prog.requisitos) {
      context += `\n  Requisitos: ${prog.requisitos}`
    }
    if (prog.certificacion) {
      context += `\n  Certificación: ${prog.certificacion}`
    }
    context += `\n  Inversión: ${priceText}\n`
    
    // Mostrar temario si existe (solo para el programa detectado o si es general)
    if (detectedProgram && detectedProgram.id === prog.id) {
      // Si hay contenido general, mostrarlo
      if (prog.contenido) {
        context += `  📝 Temario: ${prog.contenido}\n`
      }
      
      // Obtener pensum estructurado
      const pensum = await getPensumByProgram(prog.id)
      if (pensum.length > 0) {
        context += `  📚 **Contenido Detallado por Ciclos:**\n`
        pensum.forEach(ciclo => {
          const cicloNombre = ciclo.nombre_ciclo || `Ciclo ${ciclo.numero_ciclo}`
          const cicloHoras = ciclo.total_horas ? ` (${ciclo.total_horas}h)` : ''
          const cicloSemanas = ciclo.duracion_semanas ? ` - ${ciclo.duracion_semanas} semanas` : ''
          context += `    • ${cicloNombre}${cicloHoras}${cicloSemanas}\n`
          if (ciclo.cursos.length > 0) {
            ciclo.cursos.forEach(curso => {
              const cursoHoras = curso.horas ? ` (${curso.horas}h)` : ''
              context += `      - ${curso.nombre_curso}${cursoHoras}\n`
            })
          }
        })
      }
    } else if (prog.contenido) {
      // Para programas no detectados, solo mostrar un resumen del contenido
      const contenidoResumen = prog.contenido.substring(0, 150)
      context += `  📝 Temario: ${contenidoResumen}${prog.contenido.length > 150 ? '...' : ''}\n`
    }
  }

  // Mostrar grupos disponibles si hay un programa detectado
  if (detectedProgram) {
    context += `\n### 📖 Grupos Disponibles del Programa "${detectedProgram.nombre}":\n`
    if (courses.length > 0) {
      courses.forEach(course => {
        const matriculados = course.matriculados || 0
        const cupos = course.cupos || 0
        const disponibles = course.cupos_disponibles || 0
        
        context += `
- **${course.nombre}**
  📅 Inicio: ${course.fecha_inicio || 'A confirmar'} | Fin: ${course.fecha_fin || 'A confirmar'}
  ⏰ Horario: ${course.horario || 'A confirmar'}
  👥 Cupos: ${matriculados}/${cupos} (${disponibles} disponibles)
  👨‍🏫 Profesor: ${course.profesor_nombre || 'A confirmar'}\n`
      })
      context += `\n💰 Inversión: Ver información del programa arriba\n`
    } else {
      context += `No hay grupos disponibles para este programa en este momento.\n`
    }
  }

  context += `
Cuando un cliente pregunte por un programa específico, muestra sus grupos con horarios, fechas y cupos disponibles.
Los PRECIOS están siempre en el PROGRAMA (nivel superior), NO en los grupos individuales.
Si pregunta "¿Qué programas tienen?", lista todos los programas con precios, duración y temario.
Si pregunta "¿Cuándo inicia [programa]?", muestra los grupos disponibles con sus fechas y horarios específicos.
Si pregunta "¿Cuánto cuesta [programa]?", usa el precio del PROGRAMA (inscripción + mensualidad).
Si pregunta "¿Qué se ve en [programa]?", muestra el temario detallado por ciclos que aparece arriba.
`

  return context.trim()
}

export function buildCoursesContext(courses: CourseInfo[]): string {
  if (!courses.length) {
    return 'No hay cursos disponibles actualmente.'
  }

  const context = `
## INFORMACIÓN DE CURSOS DISPONIBLES

Tenemos los siguientes cursos activos:

${courses
  .map((course) => {
    const status = course.cupos_disponibles > 0 ? '✅ DISPONIBLE' : '❌ LLENO'
    return `- **${course.nombre}** (${course.programa_nombre}): ${status}
  Matriculados: ${course.matriculados}/${course.cupos}
  Horario: ${course.horario || 'A confirmar'}
  Inicio: ${course.fecha_inicio || 'A confirmar'}
  Fin: ${course.fecha_fin || 'A confirmar'}
  ${course.precio_inscripcion ? `Cuota de inscripción: $${course.precio_inscripcion}` : ''}
  ${course.precio_mensualidad ? `Mensualidad: $${course.precio_mensualidad}` : ''}
  Profesor: ${course.profesor_nombre || 'A confirmar'}`
  })
  .join('\n\n')}

Cuando un cliente pregunte por cursos, horarios o disponibilidad, usa esta información para dar respuestas precisas.
Si preguntan por un curso específico, menciona cupos disponibles, horario exacto y precio.
`

  return context.trim()
}
