-- Cirex · schéma initial (capteurs, mesures, alertes, missions, rapports, notifications)
-- Prototype SIREXE 2026 : pas encore de comptes utilisateurs. Le navigateur utilise la clé
-- publique (rôle anon) : lecture de tout sauf les clés des capteurs, écriture limitée aux
-- missions, rapports et au statut des alertes. Les mesures n'entrent que par la fonction
-- ingest-reading (clé du capteur vérifiée côté serveur).

-- ------------------------------------------------------------------ capteurs
create table public.sensors (
  id          text primary key,                       -- ex. 'PH-CI-003'
  name        text not null,
  locality    text,
  region      text,
  lat         double precision not null,
  lon         double precision not null,
  baseline    jsonb not null default '{"turbidity_ntu":5,"ph":7.1,"tds_ppm":120,"temperature_c":27.8}',
  threshold   real  not null default 60,              -- indice déclenchant une alerte
  consecutive int   not null default 1,               -- mesures consécutives ≥ seuil (1 en démo, 2 sur le terrain)
  device_key  text  not null default replace(gen_random_uuid()::text, '-', ''),
  is_real     boolean not null default false,         -- false = capteur fictif de démonstration
  status      text not null default 'active' check (status in ('active','offline','maintenance')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ mesures
create table public.readings (
  id              bigint generated always as identity primary key,
  sensor_id       text not null references public.sensors(id),
  measured_at     timestamptz not null default now(),
  turbidity_ntu   real,
  ph              real,
  tds_ppm         real,
  temperature_c   real,
  battery_pct     real,
  source          text not null default 'capteur' check (source in ('capteur','relais','rejeu')),
  suspicion_score real
);
create index readings_sensor_time on public.readings (sensor_id, measured_at desc);

-- ------------------------------------------------------------------ alertes
create sequence public.alert_seq start 413;
create table public.alerts (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default ('ALT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.alert_seq')::text, 4, '0')),
  sensor_id        text references public.sensors(id),
  site_id          text,
  created_at       timestamptz not null default now(),
  suspicion_score  real,
  trigger          jsonb,                              -- mesures et écarts au moment de l'alerte
  source           text not null default 'capteur',   -- capteur | relais | rejeu | satellite
  status           text not null default 'nouvelle'
                   check (status in ('nouvelle','analyse','confirmee','assignee','cloturee','fausse')),
  satellite_result jsonb                               -- résumé de summary.json au moment de l'analyse
);
create index alerts_open on public.alerts (sensor_id) where status not in ('cloturee','fausse');

-- ------------------------------------------------------------------ missions
create sequence public.mission_seq start 122;
create table public.missions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('MIS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.mission_seq')::text, 3, '0')),
  alert_id       uuid references public.alerts(id),
  target         text not null,                        -- site ou capteur visé
  locality       text,
  kind           text not null default 'Vérification terrain',
  agent          text,
  status         text not null default 'aassigner'
                 check (status in ('aassigner','assignee','route','site','cloturee')),
  instructions   text,
  photo_url      text,
  photo_lat      double precision,
  photo_lon      double precision,
  report         text,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

-- ------------------------------------------------------------------ rapports
create sequence public.report_seq start 143;
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default ('RPT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.report_seq')::text, 4, '0')),
  alert_id    uuid references public.alerts(id),
  mission_id  uuid references public.missions(id),
  title       text not null,
  kind        text not null default 'Rapport d''alerte',
  status      text not null default 'brouillon' check (status in ('brouillon','transmis','publie')),
  content     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ journal des notifications
create table public.notifications (
  id         bigint generated always as identity primary key,
  channel    text not null default 'telegram',
  alert_id   uuid references public.alerts(id),
  kind       text not null,                            -- alerte | test
  ok         boolean,
  detail     text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ indice de suspicion
-- Même formule que l'écran (Centre de surveillance) : écarts saturés à la référence du capteur.
-- turbidité 60 %, conductivité 25 %, pH 15 %. Résultat 0..100.
create or replace function public.suspicion_score(b jsonb, turb real, ph real, tds real)
returns real language sql immutable set search_path = public as $$
  select round(100 * (
      0.60 * (1 - exp(-greatest(0, coalesce(turb, (b->>'turbidity_ntu')::real) - (b->>'turbidity_ntu')::real) / 220.0))
    + 0.25 * (1 - exp(-greatest(0, coalesce(tds,  (b->>'tds_ppm')::real)       - (b->>'tds_ppm')::real)       / 500.0))
    + 0.15 * least(1, abs(coalesce(ph, (b->>'ph')::real) - (b->>'ph')::real) / 2.6)
  ))::real
$$;

create or replace function public.readings_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.sensors%rowtype;
begin
  select * into s from public.sensors where id = new.sensor_id;
  new.suspicion_score := public.suspicion_score(s.baseline, new.turbidity_ntu, new.ph, new.tds_ppm);
  return new;
end $$;
create trigger readings_score before insert on public.readings
  for each row execute function public.readings_score();

-- Crée l'alerte quand l'indice dépasse le seuil sur `consecutive` mesures, s'il n'y a pas déjà
-- une alerte ouverte pour ce capteur.
create or replace function public.readings_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.sensors%rowtype; n int;
begin
  select * into s from public.sensors where id = new.sensor_id;
  if new.suspicion_score is null or new.suspicion_score < s.threshold then return null; end if;
  if exists (select 1 from public.alerts where sensor_id = new.sensor_id and status not in ('cloturee','fausse')) then return null; end if;
  select count(*) into n from (
    select suspicion_score from public.readings where sensor_id = new.sensor_id
    order by measured_at desc, id desc limit s.consecutive) r
  where r.suspicion_score >= s.threshold;
  if n < s.consecutive then return null; end if;
  insert into public.alerts (sensor_id, suspicion_score, source, trigger)
  values (new.sensor_id, new.suspicion_score, new.source, jsonb_build_object(
    'reading_id', new.id, 'measured_at', new.measured_at,
    'turbidity_ntu', new.turbidity_ntu, 'ph', new.ph, 'tds_ppm', new.tds_ppm, 'temperature_c', new.temperature_c,
    'baseline', s.baseline));
  return null;
end $$;
create trigger readings_alert after insert on public.readings
  for each row execute function public.readings_alert();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ droits (RLS)
alter table public.sensors       enable row level security;
alter table public.readings      enable row level security;
alter table public.alerts        enable row level security;
alter table public.missions      enable row level security;
alter table public.reports       enable row level security;
alter table public.notifications enable row level security;

revoke all on public.sensors from anon, authenticated;
grant select (id, name, locality, region, lat, lon, baseline, threshold, consecutive, is_real, status, created_at)
  on public.sensors to anon, authenticated;
create policy sensors_read on public.sensors for select to anon, authenticated using (true);

create policy readings_read on public.readings for select to anon, authenticated using (true);
revoke insert, update, delete on public.readings from anon, authenticated;

create policy alerts_read on public.alerts for select to anon, authenticated using (true);
revoke insert, delete on public.alerts from anon, authenticated;
revoke update on public.alerts from anon, authenticated;
grant update (status, site_id, satellite_result) on public.alerts to anon, authenticated;
create policy alerts_update on public.alerts for update to anon, authenticated using (true) with check (true);

create policy missions_read on public.missions for select to anon, authenticated using (true);
create policy missions_insert on public.missions for insert to anon, authenticated with check (true);
create policy missions_update on public.missions for update to anon, authenticated using (true) with check (true);
revoke delete on public.missions from anon, authenticated;

create policy reports_read on public.reports for select to anon, authenticated using (true);
create policy reports_insert on public.reports for insert to anon, authenticated with check (true);
create policy reports_update on public.reports for update to anon, authenticated using (true) with check (true);
revoke delete on public.reports from anon, authenticated;

revoke all on public.notifications from anon, authenticated;

grant usage on sequence public.alert_seq, public.mission_seq, public.report_seq to anon, authenticated;

-- ------------------------------------------------------------------ temps réel
alter publication supabase_realtime add table public.readings, public.alerts, public.missions, public.reports;

-- ------------------------------------------------------------------ capteurs
-- PH-CI-003 est le boîtier réel de l'équipe (positionné à Kokumbo pour la démonstration).
-- Les cinq autres sont fictifs (is_real = false) et le restent tant qu'aucun boîtier n'est posé.
insert into public.sensors (id, name, locality, region, lon, lat, is_real, status) values
  ('PH-CI-001', 'Station Bouna',      'Bouna',      'Bounkani',  -3.00, 9.27,   false, 'active'),
  ('PH-CI-002', 'Station Bondoukou',  'Bondoukou',  'Gontougo',  -2.80, 8.04,   false, 'active'),
  ('PH-CI-003', 'Station Kokumbo',    'Kokumbo',    'Bélier',    -5.1462, 6.4105, true,  'active'),
  ('PH-CI-004', 'Station San Pedro',  'San Pedro',  'San-Pédro', -6.64, 4.75,   false, 'active'),
  ('PH-CI-005', 'Station Man',        'Man',        'Tonkpi',    -7.55, 7.41,   false, 'active'),
  ('PH-CI-006', 'Station Odienné',    'Odienné',    'Kabadougou',-7.56, 9.51,   false, 'offline');
