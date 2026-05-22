-- =====================================================================
-- FIX: Insertar asistencia faltante de Clase #1 para ALISSON BRITH RESTREPO
-- Causa: cuando el profesor registró Clase #1 (04-may-2026), la matricula
--        de Alisson aún no estaba en estado activo/en curso/pendiente_pago,
--        por lo que el sistema no creó su registro de asistencia.
-- =====================================================================

-- PASO 1: Verificar el estado actual (solo lectura, sin cambios)
SELECT
  m.id        AS matricula_id,
  m.estado    AS estado_matricula,
  m.modalidad_pago,
  p.nombre_completo,
  c.nombre    AS curso,
  c.id        AS curso_id
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
JOIN cursos   c ON c.id = m.curso_id
WHERE p.nombre_completo ILIKE '%ALISSON%RESTREPO%'
  AND c.id = 85;

-- PASO 2: Verificar si ya tiene asistencia el 04-may-2026
-- (si hay resultado NO ejecutar el INSERT)
SELECT a.*
FROM asistencias a
JOIN matriculas m ON m.id = a.matricula_id
JOIN perfiles   p ON p.id = m.estudiante_id
WHERE p.nombre_completo ILIKE '%ALISSON%RESTREPO%'
  AND m.curso_id = 85
ORDER BY a.fecha;

-- PASO 3: Insertar la asistencia faltante
-- EJECUTAR SOLO si el PASO 2 no devuelve fila con fecha '2026-05-04'
INSERT INTO asistencias (matricula_id, fecha, estado, observaciones)
SELECT
  m.id,
  '2026-05-04',
  'presente',
  'Clase #1'
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
WHERE p.nombre_completo ILIKE '%ALISSON%RESTREPO%'
  AND m.curso_id = 85
  -- Asegurarse de no duplicar
  AND NOT EXISTS (
    SELECT 1 FROM asistencias a2
    WHERE a2.matricula_id = m.id
      AND a2.fecha = '2026-05-04'
  );

-- PASO 4: Verificar resultado final
SELECT a.id, a.fecha, a.estado, a.observaciones, m.id AS matricula_id
FROM asistencias a
JOIN matriculas m ON m.id = a.matricula_id
JOIN perfiles   p ON p.id = m.estudiante_id
WHERE p.nombre_completo ILIKE '%ALISSON%RESTREPO%'
  AND m.curso_id = 85
ORDER BY a.fecha;
