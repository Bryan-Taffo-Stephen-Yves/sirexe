/* Sirexe · prototype — moteur cartographique (Leaflet 1.9.4 chargé par la page).
   <orp-map>     carte de surveillance (Esri World Imagery, Sentinel-2 cloudless EOX, couches, vol d'alerte)
   <orp-compare> comparateur avant / après sur les composites Sentinel-2 L2A du pipeline NDVI
   Les zones de changement viennent de window.CIREX (changes.geojson) ; rien n'est tracé à la main.
   Les deux éléments communiquent avec la page par des évènements window « orp:* » (detail.uid). */
(function () {
  'use strict';
  if (window.ORP) return;

  const URLS = {
    esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    plan: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    places: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    hydro: 'https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/Esri_Hydro_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
    topo: 'vendor/world-atlas-2.0.2/countries-110m.json' // contour de la Côte d'Ivoire (mini-carte), hébergé avec le site
  };
  const s2 = yr => 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-' + yr + '_3857/default/g/{z}/{y}/{x}.jpg';
  const CI = [[4.35, -8.6], [10.74, -2.49]];
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Données de démonstration ---------- */
  const ST = {
    legal: { c: '#2F9E6E', l: 'Légal · permis valide' },
    noncompliant: { c: '#E07B39', l: 'Non conforme' },
    suspect: { c: '#E8B931', l: 'Suspect · à vérifier' },
    illegal: { c: '#D64545', l: 'Illégal' },
    dismantled: { c: '#6B7F99', l: 'Démantelé' }
  };
  const flip = a => a.map(p => [p[1], p[0]]);
  // Zones de changement : remplies par applyData() à partir de changes.geojson (pipeline NDVI)
  const ZONES = [];
  const LABELLED = 3;  // nombre de zones étiquetées en permanence dans le comparateur
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function blob(lat, lon, ha, seed, n) {
    const r = Math.sqrt(ha * 10000 / Math.PI), R = rng(seed), out = []; n = n || 11;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 0.8 + R() * 0.4; out.push([lat + r * k * Math.sin(a) / 110574, lon + r * k * Math.cos(a) / (111320 * Math.cos(lat * Math.PI / 180))]); }
    return out;
  }
  const SITES = [
    { id: 'ORP-0142', name: 'Kokumbo', region: 'Bélier', status: 'illegal', lat: 6.4189, lon: -5.1386, ha: 0, polys: [], real: true },
    { id: 'ORP-0087', name: 'Hiré', region: 'Lôh-Djiboua', status: 'noncompliant', lat: 6.165, lon: -5.2506, ha: 9.6 },
    { id: 'ORP-0019', name: 'Tengrela', region: 'Bagoué', status: 'legal', lat: 10.52, lon: -6.36, ha: 6.2 },
    { id: 'ORP-0203', name: 'Bouna-Est', region: 'Bounkani', status: 'suspect', lat: 9.28, lon: -2.93, ha: 3.4 },
    { id: 'ORP-0056', name: 'Dabakala', region: 'Hambol', status: 'dismantled', lat: 8.40, lon: -4.46, ha: 5.1 }
  ];
  SITES.forEach((s, i) => { if (!s.polys) s.polys = [blob(s.lat, s.lon, s.ha, 77 + i * 13)]; });
  let dataP = null;
  function applyData() {
    if (dataP) return dataP;
    const C = window.CIREX;
    dataP = (C ? C.ready : Promise.resolve(null)).then(d => {
      if (!d) return null;
      ZONES.length = 0;
      d.zones.forEach((z, i) => ZONES.push({ n: z.n, type: z.type, ha: z.ha, signal: z.signal, first: z.first, poly: z.poly, dir: i % 2 ? 'left' : 'right' }));
      const k = SITES[0]; k.ha = d.summary.surface_totale_ha; k.polys = ZONES.map(z => z.poly);
      return d;
    }).catch(() => null);
    return dataP;
  }
  const SENSORS = [
    { id: 'PH-CI-001', name: 'Station Bouna', loc: 'Bouna', lat: 9.27, lon: -3.0, state: 'normal' },
    { id: 'PH-CI-002', name: 'Station Bondoukou', loc: 'Bondoukou', lat: 8.04, lon: -2.8, state: 'normal' },
    { id: 'PH-CI-003', name: 'Station Kokumbo', loc: 'Kokumbo', lat: 6.4105, lon: -5.1462, state: 'normal' },
    { id: 'PH-CI-004', name: 'Station San Pedro', loc: 'San Pedro', lat: 4.75, lon: -6.64, state: 'vigilance' },
    { id: 'PH-CI-005', name: 'Station Man', loc: 'Man', lat: 7.41, lon: -7.55, state: 'normal' },
    { id: 'PH-CI-006', name: 'Station Odienné', loc: 'Odienné', lat: 9.51, lon: -7.56, state: 'offline' }
  ];
  const PERMITS = [
    { id: 'AEA-2024-117', type: 'aea', b: [[10.512, -6.372], [10.528, -6.348]] },
    { id: 'AEA-2023-064', type: 'aea', b: [[6.158, -5.262], [6.170, -5.250]] },
    { id: 'AESI-2025-009', type: 'aesi', b: [[8.20, -4.70], [8.26, -4.62]] },
    { id: 'PE-0058', type: 'pe', b: [[9.05, -3.55], [9.20, -3.38]] },
    { id: 'PR-0311', type: 'pr', b: [[7.60, -6.90], [7.90, -6.55]] },
    { id: 'PR-0287', type: 'pr', b: [[9.90, -6.60], [10.20, -6.25]] }
  ];
  // 242 sites génériques + 5 sites nommés = 247 (49 légaux, 12 non conformes, 34 suspects, 131 illégaux, 21 démantelés)
  const GEN = (function () {
    const R = rng(20261005), g = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const belts = [[9.25, -3.25, .35, .3, 30], [8.35, -4.55, .3, .35, 34], [6.42, -5.12, .2, .18, 25], [6.05, -5.35, .22, .25, 32], [7.0, -5.9, .25, .25, 26], [10.3, -6.3, .25, .35, 24], [7.15, -7.85, .25, .25, 22], [7.95, -6.65, .25, .25, 16], [5.85, -6.55, .25, .25, 18], [6.75, -3.45, .2, .2, 15]];
    const pool = [].concat(Array(48).fill('legal'), Array(11).fill('noncompliant'), Array(33).fill('suspect'), Array(130).fill('illegal'), Array(20).fill('dismantled'));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const used = new Set(SITES.map(s => +s.id.slice(4))), out = []; let k = 0, n = 1;
    belts.forEach(b => { for (let i = 0; i < b[4]; i++) {
      let lat, lon, tries = 0;
      do { lat = b[0] + g() * b[2]; lon = b[1] + g() * b[3]; tries++; } while (tries < 20 && (Math.hypot(lat - 6.4189, lon + 5.1386) < 0.03 || lat < 4.7 || lat > 10.5 || lon < -8.2 || lon > -2.8));
      while (used.has(n)) n++; out.push({ id: 'ORP-' + String(n).padStart(4, '0'), lat, lon, status: pool[k++] }); n++;
    } });
    return out;
  })();
  const FIRES = (function () {
    const near = [[9.295, -2.905], [9.262, -2.948], [9.301, -2.951], [8.418, -4.442], [8.386, -4.481], [6.178, -5.236], [8.52, -4.71]];
    const R = rng(4242), far = [];
    for (let i = 0; i < 16; i++) far.push([7.6 + R() * 2.9, -7.8 + R() * 5]);
    return near.concat(far);
  })();
  const POIS = {
    protected: [['Parc national de la Comoé', 8.85, -3.85], ['Parc national de Taï', 5.75, -7.12], ['Parc national de la Marahoué', 7.05, -6.0]],
    captage: [['Captage AEP · Taabo', 6.22, -5.10], ['Captage AEP · Bouna', 9.25, -2.99], ['Captage AEP · Man', 7.40, -7.53]],
    missions: [['Mission · ORP-0087 · sur site', 6.166, -5.249], ['Mission · ORP-0203 · en route', 9.28, -2.93], ['Mission · PH-CI-004 · assignée', 4.75, -6.64], ['Mission · ORP-0056 · réhabilitation', 8.40, -4.46]],
    agents: [['Koffi Kouassi · disponible', 6.50, -5.06], ['Aminata Traoré · sur site', 6.163, -5.249], ['Yao N’Guessan · en route', 9.20, -3.05], ['Mariam Coulibaly · assignée', 4.80, -6.60]]
  };

  /* ---------- Utilitaires ---------- */
  const fr = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const dms = (v, p, n) => { const a = Math.abs(v); let d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60); if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; } return d + '°' + String(m).padStart(2, '0') + '′' + String(s).padStart(2, '0') + '″ ' + (v >= 0 ? p : n); };
  const coordText = ll => fr(Math.abs(ll.lat), 5) + '° ' + (ll.lat >= 0 ? 'N' : 'S') + ' · ' + fr(Math.abs(ll.lng), 5) + '° ' + (ll.lng >= 0 ? 'E' : 'O') + '   ' + dms(ll.lat, 'N', 'S') + ' ' + dms(ll.lng, 'E', 'O');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = (fn, ms) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const v = fn(); if (v) return res(v); if (Date.now() - t0 > (ms || 20000)) return rej(new Error('orp: timeout')); setTimeout(poll, 40); })(); });
  const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function emit(uid, type, detail) { window.dispatchEvent(new CustomEvent('orp:' + type, { detail: Object.assign({ uid }, detail || {}) })); }
  function anim(ms, fn) { return new Promise(res => { if (RM) { fn(1); return res(); } const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / ms); fn(ease(k)); if (k < 1) requestAnimationFrame(f); else res(); })(t0); }); }
  function niceScale(m) { const p = Math.pow(10, Math.floor(Math.log10(m))), d = m / p; return (d >= 5 ? 5 : d >= 2 ? 2 : 1) * p; }

  const I = {
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
    legal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    noncompliant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v7"/><path d="M12 17.5h.01"/></svg>',
    suspect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 18h.01"/></svg>',
    illegal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M17 7 7 17"/><path d="m7 7 10 10"/></svg>',
    dismantled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
    tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/><path d="M9 15h6"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    mini: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/></svg>'
  };
  const SHAPE = {
    legal: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.6" fill="#2F9E6E" stroke="#fff" stroke-width="1.4"/></svg>',
    noncompliant: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.7" y="1.7" width="8.6" height="8.6" fill="#E07B39" stroke="#fff" stroke-width="1.4"/></svg>',
    suspect: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.1 11.2 10.7H.8z" fill="#E8B931" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    illegal: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 .7 11.3 6 6 11.3.7 6z" fill="#D64545" stroke="#fff" stroke-width="1.3"/></svg>',
    dismantled: '<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.1" fill="rgba(107,127,153,.35)" stroke="#6B7F99" stroke-width="2.2"/></svg>'
  };
  const FILTERS = uid => '<svg class="orp-filters" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>' +
    '<filter id="orp-exg-' + uid + '" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-2.4 4.8 -2.4 0 0.3 -2.4 4.8 -2.4 0 0.3 -2.4 4.8 -2.4 0 0.3 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.55 0.85 0.99 0.65 0.10 0.00"/><feFuncG type="table" tableValues="0.18 0.37 0.77 0.85 0.60 0.27"/><feFuncB type="table" tableValues="0.02 0.05 0.31 0.42 0.31 0.11"/></feComponentTransfer></filter>' +
    '<filter id="orp-turb-' + uid + '" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="2.5 0 -2.5 0 0.25 2.5 0 -2.5 0 0.25 2.5 0 -2.5 0 0.25 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.04 0.12 0.32 0.73 0.88 0.98"/><feFuncG type="table" tableValues="0.24 0.23 0.31 0.54 0.52 0.80"/><feFuncB type="table" tableValues="0.36 0.20 0.24 0.24 0.17 0.45"/></feComponentTransfer></filter>' +
    '</defs></svg>';

  const CSS = `
.orp-host{position:absolute;inset:0;display:block;overflow:hidden;background:linear-gradient(180deg,#0B1712 0%,#183428 100%);font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.orp-map,.orp-cmp-a,.orp-cmp-b{position:absolute;inset:0}
.orp-cmp-a{z-index:1}.orp-cmp-b{z-index:2}
.orp-host .leaflet-container{background:transparent;font:inherit;outline:none}
.orp-host .leaflet-container:focus-visible{outline:2px solid #3BB3D9;outline-offset:-2px}
.orp-di{background:none!important;border:0!important}
.orp-pin{position:absolute;left:-14px;top:-14px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
.orp-pin-dot{width:28px;height:28px;box-sizing:border-box;border-radius:50%;background:var(--c);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;transition:box-shadow .2s}
.orp-pin-dot svg{width:15px;height:15px}
.orp-pin.is-sel .orp-pin-dot,.orp-pin:hover .orp-pin-dot{box-shadow:0 0 0 5px rgba(255,255,255,.35),0 2px 8px rgba(0,0,0,.35)}
.orp-lab{font:500 12px/1 'IBM Plex Mono',ui-monospace,monospace;color:#F2F5F3;background:rgba(20,40,32,.74);border:1px solid rgba(255,255,255,.16);padding:4px 6px;border-radius:6px}
.orp-sensor{position:absolute;left:-15px;top:-15px;display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}
.orp-sdot{position:relative;width:30px;height:30px;box-sizing:border-box;border-radius:50%;background:#3BB3D9;border:2px solid #fff;display:grid;place-items:center;color:#05303F;box-shadow:0 2px 8px rgba(0,0,0,.35);z-index:1}
.orp-sdot svg{width:15px;height:15px}
.orp-s-vigilance .orp-sdot{background:#E8B931;color:#3D2E00}
.orp-s-alerte .orp-sdot{background:#D64545;color:#fff}
.orp-s-offline .orp-sdot{background:#8E9893;color:#fff;border-style:dashed}
.orp-ring{position:absolute;left:0;top:0;width:30px;height:30px;box-sizing:border-box;border-radius:50%;pointer-events:none}
.orp-s-alerte .orp-ring{border:3px solid #D64545;animation:orpRing 2s ease-out infinite}
.orp-cluster{position:absolute;left:-20px;top:-20px;width:40px;height:40px;box-sizing:border-box;border-radius:50%;background:#3BB3D9;border:2px solid #fff;display:grid;place-items:center;font:600 15px/1 Geist,sans-serif;color:#05303F;box-shadow:0 0 0 6px rgba(59,179,217,.28);cursor:pointer}
.orp-fire{position:absolute;left:-6px;top:-6px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:#FF7A1A;border:1.5px solid #fff}
.orp-fire::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:2px solid #FF7A1A;animation:orpRing 2s ease-out infinite}
.orp-mk{position:absolute;display:grid;place-items:center;width:24px;height:24px;box-sizing:border-box;left:-12px;top:-12px;border-radius:7px;border:1.5px solid #fff;color:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35)}
.orp-mk svg{width:13px;height:13px}
.orp-pt{position:absolute;left:-6px;top:-6px;width:12px;height:12px;line-height:0}
.orp-zn{position:absolute;left:-12px;top:-12px;width:24px;height:24px;box-sizing:border-box;border-radius:50%;background:#D946A8;border:2px solid #fff;color:#fff;font:600 13px/20px Geist,sans-serif;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,.4)}
.orp-km{font:500 12px/1 'IBM Plex Mono',monospace;color:#05303F;background:#3BB3D9;border-radius:6px;padding:4px 6px;white-space:nowrap;transform:translate(-50%,-50%);position:absolute}
.leaflet-tooltip.orp-tt,.leaflet-tooltip.orp-ztip{background:rgba(20,40,32,.88);color:#F2F5F3;border:1px solid rgba(255,255,255,.16);border-radius:8px;font:500 12px/1.4 Geist,sans-serif;padding:6px 9px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.leaflet-tooltip.orp-tt::before,.leaflet-tooltip.orp-ztip::before{display:none}
.leaflet-tooltip.orp-ztip{font-size:13px;padding:7px 10px}
.orp-ztip b{color:#fff;font-weight:600}
.orp-ztip span{display:block;color:rgba(255,255,255,.78);font-size:12px}
.orp-link{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:640;opacity:0;transition:opacity .35s}
.orp-read{position:absolute;left:12px;bottom:12px;z-index:650;display:flex;align-items:center;gap:10px;padding:7px 11px;border-radius:999px;background:rgba(20,40,32,.76);border:1px solid rgba(255,255,255,.14);color:#F2F5F3;font:500 12px/1 'IBM Plex Mono',ui-monospace,monospace;pointer-events:none;white-space:nowrap;max-width:50%;overflow:hidden}
.orp-scale{display:flex;align-items:center;gap:6px;flex:none}
.orp-scale i{display:block;height:5px;border:1.5px solid #F2F5F3;border-top:0}
.orp-coord{overflow:hidden;text-overflow:ellipsis}
.orp-mini{position:absolute;right:12px;bottom:32px;z-index:650;width:112px;height:104px;border-radius:12px;background:rgba(20,40,32,.76);border:1px solid rgba(255,255,255,.14);overflow:hidden;transition:width .25s,height .25s}
.orp-mini svg.orp-mini-svg{position:absolute;left:2px;top:2px;width:108px;height:100px}
.orp-mini-ci{fill:rgba(47,158,110,.38);stroke:#F2F5F3;stroke-width:1}
.orp-mini-view{fill:rgba(255,255,255,.18);stroke:#fff;stroke-width:1.5}
.orp-mini-tg{position:absolute;right:4px;top:4px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.orp-mini-tg:focus-visible{outline:2px solid #3BB3D9;outline-offset:2px}
.orp-mini.is-off{width:30px;height:30px}
.orp-mini.is-off .orp-mini-svg{display:none}
.orp-attr{position:absolute;right:12px;bottom:10px;z-index:650;max-width:60%;font:400 12px/1 Geist,sans-serif;color:rgba(255,255,255,.92);text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orp-mlab{font:500 12px/1 'IBM Plex Mono',monospace;color:#05303F;background:#F2F5F3;border-radius:6px;padding:5px 7px;white-space:nowrap;position:absolute;transform:translate(10px,-50%)}
.orp-mdot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;box-sizing:border-box;border-radius:50%;background:#fff;border:2px solid #05303F}
.orp-cmp-handle{position:absolute;top:0;bottom:0;width:44px;margin-left:-22px;z-index:660;cursor:ew-resize;touch-action:none;outline:none}
.orp-cmp-line{position:absolute;left:21px;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.orp-cmp-knob{position:absolute;left:0;top:50%;margin-top:-22px;width:44px;height:44px;box-sizing:border-box;border-radius:50%;background:rgba(20,40,32,.82);border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff}
.orp-cmp-handle:focus-visible .orp-cmp-knob{outline:2px solid #3BB3D9;outline-offset:3px}
.orp-cmp-lab{position:absolute;top:14px;z-index:655;max-width:calc(50% - 24px);box-sizing:border-box;overflow:hidden;padding:8px 12px;border-radius:12px;background:rgba(20,40,32,.76);border:1px solid rgba(255,255,255,.14);color:#F2F5F3;font:500 14px/1.3 Geist,sans-serif;pointer-events:none;transition:opacity .2s}
.orp-cmp-lab b{font-weight:600}
.orp-cmp-lab span{display:block;font-size:12px;color:rgba(255,255,255,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orp-cmp-div{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#fff;z-index:640;display:none}
@keyframes orpRing{0%{transform:scale(.7);opacity:.95}100%{transform:scale(2.3);opacity:0}}
@media (prefers-reduced-motion: reduce){.orp-host *{animation:none!important;transition:none!important}}
`;
  function injectCSS() { if (document.getElementById('orp-carto-css')) return; const s = document.createElement('style'); s.id = 'orp-carto-css'; s.textContent = CSS; document.head.appendChild(s); }

  let topoP = null;
  function ciOutline() {
    if (!topoP) topoP = fetch(URLS.topo).then(r => r.json()).then(t => waitFor(() => window.topojson, 8000).then(() => window.topojson.feature(t, t.objects.countries).features.find(f => String(f.id) === '384'))).catch(() => null);
    return topoP;
  }
  const MB = { lon0: -8.75, lat1: 10.85, k: 15.2, cx: Math.cos(7.5 * Math.PI / 180) };
  const mp = (lat, lon) => [(lon - MB.lon0) * MB.cx * MB.k + 4, (MB.lat1 - lat) * MB.k + 2];

  function makeHeat(L, pts) {
    const H = L.Layer.extend({
      onAdd(map) { this._map = map; const c = this._c = L.DomUtil.create('canvas', 'leaflet-zoom-animated'); c.style.position = 'absolute'; c.style.pointerEvents = 'none'; map.getPanes().overlayPane.appendChild(c); map.on('move zoom resize viewreset', this._req, this); map.on('zoomanim', this._za, this); this._draw(); },
      onRemove(map) { L.DomUtil.remove(this._c); map.off('move zoom resize viewreset', this._req, this); map.off('zoomanim', this._za, this); },
      _req() { if (this._f) return; this._f = requestAnimationFrame(() => { this._f = 0; this._draw(); }); },
      _za(e) { const m = this._map; L.DomUtil.setTransform(this._c, m._latLngToNewLayerPoint(m.containerPointToLatLng([0, 0]), e.zoom, e.center), m.getZoomScale(e.zoom)); },
      _draw() {
        const m = this._map; if (!m) return; const sz = m.getSize(), c = this._c;
        L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
        if (c.width !== sz.x || c.height !== sz.y) { c.width = sz.x; c.height = sz.y; }
        const ctx = c.getContext('2d'); ctx.clearRect(0, 0, sz.x, sz.y);
        const z = m.getZoom(), fade = Math.max(0, Math.min(1, (9.4 - z) / 1.4)); if (!fade || !sz.x) return;
        const r = Math.round(Math.min(56, 9 * Math.pow(1.45, z - 5.5)));
        if (this._sr !== r) { const s = this._s = document.createElement('canvas'); s.width = s.height = r * 2; const sc = s.getContext('2d'), gr = sc.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sc.fillStyle = gr; sc.fillRect(0, 0, r * 2, r * 2); this._sr = r; }
        ctx.globalAlpha = 0.11;
        for (const p of pts) { const q = m.latLngToContainerPoint(p); if (q.x < -r || q.y < -r || q.x > sz.x + r || q.y > sz.y + r) continue; ctx.drawImage(this._s, q.x - r, q.y - r); }
        ctx.globalAlpha = 1;
        if (!this._pal) { const pc = document.createElement('canvas'); pc.width = 256; pc.height = 1; const g = pc.getContext('2d'), lg = g.createLinearGradient(0, 0, 256, 0); lg.addColorStop(0, '#E8B931'); lg.addColorStop(0.45, '#E8B931'); lg.addColorStop(0.75, '#E07B39'); lg.addColorStop(1, '#D64545'); g.fillStyle = lg; g.fillRect(0, 0, 256, 1); this._pal = g.getImageData(0, 0, 256, 1).data; }
        const img = ctx.getImageData(0, 0, sz.x, sz.y), d = img.data, pal = this._pal;
        for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (!a) continue; const j = Math.min(255, a * 2) | 0; d[i - 3] = pal[j * 4]; d[i - 2] = pal[j * 4 + 1]; d[i - 1] = pal[j * 4 + 2]; d[i] = Math.min(165, a * 2.6) * fade; }
        ctx.putImageData(img, 0, 0);
      }
    });
    return new H();
  }

  /* ---------- <orp-map> ---------- */
  class OrpMap extends HTMLElement {
    static get observedAttributes() { return ['data-s3', 'data-layout']; }
    connectedCallback() {
      clearTimeout(this._kill);
      if (this._built) { if (this.map) setTimeout(() => this.map.invalidateSize(), 30); return; }
      this._built = true; injectCSS();
      this.uid = this.getAttribute('data-uid') || ('u' + Math.random().toString(36).slice(2, 7));
      this.classList.add('orp-host');
      this.innerHTML = '<div class="orp-map" aria-label="Carte satellite interactive" role="application"></div>' +
        '<svg class="orp-link"><line x1="0" y1="0" x2="0" y2="0" stroke="#fff" stroke-width="1.5" stroke-opacity=".9"/><circle r="9" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="1.5"/><circle r="3.5" fill="#fff"/><circle r="3" fill="#fff"/></svg>' +
        '<div class="orp-read"><span class="orp-scale"><i></i><span></span></span><span class="orp-coord"></span></div>' +
        '<div class="orp-mini"><svg class="orp-mini-svg" viewBox="0 0 108 100"><path class="orp-mini-ci"/><rect class="orp-mini-view" width="0" height="0"/></svg><button class="orp-mini-tg" type="button" title="Mini-carte de situation" aria-label="Replier la mini-carte">' + I.mini + '</button></div>' +
        '<div class="orp-attr">Esri, Maxar · Sentinel-2 / EOX · Copernicus Sentinel-2 L2A (zones) · feux : fictifs</div>' + FILTERS(this.uid);
      this.querySelector('.orp-mini-tg').addEventListener('click', () => this.querySelector('.orp-mini').classList.toggle('is-off'));
      waitFor(() => window.L).then(() => applyData()).then(() => this._setup()).catch(e => console.warn('orp-map', e && e.message, e && e.stack));
    }
    disconnectedCallback() { this._kill = setTimeout(() => { this._seq = null; cancelAnimationFrame(this._raf); if (this.map) { this.map.remove(); this.map = null; } this._built = false; this.innerHTML = ''; }, 800); }
    attributeChangedCallback(n) { if (!this.map) return; if (n === 'data-s3') this._sensorIcons(); if (n === 'data-layout') { setTimeout(() => this.map && this.map.invalidateSize(), 60); setTimeout(() => this.map && this.map.invalidateSize(), 400); } }
    get cardId() { return this.getAttribute('data-card'); }

    _setup() {
      const L = window.L, uid = this.uid;
      const map = this.map = L.map(this.querySelector('.orp-map'), { zoomControl: false, attributionControl: false, zoomSnap: 0.1, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, minZoom: 4.5, maxZoom: 18, worldCopyJump: false });
      map.setView([7.55, -5.55], 6.6, { animate: false });
      map.createPane('ref').style.zIndex = 250; map.getPane('ref').style.pointerEvents = 'none';
      this.on = { heat: true, sensors: true, alerts: true, zones: true, legal: true, noncompliant: true, suspect: true, illegal: true, dismantled: true, pe: true, aesi: true, aea: true, pr: false, rivers: false, captage: false, protected: true, firms: true, missions: false, agents: false, places: true };
      this.bases = {
        esri: L.tileLayer(URLS.esri, { maxNativeZoom: 17, maxZoom: 18, crossOrigin: true, keepBuffer: 1 }),
        s2: L.tileLayer(s2(2025), { maxNativeZoom: 14, maxZoom: 18, crossOrigin: true, keepBuffer: 1 }),
        plan: L.tileLayer(URLS.plan, { maxNativeZoom: 18, maxZoom: 18, crossOrigin: true, keepBuffer: 1 })
      };
      this.refs = { places: L.tileLayer(URLS.places, { pane: 'ref', maxNativeZoom: 18, maxZoom: 18, crossOrigin: true, keepBuffer: 1 }), hydro: L.tileLayer(URLS.hydro, { pane: 'ref', maxNativeZoom: 16, maxZoom: 18, opacity: 0.9, crossOrigin: true, keepBuffer: 1 }) };
      this.base = 'esri'; this.s2year = 2025; this.bases.esri.addTo(map);
      this.R = L.svg({ padding: 0.5 }).addTo(map);
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = '<pattern id="orp-hi-' + uid + '" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(214,69,69,0.28)"/><rect width="2.6" height="7" fill="#D64545"/></pattern><pattern id="orp-hn-' + uid + '" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)"><rect width="5" height="5" fill="rgba(224,123,57,0.22)"/><rect width="1.2" height="5" fill="#E07B39"/></pattern>';
      this.R._container.insertBefore(defs, this.R._container.firstChild);
      const G = this.G = {}, grp = k => (G[k] = L.layerGroup());
      const R = this.R;
      this.heat = makeHeat(L, GEN.map(p => [p.lat, p.lon]).concat(SITES.map(s => [s.lat, s.lon])));
      Object.keys(ST).forEach(s => { grp('pts_' + s); grp('pin_' + s); grp('poly_' + s); });
      GEN.forEach(p => { G['pts_' + p.status].addLayer(L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-pt">' + SHAPE[p.status] + '</span>', iconSize: [0, 0] }), keyboard: false }).bindTooltip(p.id + ' · ' + ST[p.status].l, { className: 'orp-tt', direction: 'top', offset: [0, -8] })); });
      const polyStyle = s => {
        const c = ST[s].c;
        if (s === 'illegal') return { color: c, weight: 2, fillColor: 'url(#orp-hi-' + uid + ')', fillOpacity: 1 };
        if (s === 'noncompliant') return { color: c, weight: 2, fillColor: 'url(#orp-hn-' + uid + ')', fillOpacity: 1 };
        if (s === 'suspect') return { color: c, weight: 2.2, dashArray: '7 5', fillColor: c, fillOpacity: 0.14 };
        if (s === 'dismantled') return { color: c, weight: 1.3, fillColor: c, fillOpacity: 0.12 };
        return { color: c, weight: 2, fillColor: c, fillOpacity: 0.18 };
      };
      this.pins = {};
      SITES.forEach(s => {
        s.polys.forEach(p => G['poly_' + s.status].addLayer(L.polygon(p, Object.assign({ renderer: R }, polyStyle(s.status))).on('click', () => this.select(s.id, true))));
        const mk = L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'orp-di', html: '<div class="orp-pin" style="--c:' + ST[s.status].c + '"><span class="orp-pin-dot">' + I[s.status] + '</span><span class="orp-lab">' + s.id + '</span></div>', iconSize: [0, 0] }), title: s.id + ' · ' + s.name + ' · ' + ST[s.status].l, riseOnHover: true, zIndexOffset: 500 }).on('click', () => this.select(s.id, true));
        this.pins[s.id] = mk; G['pin_' + s.status].addLayer(mk);
      });
      grp('zones'); this.zoneLayers = [];
      ZONES.forEach(z => {
        const pl = L.polygon(z.poly, { renderer: R, color: '#D946A8', weight: 2.4, fillColor: '#D946A8', fillOpacity: 0.16, interactive: true }).on('click', () => this.select('ORP-0142', true))
          .bindTooltip('Zone ' + z.n + ' · ' + z.type + ' · ' + fr(z.ha, 1) + ' ha · baisse NDVI ' + fr(z.signal, 2), { className: 'orp-tt', sticky: true });
        const c = pl.getBounds().getCenter();
        this.zoneLayers.push(pl); G.zones.addLayer(pl);
        if (z.n <= LABELLED) { const nb = L.marker(c, { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-zn">' + z.n + '</span>', iconSize: [0, 0] }), interactive: false }); this.zoneLayers.push(nb); G.zones.addLayer(nb); }
      });
      ['pe', 'aesi', 'aea', 'pr'].forEach(t => grp('permit_' + t));
      PERMITS.forEach(p => G['permit_' + p.type].addLayer(L.rectangle(p.b, { renderer: R, color: p.type === 'pe' ? '#C9A227' : '#F2F5F3', weight: p.type === 'pe' ? 2.2 : 1.6, dashArray: p.type === 'pr' ? '2 6' : '9 5', fill: true, fillOpacity: 0.04, fillColor: '#F2F5F3' }).bindTooltip(p.id + ' · ' + ({ pe: 'Permis d’exploitation industrielle', aesi: 'Autorisation semi-industrielle', aea: 'Autorisation artisanale', pr: 'Permis de recherche' })[p.type] + ' (fictif)', { className: 'orp-tt', sticky: true })));
      grp('sensors'); this.smk = {};
      SENSORS.forEach(s => { const mk = L.marker([s.lat, s.lon], { icon: this._sIcon(s), title: s.id + ' · ' + s.name, zIndexOffset: 800 }); this.smk[s.id] = mk; G.sensors.addLayer(mk); });
      grp('fires'); FIRES.forEach(f => G.fires.addLayer(L.marker(f, { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-fire"></span>', iconSize: [0, 0] }), keyboard: false }).bindTooltip('Feu fictif (démonstration) · couche NASA FIRMS à brancher', { className: 'orp-tt', direction: 'top', offset: [0, -8] })));
      const poi = (k, bg, ic) => { grp(k); POIS[k].forEach(p => G[k].addLayer(L.marker([p[1], p[2]], { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-mk" style="background:' + bg + '">' + ic + '</span>', iconSize: [0, 0] }), keyboard: false }).bindTooltip(p[0], { className: 'orp-tt', direction: 'top', offset: [0, -14] }))); };
      poi('protected', '#2F7A57', I.leaf); poi('captage', '#1D7FA0', I.tap); poi('missions', '#33413B', I.flag); poi('agents', '#2B5FA8', I.user);
      grp('circle'); grp('measure');
      map.on('zoomend', () => { this._sync(); this._emitView(); });
      map.on('move zoom', () => { this._scale(); this._miniView(); });
      map.on('mousemove', e => { this.querySelector('.orp-coord').textContent = coordText(e.latlng); });
      map.on('click', e => this._measureClick(e));
      map.on('dblclick', () => { if (this.measuring) this.toggleMeasure(false); });
      document.addEventListener('fullscreenchange', () => setTimeout(() => this.map && this.map.invalidateSize(), 150));
      map.invalidateSize(); map.fitBounds(CI, { padding: [14, 14], animate: false });
      this.querySelector('.orp-coord').textContent = coordText(map.getCenter());
      this._sync(); this._scale();
      ciOutline().then(f => { if (!f) return; const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; this.querySelector('.orp-mini-ci').setAttribute('d', rings.map(poly => poly.map(r => 'M' + r.map(c => mp(c[1], c[0]).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('')).join('')); this._miniView(); });
      new ResizeObserver(() => { if (!this.map) return; this.map.invalidateSize(); if (!this._userMoved && !this._seq) { if (this.mode === 'alerte') { const v = this._siteView(); this.map.setView(v.center, v.zoom, { animate: false }); } else this.map.fitBounds(CI, { padding: [14, 14], animate: false }); } }).observe(this);
      ['mousedown', 'wheel', 'touchstart', 'keydown'].forEach(t => this.querySelector('.orp-map').addEventListener(t, () => { this._userMoved = true; }, { passive: true }));
      this.ready = true; this._emit('ready'); this._emitView();
    }
    _emit(t, d) { emit(this.uid, t, d); }
    _emitView() { if (this.map) this._emit('view', { zoom: this.map.getZoom(), base: this.base, s2year: this.s2year, tilted: !!this.tilted, measuring: !!this.measuring, on: Object.assign({}, this.on) }); }
    _s3() { return this.getAttribute('data-s3') || 'normal'; }
    _sIcon(s) { const st = s.id === 'PH-CI-003' ? this._s3() : s.state; return window.L.divIcon({ className: 'orp-di', html: '<div class="orp-sensor orp-s-' + st + '"><span class="orp-ring"></span><span class="orp-sdot">' + I.drop + '</span><span class="orp-lab">' + s.id + (st === 'offline' ? ' · hors ligne' : '') + '</span></div>', iconSize: [0, 0] }); }
    _sensorIcons() { const s = SENSORS[2]; if (this.smk && this.smk[s.id]) this.smk[s.id].setIcon(this._sIcon(s)); }
    _sync() {
      const m = this.map, z = m.getZoom(), on = this.on, L = window.L;
      const show = (ly, c) => { if (c) { if (!m.hasLayer(ly)) m.addLayer(ly); } else if (m.hasLayer(ly)) m.removeLayer(ly); };
      show(this.heat, on.heat && z < 9.4);
      Object.keys(ST).forEach(s => { show(this.G['pts_' + s], on[s] && z >= 7.4); show(this.G['pin_' + s], on[s] && z < 13.6); show(this.G['poly_' + s], on[s] && z >= 10.5); });
      show(this.G.zones, on.zones && z >= 10.5);
      ['pe', 'aesi', 'aea', 'pr'].forEach(t => show(this.G['permit_' + t], on[t] && z >= 8.2));
      show(this.G.sensors, on.sensors); show(this.G.fires, on.firms); show(this.G.protected, on.protected); show(this.G.captage, on.captage); show(this.G.missions, on.missions); show(this.G.agents, on.agents);
      show(this.G.circle, true); show(this.G.measure, true);
      show(this.refs.places, on.places); show(this.refs.hydro, on.rivers);
      // regroupement des capteurs à petite échelle
      (this.clusters || []).forEach(c => this.G.sensors.removeLayer(c)); this.clusters = [];
      SENSORS.forEach(s => { if (!this.G.sensors.hasLayer(this.smk[s.id])) this.G.sensors.addLayer(this.smk[s.id]); });
      if (z < 6.3) {
        const pts = SENSORS.map(s => ({ s, p: m.latLngToContainerPoint([s.lat, s.lon]) })), used = new Set();
        pts.forEach(a => { if (used.has(a.s.id)) return; const grpd = pts.filter(b => !used.has(b.s.id) && a.p.distanceTo(b.p) < 72); if (grpd.length < 2) return; grpd.forEach(b => { used.add(b.s.id); this.G.sensors.removeLayer(this.smk[b.s.id]); }); const lat = grpd.reduce((t, b) => t + b.s.lat, 0) / grpd.length, lon = grpd.reduce((t, b) => t + b.s.lon, 0) / grpd.length; const c = L.marker([lat, lon], { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-cluster">' + grpd.length + '</span>', iconSize: [0, 0] }), title: grpd.length + ' capteurs' }).on('click', () => m.flyTo([lat, lon], m.getZoom() + 1.5)); this.clusters.push(c); this.G.sensors.addLayer(c); });
      }
    }
    _scale() {
      const m = this.map, h = m.getSize().y / 2, a = m.containerPointToLatLng([0, h]), b = m.containerPointToLatLng([100, h]), d = a.distanceTo(b), n = niceScale(d), w = Math.round(100 * n / d);
      const el = this.querySelector('.orp-scale'); el.firstChild.style.width = w + 'px'; el.lastChild.textContent = n >= 1000 ? fr(n / 1000, 0) + ' km' : fr(n, 0) + ' m';
    }
    _miniView() {
      const r = this.querySelector('.orp-mini-view'); if (!r || !this.map) return; const b = this.map.getBounds();
      if (this.map.getZoom() < 6.6) { r.setAttribute('width', 0); r.setAttribute('height', 0); return; }
      const p1 = mp(Math.min(b.getNorth(), 10.85), Math.max(b.getWest(), -8.75)), p2 = mp(Math.max(b.getSouth(), 4.2), Math.min(b.getEast(), -2.3));
      let w = p2[0] - p1[0], hh = p2[1] - p1[1], x = p1[0], y = p1[1]; if (w < 4) { x -= (4 - w) / 2; w = 4; } if (hh < 4) { y -= (4 - hh) / 2; hh = 4; }
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(0, w)); r.setAttribute('height', Math.max(0, hh));
    }
    _linkLoop() {
      cancelAnimationFrame(this._raf);
      const step = () => { this._link(); if (this.sel && this.isConnected) this._raf = requestAnimationFrame(step); };
      this._raf = requestAnimationFrame(step);
    }
    _link() {
      const svg = this.querySelector('.orp-link'); if (!svg || !this.map) return;
      const card = this.cardId && document.getElementById(this.cardId);
      if (!this.sel || !card || this.tilted) { svg.style.opacity = 0; return; }
      const s = SITES.find(x => x.id === this.sel), hr = this.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const k = hr.width / (this.offsetWidth || hr.width || 1);
      if (!cr.width || !hr.width) { svg.style.opacity = 0; return; }
      const p = this.map.latLngToContainerPoint([s.lat, s.lon]);
      const L0 = (cr.left - hr.left) / k, T0 = (cr.top - hr.top) / k, W = cr.width / k, Hh = cr.height / k;
      const inside = p.x > L0 - 6 && p.x < L0 + W + 6 && p.y > T0 - 6 && p.y < T0 + Hh + 6;
      const off = p.x < -20 || p.y < -20 || p.x > this.offsetWidth + 20 || p.y > this.offsetHeight + 20;
      if (inside || off) { svg.style.opacity = 0; return; }
      const ex = p.x < L0 ? L0 : L0 + W, ey = T0 + 30;
      const [ln, c1, c2, c3] = svg.children;
      ln.setAttribute('x1', p.x); ln.setAttribute('y1', p.y); ln.setAttribute('x2', ex); ln.setAttribute('y2', ey);
      c1.setAttribute('cx', p.x); c1.setAttribute('cy', p.y); c2.setAttribute('cx', p.x); c2.setAttribute('cy', p.y); c3.setAttribute('cx', ex); c3.setAttribute('cy', ey);
      svg.style.opacity = 1;
    }
    _siteView() {
      const m = this.map, L = window.L, sz = m.getSize(), z = sz.y > 600 ? 15.2 : 14.8, s = SITES[0];
      const card = this.cardId && document.getElementById(this.cardId); const cw = card && card.offsetWidth ? card.offsetWidth + 70 : 360;
      const off = sz.x > 700 ? cw / 2 : 0;
      return { center: m.unproject(m.project([s.lat, s.lon], z).add([off, -10]), z), zoom: z };
    }
    _circleZoom() { const h = this.map.getSize().y || 480; return Math.log2(156543.03 * Math.cos(6.41 * Math.PI / 180) / (5000 / (0.36 * h))); }
    _circle(k) {
      const L = window.L, S = SENSORS[2];
      if (!this.circ) { this.circ = L.circle([S.lat, S.lon], { renderer: this.R, radius: 1, color: '#3BB3D9', weight: 2.2, dashArray: '5 7', fillColor: '#3BB3D9', fillOpacity: 0.07, interactive: false }); this.circLab = L.marker([S.lat + 5000 / 110574, S.lon], { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-km">Rayon d’analyse 5 km</span>', iconSize: [0, 0] }), interactive: false }); }
      if (k <= 0) { this.G.circle.removeLayer(this.circ); this.G.circle.removeLayer(this.circLab); return; }
      this.circ.setRadius(5000 * k); if (!this.G.circle.hasLayer(this.circ)) this.G.circle.addLayer(this.circ);
      if (k >= 1) this.G.circle.addLayer(this.circLab); else this.G.circle.removeLayer(this.circLab);
    }
    _zoneOpacity(k) { this.zoneLayers.forEach(l => { if (l.setStyle) l.setStyle({ opacity: k, fillOpacity: 0.16 * k }); else if (l.setOpacity) l.setOpacity(k); }); }
    _fly(ll, z, d) { return new Promise(res => { const m = this.map; if (RM) { m.setView(ll, z, { animate: false }); return res(); } let done = false; const fin = () => { if (!done) { done = true; res(); } }; m.once('moveend', fin); setTimeout(fin, d * 1000 + 1200); m.flyTo(ll, z, { duration: d, easeLinearity: 0.2 }); }); }

    /* API publique */
    zoomIn() { this.map && this.map.zoomIn(0.5); }
    zoomOut() { this.map && this.map.zoomOut(0.5); }
    flyTo(lat, lon, z) { if (this.map) this._fly([lat, lon], z || 12.5, 2); }
    north() { if (this.tilted) this.toggleTilt(); }
    recenter() { this.map && this.map.flyToBounds(CI, { padding: [14, 14], duration: RM ? 0 : 1.6 }); }
    fullscreen() { const c = this.closest('[data-orp-card]') || this; if (document.fullscreenElement) document.exitFullscreen(); else if (c.requestFullscreen) c.requestFullscreen(); }
    toggleTilt() {
      this.tilted = !this.tilted; const el = this.querySelector('.orp-map');
      el.style.transformOrigin = '50% 64%'; el.style.transition = RM ? 'none' : 'transform 900ms cubic-bezier(.4,0,.2,1)';
      el.style.transform = this.tilted ? 'perspective(1100px) rotateX(40deg) scale(1.5)' : '';
      this.map.dragging[this.tilted ? 'disable' : 'enable'](); this._emitView();
    }
    toggleMeasure(force) {
      this.measuring = typeof force === 'boolean' ? force : !this.measuring; this.mpts = []; this.G.measure.clearLayers();
      this.map.getContainer().style.cursor = this.measuring ? 'crosshair' : ''; this.map.doubleClickZoom[this.measuring ? 'disable' : 'enable'](); this._emitView();
    }
    _measureClick(e) {
      if (!this.measuring) return; const L = window.L; this.mpts.push(e.latlng); this.G.measure.clearLayers();
      let d = 0; for (let i = 1; i < this.mpts.length; i++) d += this.mpts[i - 1].distanceTo(this.mpts[i]);
      if (this.mpts.length > 1) this.G.measure.addLayer(L.polyline(this.mpts, { renderer: this.R, color: '#F2F5F3', weight: 2.5, dashArray: '6 6', interactive: false }));
      this.mpts.forEach(p => this.G.measure.addLayer(L.marker(p, { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-mdot"></span>', iconSize: [0, 0] }), interactive: false })));
      const t = d >= 1000 ? fr(d / 1000, 2) + ' km' : fr(d, 0) + ' m';
      this.G.measure.addLayer(L.marker(e.latlng, { icon: L.divIcon({ className: 'orp-di', html: '<span class="orp-mlab">' + (this.mpts.length > 1 ? t : 'Cliquez pour mesurer') + '</span>', iconSize: [0, 0] }), interactive: false }));
    }
    setBase(name) {
      if (!this.map) return; const want = name === 'ndvi' || name === 'turb' ? 's2' : name;
      Object.keys(this.bases).forEach(k => { const ly = this.bases[k]; if (k === want) { if (!this.map.hasLayer(ly)) ly.addTo(this.map); } else if (this.map.hasLayer(ly)) this.map.removeLayer(ly); });
      this.map.getPane('tilePane').style.filter = name === 'ndvi' ? 'url(#orp-exg-' + this.uid + ')' : name === 'turb' ? 'url(#orp-turb-' + this.uid + ')' : '';
      this.base = name; this._emitView();
    }
    setS2Year(y) { this.s2year = y; this.bases.s2.setUrl(s2(y)); this._emitView(); }
    setLayer(k, v) { if (!this.on) return; this.on[k] = typeof v === 'boolean' ? v : !this.on[k]; this._sync(); this._emitView(); }
    select(id, fromUser) {
      const L = window.L; if (!this.map) return;
      Object.keys(this.pins).forEach(k => { const el = this.pins[k].getElement(); if (el && el.firstChild) el.firstChild.classList.toggle('is-sel', k === id); });
      if (this.selLayer) { this.map.removeLayer(this.selLayer); this.selLayer = null; }
      this.sel = id || null; this._emit('select', { id: this.sel, fromUser: !!fromUser });
      if (!id) { this._link(); return; }
      const s = SITES.find(x => x.id === id); if (!s) return;
      this.selLayer = L.layerGroup(s.polys.map(p => L.polygon(p, { renderer: this.R, color: '#FFFFFF', weight: 2, dashArray: '5 6', fill: false, interactive: false }))).addTo(this.map);
      this._linkLoop();
      if (fromUser && this.map.getZoom() < 12) {
        const z = 14.4, sz = this.map.getSize(), card = this.cardId && document.getElementById(this.cardId), off = sz.x > 700 ? ((card && card.offsetWidth) || 300) / 2 + 35 : 0;
        this._fly(this.map.unproject(this.map.project([s.lat, s.lon], z).add([off, -10]), z), z, 2.2);
      }
    }
    setMode(mode) {
      if (!this.map) return; this._seq = null; this.mode = mode; this._userMoved = false;
      if (mode === 'alerte') { this.setBase('s2'); const v = this._siteView(); this.map.setView(v.center, v.zoom, { animate: false }); this._circle(1); this._zoneOpacity(1); this.select('ORP-0142'); }
      else { this.select(null); this._circle(0); this._zoneOpacity(1); this.setBase('esri'); this.map.fitBounds(CI, { padding: [14, 14], animate: false }); }
      this._sync();
    }
    async playAlert() {
      if (!this.map) return; const tok = this._seq = {}; const alive = () => this._seq === tok && this.isConnected && this.map;
      this.select(null); this._circle(0); this._zoneOpacity(0); this.setBase('esri');
      if (this.map.getZoom() > 7.8) this.map.fitBounds(CI, { padding: [14, 14], animate: false });
      this._emit('seq', { step: 'vol' });
      const S = SENSORS[2];
      await this._fly([S.lat, S.lon], this._circleZoom(), 3.6); if (!alive()) return;
      this._emit('seq', { step: 'cercle' });
      await anim(900, k => this._circle(k)); if (!alive()) return;
      await sleep(450); if (!alive()) return;
      this.setBase('s2');
      const v = this._siteView(); await this._fly(v.center, v.zoom, 1.8); if (!alive()) return;
      this._emit('seq', { step: 'zones' });
      await anim(900, k => this._zoneOpacity(k)); if (!alive()) return;
      this.select('ORP-0142'); this._emit('seq', { step: 'fin' });
    }
    search(q) {
      q = (q || '').trim(); if (!q || !this.map) return null; let parts = null;
      if (q.includes(';')) parts = q.split(';');
      else if (/^\s*-?\d+(\.\d+)?\s*[,\s]\s*-?\d+(\.\d+)?\s*$/.test(q)) parts = q.split(/[,\s]+/).filter(Boolean);
      else if (/^\s*-?\d+,\d+\s+-?\d+,\d+\s*$/.test(q)) parts = q.trim().split(/\s+/);
      if (parts && parts.length === 2) { const lat = parseFloat(parts[0].replace(',', '.')), lon = parseFloat(parts[1].replace(',', '.')); if (isFinite(lat) && isFinite(lon)) { this._fly([lat, lon], 14, 2.2); return { label: 'Coordonnées ' + fr(lat, 4) + ' · ' + fr(lon, 4) }; } }
      const n = norm(q);
      const site = SITES.find(s => norm(s.id + ' ' + s.name + ' ' + s.region).includes(n)); if (site) { this.select(site.id, true); if (this.map.getZoom() >= 12) this._fly([site.lat, site.lon], 14.4, 1.6); return { label: site.id + ' · ' + site.name }; }
      const sen = SENSORS.find(s => norm(s.id + ' ' + s.name + ' ' + s.loc).includes(n)); if (sen) { this._fly([sen.lat, sen.lon], 12.5, 2.2); return { label: sen.id + ' · ' + sen.name }; }
      const per = PERMITS.find(p => norm(p.id).includes(n)); if (per) { this.map.flyToBounds(per.b, { padding: [60, 60], duration: 2 }); return { label: per.id }; }
      const gen = GEN.find(p => norm(p.id) === n); if (gen) { this._fly([gen.lat, gen.lon], 13, 2); return { label: gen.id }; }
      return null;
    }
  }


  /* ---------- <orp-compare> ----------
     Avant / après = composites médians Sentinel-2 L2A produits par pipeline/ndvi_pipeline.py
     (avant.jpg, apres.jpg, ndvi_*.png, changements.png). Les mosaïques EOX servent seulement de
     fond de contexte, assombri, autour du carré analysé. */
  class OrpCompare extends HTMLElement {
    static get observedAttributes() { return ['data-mode', 'data-index', 'data-opacity']; }
    connectedCallback() {
      clearTimeout(this._kill);
      if (this._built) { setTimeout(() => this._apply(), 30); return; }
      this._built = true; injectCSS();
      this.uid = this.getAttribute('data-uid') || ('c' + Math.random().toString(36).slice(2, 7));
      this.split = 0.5;
      this.classList.add('orp-host');
      this.innerHTML = '<div class="orp-cmp-a" aria-label="Image avant"></div><div class="orp-cmp-b" aria-label="Image après"></div><div class="orp-cmp-div"></div>' +
        '<div class="orp-cmp-lab orp-cmp-lab-a"></div><div class="orp-cmp-lab orp-cmp-lab-b"></div>' +
        '<div class="orp-cmp-handle" tabindex="0" role="slider" aria-label="Position du curseur de balayage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span class="orp-cmp-line"></span><span class="orp-cmp-knob">' + I.chevL + I.chevR + '</span></div>' +
        '<div class="orp-read"><span class="orp-scale"><i></i><span></span></span><span class="orp-coord"></span></div>' +
        '<div class="orp-attr">Contains modified Copernicus Sentinel-2 data · fond : Sentinel-2 cloudless © EOX (CC BY-NC-SA 4.0)</div>';
      const h = this.querySelector('.orp-cmp-handle');
      const setX = cx => { this._userSplit = true; const r = this.getBoundingClientRect(); this.split = Math.max(0.02, Math.min(0.98, (cx - r.left) / r.width)); this._clip(); };
      h.addEventListener('pointerdown', e => { h.setPointerCapture(e.pointerId); setX(e.clientX); const mv = ev => setX(ev.clientX), up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); }; h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); });
      h.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this._userSplit = true; this.split = Math.max(0.02, Math.min(0.98, this.split + (e.key === 'ArrowLeft' ? -0.03 : 0.03))); this._clip(); e.preventDefault(); } });
      waitFor(() => window.L).then(() => applyData()).then(d => { this.data = d; this._setup(); }).catch(e => console.warn('orp-compare', e && e.message, e && e.stack));
    }
    disconnectedCallback() { clearInterval(this._blink); this._kill = setTimeout(() => { if (this.A) { this.A.remove(); this.B.remove(); this.A = this.B = null; } this._built = false; this.innerHTML = ''; }, 800); }
    attributeChangedCallback() { if (this.A) this._apply(); }
    _labels() {
      const d = this.data, S = d && d.summary, C = window.CIREX;
      if (!S) return ['<b>Avant</b><span>Données satellite indisponibles</span>', '<b>Après</b><span>Données satellite indisponibles</span>'];
      const one = (k, t) => '<b>' + t + '</b> · ' + C.periodFr(S[k].periode) + '<span>Médiane de ' + S[k].dates.length + ' images Sentinel-2 L2A sans nuages' + (d.synthetic ? ' · test' : '') + '</span>';
      return [one('avant', 'Avant'), one('apres', 'Après')];
    }
    _setup() {
      const L = window.L, d = this.data, S = d && d.summary;
      const y0 = S ? Math.min(2025, +S.avant.periode[1].slice(0, 4)) : 2019, y1 = S ? Math.min(2025, +S.apres.periode[0].slice(0, 4)) : 2025;
      const center = S ? [S.aoi.lat, S.aoi.lon] : [6.4189, -5.1386];
      const mk = (el, yr, imgs) => {
        const m = L.map(el, { zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, zoomAnimation: false, minZoom: 11, maxZoom: 17, wheelPxPerZoomLevel: 120 }).setView(center, 14, { animate: false });
        L.tileLayer(s2(yr), { maxNativeZoom: 14, maxZoom: 17, crossOrigin: true }).addTo(m);
        m.createPane('cmp').style.zIndex = 350; m.createPane('chg').style.zIndex = 360;
        m._ov = {};
        if (d && d.bounds) Object.keys(imgs).forEach(k => { if (imgs[k]) m._ov[k] = L.imageOverlay(imgs[k], d.bounds, { pane: k === 'changes' ? 'chg' : 'cmp', interactive: false }); });
        m._R = L.svg({ padding: 0.5 }).addTo(m);
        if (S) L.circle(center, { renderer: m._R, radius: S.aoi.rayon_m, color: '#FFFFFF', weight: 1.4, dashArray: '4 6', fill: false, interactive: false }).addTo(m);
        return m;
      };
      this.A = mk(this.querySelector('.orp-cmp-a'), y0, d ? { naturel: d.img.avant, vegetation: d.img.ndviAvant } : {});
      this.B = mk(this.querySelector('.orp-cmp-b'), y1, d ? { naturel: d.img.apres, vegetation: d.img.ndviApres, changes: d.img.changes } : {});
      const [la, lb] = this._labels(); this.querySelector('.orp-cmp-lab-a').innerHTML = la; this._labB = lb;
      // cadrage initial : les zones proches du site (1,5 km), sinon toutes
      const near = ZONES.filter(z => L.polygon(z.poly).getBounds().getCenter().distanceTo(center) < 1500);
      const all = []; (near.length ? near : ZONES).forEach(z => all.push(L.polygon(z.poly).getBounds()));
      this.home = all.length ? all.reduce((b, x) => b.extend(x), L.latLngBounds(all[0].getSouthWest(), all[0].getNorthEast())).pad(0.15) : (d && d.bounds ? L.latLngBounds(d.bounds) : L.latLng(center).toBounds(4000));
      this.A.fitBounds(this.home, { maxZoom: 15.5, animate: false }); this.B.setView(this.A.getCenter(), this.A.getZoom(), { animate: false });
      let lock = false; const sync = (a, b) => a.on('move zoom', () => { if (lock) return; lock = true; b.setView(a.getCenter(), a.getZoom(), { animate: false }); lock = false; this._scale(); });
      sync(this.A, this.B); sync(this.B, this.A);
      [this.A, this.B].forEach(m => m.on('mousemove', e => { this.querySelector('.orp-coord').textContent = coordText(e.latlng); }));
      this.zl = { A: [], B: [] };
      ZONES.forEach(z => {
        const a = L.polygon(z.poly, { renderer: this.A._R, color: '#D946A8', weight: 2, dashArray: '6 5', fill: false, interactive: false }).addTo(this.A);
        const b = L.polygon(z.poly, { renderer: this.B._R, color: '#D946A8', weight: 2.4, fillColor: '#D946A8', fillOpacity: 0.2 }).addTo(this.B);
        const tip = '<b>Zone ' + z.n + '</b> · ' + z.type + '<span>' + fr(z.ha, 1) + ' ha · baisse du NDVI ' + fr(z.signal, 2) + (z.first ? ' · 1re baisse ' + window.CIREX.monthFr(z.first) : '') + '</span>';
        if (z.n <= LABELLED) {
          b.bindTooltip(tip, { permanent: true, direction: z.dir, className: 'orp-ztip', offset: z.dir === 'left' ? [-14, 0] : [14, 0] });
          const c = b.getBounds().getCenter(), ic = () => L.divIcon({ className: 'orp-di', html: '<span class="orp-zn">' + z.n + '</span>', iconSize: [0, 0] });
          L.marker(c, { icon: ic(), interactive: false }).addTo(this.A); L.marker(c, { icon: ic(), interactive: false }).addTo(this.B);
        } else b.bindTooltip(tip, { sticky: true, className: 'orp-ztip' });
        this.zl.A.push(a); this.zl.B.push(b);
      });
      new ResizeObserver(() => { if (this.A) { this.A.invalidateSize(); this.B.invalidateSize(); if (!this._userMoved) { this.A.fitBounds(this.home, { maxZoom: 15.5, animate: false }); this.B.setView(this.A.getCenter(), this.A.getZoom(), { animate: false }); this._autoSplit(); } this._clip(); } }).observe(this);
      ['mousedown', 'wheel', 'touchstart'].forEach(t => [this.querySelector('.orp-cmp-a'), this.querySelector('.orp-cmp-b')].forEach(el => el.addEventListener(t, () => { this._userMoved = true; }, { passive: true })));
      this.querySelector('.orp-coord').textContent = coordText(this.A.getCenter());
      this._autoSplit(); this._apply(); this._scale(); emit(this.uid, 'ready');
    }
    _scale() { const m = this.A; if (!m) return; const h = m.getSize().y / 2, a = m.containerPointToLatLng([0, h]), b = m.containerPointToLatLng([100, h]), d = a.distanceTo(b), n = niceScale(d), w = Math.round(100 * n / d); const el = this.querySelector('.orp-scale'); el.firstChild.style.width = w + 'px'; el.lastChild.textContent = n >= 1000 ? fr(n / 1000, 0) + ' km' : fr(n, 0) + ' m'; }
    _clip() {
      const b = this.querySelector('.orp-cmp-b'), h = this.querySelector('.orp-cmp-handle'); if (!b) return;
      if ((this.getAttribute('data-mode') || 'balayage') !== 'balayage') return;
      b.style.clipPath = 'inset(0 0 0 ' + (this.split * 100) + '%)'; h.style.left = (this.split * 100) + '%'; h.setAttribute('aria-valuenow', Math.round(this.split * 100));
      this.querySelector('.orp-cmp-lab-a').style.opacity = this.split < 0.3 ? 0 : 1; this.querySelector('.orp-cmp-lab-b').style.opacity = this.split > 0.7 ? 0 : 1;
    }
    _autoSplit() {
      if (!this.A || this._userSplit || !ZONES.length) return; const c = window.L.polygon(ZONES[0].poly).getBounds().getCenter(), w = this.A.getSize().x;
      if (w) this.split = Math.max(0.15, Math.min(0.85, this.A.latLngToContainerPoint(c).x / w)); this._clip();
    }
    _show(m, key) { Object.keys(m._ov).forEach(k => { const on = k === key || (key === 'changes+' && (k === 'naturel' || k === 'changes')); if (on && !m.hasLayer(m._ov[k])) m._ov[k].addTo(m); else if (!on && m.hasLayer(m._ov[k])) m.removeLayer(m._ov[k]); }); }
    _apply() {
      if (!this.A) return; clearInterval(this._blink);
      const mode = this.getAttribute('data-mode') || 'balayage', idx = this.getAttribute('data-index') || 'naturel', op = +(this.getAttribute('data-opacity') || 60) / 100;
      const a = this.querySelector('.orp-cmp-a'), b = this.querySelector('.orp-cmp-b'), h = this.querySelector('.orp-cmp-handle'), dv = this.querySelector('.orp-cmp-div'), la = this.querySelector('.orp-cmp-lab-a'), lb = this.querySelector('.orp-cmp-lab-b');
      a.style.cssText = ''; b.style.cssText = ''; la.style.opacity = 1; lb.style.opacity = 1; la.style.left = '14px'; lb.style.left = ''; lb.style.right = '14px';
      h.style.display = mode === 'balayage' ? 'block' : 'none'; dv.style.display = mode === 'cote' ? 'block' : 'none';
      if (mode === 'cote') { a.style.right = '50%'; b.style.left = '50%'; lb.style.right = ''; lb.style.left = 'calc(50% + 14px)'; }
      else if (mode === 'fondu') { b.style.opacity = op; }
      else if (mode === 'changements') { a.style.visibility = 'hidden'; la.style.opacity = 0; }
      else if (mode === 'alterner') { let on = true; const tick = () => { on = !on; b.style.opacity = on ? 1 : 0; la.style.opacity = on ? 0 : 1; lb.style.opacity = on ? 1 : 0; }; b.style.transition = 'opacity 250ms'; la.style.left = '14px'; lb.style.right = ''; lb.style.left = '14px'; tick(); this._blink = setInterval(tick, 1300); }
      const key = idx === 'vegetation' ? 'vegetation' : 'naturel';
      this._show(this.A, key); this._show(this.B, mode === 'changements' ? 'changes+' : key);
      const dim = 'brightness(.55) saturate(.6)';
      this.A.getPane('tilePane').style.filter = dim; this.B.getPane('tilePane').style.filter = dim;
      this.A.getPane('cmp').style.filter = ''; 
      this.B.getPane('cmp').style.filter = mode === 'changements' ? 'grayscale(1) brightness(.85) contrast(1.1)' : '';
      this.zl.B.forEach(p => p.setStyle({ fillOpacity: mode === 'changements' ? 0.05 : 0.2 }));
      lb.innerHTML = mode === 'changements' ? '<b>Changements</b> · baisse du NDVI<span>Pixels passés de végétation (NDVI ≥ 0,55) à sol nu ou eau (≤ 0,35)</span>' : this._labB;
      setTimeout(() => { if (!this.A) return; this.A.invalidateSize(); this.B.invalidateSize(); this.B.setView(this.A.getCenter(), this.A.getZoom(), { animate: false }); this._clip(); }, 30);
      this._clip();
    }
    highlight(n) { if (!this.zl) return; ['A', 'B'].forEach(k => this.zl[k].forEach((p, i) => p.setStyle({ weight: i + 1 === n ? 4.5 : (k === 'A' ? 2 : 2.4) }))); }
    zoomIn() { this.A && this.A.zoomIn(0.5); }
    zoomOut() { this.A && this.A.zoomOut(0.5); }
    recenter() { if (!this.A) return; this.A.fitBounds(this.home, { maxZoom: 15.5 }); this._userSplit = false; setTimeout(() => this._autoSplit(), 350); }
  }

  window.ORP = { ST, SITES, SENSORS, ZONES, PERMITS, GEN, FIRES, URLS, s2, fr, applyData };
  if (!customElements.get('orp-map')) customElements.define('orp-map', OrpMap);
  if (!customElements.get('orp-compare')) customElements.define('orp-compare', OrpCompare);
})();
