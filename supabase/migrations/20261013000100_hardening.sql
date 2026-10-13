-- Les fonctions de trigger ne doivent pas être appelables par l'API publique
revoke execute on function public.readings_alert() from public, anon, authenticated;
revoke execute on function public.readings_score() from public, anon, authenticated;
-- Journal des notifications : invisible côté navigateur
create policy notifications_none on public.notifications for select to anon, authenticated using (false);
-- pg_net : permet de tester les fonctions depuis l'éditeur SQL (net.http_post)
create extension if not exists pg_net with schema extensions;
