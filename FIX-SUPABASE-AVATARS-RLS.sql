-- ============================================================
-- FIX SUPABASE: FOTOS DE ESTUDIANTES (BUCKET avatars + RLS)
-- ============================================================
-- Ejecutar en Supabase SQL Editor (proyecto correcto)
-- Objetivo: permitir subir/leer/actualizar/eliminar fotos en bucket avatars
-- y validar permisos para guardar foto_url en perfiles.

-- 1) Diagnóstico rápido
select id, name, public
from storage.buckets
where id = 'avatars' or name = 'avatars';

select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'perfiles'
order by policyname;

-- 2) Crear bucket avatars si no existe
-- Nota: en Supabase el id del bucket normalmente coincide con name.
insert into storage.buckets (id, name, public)
select 'avatars', 'avatars', true
where not exists (
  select 1 from storage.buckets where id = 'avatars' or name = 'avatars'
);

-- 3) Asegurar bucket publico para que el Avatar pueda renderizar la URL
update storage.buckets
set public = true
where id = 'avatars' and public is distinct from true;

-- 4) Políticas RLS en storage.objects para bucket avatars
-- Lectura pública (necesaria para getPublicUrl + render de imagen)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

-- Usuarios autenticados pueden subir archivos
drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'avatars');

-- Usuarios autenticados pueden reemplazar/actualizar archivos
drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'avatars')
with check (bucket_id = 'avatars');

-- Usuarios autenticados pueden borrar archivos (se usa al reemplazar foto)
drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'avatars');

-- 5) (Opcional) Si UPDATE de perfiles falla por RLS, habilitar esta policy puntual
-- Si ya tienes una policy de update para admin/director/administrativo, no hace falta.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'perfiles'
      and policyname = 'perfiles_update_foto_admin_staff'
  ) then
    create policy "perfiles_update_foto_admin_staff"
      on public.perfiles
      for update
      to authenticated
      using (
        auth.uid() = id
        or coalesce(auth.jwt()->'app_metadata'->>'rol', auth.jwt()->>'rol', auth.jwt()->>'role') in ('admin', 'director', 'administrativo')
      )
      with check (
        auth.uid() = id
        or coalesce(auth.jwt()->'app_metadata'->>'rol', auth.jwt()->>'rol', auth.jwt()->>'role') in ('admin', 'director', 'administrativo')
      );
  end if;
end $$;

-- 6) Verificación final
select id, name, public
from storage.buckets
where id = 'avatars';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'avatars_%'
order by policyname;
