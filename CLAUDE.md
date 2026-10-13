# CLAUDE.md · Sirexe (hackathon SIREXE 2026)

Langue de travail : **français**. Code et commentaires en anglais ou en français (suivre le fichier), interface en français, dates au format français, fuseau Africa/Abidjan (= GMT).

## Le projet

Sirexe détecte les sites d'orpaillage clandestin : capteur d'eau (turbidité, conductivité, pH, température) → alerte → confirmation Sentinel-2 → mission terrain → rapport PDF. Concours SIREXE Hackathon 2026 (Prix Liberté), porteur BRENT GROUP, lead produit Stephen Affo. Cahier des charges : `docs/CDC_Orpaillage_SIREXE_2026_v1.0.md`.

Stephen attend une recommandation claire, puis l'exécution. Priorité absolue : ce qui sert la démo (voir `docs/DEMO.md`).

## Règles non négociables

1. **Ne jamais inventer un chiffre affiché.** Tout est calculé (pipeline, capteur, base) ou étiqueté « fictif », « simulation », « test ». Pas de « confiance » en % : le pipeline donne `signal` (baisse du NDVI), qui n'est pas une probabilité.
2. **Pas d'affiliation officielle** : « Sirexe · Prototype », jamais de logo ou de nom de ministère présenté comme émetteur.
3. Cadastre minier et statuts légaux = **fictifs**, le dire.
4. Le pH seul ne détecte pas le mercure : parler turbidité et conductivité.
5. Aucun secret dans le navigateur : jeton Telegram et clé `service_role` uniquement dans les secrets Supabase ; `device_key` des capteurs jamais committée.
6. Les nuages limitent Sentinel-2 en saison des pluies : Sentinel-1 (radar) est l'extension prévue.

## Architecture actuelle

- `web/app.html` : interface actuelle (HTML/CSS/JS sans compilation, responsive). `web/app/app.js` : classe `App` (état, régions `[data-r]` recalculées à chaque rendu, actions `data-act`), `web/app/app.css` : système de design décrit dans `DESIGN.md`. Vues adressables par `#/apercu`, `#/carte`, `#/alertes`, `#/satellite`, etc.
- Ancienne interface : écrans exportés de Claude Design (`*.dc.html` + `support.js`, moteur à ne pas modifier) ; logique dans le `<script type="text/x-dc">` de chaque écran (classe `Component extends DCLogic`, valeurs renvoyées par `renderVals()` et injectées dans le gabarit via `{{ }}`). `orp-carto.js` : cartes Leaflet. `cirex-data.js` : `window.CIREX` (JSON du pipeline, client Supabase, formats). `config.js` : URL + clé publiable.
- `pipeline/ndvi_pipeline.py` : Sentinel-2 L2A depuis AWS Open Data, sorties dans `web/data/<site>/`.
- `pipeline/fond_s2.py` : fond de carte hébergé `web/data/fond-s2/` (tuiles Sentinel-2 réelles, z5 à z10), placé sous Esri / EOX dans `orp-carto.js`. Quand le fond choisi ne charge aucune tuile, la carte l'annonce (`fond` dans l'évènement `orp:view`) et la légende cite la mosaïque hébergée au lieu d'Esri.
- Supabase, projet `sirexe` (`dlcuxdzodgctjcxtmuza`) : tables `sensors`, `readings`, `alerts`, `missions`, `reports`, `notifications`. L'indice de suspicion et la création d'alerte sont des triggers SQL ; la même formule existe dans l'écran (`idxOf`). Tables station : `device_status`, `sms_messages`, `camera_frames` (+ bucket public `camera`), `device_commands`. Fonctions : `ingest-reading` (clé capteur, Telegram en cas d'alerte), `device-event` (état, SMS, photos, commandes de la station), `notify-telegram` (test et alertes de simulation, 1 message / 30 s).
- `relay/` : relais ESP32 HTTP → serveur, rejeu de mesures.
- `web/vendor/` : bibliothèques servies avec le site (Leaflet, topojson-client, supabase-js, world-atlas), copies identiques aux CDN. Ne pas remettre de CDN dans `app.html` ni `rapport.html` ; pour changer de version, ajouter un nouveau dossier versionné. Mise en ligne : `vercel.json`, `netlify.toml`, `.github/workflows/gh-pages.yml` (copie `web/` sur la branche `gh-pages` à chaque push sur main ; ne pas modifier `gh-pages` à la main). Tout est publié sans build, chemins relatifs.

## Vérifier un changement

- Servir `web/` (`python3 -m http.server`) et ouvrir les écrans ; console sans erreur (les erreurs `<path> attribute d: "{{ … }}"` au chargement viennent du gabarit brut et sont normales).
- Pipeline : `python pipeline/ndvi_pipeline.py --synthetic --out /tmp/test` doit tourner hors ligne.
- Après une modification SQL, relancer les conseils de sécurité Supabase.

## Questions ouvertes

Date exacte de la présélection, livraison des sondes du Maroc, titulaires des rôles backend / satellite / frontend / pitch, branchement réel NASA FIRMS (clé gratuite), comptes utilisateurs (Supabase Auth).
