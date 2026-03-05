-- Índices de rendimiento sugeridos para reducir latencia en dashboard profesor,
-- curso show y portal estudiante.
-- Ejecutar en Supabase SQL Editor.

create index if not exists idx_cursos_profesor_estado
  on public.cursos (profesor_id, estado);

create index if not exists idx_matriculas_curso_estado
  on public.matriculas (curso_id, estado);

create index if not exists idx_matriculas_estudiante_estado
  on public.matriculas (estudiante_id, estado);

create index if not exists idx_asistencias_matricula_fecha
  on public.asistencias (matricula_id, fecha);

create index if not exists idx_calificaciones_matricula_tipo_fecha
  on public.calificaciones (matricula_id, tipo_evaluacion, fecha_evaluacion desc);

create index if not exists idx_quiz_intentos_matricula_enviado
  on public.quiz_intentos_clase (matricula_id, enviado_at desc);

create index if not exists idx_pagos_estudiante_vencimiento
  on public.pagos (estudiante_id, fecha_vencimiento);

create index if not exists idx_pagos_matricula_estado_vencimiento
  on public.pagos (matricula_id, estado, fecha_vencimiento);

create index if not exists idx_sesiones_curso_fecha
  on public.sesiones_clase (curso_id, fecha);

create index if not exists idx_sesiones_profesor_fecha
  on public.sesiones_clase (profesor_id, fecha);

create index if not exists idx_quizzes_programa_activo_publicado
  on public.quizzes_clase (programa_id, activo, publicado);
