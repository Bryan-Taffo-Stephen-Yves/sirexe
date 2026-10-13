# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Délégué : site statique HTML/CSS/JS (modules ES, aucune compilation), hébergé tel quel (Vercel, Netlify ou GitHub Pages). Choisi parce que c'est l'option la plus robuste pour la démo du concours : aucune étape de build qui peut casser, et réutilisation directe du moteur de carte (`web/orp-carto.js`), de la couche données (`web/cirex-data.js`) et de Supabase.

## Users

- Superviseur du centre de surveillance (Stephen Affo dans la démo) : suit les capteurs, reçoit les alertes, confirme par satellite, crée missions et rapports. Poste fixe, grand écran.
- Agents de terrain : consultent alertes, missions et carte sur téléphone, souvent en extérieur.
- Jury du SIREXE Hackathon 2026 : voit la démo de 3 minutes, sur grand écran et sur téléphone.

## Product Purpose

Sirexe détecte les sites d'orpaillage clandestin en Côte d'Ivoire : capteur d'eau (turbidité, conductivité, pH, température) → alerte → confirmation Sentinel-2 (perte de végétation) → mission terrain → rapport PDF. Succès : le jury voit une chaîne réelle de bout en bout, sans chiffre inventé.

## Positioning

Une alerte née d'une mesure réelle dans l'eau, confirmée par un calcul NDVI réel sur Sentinel-2, transformée en mission et en rapport en une seule session.

## Operating Context

Concours SIREXE Hackathon 2026 (Prix Liberté), porteur BRENT GROUP. Démo pilotée au clavier (D : séquence, Maj+D : panneau démo). Capteur PH-CI-003 (boîtier ESP32) via Supabase ; site de référence ORP-0142 Kokumbo.

## Capabilities and Constraints

Voir `CLAUDE.md` et `README.md`. Règles : aucun chiffre affiché inventé (tout est calculé ou étiqueté « fictif », « simulation », « test ») ; « Sirexe · Prototype », aucune affiliation officielle ; cadastre et statuts légaux fictifs ; pas de « confiance » en % ; aucun secret dans le navigateur.

## Brand Commitments

Nom : Sirexe. Références visuelles imposées par l'utilisateur : tableau de bord « Gotrips » (police, mise en page, barre de navigation en pilules, tuiles noires et jaune, coins découpés avec bouton flèche rond), « Restroq » en inspiration secondaire. Le design précédent est jugé « trop IA » et doit être remplacé.

## Evidence on Hand

Données réelles : `web/data/kokumbo/` (19 zones, 28,5 ha, série NDVI 2018–2026). Données de test : `web/data/out_synthetic/`. Tout le reste (246 sites, 5 capteurs, agents, feux, cadastre) est fictif et doit rester étiqueté.

## Product Principles

1. La vérité d'abord : chaque nombre dit d'où il vient.
2. L'alerte est le moment fort : elle doit se voir de loin et mener à l'action en un geste.
3. Même app sur ordinateur et téléphone : rien d'essentiel caché sur mobile.
4. La démo ne doit jamais casser : chaque source a un état d'attente et un plan B.

## Accessibility & Inclusion

Interface en français, dates françaises, fuseau GMT. Contraste AA, navigation au clavier, cibles tactiles ≥ 44 px, `prefers-reduced-motion` respecté. Usage en extérieur sur téléphone : contraste élevé.
