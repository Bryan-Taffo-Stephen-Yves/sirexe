# CLAUDE.md · Cirex (SIREXE 2026)

Langue de travail : **français**. Code et commentaires en anglais ou en français (suivre le fichier), interface en français, dates au format français, fuseau Africa/Abidjan (= GMT).

## Le projet

Cirex détecte les sites d'orpaillage clandestin : capteur d'eau (turbidité, conductivité, pH, température) → alerte → confirmation Sentinel-2 → mission terrain → rapport PDF. Concours SIREXE Hackathon 2026 (Prix Liberté), porteur BRENT GROUP, lead produit Stephen Affo. Cahier des charges : `docs/CDC_Orpaillage_SIREXE_2026_v1.0.md`.

Stephen attend une recommandation claire, puis l'exécution. Priorité absolue : ce qui sert la démo (voir `docs/DEMO.md`).

## Règles non négociables

1. **Ne jamais inventer un chiffre affiché.** Tout est calculé (pipeline, capteur, base) ou étiqueté « fictif », « simulation », « test ». Pas de « confiance » en % : le pipeline donne `signal` (baisse du NDVI), qui n'est pas une probabilité.
2. **Pas d'affiliation officielle** : « Cirex · Prototype », jamais de logo ou de nom de ministère présenté comme émetteur.
3. Cadastre minier et statuts légaux = **fictifs**, le dire.
4. Le pH seul ne détecte pas le mercure : parler turbidité et conductivité.
5. Aucun secret dans le navigateur : jeton Telegram et clé `service_role` uniquement dans les secrets Supabase ; `device_key` des capteurs jamais committée.
6. Les nuages limitent Sentinel-2 en saison des pluies : Sentinel-1 (radar) est l'extension prévue.

## Architecture actuelle

- `web/` : site statique. Écrans exportés de Claude Design (`*.dc.html` + `support.js`, moteur à ne pas modifier) ; logique dans le `<script type="text/x-dc">` de chaque écran (classe `Component extends DCLogic`, valeurs renvoyées par `renderVals()` et injectées dans le gabarit via `{{ }}`). `orp-carto.js` : cartes Leaflet. `cirex-data.js` : `window.CIREX` (JSON du pipeline, client Supabase, formats). `config.js` : URL + clé publiable.
- `pipeline/ndvi_pipeline.py` : Sentinel-2 L2A depuis AWS Open Data, sorties dans `web/data/<site>/`.
- Supabase, projet `sirexe` (`dlcuxdzodgctjcxtmuza`) : tables `sensors`, `readings`, `alerts`, `missions`, `reports`, `notifications`. L'indice de suspicion et la création d'alerte sont des triggers SQL ; la même formule existe dans l'écran (`idxOf`). Tables station : `device_status`, `sms_messages`, `camera_frames` (+ bucket public `camera`), `device_commands`. Fonctions : `ingest-reading` (clé capteur, Telegram en cas d'alerte), `device-event` (état, SMS, photos, commandes de la station), `notify-telegram` (test et alertes de simulation, 1 message / 30 s).
- `relay/` : relais ESP32 HTTP → serveur, rejeu de mesures.

## Vérifier un changement

- Servir `web/` (`python3 -m http.server`) et ouvrir les écrans ; console sans erreur (les erreurs `<path> attribute d: "{{ … }}"` au chargement viennent du gabarit brut et sont normales).
- Pipeline : `python pipeline/ndvi_pipeline.py --synthetic --out /tmp/test` doit tourner hors ligne.
- Après une modification SQL, relancer les conseils de sécurité Supabase.

## Questions ouvertes

Date exacte de la présélection, livraison des sondes du Maroc, titulaires des rôles backend / satellite / frontend / pitch, branchement réel NASA FIRMS (clé gratuite), comptes utilisateurs (Supabase Auth).
