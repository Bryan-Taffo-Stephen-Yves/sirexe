// Cirex · ingest-reading
// Reçoit une mesure du boîtier (ESP32 en HTTPS, relais Wi-Fi local ou script de rejeu),
// vérifie la clé du capteur, enregistre la mesure. L'indice de suspicion et l'alerte sont
// calculés par la base (triggers readings_score / readings_alert). Si une alerte vient d'être
// créée, la notification Telegram part d'ici : le jeton du bot reste dans les secrets.
//
// POST /functions/v1/ingest-reading
// En-tête : x-device-key: <sensors.device_key>
// Corps   : {"sensor_id":"PH-CI-003","turbidity_ntu":412.5,"ph":5.2,"tds_ppm":640,"temperature_c":28.4,"battery_pct":87}
// Réponse : {"ok":true,"suspicion_score":78,"alert_id":"…","alert_code":"ALT-2026-0414"}
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-key, x-relay, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Plages physiquement plausibles : au-delà, la mesure est refusée (capteur débranché, bruit).
const RANGES: Record<string, [number, number]> = {
  turbidity_ntu: [0, 4000], ph: [0, 14], tds_ppm: [0, 5000], temperature_c: [-5, 60], battery_pct: [0, 100],
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function telegram(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN"), chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chat) return { sent: false, reason: "jeton Telegram non configuré sur le serveur" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    return j.ok ? { sent: true } : { sent: false, reason: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { sent: false, reason: String(e) };
  }
}

const hhmmss = (iso: string) => new Date(iso).toISOString().slice(11, 19);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST attendu" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON invalide" }, 400); }

  const sensorId = String(body.sensor_id || "").trim();
  const key = req.headers.get("x-device-key") || "";
  if (!sensorId || !key) return json({ ok: false, error: "sensor_id et en-tête x-device-key requis" }, 400);

  const row: Record<string, unknown> = { sensor_id: sensorId };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (body[k] === undefined || body[k] === null || body[k] === "") continue;
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) return json({ ok: false, error: `${k} hors plage (${lo}–${hi})` }, 422);
    row[k] = v;
  }
  if (row.turbidity_ntu === undefined) return json({ ok: false, error: "turbidity_ntu requis" }, 422);
  row.source = body.source === "rejeu" ? "rejeu" : req.headers.get("x-relay") ? "relais" : "capteur";

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: sensor, error: se } = await db.from("sensors").select("id, name, locality, device_key, baseline").eq("id", sensorId).maybeSingle();
  if (se) return json({ ok: false, error: se.message }, 500);
  if (!sensor || !safeEqual(sensor.device_key, key)) return json({ ok: false, error: "capteur inconnu ou clé invalide" }, 401);

  const { data: reading, error: re } = await db.from("readings").insert(row).select("id, measured_at, suspicion_score").single();
  if (re) return json({ ok: false, error: re.message }, 500);

  // L'alerte éventuelle a été créée par le trigger dans la même transaction
  const { data: alert } = await db.from("alerts").select("id, code, created_at, suspicion_score")
    .eq("sensor_id", sensorId).eq("trigger->>reading_id", String(reading.id)).maybeSingle();

  let notification: unknown = null;
  if (alert) {
    const base = (sensor.baseline || {}) as Record<string, number>;
    const lines = [
      row.source === "rejeu" ? "Cirex · ALERTE (rejeu de mesures enregistrées)" : "Cirex · ALERTE",
      `Capteur ${sensor.id} · ${sensor.locality || sensor.name}`,
      `Indice ${Math.round(Number(alert.suspicion_score))}/100 · turbidité ${Math.round(Number(row.turbidity_ntu))} NTU (réf. ${base.turbidity_ntu ?? "?"})`,
      `Alerte ${alert.code} · ${hhmmss(alert.created_at)} GMT`,
      "Prototype SIREXE 2026",
    ];
    notification = await telegram(lines.join("\n"));
    await db.from("notifications").insert({ alert_id: alert.id, kind: "alerte", ok: (notification as { sent: boolean }).sent, detail: JSON.stringify(notification) });
  }

  return json({ ok: true, reading_id: reading.id, suspicion_score: reading.suspicion_score, alert_id: alert?.id ?? null, alert_code: alert?.code ?? null, notification });
});
