-- =====================================================
-- CAMBIAR ORDEN DE TEMAS EN "Artista Integral en Uñas"
-- Ciclo 2: "Sistemas Semipermanentes y Soft Gel"
-- 
-- ANTES:
--   1 - Esmaltado Semipermanente
--   2 - Press-on (Soft Gel)
--   3 - Efectos 1
--   4 - Efectos 2
--
-- DESPUÉS:
--   5 - Esmaltado Semipermanente
--   6 - Efectos 1
--   7 - Efectos 2
--   8 - Press-on (Soft Gel)
-- =====================================================

BEGIN;

-- 1) Obtener el pensum_id del ciclo 2 del programa "Artista Integral en Uñas"
WITH artista_pensum AS (
  SELECT p.id as pensum_id
  FROM pensum p
  JOIN programas prog ON p.programa_id = prog.id
  WHERE prog.nombre ILIKE '%Artista Integral%Uñas%'
    AND p.numero_ciclo = 2
  LIMIT 1
)
-- 2) Actualizar los órdenes de los temas
UPDATE pensum_cursos pc
SET orden = CASE 
  WHEN nombre_curso ILIKE '%Esmaltado%Semipermanente%' THEN 5
  WHEN nombre_curso ILIKE '%Efectos%1%' THEN 6
  WHEN nombre_curso ILIKE '%Efectos%2%' THEN 7
  WHEN nombre_curso ILIKE '%Press%On%Soft%Gel%' OR nombre_curso ILIKE '%Press-on%' THEN 8
  ELSE orden
END
WHERE pc.pensum_id = (SELECT pensum_id FROM artista_pensum);

-- 3) Verificación
SELECT 
  prog.nombre as programa,
  p.numero_ciclo,
  p.nombre_ciclo,
  pc.nombre_curso,
  pc.orden,
  pc.horas,
  pc.tipo_curso
FROM pensum_cursos pc
JOIN pensum p ON p.id = pc.pensum_id
JOIN programas prog ON p.programa_id = prog.id
WHERE prog.nombre ILIKE '%Artista Integral%Uñas%'
  AND p.numero_ciclo = 2
ORDER BY pc.orden ASC;

COMMIT;
