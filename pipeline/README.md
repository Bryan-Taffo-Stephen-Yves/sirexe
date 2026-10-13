# Pipeline NDVI · Sentinel-2 L2A

`ndvi_pipeline.py` lit les images Sentinel-2 L2A directement dans le bucket public AWS `sentinel-cogs` (aucun compte nécessaire), masque les nuages avec la bande SCL, calcule une médiane « avant » et une médiane « après », détecte les pertes de végétation et écrit ce que lit l'écran :

| Fichier | Contenu |
|---|---|
| `summary.json` | périodes, dates retenues et écartées, surface totale, nombre de zones, `premiere_detection`, `signal_moyen`, emprise des images |
| `ndvi_series.json` | NDVI moyen par date sans nuages : zones de changement et végétation stable de référence |
| `changes.geojson` | un polygone par zone : `surface_ha`, `signal`, `type`, `premiere_detection`, `ndvi_avant`, `ndvi_apres` |
| `avant.jpg`, `apres.jpg`, `ndvi_*.png`, `changements.png` | images du comparateur (EPSG:4326, emprise dans `summary.json`) |

`signal` = baisse moyenne du NDVI de la zone (0 à 1). C'est une intensité, **pas une probabilité** : ne jamais l'afficher comme une « confiance ».

`premiere_detection` = première date, après la période « avant », où le NDVI de la zone passe sous le milieu entre ses valeurs avant et après, confirmée par les deux observations sans nuages suivantes.

## Lancer

```bash
pip install -r requirements.txt

# test hors ligne (synthetic: true)
python ndvi_pipeline.py --synthetic --out ../web/data/out_synthetic

# Kokumbo (≈ 5 min, 12 téléchargements en parallèle)
python ndvi_pipeline.py --lat 6.4189 --lon -5.1386 --radius 5000 \
  --avant 2018-11-01:2019-03-31 --apres 2025-11-01:2026-03-31 \
  --serie 2018-11-01:2026-10-13 --label Kokumbo --out ../web/data/kokumbo
```

Fonctionne aussi dans Google Colab. Derrière un proxy d'entreprise : `export CURL_CA_BUNDLE=/chemin/ca.crt`.

## Choix et réglages

- Fenêtres en **saison sèche** (novembre à mars) : beaucoup plus de dates sans nuages. Résultat sur Kokumbo : 24 dates retenues sur 55 avant, 13 sur 55 après.
- Une date est écartée si moins de 70 % du disque de 5 km est clair (`--min-clear`), conformément au CDC (plus de 30 % de nuages).
- Zone retenue : NDVI ≥ 0,55 avant, ≤ 0,35 après, baisse ≥ 0,25, surface ≥ 0,5 ha (`--min-ha`), après ouverture morphologique 3 × 3.
- Correction de réflectance : sur ce bucket, les images à partir de la ligne de base 04.00 ont déjà l'offset −0,1 retiré des pixels (`earthsearch:boa_offset_applied`). Le script en tient compte : sans cela, le NDVI récent sature.
- Une tuile MGRS seulement (celle du point). Un site à cheval sur deux tuiles demandera une mosaïque.

## Résultat Kokumbo (13 oct. 2026)

19 zones, 28,5 ha passés de végétation à sol nu entre nov. 2018–mars 2019 et nov. 2025–mars 2026, baisse moyenne du NDVI 0,48, première baisse confirmée en décembre 2019. Les zones entourent la grande fosse visible au centre de l'image.
