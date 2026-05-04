-- ============================================================
-- VERIFICACIÓN CAJA: 
--   1. Estudiantes POR_CLASE → cuántas clases tiene el pensum
--   2. Estudiantes mensuales → si el monto coincide con su plan
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 1: Pensum de programas con estudiantes POR_CLASE
--   → Debe mostrar el total de clases/temas por programa.
--   Si el total es 0, el kiosco no puede mostrar clases virtuales.
-- ─────────────────────────────────────────────────────────────
SELECT
    prog.id             AS programa_id,
    prog.nombre         AS programa,
    COUNT(DISTINCT pc.id) AS total_clases_pensum,
    CASE
        WHEN COUNT(DISTINCT pc.id) = 0 THEN '❌ Sin pensum — clases virtuales no aparecerán'
        ELSE CONCAT('✅ ', COUNT(DISTINCT pc.id), ' clases configuradas')
    END AS estado_pensum
FROM programas prog
JOIN cursos c          ON c.programa_id = prog.id
JOIN matriculas m      ON m.curso_id = c.id AND m.estado = 'activo'
LEFT JOIN pensum ps          ON ps.programa_id = prog.id AND ps.activo = true
LEFT JOIN pensum_cursos pc   ON pc.pensum_id = ps.id
WHERE m.modalidad_pago = 'POR_CLASE'
GROUP BY prog.id, prog.nombre
ORDER BY total_clases_pensum ASC;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 2: Estudiantes activos POR_CLASE con sus clases
--   pagadas vs total esperado
-- ─────────────────────────────────────────────────────────────
WITH clases_pensum AS (
    SELECT
        c.id AS curso_id,
        COUNT(pc.id) AS total_clases
    FROM cursos c
    JOIN pensum ps         ON ps.programa_id = c.programa_id AND ps.activo = true
    JOIN pensum_cursos pc  ON pc.pensum_id = ps.id
    GROUP BY c.id
),
clases_pagadas AS (
    SELECT
        p.matricula_id,
        COUNT(*) FILTER (WHERE p.estado = 'pagado')   AS pagadas,
        COUNT(*) FILTER (WHERE p.estado IN ('pendiente','vencido')) AS pendientes,
        MAX(p.numero_cuota)                             AS max_cuota_registrada
    FROM pagos p
    WHERE p.tipo_cuota = 'por_clase' OR p.numero_cuota > 0
    GROUP BY p.matricula_id
)
SELECT
    per.nombre_completo,
    cur.nombre                          AS curso,
    COALESCE(cp.total_clases, 0)        AS total_clases_pensum,
    COALESCE(cl.pagadas, 0)             AS clases_pagadas,
    COALESCE(cl.pendientes, 0)          AS clases_pendientes_en_db,
    COALESCE(cl.max_cuota_registrada, 0) AS max_clase_registrada,
    CASE
        WHEN COALESCE(cp.total_clases, 0) = 0
            THEN '⚠️  Pensum no configurado'
        WHEN COALESCE(cl.max_cuota_registrada, 0) > COALESCE(cp.total_clases, 0)
            THEN '⚠️  Hay más clases registradas que en el pensum'
        ELSE '✅ OK'
    END AS estado
FROM matriculas m
JOIN perfiles per   ON per.id = m.estudiante_id
JOIN cursos cur     ON cur.id = m.curso_id
LEFT JOIN clases_pensum cp  ON cp.curso_id = m.curso_id
LEFT JOIN clases_pagadas cl ON cl.matricula_id = m.id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND m.estado = 'activo'
ORDER BY per.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 3: Estudiantes mensuales — monto vs plan esperado
--   ✅ = monto coincide con el plan
--   ❌ = monto incorrecto (ejecutar fix-mensual-100-monto-300k.sql)
-- ─────────────────────────────────────────────────────────────
SELECT
    per.nombre_completo,
    m.modalidad_pago,
    m.valor_mensual_plan                AS monto_en_matricula,
    CASE m.modalidad_pago
        WHEN 'MENSUAL_100' THEN 300000
        WHEN 'MENSUAL_70'  THEN 260000
        ELSE NULL
    END                                 AS monto_esperado,
    CASE
        WHEN m.modalidad_pago = 'MENSUAL_100' AND (m.valor_mensual_plan IS NULL OR m.valor_mensual_plan < 300000)
            THEN '❌ Debe ser $300.000 — ejecutar fix-mensual-100-monto-300k.sql'
        WHEN m.modalidad_pago = 'MENSUAL_70'  AND (m.valor_mensual_plan IS NULL OR m.valor_mensual_plan <> 260000)
            THEN '⚠️  Revisar — se esperan $260.000'
        ELSE '✅ Correcto'
    END AS estado_monto,
    prog.precio_mensual_70,
    prog.precio_mensual_100
FROM matriculas m
JOIN perfiles per   ON per.id = m.estudiante_id
JOIN cursos cur     ON cur.id = m.curso_id
LEFT JOIN programas prog ON prog.id = cur.programa_id
WHERE m.modalidad_pago IN ('MENSUAL_70','MENSUAL_100')
  AND m.estado = 'activo'
ORDER BY estado_monto DESC, per.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 4: Programas sin precio_mensual_100 ni precio_mensual_70
--   configurados (causarán monto 0 en cuotas virtuales de caja
--   si valor_mensual_plan también es null)
-- ─────────────────────────────────────────────────────────────
SELECT
    prog.id,
    prog.nombre,
    prog.precio_mensualidad,
    prog.precio_mensual_70,
    prog.precio_mensual_100,
    prog.precio_por_clase,
    CASE
        WHEN prog.precio_mensual_70 IS NULL  THEN '⚠️  Falta precio_mensual_70'
        ELSE '✅'
    END AS estado_70,
    CASE
        WHEN prog.precio_mensual_100 IS NULL THEN '⚠️  Falta precio_mensual_100'
        ELSE '✅'
    END AS estado_100
FROM programas prog
WHERE prog.activo = true
  AND (prog.precio_mensual_70 IS NULL OR prog.precio_mensual_100 IS NULL)
ORDER BY prog.nombre;
