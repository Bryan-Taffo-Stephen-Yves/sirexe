# Démo de 3 minutes · déroulé et plans de secours

## Avant de passer (J-1 et 30 min avant)

- [ ] `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans les secrets Supabase ; bouton « Tester » du panneau démo → message reçu sur le téléphone.
- [ ] Boîtier PH-CI-003 calibré (pH 4/7/10, turbidité en eau claire), clé du capteur dans le firmware ou dans `CIREX_DEVICE_KEY` pour le relais.
- [ ] Page ouverte, panneau démo (Maj + D) → source **Boîtier · serveur**, badge « Serveur temps réel » vert.
- [ ] Toute alerte ouverte de PH-CI-003 clôturée : **R** dans le panneau démo.
- [ ] Vidéo de secours enregistrée (voir plus bas) sur l'ordinateur ET sur une clé USB.
- [ ] Routeur 4G de secours chargé.

## Déroulé (≈ 3 min)

| Temps | Action | Ce que voit le jury |
|---|---|---|
| 0:00 | Bocal A, eau claire, sonde plongée | Centre de surveillance, badge « Mesure réelle · boîtier », indice bas |
| 0:20 | Terre argileuse (+ vinaigre) versée dans le bocal B, sonde plongée | Turbidité et indice qui montent en direct |
| 0:35 | Rien à cliquer | Alerte en moins de 15 s : bannière, carillon, **Telegram sur le téléphone** |
| 0:45 | Rien à cliquer | La carte vole jusqu'à Kokumbo, cercle de 5 km, zones Sentinel-2 en magenta |
| 1:05 | Le comparateur s'ouvre | 2018-2019 contre 2025-2026, curseur de balayage, puis onglet « Changements » |
| 1:40 | Lire le panneau de droite | 28,5 ha, 19 zones, première baisse confirmée, courbe NDVI réelle |
| 2:10 | « Créer une mission » puis « Ajouter au rapport » | Mission et rapport enregistrés sur le serveur |
| 2:30 | Ouvrir le rapport → « Imprimer ou enregistrer en PDF » | Rapport A4 avec mesures, images, zones, visas |

Phrase d'honnêteté à dire : « Le capteur est réel, la zone satellite est Kokumbo, un site d'orpaillage documenté, calculée sur de vraies images Sentinel-2. Les autres sites de la carte sont fictifs et étiquetés comme tels. »

## Caméra du site (optionnel, 20 s)

Après le rapport, ouvrir **Station ESP32** : dernière photo envoyée par l'ESP32-CAM, cases de l'état du boîtier, SMS reçus par la SIM. Cliquer « Prendre une photo » : la photo arrive quelques secondes plus tard (relais ou boîtier connecté). Message : « sur le terrain, le capteur donne l'alerte, le satellite confirme, la caméra montre ».

## Plans de secours, du plus réel au moins réel

1. **Boîtier sans HTTPS (ESP32-CAM, carte sans TLS)** : relais sur l'ordinateur, même Wi-Fi que l'ESP32.
   `CIREX_DEVICE_KEY=… python3 relay/esp32_relay.py --esp 192.168.4.1`
   Source « Boîtier · serveur » dans le panneau démo : rien ne change pour le jury.
2. **Capteur en panne** : rejeu de mesures enregistrées, chaîne serveur complète (alerte et Telegram réels, marqués « rejeu »).
   `CIREX_DEVICE_KEY=… python3 relay/replay.py`
3. **Pas d'Internet du tout** : panneau démo → source **Simulation**, touche **D**. Le badge affiche « Simulation » ; Telegram ne part pas. Les fonds de carte ne chargent pas sans réseau : passer la vidéo.
4. **Vidéo** : enregistrer l'écran pendant une démo réussie (plan 1 ou 2), 3 min, avec le téléphone visible. Outil : OBS ou l'enregistreur intégré (Win + Alt + R, Cmd + Maj + 5).

## Après chaque passage

**R** dans le panneau démo : clôture l'alerte ouverte de PH-CI-003 pour que la suivante puisse se déclencher (une seule alerte ouverte par capteur).
