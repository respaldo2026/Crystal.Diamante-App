BEGIN;

ALTER TABLE public.pagos
ADD COLUMN IF NOT EXISTS monto_programado NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS descuento_aplicado NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_abonado NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS motivo_descuento TEXT;

UPDATE public.pagos
SET monto_programado = COALESCE(monto_programado, monto, 0),
    descuento_aplicado = COALESCE(descuento_aplicado, 0),
    total_abonado = CASE
        WHEN COALESCE(total_abonado, 0) > 0 THEN total_abonado
        WHEN estado = 'pagado' THEN COALESCE(monto_programado, monto, 0) - COALESCE(descuento_aplicado, 0)
        ELSE 0
    END;

UPDATE public.pagos
SET saldo_pendiente = CASE
        WHEN estado = 'pagado' THEN 0
        ELSE GREATEST((COALESCE(monto_programado, monto, 0) - COALESCE(descuento_aplicado, 0)) - COALESCE(total_abonado, 0), 0)
    END,
    monto = CASE
        WHEN estado = 'pagado' THEN GREATEST(COALESCE(monto_programado, monto, 0) - COALESCE(descuento_aplicado, 0), 0)
        ELSE GREATEST((COALESCE(monto_programado, monto, 0) - COALESCE(descuento_aplicado, 0)) - COALESCE(total_abonado, 0), 0)
    END;

CREATE TABLE IF NOT EXISTS public.pagos_abonos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pago_id UUID NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
    estudiante_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
    matricula_id INTEGER REFERENCES public.matriculas(id) ON DELETE SET NULL,
    monto_abono NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_abono >= 0),
    descuento_aplicado NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (descuento_aplicado >= 0),
    saldo_resultante NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (saldo_resultante >= 0),
    metodo_pago TEXT,
    referencia TEXT,
    observaciones TEXT,
    ticket_url TEXT,
    fecha_pago TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pagos_abonos_pago_id ON public.pagos_abonos(pago_id);
CREATE INDEX IF NOT EXISTS idx_pagos_abonos_matricula_id ON public.pagos_abonos(matricula_id);
CREATE INDEX IF NOT EXISTS idx_pagos_abonos_fecha_pago ON public.pagos_abonos(fecha_pago DESC);

ALTER TABLE public.movimientos_financieros
ADD COLUMN IF NOT EXISTS pago_abono_id UUID REFERENCES public.pagos_abonos(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_financieros
DROP CONSTRAINT IF EXISTS movimientos_financieros_pago_id_key;

DROP INDEX IF EXISTS public.movimientos_financieros_pago_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_financieros_pago_id_unique_idx
ON public.movimientos_financieros(pago_id)
WHERE pago_id IS NOT NULL AND pago_abono_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_financieros_pago_abono_id_unique_idx
ON public.movimientos_financieros(pago_abono_id)
WHERE pago_abono_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS movimientos_financieros_pago_id_idx
ON public.movimientos_financieros(pago_id);

CREATE INDEX IF NOT EXISTS movimientos_financieros_pago_abono_id_idx
ON public.movimientos_financieros(pago_abono_id);

CREATE OR REPLACE FUNCTION public.recalcular_resumen_financiero_matricula(p_matricula_id BIGINT)
RETURNS VOID AS $$
DECLARE
    v_total_pagado NUMERIC(10,2);
    v_total_deuda NUMERIC(10,2);
BEGIN
    SELECT
        COALESCE(SUM(
            CASE
                WHEN COALESCE(total_abonado, 0) > 0 THEN COALESCE(total_abonado, 0)
                WHEN estado = 'pagado' THEN COALESCE(monto, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN estado = 'cancelado' THEN 0
                WHEN estado = 'pagado' THEN 0
                ELSE COALESCE(saldo_pendiente, monto, 0)
            END
        ), 0)
    INTO v_total_pagado, v_total_deuda
    FROM public.pagos
    WHERE matricula_id = p_matricula_id;

    UPDATE public.matriculas
    SET monto_pagado = COALESCE(v_total_pagado, 0),
        deuda_pendiente = COALESCE(v_total_deuda, 0),
        updated_at = NOW()
    WHERE id = p_matricula_id;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT DISTINCT matricula_id FROM public.pagos WHERE matricula_id IS NOT NULL LOOP
        PERFORM public.recalcular_resumen_financiero_matricula(r.matricula_id::BIGINT);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_abono_pago(
    p_pago_id UUID,
    p_monto_abono NUMERIC,
    p_descuento_aplicado NUMERIC DEFAULT 0,
    p_metodo_pago TEXT DEFAULT NULL,
    p_referencia TEXT DEFAULT NULL,
    p_observaciones TEXT DEFAULT NULL,
    p_motivo_descuento TEXT DEFAULT NULL,
    p_fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
    abono_id UUID,
    pago_id UUID,
    monto_abono NUMERIC,
    descuento_total NUMERIC,
    total_abonado NUMERIC,
    saldo_pendiente NUMERIC,
    monto_programado NUMERIC,
    monto_exigible NUMERIC,
    estado TEXT,
    matricula_id BIGINT,
    estudiante_id UUID
) AS $$
DECLARE
    pago_actual public.pagos%ROWTYPE;
    v_monto_programado NUMERIC(10,2);
    v_descuento_total NUMERIC(10,2);
    v_monto_exigible NUMERIC(10,2);
    v_total_abonado NUMERIC(10,2);
    v_saldo NUMERIC(10,2);
    v_estado TEXT;
    v_abono public.pagos_abonos%ROWTYPE;
BEGIN
    SELECT *
    INTO pago_actual
    FROM public.pagos
    WHERE id = p_pago_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe el pago %', p_pago_id;
    END IF;

    IF COALESCE(pago_actual.estado, '') = 'cancelado' THEN
        RAISE EXCEPTION 'No se pueden registrar abonos sobre un pago cancelado';
    END IF;

    IF COALESCE(p_monto_abono, 0) <= 0 AND COALESCE(p_descuento_aplicado, 0) <= 0 THEN
        RAISE EXCEPTION 'Debes registrar un abono o un descuento mayor a cero';
    END IF;

    v_monto_programado := COALESCE(pago_actual.monto_programado, pago_actual.monto, 0);
    v_descuento_total := COALESCE(pago_actual.descuento_aplicado, 0) + COALESCE(p_descuento_aplicado, 0);
    v_monto_exigible := GREATEST(v_monto_programado - v_descuento_total, 0);
    v_total_abonado := COALESCE(pago_actual.total_abonado, 0) + COALESCE(p_monto_abono, 0);

    IF v_total_abonado > v_monto_exigible THEN
        RAISE EXCEPTION 'El abono supera el saldo exigible actual';
    END IF;

    v_saldo := GREATEST(v_monto_exigible - v_total_abonado, 0);
    v_estado := CASE
        WHEN v_saldo = 0 THEN 'pagado'
        WHEN pago_actual.fecha_vencimiento IS NOT NULL AND pago_actual.fecha_vencimiento < (p_fecha_pago AT TIME ZONE 'UTC')::DATE THEN 'vencido'
        ELSE 'pendiente'
    END;

    INSERT INTO public.pagos_abonos (
        pago_id,
        estudiante_id,
        matricula_id,
        monto_abono,
        descuento_aplicado,
        saldo_resultante,
        metodo_pago,
        referencia,
        observaciones,
        fecha_pago,
        created_by
    ) VALUES (
        pago_actual.id,
        pago_actual.estudiante_id,
        pago_actual.matricula_id,
        COALESCE(p_monto_abono, 0),
        COALESCE(p_descuento_aplicado, 0),
        v_saldo,
        p_metodo_pago,
        p_referencia,
        p_observaciones,
        COALESCE(p_fecha_pago, NOW()),
        p_created_by
    )
    RETURNING * INTO v_abono;

    UPDATE public.pagos
    SET monto_programado = v_monto_programado,
        descuento_aplicado = v_descuento_total,
        total_abonado = v_total_abonado,
        saldo_pendiente = v_saldo,
        monto = CASE
            WHEN v_saldo = 0 THEN v_monto_exigible
            ELSE v_saldo
        END,
        estado = v_estado,
        metodo_pago = CASE WHEN COALESCE(p_monto_abono, 0) > 0 THEN COALESCE(p_metodo_pago, metodo_pago) ELSE metodo_pago END,
        referencia = COALESCE(p_referencia, referencia),
        observaciones = COALESCE(p_observaciones, observaciones),
        motivo_descuento = CASE
            WHEN COALESCE(p_descuento_aplicado, 0) > 0 THEN COALESCE(p_motivo_descuento, motivo_descuento)
            ELSE motivo_descuento
        END,
        fecha_pago = CASE
            WHEN v_saldo = 0 THEN COALESCE(p_fecha_pago, NOW())
            ELSE fecha_pago
        END
    WHERE id = pago_actual.id;

    IF pago_actual.matricula_id IS NOT NULL THEN
        PERFORM public.recalcular_resumen_financiero_matricula(pago_actual.matricula_id::BIGINT);
    END IF;

    RETURN QUERY
    SELECT
        v_abono.id,
        pago_actual.id,
        COALESCE(p_monto_abono, 0),
        v_descuento_total,
        v_total_abonado,
        v_saldo,
        v_monto_programado,
        v_monto_exigible,
        v_estado,
        pago_actual.matricula_id,
        pago_actual.estudiante_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE VIEW public.vista_estado_cuotas AS
SELECT 
    p.id AS pago_id,
    p.estudiante_id,
    perf.nombre_completo AS estudiante_nombre,
    p.matricula_id,
    c.nombre AS curso_nombre,
    p.periodo_pagado,
    p.numero_cuota,
    p.monto,
    p.monto_programado,
    p.descuento_aplicado,
    p.total_abonado,
    p.saldo_pendiente,
    p.fecha_vencimiento,
    p.fecha_pago,
    p.estado,
    p.metodo_pago,
    CASE 
        WHEN p.estado = 'pagado' THEN 'Pagado'
        WHEN COALESCE(p.total_abonado, 0) > 0 AND COALESCE(p.saldo_pendiente, p.monto, 0) > 0 THEN 'Abono parcial'
        WHEN p.estado = 'vencido' THEN 'Vencido'
        WHEN p.fecha_vencimiento < CURRENT_DATE THEN 'Vencido'
        WHEN p.fecha_vencimiento <= CURRENT_DATE + INTERVAL '7 days' THEN 'Por vencer'
        ELSE 'Pendiente'
    END AS estado_visual,
    CASE
        WHEN p.estado = 'pagado' THEN 0
        WHEN p.estado = 'vencido' OR p.fecha_vencimiento < CURRENT_DATE THEN CURRENT_DATE - p.fecha_vencimiento
        ELSE 0
    END AS dias_vencido
FROM public.pagos p
LEFT JOIN public.perfiles perf ON p.estudiante_id = perf.id
LEFT JOIN public.matriculas m ON p.matricula_id = m.id
LEFT JOIN public.cursos c ON m.curso_id = c.id
ORDER BY p.estudiante_id, p.numero_cuota;

COMMENT ON COLUMN public.pagos.monto_programado IS 'Valor original de la cuota antes de descuentos o abonos';
COMMENT ON COLUMN public.pagos.descuento_aplicado IS 'Descuento acumulado aplicado a la cuota';
COMMENT ON COLUMN public.pagos.total_abonado IS 'Suma de todos los abonos registrados para la cuota';
COMMENT ON COLUMN public.pagos.saldo_pendiente IS 'Saldo restante real de la cuota luego de descuentos y abonos';
COMMENT ON TABLE public.pagos_abonos IS 'Historial detallado de abonos parciales y descuentos aplicados sobre cuotas';

COMMIT;