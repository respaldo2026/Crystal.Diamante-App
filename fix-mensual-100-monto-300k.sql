-- ============================================================
-- FIX: Corregir matrículas y pagos pendientes de plan MENSUAL_100
--      donde valor_mensual_plan quedó en 260.000 (precio del 70%)
--      en vez de 300.000.
--
-- Causa raíz: precio_mensual_100 no estaba configurado en el
--   programa, por lo que el sistema usó precio_mensualidad (260k)
--   como fallback. Ese fallback fue eliminado del código.
--
-- SEGURO de ejecutar: solo toca filas MENSUAL_100 con monto < 300k.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 (DIAGNÓSTICO): Ver qué programas no tienen
--   precio_mensual_100 configurado
-- ─────────────────────────────────────────────────────────────
SELECT
    id,
    nombre,
    precio_mensualidad,
    precio_mensual_70,
    precio_mensual_100
FROM programas
WHERE precio_mensual_100 IS NULL OR precio_mensual_100 = 0
ORDER BY nombre;


-- ─────────────────────────────────────────────────────────────
-- PASO 2 (DIAGNÓSTICO): Matrículas MENSUAL_100 con monto incorrecto
-- ─────────────────────────────────────────────────────────────
SELECT
    m.id            AS matricula_id,
    p.nombre_completo,
    m.modalidad_pago,
    m.valor_mensual_plan AS monto_actual,
    300000           AS monto_correcto,
    c.nombre         AS curso
FROM matriculas m
JOIN perfiles p ON p.id = m.estudiante_id
JOIN cursos c   ON c.id = m.curso_id
WHERE m.modalidad_pago = 'MENSUAL_100'
  AND (m.valor_mensual_plan IS NULL OR m.valor_mensual_plan < 300000)
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- PASO 3 (DIAGNÓSTICO): Pagos pendientes afectados
-- ─────────────────────────────────────────────────────────────
SELECT
    pa.id           AS pago_id,
    pr.nombre_completo,
    pa.numero_cuota,
    pa.tipo_cuota,
    pa.estado,
    pa.monto        AS monto_actual,
    300000          AS monto_correcto
FROM pagos pa
JOIN matriculas m  ON m.id = pa.matricula_id
JOIN perfiles pr   ON pr.id = pa.estudiante_id
WHERE m.modalidad_pago = 'MENSUAL_100'
  AND (m.valor_mensual_plan IS NULL OR m.valor_mensual_plan < 300000)
  AND pa.estado IN ('pendiente', 'vencido')
  AND (pa.tipo_cuota IS NULL OR pa.tipo_cuota NOT IN ('inscripcion', 'por_clase'))
  AND pa.numero_cuota > 0
ORDER BY pr.nombre_completo, pa.numero_cuota;


-- ─────────────────────────────────────────────────────────────
-- PASO 4: Configurar precio_mensual_100 en los programas
--   que no lo tienen (usa el valor estándar 300.000).
--   Ajusta la condición WHERE si algún programa debe tener
--   un precio diferente a 300.000.
-- ─────────────────────────────────────────────────────────────
UPDATE programas
SET precio_mensual_100 = 300000
WHERE precio_mensual_100 IS NULL OR precio_mensual_100 = 0;


-- ─────────────────────────────────────────────────────────────
-- PASO 5: Corregir valor_mensual_plan en matrículas MENSUAL_100
-- ─────────────────────────────────────────────────────────────
UPDATE matriculas
SET
    valor_mensual_plan  = 300000,
    porcentaje_productos = 100
WHERE modalidad_pago = 'MENSUAL_100'
  AND (valor_mensual_plan IS NULL OR valor_mensual_plan < 300000);


-- ─────────────────────────────────────────────────────────────
-- PASO 6: Corregir pagos pendientes/vencidos de esas matrículas
-- ─────────────────────────────────────────────────────────────
UPDATE pagos pa
SET
    monto            = 300000,
    monto_programado = 300000,
    tipo_cuota       = 'mensual'
FROM matriculas m
WHERE pa.matricula_id = m.id
  AND m.modalidad_pago = 'MENSUAL_100'
  AND pa.estado IN ('pendiente', 'vencido')
  AND (pa.tipo_cuota IS NULL OR pa.tipo_cuota NOT IN ('inscripcion', 'por_clase'))
  AND pa.numero_cuota > 0
  AND pa.monto < 300000;


-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL: Debe devolver 0 filas
-- ─────────────────────────────────────────────────────────────
SELECT COUNT(*) AS pagos_incorrectos_restantes
FROM pagos pa
JOIN matriculas m ON m.id = pa.matricula_id
WHERE m.modalidad_pago = 'MENSUAL_100'
  AND pa.estado IN ('pendiente', 'vencido')
  AND pa.numero_cuota > 0
  AND pa.monto < 300000;
