-- Backfill: corregir tipo_cuota y descripciones para pagos por clase
-- Fecha: 2026-04-08
-- Objetivo:
-- 1) Marcar como 'por_clase' los pagos de matriculas POR_CLASE que quedaron como mensual/null.
-- 2) Corregir inconsistencias inversas: pagos 'por_clase' en matriculas mensuales.
-- 3) Ajustar periodo_pagado solo cuando es etiqueta generica tipo "Cuota N ...".
--
-- Recomendacion: ejecutar primero en staging y revisar los SELECT de verificacion.

begin;

-- ==============================
-- 0) Diagnostico previo
-- ==============================

-- Cantidad de pagos que deberian ser por_clase segun matricula pero no lo son.
select count(*) as pagos_por_clase_mal_tipados
from pagos p
join matriculas m on m.id = p.matricula_id
where upper(coalesce(m.modalidad_pago, '')) = 'POR_CLASE'
  and coalesce(lower(p.tipo_cuota), '') <> 'por_clase'
  and coalesce(p.numero_cuota, 0) > 0;

-- Cantidad de pagos que quedaron por_clase en matriculas mensuales.
select count(*) as pagos_mensuales_mal_tipados
from pagos p
join matriculas m on m.id = p.matricula_id
where upper(coalesce(m.modalidad_pago, '')) <> 'POR_CLASE'
  and lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
  and coalesce(p.numero_cuota, 0) > 0;

-- ==============================
-- 1) POR_CLASE: corregir tipo_cuota
-- ==============================

update pagos p
set tipo_cuota = 'por_clase'
from matriculas m
where m.id = p.matricula_id
  and upper(coalesce(m.modalidad_pago, '')) = 'POR_CLASE'
  and coalesce(lower(p.tipo_cuota), '') <> 'por_clase'
  and coalesce(p.numero_cuota, 0) > 0;

-- ==============================
-- 2) MENSUAL: corregir inconsistencias inversas
-- ==============================

update pagos p
set tipo_cuota = 'mensual'
from matriculas m
where m.id = p.matricula_id
  and upper(coalesce(m.modalidad_pago, '')) <> 'POR_CLASE'
  and lower(coalesce(p.tipo_cuota, '')) = 'por_clase'
  and coalesce(p.numero_cuota, 0) > 0;

-- ==============================
-- 3) Normalizar periodo_pagado solo en casos genericos
-- ==============================

-- POR_CLASE: "Cuota N ..." -> "Clase #N"
update pagos p
set periodo_pagado = concat('Clase #', p.numero_cuota)
from matriculas m
where m.id = p.matricula_id
  and upper(coalesce(m.modalidad_pago, '')) = 'POR_CLASE'
  and coalesce(p.numero_cuota, 0) > 0
  and (
    p.periodo_pagado is null
    or btrim(p.periodo_pagado) = ''
    or p.periodo_pagado ~* '^\s*cuota\s*[#]?[0-9]+'
  );

-- MENSUAL: si por error dice "Clase #N" -> "Cuota N"
update pagos p
set periodo_pagado = concat('Cuota ', p.numero_cuota)
from matriculas m
where m.id = p.matricula_id
  and upper(coalesce(m.modalidad_pago, '')) <> 'POR_CLASE'
  and coalesce(p.numero_cuota, 0) > 0
  and p.periodo_pagado ~* '^\s*clase\s*#\s*[0-9]+';

-- ==============================
-- 4) Verificacion posterior
-- ==============================

select
  upper(coalesce(m.modalidad_pago, 'SIN_MODALIDAD')) as modalidad_pago,
  lower(coalesce(p.tipo_cuota, 'sin_tipo')) as tipo_cuota,
  count(*) as total
from pagos p
join matriculas m on m.id = p.matricula_id
group by 1, 2
order by 1, 2;

-- Muestra de registros recientemente corregidos (ajustar LIMIT si deseas)
select
  p.id,
  p.matricula_id,
  m.modalidad_pago,
  p.tipo_cuota,
  p.numero_cuota,
  p.periodo_pagado,
  p.estado,
  p.fecha_pago
from pagos p
join matriculas m on m.id = p.matricula_id
where coalesce(p.numero_cuota, 0) > 0
  and (
    (upper(coalesce(m.modalidad_pago, '')) = 'POR_CLASE' and lower(coalesce(p.tipo_cuota, '')) = 'por_clase')
    or (upper(coalesce(m.modalidad_pago, '')) <> 'POR_CLASE' and lower(coalesce(p.tipo_cuota, '')) = 'mensual')
  )
order by p.fecha_pago desc nulls last, p.id desc
limit 100;

commit;
