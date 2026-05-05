-- ============================================================
-- REGISTRAR ASISTENCIA SIN AFECTAR LIQUIDACION DE PROFESOR
--
-- Caso: grupo Martes 2:00 PM (curso 84), primera clase del 07 abr 2026.
-- Objetivo: marcar asistencia SOLO en public.asistencias.
-- NO toca public.sesiones_clase, por lo tanto NO altera nómina
-- ni la liquidación de la profesora nueva.
-- ============================================================

-- ============================================================
-- PASO 1: VERIFICAR EL GRUPO CORRECTO
-- Este script quedó preparado para el curso 84.
-- ============================================================
SELECT
  c.id,
  c.nombre,
  c.estado,
  c.fecha_inicio,
  c.dias_semana,
  c.hora_inicio,
  c.hora_fin,
  p.nombre_completo AS profesor_actual
FROM cursos c
LEFT JOIN perfiles p ON p.id = c.profesor_id
WHERE c.id = 84
ORDER BY c.fecha_inicio NULLS LAST, c.id;


-- ============================================================
-- PASO 2: DATOS YA DEFINIDOS PARA ESTE CASO
--
-- curso_id:     84
-- fecha_clase:  2026-04-07
--
-- IMPORTANTE:
-- - Si TODOS los estudiantes de ese grupo asistieron, puedes usar
--   la Opción A más abajo.
-- - Si solo asistió una parte del grupo, usa la Opción B
--   y pega solo las matrículas correctas. Esa es la opción más segura.
-- ============================================================
WITH parametros AS (
  SELECT
    84::bigint AS curso_id,
    '2026-04-07'::date AS fecha_clase,
    'Clase #1 · asistencia cargada manualmente sin tocar sesiones_clase por cambio de profesora'::text AS observacion
)
SELECT * FROM parametros;


-- ============================================================
-- PASO 3: VER LAS MATRÍCULAS DEL GRUPO ANTES DE INSERTAR
-- ============================================================
WITH parametros AS (
  SELECT 84::bigint AS curso_id
)
SELECT
  m.id AS matricula_id,
  pe.nombre_completo AS estudiante,
  pe.telefono,
  m.estado,
  m.fecha_inicio,
  c.nombre AS curso,
  c.dias_semana,
  c.hora_inicio
FROM matriculas m
JOIN perfiles pe ON pe.id = m.estudiante_id
JOIN cursos c ON c.id = m.curso_id
JOIN parametros p ON p.curso_id = m.curso_id
WHERE lower(coalesce(m.estado, '')) = 'activo'
ORDER BY pe.nombre_completo;


-- ============================================================
-- PASO 4A: MARCAR PRESENTE A TODO EL GRUPO
-- Usa esta opción SOLO si confirmas que TODOS asistieron.
-- ============================================================
WITH parametros AS (
  SELECT
    84::bigint AS curso_id,
    '2026-04-07'::date AS fecha_clase,
    'Clase #1 · asistencia cargada manualmente sin tocar sesiones_clase por cambio de profesora'::text AS observacion
),
matriculas_objetivo AS (
  SELECT m.id AS matricula_id
  FROM matriculas m
  JOIN parametros p ON p.curso_id = m.curso_id
  WHERE lower(coalesce(m.estado, '')) = 'activo'
)
INSERT INTO asistencias (matricula_id, fecha, estado, observaciones)
SELECT
  mo.matricula_id,
  p.fecha_clase,
  'presente',
  p.observacion
FROM matriculas_objetivo mo
CROSS JOIN parametros p
ON CONFLICT (matricula_id, fecha)
DO UPDATE SET
  estado = EXCLUDED.estado,
  observaciones = EXCLUDED.observaciones;


-- ============================================================
-- PASO 4B: MARCAR PRESENTE SOLO A ALGUNOS ESTUDIANTES
-- RECOMENDADO.
--
-- 1. Si NO asistieron todos, NO ejecutes el Paso 4A.
-- 2. Reemplaza las matrículas de ejemplo por las reales.
-- ============================================================
-- WITH parametros AS (
--   SELECT
--     84::bigint AS curso_id,
--     '2026-04-07'::date AS fecha_clase,
--     'Clase #1 · asistencia cargada manualmente sin tocar sesiones_clase por cambio de profesora'::text AS observacion
-- ),
-- matriculas_objetivo(matricula_id) AS (
--   VALUES
--     (1111),
--     (2222),
--     (3333)
-- ),
-- matriculas_validadas AS (
--   SELECT m.id AS matricula_id
--   FROM matriculas m
--   JOIN parametros p ON p.curso_id = m.curso_id
--   JOIN matriculas_objetivo mo ON mo.matricula_id = m.id
--   WHERE lower(coalesce(m.estado, '')) = 'activo'
-- )
-- INSERT INTO asistencias (matricula_id, fecha, estado, observaciones)
-- SELECT
--   mv.matricula_id,
--   p.fecha_clase,
--   'presente',
--   p.observacion
-- FROM matriculas_validadas mv
-- CROSS JOIN parametros p
-- ON CONFLICT (matricula_id, fecha)
-- DO UPDATE SET
--   estado = EXCLUDED.estado,
--   observaciones = EXCLUDED.observaciones;


-- ============================================================
-- PASO 5: VERIFICACIÓN FINAL
-- Debe mostrar solo los estudiantes esperados en estado 'presente'.
-- ============================================================
WITH parametros AS (
  SELECT
    84::bigint AS curso_id,
    '2026-04-07'::date AS fecha_clase
)
SELECT
  a.fecha,
  a.estado,
  a.observaciones,
  m.id AS matricula_id,
  pe.nombre_completo AS estudiante,
  c.nombre AS curso
FROM asistencias a
JOIN matriculas m ON m.id = a.matricula_id
JOIN perfiles pe ON pe.id = m.estudiante_id
JOIN cursos c ON c.id = m.curso_id
JOIN parametros p ON p.curso_id = c.id AND p.fecha_clase = a.fecha
ORDER BY pe.nombre_completo;
