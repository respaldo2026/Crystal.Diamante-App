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
-- 2) Matrículas del curso (reemplaza <CURSO_ID> con el id del paso 1)
-- ─────────────────────────────────────────────────────────────────
/*
SELECT
  m.id            AS matricula_id,
  m.estado        AS estado_matricula,
  m.estudiante_id,
  p.nombre_completo,
  p.email,
  -- ¿El estudiante_id tiene cuenta de auth?
  au.email        AS auth_email,
  au.id           AS auth_uid,
  -- Si auth_uid ES NULL → no tienen cuenta de acceso creada
  -- Si auth_uid != m.estudiante_id → hay mismatch de UUIDs
  CASE
    WHEN au.id IS NULL THEN '❌ Sin cuenta de auth'
    WHEN au.id != m.estudiante_id THEN '⚠️ UUID mismatch'
    ELSE '✅ OK'
  END AS estado_cuenta
FROM public.matriculas m
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
LEFT JOIN auth.users au ON au.id = m.estudiante_id
WHERE m.curso_id = <CURSO_ID>   -- ← reemplaza con el id del paso 1
ORDER BY m.estado, p.nombre_completo;
*/


-- ─────────────────────────────────────────────────────────────────
-- 3) Asistencias registradas para ese curso
-- ─────────────────────────────────────────────────────────────────
/*
SELECT
  a.id            AS asistencia_id,
  a.fecha,
  a.estado        AS asistencia_estado,
  a.matricula_id,
  m.estado        AS estado_matricula,
  m.estudiante_id,
  p.nombre_completo
FROM public.asistencias a
JOIN public.matriculas m ON m.id = a.matricula_id
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = <CURSO_ID>   -- ← reemplaza
ORDER BY p.nombre_completo, a.fecha DESC;
*/


-- ─────────────────────────────────────────────────────────────────
-- 4) Calificaciones registradas para ese curso
-- ─────────────────────────────────────────────────────────────────
/*
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
JOIN public.matriculas m ON m.id = cal.matricula_id
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = <CURSO_ID>   -- ← reemplaza
ORDER BY p.nombre_completo, cal.fecha_evaluacion DESC;
*/


-- ─────────────────────────────────────────────────────────────────
-- 5) Verificar perfiles sin cuenta auth (huérfanos)
--    Estos estudiantes NUNCA podrán ver su portal aunque tengan datos
-- ─────────────────────────────────────────────────────────────────
/*
SELECT
  p.id            AS perfil_id,
  p.nombre_completo,
  p.email,
  p.rol,
  au.id           AS auth_uid
FROM public.perfiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE au.id IS NULL
  AND p.rol = 'estudiante'
ORDER BY p.nombre_completo;
*/


-- ─────────────────────────────────────────────────────────────────
-- 6) QUICK CHECK: matriculas con estado = 'cancelado' para ese curso
--    Si aparecen aquí, el portal los ignora y no muestra sus datos
-- ─────────────────────────────────────────────────────────────────
/*
SELECT
  m.id,
  m.estado,
  p.nombre_completo,
  p.email
FROM public.matriculas m
LEFT JOIN public.perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = <CURSO_ID>
  AND m.estado = 'cancelado'
ORDER BY p.nombre_completo;
*/


-- ─────────────────────────────────────────────────────────────────
-- 7) CORRECCIÓN RÁPIDA: si las matrículas están en 'cancelado' 
--    pero el estudiante sigue activo, cambiarlas a 'activo'
-- ─────────────────────────────────────────────────────────────────
/*
UPDATE public.matriculas
SET estado = 'activo'
WHERE curso_id = <CURSO_ID>
  AND estado = 'cancelado';
-- EJECUTAR SOLO después de verificar los resultados del paso 6
*/
