-- Limpieza puntual de sesiones contaminadas para curso 85 (Lunes 4:00PM)
-- Objetivo: dejar la bitacora en la realidad operativa (hasta clase 9 al 02-jul-2026).
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.audit_sesiones_clase_deleted (
  sesion_id uuid primary key,
  curso_id bigint not null,
  fecha date not null,
  tema_visto text null,
  created_at timestamptz null,
  deleted_at timestamptz not null default now(),
  motivo text null
);

begin;

-- 0) Parametros de control
-- Ajusta este valor si necesitas conservar mas clases.
with params as (
  select 85::bigint as curso_id, 9::int as clase_max_valida
),

-- 1) Sesiones candidatas a borrar:
--   a) clases numeradas por encima de la clase real
--   b) sesiones con fecha anterior a fecha_inicio del curso
sesiones_candidatas as (
  select
    s.id,
    s.curso_id,
    s.fecha,
    s.tema_visto,
    s.created_at,
    c.fecha_inicio,
    coalesce((regexp_match(lower(coalesce(s.tema_visto, '')), 'clase\s*#?\s*(\d{1,3})'))[1]::int, null) as clase_numero
  from public.sesiones_clase s
  join params p on p.curso_id = s.curso_id
  left join public.cursos c on c.id = s.curso_id
  where
    (
      coalesce((regexp_match(lower(coalesce(s.tema_visto, '')), 'clase\s*#?\s*(\d{1,3})'))[1]::int, 0) > (select clase_max_valida from params)
    )
    or (
      c.fecha_inicio is not null and s.fecha < c.fecha_inicio
    )
),

-- 2) Backup local de seguridad (tabla persistente)
backup as (
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
    'limpieza curso 85: clase > 9 o fecha anterior a inicio'
  from sesiones_candidatas sc
  on conflict (sesion_id) do nothing
  returning sesion_id
)

-- 3) Delete de sesiones candidatas
 delete from public.sesiones_clase s
 using sesiones_candidatas sc
 where s.id = sc.id;

-- 4) Opcional recomendado: borrar asistencias en fechas eliminadas
-- (descomentar si necesitas que estudiante y bitacora queden 100% alineados de inmediato)
-- delete from public.asistencias a
-- using public.matriculas m, sesiones_candidatas sc
-- where a.matricula_id = m.id
--   and m.curso_id = sc.curso_id
--   and a.fecha = sc.fecha;

commit;

-- ======= PRECHECKS =======
-- Ver sesiones actuales del curso 85
-- select id, fecha, tema_visto, created_at
-- from public.sesiones_clase
-- where curso_id = 85
-- order by fecha asc, id asc;

-- Ver total de sesiones actuales
-- select count(*) as total_sesiones
-- from public.sesiones_clase
-- where curso_id = 85;
