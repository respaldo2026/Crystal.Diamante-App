-- Backfill: estandarizar 3 horas por clase en historico
-- Objetivo:
-- 1) Forzar sesiones_clase.horas_dictadas = 3
-- 2) Recalcular/crear egresos de nomina por sesion (movimientos_financieros)
--    usando referencia sesion_clase_<id>
--
-- Ejecutar en Supabase SQL Editor.

BEGIN;

-- 1) Forzar 3h en todas las sesiones ya registradas.
WITH sesiones_actualizadas AS (
  UPDATE sesiones_clase
  SET horas_dictadas = 3
  WHERE COALESCE(horas_dictadas, 0) <> 3
  RETURNING id
)
SELECT COUNT(*) AS sesiones_corregidas_a_3h
FROM sesiones_actualizadas;

-- 2) Actualizar egresos existentes ligados a sesiones.
WITH egresos_actualizados AS (
  UPDATE movimientos_financieros mf
  SET
    tipo = 'egreso',
    categoria = 'nomina',
    monto = 3 * COALESCE(p.valor_hora, 0),
    concepto = 'Clase dictada - ' || COALESCE(p.nombre_completo, 'Profesora') || ' (3h)',
    proveedor_id = s.profesor_id
  FROM sesiones_clase s
  LEFT JOIN perfiles p ON p.id = s.profesor_id
  WHERE mf.referencia = ('sesion_clase_' || s.id::text)
  RETURNING mf.id
)
SELECT COUNT(*) AS egresos_actualizados
FROM egresos_actualizados;

-- 3) Insertar egresos faltantes por sesiones que no tengan movimiento.
WITH sesiones_fuente AS (
  SELECT
    s.id,
    s.fecha,
    s.profesor_id,
    COALESCE(p.valor_hora, 0) AS valor_hora,
    COALESCE(p.nombre_completo, 'Profesora') AS nombre_profesora
  FROM sesiones_clase s
  LEFT JOIN perfiles p ON p.id = s.profesor_id
  WHERE s.fecha IS NOT NULL
),
insertados AS (
  INSERT INTO movimientos_financieros (
    fecha,
    tipo,
    monto,
    concepto,
    categoria,
    referencia,
    proveedor_id,
    conciliado,
    created_by
  )
  SELECT
    sf.fecha,
    'egreso',
    3 * sf.valor_hora,
    'Clase dictada - ' || sf.nombre_profesora || ' (3h)',
    'nomina',
    'sesion_clase_' || sf.id::text,
    sf.profesor_id,
    false,
    NULL
  FROM sesiones_fuente sf
  WHERE NOT EXISTS (
    SELECT 1
    FROM movimientos_financieros mf
    WHERE mf.referencia = ('sesion_clase_' || sf.id::text)
  )
  RETURNING id
)
SELECT COUNT(*) AS egresos_insertados
FROM insertados;

-- 4) Verificacion rapida.
SELECT
  COUNT(*) FILTER (WHERE COALESCE(horas_dictadas, 0) <> 3) AS sesiones_fuera_de_regla,
  COUNT(*) AS sesiones_total
FROM sesiones_clase;

SELECT
  COUNT(*) FILTER (WHERE referencia LIKE 'sesion_clase_%' AND concepto NOT ILIKE '%(3h)%') AS egresos_con_concepto_no_3h,
  COUNT(*) FILTER (WHERE referencia LIKE 'sesion_clase_%') AS egresos_sesion_total
FROM movimientos_financieros;

COMMIT;
