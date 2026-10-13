-- Cirex · station de terrain (ESP32 / ESP32-CAM) via le serveur
-- Le boîtier (ou le relais Wi-Fi local) envoie à la fonction device-event :
--   son état complet (chaque clé devient une case dans l'écran), ses SMS reçus, ses photos.
-- La page envoie des commandes (photo, flash, lampe, mode) que le boîtier récupère.
-- Ainsi l'écran fonctionne depuis n'importe où, y compris en https, sans être sur le Wi-Fi du site.

create table public.device_status (
  sensor_id  text primary key references public.sensors(id),
  status     jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.sms_messages (
  id          bigint generated always as identity primary key,
  sensor_id   text not null references public.sensors(id),
  sender      text,
  body        text not null,
  sent_at     timestamptz,                       -- horodatage donné par le module SIM
  received_at timestamptz not null default now()
);
create unique index sms_messages_dedup on public.sms_messages (sensor_id, coalesce(sender, ''), body, coalesce(sent_at, 'epoch'::timestamptz));
create index sms_messages_recent on public.sms_messages (sensor_id, received_at desc);

create table public.camera_frames (
  id        bigint generated always as identity primary key,
  sensor_id text not null references public.sensors(id),
  path      text not null,                       -- chemin dans le bucket « camera »
  bytes     int,
  taken_at  timestamptz not null default now()
);
create index camera_frames_recent on public.camera_frames (sensor_id, taken_at desc);

create table public.device_commands (
  id         bigint generated always as identity primary key,
  sensor_id  text not null references public.sensors(id),
  cmd        text not null check (cmd in ('capture', 'flash', 'lamp', 'mode')),
  val        text check (val is null or length(val) <= 16),
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index device_commands_pending on public.device_commands (sensor_id, created_at) where done_at is null;

alter table public.device_status   enable row level security;
alter table public.sms_messages    enable row level security;
alter table public.camera_frames   enable row level security;
alter table public.device_commands enable row level security;

create policy device_status_read on public.device_status for select to anon, authenticated using (true);
create policy sms_read           on public.sms_messages  for select to anon, authenticated using (true);
create policy frames_read        on public.camera_frames for select to anon, authenticated using (true);
create policy commands_read      on public.device_commands for select to anon, authenticated using (true);
-- la page peut demander une commande, jamais la marquer comme faite ni la supprimer
create policy commands_insert on public.device_commands for insert to anon, authenticated
  with check (done_at is null and exists (select 1 from public.sensors s where s.id = sensor_id));
revoke update, delete on public.device_commands from anon, authenticated;
revoke insert, update, delete on public.device_status, public.sms_messages, public.camera_frames from anon, authenticated;

alter publication supabase_realtime add table public.device_status, public.sms_messages, public.camera_frames, public.device_commands;

-- Photos : bucket public en lecture (URL directe dans l'écran), écriture par la fonction seulement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('camera', 'camera', true, 800000, array['image/jpeg'])
on conflict (id) do nothing;
