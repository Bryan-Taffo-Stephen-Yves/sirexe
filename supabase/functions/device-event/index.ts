// Sirexe · device-event
// Tout ce que la station de terrain (ESP32 / ESP32-CAM, ou le relais Wi-Fi local) envoie
// en plus des mesures d'eau : état complet, SMS reçus par le module SIM, photos. Et la file
// des commandes demandées depuis l'écran (photo, flash, lampe, mode).
// Authentification : en-tête x-device-key (même clé que ingest-reading).
//
// POST {"kind":"status","sensor_id":"PH-CI-003","status":{"rssi":-48,"frames":806,...}}
// POST {"kind":"sms","sensor_id":"PH-CI-003","messages":[{"from":"+225…","text":"…","time":"26/10/15,10:56:02+00"}]}
// POST corps JPEG brut, Content-Type: image/jpeg, URL ?sensor_id=PH-CI-003   → photo
// GET  ?kind=commands&sensor_id=PH-CI-003  → commandes en attente (marquées comme prises)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-key, apikey, authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_PHOTO = 800_000;      // octets (même limite que le bucket)
const MIN_PHOTO_GAP_MS = 1500;  // au plus une photo toutes les 1,5 s par capteur
const MAX_KEYS = 40;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Horodatage du module SIM (AT+CMGR) : « 26/10/15,10:56:02+00 » (aa/mm/jj, fuseau en quarts d'heure)
function simTime(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v !== "string" || !v.trim()) return null;
  const m = v.match(/^(\d\d)\/(\d\d)\/(\d\d),(\d\d):(\d\d):(\d\d)([+-]\d\d)?/);
  if (m) {
    const q = m[7] ? parseInt(m[7], 10) : 0;
    const t = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - q * 15 * 60_000;
    return new Date(t).toISOString();
  }
  const p = Date.parse(v);
  return Number.isNaN(p) ? null : new Date(p).toISOString();
}

// Garde uniquement des valeurs simples et courtes : l'état sert à afficher des cases, pas à stocker n'importe quoi.
function cleanStatus(s: unknown) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>).slice(0, MAX_KEYS)) {
    if (!/^[\w.-]{1,32}$/.test(k)) continue;
    if (v === null || typeof v === "boolean") out[k] = v as boolean | null;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const isJpeg = (req.headers.get("content-type") || "").startsWith("image/jpeg");

  let body: Record<string, unknown> = {};
  if (req.method === "POST" && !isJpeg) {
    try { body = await req.json(); } catch { return json({ ok: false, error: "JSON invalide" }, 400); }
  }
  const sensorId = String(body.sensor_id || url.searchParams.get("sensor_id") || "").trim();
  const key = req.headers.get("x-device-key") || "";
  if (!sensorId || !key) return json({ ok: false, error: "sensor_id et en-tête x-device-key requis" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sensor } = await db.from("sensors").select("id, device_key").eq("id", sensorId).maybeSingle();
  if (!sensor || !safeEqual(sensor.device_key, key)) return json({ ok: false, error: "capteur inconnu ou clé invalide" }, 401);

  // ---- commandes en attente
  if (req.method === "GET") {
    if (url.searchParams.get("kind") !== "commands") return json({ ok: false, error: "kind=commands attendu" }, 400);
    const { data } = await db.from("device_commands").select("id, cmd, val, created_at")
      .eq("sensor_id", sensorId).is("done_at", null).gte("created_at", new Date(Date.now() - 120_000).toISOString())
      .order("created_at").limit(10);
    const ids = (data || []).map((c) => c.id);
    if (ids.length) await db.from("device_commands").update({ done_at: new Date().toISOString() }).in("id", ids);
    return json({ ok: true, commands: data || [] });
  }
  if (req.method !== "POST") return json({ ok: false, error: "GET ou POST attendu" }, 405);

  // ---- photo
  if (isJpeg) {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length < 100 || buf.length > MAX_PHOTO) return json({ ok: false, error: `taille de photo invalide (${buf.length} octets, max ${MAX_PHOTO})` }, 413);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return json({ ok: false, error: "le corps n'est pas un JPEG" }, 415);
    const { data: last } = await db.from("camera_frames").select("taken_at").eq("sensor_id", sensorId).order("taken_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - Date.parse(last.taken_at) < MIN_PHOTO_GAP_MS) return json({ ok: false, error: "trop de photos : une toutes les 1,5 s au plus" }, 429);
    const now = new Date();
    const path = `${sensorId}/${now.toISOString().slice(0, 10)}/${now.getTime()}.jpg`;
    const up = await db.storage.from("camera").upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (up.error) return json({ ok: false, error: up.error.message }, 500);
    const { data: frame, error } = await db.from("camera_frames").insert({ sensor_id: sensorId, path, bytes: buf.length }).select("id, taken_at").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, frame_id: frame.id, path });
  }

  // ---- état complet du boîtier
  if (body.kind === "status") {
    const status = cleanStatus(body.status);
    if (!status) return json({ ok: false, error: "status doit être un objet" }, 422);
    const { error } = await db.from("device_status").upsert({ sensor_id: sensorId, status, updated_at: new Date().toISOString() });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, keys: Object.keys(status).length });
  }

  // ---- SMS reçus par le module SIM
  if (body.kind === "sms") {
    const list = Array.isArray(body.messages) ? body.messages.slice(0, 50) : [];
    const rows = list.map((m: Record<string, unknown>) => ({
      sensor_id: sensorId,
      sender: String(m.from ?? m.number ?? m.sender ?? "").slice(0, 32) || null,
      body: String(m.text ?? m.body ?? m.message ?? "").slice(0, 1000),
      sent_at: simTime(m.time ?? m.date ?? m.ts),
    })).filter((r) => r.body);
    let added = 0;
    for (const r of rows) { // un par un : les doublons déjà reçus sont ignorés par l'index unique
      const { error } = await db.from("sms_messages").insert(r);
      if (!error) added++;
    }
    return json({ ok: true, received: rows.length, added });
  }

  return json({ ok: false, error: "kind attendu : status, sms (ou corps image/jpeg)" }, 400);
});
