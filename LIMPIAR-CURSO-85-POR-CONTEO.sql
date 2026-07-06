-- LIMPIAR CURSO 85 POR CONTEO DE ASISTENCIAS
-- Regla: una fecha se considera clase real si tiene al menos N registros de asistencia validos.
-- Para tu caso, N=8 deja las fechas con 9/10 registros y elimina las de 4.

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
  asistencia_id uuid primary key,
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
    8::int as min_registros_fecha -- ajustable
),
matriculas_curso as (
  select m.id as matricula_id
  from public.matriculas m
  join params p on p.curso_id = m.curso_id
),
conteo_por_fecha as (
  select
    a.fecha,
    count(*)::int as registros
  from public.asistencias a
  join matriculas_curso mc on mc.matricula_id = a.matricula_id
  where lower(coalesce(a.estado, '')) in ('presente', 'ausente', 'justificada')
  group by a.fecha
),
fechas_validas as (
  select c.fecha
  from conteo_por_fecha c
  join params p on c.registros >= p.min_registros_fecha
),
fechas_a_limpiar as (
  select c.fecha
  from conteo_por_fecha c
  where c.fecha not in (select fecha from fechas_validas)
),
sesiones_a_borrar as (
  select s.id, s.curso_id, s.fecha, s.tema_visto, s.created_at
  from public.sesiones_clase s
  join params p on p.curso_id = s.curso_id
  join fechas_a_limpiar f on f.fecha = s.fecha
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
    s.id,
    s.curso_id,
    s.fecha,
    s.tema_visto,
    s.created_at,
    now(),
    'curso 85: fecha con conteo de asistencia por debajo del umbral'
  from sesiones_a_borrar s
  on conflict (sesion_id) do nothing
  returning sesion_id
),
delete_sesiones as (
  delete from public.sesiones_clase s
  using sesiones_a_borrar b
  where s.id = b.id
  returning s.id
),
asistencias_a_borrar as (
  select a.id, a.matricula_id, a.fecha, a.estado, a.observaciones
  from public.asistencias a
  join matriculas_curso mc on mc.matricula_id = a.matricula_id
  join fechas_a_limpiar f on f.fecha = a.fecha
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
    a.id,
    a.matricula_id,
    a.fecha,
    a.estado,
    a.observaciones,
    now(),
    'curso 85: fecha con conteo de asistencia por debajo del umbral'
  from asistencias_a_borrar a
  on conflict (asistencia_id) do nothing
  returning asistencia_id
)
delete from public.asistencias a
using asistencias_a_borrar b
where a.id = b.id;

commit;

-- Verificacion 1: fechas y conteos finales
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
order by a.fecha;

-- Verificacion 2: total de sesiones finales
select count(*) as total_sesiones_final
from public.sesiones_clase
where curso_id = 85;

-- Verificacion 3: sesiones finales ordenadas
select id, fecha, tema_visto, created_at
from public.sesiones_clase
where curso_id = 85
order by fecha asc, created_at asc;
