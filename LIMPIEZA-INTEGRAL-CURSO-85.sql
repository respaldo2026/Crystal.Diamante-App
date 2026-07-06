-- LIMPIEZA INTEGRAL CURSO 85
-- Diagnostica, respalda y limpia inconsistencias entre sesiones y asistencias.
-- Ejecutar en Supabase SQL Editor.

-- =====================================================
-- A) DIAGNOSTICO INICIAL (solo lectura)
-- =====================================================

-- 1) Rango del curso
select id, nombre, fecha_inicio, fecha_fin
from public.cursos
where id = 85;

-- 2) Sesiones actuales
select id, curso_id, fecha, tema_visto, created_at
from public.sesiones_clase
where curso_id = 85
order by fecha asc, created_at asc;

-- 3) Conteo de sesiones
select count(*) as total_sesiones_actuales
from public.sesiones_clase
where curso_id = 85;

-- 4) Fechas de asistencia (con estados validos)
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

-- =====================================================
-- B) LIMPIEZA + BACKUP
-- =====================================================

create table if not exists public.audit_sesiones_clase_deleted (
  sesion_id uuid primary key,
  curso_id bigint not null,
  fecha date not null,
  tema_visto text null,
  created_at timestamptz null,
  deleted_at timestamptz not null default now(),
  motivo text null
);

create table if not exists public.audit_asistencias_deleted (
  asistencia_id bigint primary key,
  matricula_id bigint not null,
  fecha date not null,
  estado text null,
  observaciones text null,
  deleted_at timestamptz not null default now(),
  motivo text null
);

begin;

with params as (
  select
    85::bigint as curso_id,
    9::int as clase_max_valida,
    true as limpiar_asistencias_fuera_rango
),
curso as (
  select c.id, c.fecha_inicio, c.fecha_fin
  from public.cursos c
  join params p on p.curso_id = c.id
),
matriculas_curso as (
  select m.id as matricula_id
  from public.matriculas m
  join params p on p.curso_id = m.curso_id
),
sesiones_candidatas as (
  select
    s.id,
    s.curso_id,
    s.fecha,
    s.tema_visto,
    s.created_at,
    coalesce((regexp_match(lower(coalesce(s.tema_visto, '')), 'clase\s*#?\s*(\d{1,3})'))[1]::int, 0) as clase_numero
  from public.sesiones_clase s
  join params p on p.curso_id = s.curso_id
  left join curso c on c.id = s.curso_id
  where
    coalesce((regexp_match(lower(coalesce(s.tema_visto, '')), 'clase\s*#?\s*(\d{1,3})'))[1]::int, 0) > (select clase_max_valida from params)
    or (c.fecha_inicio is not null and s.fecha < c.fecha_inicio)
    or (c.fecha_fin is not null and s.fecha > c.fecha_fin)
),
backup_sesiones as (
  insert into public.audit_sesiones_clase_deleted (
    sesion_id,
    curso_id,
    fecha,
    tema_visto,
    created_at,
    deleted_at,
    motivo
  )
  select
    sc.id,
    sc.curso_id,
    sc.fecha,
    sc.tema_visto,
    sc.created_at,
    now(),
    'limpieza curso 85: clase fuera de rango o fecha fuera de curso'
  from sesiones_candidatas sc
  on conflict (sesion_id) do nothing
  returning sesion_id
),
delete_sesiones as (
  delete from public.sesiones_clase s
  using sesiones_candidatas sc
  where s.id = sc.id
  returning s.id, s.fecha
),
asistencias_fuera_rango as (
  select a.id, a.matricula_id, a.fecha, a.estado, a.observaciones
  from public.asistencias a
  join matriculas_curso mc on mc.matricula_id = a.matricula_id
  cross join curso c
  cross join params p
  where p.limpiar_asistencias_fuera_rango = true
    and (
      (c.fecha_inicio is not null and a.fecha < c.fecha_inicio)
      or (c.fecha_fin is not null and a.fecha > c.fecha_fin)
    )
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
    afr.id,
    afr.matricula_id,
    afr.fecha,
    afr.estado,
    afr.observaciones,
    now(),
    'limpieza curso 85: asistencia fuera de rango del curso'
  from asistencias_fuera_rango afr
  on conflict (asistencia_id) do nothing
  returning asistencia_id
)
delete from public.asistencias a
using asistencias_fuera_rango afr
where a.id = afr.id;

commit;

-- =====================================================
-- C) VERIFICACION FINAL
-- =====================================================

-- 1) Conteo final de sesiones
select count(*) as total_sesiones_final
from public.sesiones_clase
where curso_id = 85;

-- 2) Sesiones finales (ordenadas)
select id, fecha, tema_visto, created_at
from public.sesiones_clase
where curso_id = 85
order by fecha asc, created_at asc;

-- 3) Fechas de asistencia final (estados validos)
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
