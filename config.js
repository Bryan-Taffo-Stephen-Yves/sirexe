/* Sirexe · configuration publique du navigateur.
   Clé publiable Supabase : elle est faite pour être visible côté client. Les droits réels sont
   fixés par les règles RLS (voir supabase/migrations). Ne jamais mettre ici la clé service_role
   ni le jeton du bot Telegram : ils restent dans les secrets des fonctions Supabase. */
window.CIREX_CONFIG = {
  supabaseUrl: 'https://dlcuxdzodgctjcxtmuza.supabase.co',
  supabaseKey: 'sb_publishable_CQONNnG9yM2cpnFdHYdaVQ_XQP7p_DB',
  // Résultats du pipeline NDVI (pipeline/ndvi_pipeline.py). Remplacer par data/out_synthetic pour tester.
  dataset: 'data/kokumbo',
  siteId: 'ORP-0142',
  sensorId: 'PH-CI-003'
};
