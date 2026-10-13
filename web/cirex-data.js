/* Cirex · accès aux données partagé par les écrans.
   - window.CIREX.ready : résultats du pipeline NDVI (summary.json, ndvi_series.json, changes.geojson)
   - window.CIREX.db()  : client Supabase (null si la bibliothèque ou la configuration manque)
   - utilitaires de format français (dates, nombres)
   Règle du projet : aucun chiffre affiché n'est inventé. Ce qui vient d'ici est calculé ;
   ce qui n'en vient pas doit être étiqueté « fictif » ou « simulation » dans l'écran. */
(function () {
  'use strict';
  if (window.CIREX) return;
  const CFG = window.CIREX_CONFIG || {};
  const base = (CFG.dataset || 'data/kokumbo').replace(/\/+$/, '');
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const fr = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m, d }; };
  const dateFr = s => { if (!s) return '—'; const p = parse(s); return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y; };
  const monthFr = s => { if (!s) return '—'; const p = parse(s); return MONTHS[p.m - 1] + ' ' + p.y; };
  const monthLong = s => { if (!s) return '—'; const p = parse(s); return MONTHS_LONG[p.m - 1] + ' ' + p.y; };
  const periodFr = per => (per && per.length === 2 ? monthFr(per[0]) + ' → ' + monthFr(per[1]) : '—');

  const getJSON = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(url + ' · HTTP ' + r.status); return r.json(); });

  function ringsOf(geom) {
    // Leaflet attend [lat, lon] ; un polygone avec trous ou un multipolygone passent tels quels.
    const flip = ring => ring.map(c => [c[1], c[0]]);
    if (geom.type === 'Polygon') return geom.coordinates.map(flip);
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p.map(flip));
    return [];
  }

  const ready = Promise.all([getJSON(base + '/summary.json'), getJSON(base + '/ndvi_series.json'), getJSON(base + '/changes.geojson')])
    .then(([summary, series, changes]) => {
      const zones = (changes.features || []).map(f => {
        const p = f.properties || {};
        return {
          id: p.id, n: p.n, type: p.type, ha: p.surface_ha, signal: p.signal,
          ndviAvant: p.ndvi_avant, ndviApres: p.ndvi_apres, first: p.premiere_detection || null,
          centre: p.centre, poly: ringsOf(f.geometry)
        };
      });
      const img = k => (summary.images && summary.images[k] ? base + '/' + summary.images[k] : null);
      const lastAfter = (summary.apres && summary.apres.dates || []).map(d => d.date).sort().pop() || null;
      const data = {
        base, summary, series, changes, zones, synthetic: !!summary.synthetic,
        bounds: summary.images && summary.images.bounds,
        img: { avant: img('avant'), apres: img('apres'), ndviAvant: img('ndvi_avant'), ndviApres: img('ndvi_apres'), changes: img('changements') },
        lastImage: lastAfter,
        sourceLabel: summary.synthetic ? 'Données de test (synthétiques)' : 'Calculé sur Sentinel-2 L2A'
      };
      window.CIREX.data = data;
      return data;
    })
    .catch(err => { console.warn('[cirex] données satellite indisponibles :', err && err.message); window.CIREX.error = String(err && err.message || err); return null; });

  let client = null;
  function db() {
    if (client) return client;
    const lib = window.supabase;
    if (!lib || !lib.createClient || !CFG.supabaseUrl || !CFG.supabaseKey) return null;
    client = lib.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false } });
    return client;
  }

  // Appel d'une fonction Supabase (Edge Function). Le jeton Telegram n'est jamais dans le navigateur.
  function fn(name, body) {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return Promise.reject(new Error('Serveur non configuré'));
    return fetch(CFG.supabaseUrl + '/functions/v1/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey },
      body: JSON.stringify(body || {})
    }).then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }));
  }

  window.CIREX = { config: CFG, ready, data: null, error: null, db, fn, fr, dateFr, monthFr, monthLong, periodFr, MONTHS };
})();
