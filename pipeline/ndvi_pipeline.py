#!/usr/bin/env python3
"""Cirex — NDVI change detection on Sentinel-2 L2A around a point.

Reads Sentinel-2 L2A cloud-optimised GeoTIFFs straight from the public AWS
Open Data bucket (s3://sentinel-cogs, no account needed), masks clouds with the
SCL band, builds a "before" and an "after" median composite, detects vegetation
loss and writes what the web screen reads:

  summary.json        overall figures (periods, dates used, surfaces, first detection)
  ndvi_series.json    mean NDVI per usable date, inside changed zones vs stable forest
  changes.geojson     one polygon per change zone (surface, signal, type, first detection)
  avant.jpg / apres.jpg              true-colour composites (EPSG:4326, bounds in summary)
  ndvi_avant.png / ndvi_apres.png    colourised NDVI composites
  changements.png                    change mask (transparent background)

Nothing here is a trained model: it is spectral-index change detection.
`signal` is the mean NDVI drop of a zone (0..1), NOT a probability.

Usage:
  python ndvi_pipeline.py --synthetic --out out_synthetic
  python ndvi_pipeline.py --lat 6.4189 --lon -5.1386 --radius 5000 \
      --avant 2018-11-01:2019-03-31 --apres 2025-11-01:2026-03-31 \
      --serie 2017-11-01:2026-10-13 --out ../web/data/kokumbo
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

BUCKET = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
PREFIX = "sentinel-s2-l2a-cogs"
# SCL classes kept as clear observations: 4 vegetation, 5 bare soil, 6 water
SCL_CLEAR = (4, 5, 6)

GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    GDAL_HTTP_MULTIRANGE="YES",
    GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
    GDAL_HTTP_MAX_RETRY="4",
    GDAL_HTTP_RETRY_DELAY="1",
    VSI_CACHE="TRUE",
)


# --------------------------------------------------------------------------- #
# Parameters
# --------------------------------------------------------------------------- #
@dataclass
class Params:
    lat: float
    lon: float
    radius: float = 5000.0
    avant: tuple[str, str] = ("2018-11-01", "2019-03-31")
    apres: tuple[str, str] = ("2025-11-01", "2026-03-31")
    serie: tuple[str, str] = ("2017-11-01", "2026-10-13")
    max_scene_cloud: float = 80.0   # tile-level pre-filter (eo:cloud_cover)
    min_clear: float = 0.70         # AOI-level: reject a date if < 70 % clear (CDC: > 30 % clouds)
    ndvi_veg: float = 0.55          # "before" must be vegetated
    ndvi_bare: float = 0.35         # "after" must be sparse / bare / water
    drop: float = 0.25              # minimum NDVI drop
    min_ha: float = 0.5             # smallest zone kept
    workers: int = 8
    label: str = ""
    extra: dict = field(default_factory=dict)


def parse_period(s: str) -> tuple[str, str]:
    a, b = s.split(":")
    dt.date.fromisoformat(a), dt.date.fromisoformat(b)
    return a, b


# --------------------------------------------------------------------------- #
# Scene discovery (S3 listing — no STAC API needed)
# --------------------------------------------------------------------------- #
def http_get(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def list_prefixes(prefix: str) -> list[str]:
    out, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&delimiter=/&prefix={prefix}"
        if token:
            url += "&continuation-token=" + urllib.request.quote(token)
        xml = http_get(url).decode()
        out += re.findall(r"<Prefix>([^<]+)</Prefix>", xml)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
        if not m:
            break
        token = m.group(1)
    return [p for p in out if p != prefix]


def mgrs_tile(lat: float, lon: float) -> tuple[str, str, str]:
    import mgrs  # pip install mgrs
    code = mgrs.MGRS().toMGRS(lat, lon, MGRSPrecision=0)
    return code[:2].lstrip("0"), code[2], code[3:5]


def months(a: str, b: str):
    d0, d1 = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
    y, m = d0.year, d0.month
    while (y, m) <= (d1.year, d1.month):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


@dataclass
class Scene:
    id: str
    url: str           # folder URL, ends with "/"
    date: dt.date
    cloud: float
    offset: float      # reflectance = DN * 1e-4 + offset


def scene_meta(folder: str) -> Scene | None:
    sid = folder.rstrip("/").split("/")[-1]
    try:
        meta = json.loads(http_get(f"{BUCKET}/{folder}{sid}.json"))
    except Exception:
        return None
    p = meta["properties"]
    # Since processing baseline 04.00 the L2A DN carry a +1000 offset. On this bucket,
    # "earthsearch:boa_offset_applied" means it has already been removed from the pixels
    # (forest red DN ≈ 500 ⇒ 0.05), even though raster:bands still advertises offset -0.1.
    baseline = float(p.get("s2:processing_baseline", "0") or 0)
    if p.get("earthsearch:boa_offset_applied"):
        offset = 0.0
    else:
        offset = -0.1 if baseline >= 4.0 else 0.0
    return Scene(sid, f"{BUCKET}/{folder}", dt.date.fromisoformat(p["datetime"][:10]),
                 float(p.get("eo:cloud_cover", 100)), float(offset))


def discover(P: Params, start: str, end: str) -> list[Scene]:
    zone, band, sq = mgrs_tile(P.lat, P.lon)
    folders = []
    for y, m in months(start, end):
        folders += list_prefixes(f"{PREFIX}/{zone}/{band}/{sq}/{y}/{m}/")
    with cf.ThreadPoolExecutor(P.workers * 2) as ex:
        scenes = [s for s in ex.map(scene_meta, folders) if s]
    d0, d1 = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    scenes = [s for s in scenes if d0 <= s.date <= d1 and s.cloud <= P.max_scene_cloud]
    # one scene per date (several processings may exist): keep the lowest cloud cover
    best: dict[dt.date, Scene] = {}
    for s in scenes:
        if s.date not in best or s.cloud < best[s.date].cloud:
            best[s.date] = s
    return sorted(best.values(), key=lambda s: s.date)


# --------------------------------------------------------------------------- #
# Raster reading
# --------------------------------------------------------------------------- #
class AOI:
    def __init__(self, P: Params, crs):
        from rasterio.warp import transform
        from rasterio.transform import from_origin
        xs, ys = transform("EPSG:4326", crs, [P.lon], [P.lat])
        self.crs, self.x, self.y, self.r = crs, xs[0], ys[0], P.radius
        # snap to the 10 m grid (S2 tiles are aligned on x0 = 199980 / 300000 + k*10)
        self.left = round((self.x - self.r) / 10) * 10
        self.top = round((self.y + self.r) / 10) * 10
        self.n = int(round(2 * self.r / 10))
        self.bounds = (self.left, self.top - self.n * 10, self.left + self.n * 10, self.top)
        self.transform = from_origin(self.left, self.top, 10, 10)
        yy, xx = np.mgrid[0:self.n, 0:self.n]
        cx, cy = (xx + 0.5) * 10 + self.left - self.x, self.top - (yy + 0.5) * 10 - self.y
        self.disk = (cx ** 2 + cy ** 2) <= self.r ** 2


def read_band(scene: Scene, band: str, aoi: AOI, resampling="nearest") -> np.ndarray:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(scene.url + band + ".tif") as src:
            win = from_bounds(*aoi.bounds, transform=src.transform)
            return src.read(1, window=win, out_shape=(aoi.n, aoi.n), boundless=True, fill_value=0,
                            resampling=getattr(Resampling, resampling))


def refl(dn: np.ndarray, offset: float) -> np.ndarray:
    r = dn.astype("float32") * 1e-4 + offset
    r[dn == 0] = np.nan
    return r


def ndvi_of(b4: np.ndarray, b8: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore", divide="ignore"):
        n = (b8 - b4) / (b8 + b4)
    n[~((b4 > 0) & (b8 > 0))] = np.nan  # dark / invalid pixels make the ratio explode
    return np.clip(n, -1, 1)


def clear_mask(scene: Scene, aoi: AOI) -> np.ndarray:
    scl = read_band(scene, "SCL", aoi)
    return np.isin(scl, SCL_CLEAR)


# --------------------------------------------------------------------------- #
# Composites
# --------------------------------------------------------------------------- #
def composite(P: Params, scenes: list[Scene], aoi: AOI, log) -> dict:
    """Median composite of NDVI, RGB and MNDWI over the clear dates of a period."""
    used, rejected = [], []

    def one(s: Scene):
        try:
            clear = clear_mask(s, aoi)
            frac = float(clear[aoi.disk].mean())
            if frac < P.min_clear:
                return s, frac, None
            b = {k: refl(read_band(s, k, aoi), s.offset) for k in ("B02", "B03", "B04", "B08")}
            b["B11"] = refl(read_band(s, "B11", aoi, "bilinear"), s.offset)
            for k in b:
                b[k][~clear] = np.nan
            return s, frac, b
        except Exception as e:  # network hiccup: count as rejected, keep going
            log(f"  ! {s.id}: {e}")
            return s, 0.0, None

    stacks: dict[str, list] = {k: [] for k in ("B02", "B03", "B04", "B08", "B11")}
    with cf.ThreadPoolExecutor(P.workers) as ex:
        for s, frac, b in ex.map(one, scenes):
            if b is None:
                rejected.append({"date": s.date.isoformat(), "scene": s.id, "part_claire": round(frac, 2)})
                continue
            used.append({"date": s.date.isoformat(), "scene": s.id, "part_claire": round(frac, 2)})
            for k in stacks:
                stacks[k].append(b[k])
            log(f"  + {s.date} {s.id} clair {frac:.0%}")
    if not used:
        raise SystemExit("Aucune date exploitable sur la période : élargir la fenêtre ou --min-clear.")
    with np.errstate(all="ignore"):
        med = {k: np.nanmedian(np.stack(v), axis=0).astype("float32") for k, v in stacks.items()}
    med["NDVI"] = ndvi_of(med["B04"], med["B08"])
    with np.errstate(invalid="ignore", divide="ignore"):
        med["MNDWI"] = (med["B03"] - med["B11"]) / (med["B03"] + med["B11"])
        med["NDTI"] = (med["B04"] - med["B03"]) / (med["B04"] + med["B03"])
    return {"bands": med, "used": sorted(used, key=lambda d: d["date"]),
            "rejected": sorted(rejected, key=lambda d: d["date"])}


# --------------------------------------------------------------------------- #
# Change detection
# --------------------------------------------------------------------------- #
def detect(P: Params, aoi: AOI, A: dict, B: dict):
    from scipy import ndimage
    n0, n1 = A["NDVI"], B["NDVI"]
    ok = np.isfinite(n0) & np.isfinite(n1) & aoi.disk
    d = n1 - n0
    raw = ok & (n0 >= P.ndvi_veg) & (n1 <= P.ndvi_bare) & (d <= -P.drop)
    mask = ndimage.binary_opening(raw, structure=np.ones((3, 3)))
    lab, k = ndimage.label(mask, structure=np.ones((3, 3)))
    min_px = int(P.min_ha * 100)
    zones = []
    for i in range(1, k + 1):
        z = lab == i
        npx = int(z.sum())
        if npx < min_px:
            lab[z] = 0
            continue
        water = float(np.nanmean(B["MNDWI"][z]))
        zones.append({
            "label": i, "pixels": npx,
            "surface_ha": round(npx * 100 / 1e4, 2),
            "signal": round(float(np.clip(-np.nanmean(d[z]), 0, 1)), 2),
            "ndvi_avant": round(float(np.nanmean(n0[z])), 2),
            "ndvi_apres": round(float(np.nanmean(n1[z])), 2),
            "mndwi_apres": round(water, 2),
            "type": "Eau libre (bassin ou cours d'eau)" if water > 0 else "Sol mis à nu",
            "ndti_apres": round(float(np.nanmean(B["NDTI"][z])), 2) if water > 0 else None,
        })
    zones.sort(key=lambda z: -z["pixels"])
    stable = ok & (n0 >= 0.7) & (n1 >= 0.7)
    return lab, zones, stable, float(ok[aoi.disk].mean())


def polygons(aoi: AOI, lab: np.ndarray, zones: list[dict]):
    from rasterio.features import shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    feats = []
    for n, z in enumerate(zones, start=1):
        geoms = [shape(g) for g, v in shapes((lab == z["label"]).astype("uint8"), transform=aoi.transform) if v == 1]
        g = unary_union(geoms).simplify(7, preserve_topology=True)
        g84 = transform_geom(aoi.crs, "EPSG:4326", mapping(g), precision=6)
        props = {k: v for k, v in z.items() if k not in ("label", "pixels")}
        c = shape(g84).representative_point()
        props.update(id=f"Z{n}", n=n, centre=[round(c.y, 6), round(c.x, 6)])
        feats.append({"type": "Feature", "properties": props, "geometry": g84})
    return feats


# --------------------------------------------------------------------------- #
# Time series and first detection
# --------------------------------------------------------------------------- #
def series(P: Params, scenes: list[Scene], aoi: AOI, lab, zones, stable, log):
    masks = {z["label"]: lab == z["label"] for z in zones}
    union = lab > 0

    def one(s: Scene):
        try:
            clear = clear_mask(s, aoi)
            frac = float(clear[aoi.disk].mean())
            if frac < P.min_clear:
                return None
            nd = ndvi_of(refl(read_band(s, "B04", aoi), s.offset), refl(read_band(s, "B08", aoi), s.offset))
            nd[~clear] = np.nan
            mean = lambda m: (round(float(np.nanmean(nd[m])), 3) if np.isfinite(nd[m]).mean() > 0.5 else None)
            return {"date": s.date.isoformat(), "part_claire": round(frac, 2),
                    "ndvi_zones": mean(union) if union.any() else None,
                    "ndvi_reference": mean(stable) if stable.any() else None,
                    "par_zone": {str(k): mean(m) for k, m in masks.items()}}
        except Exception as e:
            log(f"  ! {s.id}: {e}")
            return None

    pts = []
    with cf.ThreadPoolExecutor(P.workers) as ex:
        for r in ex.map(one, scenes):
            if r:
                pts.append(r)
                log(f"  · {r['date']} zones {r['ndvi_zones']} ref {r['ndvi_reference']}")
    pts.sort(key=lambda r: r["date"])
    return pts


def first_detection(pts: list[dict], key, before: float, after: float, start_after: str | None = None) -> str | None:
    """First date where NDVI falls below the midpoint and the next 2 clear observations confirm it."""
    thr = (before + after) / 2
    vals = [(p["date"], key(p)) for p in pts if key(p) is not None and (not start_after or p["date"] >= start_after)]
    for i, (d, v) in enumerate(vals):
        nxt = [w for _, w in vals[i + 1:i + 3]]
        if v < thr and len(nxt) == 2 and all(w < thr for w in nxt):
            return d
    return None


# --------------------------------------------------------------------------- #
# Images
# --------------------------------------------------------------------------- #
NDVI_STOPS = [(-0.2, (140, 46, 5)), (0.1, (217, 94, 13)), (0.3, (252, 196, 79)),
              (0.5, (166, 217, 107)), (0.7, (26, 153, 80)), (0.9, (0, 69, 28))]


def to_wgs84(aoi: AOI, arr: np.ndarray, resampling="bilinear"):
    from rasterio.enums import Resampling
    from rasterio.warp import calculate_default_transform, reproject
    from rasterio.transform import array_bounds
    t, w, h = calculate_default_transform(aoi.crs, "EPSG:4326", aoi.n, aoi.n, *aoi.bounds)
    out = np.full((arr.shape[0], h, w), np.nan, dtype="float32")
    for i in range(arr.shape[0]):
        reproject(arr[i].astype("float32"), out[i], src_transform=aoi.transform, src_crs=aoi.crs,
                  dst_transform=t, dst_crs="EPSG:4326", src_nodata=np.nan, dst_nodata=np.nan,
                  resampling=getattr(Resampling, resampling))
    west, south, east, north = array_bounds(h, w, t)
    return out, [[round(south, 6), round(west, 6)], [round(north, 6), round(east, 6)]]


def save_images(out: Path, aoi: AOI, A: dict, B: dict, lab):
    from PIL import Image
    rgbA = np.stack([A["B04"], A["B03"], A["B02"]])
    rgbB = np.stack([B["B04"], B["B03"], B["B02"]])

    def rgb(img):
        # per-image stretch: the dry-season composites carry harmattan haze of varying strength
        v = img[np.isfinite(img)]
        lo, hi = np.percentile(v, 1), np.percentile(v, 99.5)
        x = np.clip((img - lo) / (hi - lo), 0, 1) ** (1 / 1.3)
        x = np.nan_to_num(x, nan=0.0)
        return (x * 255).astype("uint8").transpose(1, 2, 0)

    def ndvi_rgb(nd):
        x = np.zeros(nd.shape + (4,), dtype="uint8")
        xs = [s[0] for s in NDVI_STOPS]
        for c in range(3):
            x[..., c] = np.interp(np.nan_to_num(nd, nan=-1), xs, [s[1][c] for s in NDVI_STOPS]).astype("uint8")
        x[..., 3] = np.where(np.isfinite(nd), 255, 0)
        return x

    bounds = None
    for name, arr in (("avant", rgbA), ("apres", rgbB)):
        w, bounds = to_wgs84(aoi, arr)
        Image.fromarray(rgb(w)).save(out / f"{name}.jpg", quality=86, optimize=True)
    for name, nd in (("ndvi_avant", A["NDVI"]), ("ndvi_apres", B["NDVI"])):
        w, _ = to_wgs84(aoi, nd[None])
        # palette quantisée : ~300 ko au lieu de ~1,6 Mo, invisible à l'œil
        Image.fromarray(ndvi_rgb(w[0])).quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(out / f"{name}.png", optimize=True)
    m, _ = to_wgs84(aoi, (lab > 0).astype("float32")[None], "nearest")
    mk = np.zeros(m.shape[1:] + (4,), dtype="uint8")
    on = np.nan_to_num(m[0]) > 0.5
    mk[on] = (217, 70, 168, 215)
    Image.fromarray(mk).save(out / "changements.png", optimize=True)
    return bounds


# --------------------------------------------------------------------------- #
# Synthetic data (offline tests, flagged synthetic: true)
# --------------------------------------------------------------------------- #
def synthetic(P: Params, out: Path):
    rng = np.random.default_rng(7)
    from rasterio.crs import CRS
    aoi = AOI(P, CRS.from_epsg(32630))
    n = aoi.n
    base = 0.8 + rng.normal(0, 0.04, (n, n))
    yy, xx = np.mgrid[0:n, 0:n]
    blobs = [(0.42, 0.45, 60), (0.58, 0.62, 35), (0.35, 0.66, 22)]
    after = base.copy()
    for cy, cx, r in blobs:
        after[(yy - cy * n) ** 2 + (xx - cx * n) ** 2 < r ** 2] = 0.18 + rng.normal(0, 0.03)
    mk = lambda nd: {"NDVI": nd.astype("float32"), "B04": (0.05 + 0.2 * (1 - nd)).astype("float32"),
                     "B03": (0.06 + 0.12 * (1 - nd)).astype("float32"), "B02": (0.04 + 0.1 * (1 - nd)).astype("float32"),
                     "B08": (0.1 + 0.3 * nd).astype("float32"), "B11": (0.1 + 0.2 * (1 - nd)).astype("float32"),
                     "MNDWI": np.full((n, n), -0.3, "float32"), "NDTI": np.zeros((n, n), "float32")}
    A, B = mk(base), mk(after)
    lab, zones, stable, cov = detect(P, aoi, A, B)
    feats = polygons(aoi, lab, zones)
    dates = [dt.date(2019, 1, 1) + dt.timedelta(days=37 * i) for i in range(70)]
    pts = []
    for i, d in enumerate(dates):
        z = 0.78 if d < dt.date(2023, 3, 14) else 0.2 + 0.05 * rng.random()
        pts.append({"date": d.isoformat(), "part_claire": 0.9, "ndvi_zones": round(z, 3),
                    "ndvi_reference": round(0.8 + 0.02 * rng.normal(), 3),
                    "par_zone": {str(zz["label"]): round(z, 3) for zz in zones}})
    for f, z in zip(feats, zones):
        f["properties"]["premiere_detection"] = first_detection(pts, lambda p: p["par_zone"][str(z["label"])], z["ndvi_avant"], z["ndvi_apres"])
    bounds = save_images(out, aoi, A, B, lab)
    meta = dict(avant={"periode": ["2019-01-01", "2019-03-31"], "dates": [], "rejetees": []},
                apres={"periode": ["2025-11-01", "2026-03-31"], "dates": [], "rejetees": []})
    write_outputs(P, out, feats, pts, meta, bounds, cov, synthetic_flag=True)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #
def write_outputs(P: Params, out: Path, feats, pts, meta, bounds, cov, synthetic_flag=False):
    for f in feats:
        f["properties"]["synthetic"] = synthetic_flag
    surf = round(sum(f["properties"]["surface_ha"] for f in feats), 2)
    dets = sorted(f["properties"]["premiere_detection"] for f in feats
                  if f["properties"].get("premiere_detection") and f["properties"]["surface_ha"] >= 1)
    summary = {
        "synthetic": synthetic_flag,
        "site": P.label or None,
        "source": "Copernicus Sentinel-2 L2A (ESA), via AWS Open Data « sentinel-cogs »" if not synthetic_flag else "Données synthétiques de test",
        "methode": "Détection de changement par indice NDVI (médianes avant / après, nuages masqués par la bande SCL). Pas de modèle d'IA entraîné.",
        "aoi": {"lat": P.lat, "lon": P.lon, "rayon_m": P.radius},
        "parametres": {"part_claire_min": P.min_clear, "ndvi_vegetation_avant_min": P.ndvi_veg,
                       "ndvi_apres_max": P.ndvi_bare, "baisse_ndvi_min": P.drop, "surface_min_ha": P.min_ha},
        "avant": meta["avant"], "apres": meta["apres"],
        "couverture_valide": round(cov, 3),
        "n_zones": len(feats),
        "surface_totale_ha": surf,
        "terrains_de_football": round(surf / 0.714, 1),
        "premiere_detection": dets[0] if dets else None,
        "signal_moyen": round(float(np.average([f["properties"]["signal"] for f in feats],
                                              weights=[f["properties"]["surface_ha"] for f in feats])), 2) if feats else None,
        "signal_definition": "Baisse moyenne du NDVI entre avant et après (0 à 1). Intensité du changement, pas une probabilité.",
        "images": {"bounds": bounds, "avant": "avant.jpg", "apres": "apres.jpg",
                   "ndvi_avant": "ndvi_avant.png", "ndvi_apres": "ndvi_apres.png", "changements": "changements.png"},
        "genere_le": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    series_doc = {"synthetic": synthetic_flag, "unite": "NDVI moyen",
                  "definition": {"ndvi_zones": "moyenne sur l'ensemble des zones de changement",
                                 "ndvi_reference": "moyenne sur la végétation stable (NDVI ≥ 0,7 avant et après)"},
                  "points": pts}
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    (out / "ndvi_series.json").write_text(json.dumps(series_doc, ensure_ascii=False, indent=1))
    (out / "changes.geojson").write_text(json.dumps({"type": "FeatureCollection", "synthetic": synthetic_flag,
                                                     "features": feats}, ensure_ascii=False))
    return summary


def run(P: Params, out: Path, log=print):
    out.mkdir(parents=True, exist_ok=True)
    log("Recherche des scènes…")
    sA = discover(P, *P.avant)
    sB = discover(P, *P.apres)
    log(f"Avant : {len(sA)} scènes candidates · Après : {len(sB)}")
    if not sA or not sB:
        raise SystemExit("Pas de scène Sentinel-2 sur une des périodes.")
    import rasterio
    with rasterio.Env(**GDAL_ENV), rasterio.open(sA[0].url + "B04.tif") as src:
        aoi = AOI(P, src.crs)
    log("Composite avant…")
    cA = composite(P, sA, aoi, log)
    log("Composite après…")
    cB = composite(P, sB, aoi, log)
    lab, zones, stable, cov = detect(P, aoi, cA["bands"], cB["bands"])
    log(f"{len(zones)} zones, {sum(z['surface_ha'] for z in zones):.1f} ha")
    feats = polygons(aoi, lab, zones)
    log("Série temporelle…")
    sS = discover(P, *P.serie)
    pts = series(P, sS, aoi, lab, zones, stable, log)
    for f, z in zip(feats, zones):
        f["properties"]["premiere_detection"] = first_detection(
            pts, lambda p, k=str(z["label"]): p["par_zone"].get(k), z["ndvi_avant"], z["ndvi_apres"], P.avant[1])
    for p in pts:  # keep the file small: per-zone values only for the 10 largest zones
        keep = {str(z["label"]) for z in zones[:10]}
        p["par_zone"] = {f"Z{i}": p["par_zone"].get(str(z['label'])) for i, z in enumerate(zones[:10], start=1)
                         if str(z["label"]) in keep}
    bounds = save_images(out, aoi, cA["bands"], cB["bands"], lab)
    meta = {"avant": {"periode": list(P.avant), "dates": cA["used"], "rejetees": cA["rejected"]},
            "apres": {"periode": list(P.apres), "dates": cB["used"], "rejetees": cB["rejected"]}}
    s = write_outputs(P, out, feats, pts, meta, bounds, cov)
    log(json.dumps({k: s[k] for k in ("n_zones", "surface_totale_ha", "premiere_detection", "signal_moyen")}, ensure_ascii=False))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, default=6.4189)
    ap.add_argument("--lon", type=float, default=-5.1386)
    ap.add_argument("--radius", type=float, default=5000)
    ap.add_argument("--avant", type=parse_period, default=("2018-11-01", "2019-03-31"))
    ap.add_argument("--apres", type=parse_period, default=("2025-11-01", "2026-03-31"))
    ap.add_argument("--serie", type=parse_period, default=None, help="période de la série NDVI (défaut : début avant → aujourd'hui)")
    ap.add_argument("--min-clear", type=float, default=0.70)
    ap.add_argument("--min-ha", type=float, default=0.5)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--label", default="Kokumbo")
    ap.add_argument("--synthetic", action="store_true", help="données de test hors ligne (synthetic: true)")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    os.environ.setdefault("CURL_CA_BUNDLE", os.environ.get("REQUESTS_CA_BUNDLE", "") or "")
    if not os.environ["CURL_CA_BUNDLE"]:
        del os.environ["CURL_CA_BUNDLE"]
    P = Params(a.lat, a.lon, a.radius, a.avant, a.apres,
               a.serie or (a.avant[0], dt.date.today().isoformat()),
               min_clear=a.min_clear, min_ha=a.min_ha, workers=a.workers, label=a.label)
    if a.synthetic:
        a.out.mkdir(parents=True, exist_ok=True)
        synthetic(P, a.out)
        print(f"Données synthétiques écrites dans {a.out}")
    else:
        run(P, a.out, log=lambda m: print(m, flush=True))


if __name__ == "__main__":
    sys.exit(main())
