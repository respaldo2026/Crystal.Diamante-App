-- ================================================================
-- DIAGNÓSTICO: PORTAL ESTUDIANTE – CURSO MARTES 2:00 PM
-- Ejecutar en Supabase → SQL Editor
-- Objetivo: identificar por qué los estudiantes del curso de los
-- martes 2pm no ven su asistencia ni calificaciones en el portal.
-- ================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1) Identificar el curso "martes 2pm"
-- ─────────────────────────────────────────────────────────────────
SELECT
  c.id          AS curso_id,
  c.nombre,
  c.dias_semana,
  c.hora_inicio,
  c.hora_fin,
  c.estado      AS estado_curso,
  p.nombre_completo AS profesor,
  COUNT(m.id)   AS total_matriculas
FROM public.cursos c
LEFT JOIN public.perfiles p ON p.id = c.profesor_id
LEFT JOIN public.matriculas m ON m.curso_id = c.id
WHERE
  -- Ajusta si el campo es array o texto
  (c.dias_semana ILIKE '%martes%' OR c.dias_semana::text ILIKE '%martes%')
  AND (c.hora_inicio::text LIKE '14:%' OR c.hora_inicio::text LIKE '2:%')
GROUP BY c.id, c.nombre, c.dias_semana, c.hora_inicio, c.hora_fin, c.estado, p.nombre_completo
ORDER BY c.id;


-- ─────────────────────────────────────────────────────────────────
-- 2) Matrículas del curso 84 — estado de cuenta auth por estudiante
-- ─────────────────────────────────────────────────────────────────
SELECT
  m.id            AS matricula_id,
  m.estado        AS estado_matricula,
  m.estudiante_id,
  p.nombre_completo,
  p.email,
  au.email        AS auth_email,
  au.id           AS auth_uid,
  CASE
    WHEN au.id IS NULL           THEN '❌ Sin cuenta de auth'
    WHEN au.id != m.estudiante_id THEN '⚠️ UUID mismatch'
    ELSE '✅ OK'
  END AS estado_cuenta
FROM public.matriculas m
LEFT JOIN public.perfiles p   ON p.id  = m.estudiante_id
LEFT JOIN auth.users     au   ON au.id = m.estudiante_id
WHERE m.curso_id = 84
ORDER BY m.estado, p.nombre_completo;


-- ─────────────────────────────────────────────────────────────────
-- 3) Asistencias registradas para el curso 84
-- ─────────────────────────────────────────────────────────────────
SELECT
  a.id            AS asistencia_id,
  a.fecha,
  a.estado        AS asistencia_estado,
  a.matricula_id,
  m.estado        AS estado_matricula,
  m.estudiante_id,
  p.nombre_completo
FROM public.asistencias a
JOIN  public.matriculas m ON m.id = a.matricula_id
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = 84
ORDER BY p.nombre_completo, a.fecha DESC;


-- ─────────────────────────────────────────────────────────────────
-- 4) Calificaciones registradas para el curso 84
-- ─────────────────────────────────────────────────────────────────
SELECT
  cal.id                AS calificacion_id,
  cal.matricula_id,
  cal.tipo_evaluacion,
  cal.calificacion,
  cal.nota,
  cal.fecha_evaluacion,
  m.estado              AS estado_matricula,
  m.estudiante_id,
  p.nombre_completo
FROM public.calificaciones cal
JOIN  public.matriculas m ON m.id = cal.matricula_id
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = 84
ORDER BY p.nombre_completo, cal.fecha_evaluacion DESC;


-- ─────────────────────────────────────────────────────────────────
-- 5) Estudiantes del curso 84 sin cuenta auth (huérfanos)
--    Estos NUNCA podrán ver su portal aunque tengan datos
-- ─────────────────────────────────────────────────────────────────
SELECT
  p.id            AS perfil_id,
  p.nombre_completo,
  p.email,
  p.rol,
  au.id           AS auth_uid
FROM public.matriculas m
LEFT JOIN public.perfiles  p  ON p.id  = m.estudiante_id
LEFT JOIN auth.users       au ON au.id = m.estudiante_id
WHERE m.curso_id = 84
  AND au.id IS NULL
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────────
-- 6) Matrículas con estado = 'cancelado' en el curso 84
--    El portal las excluye completamente (neq cancelado)
-- ─────────────────────────────────────────────────────────────────
SELECT
  m.id,
  m.estado,
  p.nombre_completo,
  p.email
FROM public.matriculas m
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = 84
  AND m.estado = 'cancelado'
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────────
-- 7) CORRECCIÓN: reactivar matrículas canceladas del curso 84
--    EJECUTAR SOLO si el paso 6 muestra estudiantes que siguen activos
-- ─────────────────────────────────────────────────────────────────
/*
UPDATE public.matriculas
SET estado = 'activo'
WHERE curso_id = 84
  AND estado = 'cancelado';
*/
