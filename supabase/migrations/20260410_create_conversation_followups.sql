create table if not exists public.conversation_followups (
  id uuid default gen_random_uuid() primary key,
  conversation_id text not null,
  phone_number text,
  type text not null,
  reference_message_at timestamp with time zone,
  sent_at timestamp with time zone default now(),
  status text not null default 'sent',
  error_message text,
  payload jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint conversation_followups_status_check
    check (status in ('sent', 'skipped', 'failed'))
);

create unique index if not exists idx_conversation_followups_unique_cycle
  on public.conversation_followups(conversation_id, type, reference_message_at);

create index if not exists idx_conversation_followups_phone
  on public.conversation_followups(phone_number);

create index if not exists idx_conversation_followups_status
  on public.conversation_followups(status);

create index if not exists idx_conversation_followups_sent_at
  on public.conversation_followups(sent_at desc);

alter table public.conversation_followups enable row level security;

drop policy if exists "Service role y admins pueden acceder followups" on public.conversation_followups;
create policy "Service role y admins pueden acceder followups"
  on public.conversation_followups
  for all
  to authenticated
  using (
    auth.role() = 'service_role'
    or auth.uid() in (
      select id from public.perfiles where rol in ('desarrollo', 'administrador', 'admin', 'director')
    )
  )
  with check (
    auth.role() = 'service_role'
    or auth.uid() in (
      select id from public.perfiles where rol in ('desarrollo', 'administrador', 'admin', 'director')
    )
  );

drop trigger if exists update_conversation_followups_updated_at on public.conversation_followups;
create trigger update_conversation_followups_updated_at
  before update on public.conversation_followups
  for each row
  execute function update_timestamp();