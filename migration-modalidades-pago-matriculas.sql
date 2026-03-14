-- Escalado de modalidades de pago para matrículas
-- Objetivo: agregar soporte POR_CLASE / MENSUAL_70 / MENSUAL_100
-- Seguridad: todos los registros actuales quedan en MENSUAL_70 para mantener compatibilidad.

ALTER TABLE public.programas
  ADD COLUMN IF NOT EXISTS precio_por_clase NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS precio_mensual_70 NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS precio_mensual_100 NUMERIC(10,2);

-- Backfill de configuración de planes en programas desde mensualidad histórica
UPDATE public.programas
SET
  precio_mensual_70 = COALESCE(precio_mensual_70, precio_mensualidad),
  precio_mensual_100 = COALESCE(precio_mensual_100, precio_mensualidad),
  precio_por_clase = COALESCE(precio_por_clase, 0)
WHERE precio_mensual_70 IS NULL
   OR precio_mensual_100 IS NULL
   OR precio_por_clase IS NULL;

ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS modalidad_pago TEXT,
  ADD COLUMN IF NOT EXISTS valor_mensual_plan NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS porcentaje_productos SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matriculas_modalidad_pago_check'
  ) THEN
    ALTER TABLE public.matriculas
      ADD CONSTRAINT matriculas_modalidad_pago_check
      CHECK (modalidad_pago IN ('POR_CLASE', 'MENSUAL_70', 'MENSUAL_100'));
  END IF;
END
$$;

ALTER TABLE public.matriculas
  ALTER COLUMN modalidad_pago SET DEFAULT 'MENSUAL_70',
  ALTER COLUMN valor_mensual_plan SET DEFAULT 260000,
  ALTER COLUMN porcentaje_productos SET DEFAULT 70;

-- Backfill seguro para matrículas existentes
UPDATE public.matriculas
SET
  modalidad_pago = COALESCE(modalidad_pago, 'MENSUAL_70');

UPDATE public.matriculas m
SET
  valor_mensual_plan = CASE m.modalidad_pago
    WHEN 'MENSUAL_100' THEN COALESCE(pr.precio_mensual_100, pr.precio_mensualidad, m.valor_mensual_plan, 0)
    WHEN 'POR_CLASE' THEN 0
    ELSE COALESCE(pr.precio_mensual_70, pr.precio_mensualidad, m.valor_mensual_plan, 0)
  END,
  porcentaje_productos = CASE m.modalidad_pago
    WHEN 'MENSUAL_100' THEN 100
    WHEN 'POR_CLASE' THEN 0
    ELSE 70
  END
FROM public.cursos c
LEFT JOIN public.programas pr ON pr.id = c.programa_id
WHERE m.curso_id = c.id
  AND (m.valor_mensual_plan IS NULL OR m.porcentaje_productos IS NULL);

ALTER TABLE public.matriculas
  ALTER COLUMN modalidad_pago SET NOT NULL,
  ALTER COLUMN valor_mensual_plan SET NOT NULL,
  ALTER COLUMN porcentaje_productos SET NOT NULL;

-- Mantener consistencia de cuotas pendientes para planes mensuales.
UPDATE public.pagos p
SET monto = CASE m.modalidad_pago
  WHEN 'MENSUAL_100' THEN COALESCE(pr.precio_mensual_100, pr.precio_mensualidad, p.monto, 0)
  ELSE COALESCE(pr.precio_mensual_70, pr.precio_mensualidad, p.monto, 0)
END
FROM public.matriculas m
JOIN public.cursos c ON c.id = m.curso_id
LEFT JOIN public.programas pr ON pr.id = c.programa_id
WHERE p.matricula_id = m.id
  AND COALESCE(p.numero_cuota, 0) > 0
  AND p.estado IN ('pendiente', 'vencido')
  AND m.modalidad_pago IN ('MENSUAL_70', 'MENSUAL_100');

CREATE INDEX IF NOT EXISTS idx_matriculas_modalidad_pago ON public.matriculas(modalidad_pago);
