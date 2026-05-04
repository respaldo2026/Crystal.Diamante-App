-- ============================================================
-- FIX: Trigger generar_cuotas_automaticas + datos POR_CLASE
--
-- Problema: El trigger NO lee modalidad_pago y crea cuotas
--   mensuales (monto=precio_mensualidad=260k) para TODOS los
--   planes, incluyendo POR_CLASE donde debería crear CERO.
--
-- Resultado visible en caja: estudiantes POR_CLASE ven
--   "Clase #1 $260.000" en vez de "$40.000 por clase".
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 (DIAGNÓSTICO): Ver pagos incorrectos actuales
-- ─────────────────────────────────────────────────────────────
SELECT
    pr.nombre_completo,
    m.modalidad_pago,
    pa.numero_cuota,
    pa.monto,
    pa.estado,
    pa.periodo_pagado
FROM pagos pa
JOIN matriculas m  ON m.id = pa.matricula_id
JOIN perfiles  pr  ON pr.id = pa.estudiante_id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND pa.numero_cuota > 0
  AND pa.estado IN ('pendiente', 'vencido')
ORDER BY pr.nombre_completo, pa.numero_cuota;


-- ─────────────────────────────────────────────────────────────
-- PASO 2: Eliminar cuotas numeradas erróneas de POR_CLASE
--   (solo las pendientes/vencidas; las pagadas NO se tocan)
-- ─────────────────────────────────────────────────────────────
DELETE FROM pagos
WHERE id IN (
    SELECT pa.id
    FROM pagos pa
    JOIN matriculas m ON m.id = pa.matricula_id
    WHERE m.modalidad_pago = 'POR_CLASE'
      AND pa.numero_cuota > 0
      AND pa.estado IN ('pendiente', 'vencido')
);


-- ─────────────────────────────────────────────────────────────
-- PASO 3: Actualizar el trigger para respetar modalidad_pago
--
--  - POR_CLASE:   crea SOLO pago de inscripción (cuota 0)
--  - MENSUAL_100: usa precio_mensual_100 (o 300.000 de fallback)
--  - MENSUAL_70:  usa precio_mensual_70 → precio_mensualidad (260k)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_cuotas_automaticas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_curso            RECORD;
  v_programa         RECORD;
  v_precio_inscripcion NUMERIC := 0;
  v_precio_cuota     NUMERIC := 0;
  v_num_cuotas       INTEGER := 5;
  v_fecha_base       DATE;
  v_has_periodo_pagado BOOLEAN := FALSE;
  v_i                INTEGER;
BEGIN
  -- Curso
  SELECT c.id, c.programa_id, c.fecha_inicio, to_jsonb(c) AS data
  INTO v_curso
  FROM public.cursos c
  WHERE c.id = NEW.curso_id;

  IF v_curso.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Programa
  SELECT p.id, to_jsonb(p) AS data
  INTO v_programa
  FROM public.programas p
  WHERE p.id = v_curso.programa_id;

  -- Precio de inscripción
  v_precio_inscripcion := COALESCE(
    NULLIF(v_programa.data->>'precio_inscripcion', '')::NUMERIC, 0
  );

  -- Número de cuotas
  v_num_cuotas := COALESCE(
    NULLIF(NULLIF(v_curso.data->>'numero_cuotas', '')::INTEGER, 0),
    NULLIF(
      REGEXP_REPLACE(COALESCE(v_programa.data->>'duracion', ''), '[^0-9]', '', 'g'),
      ''
    )::INTEGER,
    5
  );
  IF v_num_cuotas < 1 THEN v_num_cuotas := 5; END IF;

  v_fecha_base := COALESCE(NEW.fecha_inicio, v_curso.fecha_inicio, CURRENT_DATE);

  -- ¿Existe columna periodo_pagado en pagos?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pagos'
      AND column_name  = 'periodo_pagado'
  ) INTO v_has_periodo_pagado;

  -- 1) Pago de inscripción (cuota 0) — aplica a TODOS los planes
  IF v_precio_inscripcion > 0 THEN
    IF v_has_periodo_pagado THEN
      INSERT INTO public.pagos (
        estudiante_id, matricula_id, numero_cuota, periodo_pagado,
        monto, estado, metodo_pago, fecha_vencimiento, observaciones
      ) VALUES (
        NEW.estudiante_id, NEW.id, 0, 'Inscripción',
        v_precio_inscripcion, 'pendiente', NULL,
        v_fecha_base, 'Pago de inscripción'
      );
    ELSE
      INSERT INTO public.pagos (
        estudiante_id, matricula_id, numero_cuota,
        monto, estado, metodo_pago, fecha_vencimiento, observaciones
      ) VALUES (
        NEW.estudiante_id, NEW.id, 0,
        v_precio_inscripcion, 'pendiente', NULL,
        v_fecha_base, 'Pago de inscripción'
      );
    END IF;
  END IF;

  -- 2) Para POR_CLASE NO se crean cuotas numeradas.
  --    Las clases se cobran cuando se registra asistencia (caja virtual).
  IF NEW.modalidad_pago = 'POR_CLASE' THEN
    RETURN NEW;
  END IF;

  -- 3) Precio de cuota mensual según el plan
  IF NEW.modalidad_pago = 'MENSUAL_100' THEN
    v_precio_cuota := COALESCE(
      NULLIF(v_programa.data->>'precio_mensual_100', '')::NUMERIC,
      300000   -- fallback constante plan 100%
    );
  ELSE
    -- MENSUAL_70 (default para cualquier otro valor)
    v_precio_cuota := COALESCE(
      NULLIF(v_programa.data->>'precio_mensual_70', '')::NUMERIC,
      NULLIF(v_curso.data->>'precio_mensualidad', '')::NUMERIC,
      NULLIF(v_programa.data->>'precio_mensualidad', '')::NUMERIC,
      260000   -- fallback constante plan 70%
    );
  END IF;

  -- 4) Cuotas mensuales (cuota 1 … v_num_cuotas)
  IF v_precio_cuota > 0 THEN
    FOR v_i IN 1..v_num_cuotas LOOP
      IF v_has_periodo_pagado THEN
        INSERT INTO public.pagos (
          estudiante_id, matricula_id, numero_cuota, periodo_pagado,
          monto, estado, metodo_pago, fecha_vencimiento, observaciones
        ) VALUES (
          NEW.estudiante_id, NEW.id, v_i,
          'Ciclo mensual ' || v_i || ' de ' || v_num_cuotas,
          v_precio_cuota, 'pendiente', NULL,
          (v_fecha_base + ((v_i - 1) || ' month')::INTERVAL)::DATE,
          'Cuota mensual ' || v_i || ' de ' || v_num_cuotas
        );
      ELSE
        INSERT INTO public.pagos (
          estudiante_id, matricula_id, numero_cuota,
          monto, estado, metodo_pago, fecha_vencimiento, observaciones
        ) VALUES (
          NEW.estudiante_id, NEW.id, v_i,
          v_precio_cuota, 'pendiente', NULL,
          (v_fecha_base + ((v_i - 1) || ' month')::INTERVAL)::DATE,
          'Cuota mensual ' || v_i || ' de ' || v_num_cuotas
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Recrear trigger
DROP TRIGGER IF EXISTS trigger_generar_cuotas ON public.matriculas;
CREATE TRIGGER trigger_generar_cuotas
AFTER INSERT ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.generar_cuotas_automaticas();


-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
-- Debe devolver 0 filas
SELECT COUNT(*) AS cuotas_incorrectas_por_clase
FROM pagos pa
JOIN matriculas m ON m.id = pa.matricula_id
WHERE m.modalidad_pago = 'POR_CLASE'
  AND pa.numero_cuota > 0
  AND pa.estado IN ('pendiente', 'vencido');
