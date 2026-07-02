-- Migra datos históricos de modalidad 70% al esquema vigente (MENSUAL_100 / 100% materiales)
-- Ejecutar en Supabase SQL Editor con respaldo previo.

begin;

-- 1) Matriculas: convertir modalidad 70 -> 100 y normalizar montos.
update matriculas m
set
  modalidad_pago = 'MENSUAL_100',
  porcentaje_productos = 100,
  valor_mensual_plan = coalesce(
    nullif(m.valor_mensual_plan, 0),
    nullif(c.precio_mensualidad, 0),
    nullif(p.precio_mensual_100, 0),
    nullif(p.precio_mensualidad, 0),
    300000
  )
from cursos c
left join programas p on p.id = c.programa_id
where m.curso_id = c.id
  and upper(coalesce(m.modalidad_pago, '')) = 'MENSUAL_70';

-- 2) Cobertura de materiales por ciclo: 70 -> 100.
update materiales_ciclo
set cobertura_material = 'MENSUAL_100'
where upper(coalesce(cobertura_material, '')) = 'MENSUAL_70';

-- 3) Compatibilidad con registros heredados basados en included_kit.
update materiales_ciclo
set cobertura_material = 'MENSUAL_100'
where cobertura_material is null
  and coalesce(incluido_kit, false) = true;

commit;

-- Verificación rápida
-- select modalidad_pago, count(*) from matriculas group by 1 order by 1;
-- select cobertura_material, count(*) from materiales_ciclo group by 1 order by 1;
