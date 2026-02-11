import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdrdcpnqcqazxnhnjxyj.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkcmRjcG5xY3Fhenhuo2h0dHBzOi8vc2RyZGNwbnFjcWF6eG5obmp4eWouc3VwYWJhc2UuY28iLCJpYXQiOjE3MzA3NzkyMzgsImV4cCI6MjA0NjM1OTIzOH0.nZ_Q2J7u-sIAm9_HZEoG0fL8LiDo-a6XfP_R8CgKnOE'

interface ProgramInfo {
  id: number
  nombre: string
  descripcion: string | null
  duracion: string | null
  duracion_horas: number | null
  precio: number | null
  precio_inscripcion: number | null
  precio_mensualidad: number | null
  requisitos: string | null
  certificacion: string | null
  activo: boolean
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
export function buildHierarchicalContext(
  programs: ProgramInfo[],
  courses: CourseInfo[],
  detectedProgram: ProgramInfo | null
): string {
  let context = `
## PROGRAMAS Y GRUPOS DISPONIBLES

### 📚 Programas Activos:
${programs
  .map((prog) => {
    const durationText = prog.duracion_horas 
      ? `(${prog.duracion_horas} horas)`
      : prog.duracion 
      ? `(${prog.duracion})`
      : ''
    
    const priceText = prog.precio 
      ? `$${prog.precio} COP`
      : prog.precio_inscripcion &&  prog.precio_mensualidad
      ? `Inscripción: $${prog.precio_inscripcion} + Mensualidad: $${prog.precio_mensualidad}`
      : 'Precio a definir'
    
    const reqText = prog.requisitos ? `Requisitos: ${prog.requisitos}` : ''
    const certText = prog.certificacion ? `Certificación: ${prog.certificacion}` : ''
    
    return `
- **${prog.nombre}** ${durationText}
  Descripción: ${prog.descripcion || 'N/A'}
  ${reqText ? `${reqText}` : ''}
  ${certText ? `${certText}` : ''}
  Inversi­ón: ${priceText}`
  })
  .join('\n')}

${detectedProgram ? `
### 📖 Grupos del Programa "${detectedProgram.nombre}":
${courses.length > 0 
  ? courses
      .map((course) => {
        const matriculados = course.matriculados || 0
        const cupos = course.cupos || 0
        const disponibles = course.cupos_disponibles || 0
        
        return `
- **${course.nombre}**
  Horario: ${course.horario || 'A confirmar'}
  Inicio: ${course.fecha_inicio || 'A confirmar'} | Fin: ${course.fecha_fin || 'A confirmar'}
  Cupos: ${matriculados}/${cupos} (${disponibles} disponibles)
  Profesor: ${course.profesor_nombre || 'A confirmar'}
  Precio: $${course.precio_inscripcion || course.precio || 'A definir'}`
      })
      .join('\n')
  : 'No hay grupos disponibles para este programa en este momento.'
}
` : ''}

Cuando un cliente pregunte por un programa específico, muestra sus grupos con horarios y disponibilidad.
Si pregunta "¿Qué programas tienen?", lista todos los programas.
Si pregunta "¿Cuáles son los grupos de [nombre]?", muestra solo grupos de ese programa.
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
