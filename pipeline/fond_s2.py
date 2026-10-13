#!/usr/bin/env python3
"""Sirexe — fond de carte Sentinel-2 servi avec le site (sans serveur de tuiles externe).

Construit une mosaïque en couleurs naturelles de la Côte d'Ivoire et de ses environs à partir
des images Sentinel-2 L2A du bucket public AWS « sentinel-cogs » (bande TCI, aperçu interne
à 160 m), nuages retirés avec la bande SCL, 30e centile de plusieurs dates de saison sèche.
Écrit des tuiles XYZ (EPSG:3857, JPEG 256 px) lues par web/orp-carto.js :

  <out>/{z}/{x}/{y}.jpg   z 5 à 9 sur l'étendue large, z 10 sur la Côte d'Ivoire
  <out>/tiles.json        niveaux, emprises, scènes utilisées par tuile MGRS

Sert de fond quand Esri / EOX ne répondent pas (page partagée, démo sans Internet) ;
le site en ligne garde Esri (plus fin) par-dessus. Contient des données Copernicus Sentinel-2 modifiées.

Usage :
  python fond_s2.py --out ../web/data/fond-s2
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ndvi_pipeline as N  # noqa: E402  (listing S3, métadonnées des scènes, réglages GDAL)

WIDE = (-13.0, 3.0, 2.0, 12.5)      # ouest, sud, est, nord : ce que montre la vue nationale
CI = (-8.75, 4.2, -2.35, 10.8)      # Côte d'Ivoire, niveau 10
SEASONS = [("2025-11-15", "2026-03-15"), ("2024-11-15", "2025-03-15"), ("2023-11-15", "2024-03-15")]
CLEAR = (4, 5, 6)                   # SCL : végétation, sol nu, eau
SOFT = (2, 7)                       # zones sombres, non classé : acceptés s'il n'y a rien de mieux
MAX_SCENES = 16
MAX_PARTIAL = 4
R = 6378137.0
HALF = math.pi * R


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile_range(bbox, z):
    w, s, e, n = bbox
    x0, y0 = tile_xy(w, n, z)
    x1, y1 = tile_xy(e, s, z)
    return int(math.floor(x0)), int(math.floor(y0)), int(math.ceil(x1)), int(math.ceil(y1))


def tile_bounds_lonlat(x, y, z):
    n = 2 ** z
    lon = lambda xx: xx / n * 360 - 180
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    return lon(x), lat(y + 1), lon(x + 1), lat(y)


class Mosaic:
    """Grille EPSG:3857 alignée sur les tuiles d'un niveau z ; somme et compte pour moyenner les recouvrements."""

    def __init__(self, bbox, z):
        from rasterio.transform import from_origin
        self.z = z
        self.tx0, self.ty0, self.tx1, self.ty1 = tile_range(bbox, z)
        self.res = 2 * HALF / (256 * 2 ** z)
        self.w, self.h = (self.tx1 - self.tx0) * 256, (self.ty1 - self.ty0) * 256
        self.transform = from_origin(-HALF + self.tx0 * 256 * self.res, HALF - self.ty0 * 256 * self.res, self.res, self.res)
        self.sum = np.zeros((3, self.h, self.w), np.uint16)
        self.cnt = np.zeros((self.h, self.w), np.uint8)

    def add(self, rgb, valid, src_transform, src_crs, resampling):
        from rasterio.warp import reproject, transform_bounds
        from rasterio.windows import from_bounds
        from rasterio.enums import Resampling
        h, w = valid.shape
        b = transform_bounds(src_crs, "EPSG:3857", src_transform.c, src_transform.f + src_transform.e * h,
                             src_transform.c + src_transform.a * w, src_transform.f)
        win = from_bounds(*b, transform=self.transform).round_offsets().round_lengths()
        c0, r0 = max(0, int(win.col_off)), max(0, int(win.row_off))
        c1, r1 = min(self.w, int(win.col_off + win.width) + 1), min(self.h, int(win.row_off + win.height) + 1)
        if c1 <= c0 or r1 <= r0:
            return
        from rasterio.windows import Window, transform as wtransform
        wt = wtransform(Window(c0, r0, c1 - c0, r1 - r0), self.transform)
        out = np.zeros((3, r1 - r0, c1 - c0), np.uint8)
        m = np.zeros((r1 - r0, c1 - c0), np.uint8)
        rs = getattr(Resampling, resampling)
        reproject(rgb, out, src_transform=src_transform, src_crs=src_crs, dst_transform=wt, dst_crs="EPSG:3857", resampling=rs)
        reproject(valid.astype(np.uint8) * 255, m, src_transform=src_transform, src_crs=src_crs, dst_transform=wt,
                  dst_crs="EPSG:3857", resampling=Resampling.nearest)
        ok = m > 127
        self.sum[:, r0:r1, c0:c1][:, ok] += out[:, ok]
        self.cnt[r0:r1, c0:c1][ok] += 1

    def image(self):
        img = np.zeros((3, self.h, self.w), np.float32)
        has = self.cnt > 0
        img[:, has] = self.sum[:, has] / self.cnt[has]
        return img, has


def mgrs_tiles(bbox, step=0.05):
    import mgrs
    m = mgrs.MGRS()
    w, s, e, n = bbox
    out = set()
    for lat in np.arange(s, n + 1e-9, step):
        for lon in np.arange(w, e + 1e-9, step):
            c = m.toMGRS(float(lat), float(lon), MGRSPrecision=0)
            out.add((c[:2].lstrip("0"), c[2], c[3:5]))
    return sorted(out)


def _retry(fn, *a, tries=4):
    import time
    for k in range(tries):
        try:
            return fn(*a)
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(1.5 * (k + 1))


def scene_info(folder):
    """Métadonnées d'une scène + part de la tuile sans données (bord de fauchée)."""
    sid = folder.rstrip("/").split("/")[-1]
    try:
        p = json.loads(_retry(N.http_get, f"{N.BUCKET}/{folder}{sid}.json"))["properties"]
    except Exception:
        return None
    s = N.Scene(sid, f"{N.BUCKET}/{folder}", dt.date.fromisoformat(p["datetime"][:10]), float(p.get("eo:cloud_cover", 100)), 0.0)
    return s, float(p.get("s2:nodata_pixel_percentage", 100) or 0)


def scenes_for(tile, log):
    zone, band, sq = tile
    found = {}
    for a, b in SEASONS:
        folders = []
        for y, mth in N.months(a, b):
            try:
                folders += _retry(N.list_prefixes, f"{N.PREFIX}/{zone}/{band}/{sq}/{y}/{mth}/")
            except Exception:
                pass
        if not folders:
            continue
        with cf.ThreadPoolExecutor(8) as ex:
            info = [i for i in ex.map(scene_info, folders) if i]
        d0, d1 = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
        for s, nod in info:
            if d0 <= s.date <= d1 and (s.date not in found or s.cloud < found[s.date][0].cloud):
                found[s.date] = (s, nod)
        if sum(1 for s, nod in found.values() if s.cloud <= 30 and nod <= 20) >= MAX_SCENES:
            break
    # d'abord les scènes qui couvrent toute la tuile, les moins nuageuses ; puis quelques scènes partielles
    # de la fauchée voisine, qui comblent les biseaux du bord de fauchée
    full, ids = [], set()
    for cl, nd in ((30, 20), (60, 20), (60, 60), (90, 100)):
        for s in sorted([s for s, nod in found.values() if s.cloud <= cl and nod <= nd], key=lambda s: s.cloud):
            if s.id not in ids and len(full) < MAX_SCENES and (len(full) < 5 or cl <= 60):
                full.append(s); ids.add(s.id)
    part = sorted([s for s, nod in found.values() if s.id not in ids and nod > 20 and s.cloud <= 60], key=lambda s: s.cloud)[:MAX_PARTIAL]
    return full + part


def read_scene(s):
    """TCI à 160 m ; SCL lue à 80 m : un pixel de 160 m n'est clair que si ses 4 sous-pixels le sont."""
    import rasterio
    with rasterio.Env(**N.GDAL_ENV, GDAL_HTTP_TIMEOUT="60", GDAL_HTTP_CONNECTTIMEOUT="15"):  # jamais de lecture bloquée sans fin
        with rasterio.open(s.url + "TCI.tif", overview_level=3) as t:
            rgb, tr, crs = t.read(), t.transform, t.crs
        with rasterio.open(s.url + "SCL.tif", overview_level=1) as c:
            scl = c.read(1, out_shape=(rgb.shape[1] * 2, rgb.shape[2] * 2))
    h, w = rgb.shape[1:]
    blk = lambda m: m.reshape(h, 2, w, 2).all(axis=(1, 3))
    clear = blk(np.isin(scl, CLEAR))
    soft = blk(np.isin(scl, CLEAR + SOFT))
    # marge d'un pixel autour des nuages (bords et halos)
    for m in (clear, soft):
        bad = ~m
        grow = bad.copy()
        grow[1:] |= bad[:-1]; grow[:-1] |= bad[1:]; grow[:, 1:] |= bad[:, :-1]; grow[:, :-1] |= bad[:, 1:]
        m &= ~grow
    return rgb, clear, soft, tr, crs


def composite(scenes, log):
    with cf.ThreadPoolExecutor(4) as ex:
        res = [(s, r) for s, r in zip(scenes, ex.map(lambda s: _safe(_retry, read_scene, s), scenes)) if r is not None]
    if not res:
        return None
    tr, crs = res[0][1][3], res[0][1][4]
    rgb = np.stack([r[0] for _, r in res]).astype(np.float32)          # (S, 3, h, w)
    clear = np.stack([r[1] for _, r in res])
    soft = np.stack([r[2] for _, r in res])
    valid = rgb.max(axis=1) > 0
    out = np.full(rgb.shape[1:], np.nan, np.float32)
    # 30e centile des observations claires : écarte les restes de nuages et de brume (plus clairs)
    # au moins 3 observations claires ; sinon 15e centile de toutes les observations (les nuages, clairs, sont écartés)
    for ok, q, mn in ((valid & clear, 30, 3), (valid & soft, 30, 3), (valid, 15, 1)):
        hole = np.isnan(out[0])
        if not hole.any():
            break
        med = rank(rgb, ok, q, mn)
        fill = hole & ~np.isnan(med[0])
        out[:, fill] = med[:, fill]
    has = ~np.isnan(out[0])
    out = np.nan_to_num(out).clip(0, 255).astype(np.uint8)
    return out, has, tr, crs, [s for s, _ in res]


def rank(rgb, ok, q, min_n=1):
    """Centile q par pixel parmi les observations retenues (rang le plus proche), NaN s'il y en a moins de min_n."""
    a = np.where(ok[:, None], rgb, np.inf)
    a.sort(axis=0)
    n = ok.sum(axis=0)
    k = np.floor(q / 100 * np.maximum(n - 1, 0)).astype(np.intp)
    v = np.take_along_axis(a, np.broadcast_to(k[None, None], (1,) + a.shape[1:]), axis=0)[0]
    v[:, n < max(1, min_n)] = np.nan
    return v


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception:
        return None


def tone(img):
    """Légère correction de tons commune à toute la mosaïque (même courbe partout, pas d'étirement local)."""
    x = np.clip(img / 255.0, 0, 1)
    x = np.power(x, 0.85)
    return np.clip(x * 255 * 1.06, 0, 255)


def write_tiles(mos: Mosaic, out: Path, zmin: int, zmax: int, bg=(14, 21, 18), quality=82):
    from PIL import Image
    img, has = mos.image()
    img = tone(img)
    img[:, ~has] = np.array(bg, np.float32)[:, None]
    n = 0
    z, cur, tx0, ty0 = mos.z, img, mos.tx0, mos.ty0
    while z >= zmin:
        if z <= zmax:
            ny, nx = cur.shape[1] // 256, cur.shape[2] // 256
            for j in range(ny):
                for i in range(nx):
                    t = cur[:, j * 256:(j + 1) * 256, i * 256:(i + 1) * 256]
                    p = out / str(z) / str(tx0 + i)
                    p.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(np.moveaxis(t, 0, -1).astype(np.uint8)).save(p / f"{ty0 + j}.jpg", quality=quality, optimize=True, progressive=True)
                    n += 1
        # niveau inférieur : moyenne 2×2, la grille reste alignée sur les tuiles (bords complétés)
        pad_x, pad_y = (tx0 % 2) * 256, (ty0 % 2) * 256
        c = np.pad(cur, ((0, 0), (pad_y, 0), (pad_x, 0)), constant_values=0) if (pad_x or pad_y) else cur
        if pad_x or pad_y:
            c[:, :pad_y, :] = np.array(bg, np.float32)[:, None, None]
            c[:, :, :pad_x] = np.array(bg, np.float32)[:, None, None]
        ex_x, ex_y = (c.shape[2] // 256) % 2 * 256, (c.shape[1] // 256) % 2 * 256
        if ex_x or ex_y:
            c = np.pad(c, ((0, 0), (0, ex_y), (0, ex_x)), constant_values=0)
            if ex_y:
                c[:, -ex_y:, :] = np.array(bg, np.float32)[:, None, None]
            if ex_x:
                c[:, :, -ex_x:] = np.array(bg, np.float32)[:, None, None]
        cur = c.reshape(3, c.shape[1] // 2, 2, c.shape[2] // 2, 2).mean(axis=(2, 4))
        tx0, ty0, z = (tx0 - (tx0 % 2)) // 2, (ty0 - (ty0 % 2)) // 2, z - 1
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8, help="tuiles MGRS traitées en parallèle")
    ap.add_argument("--cache", default="/tmp/sirexe-fond-s2-cache", help="composites par tuile MGRS (reprise après interruption)")
    a = ap.parse_args()
    out = Path(a.out)
    log = lambda *m: print(*m, flush=True)

    tiles = mgrs_tiles(WIDE)
    log(f"{len(tiles)} tuiles MGRS dans l'étendue large")
    wide, ci = Mosaic(WIDE, 9), Mosaic(CI, 10)
    used = {}

    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)

    def one(t):
        name = "".join(t)
        f = cache / (name + ".npz")
        if f.exists():
            z = np.load(f, allow_pickle=False)
            if z["rgb"].size == 0:
                return t, None
            from rasterio.transform import Affine
            return t, (z["rgb"], z["has"], Affine(*z["tr"]), str(z["crs"]), json.loads(str(z["sc"])))
        sc = scenes_for(t, log)
        c = composite(sc, log) if sc else None
        if c is None:
            np.savez(f, rgb=np.zeros(0, np.uint8))
            return t, None
        rgb, has, tr, crs, scs = c
        meta_sc = [{"id": x.id, "date": x.date.isoformat(), "nuages_pct": round(x.cloud, 1)} for x in scs]
        np.savez_compressed(f, rgb=rgb, has=has, tr=np.array(tr[:6]), crs=str(crs), sc=json.dumps(meta_sc))
        return t, (rgb, has, tr, str(crs), meta_sc)

    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(one, t) for t in tiles]
        for k, fu in enumerate(cf.as_completed(futs), 1):
            try:
                t, c = fu.result()
            except Exception as e:
                log(f"[{k}/{len(tiles)}] erreur : {e}")
                continue
            name = "".join(t)
            if c is None:
                log(f"[{k}/{len(tiles)}] {name} : aucune image (mer ou hors couverture)")
                continue
            rgb, has, tr, crs, sc = c
            wide.add(rgb, has, tr, crs, "average")
            ci.add(rgb, has, tr, crs, "bilinear")
            used[name] = sc
            log(f"[{k}/{len(tiles)}] {name} : {len(sc)} dates · {round(100 * has.mean())} % couvert")

    n1 = write_tiles(wide, out, 5, 9)
    n2 = write_tiles(ci, out, 10, 10)
    meta = {
        "source": "Copernicus Sentinel-2 L2A (ESA), bande TCI, via AWS Open Data « sentinel-cogs »",
        "attribution": "Contient des données Copernicus Sentinel-2 modifiées",
        "methode": "Par tuile MGRS, jusqu'à 16 dates de saison sèche (3 saisons) couvrant toute la tuile et les moins nuageuses, plus 4 scènes partielles de la fauchée voisine ; nuages retirés avec la bande SCL (lue à 80 m, marge d'un pixel) ; 30e centile d'au moins 3 observations claires, sinon 15e centile de toutes ; aperçu TCI à 160 m.",
        "saisons": [f"{a} → {b}" for a, b in SEASONS],
        "genere_le": dt.date.today().isoformat(),
        "couches": [
            {"zmin": 5, "zmax": 9, "bounds": [[WIDE[1], WIDE[0]], [WIDE[3], WIDE[2]]]},
            {"zmin": 10, "zmax": 10, "bounds": [[CI[1], CI[0]], [CI[3], CI[2]]]},
        ],
        "tuiles": n1 + n2,
        "scenes": used,
    }
    (out / "tiles.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    log(f"{n1 + n2} tuiles écrites dans {out}")


if __name__ == "__main__":
    main()
