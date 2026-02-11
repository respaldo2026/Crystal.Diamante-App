import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdrdcpnqcqazxnhnjxyj.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkcmRjcG5xY3Fhenhuo2h0dHBzOi8vc2RyZGNwbnFjcWF6eG5obmp4eWouc3VwYWJhc2UuY28iLCJpYXQiOjE3MzA3NzkyMzgsImV4cCI6MjA0NjM1OTIzOH0.nZ_Q2J7u-sIAm9_HZEoG0fL8LiDo-a6XfP_R8CgKnOE'

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
}

export async function getCoursesForAgent(): Promise<CourseInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Query the view specifically designed for AI with course info
    const { data, error } = await supabase
      .from('vw_cursos_para_ia')
      .select('*')
      .eq('estado', 'activo')
      .order('fecha_inicio', { ascending: true })

    if (error) {
      console.error('[getCoursesForAgent] Error fetching courses:', error)
      return []
    }

    return data as CourseInfo[]
  } catch (error) {
    console.error('[getCoursesForAgent] Exception:', error)
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
