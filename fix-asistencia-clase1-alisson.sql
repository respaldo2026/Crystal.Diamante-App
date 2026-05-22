-- =====================================================================
-- FIX: Insertar asistencias faltantes de Clase #1 para TODOS los
--      estudiantes del curso 85 que no tienen registro del 04-may-2026
--      pero SÍ tienen asistencias posteriores (probaron que estaban activos).
--
-- CAUSA: El 04-may-2026 (primer día del curso), el profesor registró la
--        sesión vía el modal SIN haber tomado lista primero (la validación
--        no existía aún). El modal solo inserta asistencias para matriculas
--        ya en estado activo/en curso/pendiente_pago en ese instante exacto.
--        Los estudiantes inscritos ese mismo día pudieron quedar excluidos.
-- =====================================================================

-- ─── PASO 1: DIAGNÓSTICO ────────────────────────────────────────────
-- Ver todos los estudiantes del curso y cuántas asistencias tienen
-- (ejecutar primero, sin cambios)
SELECT
  p.nombre_completo,
  m.id            AS matricula_id,
  m.estado        AS estado_matricula,
  m.modalidad_pago,
  COUNT(a.id)     AS total_asistencias,
  MIN(a.fecha)    AS primera_asistencia,
  BOOL_OR(a.fecha = '2026-05-04') AS tiene_clase1
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
LEFT JOIN asistencias a ON a.matricula_id = m.id
WHERE m.curso_id = 85
GROUP BY p.nombre_completo, m.id, m.estado, m.modalidad_pago
ORDER BY p.nombre_completo;

-- ─── PASO 2: DETECTAR AFECTADOS ─────────────────────────────────────
-- Estudiantes que NO tienen asistencia el 04-may-2026
-- pero SÍ tienen al menos una asistencia posterior
SELECT
  p.nombre_completo,
  m.id AS matricula_id,
  m.estado
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
WHERE m.curso_id = 85
  -- No tienen Clase #1
  AND NOT EXISTS (
    SELECT 1 FROM asistencias a
    WHERE a.matricula_id = m.id AND a.fecha = '2026-05-04'
  )
  -- Pero sí tienen asistencias posteriores (estaban activos)
  AND EXISTS (
    SELECT 1 FROM asistencias a2
    WHERE a2.matricula_id = m.id AND a2.fecha > '2026-05-04'
  )
ORDER BY p.nombre_completo;

-- ─── PASO 3: INSERTAR LAS ASISTENCIAS FALTANTES ─────────────────────
-- Inserta "presente" para todos los afectados detectados en PASO 2.
-- El NOT EXISTS garantiza idempotencia (seguro ejecutar varias veces).
INSERT INTO asistencias (matricula_id, fecha, estado, observaciones)
SELECT
  m.id,
  '2026-05-04',
  'presente',
  'Clase #1'
FROM matriculas m
WHERE m.curso_id = 85
  AND NOT EXISTS (
    SELECT 1 FROM asistencias a
    WHERE a.matricula_id = m.id AND a.fecha = '2026-05-04'
  )
  AND EXISTS (
    SELECT 1 FROM asistencias a2
    WHERE a2.matricula_id = m.id AND a2.fecha > '2026-05-04'
  );

-- ─── PASO 4: VERIFICAR RESULTADO FINAL ──────────────────────────────
SELECT
  p.nombre_completo,
  m.id            AS matricula_id,
  COUNT(a.id)     AS total_asistencias,
  MIN(a.fecha)    AS primera_asistencia,
  BOOL_OR(a.fecha = '2026-05-04') AS tiene_clase1
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
LEFT JOIN asistencias a ON a.matricula_id = m.id
WHERE m.curso_id = 85
GROUP BY p.nombre_completo, m.id
ORDER BY p.nombre_completo;
