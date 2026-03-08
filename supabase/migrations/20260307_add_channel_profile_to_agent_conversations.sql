-- Agregar metadatos de canal y perfil a conversaciones del agente
alter table if exists public.agent_conversations
  add column if not exists channel text,
  add column if not exists profile_name text;

-- Backfill inicial basado en phone_number
update public.agent_conversations
set channel = case
  when phone_number ilike 'ig:%' then 'instagram'
  when lower(phone_number) in ('unknown', 'desconocido', '') then 'unknown'
  else 'whatsapp'
end
where channel is null;

-- Índice para filtros por canal en UI
create index if not exists idx_agent_conversations_channel
  on public.agent_conversations(channel);
