-- LIMPIAR ARRASTRE DE ASISTENCIAS POR TRASLADO (CURSO 85)
-- Caso: al mover estudiantes de otro grupo, quedaron asistencias historicas pegadas a la misma matricula.
-- Este script detecta el patron de fechas con conteo bajo (ej. 4) y limpia SOLO esas filas de arrastre.

create table if not exists public.audit_asistencias_deleted (
  asistencia_id uuid primary key,
  matricula_id bigint not null,
  fecha date not null,
  estado text null,
  observaciones text null,
  deleted_at timestamptz not null default now(),
  motivo text null
);

-- =====================================================
-- A) DIAGNOSTICO (verifica si son las 4 trasladadas)
-- =====================================================

with params as (
  select
    85::bigint as curso_id,
    4::int as max_registros_fecha_ruido,
    3::int as min_fechas_para_marcar_matricula -- ajustable
),
matriculas_curso as (
  select m.id as matricula_id, m.estudiante_id
  from public.matriculas m
  join params p on p.curso_id = m.curso_id
),
conteo_fecha as (
  select a.fecha, count(*)::int as registros
  from public.asistencias a
  join matriculas_curso mc on mc.matricula_id = a.matricula_id
  where lower(coalesce(a.estado, '')) in ('presente', 'ausente', 'justificada')
  group by a.fecha
),
fechas_ruido as (
  select cf.fecha
  from conteo_fecha cf
  join params p on cf.registros <= p.max_registros_fecha_ruido
),
matriculas_ruido as (
  select a.matricula_id, count(distinct a.fecha)::int as fechas_ruido_count
  from public.asistencias a
  join fechas_ruido fr on fr.fecha = a.fecha
  group by a.matricula_id
  having count(distinct a.fecha) >= (select min_fechas_para_marcar_matricula from params)
)
select
  mr.matricula_id,
  mr.fechas_ruido_count,
  p.nombre_completo,
  p.email
from matriculas_ruido mr
left join public.matriculas m on m.id = mr.matricula_id
left join public.perfiles p on p.id = m.estudiante_id
order by mr.fechas_ruido_count desc, p.nombre_completo asc;

-- =====================================================
-- B) LIMPIEZA (solo arrastre de traslado)
-- =====================================================

begin;

with params as (
  select
    85::bigint as curso_id,
    4::int as max_registros_fecha_ruido,
    3::int as min_fechas_para_marcar_matricula
),
matriculas_curso as (
  select m.id as matricula_id
  from public.matriculas m
  join params p on p.curso_id = m.curso_id
),
conteo_fecha as (
  select a.fecha, count(*)::int as registros
  from public.asistencias a
  join matriculas_curso mc on mc.matricula_id = a.matricula_id
  where lower(coalesce(a.estado, '')) in ('presente', 'ausente', 'justificada')
  group by a.fecha
),
fechas_ruido as (
  select cf.fecha
  from conteo_fecha cf
  join params p on cf.registros <= p.max_registros_fecha_ruido
),
matriculas_ruido as (
  select a.matricula_id
  from public.asistencias a
  join fechas_ruido fr on fr.fecha = a.fecha
  group by a.matricula_id
  having count(distinct a.fecha) >= (select min_fechas_para_marcar_matricula from params)
),
asistencias_objetivo as (
  select a.id, a.matricula_id, a.fecha, a.estado, a.observaciones
  from public.asistencias a
  join matriculas_ruido mr on mr.matricula_id = a.matricula_id
  join fechas_ruido fr on fr.fecha = a.fecha
),
backup_asistencias as (
  insert into public.audit_asistencias_deleted (
    asistencia_id,
    matricula_id,
    fecha,
    estado,
    observaciones,
    deleted_at,
    motivo
  )
  select
    ao.id,
    ao.matricula_id,
    ao.fecha,
    ao.estado,
    ao.observaciones,
    now(),
    'curso 85: limpieza arrastre por traslado de grupo (fechas ruido)'
  from asistencias_objetivo ao
  on conflict (asistencia_id) do nothing
  returning asistencia_id
)
delete from public.asistencias a
using asistencias_objetivo ao
where a.id = ao.id;

commit;

-- =====================================================
-- C) VERIFICACION FINAL
-- =====================================================

with m as (
  select id as matricula_id
  from public.matriculas
  where curso_id = 85
)
select a.fecha, count(*) as registros
from public.asistencias a
join m on m.matricula_id = a.matricula_id
where lower(coalesce(a.estado, '')) in ('presente', 'ausente', 'justificada')
group by a.fecha
order by a.fecha asc;
