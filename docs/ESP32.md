# Contrat d'envoi des mesures (équipe capteurs)

Le boîtier envoie chaque mesure en **HTTPS POST** à la fonction Supabase `ingest-reading`. La page web ne contacte jamais l'ESP32 directement : plus de problème « page https / ESP32 en http ».

```
POST https://dlcuxdzodgctjcxtmuza.supabase.co/functions/v1/ingest-reading
Content-Type: application/json
x-device-key: <clé du capteur, table sensors>

{"sensor_id":"PH-CI-003","turbidity_ntu":412.5,"ph":5.2,"tds_ppm":640,"temperature_c":28.4,"battery_pct":87}
```

Réponse : `{"ok":true,"suspicion_score":78,"alert_id":"…","alert_code":"ALT-2026-0415"}`. Seule `turbidity_ntu` est obligatoire. Valeurs hors plage refusées (422), clé invalide refusée (401).

## Exemple Arduino (ESP32, Wi-Fi)

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* URL = "https://dlcuxdzodgctjcxtmuza.supabase.co/functions/v1/ingest-reading";
const char* DEVICE_KEY = "...";   // ne pas committer : à mettre dans un fichier secrets.h ignoré par git

bool sendReading(float turb, float ph, float tds, float temp) {
  WiFiClientSecure client;
  client.setInsecure();            // prototype : pas de vérification du certificat. Pour le terrain, utiliser setCACert().
  HTTPClient http;
  if (!http.begin(client, URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  char body[160];
  snprintf(body, sizeof body,
    "{\"sensor_id\":\"PH-CI-003\",\"turbidity_ntu\":%.1f,\"ph\":%.2f,\"tds_ppm\":%.0f,\"temperature_c\":%.1f}",
    turb, ph, tds, temp);
  int code = http.POST(body);
  http.end();
  return code == 200;
}
```

Rappels matériels (CDC) : pont diviseur sur turbidité et pH (sortie 5 V → ADC 3,3 V), broches ADC1 seulement avec le Wi-Fi, TDS coupé pendant la lecture du pH, compensation en température avec le DS18B20, tampon local si l'envoi échoue.

## Station complète : état, SMS, photos, commandes

La fonction `device-event` (même clé `x-device-key`) reçoit tout le reste. L'écran « Station ESP32 » (mode **Serveur**) et le bandeau de la vue d'ensemble l'affichent en temps réel, de n'importe où.

| Envoi | Requête |
|---|---|
| État complet (chaque clé devient une case à l'écran, 40 clés max) | `POST /functions/v1/device-event` · `{"kind":"status","sensor_id":"PH-CI-003","status":{"rssi":-48,"frames":806,"operator":"Orange CI","csq":18,"battery":3.92}}` |
| SMS reçus par la SIM | `POST /functions/v1/device-event` · `{"kind":"sms","sensor_id":"PH-CI-003","messages":[{"from":"+225…","text":"…","time":"26/10/15,10:56:02+00"}]}` (doublons ignorés) |
| Photo | `POST /functions/v1/device-event?sensor_id=PH-CI-003` · corps JPEG brut, `Content-Type: image/jpeg`, 800 ko max, une toutes les 1,5 s max |
| Commandes de l'écran | `GET /functions/v1/device-event?kind=commands&sensor_id=PH-CI-003` → `{"commands":[{"cmd":"capture"},{"cmd":"lamp","val":"1"}]}` (à interroger toutes les 2 à 5 s ; `capture` = envoyer une photo tout de suite) |

Clés reconnues avec un libellé français : `rssi`, `sensor`, `frames`, `errors`, `uptime`, `ip`, `heap`, `battery`, `operator`, `csq`, `turbidity`, `ph`, `tds`, `temperature`… Les autres s'affichent avec leur nom.

## Sans HTTPS sur le boîtier

C'est le cas de l'ESP32-CAM actuel (`/status`, `/sms`, `/capture`, `/control`). Lancer `relay/esp32_relay.py` sur un ordinateur ou un Raspberry Pi du même réseau : il lit l'ESP32 et transmet mesures, état, SMS et photos au serveur, et renvoie à l'ESP32 les commandes de l'écran.

```bash
export CIREX_DEVICE_KEY=...
python3 relay/esp32_relay.py --esp 192.168.4.1 --photo 10   # une photo toutes les 10 s, et sur demande
```

Le mode « HTTP local » de l'écran (flux vidéo MJPEG en direct) reste disponible quand l'ordinateur est sur le même Wi-Fi que la caméra et que la page est ouverte en http (`python3 -m http.server`), pas depuis le site en https.
