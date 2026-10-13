# CAHIER DES CHARGES — v1.0

## Système de Détection d'Orpaillage Clandestin

**Concours :** SIREXE Hackathon 2026 — Prix Liberté
**Statut :** sélectionné parmi les 10 meilleurs projets, en route vers la présélection des finalistes
**Porteur :** BRENT GROUP
**Version :** 1.0 — 5 octobre 2026 (remplace les v0.1 et v0.2)

---

## 0. Ce qui a changé depuis la v0.1

| Sujet | v0.1 | v0.2 |
|---|---|---|
| Capteur | pH seul | Multi-paramètres : turbidité + pH + conductivité (TDS) |
| Communication capteur | LoRaWAN | WiFi pour la démo, GSM pour le terrain (LoRaWAN en phase 2) |
| IA satellite | Modèle U-Net à entraîner | Détection de changement par indices spectraux (NDVI, indice de turbidité) — le deep learning passe en phase 2 |
| Carte | Carte 2D plate | Globe 3D CesiumJS + fond satellite haute résolution Esri (repris du projet open source God's Eye View) |
| Couche feux | Absente | Feux actifs NASA FIRMS (défrichement des sites) |
| Circuit terrain | Absent | Alerte → mission agent → vérification photo GPS → rapport |
| Positionnement | Lutte anti-orpaillage | Lutte anti-orpaillage + protection de la ressource en eau |
| Modèle économique | Absent | Section 9 ajoutée |
| Fonctions retirées | — | OTA firmware, LoRaWAN, entraînement IA maison avant la finale |
| Matériel | Non chiffré | Liste arrêtée, budget démo ~53 000 à 55 000 FCFA (section 6 bis) |
| Méthode de travail | Non définie | Interface générée par Claude Design, développement avec Claude Code (section 12 bis) |

**Pourquoi le capteur change :** le mercure utilisé par les orpailleurs ne fait pas varier le pH de façon fiable. Ce qui trahit un site d'orpaillage en aval, c'est d'abord la turbidité (eau rendue boueuse par le lavage du minerai), puis la conductivité et le pH. Un jury avec des experts miniers relèvera ce point : le capteur multi-paramètres rend le projet scientifiquement solide.

---

## 1. Contexte et problématique

L'orpaillage clandestin en Côte d'Ivoire cause une pollution sévère des cours d'eau (mercure, cyanure, turbidité), une déforestation rapide, un manque à gagner fiscal pour l'État et des risques sanitaires pour les populations riveraines, y compris sur les points de captage d'eau potable.

La détection reste aujourd'hui manuelle (patrouilles, dénonciations), lente et coûteuse. Les autorités manquent d'un outil qui signale un site tôt, le localise précisément et organise l'intervention.

**Notre réponse :** une infrastructure de surveillance qui combine des capteurs dans l'eau (le signal), l'imagerie satellite (la confirmation) et un circuit d'intervention terrain (l'action).

---

## 2. Objectifs

**Objectif général :** livrer un système opérationnel qui détecte un site d'orpaillage clandestin à partir d'une anomalie de l'eau, le confirme par satellite et déclenche une intervention traçable.

| Code | Objectif spécifique | Indicateur de réussite |
|---|---|---|
| OS1 | Capteur multi-paramètres connecté | Mesures réelles visibles sur la plateforme en moins de 15 s |
| OS2 | Confirmation satellite par détection de changement | Paire d'images avant/après Sentinel-2 réelle avec zones de changement surlignées |
| OS3 | Plateforme de surveillance unifiée | Globe 3D, capteurs, alertes, satellite et feux sur un même écran |
| OS4 | Circuit d'intervention terrain | Une alerte peut être assignée, vérifiée avec photo GPS et clôturée par un rapport PDF |
| OS5 | Démonstration live reproductible | 3 démos consécutives sans intervention technique |

---

## 3. Architecture de la solution

### 3.1 Les quatre briques

**Brique 1 — Capteur eau multi-paramètres (le signal)**
ESP32 + sonde de turbidité + sonde pH + sonde de conductivité (TDS) + sonde de température (compensation). Mesure toutes les 15 minutes sur le terrain, toutes les 2 secondes en mode démo. Calcul d'un **indice de suspicion** (0 à 100) à partir des écarts aux valeurs de référence du cours d'eau.

**Brique 2 — Confirmation satellite (la preuve)**
Imagerie Sentinel-2 (gratuite, 10 m, revisite tous les 5 jours) sur un rayon de 5 km autour du capteur en alerte. Comparaison automatique d'une image récente avec une image de référence :

- chute de NDVI → végétation détruite (défrichement, sol nu) ;

- hausse de l'indice de turbidité sur les plans d'eau → bassins de lavage, rivière boueuse.

Les zones de changement sont surlignées sur la carte avec une surface en hectares et un score de confiance.

**Brique 3 — Plateforme de surveillance (la vue d'ensemble)**
Globe 3D avec fond satellite haute résolution, capteurs, alertes, zones de changement Sentinel-2 et feux actifs NASA FIRMS. Fiche détaillée par alerte, historique des mesures, export PDF.

**Brique 4 — Circuit terrain (l'action)**
Assignation d'une alerte à un agent, application mobile de vérification (photo géolocalisée, constat, mode hors ligne), clôture et rapport signé à destination des autorités.

### 3.2 Flux de bout en bout

1. Le capteur envoie ses mesures (WiFi en démo, GSM sur le terrain).
2. Le backend calcule l'indice de suspicion ; au-dessus du seuil, une alerte est créée.
3. L'alerte déclenche la récupération des images Sentinel-2 de la zone et le calcul de changement.
4. La plateforme notifie en temps réel (dashboard + notification push), le globe vole jusqu'au site.
5. Un superviseur assigne une mission à un agent terrain.
6. L'agent vérifie, prend une photo géolocalisée, clôture ; un rapport PDF est généré.

---

## 4. Intégration de God's Eye View — décision

**Projet étudié :** github.com/bilawalsidhu/gods-eye-view (licence MIT, vanilla JavaScript + CesiumJS + Vite).

**Ce que le projet n'est pas :** il ne fournit pas d'images satellite du sol en temps réel. Son fond de carte est une mosaïque Esri World Imagery (images de qualité mais datant de plusieurs mois). Le « temps réel » concerne les avions, navires, positions des satellites en orbite, séismes, feux et météo. Ses auteurs le présentent comme un outil d'exploration, pas un service de production, et déconseillent tout usage opérationnel.

**Décision :** on ne forke pas l'application entière. On reprend ses briques utiles :

| Repris de God's Eye View | Usage chez nous |
|---|---|
| Globe 3D CesiumJS | Vue principale de la plateforme, effet « vol vers le site » à chaque alerte |
| Fond Esri World Imagery (sans clé) | Fond haute résolution pour l'inspection visuelle des sites |
| Couche feux actifs NASA FIRMS (clé gratuite) | Indice complémentaire de défrichement |
| Logique de superposition avant/après | Comparaison des images Sentinel-2 |
| Scene director (enregistrement de visites de caméra) | Tournage de la vidéo de 5 minutes pour la finale |

**Ce qu'on garde de notre côté :** Sentinel-2 reste la source des images datées et récentes, indispensable pour la détection de changement. Le style visuel « HUD militaire » n'est pas repris : le jury est un ministère, la plateforme doit avoir l'allure d'un outil institutionnel.

**Points de vigilance :**

- le jeton Cesium ion gratuit est réservé à l'usage personnel non commercial : suffisant pour le concours, à renégocier en cas de déploiement commercial (alternative : rester sur le fond Esri sans jeton) ;

- les conditions d'utilisation Esri et Sentinel-2 doivent être citées dans la plateforme.

---

## 5. Exigences fonctionnelles

Priorité **P** = indispensable pour la présélection · **F** = pour la finale du 21 novembre · **2** = phase 2 après concours.

### 5.1 Capteur et firmware

| Code | Exigence | Prio |
|---|---|---|
| CAP-01 | Lire turbidité, pH, conductivité et température | P |
| CAP-02 | Envoyer les mesures horodatées avec l'identifiant du capteur | P |
| CAP-03 | Mode démo à 2 secondes, mode terrain à 15 minutes | P |
| CAP-04 | Calibration documentée (pH 4/7/10, turbidité eau claire) | P |
| CAP-05 | Stockage local et renvoi en cas de coupure réseau | F |
| CAP-06 | Envoi par GSM | F |
| CAP-07 | Boîtier étanche et alimentation solaire | 2 |

### 5.2 Backend

| Code | Exigence | Prio |
|---|---|---|
| API-01 | Recevoir les mesures capteurs | P |
| API-02 | Calculer l'indice de suspicion et créer une alerte au-dessus du seuil | P |
| API-03 | Diffuser les mesures et alertes en temps réel au dashboard | P |
| API-04 | Gérer les capteurs (position, statut, valeurs de référence) | P |
| API-05 | Comptes et rôles : administrateur, superviseur, agent terrain | F |
| API-06 | Gérer les missions (assignation, statut, clôture) | F |
| API-07 | Générer le rapport PDF d'intervention | F |

### 5.3 Satellite

| Code | Exigence | Prio |
|---|---|---|
| SAT-01 | Récupérer une image Sentinel-2 récente et une image de référence sur la zone d'alerte | P |
| SAT-02 | Écarter les images trop nuageuses (plus de 30 %) | P |
| SAT-03 | Calculer les zones de changement NDVI et turbidité, avec surface en hectares | P |
| SAT-04 | Afficher les feux actifs NASA FIRMS | F |
| SAT-05 | Surveillance programmée des zones à risque sans attendre une alerte capteur | F |
| SAT-06 | Modèle de segmentation entraîné sur sites d'orpaillage annotés | 2 |

### 5.4 Plateforme web

| Code | Exigence | Prio |
|---|---|---|
| WEB-01 | Globe 3D avec fond satellite Esri et capteurs positionnés | P |
| WEB-02 | Panneau des mesures en direct par capteur | P |
| WEB-03 | Liste des alertes ; le globe vole vers le site à l'ouverture d'une alerte | P |
| WEB-04 | Comparateur d'images avant/après avec zones de changement | P |
| WEB-05 | Notification push à la création d'une alerte | F |
| WEB-06 | Écran de suivi des missions | F |
| WEB-07 | Couche feux actifs | F |

### 5.5 Application agent terrain

| Code | Exigence | Prio |
|---|---|---|
| TER-01 | Recevoir une mission avec itinéraire vers le site | F |
| TER-02 | Prendre une photo géolocalisée et saisir un constat | F |
| TER-03 | Fonctionner hors ligne et synchroniser au retour du réseau | F |
| TER-04 | Signalement citoyen anonyme par WhatsApp ou USSD | 2 (F si le temps le permet) |

---

## 6. Stack technique

| Domaine | Choix | Raison |
|---|---|---|
| Microcontrôleur | ESP32 | Bas coût, WiFi intégré, très documenté |
| Sondes | Turbidité, pH, TDS (gamme DFRobot ou équivalent) + DS18B20 température | Compatibles ESP32, disponibles, peu chères |
| Réseau capteur | WiFi (démo), module GSM SIM7600 ou A7670 (terrain) | Couverture mobile disponible dans les zones ciblées |
| Transport des données | HTTPS vers le backend (MQTT en phase 2) | Le plus simple à fiabiliser d'ici la présélection |
| Base de données et temps réel | Supabase (PostgreSQL + PostGIS + Realtime + Auth + Storage) | Un seul service pour données, temps réel, comptes et photos |
| Frontend | Next.js + Tailwind | Équipe déjà à l'aise, PWA possible |
| Globe 3D | CesiumJS (via Resium ou intégration directe) | Repris de God's Eye View |
| Traitement satellite | Python (FastAPI) + Sentinel Hub ou Copernicus Data Space + rasterio | Accès Sentinel-2 et calcul d'indices |
| Feux | API NASA FIRMS | Clé gratuite |
| Rapports | Génération PDF côté serveur | Remise aux autorités |
| Hébergement | Vercel (web) + Railway ou Render (service Python) + Supabase | Offres gratuites suffisantes pour le concours |
| Code | GitHub, une branche par fonctionnalité | Travail en parallèle |

---

## 6 bis. Matériel de la démo

| Provenance | Composant | Statut | Prix |
|---|---|---|---|
| Maroc | Capteur de turbidité analogique 5 V (type DFRobot SEN0189) | À commander | 300 DH (~18 000 FCFA) |
| Maroc | Sonde pH avec carte de lecture (type PH-4502C ou Gravity) | À commander | 350 DH (~21 000 FCFA) |
| Maroc | Capteur TDS / conductivité (type Gravity) | À commander | 180 DH (~11 000 FCFA) |
| Côte d'Ivoire | ESP32, breadboard, fils Dupont, fer à souder, gaine, bocaux, support châssis | Acheté | — |
| Côte d'Ivoire | Capteur de température étanche DS18B20 | À acheter | à vérifier |
| Côte d'Ivoire | Résistances 10 kΩ et 20 kΩ | À acheter | à vérifier |
| Côte d'Ivoire ou Maroc | Solutions étalons pH 4 / 7 / 10 | À acheter | à vérifier |
| Côte d'Ivoire | Batterie externe USB | Disponible | — |

**Pour le terrain (après la présélection) :** SIM800L (5 500 FCFA), TP4056 (500 FCFA), condensateur 1000 µF ; panneau solaire 5-6 W, batterie et LM2596 déjà achetés.

**Budget démo :** ~50 000 FCFA (Maroc) + ~3 000 à 5 000 FCFA (Côte d'Ivoire).

**Contraintes de câblage et de mesure :**

- Le turbidimètre et la carte pH sortent jusqu'à 5 V, l'ESP32 accepte 3,3 V au maximum : pont diviseur obligatoire, broches ADC1 uniquement.
- Le TDS perturbe le pH dans la même eau : mesures à tour de rôle, TDS coupé pendant la lecture du pH.
- Compensation en température du pH et du TDS avec le DS18B20.
- SIM800L : 2G uniquement, alimentation directe batterie ou LM2596 vers 4 V avec condensateur 1000 µF, jamais sur le 3,3 V de l'ESP32.
- Calibration documentée avant chaque démo (pH 4/7/10, turbidité en eau claire).
- Risque principal : le délai de livraison du Maroc. Obtenir une date ferme et prévoir un mode rejeu de mesures enregistrées.

---

## 7. Démonstration devant le jury

**Matériel :** 2 bocaux, le boîtier capteur, un peu de terre argileuse (et du vinaigre pour le pH), un téléphone pour la notification, un écran avec la plateforme, un routeur 4G de secours.

**Scénario (moins de 90 secondes) :**
1. Bocal A, eau claire : la plateforme affiche des valeurs normales, indice de suspicion bas.
2. On verse la terre (et le vinaigre) dans le bocal B devant le jury, on y plonge la sonde : l'eau se trouble à vue d'œil.
3. Turbidité et indice de suspicion montent en direct ; l'alerte se déclenche, le téléphone reçoit la notification.
4. Le globe vole depuis la vue Côte d'Ivoire jusqu'à la zone du capteur.
5. Le comparateur avant/après Sentinel-2 s'ouvre sur une zone d'orpaillage réelle documentée : la forêt détruite et les bassins apparaissent surlignés, avec la surface en hectares.
6. *(Finale)* Le superviseur assigne la mission ; un agent clôture avec une photo ; le rapport PDF sort.

**Critères d'acceptation :** alerte en moins de 15 secondes après immersion, aucun clic entre l'immersion et l'affichage de l'alerte, 3 démos consécutives réussies, plan de secours si le réseau tombe (rejouer des mesures enregistrées).

**Règle d'honnêteté :** dans la démo, le capteur est réel mais la zone satellite est une zone de référence préchargée. On le dit clairement au jury : c'est un point de crédibilité, pas une faiblesse.

---

## 8. Livrables

| Livrable | Échéance |
|---|---|
| Prototype physique + plateforme avec boucle réelle capteur → alerte → satellite | Passage en présélection |
| Support de présentation pour la présélection | Passage en présélection |
| Plateforme complète déployée (URL publique) | 14 novembre |
| Application agent terrain | 14 novembre |
| Présentation PowerPoint de la finale | 17 novembre |
| Vidéo de 5 minutes | 17 novembre |
| Documentation technique (README, architecture, API) | 17 novembre |

---

## 9. Modèle économique (à chiffrer précisément par l'équipe)

**Clients visés :**

- Ministère des Mines, du Pétrole et de l'Énergie et unités de lutte contre l'orpaillage illégal : plateforme de surveillance nationale.

- Ministère en charge des Eaux et Forêts et acteurs de l'eau potable : protection des cours d'eau et des points de captage.

- Sociétés minières titulaires de permis : suivi environnemental de conformité autour de leurs concessions.

**Revenus :** vente ou location des capteurs + abonnement annuel à la plateforme par zone surveillée + rapports sur demande.

**À chiffrer par l'équipe :** coût de fabrication d'un capteur, coût de déploiement d'une zone pilote (par exemple 10 capteurs sur un bassin versant), coût d'hébergement annuel, prix de l'abonnement.

---

## 10. Planning

| Période | Objectif |
|---|---|
| **5 → 7 oct.** | Sprint 0 (section 12). Commande des sondes |
| **8 oct. → passage présélection** | Boucle réelle capteur → plateforme, comparateur Sentinel-2 sur zone de référence, répétitions de la démo |
| **Présélection (entre le 5 et le 16 oct.)** | Démo devant le jury — date exacte à confirmer |
| **17 oct. → 14 nov.** | Circuit terrain, application agent, GSM, feux FIRMS, notifications, déploiement public |
| **15 → 17 nov.** | Gel du code, PowerPoint, vidéo de 5 minutes |
| **19 → 20 nov.** | Bootcamp finalistes avec les coachs |
| **21 nov.** | Grande finale |
| **22 nov.** | Remise des prix |

---

## 11. Rôles

| Rôle | Responsabilité | Titulaire |
|---|---|---|
| Lead produit | Vision, CDC, coordination, pitch | Stephen Affo |
| Capteur | Montage, firmware, calibration, protocole bocaux | Équipe capteurs |
| Backend et données | Supabase, réception des mesures, indice de suspicion, alertes, missions | À nommer |
| Satellite | Service Python Sentinel-2, indices, comparateur, FIRMS | À nommer |
| Frontend | Globe CesiumJS, dashboard, application agent | À nommer |
| Pitch et vidéo | Support, vidéo, modèle économique | À nommer |

---

## 12. Sprint 0 — à lancer dès maintenant

**Capteur**

- Commander turbidité, pH, TDS, température si pas encore en main (délai de livraison = risque numéro un).

- Brancher la première sonde disponible sur l'ESP32 et afficher la valeur dans le moniteur série.

**Backend**

- Créer le projet Supabase : tables `sensors`, `readings`, `alerts` (+ `missions` plus tard), activer PostGIS et Realtime.

- Ouvrir un point d'entrée qui reçoit une mesure et l'écrit en base.

**Satellite**

- Créer un compte Copernicus Data Space (gratuit).

- Choisir une zone d'orpaillage documentée dans la presse ivoirienne et récupérer manuellement une image avant et une image après. C'est notre zone de référence pour la démo.

**Frontend**

- Cloner God's Eye View, le lancer en local pour étudier l'intégration CesiumJS et le fond Esri.

- Créer le projet Next.js avec un globe CesiumJS centré sur la Côte d'Ivoire et 6 capteurs factices.

**Lead produit**

- Obtenir la date exacte du passage en présélection.

- Nommer les titulaires de la section 11.

- Créer le dépôt GitHub et y inviter l'équipe.

---

## 12 bis. Méthode de travail

1. **Cahier des charges (ce document)** : référence commune de l'équipe.
2. **Claude Design** : génère l'interface de la plateforme (dashboard, globe, alertes, comparateur satellite, application agent) à partir d'un prompt rédigé avec une inspiration visuelle.
3. **Claude Code** : développe l'application à partir de l'interface Claude Design. Le fichier `CLAUDE.md` à la racine du dépôt lui donne tout le contexte (décisions, stack, modèle de données, contrat capteur, ordre de construction).
4. **Équipe capteurs** : firmware ESP32 en parallèle, branché sur le contrat `POST /api/readings`.

---

## 13. Questions ouvertes

1. Date et format exact du passage en présélection (durée, matériel autorisé, connexion disponible).
2. Quelle zone d'orpaillage documentée retenir comme zone de référence.
3. Date de livraison ferme des capteurs commandés au Maroc.
4. Contact possible avec le ministère ou une unité de terrain pour valider le circuit d'intervention avant la finale.

---

*Fin du document — CDC v1.0*
