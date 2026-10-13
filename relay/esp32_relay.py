#!/usr/bin/env python3
"""Cirex · relais station ESP32 / ESP32-CAM → serveur.

Pour un boîtier qui ne parle qu'en HTTP sur le Wi-Fi du site (ESP32-CAM, carte sans TLS).
Ce script tourne sur un ordinateur (ou un Raspberry Pi) du même réseau et transmet tout au
serveur en HTTPS, pour que l'écran fonctionne de n'importe où :

  /status   toutes les 2 s  → mesures d'eau (ingest-reading) + état complet (device-event)
  /sms      toutes les 4 s  → SMS du module SIM (device-event)
  /capture  toutes les N s  → photo JPEG (device-event), et à chaque demande « Prendre une photo »
  commandes de l'écran      → /control?var=flash|lamp|mode&val=… sur l'ESP32

    export CIREX_DEVICE_KEY=...   # clé du capteur (table sensors, colonne device_key)
    python3 esp32_relay.py --esp 192.168.4.1 --photo 10

Aucune dépendance : bibliothèque standard Python 3.8+.
"""
import argparse, json, os, sys, time, urllib.error, urllib.parse, urllib.request

BASE = "https://dlcuxdzodgctjcxtmuza.supabase.co/functions/v1"
KEYS = {
    "turbidity_ntu": ("turbidity", "turb", "ntu", "turbidite", "turbidity_ntu"),
    "ph": ("ph",),
    "tds_ppm": ("tds", "conductivity", "tds_ppm"),
    "temperature_c": ("temperature", "water_temp", "temperature_c"),
    "battery_pct": ("battery_pct",),
}
CONTROL = {"flash": "flash", "lamp": "lamp", "mode": "mode"}


def pick(status, names):
    low = {k.lower(): v for k, v in status.items()}
    for n in names:
        if n in low:
            try:
                return float(low[n])
            except (TypeError, ValueError):
                return None
    return None


class Relay:
    def __init__(self, a, key):
        self.a, self.key = a, key
        self.esp = a.esp if a.esp.startswith("http") else "http://" + a.esp
        self.esp = self.esp.rstrip("/")
        self.last_photo = 0.0
        self.last_sms = 0.0

    # --- appels serveur
    def post_json(self, fn, body, extra=None):
        h = {"Content-Type": "application/json", "x-device-key": self.key}
        h.update(extra or {})
        req = urllib.request.Request(f"{self.a.base}/{fn}", data=json.dumps(body).encode(), method="POST", headers=h)
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)

    def post_photo(self, jpeg):
        q = urllib.parse.urlencode({"sensor_id": self.a.sensor})
        req = urllib.request.Request(f"{self.a.base}/device-event?{q}", data=jpeg, method="POST",
                                     headers={"Content-Type": "image/jpeg", "x-device-key": self.key})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)

    def commands(self):
        q = urllib.parse.urlencode({"kind": "commands", "sensor_id": self.a.sensor})
        req = urllib.request.Request(f"{self.a.base}/device-event?{q}", headers={"x-device-key": self.key})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r).get("commands", [])

    # --- appels ESP32
    def esp_get(self, path, timeout=4, raw=False):
        with urllib.request.urlopen(self.esp + path, timeout=timeout) as r:
            return r.read() if raw else json.load(r)

    # --- étapes
    def status_step(self):
        status = self.esp_get("/status")
        if not isinstance(status, dict):
            return
        res = self.post_json("device-event", {"kind": "status", "sensor_id": self.a.sensor, "status": status})
        line = f"état {res.get('keys', '?')} clés"
        body = {"sensor_id": self.a.sensor}
        for out, names in KEYS.items():
            v = pick(status, names)
            if v is not None:
                body[out] = v
        if "turbidity_ntu" in body:
            r = self.post_json("ingest-reading", body, {"x-relay": "1"})
            line += f" · turbidité {body['turbidity_ntu']:.0f} NTU · indice {r.get('suspicion_score')}"
            if r.get("alert_code"):
                line += f"  ALERTE {r['alert_code']}"
        if isinstance(status.get("sms"), list) and status["sms"]:
            self.post_json("device-event", {"kind": "sms", "sensor_id": self.a.sensor, "messages": status["sms"]})
        print(f"  {time.strftime('%H:%M:%S')} {line}")

    def sms_step(self):
        try:
            data = self.esp_get("/sms")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return  # /sms optionnel
            raise
        msgs = data if isinstance(data, list) else (data.get("messages") or data.get("sms") or []) if isinstance(data, dict) else []
        if msgs:
            r = self.post_json("device-event", {"kind": "sms", "sensor_id": self.a.sensor, "messages": msgs})
            if r.get("added"):
                print(f"  {time.strftime('%H:%M:%S')} {r['added']} nouveau(x) SMS transmis")

    def photo_step(self, reason="périodique"):
        jpeg = self.esp_get("/capture", timeout=10, raw=True)
        r = self.post_photo(jpeg)
        print(f"  {time.strftime('%H:%M:%S')} photo {reason} · {len(jpeg) // 1024} ko · {'ok' if r.get('ok') else r.get('error')}")
        self.last_photo = time.time()

    def command_step(self):
        for c in self.commands():
            cmd, val = c.get("cmd"), c.get("val")
            if cmd == "capture":
                self.photo_step("demandée depuis l'écran")
            elif cmd in CONTROL:
                q = urllib.parse.urlencode({"var": CONTROL[cmd], "val": val if val is not None else ""})
                try:
                    urllib.request.urlopen(f"{self.esp}/control?{q}", timeout=4).read()
                    print(f"  {time.strftime('%H:%M:%S')} commande {cmd} = {val} transmise à l'ESP32")
                except Exception as e:
                    print(f"  ! commande {cmd} non transmise : {e}")

    def run(self):
        print(f"Relais {self.esp} → {self.a.base} ({self.a.sensor}). Photos : {'toutes les %s s' % self.a.photo if self.a.photo else 'sur demande seulement'}. Ctrl+C pour arrêter.")
        while True:
            t0 = time.time()
            for step in (self.status_step, self.command_step):
                try:
                    step()
                except urllib.error.HTTPError as e:
                    print(f"  ! {step.__name__} : serveur {e.code} {e.read().decode(errors='replace')[:160]}")
                except Exception as e:  # ESP32 injoignable, Wi-Fi coupé…
                    print(f"  ! {step.__name__} : {e}")
            try:
                if time.time() - self.last_sms >= 4:
                    self.last_sms = time.time()
                    self.sms_step()
                if self.a.photo and time.time() - self.last_photo >= self.a.photo:
                    self.photo_step()
            except Exception as e:
                print(f"  ! {e}")
            time.sleep(max(0.2, self.a.every - (time.time() - t0)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--esp", required=True, help="adresse de l'ESP32 (ex. 192.168.4.1)")
    ap.add_argument("--sensor", default="PH-CI-003")
    ap.add_argument("--every", type=float, default=2.0, help="période de lecture de /status (s)")
    ap.add_argument("--photo", type=float, default=10.0, help="période des photos (s), 0 = seulement sur demande")
    ap.add_argument("--base", default=BASE, help="URL des fonctions Supabase")
    a = ap.parse_args()
    key = os.environ.get("CIREX_DEVICE_KEY") or sys.exit("Définissez CIREX_DEVICE_KEY (clé du capteur).")
    Relay(a, key).run()


if __name__ == "__main__":
    main()
