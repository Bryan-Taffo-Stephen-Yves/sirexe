# Sirexe · système de design

Interface : `web/app.html` + `web/app/app.css` + `web/app/app.js` (HTML/CSS/JS sans compilation).
Références imposées : tableau de bord « Gotrips » (police, mise en page, nav en pilules, tuiles noires et or, coin découpé avec bouton flèche) et rigueur Apple (matières translucides, typographie réglée par taille, mouvements sans rebond, feuilles glissantes sur mobile).

## Typographie
- Urbanist (variable, auto-hébergée dans `web/app/fonts/`, licence OFL). Une seule famille ; chiffres en `tabular-nums` pour les données.
- Titre de page 40 px / 600 / -0,035 em · titre de carte 19 px / 700 / -0,02 em · valeur de tuile 38 px / 700 / -0,04 em · texte 15 px / 500 · légendes 13 px.
- Interlettrage négatif seulement au-dessus de 17 px.

## Couleurs (`:root` dans app.css)
- Fond `#F3F2EC` avec halo or en haut ; surfaces blanches ; encre `#17171A`, secondaires `#4E4F55` / `#66676E`.
- Or `#F6CE3E` (action principale, tuile du capteur, repères) ; noir `#1B1B1F` (tuiles, navigation active, boutons).
- États réservés, toujours avec un libellé : ok `#1E9A5A`, vigilance `#D99A00`, orange `#E2732C`, critique `#E0442F`, info `#2B7FA8`, neutre.
- Zones Sentinel-2 sur la carte : magenta `#D946A8`. Séries NDVI : zones `#B07A0C` (trait plein), référence `#2F8A5B` (pointillé) ; palette validée (lisible en daltonisme grâce aux étiquettes directes et au pointillé).

## Formes
- Cartes 24 px, tuiles 24 px, contrôles internes 12 à 16 px, boutons et puces en pilule.
- Signature : coin supérieur droit découpé (masque radial) portant un bouton flèche rond de 40 px qui ouvre la vue détaillée.
- Ombres douces teintées, jamais de halo coloré.

## Composants
Navigation en pilules (desktop) · barre d'onglets flottante (≤ 1040 px) · tuiles indicateurs · listes à icône · tableaux à en-tête teinté qui deviennent des fiches sur mobile · contrôle segmenté · interrupteurs · puces d'état · bannière d'alerte · tiroir / feuille (panneau démo, « Plus ») glissable avec projection de vitesse · toasts noirs.

## Mouvement
Courbe `cubic-bezier(.22, 1, .36, 1)` (sortie douce, sans rebond), 150 à 500 ms ; une seule transition d'entrée de vue. `prefers-reduced-motion`, `prefers-reduced-transparency` et `prefers-contrast` respectés.

## Règle de contenu
Aucun chiffre inventé : chaque valeur vient du pipeline, du capteur ou du serveur, sinon elle porte « fictif », « simulation » ou « test ».
