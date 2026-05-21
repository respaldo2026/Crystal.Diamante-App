-- ============================================================
-- FIX: Corregir monto de pagos POR_CLASE que quedaron en $260.000
--      (el backfill usó precio_mensualidad en vez de precio_por_clase).
--
-- La modalidad POR_CLASE cobra $40.000 por clase asistida
-- (o programas.precio_por_clase si está configurado distinto).
--
-- SEGURO de ejecutar: solo toca filas con modalidad_pago = 'POR_CLASE'
--                     y tipo_cuota = 'por_clase' con monto != correcto.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 (DIAGNÓSTICO): ver matrículas POR_CLASE y su valor_por_clase
-- ─────────────────────────────────────────────────────────────
SELECT
    m.id            AS matricula_id,
    p.nombre_completo,
    m.modalidad_pago,
    m.valor_por_clase AS valor_actual,
    COALESCE(prog.precio_por_clase, 40000) AS valor_correcto,
    c.nombre AS curso
FROM matriculas m
JOIN perfiles p   ON p.id = m.estudiante_id
JOIN cursos c     ON c.id = m.curso_id
JOIN programas prog ON prog.id = c.programa_id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND (m.valor_por_clase IS NULL OR m.valor_por_clase <> COALESCE(prog.precio_por_clase, 40000))
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- PASO 2 (DIAGNÓSTICO): pagos POR_CLASE con monto incorrecto
-- ─────────────────────────────────────────────────────────────
SELECT
    pa.id           AS pago_id,
    pr.nombre_completo,
    pa.numero_cuota,
    pa.tipo_cuota,
    pa.estado,
    pa.monto        AS monto_actual,
    COALESCE(prog.precio_por_clase, 40000) AS monto_correcto,
    pa.periodo_pagado
FROM pagos pa
JOIN matriculas m   ON m.id = pa.matricula_id
JOIN perfiles pr    ON pr.id = pa.estudiante_id
JOIN cursos c       ON c.id = m.curso_id
JOIN programas prog ON prog.id = c.programa_id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND pa.tipo_cuota = 'por_clase'
  AND pa.monto <> COALESCE(prog.precio_por_clase, 40000)
ORDER BY pr.nombre_completo, pa.numero_cuota;


-- ─────────────────────────────────────────────────────────────
-- PASO 3: Corregir valor_por_clase en matriculas POR_CLASE
-- ─────────────────────────────────────────────────────────────
UPDATE matriculas m
SET valor_por_clase = COALESCE(prog.precio_por_clase, 40000)
FROM cursos c
JOIN programas prog ON prog.id = c.programa_id
WHERE m.curso_id = c.id
  AND m.modalidad_pago = 'POR_CLASE'
  AND (m.valor_por_clase IS NULL OR m.valor_por_clase <> COALESCE(prog.precio_por_clase, 40000));


-- ─────────────────────────────────────────────────────────────
-- PASO 4: Corregir monto de todos los pagos POR_CLASE (cualquier estado)
--         con monto incorrecto
-- ─────────────────────────────────────────────────────────────
UPDATE pagos pa
SET
    monto            = COALESCE(prog.precio_por_clase, 40000),
    monto_programado = COALESCE(prog.precio_por_clase, 40000)
FROM matriculas m
JOIN cursos c       ON c.id = m.curso_id
JOIN programas prog ON prog.id = c.programa_id
WHERE pa.matricula_id = m.id
  AND m.modalidad_pago = 'POR_CLASE'
  AND pa.tipo_cuota = 'por_clase'
  AND pa.monto <> COALESCE(prog.precio_por_clase, 40000);


-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL: debe devolver 0 filas
-- ─────────────────────────────────────────────────────────────
SELECT COUNT(*) AS pagos_por_clase_con_monto_incorrecto
FROM pagos pa
JOIN matriculas m   ON m.id = pa.matricula_id
JOIN cursos c       ON c.id = m.curso_id
JOIN programas prog ON prog.id = c.programa_id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND pa.tipo_cuota = 'por_clase'
  AND pa.monto <> COALESCE(prog.precio_por_clase, 40000);
