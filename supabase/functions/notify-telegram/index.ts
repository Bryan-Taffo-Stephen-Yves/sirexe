// Sirexe · notify-telegram
// Appelée par la page (bouton « Tester », alertes du mode Simulation / ESP32 local / webcam).
// La page n'envoie jamais de texte libre ni de jeton : le message est composé ici à partir de
// champs vérifiés, et limité à un envoi toutes les 30 secondes.
//
// POST /functions/v1/notify-telegram
// {"kind":"test"}  ou  {"kind":"alerte","sensor_id":"PH-CI-003","score":78,"turbidity_ntu":412,"source":"simulation"}
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SOURCES: Record<string, string> = { simulation: "simulation", reel: "ESP32 · Wi-Fi local", optique: "webcam", serveur: "boîtier" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ sent: false, reason: "POST attendu" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ sent: false, reason: "JSON invalide" }, 400); }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN"), chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chat) return json({ sent: false, reason: "jeton Telegram non configuré sur le serveur" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 30_000).toISOString();
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("channel", "telegram").gte("created_at", since);
  if ((count ?? 0) > 0) return json({ sent: false, reason: "limite : un message toutes les 30 s" }, 429);

  let text: string;
  if (b.kind === "test") {
    text = "Sirexe · test de notification réussi.\nPrototype SIREXE 2026";
  } else if (b.kind === "alerte") {
    const sensor = /^[A-Z]{2,4}-[A-Z]{2}-\d{3}$/.test(String(b.sensor_id)) ? String(b.sensor_id) : "capteur inconnu";
    const score = Math.max(0, Math.min(100, Math.round(Number(b.score) || 0)));
    const turb = Math.max(0, Math.min(4000, Math.round(Number(b.turbidity_ntu) || 0)));
    const src = SOURCES[String(b.source)] || "inconnue";
    const code = /^[A-Z]{3}-[\w-]{1,16}$/.test(String(b.alert_code || "")) ? String(b.alert_code) : null;
    text = [
      src === "simulation" ? "Sirexe · ALERTE (SIMULATION)" : "Sirexe · ALERTE",
      `Capteur ${sensor} · source : ${src}`,
      `Indice ${score}/100 · turbidité ${turb} NTU (réf. 5)`,
      code ? `Référence ${code}` : null,
      `${new Date().toISOString().slice(11, 19)} GMT · Prototype SIREXE 2026`,
    ].filter(Boolean).join("\n");
  } else {
    return json({ sent: false, reason: "kind attendu : test ou alerte" }, 400);
  }

  let sent = false, reason = "";
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    sent = !!j.ok; reason = j.ok ? "" : (j.description || `HTTP ${r.status}`);
  } catch (e) { reason = String(e); }
  await db.from("notifications").insert({ kind: String(b.kind), ok: sent, detail: reason || null });
  return json(sent ? { sent: true } : { sent: false, reason });
});
