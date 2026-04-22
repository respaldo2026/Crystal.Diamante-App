-- FIX puntual por NOMBRE de estudiante
-- Caso: cambio de POR_CLASE a MENSUAL con consecutivo/periodo desalineado.
--
-- Que hace:
-- 1) Busca estudiante por nombre.
-- 2) Resuelve matricula objetivo (la mas reciente, o una especifica si la pasas).
-- 3) Elimina pendientes/vencidos heredados de clase.
-- 4) Renumera cuotas mensuales desde 1 y corrige periodo_pagado.
-- 5) Etiqueta historicos pagados por clase como "Pago previo por clase".
--
-- IMPORTANTE:
-- - Ajusta v_nombre_estudiante.
-- - Si hay mas de una coincidencia, el script se detiene con error para evitar tocar a la persona equivocada.
-- - Si quieres forzar matricula exacta, define v_matricula_id.

DO $$
DECLARE
  v_nombre_estudiante text := 'SARA TORO LONDOÑO'; -- <-- CAMBIA AQUI
  v_matricula_id uuid := null; -- <-- opcional: pega UUID de matricula si quieres forzar una

  v_estudiante_id uuid;
  v_match_count int;
  v_target_matricula uuid;
  v_total_cuotas int;
BEGIN
  -- 1) Resolver estudiante por nombre
  SELECT count(*)::int
  INTO v_match_count
  FROM perfiles p
  WHERE lower(coalesce(p.nombre_completo, '')) LIKE '%' || lower(trim(v_nombre_estudiante)) || '%';

  IF v_match_count = 0 THEN
    RAISE EXCEPTION 'No se encontro estudiante con nombre parecido a: %', v_nombre_estudiante;
  END IF;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'Se encontraron % estudiantes con nombre parecido a "%". Refina el nombre o usa v_matricula_id.', v_match_count, v_nombre_estudiante;
  END IF;

  SELECT p.id
  INTO v_estudiante_id
  FROM perfiles p
  WHERE lower(coalesce(p.nombre_completo, '')) LIKE '%' || lower(trim(v_nombre_estudiante)) || '%'
  LIMIT 1;

  -- 2) Resolver matricula objetivo
  IF v_matricula_id IS NOT NULL THEN
    SELECT m.id
    INTO v_target_matricula
    FROM matriculas m
    WHERE m.id = v_matricula_id
      AND m.estudiante_id = v_estudiante_id
    LIMIT 1;

    IF v_target_matricula IS NULL THEN
      RAISE EXCEPTION 'La matricula % no corresponde al estudiante %', v_matricula_id, v_nombre_estudiante;
    END IF;
  ELSE
    SELECT m.id
    INTO v_target_matricula
    FROM matriculas m
    WHERE m.estudiante_id = v_estudiante_id
    ORDER BY
      (m.estado = 'activo') DESC,
      coalesce(m.fecha_inicio, m.created_at) DESC,
      m.created_at DESC
    LIMIT 1;

    IF v_target_matricula IS NULL THEN
      RAISE EXCEPTION 'El estudiante % no tiene matriculas.', v_nombre_estudiante;
    END IF;
  END IF;

  RAISE NOTICE 'Estudiante ID: %', v_estudiante_id;
  RAISE NOTICE 'Matricula objetivo: %', v_target_matricula;

  -- 3) Eliminar pendientes/vencidos por clase (heredados)
  DELETE FROM pagos p
  WHERE p.matricula_id = v_target_matricula
    AND coalesce(p.numero_cuota, 0) > 0
    AND lower(coalesce(p.estado, '')) IN ('pendiente', 'vencido')
    AND (
      lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
      OR coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
    );

  -- 4) Renumerar cuotas mensuales existentes (no clase)
  WITH mensuales AS (
    SELECT
      p.id,
      row_number() OVER (
        ORDER BY
          coalesce(p.numero_cuota, 99999),
          coalesce(p.fecha_pago, p.fecha_vencimiento, p.created_at),
          p.id
      ) AS nuevo_numero
    FROM pagos p
    WHERE p.matricula_id = v_target_matricula
      AND coalesce(p.numero_cuota, 0) > 0
      AND NOT (
        lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
        OR coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
      )
  ), total AS (
    SELECT count(*)::int AS total_cuotas
    FROM mensuales
  )
  UPDATE pagos p
  SET
    numero_cuota = m.nuevo_numero,
    tipo_cuota = 'mensual',
    periodo_pagado = 'Cuota ' || m.nuevo_numero::text || ' de ' || t.total_cuotas::text
  FROM mensuales m
  CROSS JOIN total t
  WHERE p.id = m.id;

  -- 5) Etiquetar historicos pagados por clase
  UPDATE pagos p
  SET periodo_pagado = 'Pago previo por clase'
  WHERE p.matricula_id = v_target_matricula
    AND coalesce(p.numero_cuota, 0) > 0
    AND lower(coalesce(p.estado, '')) = 'pagado'
    AND (
      lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
      OR coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
    );

  -- 6) Conteo final informativo
  SELECT count(*)::int
  INTO v_total_cuotas
  FROM pagos p
  WHERE p.matricula_id = v_target_matricula
    AND coalesce(p.numero_cuota, 0) > 0
    AND NOT (
      lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
      OR coalesce(p.periodo_pagado, '') = 'pago previo por clase'
    );

  RAISE NOTICE 'Fix aplicado. Cuotas mensuales activas detectadas: %', v_total_cuotas;
END $$;

-- Verificacion final detallada
-- Reemplaza por el UUID que te imprime en NOTICE (Matricula objetivo), si quieres ver el detalle exacto.
-- select id, estado, numero_cuota, tipo_cuota, periodo_pagado, monto, total_abonado, saldo_pendiente, fecha_pago, fecha_vencimiento
-- from pagos
-- where matricula_id = 'REEMPLAZAR_MATRICULA_ID'
-- order by coalesce(numero_cuota, 99999), coalesce(fecha_pago, fecha_vencimiento, created_at), id;
