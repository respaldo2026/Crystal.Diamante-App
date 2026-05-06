-- BORRADO COMPLETO DE FACTURA/REFERENCIA: FAC-8177
-- Elimina el pago y su rastro en:
-- - pagos
-- - pagos_abonos
-- - movimientos_financieros
-- - asistencias (desenlaza pago_id para mantener historial de asistencia)
--
-- Uso recomendado:
-- 1) Ejecuta este script completo en Supabase SQL Editor.
-- 2) Verifica la salida de los SELECT de pre y post validacion.
--
-- NOTA:
-- - Si no encuentra pagos con esa referencia, hace ROLLBACK y lanza error.
-- - Si hay multiples pagos con la misma referencia, los elimina todos.

begin;

-- 1) Localizar pagos objetivo por referencia exacta
create temp table _target_pagos as
select
  p.id,
  p.estudiante_id,
  p.matricula_id,
  p.referencia,
  p.periodo_pagado,
  p.numero_cuota,
  p.estado,
  p.ticket_url
from pagos p
where coalesce(p.referencia, '') = 'FAC-8177';

-- Previsualizacion
select
  'PAGOS_OBJETIVO' as bloque,
  id,
  estudiante_id,
  matricula_id,
  referencia,
  periodo_pagado,
  numero_cuota,
  estado,
  ticket_url
from _target_pagos
order by id;

-- Validacion obligatoria
DO $$
DECLARE
  v_count int;
BEGIN
  select count(*) into v_count from _target_pagos;
  if v_count = 0 then
    RAISE EXCEPTION 'No se encontro ningun pago con referencia FAC-8177';
  end if;
END $$;

-- 2) Localizar abonos relacionados a esos pagos
create temp table _target_abonos as
select
  pa.id,
  pa.pago_id,
  pa.referencia,
  pa.monto_abono,
  pa.fecha_pago
from pagos_abonos pa
where pa.pago_id in (select id from _target_pagos)
   or coalesce(pa.referencia, '') = 'FAC-8177';

-- Previsualizacion de abonos
select
  'ABONOS_OBJETIVO' as bloque,
  id,
  pago_id,
  referencia,
  monto_abono,
  fecha_pago
from _target_abonos
order by fecha_pago nulls last;

-- 3) Desenlazar asistencias que apuntan a esos pagos
update asistencias a
set pago_id = null
where a.pago_id in (select id from _target_pagos);

-- 4) Borrar movimientos financieros relacionados
-- 4.1 Movimientos por pago_abono_id
delete from movimientos_financieros mf
where mf.pago_abono_id in (select id from _target_abonos);

-- 4.2 Movimientos por pago_id o referencia
delete from movimientos_financieros mf
where mf.pago_id in (select id from _target_pagos)
   or coalesce(mf.referencia, '') = 'FAC-8177';

-- 5) Borrar abonos y pagos
delete from pagos_abonos pa
where pa.id in (select id from _target_abonos);

delete from pagos p
where p.id in (select id from _target_pagos);

-- 6) Post-validacion (debe salir en 0)
select
  'POST_PAGOS' as bloque,
  count(*)::int as restantes
from pagos
where coalesce(referencia, '') = 'FAC-8177';

select
  'POST_ABONOS' as bloque,
  count(*)::int as restantes
from pagos_abonos
where coalesce(referencia, '') = 'FAC-8177'
   or pago_id in (select id from _target_pagos);

select
  'POST_MOVIMIENTOS' as bloque,
  count(*)::int as restantes
from movimientos_financieros
where coalesce(referencia, '') = 'FAC-8177'
   or pago_id in (select id from _target_pagos)
   or pago_abono_id in (select id from _target_abonos);

commit;

-- Si quieres revisar primero sin borrar:
-- reemplaza COMMIT por ROLLBACK al final.
