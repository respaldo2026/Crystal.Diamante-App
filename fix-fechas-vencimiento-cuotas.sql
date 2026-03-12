-- ============================================================
-- FIX: Fechas de vencimiento adelantadas en cuotas mensuales
-- 
-- PROBLEMA: La cuota 1 vencía en fecha_inicio + 1 mes (incorrecto).
-- CORRECTO: Cuota 1 vence en fecha_inicio (mismo día de inicio),
--           Cuota 2 vence en fecha_inicio + 1 mes,
--           Cuota N vence en fecha_inicio + (N-1) meses.
--
-- PASOS:
--   1. Corrige el trigger para nuevas matrículas.
--   2. Corrige los pagos existentes con fecha_vencimiento adelantada.
-- ============================================================

-- ============================================================
-- PASO 1: Recrear el trigger con la fórmula correcta (i - 1)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generar_cuotas_automaticas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_curso RECORD;
  v_programa RECORD;
  v_precio_inscripcion NUMERIC := 0;
  v_precio_mensualidad NUMERIC := 0;
  v_num_cuotas INTEGER := 4;
  v_fecha_base DATE;
  v_has_periodo_pagado BOOLEAN := FALSE;
  v_i INTEGER;
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

  -- Precios
  v_precio_inscripcion := COALESCE(
    NULLIF(v_programa.data->>'precio_inscripcion', '')::NUMERIC, 0
  );

  v_precio_mensualidad := COALESCE(
    NULLIF(v_curso.data->>'precio_mensualidad', '')::NUMERIC,
    NULLIF(v_programa.data->>'precio_mensualidad', '')::NUMERIC,
    NULLIF(v_programa.data->>'precio_curso', '')::NUMERIC,
    0
  );

  v_num_cuotas := COALESCE(
    NULLIF(v_curso.data->>'numero_cuotas', '')::INTEGER,
    NULLIF(v_programa.data->>'numero_cuotas', '')::INTEGER,
    4
  );

  IF v_num_cuotas < 1 THEN
    v_num_cuotas := 1;
  END IF;

  v_fecha_base := COALESCE(NEW.fecha_inicio, v_curso.fecha_inicio, CURRENT_DATE);

  -- ¿Existe columna periodo_pagado en pagos?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pagos'
      AND column_name  = 'periodo_pagado'
  ) INTO v_has_periodo_pagado;

  -- 1) Pago de inscripción (cuota 0): vence el mismo día de inicio
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

  -- 2) Cuotas mensuales:
  --    Cuota 1 → fecha_base + 0 meses (mismo día de inicio)
  --    Cuota 2 → fecha_base + 1 mes
  --    Cuota N → fecha_base + (N-1) meses
  IF v_precio_mensualidad > 0 THEN
    FOR v_i IN 1..v_num_cuotas LOOP
      IF v_has_periodo_pagado THEN
        INSERT INTO public.pagos (
          estudiante_id, matricula_id, numero_cuota, periodo_pagado,
          monto, estado, metodo_pago, fecha_vencimiento, observaciones
        ) VALUES (
          NEW.estudiante_id, NEW.id, v_i,
          'Cuota ' || v_i || ' de ' || v_num_cuotas,
          v_precio_mensualidad, 'pendiente', NULL,
          (v_fecha_base + ((v_i - 1) || ' month')::INTERVAL)::DATE,
          'Cuota mensual ' || v_i || ' de ' || v_num_cuotas
        );
      ELSE
        INSERT INTO public.pagos (
          estudiante_id, matricula_id, numero_cuota,
          monto, estado, metodo_pago, fecha_vencimiento, observaciones
        ) VALUES (
          NEW.estudiante_id, NEW.id, v_i,
          v_precio_mensualidad, 'pendiente', NULL,
          (v_fecha_base + ((v_i - 1) || ' month')::INTERVAL)::DATE,
          'Cuota mensual ' || v_i || ' de ' || v_num_cuotas
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_generar_cuotas ON public.matriculas;
CREATE TRIGGER trigger_generar_cuotas
AFTER INSERT ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.generar_cuotas_automaticas();

-- ============================================================
-- PASO 2: Corregir pagos existentes con fecha adelantada
--
-- Solo actualiza cuotas mensuales (numero_cuota >= 1) cuya
-- fecha_vencimiento actual coincide con la fórmula incorrecta
-- (fecha_inicio + numero_cuota meses), restándole 1 mes.
-- ============================================================

UPDATE public.pagos p
SET    fecha_vencimiento = (p.fecha_vencimiento - INTERVAL '1 month')::DATE
FROM   public.matriculas m
WHERE  p.matricula_id    = m.id
  AND  p.numero_cuota   >= 1
  AND  p.fecha_vencimiento IS NOT NULL
  AND  (COALESCE(m.fecha_inicio, CURRENT_DATE) + (p.numero_cuota || ' months')::INTERVAL)::DATE
       = p.fecha_vencimiento;

-- Verificación: muestra los pagos actualizados agrupados por número de cuota
SELECT
  p.numero_cuota,
  m.fecha_inicio              AS "Inicio curso",
  p.fecha_vencimiento         AS "Nuevo vencimiento (correcto)",
  p.estado,
  COUNT(*)                    AS registros
FROM   public.pagos p
JOIN   public.matriculas m ON m.id = p.matricula_id
WHERE  p.numero_cuota >= 1
GROUP  BY p.numero_cuota, m.fecha_inicio, p.fecha_vencimiento, p.estado
ORDER  BY m.fecha_inicio, p.numero_cuota;

-- ============================================================
-- PASO 3: Corregir fecha_inicio en matriculas que no coinciden
--         con la fecha de inicio real del curso
--
-- PROBLEMA: Al crear una matrícula el formulario guardaba la
-- fecha actual en lugar de la fecha del curso. Ej: un estudiante
-- inscrito el 24-feb en el curso del 18-feb tenía fecha_inicio
-- = 24-feb, provocando vencimientos desfasados.
-- ============================================================

UPDATE public.matriculas m
SET    fecha_inicio = c.fecha_inicio
FROM   public.cursos c
WHERE  m.curso_id     = c.id
  AND  c.fecha_inicio IS NOT NULL
  AND  m.fecha_inicio IS DISTINCT FROM c.fecha_inicio;

-- Verificar resultado: todas las matrículas deben tener la misma
-- fecha_inicio que su curso
SELECT
  c.nombre                AS curso,
  c.fecha_inicio          AS "Inicio del curso",
  m.fecha_inicio          AS "Inicio en matrícula",
  CASE WHEN m.fecha_inicio = c.fecha_inicio THEN '✅ OK' ELSE '❌ Desfasado' END AS estado
FROM   public.matriculas m
JOIN   public.cursos c ON c.id = m.curso_id
ORDER  BY c.fecha_inicio, m.fecha_inicio;

-- ============================================================
-- PASO 4: Recalcular las fechas de vencimiento de pagos
--         que quedaron desfasados por el fecha_inicio incorrecto
--
-- Aplica la fórmula correcta: vencimiento = fecha_inicio_curso + (cuota-1) meses
-- Solo actualiza si la fecha_vencimiento actual NO coincide con la esperada.
-- ============================================================

UPDATE public.pagos p
SET    fecha_vencimiento = (c.fecha_inicio + ((p.numero_cuota - 1) || ' month')::INTERVAL)::DATE
FROM   public.matriculas m
JOIN   public.cursos c ON c.id = m.curso_id
WHERE  p.matricula_id    = m.id
  AND  p.numero_cuota   >= 1
  AND  c.fecha_inicio   IS NOT NULL
  AND  p.fecha_vencimiento IS DISTINCT FROM
       (c.fecha_inicio + ((p.numero_cuota - 1) || ' month')::INTERVAL)::DATE;

-- Verificación final
SELECT
  p.numero_cuota,
  c.fecha_inicio                AS "Inicio curso",
  p.fecha_vencimiento           AS "Vencimiento final",
  p.estado,
  COUNT(*) AS registros
FROM   public.pagos p
JOIN   public.matriculas m ON m.id = p.matricula_id
JOIN   public.cursos c ON c.id = m.curso_id
WHERE  p.numero_cuota >= 1
GROUP  BY p.numero_cuota, c.fecha_inicio, p.fecha_vencimiento, p.estado
ORDER  BY c.fecha_inicio, p.numero_cuota;
