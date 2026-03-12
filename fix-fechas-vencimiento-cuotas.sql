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
  v_num_cuotas INTEGER := 5;
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

  -- Número de cuotas mensuales (NUNCA incluye la inscripción).
  -- Prioridad: numero_cuotas del curso → número extraído de duracion del programa → 5 por defecto.
  v_num_cuotas := COALESCE(
    NULLIF(NULLIF(v_curso.data->>'numero_cuotas', '')::INTEGER, 0),
    NULLIF(
      REGEXP_REPLACE(COALESCE(v_programa.data->>'duracion', ''), '[^0-9]', '', 'g'),
      ''
    )::INTEGER,
    5
  );

  IF v_num_cuotas < 1 THEN
    v_num_cuotas := 5;
  END IF;

  v_fecha_base := COALESCE(NEW.fecha_inicio, v_curso.fecha_inicio, CURRENT_DATE);

  -- ¿Existe columna periodo_pagado en pagos?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pagos'
      AND column_name  = 'periodo_pagado'
  ) INTO v_has_periodo_pagado;

  -- 1) Pago de inscripción (cuota 0): vence el mismo día de inicio.
  --    Es independiente de las cuotas mensuales; NO cuenta como mes.
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

  -- 2) Cuotas mensuales (cuota 1 … v_num_cuotas).
  --    La inscripción NO se cuenta aquí.
  --    Cuota 1 → fecha_base + 0 meses (mismo día de inicio del curso)
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
          'Ciclo mensual ' || v_i || ' de ' || v_num_cuotas,
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

-- ============================================================
-- PASO 5: Sincronizar numero_cuotas en cursos
--         a partir del campo duracion del programa (ej: "5 meses" → 5)
--
-- La inscripción es un cobro aparte (cuota 0).
-- numero_cuotas = número de MENSUALIDADES, nunca incluye inscripción.
-- ============================================================

UPDATE public.cursos c
SET    numero_cuotas = REGEXP_REPLACE(p.duracion, '[^0-9]', '', 'g')::INTEGER
FROM   public.programas p
WHERE  c.programa_id  = p.id
  AND  p.duracion    ~ '\d+'
  AND  (c.numero_cuotas IS NULL
        OR c.numero_cuotas = 0
        OR c.numero_cuotas != REGEXP_REPLACE(p.duracion, '[^0-9]', '', 'g')::INTEGER);

-- ============================================================
-- PASO 6: Insertar cuotas faltantes para estudiantes existentes
--
-- Para cada matrícula, detecta qué cuotas mensuales (1..N)
-- no existen aún y las inserta con la fecha correcta.
-- ============================================================

INSERT INTO public.pagos (
  estudiante_id, matricula_id, numero_cuota, periodo_pagado,
  monto, estado, metodo_pago, fecha_vencimiento, observaciones
)
SELECT
  m.estudiante_id,
  m.id                                                              AS matricula_id,
  s.cuota                                                           AS numero_cuota,
  'Ciclo mensual ' || s.cuota || ' de ' || c.numero_cuotas         AS periodo_pagado,
  -- Buscar precio mensualidad con todos los fallbacks posibles
  COALESCE(
    NULLIF(c.precio_mensualidad, 0),
    NULLIF(p.precio_mensualidad, 0),
    NULLIF(p.precio, 0)
  )                                                                 AS monto,
  'pendiente'                                                       AS estado,
  NULL                                                              AS metodo_pago,
  (c.fecha_inicio + ((s.cuota - 1) || ' month')::INTERVAL)::DATE   AS fecha_vencimiento,
  'Cuota mensual ' || s.cuota || ' de ' || c.numero_cuotas         AS observaciones
FROM   public.matriculas m
JOIN   public.cursos     c ON c.id = m.curso_id
JOIN   public.programas  p ON p.id = c.programa_id
CROSS  JOIN LATERAL generate_series(1, c.numero_cuotas) AS s(cuota)
WHERE  c.fecha_inicio   IS NOT NULL
  AND  c.numero_cuotas  > 0
  -- Garantizar que el monto sea positivo (el trigger lo exige)
  AND  COALESCE(NULLIF(c.precio_mensualidad, 0), NULLIF(p.precio_mensualidad, 0), NULLIF(p.precio, 0)) > 0
  -- Solo inserta si la cuota no existe aún
  AND  NOT EXISTS (
         SELECT 1 FROM public.pagos px
         WHERE  px.matricula_id = m.id
           AND  px.numero_cuota = s.cuota
       );

-- Diagnóstico: mostrar matrículas donde no se pudo calcular el monto
-- (si aparecen aquí, hay que revisar precios en programas/cursos)
SELECT
  m.id               AS matricula_id,
  c.nombre           AS curso,
  c.precio_mensualidad AS "precio_mensualidad (cursos)",
  p.precio_mensualidad AS "precio_mensualidad (programas)",
  p.precio             AS "precio (programas)"
FROM   public.matriculas m
JOIN   public.cursos     c ON c.id = m.curso_id
JOIN   public.programas  p ON p.id = c.programa_id
WHERE  COALESCE(NULLIF(c.precio_mensualidad, 0), NULLIF(p.precio_mensualidad, 0), NULLIF(p.precio, 0)) IS NULL
ORDER  BY m.id;

-- ============================================================
-- PASO 7: Actualizar labels "Cuota X de 4" → "Ciclo mensual X de 5"
--         en pagos que tenían el total incorrecto
-- ============================================================

UPDATE public.pagos p
SET    periodo_pagado = 'Ciclo mensual ' || p.numero_cuota || ' de ' || p2.total
FROM (
  SELECT matricula_id, MAX(numero_cuota) AS total
  FROM   public.pagos
  WHERE  numero_cuota >= 1
  GROUP  BY matricula_id
) p2
WHERE  p.matricula_id  = p2.matricula_id
  AND  p.numero_cuota >= 1
  AND  p.periodo_pagado NOT LIKE 'Ciclo mensual ' || p.numero_cuota || ' de ' || p2.total;

-- Verificación final completa
SELECT
  p.numero_cuota,
  c.fecha_inicio                AS "Inicio curso",
  p.fecha_vencimiento           AS "Vencimiento",
  p.periodo_pagado              AS "Periodo",
  p.estado,
  COUNT(*) AS registros
FROM   public.pagos p
JOIN   public.matriculas m ON m.id = p.matricula_id
JOIN   public.cursos c     ON c.id = m.curso_id
WHERE  p.numero_cuota >= 1
GROUP  BY p.numero_cuota, c.fecha_inicio, p.fecha_vencimiento, p.periodo_pagado, p.estado
ORDER  BY c.fecha_inicio, p.numero_cuota;
