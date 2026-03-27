-- ============================================================
-- MIGRACIÓN: INFRAESTRUCTURA COMPLETA - PAGO POR CLASE
-- Academia Crystal Diamante — Marzo 2026
--
-- Ejecutar en Supabase SQL Editor (una sola vez).
-- ============================================================

-- 1. Vincular cada asistencia "presente" con su pago generado automáticamente
ALTER TABLE asistencias
  ADD COLUMN IF NOT EXISTS pago_id UUID REFERENCES pagos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_asistencias_pago_id ON asistencias(pago_id);

-- 2. Tipo de cuota: diferencia 'por_clase' vs 'mensual' vs 'inscripcion'
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS tipo_cuota TEXT DEFAULT 'mensual'
    CHECK (tipo_cuota IN ('inscripcion', 'mensual', 'por_clase', 'otro'));

-- Retroalimentar inscripciones existentes (numero_cuota = 0 → inscripcion)
UPDATE pagos
  SET tipo_cuota = 'inscripcion'
WHERE numero_cuota = 0 AND tipo_cuota = 'mensual';

-- 3. Valor por clase personalizable por matrícula (default $40.000)
--    Para estudiantes POR_CLASE con tarifa especial diferente.
ALTER TABLE matriculas
  ADD COLUMN IF NOT EXISTS valor_por_clase INTEGER DEFAULT 40000;

-- 4. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_pagos_tipo_cuota ON pagos(tipo_cuota);
CREATE INDEX IF NOT EXISTS idx_pagos_matricula_tipo ON pagos(matricula_id, tipo_cuota);

-- ============================================================
-- VERIFICAR resultados después de aplicar:
-- ============================================================
SELECT
  'asistencias.pago_id' AS campo,
  column_name IS NOT NULL AS existe
FROM information_schema.columns
WHERE table_name = 'asistencias' AND column_name = 'pago_id'
UNION ALL
SELECT
  'pagos.tipo_cuota',
  column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name = 'pagos' AND column_name = 'tipo_cuota'
UNION ALL
SELECT
  'matriculas.valor_por_clase',
  column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name = 'matriculas' AND column_name = 'valor_por_clase';
