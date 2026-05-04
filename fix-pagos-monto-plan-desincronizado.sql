-- ============================================================
-- FIX: Sincronizar monto de pagos pendientes con el plan real
-- de la matrícula (cuando cambiaron el plan pero los pagos
-- conservaron el monto viejo).
--
-- Qué hace:
--   1. Actualiza monto + monto_programado en cuotas PENDIENTES/VENCIDAS
--      donde el monto almacenado difiere del valor_mensual_plan
--      actual de la matrícula.
--   2. Solo afecta cuotas mensuales (tipo_cuota = 'mensual' o nulo
--      para planes mensuales). No toca cuotas de inscripción ni
--      cuotas por_clase.
--
-- SEGURO de ejecutar: solo UPDATE en filas con discrepancia.
-- Ejecutar en Supabase → SQL Editor.
-- ============================================================

-- Paso 1: Ver qué registros se afectarían (sin modificar nada)
SELECT
    p.id            AS pago_id,
    p.matricula_id,
    p.numero_cuota,
    p.tipo_cuota,
    p.estado,
    p.monto         AS monto_actual,
    p.monto_programado AS monto_programado_actual,
    m.modalidad_pago,
    m.valor_mensual_plan AS monto_correcto
FROM pagos p
JOIN matriculas m ON m.id = p.matricula_id
WHERE
    p.estado IN ('pendiente', 'vencido')
    AND m.modalidad_pago IN ('MENSUAL_70', 'MENSUAL_100')
    AND m.valor_mensual_plan > 0
    AND (p.tipo_cuota IS NULL OR p.tipo_cuota NOT IN ('por_clase', 'inscripcion'))
    AND p.numero_cuota > 0
    AND p.monto <> m.valor_mensual_plan
ORDER BY p.matricula_id, p.numero_cuota;


-- Paso 2: Aplicar la corrección
UPDATE pagos p
SET
    monto            = m.valor_mensual_plan,
    monto_programado = m.valor_mensual_plan,
    tipo_cuota       = 'mensual'
FROM matriculas m
WHERE
    p.matricula_id = m.id
    AND p.estado IN ('pendiente', 'vencido')
    AND m.modalidad_pago IN ('MENSUAL_70', 'MENSUAL_100')
    AND m.valor_mensual_plan > 0
    AND (p.tipo_cuota IS NULL OR p.tipo_cuota NOT IN ('por_clase', 'inscripcion'))
    AND p.numero_cuota > 0
    AND p.monto <> m.valor_mensual_plan;
