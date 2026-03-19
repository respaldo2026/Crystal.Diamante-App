alter table public.materiales_ciclo
add column if not exists cobertura_material text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materiales_ciclo_cobertura_material_check'
  ) then
    alter table public.materiales_ciclo
    add constraint materiales_ciclo_cobertura_material_check
    check (cobertura_material in ('NINGUNO', 'MENSUAL_70', 'MENSUAL_100'));
  end if;
end $$;

update public.materiales_ciclo
set cobertura_material = case
  when coalesce(incluido_kit, false) = true then 'MENSUAL_70'
  else 'NINGUNO'
end
where cobertura_material is null;

comment on column public.materiales_ciclo.cobertura_material is
'Define desde qué plan se incluye el material: NINGUNO, MENSUAL_70 o MENSUAL_100.';
