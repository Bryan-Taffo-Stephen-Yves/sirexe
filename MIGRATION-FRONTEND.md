# Migration vers le nouveau frontend Sirexe

Le nouveau frontend est complet et déjà branché sur les données : `web/app.html` + `web/app/` (CSS, JS, police, icônes).
Il remplace les écrans Claude Design (`*.dc.html`), qui restent dans le dépôt seulement pour référence.

## Ce qui est livré

| Vue | Adresse | Contenu |
|---|---|---|
| Tableau de bord | `#/apercu` | 4 indicateurs, alertes, « que faire maintenant », capteur PH-CI-003 en direct (graphique + 4 mesures), carte, analyse Sentinel-2, missions, équipe |
| Carte | `#/carte` | carte plein écran, recherche, couches, fonds de carte, mesure, fiche de site |
| Alertes | `#/alertes` | tableau filtrable (toutes, ouvertes, clôturées) |
| Satellite | `#/satellite` | comparateur avant / après (5 modes, NDVI), zones, série NDVI, créer une mission, ajouter au rapport |
| Missions, Rapports, Capteurs, Sites, Équipe, Paramètres | `#/missions`… | tableaux filtrables ; sur mobile, chaque ligne devient une fiche |
| Station ESP32 | `#/esp` | caméra, commandes, état du boîtier, SMS, 4 modes de liaison |
| Panneau démo | Maj + D ou bouton ▶ | source des mesures, séquence, Telegram, son |

Responsive : ordinateur (≥ 1240 px, navigation en pilules), tablette et téléphone (≤ 1040 px, barre d'onglets en bas, panneaux en feuilles glissantes). Testé en 1440, 820 et 390 px.

Toute la logique de l'ancien écran est conservée : indice de suspicion (même formule que la base), Supabase temps réel (`readings`, `alerts`, `missions`, `reports`, `device_status`, `sms_messages`, `camera_frames`), Telegram côté serveur, webcam, ESP32 local et WebSocket, séquence de démo (touche D).

## Étapes pour Claude Code

1. Servir `web/` en local (`python3 -m http.server 8000`) et ouvrir `http://localhost:8000/` (redirige vers `app.html`).
2. Vérifier avec Internet : fonds de carte Esri / EOX, connexion Supabase (pastille verte « Serveur connecté »), arrivée des mesures PH-CI-003 en mode « Boîtier · serveur ».
3. Dérouler la démo (`docs/DEMO.md`) : D → alerte → vol sur la carte → zones → comparateur → mission → rapport PDF. Sur téléphone, utiliser le bouton « Lancer la démo ».
4. Redéployer les fonctions `notify-telegram` et `ingest-reading` (le nom affiché dans les messages est passé à « Sirexe »).
5. Déployer le dossier `web/` (Vercel, Netlify ou GitHub Pages, sans build).
6. Optionnel, une fois la démo validée : déplacer les `*.dc.html` et `support.js` dans `web/legacy/`.

### État au 13 octobre 2026

- Fait : étapes 1 et 3 (démo complète sur ordinateur 1440 px et téléphone 390 px, sans erreur JavaScript, sans défilement horizontal, 0 violation axe), étape 4 (fonctions redéployées, réponses vérifiées), étape 5 préparée (`vercel.json`, `netlify.toml`, `.github/workflows/pages.yml`, voir README « Mettre en ligne »).
- Corrigé : deux débordements sur téléphone (`#/esp`, `#/sites`), message clair quand le serveur est injoignable (mission gardée dans la page, rapport ouvert en aperçu), bibliothèques servies depuis `web/vendor/` au lieu des CDN.
- À vérifier par l'équipe avec Internet (l'environnement de test bloquait ces adresses) : fonds de carte Esri / EOX, pastille « Serveur connecté », mesures PH-CI-003 en mode « Boîtier · serveur ».
- Étape 6 non faite : à décider après la démo validée.

## Règles à garder

- Aucun chiffre inventé : tout est calculé ou étiqueté « fictif », « simulation », « test » (voir `CLAUDE.md`).
- Le design est décrit dans `DESIGN.md` (Urbanist, or et noir, coin découpé avec bouton flèche, mouvements sans rebond). Toute nouvelle vue réutilise les classes existantes (`.card`, `.cw.notched`, `.tile`, `.tbl`, `.seg`, `.pill`, `.btn`).
- Architecture de `app.js` : état unique (`this.state`), rendu par régions `[data-r="nom"]` (fonctions dans `R`), actions par `data-act="nom" data-a="argument"` (fonctions dans `A`), squelettes de vues dans `skel()`. Ajouter une vue = une entrée dans `VIEWS`, un squelette, ses régions.

## Si l'équipe veut passer à Next.js plus tard

Les données ne changent pas (`cirex-data.js`, Supabase, `web/data/`). Porter chaque région de `app.js` en composant React, garder `app.css` comme feuille globale et `orp-carto.js` comme composant client. À faire seulement après le concours : le site statique actuel n'a aucune étape de build qui peut casser le jour de la démo.
