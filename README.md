# Sirexe · détection d'orpaillage clandestin

SIREXE Hackathon 2026, Prix Liberté. Projet présélectionné parmi les 10 meilleurs. Porteur : BRENT GROUP.

Chaîne : **capteur dans l'eau** (turbidité, conductivité, pH, température) → **alerte** → **confirmation Sentinel-2** (perte de végétation) → **mission terrain** → **rapport PDF**.

> Prototype de concours, sans affiliation officielle. Tout chiffre affiché est soit calculé (capteur PH-CI-003, Sentinel-2 sur Kokumbo), soit étiqueté « fictif » ou « simulation ».

## Ce qui est réel, ce qui est fictif

| Élément | État |
|---|---|
| Zones de changement, surfaces, baisse du NDVI, dates, série NDVI de Kokumbo | **Réel** : calculé sur 24 + 13 images Sentinel-2 L2A (nov. 2018–mars 2019 / nov. 2025–mars 2026), puis sur une série de 191 dates sans nuages (`web/data/kokumbo/`) |
| Capteur PH-CI-003 en mode « Boîtier · serveur » | **Réel** : mesures reçues par la fonction `ingest-reading`, alertes créées par la base |
| Alertes, missions, rapports enregistrés sur le serveur | **Réel** (Supabase `sirexe`) |
| Notification Telegram | **Réelle**, envoyée par le serveur dès que le jeton du bot est ajouté (voir plus bas) |
| Station ESP32 (mode Serveur) : état, SMS, photos de la caméra, commandes | **Réel** dès que le boîtier ou `relay/esp32_relay.py` envoie à la fonction `device-event` |
| Mode « Simulation » du panneau démo | Valeurs générées par la page, badge « Simulation » affiché |
| 246 autres sites, 5 autres capteurs, cadastre minier, feux, agents, missions et rapports d'exemple | **Fictifs**, étiquetés comme tels |

La détection satellite n'est pas de l'IA : c'est une comparaison d'indices NDVI. Un défrichement agricole donne le même signal qu'un chantier d'orpaillage : la vérification terrain est obligatoire.

## Arborescence

```
web/                 site statique (aucune compilation)
  app.html                         application (tableau de bord, carte, alertes, satellite, missions, rapports, capteurs, station, sites, équipe, paramètres), ordinateur et mobile
  app/app.css, app/app.js          système de design et logique de l'interface (voir DESIGN.md)
  app/fonts/, app/icons.js         police Urbanist et icônes Tabler, servies en local
  vendor/                          Leaflet 1.9.4, topojson-client 3.1.0, supabase-js 2.45.4, world-atlas 2.0.2 (copies identiques aux CDN, licences jointes)
  Centre de surveillance.dc.html   ancienne interface Claude Design (conservée pour référence)
  Comparateur.dc.html              ancien comparateur Claude Design
  rapport.html                     rapport imprimable en PDF (?code=RPT-…)
  orp-carto.js                     cartes Leaflet (Esri, EOX, zones du pipeline)
  cirex-data.js                    lecture des JSON du pipeline + client Supabase
  config.js                        URL et clé publique Supabase, jeu de données
  data/kokumbo/                    sorties réelles du pipeline
  data/out_synthetic/              données de test (synthetic: true)
  support.js                       moteur des fichiers .dc.html (Claude Design) : ne pas modifier
pipeline/ndvi_pipeline.py          calcul NDVI + zones de changement (voir pipeline/README.md)
supabase/migrations/               tables, indice de suspicion, alertes, droits
supabase/functions/                ingest-reading (mesures), device-event (état, SMS, photos, commandes), notify-telegram
relay/esp32_relay.py               ESP32 / ESP32-CAM en HTTP local → serveur HTTPS (mesures, état, SMS, photos, commandes)
relay/replay.py                    rejeu de mesures enregistrées (plan B)
docs/DEMO.md                       déroulé de la démo de 3 minutes et plans de secours
docs/ESP32.md                      contrat d'envoi des mesures pour le firmware
```

## Lancer en local

```bash
cd web
python3 -m http.server 8000
# ouvrir http://localhost:8000/ (redirige vers app.html)
```

Touche **D** : séquence de démonstration. **Maj + D** : panneau démo (source des mesures, test Telegram). **R** (panneau ouvert) : réinitialiser.

`app.html` et `rapport.html` ne chargent plus rien depuis un CDN : bibliothèques dans `web/vendor/`, police dans `web/app/fonts/`, images Sentinel-2 dans `web/data/`. Internet sert seulement aux fonds de carte (Esri, EOX) et au serveur Supabase. Sans serveur joignable, la page le dit (« serveur injoignable ») et une mission créée reste dans la page (`LOCAL-1`, non enregistrée). Les anciens écrans `.dc.html` chargent encore React depuis unpkg. Plan sans réseau : voir `docs/DEMO.md`.

## Mettre en ligne

Le dossier `web/` est un site statique, sans étape de build. Les trois hébergeurs sont prêts (Vercel et Netlify vérifiés avec leurs propres outils, GitHub Pages testé sous `/sirexe/`) :

- **Vercel** : « Add New → Project », importer le dépôt, ne rien changer, « Deploy ». `vercel.json` publie `web/`.
- **Netlify** : « Add new site → Import an existing project », choisir le dépôt, « Deploy ». `netlify.toml` publie `web/`.
- **GitHub Pages** (dépôt public, gratuit) : la branche `gh-pages` contient le site et se met à jour toute seule à chaque push sur `main` qui modifie `web/` (`.github/workflows/gh-pages.yml`). À faire une seule fois par un administrateur du dépôt : Settings → Pages → « Deploy from a branch » → `gh-pages`, dossier `/ (root)` → Save. Adresse : https://bryan-taffo-stephen-yves.github.io/sirexe/ (chemins relatifs, rien à modifier).

Après la mise en ligne : ouvrir l'adresse sur ordinateur et sur téléphone, vérifier les fonds de carte, la pastille verte « Serveur connecté » et le bouton « Tester » de Telegram. L'adresse est en https : la webcam fonctionne, mais l'ESP32 en Wi-Fi local (http) est bloqué par le navigateur ; utiliser la source « Boîtier · serveur » (boîtier ou `relay/esp32_relay.py`).

## Serveur (Supabase, projet `sirexe`)

Déjà en place : tables, triggers (indice de suspicion et création d'alerte), droits, temps réel, bucket `camera` (photos), fonctions `ingest-reading`, `device-event` et `notify-telegram`.

À faire une fois :

1. **Telegram** : créer un bot avec @BotFather, récupérer l'identifiant de la discussion, puis dans Supabase → Edge Functions → Secrets, ajouter `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`. Tester avec le bouton « Tester » du panneau démo.
2. **Clé du capteur** : dans l'éditeur SQL, `select device_key from sensors where id = 'PH-CI-003';`. La donner à l'équipe capteurs (firmware ou relais). Ne jamais la publier.

Indice de suspicion (même formule dans la base et dans la page) :
`100 × (0,60 × (1 − e^(−Δturbidité/220)) + 0,25 × (1 − e^(−Δconductivité/500)) + 0,15 × min(1, |ΔpH|/2,6))`, alerte à 60.

## Limites connues

- Pas encore de comptes utilisateurs : la clé publique permet de lire, créer des missions et des rapports. À fermer avec Supabase Auth avant tout usage réel.
- Les nuages réduisent fortement les dates Sentinel-2 utilisables en saison des pluies : Sentinel-1 (radar) est l'extension prévue.
- Couche feux NASA FIRMS non branchée (points fictifs).
- Les écrans `.dc.html` dépendent du moteur Claude Design (`support.js`). Pour la finale, un portage Next.js reste possible sans changer les données ni le serveur.
