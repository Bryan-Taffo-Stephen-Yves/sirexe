# Cirex · détection d'orpaillage clandestin

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
  Centre de surveillance.dc.html   écran principal (exporté de Claude Design, branché sur les données)
  Comparateur.dc.html              avant / après Sentinel-2
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
# ouvrir http://localhost:8000/
```

Touche **D** : séquence de démonstration. **Maj + D** : panneau démo (source des mesures, test Telegram). **R** (panneau ouvert) : réinitialiser.

Les pages chargent React, Leaflet et Supabase depuis unpkg / jsDelivr et les fonds de carte depuis Esri et EOX : il faut Internet. Plan sans réseau : voir `docs/DEMO.md`.

## Mettre en ligne

Le dossier `web/` est un site statique : Vercel, Netlify ou GitHub Pages, sans étape de build (dossier racine : `web`).

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
