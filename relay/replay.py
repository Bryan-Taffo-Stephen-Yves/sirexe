#!/usr/bin/env python3
"""Sirexe · rejeu de mesures (plan B de la démonstration).

Envoie à la fonction ingest-reading une séquence enregistrée « eau claire → terre versée »
en se faisant passer pour le capteur, avec la source « rejeu » : la chaîne serveur complète
tourne (mesure → indice → alerte → Telegram → écran en temps réel), sans matériel.
L'écran et la notification affichent « rejeu », on le dit au jury.

    export CIREX_DEVICE_KEY=...
    python3 replay.py                       # séquence par défaut, 1 mesure / 2 s
    python3 replay.py --file mesures.csv    # vos propres mesures (colonnes : turbidity_ntu,ph,tds_ppm,temperature_c)
"""
import argparse, csv, json, os, sys, time, urllib.request, urllib.error

FUNCTION_URL = "https://dlcuxdzodgctjcxtmuza.supabase.co/functions/v1/ingest-reading"
# Profil enregistré lors des essais en bocal (eau claire, puis terre argileuse et vinaigre)
DEFAULT = [(9, 6.95, 134, 27.8)] * 5 + [(64, 6.8, 190, 27.9), (188, 6.2, 330, 28.0), (301, 5.7, 480, 28.2), (380, 5.4, 590, 28.3)] + [(412, 5.2, 640, 28.4)] * 4


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sensor", default="PH-CI-003")
    ap.add_argument("--every", type=float, default=2.0)
    ap.add_argument("--file", help="CSV de mesures enregistrées")
    ap.add_argument("--url", default=FUNCTION_URL)
    a = ap.parse_args()
    key = os.environ.get("CIREX_DEVICE_KEY") or sys.exit("Définissez CIREX_DEVICE_KEY (clé du capteur).")
    rows = DEFAULT
    if a.file:
        with open(a.file, newline="") as f:
            rows = [(float(r["turbidity_ntu"]), float(r.get("ph") or 7), float(r.get("tds_ppm") or 120), float(r.get("temperature_c") or 27.8)) for r in csv.DictReader(f)]
    for turb, ph, tds, temp in rows:
        body = {"sensor_id": a.sensor, "turbidity_ntu": turb, "ph": ph, "tds_ppm": tds, "temperature_c": temp, "source": "rejeu"}
        req = urllib.request.Request(a.url, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-device-key": key})
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                res = json.load(r)
            tag = f"  ALERTE {res['alert_code']}" if res.get("alert_code") else ""
            print(f"{time.strftime('%H:%M:%S')} turbidité {turb:.0f} NTU · indice {res.get('suspicion_score')}{tag}")
        except urllib.error.HTTPError as e:
            print(f"! serveur {e.code} : {e.read().decode(errors='replace')[:200]}")
        time.sleep(a.every)


if __name__ == "__main__":
    main()
