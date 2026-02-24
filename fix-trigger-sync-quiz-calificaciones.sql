-- Fix definitivo: evitar 42P10 en trigger de sincronización quiz -> calificaciones
-- Ejecutar en Supabase SQL Editor

create or replace function public.sync_quiz_intento_a_calificaciones()
returns trigger
language plpgsql
as $$
declare
  v_tema_id uuid;
  v_concepto text;
  v_actualizadas integer := 0;
begin
  select q.pensum_curso_id
    into v_tema_id
  from public.quizzes_clase q
  where q.id = new.quiz_id;

  if v_tema_id is null then
    return new;
  end if;

  v_concepto := 'Quiz de clase';

  update public.calificaciones
     set nota = new.calificacion,
         calificacion = new.calificacion,
         fecha_evaluacion = new.enviado_at::date,
         observaciones = concat('Quiz: ', new.respuestas_correctas, '/', new.total_preguntas, ' correctas')
   where matricula_id = new.matricula_id
     and tema_id = v_tema_id
     and tipo_evaluacion = 'quiz';

  get diagnostics v_actualizadas = row_count;

  if v_actualizadas = 0 then
    insert into public.calificaciones (
      matricula_id,
      tema_id,
      concepto,
      nota,
      calificacion,
      tipo_evaluacion,
      fecha_evaluacion,
      observaciones
    )
    values (
      new.matricula_id,
      v_tema_id,
      v_concepto,
      new.calificacion,
      new.calificacion,
      'quiz',
      new.enviado_at::date,
      concat('Quiz: ', new.respuestas_correctas, '/', new.total_preguntas, ' correctas')
    );
  end if;

  return new;
end;
$$;

-- Recrear trigger por seguridad
drop trigger if exists trg_sync_quiz_intento_a_calificaciones on public.quiz_intentos_clase;
create trigger trg_sync_quiz_intento_a_calificaciones
after insert or update on public.quiz_intentos_clase
for each row execute function public.sync_quiz_intento_a_calificaciones();
