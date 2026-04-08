-- Consolidar sesiones duplicadas por curso y fecha antes de aplicar unicidad.
WITH duplicadas AS (
  SELECT
    curso_id,
    fecha,
    (ARRAY_AGG(id ORDER BY created_at ASC NULLS FIRST, id::text ASC))[1] AS id_conservar,
    ARRAY_AGG(id ORDER BY created_at ASC NULLS FIRST, id::text ASC) AS ids,
    (ARRAY_AGG(profesor_id ORDER BY created_at DESC NULLS LAST, id::text DESC)
      FILTER (WHERE profesor_id IS NOT NULL))[1] AS profesor_id,
    MAX(horas_dictadas) FILTER (WHERE horas_dictadas IS NOT NULL) AS horas_dictadas,
    (ARRAY_AGG(tema_visto ORDER BY created_at DESC NULLS LAST, id::text DESC)
      FILTER (WHERE tema_visto IS NOT NULL AND tema_visto <> ''))[1] AS tema_visto,
    CASE
      WHEN BOOL_OR(estado_pago = 'pagado') THEN 'pagado'
      ELSE 'pendiente'
    END AS estado_pago
  FROM sesiones_clase
  GROUP BY curso_id, fecha
  HAVING COUNT(*) > 1
),
actualizadas AS (
  UPDATE sesiones_clase sc
  SET
    profesor_id = COALESCE(d.profesor_id, sc.profesor_id),
    horas_dictadas = COALESCE(d.horas_dictadas, sc.horas_dictadas, 3),
    tema_visto = COALESCE(d.tema_visto, sc.tema_visto),
    estado_pago = COALESCE(d.estado_pago, sc.estado_pago, 'pendiente')
  FROM duplicadas d
  WHERE sc.id = d.id_conservar
  RETURNING sc.id
)
DELETE FROM sesiones_clase sc
USING duplicadas d
WHERE sc.curso_id = d.curso_id
  AND sc.fecha = d.fecha
  AND sc.id <> d.id_conservar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sesiones_clase_curso_id_fecha_key'
  ) THEN
    ALTER TABLE sesiones_clase
      ADD CONSTRAINT sesiones_clase_curso_id_fecha_key UNIQUE (curso_id, fecha);
  END IF;
END $$;