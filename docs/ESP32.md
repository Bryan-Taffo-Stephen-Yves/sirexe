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

## Sans HTTPS sur le boîtier

Exposer `GET /status` en JSON (`{"turbidity":…,"ph":…,"tds":…,"temperature":…}`) et lancer `relay/esp32_relay.py` sur un ordinateur du même réseau.
