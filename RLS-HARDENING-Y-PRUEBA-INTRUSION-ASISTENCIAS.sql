-- ============================================================
-- RLS HARDENING + VERIFICACION
-- Tablas: public.sesiones_clase, public.asistencias
-- Objetivo:
-- 1) Eliminar policy abierta "Enable all access for authenticated users"
-- 2) Mantener solo policies granulares por rol/profesor
-- 3) Dejar evidencia verificable de que no hay bypass obvio por policy
-- ============================================================

begin;

-- 1) Asegurar RLS activo
alter table public.asistencias enable row level security;
alter table public.sesiones_clase enable row level security;

-- 2) Forzar RLS (reduce riesgo de bypass por owner)
alter table public.asistencias force row level security;
alter table public.sesiones_clase force row level security;

-- 3) Eliminar policy abierta peligrosa
--    (si existe en minusc/mayusc diferentes, cubrimos varias opciones)
drop policy if exists "Enable all access for authenticated users" on public.asistencias;
drop policy if exists "Enable all access for authenticated users" on public.sesiones_clase;
drop policy if exists "enable all access for authenticated users" on public.asistencias;
drop policy if exists "enable all access for authenticated users" on public.sesiones_clase;

commit;

-- ============================================================
-- VERIFICACION 1: Estado RLS
-- ============================================================
select
  t.schemaname,
  t.tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_tables t
join pg_class c on c.relname = t.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
where t.schemaname = 'public'
  and t.tablename in ('sesiones_clase', 'asistencias')
order by t.tablename;

-- ============================================================
-- VERIFICACION 2: No debe existir la policy abierta
-- Esperado: 0 filas
-- ============================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('sesiones_clase', 'asistencias')
  and lower(policyname) = 'enable all access for authenticated users';

-- ============================================================
-- VERIFICACION 3: Policies activas (auditoria humana)
-- ============================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('sesiones_clase', 'asistencias')
order by tablename, cmd, policyname;

-- ============================================================
-- VERIFICACION 4: Smoke check de riesgo por expresion "true"
-- Esperado: 0 filas
-- ============================================================
select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('sesiones_clase', 'asistencias')
  and (
    coalesce(trim(qual), '') in ('true', '(true)')
    or coalesce(trim(with_check), '') in ('true', '(true)')
  )
order by tablename, policyname;

-- ============================================================
-- PRUEBA DE INTRUSION CONTROLADA (MANUAL, RECOMENDADA)
-- Ejecutar en la app, NO desde SQL Editor:
-- 1) Inicia sesion como Profesora A
-- 2) Intenta abrir llamado de lista de un curso de Profesora B
--    - Con el parche UI, no deberia aparecer
-- 3) Si forzas URL/manual request, al guardar debe fallar por RLS
-- 4) Como admin/secretaria debe seguir funcionando
-- ============================================================

-- Ayuda: pares profesora/curso para test cruzado (si existen)
select
  c1.profesor_id as profesora_a,
  c1.id as curso_a,
  c1.nombre as nombre_curso_a,
  c2.profesor_id as profesora_b,
  c2.id as curso_b,
  c2.nombre as nombre_curso_b
from public.cursos c1
join public.cursos c2 on c1.profesor_id <> c2.profesor_id
where c1.estado = 'activo'
  and c2.estado = 'activo'
  and c1.profesor_id is not null
  and c2.profesor_id is not null
limit 10;
