-- Evidencias de tareas (1 foto por tema/tarea)
-- Ejecutar en Supabase SQL Editor

-- 1) Bucket publico para evidencias comprimidas
insert into storage.buckets (id, name, public)
values ('evidencias-tareas', 'evidencias-tareas', true)
on conflict (id) do nothing;

-- 2) Tabla de evidencias
create table if not exists public.evidencias_tareas (
  id bigint generated always as identity primary key,
  matricula_id bigint not null references public.matriculas(id) on delete cascade,
  curso_id bigint null references public.cursos(id) on delete set null,
  pensum_curso_id uuid not null references public.pensum_cursos(id) on delete cascade,
  estudiante_id uuid not null references public.perfiles(id) on delete cascade,
  url_imagen text not null,
  storage_path text not null,
  nombre_archivo text null,
  mime_type text null,
  tamano_bytes integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidencias_tareas_unica_por_tema unique (matricula_id, pensum_curso_id)
);

create index if not exists idx_evidencias_tareas_matricula on public.evidencias_tareas (matricula_id);
create index if not exists idx_evidencias_tareas_curso on public.evidencias_tareas (curso_id);
create index if not exists idx_evidencias_tareas_tema on public.evidencias_tareas (pensum_curso_id);
create index if not exists idx_evidencias_tareas_estudiante on public.evidencias_tareas (estudiante_id);
create index if not exists idx_evidencias_tareas_updated_at on public.evidencias_tareas (updated_at desc);

-- 3) Trigger updated_at
create or replace function public.set_updated_at_evidencias_tareas()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_evidencias_tareas on public.evidencias_tareas;
create trigger trg_set_updated_at_evidencias_tareas
before update on public.evidencias_tareas
for each row
execute function public.set_updated_at_evidencias_tareas();

-- 4) RLS
alter table public.evidencias_tareas enable row level security;

-- Estudiante: leer sus propias evidencias
drop policy if exists "evidencias_estudiante_select" on public.evidencias_tareas;
create policy "evidencias_estudiante_select"
on public.evidencias_tareas
for select
using (estudiante_id = auth.uid());

-- Estudiante: insertar su propia evidencia y solo sobre su matricula
drop policy if exists "evidencias_estudiante_insert" on public.evidencias_tareas;
create policy "evidencias_estudiante_insert"
on public.evidencias_tareas
for insert
with check (
  estudiante_id = auth.uid()
  and exists (
    select 1
    from public.matriculas m
    where m.id = evidencias_tareas.matricula_id
      and m.estudiante_id = auth.uid()
  )
);

-- Estudiante: actualizar su propia evidencia
drop policy if exists "evidencias_estudiante_update" on public.evidencias_tareas;
create policy "evidencias_estudiante_update"
on public.evidencias_tareas
for update
using (estudiante_id = auth.uid())
with check (estudiante_id = auth.uid());

-- Profesor: leer evidencias de sus cursos asignados
drop policy if exists "evidencias_profesor_select" on public.evidencias_tareas;
create policy "evidencias_profesor_select"
on public.evidencias_tareas
for select
using (
  exists (
    select 1
    from public.cursos c
    where c.id = evidencias_tareas.curso_id
      and c.profesor_id = auth.uid()
  )
);

-- 5) Storage policies para bucket evidencias-tareas
-- NOTA: se usa ruta estudiante_id/matricula_id/archivo.webp

drop policy if exists "storage_evidencias_insert_estudiante" on storage.objects;
create policy "storage_evidencias_insert_estudiante"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidencias-tareas'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "storage_evidencias_update_estudiante" on storage.objects;
create policy "storage_evidencias_update_estudiante"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'evidencias-tareas'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'evidencias-tareas'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "storage_evidencias_select_publico" on storage.objects;
create policy "storage_evidencias_select_publico"
on storage.objects
for select
to authenticated, anon
using (bucket_id = 'evidencias-tareas');

drop policy if exists "storage_evidencias_delete_estudiante" on storage.objects;
create policy "storage_evidencias_delete_estudiante"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'evidencias-tareas'
  and split_part(name, '/', 1) = auth.uid()::text
);
