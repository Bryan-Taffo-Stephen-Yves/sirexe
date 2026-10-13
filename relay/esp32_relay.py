#!/usr/bin/env python3
"""Cirex · relais ESP32 → serveur.

Pour un boîtier qui ne sait parler qu'en HTTP sur le Wi-Fi local (ESP32-CAM, carte sans TLS) :
ce script tourne sur un ordinateur du même réseau, lit http://<esp32>/status toutes les 2 s
et transmet les mesures à la fonction Supabase ingest-reading en HTTPS. La page web n'a donc
plus besoin de joindre l'ESP32 (impossible depuis une page https).

    export CIREX_DEVICE_KEY=...   # clé du capteur (table sensors, colonne device_key)
    python3 esp32_relay.py --esp 192.168.4.1 --sensor PH-CI-003

Aucune dépendance : bibliothèque standard Python 3.8+.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

FUNCTION_URL = "https://dlcuxdzodgctjcxtmuza.supabase.co/functions/v1/ingest-reading"
KEYS = {
    "turbidity_ntu": ("turbidity", "turb", "ntu", "turbidite", "turbidity_ntu"),
    "ph": ("ph",),
    "tds_ppm": ("tds", "conductivity", "tds_ppm"),
    "temperature_c": ("temperature", "water_temp", "temp", "temperature_c"),
    "battery_pct": ("battery_pct", "battery"),
}


def pick(status, names):
    for n in names:
        for k, v in status.items():
            if k.lower() == n:
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--esp", required=True, help="adresse de l'ESP32 (ex. 192.168.4.1)")
    ap.add_argument("--sensor", default="PH-CI-003")
    ap.add_argument("--every", type=float, default=2.0, help="période en secondes")
    ap.add_argument("--url", default=FUNCTION_URL)
    a = ap.parse_args()
    key = os.environ.get("CIREX_DEVICE_KEY")
    if not key:
        sys.exit("Définissez CIREX_DEVICE_KEY (clé du capteur).")
    base = a.esp if a.esp.startswith("http") else "http://" + a.esp
    print(f"Relais {base}/status → {a.url} ({a.sensor}), toutes les {a.every} s. Ctrl+C pour arrêter.")
    while True:
        t0 = time.time()
        try:
            with urllib.request.urlopen(base.rstrip("/") + "/status", timeout=3) as r:
                status = json.load(r)
            body = {"sensor_id": a.sensor}
            for out, names in KEYS.items():
                v = pick(status, names)
                if v is not None:
                    body[out] = v
            if body.get("battery_pct") is not None and body["battery_pct"] <= 6:  # tension (V) et non %
                body.pop("battery_pct")
            if "turbidity_ntu" not in body:
                print("  ! /status sans turbidité, mesure ignorée")
            else:
                req = urllib.request.Request(a.url, data=json.dumps(body).encode(), method="POST",
                                             headers={"Content-Type": "application/json", "x-device-key": key, "x-relay": "1"})
                with urllib.request.urlopen(req, timeout=8) as r:
                    res = json.load(r)
                tag = f"  ALERTE {res['alert_code']}" if res.get("alert_code") else ""
                print(f"  {time.strftime('%H:%M:%S')} turbidité {body['turbidity_ntu']:.0f} NTU · indice {res.get('suspicion_score')}{tag}")
        except urllib.error.HTTPError as e:
            print(f"  ! serveur {e.code} : {e.read().decode(errors='replace')[:200]}")
        except Exception as e:  # ESP32 injoignable, Wi-Fi coupé…
            print(f"  ! {e}")
        time.sleep(max(0.2, a.every - (time.time() - t0)))


if __name__ == "__main__":
    main()
