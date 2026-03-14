-- Escalado de modalidades de pago para matrículas
-- Objetivo: agregar soporte POR_CLASE / MENSUAL_70 / MENSUAL_100
-- Seguridad: todos los registros actuales quedan en MENSUAL_70 para mantener compatibilidad.

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

UPDATE public.matriculas
SET
  valor_mensual_plan = CASE modalidad_pago
    WHEN 'MENSUAL_100' THEN 300000
    WHEN 'POR_CLASE' THEN 0
    ELSE 260000
  END,
  porcentaje_productos = CASE modalidad_pago
    WHEN 'MENSUAL_100' THEN 100
    WHEN 'POR_CLASE' THEN 0
    ELSE 70
  END
WHERE valor_mensual_plan IS NULL
   OR porcentaje_productos IS NULL;

ALTER TABLE public.matriculas
  ALTER COLUMN modalidad_pago SET NOT NULL,
  ALTER COLUMN valor_mensual_plan SET NOT NULL,
  ALTER COLUMN porcentaje_productos SET NOT NULL;

-- Mantener consistencia de cuotas pendientes para planes mensuales.
UPDATE public.pagos p
SET monto = CASE m.modalidad_pago
  WHEN 'MENSUAL_100' THEN 300000
  ELSE 260000
END
FROM public.matriculas m
WHERE p.matricula_id = m.id
  AND COALESCE(p.numero_cuota, 0) > 0
  AND p.estado IN ('pendiente', 'vencido')
  AND m.modalidad_pago IN ('MENSUAL_70', 'MENSUAL_100');

CREATE INDEX IF NOT EXISTS idx_matriculas_modalidad_pago ON public.matriculas(modalidad_pago);
