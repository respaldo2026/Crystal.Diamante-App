-- FIX puntual: estudiante que migro de POR_CLASE a MENSUAL
-- Objetivo:
-- 1) Eliminar pendientes/vencidos heredados de "Clase #...".
-- 2) Renumerar cuotas mensuales consecutivas desde 1.
-- 3) Reescribir periodo_pagado como "Cuota N de TOTAL".
-- 4) Mantener inscripcion (numero_cuota = 0) y pagos historicos por clase ya pagados.
--
-- Uso:
-- - Reemplaza los UUID de abajo.
-- - Ejecuta TODO en una sola corrida.

begin;

-- ========= PARAMETROS =========
-- Obligatorio: la matricula exacta a corregir.
-- Opcional: estudiante_id solo para doble validacion.
with params as (
    select
        'REEMPLAZAR_MATRICULA_ID'::uuid as matricula_id,
        nullif('REEMPLAZAR_ESTUDIANTE_ID_OPCIONAL', '')::uuid as estudiante_id
),

-- ========= VALIDACION =========
matricula_target as (
    select m.*
    from matriculas m
    join params p on p.matricula_id = m.id
    where p.estudiante_id is null or m.estudiante_id = p.estudiante_id
),
validacion as (
    select
        mt.id,
        mt.estudiante_id,
        mt.modalidad_pago
    from matricula_target mt
)
select
    id as matricula_validada,
    estudiante_id,
    modalidad_pago
from validacion;

-- Si no devuelve fila, detente: matricula incorrecta.

-- ========= 1) BORRAR PENDIENTES/VENCIDOS POR_CLASE =========
with params as (
    select
        'REEMPLAZAR_MATRICULA_ID'::uuid as matricula_id,
        nullif('REEMPLAZAR_ESTUDIANTE_ID_OPCIONAL', '')::uuid as estudiante_id
),
matricula_target as (
    select m.id
    from matriculas m
    join params p on p.matricula_id = m.id
    where p.estudiante_id is null or m.estudiante_id = p.estudiante_id
),
rows_to_delete as (
    select p.id
    from pagos p
    join matricula_target mt on mt.id = p.matricula_id
    where coalesce(p.numero_cuota, 0) > 0
      and lower(coalesce(p.estado, '')) in ('pendiente', 'vencido')
      and (
        lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
        or coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
      )
)
delete from pagos p
using rows_to_delete d
where p.id = d.id;

-- ========= 2) RENUMERAR CUOTAS MENSUALES =========
with params as (
    select
        'REEMPLAZAR_MATRICULA_ID'::uuid as matricula_id,
        nullif('REEMPLAZAR_ESTUDIANTE_ID_OPCIONAL', '')::uuid as estudiante_id
),
matricula_target as (
    select m.id
    from matriculas m
    join params p on p.matricula_id = m.id
    where p.estudiante_id is null or m.estudiante_id = p.estudiante_id
),
mensuales as (
    select
        p.id,
        row_number() over (
            order by
                coalesce(p.numero_cuota, 99999),
                coalesce(p.fecha_pago, p.fecha_vencimiento, p.created_at),
                p.id
        ) as nuevo_numero
    from pagos p
    join matricula_target mt on mt.id = p.matricula_id
    where coalesce(p.numero_cuota, 0) > 0
      and not (
        lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
        or coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
      )
),
total as (
    select count(*)::int as total_cuotas
    from mensuales
)
update pagos p
set
    numero_cuota = m.nuevo_numero,
    tipo_cuota = 'mensual',
    periodo_pagado = 'Cuota ' || m.nuevo_numero::text || ' de ' || t.total_cuotas::text
from mensuales m
cross join total t
where p.id = m.id;

-- ========= 3) ETIQUETA OPCIONAL PARA HISTORICOS PAGADOS POR_CLASE =========
-- Solo para visual/reportes. No cambia monto ni estado.
with params as (
    select
        'REEMPLAZAR_MATRICULA_ID'::uuid as matricula_id,
        nullif('REEMPLAZAR_ESTUDIANTE_ID_OPCIONAL', '')::uuid as estudiante_id
),
matricula_target as (
    select m.id
    from matriculas m
    join params p on p.matricula_id = m.id
    where p.estudiante_id is null or m.estudiante_id = p.estudiante_id
)
update pagos p
set periodo_pagado = 'Pago previo por clase'
from matricula_target mt
where p.matricula_id = mt.id
  and coalesce(p.numero_cuota, 0) > 0
  and lower(coalesce(p.estado, '')) = 'pagado'
  and (
    lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
    or coalesce(p.periodo_pagado, '') ~* '^clase\s*#?\s*\d+'
  );

-- ========= 4) VERIFICACION FINAL =========
with params as (
    select
        'REEMPLAZAR_MATRICULA_ID'::uuid as matricula_id,
        nullif('REEMPLAZAR_ESTUDIANTE_ID_OPCIONAL', '')::uuid as estudiante_id
),
matricula_target as (
    select m.id
    from matriculas m
    join params p on p.matricula_id = m.id
    where p.estudiante_id is null or m.estudiante_id = p.estudiante_id
)
select
    p.id,
    p.estado,
    p.numero_cuota,
    p.tipo_cuota,
    p.periodo_pagado,
    p.monto,
    p.total_abonado,
    p.saldo_pendiente,
    p.fecha_pago,
    p.fecha_vencimiento
from pagos p
join matricula_target mt on mt.id = p.matricula_id
order by
    coalesce(p.numero_cuota, 99999),
    coalesce(p.fecha_pago, p.fecha_vencimiento, p.created_at),
    p.id;

commit;

-- Si quieres deshacer antes de commit, cambia commit por rollback.
