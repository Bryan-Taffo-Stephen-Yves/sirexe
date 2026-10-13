/* Sirexe · interface (HTML/CSS/JS sans compilation)
   Données : window.CIREX (pipeline NDVI + Supabase), carte : orp-carto.js (<orp-map>, <orp-compare>).
   Règle du projet : aucun chiffre affiché n'est inventé. Ce qui vient du pipeline, du capteur ou du serveur
   est calculé ; tout le reste est étiqueté « fictif » ou « simulation » à l'écran. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utilitaires */
  const IC = window.CX_ICONS || {};
  const ic = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CX = () => window.CIREX;
  // coupure réseau (fetch impossible) : message lisible au lieu de « TypeError: Failed to fetch »
  const isNet = e => !!e && /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(e.message || e));
  const errMsg = e => (isNet(e) ? 'serveur injoignable (connexion Internet)' : String((e && e.message) || e || 'erreur'));
  const fr = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (v, d) => { const r = Math.round(v * Math.pow(10, d)) / Math.pow(10, d); return r === 0 ? '±' + fr(0, d) : (r > 0 ? '+' : '−') + fr(Math.abs(r), d); };
  const norm = x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const p2 = x => String(x).padStart(2, '0');
  const hhmm = t => { const d = new Date(t); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); };
  const hhmmss = t => hhmm(t) + ':' + p2(new Date(t).getUTCSeconds());
  const RM = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } } };

  /* ------------------------------------------------------------------ capteur : indice de suspicion (même formule que la base) */
  const CALM = { turb: 9, ph: 6.95, tds: 134, temp: 27.8 };
  const PEAK = { turb: 412, ph: 5.2, tds: 640, temp: 28.4 };
  const STEPS = [{ turb: 64, tds: 190, ph: 6.8, temp: 27.9 }, { turb: 188, tds: 330, ph: 6.2, temp: 28.0 }, { turb: 301, tds: 480, ph: 5.7, temp: 28.2 }, { turb: 380, tds: 590, ph: 5.4, temp: 28.3 }, PEAK];
  const KEYS = ['turb', 'ph', 'tds', 'temp'];
  let OPTIC = false;
  const idxOf = v => { if (OPTIC) return Math.min(100, Math.round(100 * (1 - Math.exp(-Math.max(0, v.turb - 5) / 180)))); const ft = 1 - Math.exp(-Math.max(0, v.turb - 5) / 220), fc = 1 - Math.exp(-Math.max(0, v.tds - 120) / 500), fp = Math.min(1, Math.abs(v.ph - 7.1) / 2.6); return Math.round(100 * (0.6 * ft + 0.25 * fc + 0.15 * fp)); };
  const zoneOf = i => (i >= 60 ? 'alerte' : i >= 40 ? 'vigilance' : 'normal');
  const idxColor = v => (v == null ? 'var(--zone)' : v >= 60 ? 'var(--crit)' : v >= 40 ? 'var(--warn)' : 'var(--ok)');

  /* ------------------------------------------------------------------ données de démonstration (fictives, étiquetées) */
  const ALERTS = [
    { id: 'ALT-2026-0412', sensor: 'PH-CI-004', loc: 'San Pedro', idx: 63, t: Date.UTC(2026, 9, 4, 22, 41), status: 'assignee' },
    { id: 'ALT-2026-0409', sensor: 'SAT-05', loc: 'Bouna-Est', idx: null, ha: '3,4 ha', t: Date.UTC(2026, 8, 29, 10, 15), status: 'analyse' },
    { id: 'ALT-2026-0405', sensor: 'PH-CI-002', loc: 'Bondoukou', idx: 61, t: Date.UTC(2026, 9, 2, 6, 52), status: 'fausse' },
    { id: 'ALT-2026-0398', sensor: 'PH-CI-001', loc: 'Bouna', idx: 64, t: Date.UTC(2026, 8, 28, 16, 20), status: 'cloturee' },
    { id: 'ALT-2026-0391', sensor: 'PH-CI-005', loc: 'Man', idx: 66, t: Date.UTC(2026, 8, 24, 9, 5), status: 'cloturee' },
    { id: 'ALT-2026-0384', sensor: 'PH-CI-004', loc: 'San Pedro', idx: 71, t: Date.UTC(2026, 8, 19, 13, 40), status: 'cloturee' }
  ];
  const STA = { nouvelle: ['crit', 'Nouvelle'], analyse: ['info', 'Analyse satellite'], confirmee: ['orange', 'Confirmée'], assignee: ['gold', 'Assignée'], cloturee: ['ok', 'Clôturée'], fausse: ['mute', 'Fausse alerte'] };
  const SITE_P = { legal: ['ok', 'Légal'], noncompliant: ['orange', 'Non conforme'], suspect: ['warn', 'Suspect'], illegal: ['crit', 'Illégal'], presume: ['crit', 'Illégal présumé'], dismantled: ['mute', 'Démantelé'] };
  const SENS_P = { normal: ['ok', 'Normal'], vigilance: ['warn', 'Vigilance'], alerte: ['crit', 'Alerte'], offline: ['mute', 'Hors ligne'] };
  const MIS_P = { aassigner: ['mute', 'À assigner'], assignee: ['gold', 'Assignée'], route: ['info', 'En route'], site: ['orange', 'Sur site'], cloturee: ['ok', 'Clôturée'] };
  const RPT_P = { brouillon: ['mute', 'Brouillon'], transmis: ['info', 'Transmis'], publie: ['ok', 'Publié'] };
  const TEAM_P = { service: ['ok', 'En service'], dispo: ['ok', 'Disponible'], site: ['orange', 'Sur site'], route: ['info', 'En route'], assignee: ['gold', 'Assignée'] };
  const SITE_INFO = {
    'ORP-0142': { title: 'ORP-0142 · Kokumbo', pill: 'Illégal présumé · cadastre fictif', st: 'presume', sensor: 'PH-CI-003', live: true, real: true },
    'ORP-0087': { title: 'ORP-0087 · Hiré', pill: 'Non conforme', st: 'noncompliant', rows: [['Surface perturbée', '9,6 ha'], ['Hors autorisation', '2,4 ha'], ['Dernière image', '28 sept. 2026'], ['Évolution', '+0,8 ha en 30 jours', 'up'], ['Titulaire', 'Coopérative minière Lôh-Djiboua'], ['Permis', 'AEA-2023-064 · 11/2026']], sensor: 'PH-CI-003 · 31 km' },
    'ORP-0019': { title: 'ORP-0019 · Tengrela', pill: 'Légal · permis valide', st: 'legal', rows: [['Surface exploitée', '6,2 ha'], ['Dernière visite', '12 sept. 2026'], ['Dernière image', '27 sept. 2026'], ['Évolution', '+0,1 ha en 30 jours'], ['Titulaire', 'Coopérative des orpailleurs de Tengréla'], ['Permis', 'AEA-2024-117 · 03/2027']], sensor: 'Aucun à moins de 50 km' },
    'ORP-0203': { title: 'ORP-0203 · Bouna-Est', pill: 'Suspect · à vérifier', st: 'suspect', rows: [['Surface perturbée', '3,4 ha'], ['Première détection', '29 sept. 2026'], ['Origine', 'Satellite SAT-05'], ['Évolution', '+3,4 ha en 30 jours', 'up'], ['Cours d’eau', 'Comoé, 2,1 km'], ['Permis', 'Aucun permis']], sensor: 'PH-CI-001 · 4 km' },
    'ORP-0056': { title: 'ORP-0056 · Dabakala', pill: 'Démantelé', st: 'dismantled', rows: [['Surface perturbée', '5,1 ha'], ['Démantèlement', 'juin 2026'], ['Statut', 'Réhabilitation en cours'], ['Évolution', '−0,6 ha végétalisés en 90 jours'], ['Cours d’eau', 'Nzi (affluent), 3,0 km'], ['Permis', 'Aucun permis']], sensor: 'Aucun à moins de 50 km' }
  };
  const MISSIONS = [
    { id: 'MIS-2026-121', target: 'ORP-0203', loc: 'Bouna-Est', type: 'Vérification terrain', agent: 'Yao N’Guessan', status: 'route', opened: '5 oct.', alert: 'ALT-2026-0409' },
    { id: 'MIS-2026-119', target: 'PH-CI-004', loc: 'San Pedro', type: 'Prélèvement d’eau', agent: 'Mariam Coulibaly', status: 'assignee', opened: '4 oct.', alert: 'ALT-2026-0412' },
    { id: 'MIS-2026-118', target: 'ORP-0087', loc: 'Hiré', type: 'Contrôle de conformité', agent: 'Aminata Traoré', status: 'site', opened: '3 oct.', alert: '' },
    { id: 'MIS-2026-112', target: 'ORP-0056', loc: 'Dabakala', type: 'Suivi de réhabilitation', agent: 'Yao N’Guessan', status: 'assignee', opened: '1 oct.', alert: '' },
    { id: 'MIS-2026-097', target: 'PH-CI-001', loc: 'Bouna', type: 'Prélèvement d’eau', agent: 'Yao N’Guessan', status: 'cloturee', opened: '28 sept.', alert: 'ALT-2026-0398' },
    { id: 'MIS-2026-091', target: 'PH-CI-005', loc: 'Man', type: 'Prélèvement d’eau', agent: 'Mariam Coulibaly', status: 'cloturee', opened: '24 sept.', alert: 'ALT-2026-0391' }
  ];
  const TEAM = [
    { name: 'Stephen Affo', role: 'Superviseur', zone: 'Abidjan · centre de surveillance', status: 'service', mission: '–', pos: null, seen: 'connecté' },
    { name: 'Koffi Kouassi', role: 'Agent de terrain', zone: 'Bélier', status: 'dispo', mission: '–', pos: [6.50, -5.06], seen: 'il y a 2 min' },
    { name: 'Aminata Traoré', role: 'Agent de terrain', zone: 'Lôh-Djiboua', status: 'site', mission: 'MIS-2026-118', pos: [6.163, -5.249], seen: 'il y a 1 min' },
    { name: 'Yao N’Guessan', role: 'Agent de terrain', zone: 'Bounkani · Hambol', status: 'route', mission: 'MIS-2026-121', pos: [9.20, -3.05], seen: 'il y a 4 min' },
    { name: 'Mariam Coulibaly', role: 'Agent de terrain', zone: 'San-Pédro · Nawa', status: 'assignee', mission: 'MIS-2026-119', pos: [4.80, -6.60], seen: 'il y a 12 min' }
  ];
  const SENS_TABLE = [
    { id: 'PH-CI-001', name: 'Station Bouna', loc: 'Bouna · Bounkani', st: 'normal', v: { turb: 30, ph: 6.8, tds: 200 }, last: 'il y a 40 s' },
    { id: 'PH-CI-002', name: 'Station Bondoukou', loc: 'Bondoukou · Gontougo', st: 'normal', v: { turb: 45, ph: 6.7, tds: 240 }, last: 'il y a 1 min' },
    { id: 'PH-CI-003', name: 'Station Kokumbo', loc: 'Kokumbo · Bélier', st: 'live', v: null, last: 'en direct' },
    { id: 'PH-CI-004', name: 'Station San Pedro', loc: 'San Pedro · San-Pédro', st: 'vigilance', v: { turb: 160, ph: 6.2, tds: 440 }, last: 'il y a 20 s' },
    { id: 'PH-CI-005', name: 'Station Man', loc: 'Man · Tonkpi', st: 'normal', v: { turb: 22, ph: 6.8, tds: 190 }, last: 'il y a 1 min' },
    { id: 'PH-CI-006', name: 'Station Odienné', loc: 'Odienné · Kabadougou', st: 'offline', v: null, last: 'il y a 3 j' }
  ];
  const REPORTS = [
    { id: 'RPT-2026-0142', title: 'Site ORP-0142 · Kokumbo', type: 'Rapport d’alerte', date: '5 oct.', st: 'brouillon' },
    { id: 'RPT-2026-M09', title: 'Bilan mensuel · septembre 2026', type: 'Bilan mensuel', date: '1 oct.', st: 'publie' },
    { id: 'RPT-2026-0087', title: 'Site ORP-0087 · Hiré · non-conformité', type: 'Rapport de site', date: '30 sept.', st: 'transmis' },
    { id: 'RPT-2026-0398', title: 'Alerte ALT-2026-0398 · Bouna', type: 'Rapport de mission', date: '29 sept.', st: 'publie' }
  ];
  const NAMED = { 'ORP-0142': ['28 sept.', 'Aucun permis'], 'ORP-0087': ['28 sept.', 'AEA-2023-064 · 2,4 ha hors périmètre'], 'ORP-0019': ['27 sept.', 'AEA-2024-117 · valide'], 'ORP-0203': ['29 sept.', 'Aucun permis'], 'ORP-0056': ['26 sept.', 'Aucun permis'] };
  const BELTS = [[9.25, -3.25, 'Bounkani'], [8.35, -4.55, 'Hambol'], [6.42, -5.12, 'Bélier'], [6.05, -5.35, 'Lôh-Djiboua'], [7.0, -5.9, 'Marahoué'], [10.3, -6.3, 'Bagoué'], [7.15, -7.85, 'Tonkpi'], [7.95, -6.65, 'Worodougou'], [5.85, -6.55, 'Nawa'], [6.75, -3.45, 'Indénié-Djuablin']];
  const SITE_TOT = { legal: 412.5, noncompliant: 96.3, suspect: 58.7, illegal: 1284.0, dismantled: 143.2 };
  const DEF_ON = { heat: true, sensors: true, alerts: true, zones: true, legal: true, noncompliant: true, suspect: true, illegal: true, dismantled: true, pe: true, aesi: true, aea: true, pr: false, rivers: false, captage: false, protected: true, firms: true, missions: false, agents: false, places: true };

  /* station ESP32 */
  const ESP_LBL = { rssi: 'Signal Wi-Fi', wifi: 'Signal Wi-Fi', sensor: 'Capteur', capteur: 'Capteur', frames: 'Images envoyées', images: 'Images envoyées', sent: 'Images envoyées', uptime: 'En ligne depuis', ip: 'Adresse IP', heap: 'Mémoire libre', psram: 'PSRAM libre', fps: 'Images / s', resolution: 'Résolution', framesize: 'Résolution', quality: 'Qualité JPEG', temp_chip: 'Temp. puce', battery: 'Batterie', vbat: 'Batterie', gsm: 'Réseau GSM', operator: 'Opérateur', csq: 'Signal GSM', sim: 'SIM', turbidity: 'Turbidité', turb: 'Turbidité', ntu: 'Turbidité', turbidite: 'Turbidité', ph: 'pH', tds: 'Conductivité', conductivity: 'Conductivité', temperature: 'Température', temp: 'Température', water_temp: 'Température eau', lat: 'Latitude', lon: 'Longitude', gps: 'GPS', id: 'Identifiant', name: 'Nom' };
  const ESP_SKIP = { errors: 1, err: 1, type: 1, sms: 1, messages: 1, flash: 1, lamp: 1, mode: 1, ok: 1 };
  const ESP_ORDER = ['rssi', 'wifi', 'sensor', 'capteur', 'frames', 'images', 'sent', 'uptime'];
  const espLabel = k => ESP_LBL[k.toLowerCase()] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/[_-]+/g, ' '));
  const espDur = v => { const t = Math.floor(Number(v)); if (!isFinite(t)) return String(v); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + x + ' s'; };
  const espFmt = (k, v, st) => {
    const K = k.toLowerCase(), n = Number(v), num = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && isFinite(n));
    if (v === null || v === undefined || v === '') return '–';
    if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
    if (!num) return String(v);
    if (K === 'rssi' || K === 'wifi') return fr(n, 0) + ' dBm (' + (n >= -67 ? 'bon' : n >= -75 ? 'moyen' : 'faible') + ')';
    if (K === 'frames' || K === 'images' || K === 'sent') return fr(n, 0) + ' (erreurs : ' + fr(Number(st.errors || st.err || 0), 0) + ')';
    if (K === 'uptime') return espDur(n);
    if (K === 'heap' || K === 'psram') return fr(n / 1024, 0) + ' ko';
    if (K === 'turbidity' || K === 'turb' || K === 'ntu' || K === 'turbidite') return fr(n, 0) + ' NTU';
    if (K === 'tds' || K === 'conductivity') return fr(n, 0) + ' ppm';
    if (K === 'temperature' || K === 'temp' || K === 'water_temp' || K === 'temp_chip') return fr(n, 1) + ' °C';
    if (K === 'ph') return fr(n, 2);
    if (K === 'battery' || K === 'vbat') return n <= 6 ? fr(n, 2) + ' V' : fr(n, 0) + ' %';
    if (K === 'csq') return fr(n, 0) + ' / 31';
    return fr(n, Math.abs(n) < 10 && n % 1 ? 2 : 0);
  };
  const espTime = v => {
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') { const pp = Date.parse(v); if (!isNaN(pp)) return pp; const m = v.match(/^(\d\d)\/(\d\d)\/(\d\d),(\d\d):(\d\d):(\d\d)/); if (m) return new Date(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); }
    return Date.now();
  };
  const smsClock = t => { const d = new Date(t), hm = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); return d.toDateString() === new Date().toDateString() ? hm : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' · ' + hm; };
  const SIM_SMS = ['PH-CI-003 · état OK · turbidité 9 NTU · batterie 3,9 V', 'Station PH-CI-003 en ligne · réseau Orange CI · signal 18/31', 'Rapport horaire · mesures envoyées · 0 erreur'];
  const ESP_HELP = ['GET http://<ip>/status   → JSON, par exemple :', '{ "rssi": -48, "sensor": "RGB565 · 10 MHz",', '  "frames": 806, "errors": 0, "uptime": 1188,', '  "turbidity": 9.2, "tds": 134, "ph": 6.9,', '  "temperature": 27.8 }', '', 'GET http://<ip>/sms      → [{ "from": "+225…",', '  "text": "…", "time": "26/10/15,10:56:02+00" }]', 'GET http://<ip>:81/stream  flux MJPEG', 'GET http://<ip>/capture    photo JPEG', 'GET http://<ip>/control?var=flash|lamp|mode&val=…', '', 'En-tête requis : Access-Control-Allow-Origin: *', '', 'WebSocket : images JPEG en binaire, état en JSON', 'texte, SMS en { "type": "sms", "from", "text" }.'].join('\n');
  const ESP_HELP_SRV = ['Le boîtier (ou relay/esp32_relay.py) parle au serveur :', '', 'POST …/functions/v1/device-event', 'x-device-key: <clé du capteur>', '{ "kind": "status", "sensor_id": "PH-CI-003",', '  "status": { "rssi": -48, "frames": 806, … } }', '', '{ "kind": "sms", "sensor_id": "PH-CI-003",', '  "messages": [{ "from": "+225…", "text": "…",', '  "time": "26/10/15,10:56:02+00" }] }', '', 'Photo : corps JPEG brut, Content-Type image/jpeg,', '  URL …/device-event?sensor_id=PH-CI-003', '', 'Commandes : GET …/device-event?kind=commands', '  &sensor_id=PH-CI-003 → capture, flash, lampe'].join('\n');
  const ESP_MODES = [['serveur', 'Serveur'], ['http', 'HTTP local'], ['ws', 'WebSocket'], ['sim', 'Simulation']];

  /* navigation */
  const VIEWS = {
    apercu: ['Tableau de bord', 'layout-dashboard'], carte: ['Carte', 'map-2'], alertes: ['Alertes', 'alert-triangle'], satellite: ['Satellite', 'satellite'],
    missions: ['Missions', 'route'], rapports: ['Rapports', 'file-text'], capteurs: ['Capteurs', 'droplet'], esp: ['Station ESP32', 'cpu'],
    sites: ['Sites d’orpaillage', 'map-pin'], equipe: ['Équipe', 'users'], parametres: ['Paramètres', 'settings']
  };
  const NAV_MAIN = ['apercu', 'carte', 'alertes', 'satellite', 'missions', 'rapports'];
  const NAV_MORE = [['capteurs', 'Six stations de mesure de l’eau'], ['esp', 'Caméra, SMS et état du boîtier'], ['sites', 'Registre des sites connus'], ['equipe', 'Agents de terrain'], ['parametres', 'Seuils et notifications']];
  const TABS = [['apercu', 'Accueil', 'layout-dashboard'], ['carte', 'Carte', 'map-2'], ['alertes', 'Alertes', 'alert-triangle'], ['missions', 'Missions', 'route'], ['more', 'Plus', 'dots']];
  const LIST_VIEWS = ['alertes', 'sites', 'capteurs', 'missions', 'rapports', 'equipe', 'parametres'];
  const CMP_MODES = [['balayage', 'Balayage'], ['cote', 'Côte à côte'], ['fondu', 'Fondu'], ['alterner', 'Alterner'], ['changements', 'Changements']];
  const CMP_LEG = {
    changements: { title: 'Zones de changement', grad: '#D946A8', lo: 'Végétation avant', hi: 'Sol nu ou eau après', note: 'Pixels passés d’un NDVI ≥ 0,55 à ≤ 0,35, regroupés en zones d’au moins 0,5 ha.' },
    vegetation: { title: 'NDVI · Sentinel-2 L2A', grad: 'linear-gradient(90deg, #8C2E05, #D95E0D, #FCC44F, #A6D96B, #1A9950, #00451C)', lo: '−0,2 · sol nu', hi: '0,9 · forêt dense', note: 'NDVI = (B8 − B4) / (B8 + B4), médiane des dates sans nuages de chaque période.' }
  };
  const SERIES = [['idx', 'Indice', '', 0], ['turb', 'Turbidité', 'NTU', 0], ['ph', 'pH', '', 1], ['tds', 'Conductivité', 'ppm', 0], ['temp', 'Température', '°C', 1]];

  /* ------------------------------------------------------------------ application */
  class App {
    constructor(root) {
      this.root = root;
      this.uid = 'm' + Math.random().toString(36).slice(2, 8);
      this.cuid = 'c' + Math.random().toString(36).slice(2, 8);
      this.timers = [];
      this.cache = new Map();
      this.sizes = {};
      this.hov = {};
      this.esp = (() => { let cfg = {}; try { cfg = JSON.parse(store.get('orp-esp-cfg', '{}')) || {}; } catch (e) { cfg = {}; } return { cfg: Object.assign({ mode: 'serveur', host: '192.168.4.1', stream: '', ws: 'ws://192.168.4.1:81/ws' }, cfg), on: false, sim: false, status: {}, last: 0, t0: 0, err: '', streamErr: false, frame: '', sms: [], smsKeys: {}, flash: true, lamp: false, mode: 'stream', shot: 0, help: false, iv: [] }; })();
      this.state = this.initial(false);
      this.state.view = this.viewFromHash() || 'apercu';
      this.mount();
      this.boot();
    }

    initial(alerte) {
      return {
        phase: alerte ? 'alerte' : 'calme', disp: Object.assign({}, alerte ? PEAK : CALM), hist: this.makeHist(alerte),
        alertAt: null, a413: null, selected: null, banner: false,
        demoOpen: false, moreOpen: false, morePop: false, searchOpen: false, layersOpen: false,
        demoSource: store.get('cirex-source', 'rejeu'),
        camErr: '', sat: null, satErr: false, server: { ok: false, msg: 'Connexion au serveur…' }, dbAlerts: [], dbMissions: [], dbReports: [], alertCode: null, alertId: null, dev: null, devSms: [], frames: [], frameSel: null,
        base: 'esri', zoom: 6.7, s2year: 2025, on: Object.assign({}, DEF_ON), tilted: false, measuring: false,
        now: Date.now(), toasts: [], seqStep: null, muted: store.get('cirex-muted', '0') === '1', view: 'apercu', lf: 0, lq: '', newMissions: [], series: 'idx', searchMsg: '',
        cmpMode: 'balayage', cmpIndex: 'naturel', cmpOpacity: 60, report: null, mission: null, busy: false
      };
    }
    makeHist(alerte) {
      const h = { turb: [], ph: [], tds: [], temp: [], idx: [] };
      for (let i = 0; i < 300; i++) { const m = { turb: 9 + (Math.random() - 0.5) * 1.6, ph: 6.95 + (Math.random() - 0.5) * 0.08, tds: 134 + (Math.random() - 0.5) * 6, temp: 27.8 + (Math.random() - 0.5) * 0.2 }; KEYS.forEach(k => h[k].push(m[k])); h.idx.push(idxOf(m)); }
      if (alerte) STEPS.concat([PEAK, PEAK, PEAK, PEAK, PEAK, PEAK]).forEach(m => { KEYS.forEach(k => { h[k].shift(); h[k].push(m[k]); }); h.idx.shift(); h.idx.push(idxOf(m)); });
      return h;
    }
    set(patch, cb) {
      const p = typeof patch === 'function' ? patch(this.state) : patch;
      Object.assign(this.state, p);
      if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.paint(); if (cb) cb(); });
      else if (cb) requestAnimationFrame(cb);
    }
    later(f, ms) { this.timers.push(setTimeout(f, ms)); }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
    toast(msg) { const id = Math.random(); this.set(s => ({ toasts: s.toasts.concat([{ id, msg }]).slice(-3) })); setTimeout(() => this.set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4800); }
    viewFromHash() { const v = (location.hash || '').replace(/^#\/?/, ''); return VIEWS[v] ? v : null; }

    /* ---------------------------------------------------------------- montage */
    mount() {
      const navMain = NAV_MAIN.map(k => '<button class="nav-item" type="button" data-act="go" data-a="' + k + '" data-nav="' + k + '">' + ic(VIEWS[k][1]) + '<span>' + VIEWS[k][0] + '</span>' + (k === 'alertes' ? '<span data-r="navcount"></span>' : '') + '</button>').join('');
      const moreItems = NAV_MORE.map(([k, sub]) => '<button class="pop-item" type="button" role="menuitem" data-act="go" data-a="' + k + '" data-nav="' + k + '"><span class="ic-box">' + ic(VIEWS[k][1]) + '</span><span>' + VIEWS[k][0] + '<small>' + sub + '</small></span></button>').join('');
      this.root.innerHTML =
        '<header class="hdr" id="cx-hdr">' +
          '<a class="brand" href="#/apercu" data-act="go" data-a="apercu" aria-label="Sirexe · tableau de bord"><span class="brand-mark">' + ic('droplet') + '</span><span><span class="brand-name">Sirexe</span><span class="brand-tag">Prototype · hackathon 2026</span></span></a>' +
          '<nav class="nav" aria-label="Navigation principale">' + navMain +
            '<span class="nav-more"><button class="nav-item" type="button" data-act="morepop" aria-haspopup="menu" aria-expanded="false" id="cx-morebtn">' + ic('dots') + '<span>Plus</span>' + ic('chevron-down', 'ic-sm') + '</button>' +
            '<div class="pop" role="menu" id="cx-morepop" hidden style="top:52px;right:0">' + moreItems + '<div class="pop-sep"></div><button class="pop-item" type="button" role="menuitem" data-act="demo"><span class="ic-box">' + ic('player-play') + '</span><span>Panneau démo<small>Source des mesures, séquence, Telegram</small></span></button></div></span>' +
          '</nav>' +
          '<div class="hdr-tools"><span class="live" data-r="clock"></span>' +
            '<button class="cbtn js-search" type="button" data-act="search" aria-label="Rechercher sur la carte (Ctrl K)">' + ic('search') + '</button>' +
            '<button class="cbtn" type="button" data-act="go" data-a="alertes" aria-label="Alertes ouvertes">' + ic('bell') + '<span data-r="bellbadge"></span></button>' +
            '<button class="cbtn" type="button" data-act="demo" aria-label="Panneau démo (Maj D)">' + ic('player-play') + '</button>' +
            '<span class="avatar" title="Stephen Affo · Superviseur" role="img" aria-label="Stephen Affo, superviseur">SA</span></div>' +
        '</header>' +
        '<div class="pop search-pop" id="cx-search" hidden role="dialog" aria-label="Rechercher sur la carte">' +
          '<label class="field">' + ic('search') + '<input id="cx-search-in" type="search" placeholder="Site, capteur, permis ou coordonnées" autocomplete="off" data-enter="gsearch"><span class="kbd">Entrée</span></label>' +
          '<p class="search-hint" data-r="searchmsg"></p>' +
        '</div>' +
        '<div class="banner" data-r="banner" role="status" aria-live="assertive"></div>' +
        '<main class="main" id="cx-main" tabindex="-1"></main>' +
        '<nav class="tabbar" aria-label="Navigation" data-r="tabs"></nav>' +
        '<div class="scrim" id="cx-scrim" data-act="closeall"></div>' +
        '<aside class="drawer" id="cx-demo" aria-label="Panneau démo" aria-hidden="true">' +
          '<span class="grab" aria-hidden="true"></span>' +
          '<div class="drawer-h"><h2>Panneau démo</h2><button class="cbtn" type="button" data-act="demo" aria-label="Fermer le panneau démo">' + ic('x') + '</button></div>' +
          '<div class="drawer-b"><div data-r="demo" style="display:flex;flex-direction:column;gap:18px"></div>' +
            '<div id="cx-cambox" hidden><p class="sect-t">Caméra</p><video id="cx-cam" playsinline muted style="position:absolute;width:1px;height:1px;opacity:0"></video><canvas id="cx-camprev" class="cam-prev" width="320" height="240" aria-label="Aperçu de la caméra"></canvas><p class="foot" data-r="optic"></p><button class="btn btn-gold btn-block" type="button" data-act="calibrate" style="margin-top:10px">Étalonner sur eau claire</button></div>' +
            '<div data-r="demo2" style="display:flex;flex-direction:column;gap:18px"></div>' +
          '</div>' +
        '</aside>' +
        '<aside class="drawer" id="cx-more" aria-label="Plus de rubriques" aria-hidden="true">' +
          '<span class="grab" aria-hidden="true"></span>' +
          '<div class="drawer-h"><h2>Plus</h2><button class="cbtn" type="button" data-act="more" aria-label="Fermer">' + ic('x') + '</button></div>' +
          '<div class="drawer-b"><div class="sheet-grid">' + ['satellite', 'rapports', 'capteurs', 'esp', 'sites', 'equipe', 'parametres'].map(k => '<button class="opt" type="button" data-act="go" data-a="' + k + '" data-nav="' + k + '">' + ic(VIEWS[k][1]) + VIEWS[k][0] + '</button>').join('') +
            '<button class="opt" type="button" data-act="demo">' + ic('player-play') + 'Panneau démo</button></div></div>' +
        '</aside>' +
        '<div class="toasts" data-r="toasts" aria-live="polite"></div>' +
        '<div id="cx-park" aria-hidden="true" style="position:fixed;left:-12000px;top:0;width:900px;height:620px;visibility:hidden;pointer-events:none"></div>';

      this.mapEl = document.createElement('orp-map');
      this.mapEl.setAttribute('data-uid', this.uid);
      this.mapEl.setAttribute('data-card', 'cx-site');
      this.cmpEl = null;
      this.$('#cx-park').appendChild(this.mapEl);
      this.camV = this.$('#cx-cam');
      this.camP = this.$('#cx-camprev');
      this.bind();
    }
    $(s) { return this.root.querySelector(s); }

    bind() {
      const root = this.root;
      root.addEventListener('click', e => {
        const el = e.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
        const a = this.A[el.getAttribute('data-act')]; if (!a) return;
        if (el.tagName === 'A') e.preventDefault();
        a.call(this, el.getAttribute('data-a'), el, e);
      });
      root.addEventListener('input', e => { const k = e.target.getAttribute && e.target.getAttribute('data-in'); if (k && this.IN[k]) this.IN[k].call(this, e.target.value, e.target, e); });
      root.addEventListener('change', e => { const k = e.target.getAttribute && e.target.getAttribute('data-ch'); if (k && this.IN[k]) this.IN[k].call(this, e.target.value, e.target, e); });
      root.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-enter]')) { e.preventDefault(); const k = e.target.getAttribute('data-enter'); if (this.IN[k]) this.IN[k].call(this, e.target.value, e.target, e); }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
      });
      root.addEventListener('mouseover', e => { const z = e.target.closest('[data-zone]'); if (z && this.cmpEl && this.cmpEl.highlight) this.cmpEl.highlight(+z.getAttribute('data-zone')); });
      root.addEventListener('mouseout', e => { const z = e.target.closest('[data-zone]'); if (z && this.cmpEl && this.cmpEl.highlight && !z.contains(e.relatedTarget)) this.cmpEl.highlight(0); });
      root.addEventListener('focusin', e => { const z = e.target.closest('[data-zone]'); if (z && this.cmpEl && this.cmpEl.highlight) this.cmpEl.highlight(+z.getAttribute('data-zone')); });
      root.addEventListener('pointermove', e => this.chartHover(e));
      root.addEventListener('pointerleave', e => { if (e.target.matches && e.target.matches('[data-chart]')) this.chartLeave(e); }, true);
      root.addEventListener('error', e => { const t = e.target; if (t && t.matches && t.matches('img[data-esp-stream]')) { this.esp.streamErr = true; this.set({ espTick: Date.now() }); } }, true);
      window.addEventListener('keydown', e => this.handleKey(e));
      window.addEventListener('hashchange', () => { const v = this.viewFromHash(); if (v && v !== this.state.view) this.go(v, true); });
      window.addEventListener('scroll', () => { const s = window.scrollY > 4; if (s !== this._scrolled) { this._scrolled = s; this.$('#cx-hdr').classList.toggle('is-scrolled', s); } }, { passive: true });
      document.addEventListener('pointerdown', e => {
        if (this.state.morePop && !e.target.closest('.nav-more')) this.set({ morePop: false });
        if (this.state.searchOpen && !e.target.closest('#cx-search') && !e.target.closest('.js-search')) this.set({ searchOpen: false });
      });
      const on = (t, f) => window.addEventListener(t, f);
      on('orp:select', e => { if (e.detail.uid === this.uid) this.set({ selected: e.detail.id }); });
      on('orp:view', e => { if (e.detail.uid !== this.uid) return; const d = e.detail; this.set({ base: d.base, zoom: d.zoom, s2year: d.s2year, tilted: d.tilted, measuring: d.measuring, on: d.on }); });
      on('orp:ready', e => { if (e.detail.uid === this.uid) this.applyMapMode(); });
      on('orp:seq', e => { if (e.detail.uid === this.uid) this.handleSeq(e.detail.step); });
      this.ro = window.ResizeObserver ? new ResizeObserver(ents => { let ch = false; ents.forEach(en => { const id = en.target.getAttribute('data-chart'), w = Math.round(en.contentRect.width); if (id && w && Math.abs((this.sizes[id] || 0) - w) > 2) { this.sizes[id] = w; ch = true; } }); if (ch) this.set({}); }) : null;
      ['cx-demo', 'cx-more'].forEach(id => this.sheetDrag(this.$('#' + id), id === 'cx-demo' ? 'demoOpen' : 'moreOpen'));
    }

    /* feuille mobile : glisser pour fermer, avec projection de la vitesse */
    sheetDrag(el, key) {
      let y0 = 0, dy = 0, hist = [], drag = false;
      const mobile = () => window.matchMedia('(max-width: 1040px)').matches;
      el.addEventListener('pointerdown', e => {
        if (!mobile() || !e.target.closest('.grab, .drawer-h') || e.target.closest('button')) return;
        drag = true; y0 = e.clientY; dy = 0; hist = [[e.clientY, performance.now()]]; el.setPointerCapture(e.pointerId); el.classList.add('is-dragging');
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return; dy = e.clientY - y0;
        const over = dy < 0 ? -(Math.abs(dy) * 60 * 0.55) / (60 + 0.55 * Math.abs(dy)) : dy; // élastique vers le haut
        el.style.setProperty('--drag', over + 'px'); hist.push([e.clientY, performance.now()]); if (hist.length > 6) hist.shift();
      });
      const end = () => {
        if (!drag) return; drag = false; el.classList.remove('is-dragging');
        const a = hist[0], b = hist[hist.length - 1], v = b && a && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) * 1000 : 0;
        const projected = dy + (v / 1000) * 0.99 / (1 - 0.99);
        el.style.setProperty('--drag', '0px');
        if (projected > el.offsetHeight * 0.4) { const p = {}; p[key] = false; this.set(p); }
      };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    }

    boot() {
      window.CIREX_TOAST = msg => this.toast(msg);
      if (CX()) CX().ready.then(sat => this.set({ sat, satErr: !sat })); else this.set({ satErr: true });
      OPTIC = this.state.demoSource === 'optique';
      this.connectDb();
      if (this.state.demoSource === 'serveur') this.later(() => this.loadHistory(), 600);
      if (OPTIC) this.startCam();
      this.tick = setInterval(() => this.measure(), 2000);
      this.clock = setInterval(() => this.set({ now: Date.now() }), 1000);
      this.go(this.state.view, true);
    }

    /* ---------------------------------------------------------------- navigation entre vues */
    go(view, fromHash) {
      if (!VIEWS[view]) view = 'apercu';
      const prev = this.state.view;
      this.state.view = view; this.state.lf = 0; this.state.lq = ''; this.state.layersOpen = false; this.state.morePop = false; this.state.moreOpen = false;
      if (!fromHash && location.hash !== '#/' + view) history.pushState(null, '', '#/' + view);
      this.$('#cx-park').appendChild(this.mapEl);
      if (this.cmpEl) this.$('#cx-park').appendChild(this.cmpEl);
      this.cache.clear();
      const main = this.$('#cx-main');
      main.innerHTML = this.skel(view);
      const slot = main.querySelector('[data-slot="map"]'); if (slot) slot.appendChild(this.mapEl);
      const cslot = main.querySelector('[data-slot="cmp"]');
      if (cslot) {
        if (!this.cmpEl) { this.cmpEl = document.createElement('orp-compare'); this.cmpEl.setAttribute('data-uid', this.cuid); }
        this.syncCmp(); cslot.appendChild(this.cmpEl);
      }
      if (this.ro) { this.ro.disconnect(); }
      this.paint();
      if (prev !== view) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
      if (slot) setTimeout(() => { if (this.mapEl.map) this.mapEl.map.invalidateSize(); }, 60);
    }

    /* squelettes : parties fixes de chaque vue ; les régions [data-r] sont recalculées à chaque rendu */
    skel(v) {
      const head = (title, extra) => '<div class="page-head"><div><h1 class="page-title">' + title + '</h1><p class="page-sub" data-r="sub-' + v + '"></p></div><div class="page-actions" data-r="act-' + v + '">' + (extra || '') + '</div></div>';
      if (v === 'apercu') return '<div class="view">' + head('Tableau de bord') +
        '<div class="grid dash">' +
          '<div class="a-tiles tiles" data-r="tiles"></div>' +
          '<div class="a-side"><div class="cw notched"><div class="card" data-r="alertcard"></div><button class="notch" type="button" data-act="go" data-a="alertes" aria-label="Toutes les alertes">' + ic('arrow-up-right') + '</button></div><div class="cw"><div class="card dark" data-r="nextcard"></div></div></div>' +
          '<div class="a-live cw notched"><div class="card" data-r="livecard"></div><button class="notch" type="button" data-act="go" data-a="capteurs" aria-label="Tous les capteurs">' + ic('arrow-up-right') + '</button></div>' +
          '<div class="a-map cw notched"><div class="card flush"><div class="mapbox"><div data-slot="map"></div><div data-r="mapover-dash"></div></div></div><button class="notch" type="button" data-act="go" data-a="carte" aria-label="Ouvrir la carte en grand">' + ic('arrow-up-right') + '</button></div>' +
          '<div class="a-sat cw notched"><div class="card" data-r="satcard"></div><button class="notch" type="button" data-act="go" data-a="satellite" aria-label="Ouvrir l’analyse satellite">' + ic('arrow-up-right') + '</button></div>' +
          '<div class="a-mis cw notched"><div class="card" data-r="miscard"></div><button class="notch" type="button" data-act="go" data-a="missions" aria-label="Toutes les missions">' + ic('arrow-up-right') + '</button></div>' +
          '<div class="a-team cw notched"><div class="card" data-r="teamcard"></div><button class="notch" type="button" data-act="go" data-a="equipe" aria-label="Toute l’équipe">' + ic('arrow-up-right') + '</button></div>' +
        '</div></div>';
      if (v === 'carte') return '<div class="view mapview"><h1 class="sr">Carte satellite</h1><div class="mapbox"><div data-slot="map"></div>' +
        '<div class="map-top"><label class="map-search glass-light">' + ic('search') + '<input type="search" placeholder="Site, capteur, coordonnées" aria-label="Rechercher sur la carte" data-enter="mapq" autocomplete="off"><button class="btn btn-sm" type="button" data-act="layers" aria-label="Couches">' + ic('stack-2') + '<span class="lbl-x">Couches</span></button></label></div>' +
        '<div data-r="mapover-carte"></div><div data-r="mapctl"></div><div data-r="layers"></div></div></div>';
      if (v === 'satellite') return '<div class="view">' + head('Analyse satellite') +
        '<div class="cmp"><div class="mapbox"><div data-slot="cmp"></div><div data-r="cmpover"></div>' +
          '<div class="map-ctl glass"><button type="button" data-act="cmp" data-a="zoomIn" aria-label="Zoom avant">' + ic('plus') + '</button><button type="button" data-act="cmp" data-a="zoomOut" aria-label="Zoom arrière">' + ic('minus') + '</button><hr><button type="button" data-act="cmp" data-a="recenter" aria-label="Recentrer sur les zones">' + ic('focus-2') + '</button></div>' +
        '</div><div class="cmp-side"><div class="card" data-r="cmpside"></div></div></div></div>';
      if (v === 'esp') return '<div class="view">' + head('Station ESP32') +
        '<div class="station"><div class="cw"><div class="card"><div class="cam" id="cx-espbox"><div data-r="espimg" style="position:absolute;inset:0"></div><div data-r="espbadge"></div></div><div data-r="espctl"></div><div data-r="espthumbs"></div></div></div>' +
        '<div style="display:flex;flex-direction:column;gap:var(--gap)"><div class="cw"><div class="card" data-r="espconf"></div></div><div class="cw"><div class="card" data-r="esptiles"></div></div><div class="cw"><div class="card" data-r="espsms"></div></div></div></div></div>';
      // vues en liste
      return '<div class="view">' + head(VIEWS[v][0]) +
        '<div class="toolbar"><div data-r="filters"></div>' + (v === 'parametres' ? '' : '<label class="field">' + ic('search') + '<input type="search" placeholder="Filtrer la liste" aria-label="Filtrer la liste" data-in="lq" autocomplete="off"></label>') + '</div>' +
        '<div class="cw"><div class="card" data-r="list"></div></div></div>';
    }

    /* ---------------------------------------------------------------- rendu par régions */
    paint() {
      const s = this.state;
      this.ctx = this.compute();
      // éléments hors régions
      this.root.querySelectorAll('[data-nav]').forEach(b => { const on = b.getAttribute('data-nav') === s.view; if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      const mp = this.$('#cx-morepop'), mb = this.$('#cx-morebtn');
      if (mp) { mp.hidden = !s.morePop; mb.setAttribute('aria-expanded', String(!!s.morePop)); const inMore = NAV_MORE.some(m => m[0] === s.view); if (inMore) mb.setAttribute('aria-current', 'page'); else mb.removeAttribute('aria-current'); }
      const sp = this.$('#cx-search'); if (sp.hidden === !!s.searchOpen) { sp.hidden = !s.searchOpen; if (s.searchOpen) setTimeout(() => this.$('#cx-search-in').focus(), 30); }
      const anySheet = s.demoOpen || s.moreOpen;
      this.$('#cx-scrim').classList.toggle('is-on', anySheet);
      [['#cx-demo', s.demoOpen], ['#cx-more', s.moreOpen]].forEach(([q, onv]) => { const d = this.$(q); d.classList.toggle('is-on', !!onv); d.setAttribute('aria-hidden', String(!onv)); d.inert = !onv; });
      this.$('#cx-cambox').hidden = !(s.demoOpen && s.demoSource === 'optique');
      const z = this.ctx.zone; if (this.mapEl.getAttribute('data-s3') !== z) this.mapEl.setAttribute('data-s3', z);
      const banner = this.$('.banner'); banner.classList.toggle('is-on', !!(s.banner && s.phase === 'alerte'));
      if (this.cmpEl) this.syncCmp();
      // régions (le focus clavier est conservé quand une région est redessinée)
      this._pc = (this._pc || 0) + 1;
      this.root.querySelectorAll('[data-r]').forEach(el => {
        const name = el.getAttribute('data-r'), f = this.R[name.replace(/-.*$/, '')];
        if (!f) return;
        const html = f.call(this, name.indexOf('-') > 0 ? name.slice(name.indexOf('-') + 1) : null);
        if (this.cache.get(el) === html) return;
        const ae = document.activeElement, had = ae && ae !== el && el.contains(ae) ? [ae.getAttribute('data-act'), ae.getAttribute('data-a'), ae.getAttribute('data-zone')] : null;
        this.cache.set(el, html); el.innerHTML = html;
        if (had && (had[0] || had[2])) { const q = had[2] ? '[data-zone="' + had[2] + '"]' : '[data-act="' + had[0] + '"]' + (had[1] != null ? '[data-a="' + CSS.escape(had[1]) + '"]' : ''); const n = el.querySelector(q); if (n) n.focus({ preventScroll: true }); }
      });
      if (this.ro) this.root.querySelectorAll('[data-chart]').forEach(el => { if (!el._obs) { el._obs = 1; this.ro.observe(el); } });
    }

    /* valeurs dérivées partagées par les régions */
    compute() {
      const s = this.state, d = s.disp, idx = idxOf(d), alert = s.phase === 'alerte';
      const srvLive = !!(this.lastReal && Date.now() - this.lastReal < 60000);
      const noLive = (s.demoSource === 'serveur' && !this.lastReal) || (s.demoSource === 'reel' && !this.esp.gotReal);
      const zone = zoneOf(idx);
      const dbList = s.dbAlerts.filter(a => !(alert && a.id === s.alertId)).map(a => ({ id: a.code, sensor: a.sensor_id, loc: (a.source === 'rejeu' ? 'rejeu · ' : '') + 'Kokumbo', idx: a.suspicion_score == null ? null : Math.round(a.suspicion_score), t: Date.parse(a.created_at), status: a.status, real: true }));
      const list = (alert ? [{ id: s.alertCode || 'SIM', sensor: 'PH-CI-003', loc: s.demoSource === 'serveur' ? 'Kokumbo' : 'Kokumbo · simulation', idx, t: s.alertAt, status: s.a413 || 'nouvelle', isNew: true }] : []).concat(dbList, ALERTS.map(a => Object.assign({}, a, { loc: a.loc + ' · fictif', fictif: true })));
      const openAlerts = list.filter(a => a.status !== 'cloturee' && a.status !== 'fausse').length;
      const sat = s.sat, SS = sat && sat.summary;
      const src = s.demoSource === 'serveur' ? 'mesure du boîtier' : s.demoSource === 'reel' ? 'mesure ESP32 locale' : s.demoSource === 'optique' ? 'mesure webcam' : 'simulation';
      const real = (s.demoSource === 'serveur' && srvLive) || (s.demoSource === 'reel' && !!this.espMeasure()) || s.demoSource === 'optique';
      const badge = ({ serveur: srvLive ? 'Mesure réelle · boîtier' : 'Boîtier · en attente', reel: this.espMeasure() ? 'Mesure réelle · ESP32 local' : 'ESP32 · non connecté', optique: 'Mesure réelle · webcam', rejeu: 'Simulation' })[s.demoSource] || 'Simulation';
      const badgeCls = real ? 'real' : (s.demoSource === 'rejeu' ? 'sim' : 'wait');
      return { d, idx, alert, srvLive, noLive, zone, list, openAlerts, sat, SS, src, real, badge, badgeCls };
    }

    rel(t) {
      const now = this.state.now, sec = Math.max(0, Math.round((now - t) / 1000));
      if (sec < 60) return 'il y a ' + sec + ' s'; const m = Math.floor(sec / 60); if (m < 60) return 'il y a ' + m + ' min';
      const day = x => Math.floor(x / 864e5), dd = day(now) - day(t);
      if (dd === 0) return 'il y a ' + Math.floor(m / 60) + ' h'; if (dd === 1) return 'hier ' + hhmm(t); if (dd < 7) return 'il y a ' + dd + ' j';
      const dt = new Date(t); return dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()];
    }
    clockTxt() { const n = new Date(this.state.now); return DAYS[n.getUTCDay()] + ' ' + n.getUTCDate() + ' ' + MONTHS[n.getUTCMonth()] + ' · ' + hhmmss(this.state.now) + ' GMT'; }
    pill(p, extra) { return '<span class="pill ' + p[0] + '">' + (extra || '') + esc(p[1]) + '</span>'; }

    /* ---------------------------------------------------------------- logique capteur */
    measure() {
      if (this.seqRunning) return;
      const s = this.state;
      if (s.demoSource === 'serveur') return;
      if (s.demoSource === 'optique') { const o = this.opt; if (!o || !o.ready) return; const m = { turb: o.turb, ph: CALM.ph, tds: CALM.tds, temp: CALM.temp }; this.push(m); if (idxOf(m) >= 60 && s.phase === 'calme') this.triggerAlert(m); return; }
      if (s.demoSource === 'reel') { const m = this.espMeasure(); if (m) { this.esp.gotReal = true; this.push(m); if (idxOf(m) >= 60 && s.phase === 'calme') this.triggerAlert(m); } return; }
      const calm = s.phase === 'calme';
      const m = calm ? { turb: 9 + (Math.random() - 0.5) * 1.6, ph: 6.95 + (Math.random() - 0.5) * 0.08, tds: 134 + (Math.random() - 0.5) * 6, temp: 27.8 + (Math.random() - 0.5) * 0.2 } : Object.assign({}, PEAK);
      this.push(m, true);
    }
    push(m, instant) {
      const s = this.state, h = {};
      KEYS.forEach(k => { h[k] = s.hist[k].slice(-299).concat([m[k]]); }); h.idx = s.hist.idx.slice(-299).concat([idxOf(m)]);
      s.hist = h; this.tweenTo(m, instant);
    }
    tweenTo(m, instant) {
      cancelAnimationFrame(this.traf);
      if (instant || RM()) { this.set({ disp: Object.assign({}, m) }); return; }
      const from = Object.assign({}, this.state.disp), t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); const d = {}; KEYS.forEach(key => { d[key] = from[key] + (m[key] - from[key]) * e; }); this.set({ disp: d }); if (k < 1) this.traf = requestAnimationFrame(step); };
      this.traf = requestAnimationFrame(step);
    }
    runSequence() {
      const s = this.state;
      if (s.demoSource === 'serveur') { this.reset(false); this.later(() => this.toast(s.server.ok ? 'Boîtier armé · plongez la sonde dans l’eau trouble' : 'Serveur injoignable · passez en Simulation (panneau démo)'), 300); this.autoCompare = true; return; }
      if (s.demoSource === 'optique') { this.reset(false); this.later(() => { this.autoCompare = true; this.toast(this.opt && this.opt.ready ? 'Capteur optique armé · versez la terre dans l’eau' : 'Étalonnez d’abord sur eau claire'); }, 200); return; }
      if (this.seqRunning || s.phase !== 'calme') { this.reset(false); this.later(() => this.runSequence(), 350); return; }
      this.seqRunning = true; this.autoCompare = true;
      if (s.view !== 'apercu' && s.view !== 'carte') this.go('apercu');
      this.set({ phase: 'montee', selected: null, demoOpen: false, series: 'idx' });
      this.toast('Séquence de démonstration · rejeu PH-CI-003');
      STEPS.forEach((m, i) => this.later(() => { this.push(m); if (idxOf(m) >= 60 && this.state.phase !== 'alerte') this.triggerAlert(); }, 2000 * (i + 1)));
      this.later(() => { this.seqRunning = false; }, 2000 * STEPS.length + 300);
    }
    triggerAlert(m, code, id) {
      const s = this.state, srv = s.demoSource === 'serveur';
      if (s.view !== 'apercu' && s.view !== 'carte') this.go('apercu');
      this.set({ phase: 'alerte', alertAt: Date.now(), a413: 'nouvelle', banner: true, alertCode: code || (srv ? null : 'SIM-' + hhmm(Date.now()).replace(':', '')), alertId: id || null });
      if (!srv) this.sendTelegram(m || s.disp);
      if (!s.muted) this.chime();
      this.later(() => { if (this.mapEl.playAlert) this.mapEl.playAlert(); }, 1200);
      this.later(() => this.toast(srv ? 'Alerte ' + code + ' créée par le serveur · Telegram envoyé par le serveur' : 'Simulation · alerte locale, rien n’est enregistré'), 2400);
    }
    handleSeq(step) {
      this.set({ seqStep: step });
      if (step === 'cercle') this.toast('Analyse Sentinel-2 lancée · rayon de 5 km');
      if (step === 'fin') {
        this.set({ a413: 'analyse', seqStep: null });
        const sat = this.state.sat;
        this.setAlertStatus('analyse', sat ? { site_id: 'ORP-0142', satellite_result: { surface_totale_ha: sat.summary.surface_totale_ha, n_zones: sat.summary.n_zones, signal_moyen: sat.summary.signal_moyen, premiere_detection: sat.summary.premiere_detection, synthetic: sat.synthetic, dataset: sat.base } } : null);
        if (this.autoCompare) { this.autoCompare = false; this.later(() => this.go('satellite'), 2600); }
      }
    }
    reset(alerte) {
      if (!alerte && this.state.demoSource === 'serveur') this.closeOpenAlerts();
      this.clearTimers(); this.seqRunning = false; this.autoCompare = false; cancelAnimationFrame(this.traf);
      const n = this.initial(alerte), keep = ['view', 'demoOpen', 'muted', 'demoSource', 'on', 'camErr', 'sat', 'satErr', 'server', 'dbAlerts', 'dbMissions', 'dbReports', 'dev', 'devSms', 'frames', 'series', 'newMissions', 'base', 'zoom', 's2year', 'cmpMode', 'cmpIndex', 'cmpOpacity'];
      keep.forEach(k => { n[k] = this.state[k]; });
      this.state = n; this.set({}, () => this.applyMapMode());
    }
    applyMapMode() { if (this.mapEl.setMode) this.mapEl.setMode(this.state.phase === 'alerte' ? 'alerte' : 'calme'); }
    chime() {
      try { const AC = window.AudioContext || window.webkitAudioContext; const ctx = this.actx || (this.actx = new AC()); const t = ctx.currentTime + 0.02;
        [[660, 0], [880, 0.2]].forEach(([f, dl]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + dl); g.gain.exponentialRampToValueAtTime(0.09, t + dl + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dl + 0.34); o.connect(g); g.connect(ctx.destination); o.start(t + dl); o.stop(t + dl + 0.36); });
      } catch (e) { /* audio indisponible */ }
    }
    handleKey(e) {
      const t = e.target, s = this.state;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.set({ searchOpen: true }); return; }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { if (e.key === 'Escape') { t.blur(); if (s.searchOpen) this.set({ searchOpen: false }); } return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'D' && e.shiftKey) { this.set({ demoOpen: !s.demoOpen, moreOpen: false }); return; }
      if (e.key === 'd' || e.key === 'D') { this.runSequence(); return; }
      if ((e.key === 'r' || e.key === 'R') && s.demoOpen) { this.reset(false); return; }
      if (e.key === 'Escape') {
        if (s.searchOpen) this.set({ searchOpen: false });
        else if (s.morePop) this.set({ morePop: false });
        else if (s.demoOpen || s.moreOpen) this.set({ demoOpen: false, moreOpen: false });
        else if (s.layersOpen) this.set({ layersOpen: false });
        else if (s.selected && this.mapEl.select) this.mapEl.select(null);
      }
    }
    callMap(fn, ...a) { const el = this.mapEl; if (el && el[fn]) return el[fn](...a); return null; }
    goMap(fn) { if (this.state.view !== 'carte') { this.go('carte'); this.later(fn, 450); } else fn(); }
    doSearch(q) {
      const run = () => { const r = this.callMap('search', q); this.set({ searchMsg: r ? 'Trouvé · ' + r.label : 'Aucun résultat pour « ' + q + ' »' }); if (!r) this.toast('Aucun résultat pour « ' + q + ' »'); this.later(() => this.set({ searchMsg: '' }), 3200); };
      this.goMap(run);
    }

    /* webcam (turbidité optique) */
    setSource(k) {
      OPTIC = k === 'optique'; store.set('cirex-source', k); this.set({ demoSource: k });
      if (k === 'serveur') this.later(() => this.loadHistory(), 120);
      if (OPTIC) this.startCam(); else this.stopCam();
      this.later(() => this.reset(false), 50);
    }
    startCam() {
      if (this.camStream) return;
      const framed = (() => { try { return window.top !== window; } catch (e) { return true; } })();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.set({ camErr: window.isSecureContext ? 'Caméra non disponible dans ce navigateur.' : 'La caméra exige une adresse https ou un fichier ouvert en local.' }); return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }).then(st => {
        this.camStream = st; const v = this.camV; v.muted = true; v.playsInline = true; v.srcObject = st; v.play().catch(() => {});
        this.opt = { sd0: Number(store.get('orp-optic-sd0', 0)) || 0, sd: 0, turb: 5, ready: false };
        clearInterval(this.camTimer); this.camTimer = setInterval(() => this.sampleCam(), 400);
        this.set({ camErr: '' });
      }).catch(e => { const n = e && e.name; this.set({ camErr: n === 'NotAllowedError' && framed ? 'Caméra bloquée dans l’aperçu. Ouvrez la page dans un onglet et autorisez la caméra.' : n === 'NotAllowedError' ? 'Accès à la caméra refusé. Autorisez-la dans la barre d’adresse, puis rechoisissez Webcam.' : n === 'NotFoundError' ? 'Aucune caméra détectée sur ce poste.' : n === 'NotReadableError' ? 'Caméra déjà utilisée par une autre application. Fermez-la et réessayez.' : 'Caméra indisponible (' + (n || 'erreur') + ').' }); });
    }
    stopCam() { clearInterval(this.camTimer); if (this.camStream) this.camStream.getTracks().forEach(t => t.stop()); this.camStream = null; this.opt = null; }
    sampleCam() {
      const v = this.camV, o = this.opt; if (!v || !o || v.readyState < 2 || !v.videoWidth) return;
      const W = v.videoWidth, H = v.videoHeight, c = this.camCv || (this.camCv = document.createElement('canvas')); c.width = 96; c.height = 72;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, W * 0.3, H * 0.3, W * 0.4, H * 0.4, 0, 0, 96, 72);
      const dd = x.getImageData(0, 0, 96, 72).data; let su = 0, s2 = 0; const n = dd.length / 4;
      for (let i = 0; i < dd.length; i += 4) { const l = 0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2]; su += l; s2 += l * l; }
      const mean = su / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      o.sd = o.sd ? o.sd * 0.6 + sd * 0.4 : sd;
      if (o.sd0) { const r = Math.max(0, Math.min(1, o.sd / o.sd0)); o.turb = Math.min(1000, 5 + 600 * Math.pow(1 - r, 1.3)); o.ready = true; }
      const pv = this.camP;
      if (this.state.demoOpen && pv) { const px = pv.getContext('2d'); px.drawImage(v, 0, 0, pv.width, pv.height); px.strokeStyle = '#F6CE3E'; px.lineWidth = 3; px.strokeRect(pv.width * 0.3, pv.height * 0.3, pv.width * 0.4, pv.height * 0.4); this.set({ camTick: Date.now() }); }
    }
    calibrate() { const o = this.opt; if (!o || !o.sd) { this.toast('Caméra pas encore prête'); return; } o.sd0 = o.sd; o.turb = 5; o.ready = true; store.set('orp-optic-sd0', String(o.sd)); this.reset(false); this.toast('Étalonné sur eau claire · référence 5 NTU'); }
    sendTelegram(m, test) {
      const C = CX(); if (!C) return;
      const v = m || this.state.disp;
      const body = test ? { kind: 'test' } : { kind: 'alerte', sensor_id: 'PH-CI-003', score: idxOf(v), turbidity_ntu: Math.round(v.turb), source: this.state.demoSource === 'rejeu' ? 'simulation' : this.state.demoSource, alert_code: this.state.alertCode || null };
      C.fn('notify-telegram', body).then(j => this.toast(j.sent ? 'Notification Telegram envoyée' : 'Telegram · ' + (j.reason || 'non envoyée'))).catch(e => this.toast('Telegram · ' + errMsg(e)));
    }

    /* ---------------------------------------------------------------- serveur Supabase */
    connectDb() {
      const C = CX(), db = C && C.db();
      if (!db) { this.set({ server: { ok: false, msg: 'Serveur non configuré ou bibliothèque Supabase indisponible' } }); return; }
      this.db = db; this.loadDb();
      this.chan = db.channel('cirex-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'readings', filter: 'sensor_id=eq.PH-CI-003' }, ev => this.onReading(ev.new))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, ev => this.onAlert(ev))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => this.loadDb('missions'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => this.loadDb('reports'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'device_status', filter: 'sensor_id=eq.PH-CI-003' }, ev => { if (ev.new && ev.new.sensor_id) this.set({ dev: ev.new }); })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: 'sensor_id=eq.PH-CI-003' }, ev => { this.set(s => ({ devSms: [ev.new].concat(s.devSms).slice(0, 100) })); if (this.esp.cfg.mode === 'serveur') this.toast((/alerte/i.test(ev.new.body) ? 'SMS d’alerte · ' : 'Nouveau SMS · ') + (ev.new.sender || 'inconnu')); })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'camera_frames', filter: 'sensor_id=eq.PH-CI-003' }, ev => this.set(s => ({ frames: [ev.new].concat(s.frames).slice(0, 24), frameSel: null })))
        .subscribe(st => this.set({ server: { ok: st === 'SUBSCRIBED', msg: st === 'SUBSCRIBED' ? 'Serveur connecté · temps réel' : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? 'Serveur injoignable' : 'Connexion au serveur…' } }));
    }
    loadDb(only) {
      const db = this.db; if (!db) return;
      if (!only || only === 'alerts') db.from('alerts').select('id, code, sensor_id, created_at, suspicion_score, status, source, trigger').order('created_at', { ascending: false }).limit(30).then(({ data }) => data && this.set({ dbAlerts: data }));
      if (!only || only === 'missions') db.from('missions').select('id, code, target, locality, kind, agent, status, created_at, alert_id').order('created_at', { ascending: false }).limit(50).then(({ data }) => data && this.set({ dbMissions: data }));
      if (!only || only === 'device') {
        db.from('device_status').select('sensor_id, status, updated_at').eq('sensor_id', 'PH-CI-003').maybeSingle().then(({ data }) => this.set({ dev: data || null }));
        db.from('sms_messages').select('id, sender, body, sent_at, received_at').eq('sensor_id', 'PH-CI-003').order('received_at', { ascending: false }).limit(100).then(({ data }) => data && this.set({ devSms: data }));
        db.from('camera_frames').select('id, path, bytes, taken_at').eq('sensor_id', 'PH-CI-003').order('taken_at', { ascending: false }).limit(24).then(({ data }) => data && this.set({ frames: data }));
      }
      if (!only || only === 'reports') db.from('reports').select('id, code, title, kind, status, updated_at').order('updated_at', { ascending: false }).limit(50).then(({ data }) => data && this.set({ dbReports: data }));
    }
    loadHistory() {
      if (!this.db) return;
      this.db.from('readings').select('measured_at, turbidity_ntu, ph, tds_ppm, temperature_c').eq('sensor_id', 'PH-CI-003').order('measured_at', { ascending: false }).limit(300).then(({ data }) => {
        if (!data || !data.length) { this.toast('Aucune mesure reçue de PH-CI-003 pour le moment'); return; }
        const rows = data.slice().reverse().map(r => ({ turb: r.turbidity_ntu, ph: r.ph == null ? CALM.ph : r.ph, tds: r.tds_ppm == null ? CALM.tds : r.tds_ppm, temp: r.temperature_c == null ? CALM.temp : r.temperature_c }));
        const h = { turb: [], ph: [], tds: [], temp: [], idx: [] };
        while (rows.length < 2) rows.unshift(rows[0]);
        rows.forEach(m => { KEYS.forEach(k => h[k].push(m[k])); h.idx.push(idxOf(m)); });
        this.lastReal = Date.parse(data[0].measured_at);
        this.set({ hist: h, disp: Object.assign({}, rows[rows.length - 1]) });
      });
    }
    onReading(r) {
      if (this.state.demoSource !== 'serveur' || r.turbidity_ntu == null) return;
      const m = { turb: r.turbidity_ntu, ph: r.ph == null ? CALM.ph : r.ph, tds: r.tds_ppm == null ? CALM.tds : r.tds_ppm, temp: r.temperature_c == null ? CALM.temp : r.temperature_c };
      this.lastReal = Date.now(); this.push(m);
    }
    onAlert(ev) {
      this.loadDb('alerts');
      const a = ev.new || {};
      if (ev.eventType === 'INSERT' && a.sensor_id === 'PH-CI-003' && this.state.demoSource === 'serveur' && this.state.phase !== 'alerte') { const t = a.trigger || {}; this.triggerAlert({ turb: t.turbidity_ntu, ph: t.ph, tds: t.tds_ppm, temp: t.temperature_c }, a.code, a.id); }
    }
    closeOpenAlerts() {
      if (!this.db) return Promise.resolve();
      return this.db.from('alerts').update({ status: 'cloturee' }).eq('sensor_id', 'PH-CI-003').not('status', 'in', '("cloturee","fausse")').then(({ error }) => { if (error) this.toast('Clôture de l’alerte impossible · ' + errMsg(error)); else this.loadDb('alerts'); });
    }
    setAlertStatus(status, extra) {
      if (!this.db || !this.state.alertId) return;
      this.db.from('alerts').update(Object.assign({ status }, extra || {})).eq('id', this.state.alertId).then(({ error }) => { if (error) console.warn('[cirex] statut alerte', error.message); });
    }
    dbMissionRows() {
      const codeOf = id => { const a = this.state.dbAlerts.find(x => x.id === id); return a ? a.code : ''; };
      return this.state.dbMissions.map(m => { const dt = new Date(m.created_at); return { id: m.code, target: m.target, loc: m.locality || '', type: m.kind, agent: m.agent || 'À assigner', status: m.status, opened: dt.getDate() + ' ' + MONTHS[dt.getMonth()], alert: codeOf(m.alert_id), real: true }; });
    }
    allMissions() { return this.dbMissionRows().concat(this.state.newMissions, MISSIONS.map(m => Object.assign({}, m, { fictif: true }))); }
    missionFor(aid) { const m = this.allMissions().find(x => x.alert === aid); return m ? m.id : ''; }
    addMission(target) {
      if (!target) return;
      const info = SITE_INFO[target], loc = info ? info.title.split(' · ')[1] : '';
      if (this.db) {
        this.db.from('missions').insert({ target, locality: loc, kind: 'Vérification terrain', alert_id: target === 'ORP-0142' ? this.state.alertId : null, instructions: target === 'ORP-0142' ? 'Vérifier les zones 1 à 3 du comparateur Sentinel-2, photo géolocalisée de chaque zone, prélèvement d’eau en aval.' : null }).select('code').single().then(({ data, error }) => {
          if (error) { if (isNet(error)) this.addLocalMission(target, loc, 'Serveur injoignable'); else this.toast('Mission non enregistrée · ' + errMsg(error)); return; }
          this.toast('Mission ' + data.code + ' créée · ' + target + ' · à assigner'); this.loadDb('missions');
          if (target === 'ORP-0142') { this.set({ mission: data.code }); if (this.state.alertId) { this.setAlertStatus('assignee'); this.set({ a413: 'assignee' }); } }
        });
        return;
      }
      this.addLocalMission(target, loc, 'Serveur indisponible');
    }
    addLocalMission(target, loc, why) {
      const mid = 'LOCAL-' + (this.state.newMissions.length + 1);
      this.set(s => ({ newMissions: [{ id: mid, target, loc, type: 'Vérification terrain', agent: 'À assigner', status: 'aassigner', opened: 'aujourd’hui', alert: '' }].concat(s.newMissions), mission: target === 'ORP-0142' ? mid : s.mission }));
      this.toast(why + ' · mission ' + mid + ' gardée dans cette page seulement');
    }
    summaryForDb() {
      const d = this.state.sat; if (!d) return {};
      const S = d.summary;
      return { site: 'ORP-0142 · Kokumbo', synthetic: d.synthetic, surface_totale_ha: S.surface_totale_ha, n_zones: S.n_zones, signal_moyen: S.signal_moyen, premiere_detection: S.premiere_detection,
        avant: { periode: S.avant.periode, n_images: S.avant.dates.length }, apres: { periode: S.apres.periode, n_images: S.apres.dates.length }, genere_le: S.genere_le, dataset: d.base,
        zones: d.zones.slice(0, 10).map(z => ({ id: z.id, type: z.type, surface_ha: z.ha, signal: z.signal, premiere_detection: z.first, centre: z.centre })) };
    }
    async addReport() {
      const C = CX(), db = C && C.db(), s = this.state;
      if (s.report) { window.open('rapport.html?code=' + encodeURIComponent(s.report), '_blank', 'noopener'); return; }
      if (!db) { this.toast('Serveur non configuré : rapport non enregistré'); return; }
      this.set({ busy: true });
      const { data, error } = await db.from('reports').insert({ title: 'Site ORP-0142 · Kokumbo', kind: 'Rapport d’alerte', alert_id: s.alertId || null, content: { satellite: this.summaryForDb() } }).select('code').single();
      this.set({ busy: false });
      if (error) {
        if (isNet(error)) { this.toast('Serveur injoignable · rapport non enregistré · aperçu local ouvert'); window.open('rapport.html', '_blank', 'noopener'); }
        else this.toast('Rapport non enregistré · ' + errMsg(error));
        return;
      }
      this.set({ report: data.code }); this.toast('Rapport ' + data.code + ' créé · ouvrez-le pour l’imprimer en PDF'); this.loadDb('reports');
    }
    siteRegister() {
      if (this._reg) return this._reg;
      const O = window.ORP; if (!O) return [];
      let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const named = O.SITES.map(x => ({ id: x.id, name: x.name, region: x.region, status: x.status, ha: x.ha, img: NAMED[x.id][0], permit: NAMED[x.id][1] }));
      const gen = O.GEN.map(pt => { let b = BELTS[0], bd = 1e9; BELTS.forEach(x => { const dd = Math.hypot(pt.lat - x[0], pt.lon - x[1]); if (dd < bd) { bd = dd; b = x; } }); return { id: pt.id, name: '', region: b[2], status: pt.status, wt: 0.5 + R(), img: (20 + Math.floor(R() * 9)) + ' sept.', permit: pt.status === 'legal' ? 'Autorisation valide' : pt.status === 'noncompliant' ? 'Hors périmètre autorisé' : 'Aucun permis' }; });
      Object.keys(SITE_TOT).forEach(st => {
        const rest = SITE_TOT[st] - named.filter(n => n.status === st).reduce((a, n) => a + n.ha, 0), g = gen.filter(x => x.status === st), W = g.reduce((a, x) => a + x.wt, 0);
        let acc = 0; g.forEach((x, i) => { if (i === g.length - 1) x.ha = Math.round((rest - acc) * 10) / 10; else { x.ha = Math.round(rest * x.wt / W * 10) / 10; acc += x.ha; } });
      });
      if (this.state.sat) this._reg = named.concat(gen).sort((a, b) => (a.id < b.id ? -1 : 1));
      return named.concat(gen).sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    /* ---------------------------------------------------------------- station ESP32 */
    espBase() { const h = (this.esp.cfg.host || '').trim().replace(/\/+$/, ''); return h ? (/^https?:\/\//i.test(h) ? h : 'http://' + h) : ''; }
    espStream() { const e = this.esp; if ((e.cfg.stream || '').trim()) return e.cfg.stream.trim(); try { const u = new URL(this.espBase()); u.port = '81'; u.pathname = '/stream'; return u.toString(); } catch (x) { return ''; } }
    espSave() { store.set('orp-esp-cfg', JSON.stringify(this.esp.cfg)); }
    espSet(k, v) { this.esp.cfg[k] = v; this.espSave(); this.set({ espTick: Date.now() }); }
    espLive() { const e = this.esp; return e.on && (e.sim || (e.last && Date.now() - e.last < 6000)); }
    espMeasure() {
      if (!this.espLive()) return null; const st = this.esp.status || {}, g = ks => { for (const k of ks) { const v = Number(st[k]); if (st[k] !== undefined && isFinite(v)) return v; } return undefined; };
      const turb = g(['turbidity', 'turb', 'ntu', 'turbidite']); if (turb === undefined) return null;
      const ph = g(['ph']), tds = g(['tds', 'conductivity']), temp = g(['temperature', 'water_temp', 'temp']);
      return { turb, ph: ph === undefined ? CALM.ph : ph, tds: tds === undefined ? CALM.tds : tds, temp: temp === undefined ? CALM.temp : temp };
    }
    espErrMsg(url) { return location.protocol === 'https:' && /^(http|ws):/i.test(url) ? 'Page ouverte en https : le navigateur bloque ' + url + '. Ouvrez le site en local, sur le même Wi-Fi que l’ESP32.' : 'ESP32 injoignable à ' + url + ' · vérifiez l’adresse et le Wi-Fi.'; }
    espConnect() {
      this.espStop(true); const e = this.esp, mode = e.cfg.mode;
      Object.assign(e, { on: true, sim: mode === 'sim', status: {}, last: 0, t0: Date.now(), err: '', streamErr: false });
      if (mode === 'sim') {
        e.simFrames = 0; this.espSimTick(); this.espAddSms([{ from: '+225 07 58 21 44 10', text: SIM_SMS[1], time: Date.now() - 60000 }, { from: '+225 07 58 21 44 10', text: SIM_SMS[0], time: Date.now() }], true);
        e.iv.push(setInterval(() => this.espSimTick(), 2000)); let i = 2; e.iv.push(setInterval(() => { this.espAddSms([{ from: '+225 07 58 21 44 10', text: SIM_SMS[i++ % SIM_SMS.length], time: Date.now() }]); }, 20000));
      } else if (mode === 'ws') this.espOpenWs();
      else { this.espPoll(); this.espPollSms(); e.iv.push(setInterval(() => this.espPoll(), 2000)); e.iv.push(setInterval(() => this.espPollSms(), 4000)); }
      this.set({ espTick: Date.now() });
    }
    espStop(silent) {
      const e = this.esp; e.iv.forEach(clearInterval); e.iv = []; clearTimeout(e.wsRetry);
      if (e.ws) { e.ws.onclose = null; try { e.ws.close(); } catch (x) { /* déjà fermé */ } e.ws = null; }
      if (e.frame) { URL.revokeObjectURL(e.frame); e.frame = ''; }
      e.on = false; e.sim = false; if (!silent) this.set({ espTick: Date.now() });
    }
    espFetch(url) { const c = window.AbortController ? new AbortController() : null, t = setTimeout(() => c && c.abort(), 1800); return fetch(url, { cache: 'no-store', signal: c ? c.signal : undefined }).then(r => { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, x => { clearTimeout(t); throw x; }); }
    espPoll() {
      const e = this.esp, url = this.espBase() + '/status'; if (!e.on || e.sim) return;
      this.espFetch(url).then(j => { if (!e.on) return; if (j && typeof j === 'object') { if (Array.isArray(j.sms)) this.espAddSms(j.sms); if (Array.isArray(j.messages)) this.espAddSms(j.messages); e.status = j; } e.last = Date.now(); e.err = ''; this.set({ espTick: Date.now() }); })
        .catch(() => { if (!e.on) return; e.err = this.espErrMsg(url); this.set({ espTick: Date.now() }); });
    }
    espPollSms() { const e = this.esp; if (!e.on || e.sim) return; this.espFetch(this.espBase() + '/sms').then(j => { const l = Array.isArray(j) ? j : (j && (j.messages || j.sms)) || []; if (l.length) this.espAddSms(l); }).catch(() => { /* /sms optionnel */ }); }
    espAddSms(list, quiet) {
      const e = this.esp; let added = 0, alertFrom = '';
      list.forEach(m => {
        if (!m) return; const from = String(m.from || m.number || m.sender || m.phone || 'Inconnu'), text = String(m.text || m.body || m.message || m.msg || ''), raw = m.time || m.date || m.ts || m.timestamp;
        const key = (m.id !== undefined ? 'id' + m.id : from + '|' + text + '|' + (raw || '')); if (e.smsKeys[key]) return;
        e.smsKeys[key] = 1; e.sms.unshift({ from, text, t: raw ? espTime(raw) : Date.now() }); added++; if (/alerte/i.test(text)) alertFrom = from;
      });
      if (!added) return; e.sms.sort((a, b) => b.t - a.t); e.sms = e.sms.slice(0, 100);
      if (!quiet) this.toast(alertFrom ? 'SMS d’alerte reçu · ' + alertFrom : 'Nouveau SMS · ' + e.sms[0].from);
      this.set({ espTick: Date.now() });
    }
    espOpenWs() {
      const e = this.esp, url = (e.cfg.ws || '').trim(); if (!url) { e.err = 'Renseignez l’adresse WebSocket.'; return; }
      let ws; try { ws = new WebSocket(url); } catch (x) { e.err = this.espErrMsg(url); return; }
      ws.binaryType = 'blob'; e.ws = ws;
      ws.onopen = () => { e.err = ''; e.last = Date.now(); this.set({ espTick: Date.now() }); };
      ws.onmessage = ev => {
        e.last = Date.now();
        if (typeof ev.data !== 'string') { const u = URL.createObjectURL(ev.data); if (e.frame) URL.revokeObjectURL(e.frame); e.frame = u; this.set({ espTick: Date.now() }); return; }
        let j = null; try { j = JSON.parse(ev.data); } catch (x) { this.espAddSms([{ from: 'ESP32', text: ev.data }]); return; }
        if (!j || typeof j !== 'object') return;
        if (j.type === 'sms' || (j.from && j.text && !j.rssi)) this.espAddSms([j]);
        else { if (Array.isArray(j.sms)) this.espAddSms(j.sms); e.status = Object.assign({}, e.status, j); this.set({ espTick: Date.now() }); }
      };
      ws.onerror = () => { e.err = this.espErrMsg(url); this.set({ espTick: Date.now() }); };
      ws.onclose = () => { if (!e.on) return; e.ws = null; e.wsRetry = setTimeout(() => { if (e.on) this.espOpenWs(); }, 3000); this.set({ espTick: Date.now() }); };
    }
    espSimTick() {
      const e = this.esp, up = Math.floor((Date.now() - e.t0) / 1000) + 1188; e.simFrames = (e.simFrames || 806) + 6;
      e.status = { rssi: -48 + Math.round((Math.random() - 0.5) * 6), sensor: 'RGB565 · 10 MHz', frames: e.simFrames, errors: 0, uptime: up, ip: '192.168.4.1', operator: 'Orange CI', csq: 18, battery: 3.92, turbidity: +(9 + (Math.random() - 0.5) * 1.6).toFixed(1), tds: 134, temperature: 27.8 };
      e.last = Date.now(); this.set({ espTick: Date.now() });
    }
    espCmd(v, val) {
      const e = this.esp; if (!e.on) return; e[v] = val;
      if (e.sim) this.toast('Simulation · ' + v + ' = ' + val);
      else if (e.cfg.mode === 'ws') { if (e.ws && e.ws.readyState === 1) e.ws.send(JSON.stringify({ cmd: v, val })); }
      else { const u = this.espBase() + '/control?var=' + encodeURIComponent(v) + '&val=' + encodeURIComponent(typeof val === 'boolean' ? (val ? 1 : 0) : val); fetch(u, { mode: 'no-cors', cache: 'no-store' }).catch(() => this.toast('Commande non transmise à l’ESP32')); }
      if (v === 'mode') e.shot = Date.now();
      this.set({ espTick: Date.now() });
    }
    espPhoto() {
      const e = this.esp; if (!e.on) return;
      if (e.frame) { const a = document.createElement('a'); a.href = e.frame; a.download = 'esp32cam-' + Date.now() + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (e.sim) { this.toast('Pas d’image en simulation'); return; }
      if (e.mode === 'photo') { e.shot = Date.now(); this.set({ espTick: Date.now() }); return; }
      window.open(this.espBase() + '/capture?t=' + Date.now(), '_blank', 'noopener');
    }
    devInfo() { const d = this.state.dev, st = d && d.status && typeof d.status === 'object' ? d.status : {}; const has = !!(d && Object.keys(st).length), t = d ? Date.parse(d.updated_at) : 0; return { st, has, t, fresh: has && Date.now() - t < 30000 }; }
    frameUrl(f) { const C = CX(); return f && C && C.config.supabaseUrl ? C.config.supabaseUrl + '/storage/v1/object/public/camera/' + f.path.split('/').map(encodeURIComponent).join('/') : ''; }
    devCmd(cmd, val) {
      if (!this.db) { this.toast('Serveur non configuré'); return; }
      this.db.from('device_commands').insert({ sensor_id: 'PH-CI-003', cmd, val: val == null ? null : String(val) }).then(({ error }) => this.toast(error ? 'Commande refusée · ' + errMsg(error) : (cmd === 'capture' ? 'Photo demandée au boîtier · elle s’affichera à son arrivée' : 'Commande envoyée au boîtier · ' + cmd + ' = ' + val)));
    }
    espFull() { const b = this.$('#cx-espbox'); if (!b) return; if (document.fullscreenElement) document.exitFullscreen(); else if (b.requestFullscreen) b.requestFullscreen(); }
    /* état de la station, quel que soit le mode */
    espModel() {
      if (this._em && this._em.pc === this._pc) return this._em.v;
      const v = this.espModel0(); this._em = { pc: this._pc, v }; return v;
    }
    espModel0() {
      const e = this.esp, cfg = e.cfg, s = this.state, now = Date.now();
      const ago = t => { const x = Math.max(0, Math.round((now - t) / 1000)); return x < 60 ? 'il y a ' + x + ' s' : x < 3600 ? 'il y a ' + Math.floor(x / 60) + ' min' : this.rel(t); };
      const tilesOf = st => { const keys = Object.keys(st).filter(k => !ESP_SKIP[k.toLowerCase()]), seen = {}, out = []; keys.sort((a, b) => { const ia = ESP_ORDER.indexOf(a.toLowerCase()), ib = ESP_ORDER.indexOf(b.toLowerCase()); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); }); keys.forEach(k => { const lab = espLabel(k); if (seen[lab]) return; seen[lab] = 1; out.push({ k: lab, v: espFmt(k, st[k], st) }); }); return out; };
      if (cfg.mode === 'serveur') {
        const D = this.devInfo(), st = D.st;
        const link = !this.db ? ['mute', 'Serveur non configuré'] : !D.has ? ['mute', 'Aucune donnée reçue'] : D.fresh ? ['ok', 'Connectée · serveur'] : ['warn', 'Dernière donnée ' + ago(D.t)];
        const tiles = tilesOf(st); if (D.has) tiles.push({ k: 'Mise à jour', v: ago(D.t) });
        const sms = s.devSms.map(m => { const t = Date.parse(m.sent_at || m.received_at); return { from: m.sender || 'Inconnu', text: m.body, time: smsClock(t), alert: /alerte/i.test(m.body) }; });
        const frames = s.frames, cur = (s.frameSel && frames.find(f => f.id === s.frameSel)) || frames[0], src = this.frameUrl(cur);
        return { srv: true, link, tiles, sms, src, stream: false, badge: cur ? 'Photo · ' + ago(Date.parse(cur.taken_at)) : link[1], empty: ['Aucune photo reçue', this.db ? 'Le boîtier (ou le relais) envoie ses photos à la fonction device-event. Demandez-en une avec « Prendre une photo ».' : 'Serveur non configuré.'],
          thumbs: frames.slice(0, 12).map(f => ({ id: f.id, src: this.frameUrl(f), on: cur && f.id === cur.id, label: 'Photo du ' + smsClock(Date.parse(f.taken_at)) })), help: ESP_HELP_SRV, err: '', warn: '', smsEmpty: 'Aucun SMS reçu. Les messages du module SIM transmis par le boîtier s’affichent ici dès leur arrivée.', ok: !!this.db, gsm: [st.operator, st.csq !== undefined ? 'signal ' + st.csq + '/31' : ''].filter(Boolean).join(' · ') };
      }
      const st = e.status || {};
      const link = !e.on ? ['mute', 'Non connectée'] : e.sim ? ['gold', 'Simulation'] : e.last && now - e.last < 6000 ? ['ok', 'Connectée'] : e.last ? ['crit', 'Liaison perdue'] : ['warn', 'Connexion…'];
      const tiles = tilesOf(st); if (!tiles.length) ['rssi', 'sensor', 'frames', 'uptime'].forEach(k => tiles.push({ k: espLabel(k), v: '–' }));
      const http = cfg.mode === 'http', stream = this.espStream(), photoMode = e.mode === 'photo';
      let src = '', empty = ['Caméra non connectée', 'Renseignez l’adresse de l’ESP32-CAM, puis Connecter.'];
      if (e.on && !e.sim && http && !e.streamErr) src = photoMode ? this.espBase() + '/capture?t=' + (e.shot || e.t0) : stream + (stream.indexOf('?') >= 0 ? '&' : '?') + 't=' + e.t0;
      if (e.on && !e.sim && cfg.mode === 'ws') { src = e.frame; empty = ['En attente d’images', 'Aucune image reçue sur ' + (cfg.ws || '') + ' pour le moment.']; }
      if (e.on && e.sim) empty = ['Pas de vidéo en simulation', 'Les cases et les SMS sont simulés. Connectez l’ESP32-CAM en HTTP ou WebSocket pour voir les images.'];
      if (e.on && http && e.streamErr) empty = ['Flux vidéo injoignable', this.espErrMsg(photoMode ? this.espBase() + '/capture' : stream)];
      const warnUrl = cfg.mode === 'ws' ? cfg.ws || '' : this.espBase();
      return { srv: false, link, tiles, src, stream: http && !photoMode, badge: e.on ? (e.sim ? 'Simulation' : link[1] + (photoMode ? ' · photo' : ' · flux continu')) : 'Hors ligne', empty, thumbs: [],
        sms: e.sms.map(m => ({ from: m.from, text: m.text, time: smsClock(m.t), alert: /alerte/i.test(m.text) })), help: ESP_HELP,
        err: e.on && !e.sim && e.err ? e.err : '', warn: cfg.mode !== 'sim' && location.protocol === 'https:' && /^(http|ws):/i.test(warnUrl) ? 'Page servie en https : le navigateur refusera de joindre ' + warnUrl + '. Pour la démo, ouvrez le site en local sur un ordinateur relié au même Wi-Fi que l’ESP32.' : '',
        smsEmpty: e.on ? 'Aucun SMS reçu pour le moment.' : 'Connectez l’ESP32 pour recevoir les SMS de son module SIM.', ok: e.on, photoMode, gsm: [st.operator, st.csq !== undefined ? 'signal ' + st.csq + '/31' : ''].filter(Boolean).join(' · ') };
    }

    /* comparateur : attributs de <orp-compare> */
    syncCmp() { const c = this.cmpEl, s = this.state; if (!c) return; [['data-mode', s.cmpMode], ['data-index', s.cmpIndex], ['data-opacity', String(s.cmpOpacity)]].forEach(([k, v]) => { if (c.getAttribute(k) !== v) c.setAttribute(k, v); }); }

    /* ---------------------------------------------------------------- graphiques */
    chartHover(e) {
      const box = e.target.closest && e.target.closest('[data-chart]'); if (!box) return;
      const id = box.getAttribute('data-chart'), meta = this.chartMeta && this.chartMeta[id]; if (!meta) return;
      const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * meta.W;
      let best = 0, bd = 1e9; meta.xs.forEach((xx, i) => { const dd = Math.abs(xx - x); if (dd < bd) { bd = dd; best = i; } });
      if (this.hov[id] !== best) { this.hov[id] = best; this.set({}); }
    }
    chartLeave(e) { const box = e.target.closest('[data-chart]'); if (!box) return; const id = box.getAttribute('data-chart'); if (this.hov[id] != null) { this.hov[id] = null; this.set({}); } }

    liveChart(key) {
      const s = this.state, ctx = this.ctx, id = 'live', W = Math.max(280, this.sizes[id] || 640), H = W < 480 ? 210 : 300;
      const ser = SERIES.find(x => x[0] === key) || SERIES[0];
      if (ctx.noLive) return '<div class="chart" data-chart="' + id + '"><div class="empty" style="height:' + H + 'px;display:grid;place-content:center"><b>En attente de mesures</b>Les valeurs du boîtier PH-CI-003 s’afficheront ici dès leur arrivée.</div></div>';
      const arr = s.hist[key].map(Number), n = arr.length, padL = 36, padR = W < 480 ? 64 : 84, top = 14, bot = H - 28;
      let lo, hi;
      if (key === 'idx') { lo = 0; hi = 100; } else { lo = Math.min(...arr); hi = Math.max(...arr); const span = { turb: 20, ph: 0.6, tds: 40, temp: 1 }[key]; if (hi - lo < span) { const c = (hi + lo) / 2; lo = c - span / 2; hi = c + span / 2; } const pd = (hi - lo) * 0.12; lo -= pd; hi += pd; if (key === 'turb' || key === 'tds') lo = Math.max(0, lo); }
      const X = i => padL + i / (n - 1) * (W - padL - padR), Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
      const line = 'M' + arr.map((v, i) => X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('L');
      const ticks = key === 'idx' ? [0, 25, 50, 75, 100] : [lo, lo + (hi - lo) / 2, hi];
      const dec = ser[3] + (key === 'idx' ? 0 : (hi - lo < 3 ? 1 : 0));
      let g = '';
      g += '<defs><linearGradient id="lg-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6CE3E" stop-opacity=".45"/><stop offset="1" stop-color="#F6CE3E" stop-opacity="0"/></linearGradient></defs>';
      ticks.forEach(v => { g += '<line class="grid-l" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ax" x="' + (padL - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fr(v, key === 'idx' ? 0 : dec) + '</text>'; });
      if (key === 'idx') g += '<rect x="' + padL + '" y="' + Y(100) + '" width="' + (W - padL - padR) + '" height="' + (Y(60) - Y(100)) + '" fill="rgba(224,68,47,.06)"/><line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(60) + '" y2="' + Y(60) + '" stroke="#E0442F" stroke-width="1.5" stroke-dasharray="5 5"/><text class="ax" x="' + (padL + 6) + '" y="' + (Y(60) - 7) + '" style="fill:#A1261A">Seuil d’alerte 60</text>';
      g += '<path d="' + line + 'L' + X(n - 1).toFixed(1) + ' ' + bot + 'L' + padL + ' ' + bot + 'Z" fill="url(#lg-' + id + ')"/>';
      g += '<path d="' + line + '" fill="none" stroke="#17171A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      g += '<line class="base-l" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + bot + '" y2="' + bot + '"/>';
      [[0, '−10 min'], [Math.round((n - 1) / 2), '−5 min'], [n - 1, 'maintenant']].forEach(([i, l], k) => { g += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (bot + 18) + '" text-anchor="' + (k === 0 ? 'start' : k === 2 ? 'end' : 'middle') + '">' + l + '</text>'; });
      const lv = arr[n - 1], ly = Y(lv), lab = fr(lv, key === 'idx' ? 0 : ser[3]) + (ser[2] ? ' ' + ser[2] : ''), lw = Math.max(44, lab.length * 7.6 + 18);
      g += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="5" fill="#17171A" stroke="#fff" stroke-width="2"/>';
      g += '<rect x="' + (X(n - 1) + 10).toFixed(1) + '" y="' + (ly - 14).toFixed(1) + '" width="' + lw + '" height="28" rx="14" fill="#17171A"/><text x="' + (X(n - 1) + 10 + lw / 2).toFixed(1) + '" y="' + (ly + 4.5).toFixed(1) + '" text-anchor="middle" style="font:700 13px var(--font);fill:#fff">' + esc(lab) + '</text>';
      const hi2 = this.hov[id], xs = arr.map((_, i) => X(i));
      this.chartMeta = this.chartMeta || {}; this.chartMeta[id] = { W, xs };
      let tip = '';
      if (hi2 != null && hi2 < n) {
        g += '<line x1="' + X(hi2) + '" x2="' + X(hi2) + '" y1="' + top + '" y2="' + bot + '" stroke="#17171A" stroke-width="1"/><circle cx="' + X(hi2) + '" cy="' + Y(arr[hi2]) + '" r="4.5" fill="#F6CE3E" stroke="#17171A" stroke-width="2"/>';
        const secs = (n - 1 - hi2) * 2, pct = X(hi2) / W * 100, right = pct > 60;
        tip = '<div class="tip is-on" style="' + (right ? 'right:calc(' + (100 - pct) + '% + 12px)' : 'left:calc(' + pct + '% + 12px)') + '"><span class="k">' + (secs ? 'il y a ' + (secs >= 60 ? Math.floor(secs / 60) + ' min ' + (secs % 60 ? secs % 60 + ' s' : '') : secs + ' s') : 'maintenant') + '</span><br><b>' + esc(ser[1]) + ' ' + fr(arr[hi2], key === 'idx' ? 0 : ser[3]) + (ser[2] ? ' ' + ser[2] : '') + '</b></div>';
      }
      return '<div class="chart" data-chart="' + id + '"><svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(ser[1]) + ' de PH-CI-003 sur les 10 dernières minutes, valeur actuelle ' + esc(lab) + '">' + g + '</svg>' + tip + '</div>';
    }

    ndviChart(id, Hh) {
      const d = this.state.sat; if (!d || !d.series || !d.series.points || !d.series.points.length) return '<div class="empty"><b>Série NDVI indisponible</b>Le calcul Sentinel-2 n’a pas été chargé.</div>';
      const C = CX(), pts = d.series.points, S = d.summary, W = Math.max(260, this.sizes[id] || 380), H = Hh || 200;
      const x0 = 34, x1 = W - (W < 360 ? 70 : 82), yTop = 22, yBot = H - 26, ZC = '#B07A0C', RC = '#2F8A5B';
      const t = s => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z'), tA = t(pts[0].date), tB = t(pts[pts.length - 1].date);
      const X = s => x0 + (t(s) - tA) / Math.max(1, tB - tA) * (x1 - x0), Y = v => yBot - Math.max(0, Math.min(1, v)) * (yBot - yTop);
      const path = k => { let p = '', pen = false; pts.forEach(q => { const v = q[k]; if (v == null) { pen = false; return; } p += (pen ? 'L' : 'M') + X(q.date).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return p; };
      const last = k => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i][k] != null) return pts[i]; return null; };
      let g = '';
      const band = (per, fill, label) => { const a = Math.max(x0, X(per[0])), b = Math.min(x1, X(per[1])); g += '<rect x="' + a + '" y="' + yTop + '" width="' + Math.max(1, b - a) + '" height="' + (yBot - yTop) + '" fill="' + fill + '" rx="4"/><text class="ax" x="' + ((a + b) / 2) + '" y="' + (yTop - 7) + '" text-anchor="middle">' + label + '</text>'; };
      band(S.avant.periode, 'rgba(47,138,91,.09)', 'avant'); band(S.apres.periode, 'rgba(176,122,12,.12)', 'après');
      [0, 0.25, 0.5, 0.75, 1].forEach(v => { g += '<line class="' + (v === 0 ? 'base-l' : 'grid-l') + '" x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="ax" x="' + (x0 - 7) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + fr(v, v % 0.5 ? 2 : 1) + '</text>'; });
      const y0 = new Date(tA).getUTCFullYear() + 1, y1 = new Date(tB).getUTCFullYear(), every = W < 420 ? 2 : 1;
      for (let y = y0; y <= y1; y++) { if ((y - y0) % every) continue; const xx = X(y + '-01-01'); g += '<text class="ax" x="' + xx + '" y="' + (yBot + 17) + '" text-anchor="middle">' + y + '</text>'; }
      const first = S.premiere_detection; if (first) { const fx = X(first); g += '<line x1="' + fx + '" x2="' + fx + '" y1="' + yTop + '" y2="' + yBot + '" stroke="#55565C" stroke-width="1"/><text class="ax" x="' + Math.min(fx + 5, x1 - 92) + '" y="' + (yTop + 13) + '" style="fill:#2E2F33">1re baisse · ' + esc(C.monthFr(first)) + '</text>'; }
      g += '<path d="' + path('ndvi_reference') + '" fill="none" stroke="' + RC + '" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round" stroke-linecap="round"/>';
      g += '<path d="' + path('ndvi_zones') + '" fill="none" stroke="' + ZC + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      const lz = last('ndvi_zones'), lr = last('ndvi_reference');
      [[lr, 'ndvi_reference', RC, 'réf.'], [lz, 'ndvi_zones', ZC, 'zones']].forEach(([q, k, col, txt]) => { if (!q) return; g += '<circle cx="' + X(q.date) + '" cy="' + Y(q[k]) + '" r="4" fill="' + col + '" stroke="#fff" stroke-width="2"/><text x="' + (x1 + 8) + '" y="' + (Y(q[k]) + 4) + '" style="font:700 12px var(--font);fill:#17171A">' + txt + ' ' + fr(q[k], 2) + '</text>'; });
      const hi = this.hov[id]; let tip = '';
      this.chartMeta = this.chartMeta || {}; this.chartMeta[id] = { W, xs: pts.map(q => X(q.date)) };
      if (hi != null && pts[hi]) {
        const q = pts[hi], hx = X(q.date), pct = hx / W * 100, right = pct > 55;
        g += '<line x1="' + hx + '" x2="' + hx + '" y1="' + yTop + '" y2="' + yBot + '" stroke="#17171A" stroke-width="1"/>';
        if (q.ndvi_zones != null) g += '<circle cx="' + hx + '" cy="' + Y(q.ndvi_zones) + '" r="4.5" fill="' + ZC + '" stroke="#fff" stroke-width="2"/>';
        if (q.ndvi_reference != null) g += '<circle cx="' + hx + '" cy="' + Y(q.ndvi_reference) + '" r="4.5" fill="' + RC + '" stroke="#fff" stroke-width="2"/>';
        tip = '<div class="tip is-on" style="' + (right ? 'right:calc(' + (100 - pct) + '% + 12px)' : 'left:calc(' + pct + '% + 12px)') + '"><span class="k">' + esc(C.dateFr(q.date)) + ' · ciel clair ' + Math.round(q.part_claire * 100) + ' %</span><br><i style="background:' + ZC + '"></i>zones <b>' + fr(q.ndvi_zones, 2) + '</b><br><i style="background:' + RC + '"></i>référence <b>' + fr(q.ndvi_reference, 2) + '</b></div>';
      }
      return '<div class="chart" data-chart="' + id + '"><svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="NDVI moyen des zones de changement et de la végétation stable, ' + esc(C.monthFr(pts[0].date)) + ' à ' + esc(C.monthFr(pts[pts.length - 1].date)) + '">' + g + '</svg>' + tip + '</div>' +
        '<div class="legend" style="margin-top:8px"><span><i style="background:' + ZC + '"></i>Zones de changement</span><span style="color:' + RC + '"><i class="dash" style="background:' + RC + '"></i><span style="color:var(--ink-2)">Végétation stable (référence)</span></span></div>';
    }

    /* ---------------------------------------------------------------- tableaux (vues liste) */
    listModel(key) {
      if (this._lm && this._lm.pc === this._pc && this._lm.key === key) return this._lm.v;
      const out = this.listModel0(key); this._lm = { pc: this._pc, key, v: out }; return out;
    }
    listModel0(key) {
      const s = this.state, ctx = this.ctx;
      const T = (t, o) => Object.assign({ k: 'txt', t }, o || {}), M = (t, o) => Object.assign({ k: 'code', t }, o || {}), P = p => ({ k: 'pill', p });
      const v = { head: [], items: [], filters: null, sum: () => '', foot: '' };
      if (key === 'alertes') {
        const closed = a => a.status === 'cloturee' || a.status === 'fausse';
        v.head = ['Alerte', 'Source', 'Indice', 'Détectée', 'Statut', 'Mission'];
        v.items = ctx.list.map(a => { const sat = a.sensor.indexOf('SAT') === 0, dt = new Date(a.t);
          return { it: a, hot: a.isNew, act: a.isNew || a.real ? ['go', 'satellite'] : ['mapsearch', sat ? 'ORP-0203' : a.sensor], cells: [M(a.id, { sub: sat ? 'Détection satellite' : 'Qualité de l’eau' }), M(a.sensor, { sub: a.loc }), { k: 'idx', v: a.idx == null ? a.ha : a.idx, c: idxColor(a.idx) }, T(this.rel(a.t), { sub: /^il y a|^hier/.test(this.rel(a.t)) ? dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()] + ' · ' + hhmm(a.t) : hhmm(a.t) + ' GMT' }), P(STA[a.status]), M(this.missionFor(a.id) || '–')] }; });
        v.filters = [['Toutes', () => true], ['Ouvertes', a => !closed(a)], ['Clôturées', closed]];
        v.sum = its => its.length + ' alerte' + (its.length > 1 ? 's' : '');
        v.foot = 'Les alertes marquées « fictif » sont des exemples de démonstration. Une ligne s’ouvre sur la carte ou sur l’analyse satellite.';
      } else if (key === 'sites') {
        v.head = ['Site', 'Région', 'Statut', 'Surface', 'Dernière image', 'Permis'];
        v.items = this.siteRegister().map(x => ({ it: x, act: ['mapsearch', x.id], cells: [M(x.id, { sub: x.name }), T(x.region), P(x.id === 'ORP-0142' ? SITE_P.presume : SITE_P[x.status]), T(fr(x.ha, 1) + ' ha', { strong: true }), T(x.img), T(x.permit, { muted: x.permit === 'Aucun permis' })] }));
        v.filters = [['Tous', () => true], ['Légaux', x => x.status === 'legal'], ['Non conformes', x => x.status === 'noncompliant'], ['Suspects', x => x.status === 'suspect'], ['Illégaux', x => x.status === 'illegal'], ['Démantelés', x => x.status === 'dismantled']];
        v.sum = its => its.length + ' sites · ' + fr(its.reduce((t, x) => t + x.ha, 0), 1) + ' ha';
        v.foot = 'Registre fictif de démonstration, sauf ORP-0142 dont la surface vient du calcul Sentinel-2. Une ligne s’ouvre sur la carte.';
      } else if (key === 'capteurs') {
        v.head = ['Capteur', 'Localité', 'État', 'Indice', 'Turbidité', 'pH', 'Conductivité', 'Dernière mesure'];
        v.items = SENS_TABLE.map(x => { const live = x.st === 'live', val = live ? (ctx.noLive ? null : ctx.d) : x.v, st = live ? (ctx.noLive ? 'offline' : ctx.zone) : x.st, ix = val ? (live ? ctx.idx : idxOf(val)) : null;
          return { it: x, hot: live && st === 'alerte', act: ['mapsearch', x.id], cells: [M(x.id, { sub: x.name + (live ? ' · réel' : ' · fictif') }), T(x.loc), P(live && ctx.noLive ? ['mute', 'En attente'] : SENS_P[st]), { k: 'idx', v: ix == null ? '–' : ix, c: ix == null ? 'var(--line-2)' : idxColor(ix) }, T(val ? fr(val.turb, 0) + ' NTU' : '–'), T(val ? fr(val.ph, 1) : '–'), T(val ? fr(val.tds, 0) + ' ppm' : '–'), T(live ? ctx.src : x.last, { muted: st === 'offline' })] }; });
        v.sum = () => '6 capteurs · 1 réel (PH-CI-003) · 5 fictifs';
        v.foot = 'Seul PH-CI-003 correspond à un boîtier réel. Une ligne s’ouvre sur la carte.';
      } else if (key === 'missions') {
        v.head = ['Mission', 'Objet', 'Agent', 'Statut', 'Ouverte', 'Alerte liée'];
        v.items = this.allMissions().map(m => ({ it: m, act: ['mapmission', m.target], cells: [M(m.id, { sub: m.type + (m.fictif ? ' · fictif' : '') }), M(m.target, { sub: m.loc }), T(m.agent, { muted: m.agent === 'À assigner' }), P(MIS_P[m.status] || MIS_P.aassigner), T(m.opened), M(m.alert || '–')] }));
        v.filters = [['En cours', m => m.status !== 'cloturee'], ['Clôturées', m => m.status === 'cloturee'], ['Toutes', () => true]];
        v.sum = its => its.length + ' mission' + (its.length > 1 ? 's' : '') + ' · ' + s.dbMissions.length + ' sur le serveur';
        v.foot = 'Missions marquées « fictif » : exemples de démonstration. Une ligne s’ouvre sur la carte.';
      } else if (key === 'rapports') {
        v.head = ['Rapport', 'Type', 'Mis à jour', 'Statut', 'Export'];
        const dbr = s.dbReports.map(r => { const dt = new Date(r.updated_at); return { id: r.code, title: r.title, type: r.kind, date: dt.getDate() + ' ' + MONTHS[dt.getMonth()], st: r.status, real: true }; });
        v.items = dbr.concat(REPORTS.map(r => Object.assign({}, r, { fictif: true }))).map(r => ({ it: r, cells: [T(r.title, { strong: true, sub: r.id + (r.fictif ? ' · fictif' : '') }), T(r.type), T(r.date), P(RPT_P[r.st] || RPT_P.brouillon), r.real ? { k: 'btn', t: 'Ouvrir en PDF', act: 'report', a: r.id } : T('exemple', { muted: true })] }));
        v.sum = its => its.length + ' rapports · ' + dbr.length + ' sur le serveur';
        v.foot = 'Un rapport s’ouvre dans une page imprimable (enregistrer en PDF depuis le navigateur).';
      } else if (key === 'equipe') {
        v.head = ['Nom', 'Zone', 'Statut', 'Mission', 'Dernière position'];
        v.items = TEAM.map((t, i) => ({ it: t, act: t.pos ? ['mapagent', String(i)] : null, cells: [T(t.name, { strong: true, sub: t.role }), T(t.zone), P(TEAM_P[t.status]), M(t.mission), T(t.seen)] }));
        v.sum = () => '5 membres · 4 agents de terrain · équipe fictive';
        v.foot = 'Équipe de démonstration. Un agent s’ouvre sur la carte.';
      } else if (key === 'parametres') {
        v.head = ['Réglage', 'Valeur', 'Activé'];
        const row = (name, sub, val, tg) => ({ it: name, cells: [T(name, { strong: true, sub }), val, tg || T('')] });
        v.items = [
          row('Seuil d’alerte de l’indice', 'Au-delà, une alerte est créée et notifiée', T('60 / 100', { strong: true })),
          row('Pondération de l’indice', 'Calcul de l’indice de suspicion', T('Turbidité 60 % · conductivité 25 % · pH 15 %')),
          row('Rayon d’analyse satellite', 'Autour du capteur en alerte', T('5 km', { strong: true })),
          row('Imagerie de détection', 'Comparaison avant / après', T('Sentinel-2 L2A · 10 m · médianes NDVI')),
          row('Fréquence de mesure', 'Boîtier PH-CI-003', T('2 s en démonstration · 15 min sur le terrain')),
          row('Notifications Telegram', 'Envoyées par le serveur', T('Jeton dans les secrets Supabase')),
          row('Son des alertes', 'Carillon à la création d’une alerte', T(s.muted ? 'Coupé' : 'Activé'), { k: 'toggle', on: !s.muted, act: 'mute', label: 'Son des alertes' }),
          row('Notifications SMS', 'Phase 2', T('Non disponible', { muted: true }))
        ];
        v.sum = () => 'Réglages de la démonstration';
        v.foot = 'Seul le son est modifiable dans ce prototype.';
      }
      const fi = v.filters ? Math.min(s.lf, v.filters.length - 1) : 0, q = norm(s.lq || '').trim();
      const text = it => norm(it.cells.map(c => (c.t || '') + ' ' + (c.sub || '') + ' ' + (c.p ? c.p[1] : '')).join(' '));
      let kept = v.items.filter(r => !v.filters || v.filters[fi][1](r.it));
      if (q) kept = kept.filter(r => text(r).includes(q));
      return { head: v.head, rows: kept, all: v.items, filters: v.filters, fi, summary: v.sum(kept.map(r => r.it)), foot: v.foot };
    }
    cell(c) {
      if (!c) return '';
      if (c.k === 'pill') return '<span class="pill ' + c.p[0] + '">' + esc(c.p[1]) + '</span>';
      if (c.k === 'idx') return '<span class="idx"><i style="background:' + c.c + '"></i>' + esc(c.v) + '</span>';
      if (c.k === 'btn') return '<button class="btn btn-sm btn-ghost" type="button" data-act="' + c.act + '" data-a="' + esc(c.a) + '">' + ic('printer', 'ic-sm') + esc(c.t) + '</button>';
      if (c.k === 'toggle') return '<button class="switch" type="button" role="switch" aria-checked="' + c.on + '" aria-label="' + esc(c.label) + '" data-act="' + c.act + '"></button>';
      const main = c.k === 'code' ? '<span class="code">' + esc(c.t) + '</span>' : c.strong ? '<b>' + esc(c.t) + '</b>' : c.muted ? '<span class="muted">' + esc(c.t) + '</span>' : esc(c.t);
      return main + (c.sub ? '<span class="sub">' + esc(c.sub) + '</span>' : '');
    }

    /* ---------------------------------------------------------------- actions */
    get A() {
      return this._A || (this._A = {
        go: a => { this.go(a); },
        morepop: () => this.set({ morePop: !this.state.morePop }),
        more: () => this.set({ moreOpen: !this.state.moreOpen, demoOpen: false }),
        demo: () => this.set({ demoOpen: !this.state.demoOpen, moreOpen: false, morePop: false }),
        closeall: () => this.set({ demoOpen: false, moreOpen: false }),
        search: () => this.set({ searchOpen: !this.state.searchOpen }),
        seq: () => this.runSequence(),
        reset: () => this.reset(false),
        mute: () => { const m = !this.state.muted; store.set('cirex-muted', m ? '1' : '0'); this.set({ muted: m }); },
        source: a => this.setSource(a),
        telegram: () => this.sendTelegram(null, true),
        calibrate: () => this.calibrate(),
        hidebanner: () => this.set({ banner: false }),
        series: a => { this.hov.live = null; this.set({ series: a }); },
        filter: a => this.set({ lf: +a }),
        layers: () => this.set({ layersOpen: !this.state.layersOpen }),
        layer: a => this.callMap('setLayer', a),
        base: a => this.callMap('setBase', a),
        year: a => this.callMap('setS2Year', +a),
        map: a => this.callMap(a),
        cmp: a => { if (this.cmpEl && this.cmpEl[a]) this.cmpEl[a](); },
        cmpmode: a => this.set({ cmpMode: a }),
        cmpindex: a => this.set({ cmpIndex: a }),
        closesite: () => this.callMap('select', null),
        mission: a => { if (a === 'ORP-0142' && this.state.mission) { this.go('missions'); return; } this.addMission(a); },
        addreport: () => this.addReport(),
        report: a => window.open('rapport.html?code=' + encodeURIComponent(a), '_blank', 'noopener'),
        mapsearch: a => this.goMap(() => this.callMap('search', a)),
        mapmission: a => this.goMap(() => { this.callMap('setLayer', 'missions', true); this.callMap('search', a); }),
        mapagent: a => { const t = TEAM[+a]; if (t && t.pos) this.goMap(() => { this.callMap('setLayer', 'agents', true); this.callMap('flyTo', t.pos[0], t.pos[1], 12); }); },
        openalert: a => { const it = this.ctx.list.find(x => x.id === a); if (!it) return; if (it.isNew || it.real) this.go('satellite'); else this.A.mapsearch(it.sensor.indexOf('SAT') === 0 ? 'ORP-0203' : it.sensor); },
        espmode: a => { this.espSet('mode', a); if (a === 'serveur') { this.espStop(true); this.loadDb('device'); } else if (this.esp.on) this.espConnect(); },
        esptoggle: () => { if (this.esp.cfg.mode === 'serveur') { this.loadDb('device'); this.toast('Station actualisée'); } else if (this.esp.on) this.espStop(); else this.espConnect(); },
        esphelp: () => { this.esp.help = !this.esp.help; this.set({ espTick: Date.now() }); },
        espfull: () => this.espFull(),
        espphoto: () => { if (this.esp.cfg.mode === 'serveur') this.devCmd('capture'); else this.espPhoto(); },
        espdl: a => { if (a) window.open(a, '_blank', 'noopener'); },
        espflash: () => { const e = this.esp; if (e.cfg.mode === 'serveur') { e.flash = !e.flash; this.devCmd('flash', e.flash ? 1 : 0); this.set({}); } else this.espCmd('flash', !e.flash); },
        esplamp: () => { const e = this.esp; if (e.cfg.mode === 'serveur') { e.lamp = !e.lamp; this.devCmd('lamp', e.lamp ? 1 : 0); this.set({}); } else this.espCmd('lamp', !e.lamp); },
        espstream: () => { const e = this.esp; this.espCmd('mode', e.mode === 'photo' ? 'stream' : 'photo'); },
        frame: a => this.set({ frameSel: a })
      });
    }
    get IN() {
      return this._IN || (this._IN = {
        lq: v => this.set({ lq: v }),
        gsearch: v => { if (v.trim()) { this.set({ searchOpen: false }); this.doSearch(v.trim()); } },
        mapq: v => { if (v.trim()) this.doSearch(v.trim()); },
        cmpop: v => this.set({ cmpOpacity: +v }),
        esphost: v => this.espSet('host', v),
        espstreamurl: v => this.espSet('stream', v),
        espws: v => this.espSet('ws', v)
      });
    }

    /* ---------------------------------------------------------------- régions */
    get R() {
      if (this._R) return this._R;
      const self = this;
      this._R = {
        clock() { const s = self.state; return '<span class="dot pulse ' + (s.server.ok ? '' : 'is-off') + '" title="' + esc(s.server.msg) + '"></span>' + esc(self.clockTxt()); },
        bellbadge() { const n = self.ctx.openAlerts; return n ? '<span class="badge">' + n + '</span>' : ''; },
        navcount() { const n = self.ctx.openAlerts; return n ? '<span class="count">' + n + '</span>' : ''; },
        searchmsg() { return esc(self.state.searchMsg || 'Exemples : ORP-0142, Kokumbo, PH-CI-004, 6.41;-5.14'); },
        tabs() {
          const s = self.state, n = self.ctx.openAlerts, inMore = !TABS.some(t => t[0] === s.view);
          return TABS.map(([k, l, i]) => { const cur = k === 'more' ? (inMore || s.moreOpen) : s.view === k; return '<button class="tab" type="button" ' + (k === 'more' ? 'data-act="more"' : 'data-act="go" data-a="' + k + '"') + (cur ? ' aria-current="page"' : '') + '>' + ic(i) + l + (k === 'alertes' && n ? '<span class="badge">' + n + '</span>' : '') + '</button>'; }).join('');
        },
        banner() {
          const s = self.state, c = self.ctx; if (!(s.banner && c.alert)) return '<div></div>';
          return '<div><div class="banner-in"><span class="ic-ring">' + ic('alert-triangle') + '</span><div class="banner-txt"><b>Alerte ' + esc(s.alertCode || '') + ' · Kokumbo</b><span>PH-CI-003 · indice ' + c.idx + ' · turbidité ' + fr(c.d.turb, 0) + ' NTU (réf. 5)' + (s.demoSource === 'rejeu' ? ' · simulation' : '') + (s.alertAt ? ' · ' + hhmmss(s.alertAt) + ' GMT' : '') + '</span></div>' +
            '<button class="btn btn-light" type="button" data-act="go" data-a="satellite">' + ic('satellite') + 'Voir l’analyse</button><button class="cbtn" type="button" data-act="hidebanner" aria-label="Masquer la bannière">' + ic('x') + '</button></div></div>';
        },
        toasts() { return self.state.toasts.map(t => '<div class="toast" role="status">' + esc(t.msg) + '</div>').join(''); },
        sub(v) {
          const s = self.state, c = self.ctx;
          if (v === 'apercu') return '<span>' + esc(self.clockTxt()) + '</span><span>Kokumbo · capteur PH-CI-003</span>';
          if (v === 'satellite') { const S = c.SS; return S ? '<span>ORP-0142 · Kokumbo</span><span class="num">' + fr(Math.abs(S.aoi.lat), 4) + '° N · ' + fr(Math.abs(S.aoi.lon), 4) + '° O</span><span>rayon ' + fr(S.aoi.rayon_m / 1000, 0) + ' km' + (s.alertCode ? ' · alerte ' + esc(s.alertCode) : '') + '</span>' : '<span>' + (s.satErr ? 'Données satellite absentes (' + esc((CX() && CX().config.dataset) || 'data/…') + ')' : 'Chargement des données Sentinel-2…') + '</span>'; }
          if (v === 'esp') { const m = self.espModel(); return '<span>PH-CI-003 · ' + esc(m.srv ? 'via le serveur' : self.esp.cfg.mode === 'sim' ? 'simulation' : self.esp.cfg.mode === 'ws' ? self.esp.cfg.ws : self.espBase().replace(/^https?:\/\//, '')) + '</span>' + (m.gsm ? '<span>' + esc(m.gsm) + '</span>' : ''); }
          const L = self.listModel(v); return '<span>' + esc(L.summary) + '</span>';
        },
        act(v) {
          const s = self.state, c = self.ctx;
          if (v === 'apercu') return '<span class="chip ' + c.badgeCls + '" title="' + esc(s.demoSource === 'rejeu' ? 'Valeurs simulées par la page : aucun capteur n’est lu.' : 'Source : ' + s.demoSource) + '">' + (c.real ? '<span class="dot pulse"></span>' : ic(s.demoSource === 'rejeu' ? 'player-play' : 'clock', 'ic-sm')) + esc(c.badge) + '</span><button class="btn btn-gold" type="button" data-act="seq">' + ic('player-play') + 'Lancer la démo</button>';
          if (v === 'satellite') { const d = s.sat, ok = d && !d.synthetic; return '<span class="chip ' + (ok ? 'real' : d ? 'sim' : 'wait') + '" title="' + esc(d ? d.summary.methode : '') + '">' + (ok ? ic('satellite', 'ic-sm') : ic('info-circle', 'ic-sm')) + esc(!d ? (s.satErr ? 'Données absentes' : 'Chargement…') : d.sourceLabel) + '</span><span class="pill crit">Illégal présumé · cadastre fictif</span>'; }
          if (v === 'esp') { const m = self.espModel(); return '<span class="pill ' + m.link[0] + '">' + esc(m.link[1]) + '</span>'; }
          return '';
        },
        tiles() {
          const s = self.state, c = self.ctx, S = c.SS;
          const st = { normal: ['', 'Normal'], vigilance: ['warn', 'Vigilance'], alerte: ['crit', 'Alerte'] }[c.zone];
          const misOpen = self.allMissions().filter(m => m.status !== 'cloturee').length, misReal = s.dbMissions.filter(m => m.status !== 'cloturee').length;
          const realOpen = s.dbAlerts.filter(a => a.status !== 'cloturee' && a.status !== 'fausse').length;
          const tile = (cls, label, val, unit, foot, pill, to, aria) => '<div class="cw notched tile ' + cls + '"><div class="card"><span class="tile-l">' + label + '</span><span class="tile-v num">' + val + (unit ? '<small>' + unit + '</small>' : '') + '</span><span class="tile-f"><span>' + foot + '</span>' + (pill || '') + '</span></div><button class="notch" type="button" data-act="go" data-a="' + to + '" aria-label="' + aria + '">' + ic('arrow-up-right') + '</button></div>';
          return tile(c.zone === 'alerte' && !c.noLive ? 'alarm' : 'gold', 'Indice de suspicion', c.noLive ? '–' : c.idx, '/100', 'PH-CI-003 · seuil 60', c.noLive ? '<span class="pill mute">En attente</span>' : '<span class="pill ' + st[0] + '">' + st[1] + '</span>', 'capteurs', 'Voir les capteurs') +
            tile('', 'Alertes ouvertes', c.openAlerts, '', 'dont ' + realOpen + ' réelle' + (realOpen > 1 ? 's' : ''), c.alert ? '<span class="pill crit">Nouvelle</span>' : '', 'alertes', 'Voir les alertes') +
            tile('', 'Sol mis à nu · Kokumbo', S ? fr(S.surface_totale_ha, 1) : '–', 'ha', S ? S.n_zones + ' zones' + (c.sat.synthetic ? ' · test' : '') : 'calcul indisponible', S ? '<span class="pill crit">' + sgn(-S.signal_moyen, 2) + ' NDVI</span>' : '', 'satellite', 'Ouvrir l’analyse satellite') +
            tile('', 'Missions en cours', misOpen, '', misReal ? misReal + ' sur le serveur' : 'exemples fictifs', '', 'missions', 'Voir les missions');
        },
        alertcard() {
          const c = self.ctx, rows = c.list.slice(0, 6);
          return '<div class="card-h"><h2 class="card-t">Alertes<small>' + c.openAlerts + ' ouvertes · réelles et fictives</small></h2></div><div class="rows">' + rows.map(a => {
            const sat = a.sensor.indexOf('SAT') === 0, sp = a.status === 'analyse' ? ['info', 'Analyse'] : a.status === 'fausse' ? ['mute', 'Fausse'] : (STA[a.status] || STA.nouvelle), closed = a.status === 'cloturee' || a.status === 'fausse';
            return '<button class="row' + (a.isNew ? ' is-new' : '') + '" type="button" data-act="openalert" data-a="' + esc(a.id) + '"><span class="row-ic ' + (a.isNew ? 'crit' : closed ? 'mute' : sat ? 'info' : '') + '">' + ic(sat ? 'satellite' : 'droplet') + '</span><span class="row-t"><b>' + esc(a.id) + '</b><span>' + esc(a.sensor + ' · ' + a.loc) + ' · ' + esc(self.rel(a.t)) + '</span></span>' + self.pill(sp) + '</button>';
          }).join('') + '</div>';
        },
        nextcard() {
          const s = self.state, c = self.ctx, S = c.SS, CI = CX();
          const satLine = S ? S.n_zones + ' zones Sentinel-2 : ' + CI.fr(S.surface_totale_ha, 1) + ' ha passés de végétation à sol nu (' + CI.periodFr(S.avant.periode) + ' / ' + CI.periodFr(S.apres.periode) + ').' : 'Calcul Sentinel-2 indisponible.';
          const items = c.alert ? ['Turbidité ' + fr(c.d.turb, 0) + ' NTU à PH-CI-003 (' + c.src + '), ' + Math.max(1, Math.round(c.d.turb / 5)) + ' fois la référence de 5 NTU.', satLine, 'Envoyer un agent : photo géolocalisée des zones 1 à 3 et prélèvement d’eau en aval pour analyse mercure en laboratoire.']
            : [satLine, S && S.premiere_detection ? 'Première baisse confirmée du NDVI : ' + CI.monthLong(S.premiere_detection) + '.' : 'Date de première baisse non confirmée.', 'Indice de PH-CI-003 : ' + (c.noLive ? 'en attente' : c.idx + ' / 100') + ' (' + c.src + '), seuil d’alerte 60.'];
          return '<div class="card-h"><h2 class="card-t">' + (c.alert ? 'Que faire maintenant' : 'À surveiller') + '<small>ORP-0142 · Kokumbo</small></h2>' + (c.alert ? '<span class="pill crit">Alerte</span>' : '<span class="pill ondark">Calme</span>') + '</div><ol class="steps">' + items.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' +
            (c.alert ? '<button class="btn btn-gold btn-block" type="button" data-act="mission" data-a="ORP-0142" style="margin-top:18px">' + ic('route') + (s.mission ? 'Mission ' + esc(s.mission) : 'Créer la mission terrain') + '</button>' : '');
        },
        livecard() {
          const s = self.state, c = self.ctx, d = c.d;
          const sev = f => (f < 0.15 ? ['ok', 'Normal'] : f < 0.45 ? ['warn', 'Élevé'] : ['crit', 'Critique']);
          const ft = 1 - Math.exp(-Math.max(0, d.turb - 5) / 220), fc = 1 - Math.exp(-Math.max(0, d.tds - 120) / 500), fp = Math.min(1, Math.abs(d.ph - 7.1) / 2.6), fT = Math.min(1, Math.abs(d.temp - 27.8) / 1.5);
          const mk = (key, label, unit, val, ref, f) => { const p = c.noLive || (OPTIC && key !== 'turb') ? ['mute', OPTIC && key !== 'turb' ? 'Non mesuré' : 'En attente'] : sev(f); const v = c.noLive || (OPTIC && key !== 'turb') ? '–' : val; return '<button class="meas-c' + (s.series === key ? ' is-on' : '') + '" type="button" data-act="series" data-a="' + key + '" aria-pressed="' + (s.series === key) + '"><span>' + label + '</span><b class="num">' + v + (unit && v !== '–' ? '<small>' + unit + '</small>' : '') + '</b><span class="pill ' + p[0] + '">' + p[1] + ' · réf. ' + ref + '</span></button>'; };
          const seg = '<div class="seg" role="group" aria-label="Série affichée">' + SERIES.map(([k, l]) => '<button type="button" data-act="series" data-a="' + k + '" aria-pressed="' + (s.series === k) + '">' + l + '</button>').join('') + '</div>';
          const g = { normal: ['ok', 'Normal'], vigilance: ['warn', 'Vigilance'], alerte: ['crit', 'Alerte'] }[c.zone], win = s.hist.idx, mean = Math.round(win.reduce((a, b) => a + b, 0) / win.length);
          return '<div class="card-h"><h2 class="card-t">Capteur PH-CI-003 · Kokumbo<small>' + esc(c.badge) + ' · 1 mesure toutes les 2 s · fenêtre de 10 min</small></h2>' + seg + '</div>' +
            '<div class="live-grid"><div><div class="big" style="margin-bottom:6px"><b class="num">' + (c.noLive ? '–' : c.idx) + '</b><span>' + (OPTIC ? 'indice · turbidité seule' : 'indice de suspicion sur 100') + '</span>' + (c.noLive ? '<span class="pill mute">En attente</span>' : '<span class="pill ' + g[0] + '">' + g[1] + '</span>') + '</div>' +
            '<p style="font-size:13.5px;color:var(--ink-3);margin-bottom:10px">' + (c.noLive ? 'Aucune mesure reçue pour le moment.' : 'Minimum ' + Math.min(...win) + ' · moyenne ' + mean + ' · maximum ' + Math.max(c.idx, ...win) + ' sur la fenêtre') + '</p>' +
            self.liveChart(s.series) + '</div>' +
            '<div class="meas">' + mk('turb', 'Turbidité', 'NTU', fr(d.turb, 0), '5', ft) + mk('ph', 'pH', '', fr(d.ph, 1), '7,1', fp) + mk('tds', 'Conductivité', 'ppm', fr(d.tds, 0), '120', fc) + mk('temp', 'Température', '°C', fr(d.temp, 1), '27,8', fT) + '</div></div>';
        },
        satcard() {
          const s = self.state, c = self.ctx, S = c.SS, CI = CX();
          if (!S) return '<div class="card-h"><h2 class="card-t">Analyse Sentinel-2</h2></div><div class="empty"><b>' + (s.satErr ? 'Données satellite absentes' : 'Chargement…') + '</b>' + (s.satErr ? 'Lancez pipeline/ndvi_pipeline.py pour produire web/data/kokumbo.' : '') + '</div>';
          return '<div class="card-h"><h2 class="card-t">Analyse Sentinel-2 · Kokumbo<small>' + esc(c.sat.sourceLabel) + ' · ' + esc(CI.periodFr(S.avant.periode)) + ' / ' + esc(CI.periodFr(S.apres.periode)) + '</small></h2></div>' +
            '<div class="hero-n"><b class="num">' + CI.fr(S.surface_totale_ha, 1) + '</b><span>ha de sol mis à nu</span></div>' +
            '<p style="font-size:14px;color:var(--ink-2);margin:6px 0 16px">≈ ' + CI.fr(S.terrains_de_football, 0) + ' terrains de football · ' + S.n_zones + ' zones · baisse moyenne du NDVI ' + CI.fr(S.signal_moyen, 2) + '</p>' +
            self.ndviChart('ndvi-dash', 210) +
            '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn" type="button" data-act="go" data-a="satellite">' + ic('layers-subtract') + 'Comparer avant / après</button></div>' +
            '<p class="foot">Baisse NDVI = intensité du changement, pas une probabilité. Un défrichement agricole donne le même signal : la vérification terrain reste obligatoire.</p>';
        },
        miscard() {
          const rows = self.allMissions().filter(m => m.status !== 'cloturee').slice(0, 5);
          return '<div class="card-h"><h2 class="card-t">Missions en cours<small>Serveur et exemples fictifs</small></h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mission</th><th>Objet</th><th>Agent</th><th>Statut</th><th>Ouverte</th></tr></thead><tbody>' +
            (rows.length ? rows.map(m => '<tr tabindex="0" data-act="mapmission" data-a="' + esc(m.target) + '"><td><span class="code">' + esc(m.id) + '</span><span class="sub">' + esc(m.type + (m.fictif ? ' · fictif' : '')) + '</span></td><td data-l="Objet"><span class="cv"><span class="code">' + esc(m.target) + '</span><span class="sub">' + esc(m.loc) + '</span></span></td><td data-l="Agent">' + esc(m.agent) + '</td><td class="c-pill">' + self.pill(MIS_P[m.status] || MIS_P.aassigner) + '</td><td data-l="Ouverte">' + esc(m.opened) + '</td></tr>').join('') : '<tr><td colspan="5"><div class="empty"><b>Aucune mission en cours</b></div></td></tr>') + '</tbody></table></div>';
        },
        teamcard() {
          return '<div class="card-h"><h2 class="card-t">Équipe sur le terrain<small>Équipe fictive de démonstration</small></h2></div><div class="rows">' + TEAM.map((t, i) => {
            const ini = t.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
            return '<' + (t.pos ? 'button type="button" data-act="mapagent" data-a="' + i + '"' : 'div') + ' class="row"><span class="ini' + (i === 0 ? ' on' : '') + '">' + esc(ini) + '</span><span class="row-t"><b>' + esc(t.name) + '</b><span>' + esc(t.role + ' · ' + t.zone) + '</span></span>' + self.pill(TEAM_P[t.status]) + '</' + (t.pos ? 'button' : 'div') + '>';
          }).join('') + '</div>';
        },
        mapover(where) {
          const s = self.state, c = self.ctx, S = c.SS, CI = CX();
          const seqMsgs = { vol: 'Vol vers PH-CI-003 · Kokumbo', cercle: 'Rayon d’analyse 5 km · images Sentinel-2', zones: S ? S.n_zones + ' zones de changement · ' + CI.fr(S.surface_totale_ha, 1) + ' ha' : 'Zones Sentinel-2 indisponibles' };
          const seq = seqMsgs[s.seqStep] || '';
          const s2fam = s.base === 's2' || s.base === 'ndvi' || s.base === 'turb';
          const hint = s.base === 'esri' && s.zoom >= 15 ? 'Détail Esri non daté · la détection utilise Sentinel-2' : s2fam && s.zoom > 14.3 ? 'Au-delà de 10 m, l’image Sentinel-2 est agrandie' : '';
          const SRC = { esri: 'Esri World Imagery · mosaïque haute résolution · date variable', s2: 'Sentinel-2 cloudless ' + s.s2year + ' · EOX · 10 m', ndvi: 'Végétation (approx. NDVI) · Sentinel-2 cloudless ' + s.s2year, turb: 'Turbidité (approx.) · Sentinel-2 cloudless ' + s.s2year, plan: 'Esri World Street Map' };
          let h = '';
          if (where === 'dash') h += '<span class="map-tag glass">' + ic('map-2', 'ic-sm') + 'Carte satellite</span>';
          if (seq) h += '<span class="map-msg glass" role="status"><span class="dot pulse"></span>' + esc(seq) + '</span>';
          else if (hint && where === 'carte') h += '<span class="map-hint glass">' + esc(hint) + '</span>';
          if (where === 'carte') h += '<span class="map-src glass">' + esc(SRC[s.base] || SRC.esri) + '</span>';
          h += self.siteCard(where);
          return h;
        },
        mapctl() {
          const s = self.state;
          const B = (fn, icn, label, on, cls) => '<button type="button" class="' + (cls || '') + '" data-act="map" data-a="' + fn + '" aria-label="' + label + '" title="' + label + '"' + (on != null ? ' aria-pressed="' + !!on + '"' : '') + '>' + ic(icn) + '</button>';
          return '<div class="map-ctl glass">' + B('zoomIn', 'plus', 'Zoom avant') + B('zoomOut', 'minus', 'Zoom arrière') + '<hr>' + B('recenter', 'current-location', 'Recentrer sur la Côte d’Ivoire') + B('toggleTilt', 'rotate-3d', s.tilted ? 'Vue 2D' : 'Vue inclinée', s.tilted, 'opt-x') + B('toggleMeasure', 'ruler-measure', s.measuring ? 'Arrêter la mesure' : 'Mesurer une distance', s.measuring, 'opt-x') + B('fullscreen', 'maximize', 'Plein écran', null, 'opt-x') + '</div>';
        },
        layers() {
          const s = self.state; if (!s.layersOpen) return '';
          const c = self.ctx;
          const item = (k, label, count, sw, dis) => { const on = !!s.on[k]; return '<div class="lg-row' + (dis ? ' is-dis' : '') + '"><span class="sw" style="' + sw + '"></span><span>' + esc(label) + '</span><span class="n">' + esc(count) + '</span><button class="switch" type="button" role="switch" aria-checked="' + (on && !dis) + '" aria-label="' + esc(label) + '"' + (dis ? ' disabled' : ' data-act="layer" data-a="' + k + '"') + '></button></div>'; };
          const groups = [
            ['Surveillance', [['sensors', 'Capteurs', '6', 'background:#3BB3D9;border-radius:50%'], ['alerts', 'Alertes ouvertes', String(c.openAlerts), 'background:#E0442F;border-radius:50%'], ['zones', 'Zones de changement Sentinel-2', c.SS ? String(c.SS.n_zones) : '', 'background:rgba(217,70,168,.35);border:2px solid #D946A8']]],
            ['Sites d’orpaillage (fictifs sauf ORP-0142)', [['legal', 'Légaux · permis valides', '49', 'background:rgba(30,154,90,.35);border:2px solid #1E9A5A'], ['noncompliant', 'Non conformes', '12', 'background:rgba(226,115,44,.3);border:2px solid #E2732C'], ['suspect', 'Suspects à vérifier', '34', 'border:2px dashed #D99A00'], ['illegal', 'Illégaux', '131', 'background:rgba(224,68,47,.35);border:2px solid #E0442F'], ['dismantled', 'Démantelés', '21', 'background:rgba(107,127,153,.3);border:1px solid #6B7F99']]],
            ['Cadastre minier (fictif)', [['pe', 'Permis d’exploitation industrielle', '1', 'border:2px dashed #C9A227'], ['aesi', 'Autorisations semi-industrielles', '1', 'border:2px dashed #66676E'], ['aea', 'Autorisations artisanales', '2', 'border:2px dashed #66676E'], ['pr', 'Permis de recherche', '2', 'border:2px dotted #66676E']]],
            ['Environnement', [['rivers', 'Cours d’eau (Esri Hydro)', '', 'background:#3BB3D9'], ['captage', 'Captages d’eau potable', '3', 'background:#1D7FA0'], ['protected', 'Aires protégées et forêts classées', '3', 'background:#2F7A57'], ['firms', 'Feux actifs · fictifs', '23', 'background:#FF7A1A;border-radius:50%']]],
            ['Terrain', [['missions', 'Missions en cours', '4', 'background:#33413B'], ['agents', 'Positions des agents', '4', 'background:#2B5FA8;border-radius:50%']]],
            ['Repères', [['places', 'Limites et localités (Esri)', '', 'border:1.5px solid #66676E'], ['heat', 'Carte de chaleur des sites', '247', 'background:linear-gradient(90deg,#E8B931,#E0442F)']]]
          ];
          const B = [['esri', 'Esri · haute résolution'], ['s2', 'Sentinel-2 · couleurs naturelles'], ['ndvi', 'Sentinel-2 · végétation (approx. NDVI)'], ['turb', 'Sentinel-2 · turbidité (approx.)'], ['plan', 'Plan · routes et localités'], ['vhr', 'Très haute résolution · phase 2']];
          const s2fam = s.base === 's2' || s.base === 'ndvi' || s.base === 'turb';
          return '<div class="layers glass-light" role="dialog" aria-label="Couches de la carte"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:18px;letter-spacing:-.02em">Couches</b><button class="cbtn" type="button" data-act="layers" aria-label="Fermer les couches" style="width:36px;height:36px">' + ic('x', 'ic-sm') + '</button></div>' +
            '<p class="lg-h">Fond de carte</p>' + B.map(([k, l]) => '<button class="base-opt" type="button" role="radio" aria-checked="' + (s.base === k) + '"' + (k === 'vhr' ? ' disabled' : ' data-act="base" data-a="' + k + '"') + '><span class="radio"></span>' + esc(l) + '</button>').join('') +
            (s2fam ? '<p class="lg-h">Année Sentinel-2</p><div class="years">' + [2019, 2020, 2021, 2022, 2023, 2024, 2025].map(y => '<button type="button" data-act="year" data-a="' + y + '" aria-pressed="' + (s.s2year === y) + '">' + y + '</button>').join('') + '</div>' : '') +
            groups.map(([t, items]) => '<p class="lg-h">' + esc(t) + '</p>' + items.map(it => item(it[0], it[1], it[2], it[3])).join('')).join('') +
            item('citizen', 'Signalements citoyens · phase 2', '', 'background:var(--line-2)', true) + '</div>';
        },
        cmpover() {
          const s = self.state;
          const leg = s.cmpMode === 'changements' ? CMP_LEG.changements : s.cmpIndex !== 'naturel' ? CMP_LEG.vegetation : null;
          return (leg ? '<div class="cmp-legend glass" role="note"><b>' + esc(leg.title) + '</b><div class="grad" style="background:' + leg.grad + '"></div><div class="lohi"><span>' + esc(leg.lo) + '</span><span>' + esc(leg.hi) + '</span></div><p style="margin-top:6px;color:rgba(255,255,255,.85)">' + esc(leg.note) + '</p></div>' : '') +
            '<div class="cmp-bottom">' + (s.cmpMode === 'fondu' ? '<label class="glass" style="display:flex;align-items:center;gap:12px;height:44px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:700">Avant<input type="range" min="0" max="100" value="' + s.cmpOpacity + '" data-in="cmpop" aria-label="Opacité de l’image après" style="width:160px;accent-color:#F6CE3E">Après</label>' : '') +
            '<div class="seg ondark glass" role="group" aria-label="Mode de comparaison">' + CMP_MODES.map(([k, l]) => '<button type="button" data-act="cmpmode" data-a="' + k + '" aria-pressed="' + (s.cmpMode === k) + '">' + l + '</button>').join('') + '</div>' +
            '<div class="seg ondark glass" role="group" aria-label="Image affichée">' + [['naturel', 'Couleurs naturelles'], ['vegetation', 'NDVI (B8, B4)']].map(([k, l]) => '<button type="button" data-act="cmpindex" data-a="' + k + '" aria-pressed="' + (s.cmpIndex === k) + '">' + l + '</button>').join('') + '</div></div>';
        },
        cmpside() {
          const s = self.state, d = s.sat, CI = CX();
          if (!d) return '<div class="empty"><b>' + (s.satErr ? 'Données satellite absentes' : 'Chargement des données Sentinel-2…') + '</b>' + (s.satErr ? 'Lancez pipeline/ndvi_pipeline.py pour produire le dossier ' + esc((CI && CI.config.dataset) || 'data/…') + '.' : '') + '</div>';
          const S = d.summary, zones = d.zones, SHOWN = 5, rest = zones.slice(SHOWN), restHa = rest.reduce((t, z) => t + z.ha, 0);
          return '<div><p style="font-size:14px;font-weight:600;color:var(--ink-3)">Surface totale de changement</p><div class="hero-n" style="margin-top:4px"><b class="num">' + CI.fr(S.surface_totale_ha, 1) + '</b><span>ha</span></div><p style="font-size:14.5px;color:var(--ink-2);margin-top:6px">≈ ' + CI.fr(S.terrains_de_football, 0) + ' terrains de football · ' + S.n_zones + ' zones · baisse moyenne du NDVI ' + CI.fr(S.signal_moyen, 2) + '</p></div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' + zones.slice(0, SHOWN).map(z => '<div class="zone" tabindex="0" data-zone="' + z.n + '"><span class="n">' + z.n + '</span><b>' + esc(z.type) + '</b><span class="ha num">' + CI.fr(z.ha, 1) + '<small>ha</small></span><span class="sub">Baisse NDVI ' + CI.fr(z.signal, 2) + ' · ' + esc(z.first ? 'depuis ' + CI.monthFr(z.first) : 'date non confirmée') + '</span></div>').join('') +
              (rest.length ? '<p style="font-size:13px;color:var(--ink-3);padding:2px 4px">+ ' + rest.length + ' autres zones · ' + CI.fr(restHa, 1) + ' ha (survol sur la carte)</p>' : '') + '</div>' +
            '<div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px"><b style="font-size:17px;letter-spacing:-.02em">NDVI moyen</b><span style="font-size:13px;color:var(--ink-3)">' + d.series.points.length + ' dates sans nuages' + (d.synthetic ? ' · test' : '') + '</span></div>' + self.ndviChart('ndvi-cmp', 200) + '</div>' +
            '<dl class="facts"><dt>Avant</dt><dd>' + esc(CI.periodFr(S.avant.periode)) + ' · médiane de ' + S.avant.dates.length + ' images (' + S.avant.rejetees.length + ' écartées pour nuages)</dd><dt>Après</dt><dd>' + esc(CI.periodFr(S.apres.periode)) + ' · médiane de ' + S.apres.dates.length + ' images · dernière : ' + esc(CI.dateFr(d.lastImage)) + '</dd><dt>Méthode</dt><dd>' + esc(S.methode) + '</dd></dl>' +
            '<div class="cmp-actions"><button class="btn btn-gold" type="button" data-act="mission" data-a="ORP-0142">' + ic('route') + (s.mission ? 'Mission ' + esc(s.mission) : 'Créer une mission') + '</button><button class="btn" type="button" data-act="addreport"' + (s.busy ? ' aria-disabled="true"' : '') + '>' + ic(s.report ? 'check' : 'file-text') + (s.busy ? 'Enregistrement…' : s.report ? 'Rapport ' + esc(s.report) : 'Ajouter au rapport') + '</button></div>' +
            '<p class="foot" style="margin-top:0">' + esc(d.synthetic ? 'Données synthétiques de test : aucun chiffre de cet écran ne décrit un lieu réel.' : 'Copernicus Sentinel-2 L2A (ESA), lu sur AWS Open Data. Calcul du ' + CI.dateFr(S.genere_le) + '. Baisse NDVI = intensité du changement, pas une probabilité.') + '</p>';
        },
        filters() {
          const s = self.state, L = self.listModel(s.view); if (!L.filters) return '';
          return '<div class="seg light" role="group" aria-label="Filtrer">' + L.filters.map((f, i) => '<button type="button" data-act="filter" data-a="' + i + '" aria-pressed="' + (i === L.fi) + '">' + esc(f[0]) + ' <span class="n">' + L.all.filter(r => f[1](r.it)).length + '</span></button>').join('') + '</div>';
        },
        list() {
          const s = self.state, L = self.listModel(s.view);
          const body = L.rows.length ? L.rows.map(r => '<tr' + (r.act ? ' tabindex="0" data-act="' + r.act[0] + '" data-a="' + esc(r.act[1]) + '"' : '') + (r.hot ? ' class="is-hot"' : '') + '>' + r.cells.map((c, i) => '<td' + (i === 0 ? '' : c && c.k === 'pill' ? ' class="c-pill"' : ' data-l="' + esc(L.head[i]) + '"') + '><span class="cv">' + self.cell(c) + '</span></td>').join('') + '</tr>').join('')
            : '<tr><td colspan="' + L.head.length + '"><div class="empty"><b>Aucun résultat</b>Aucune ligne ne correspond au filtre.</div></td></tr>';
          return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + L.head.map(h => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>' + (L.foot ? '<p class="foot">' + esc(L.foot) + '</p>' : '');
        },
        espimg() {
          const m = self.espModel();
          if (m.src) return '<img src="' + esc(m.src) + '" alt="Image transmise par l’ESP32-CAM"' + (m.stream ? ' data-esp-stream' : '') + '>';
          return '<div class="cam-empty"><div><b>' + esc(m.empty[0]) + '</b>' + esc(m.empty[1]) + '</div></div>';
        },
        espbadge() { const m = self.espModel(); return '<span class="cam-badge glass"><span class="dot ' + (m.link[0] === 'ok' ? 'pulse' : m.link[0] === 'crit' ? 'is-off' : 'is-wait') + '"></span>' + esc(m.badge) + '</span>'; },
        espctl() {
          const m = self.espModel(), e = self.esp, dis = !m.ok;
          const B = (act, icn, label, pressed, off, a) => '<button class="btn btn-sm ' + (pressed ? 'btn-gold' : 'btn-ghost') + '" type="button" data-act="' + act + '"' + (a ? ' data-a="' + esc(a) + '"' : '') + (dis || off ? ' disabled' : '') + (pressed != null ? ' aria-pressed="' + !!pressed + '"' : '') + '>' + ic(icn, 'ic-sm') + esc(label) + '</button>';
          return '<div class="cam-ctl">' + B('espfull', 'maximize', 'Plein écran', null, !m.src) + B('espphoto', 'camera', m.srv ? 'Prendre une photo' : 'Photo') + (m.srv ? B('espdl', 'download', 'Télécharger', null, !m.src, m.src) : '') + B('espflash', 'bolt', 'Flash photo', e.flash) + B('esplamp', 'bulb', 'Lampe', e.lamp) + (m.srv ? '' : B('espstream', 'video', m.photoMode ? 'Photo à la demande' : 'Flux continu')) + '</div>';
        },
        espthumbs() { const m = self.espModel(); if (m.thumbs.length < 2) return ''; return '<div class="thumbs">' + m.thumbs.map(t => '<button type="button" data-act="frame" data-a="' + esc(t.id) + '" aria-pressed="' + !!t.on + '" aria-label="' + esc(t.label) + '"><img src="' + esc(t.src) + '" alt="" loading="lazy"></button>').join('') + '</div>'; },
        espconf() {
          const m = self.espModel(), e = self.esp, cfg = e.cfg;
          let f = '';
          if (cfg.mode === 'http') f = '<label>Adresse de l’ESP32<input type="text" value="' + esc(cfg.host) + '" data-ch="esphost" placeholder="192.168.4.1" spellcheck="false"></label><label>Flux vidéo <small>(facultatif)</small><input type="text" value="' + esc(cfg.stream) + '" data-ch="espstreamurl" placeholder="' + esc(self.espStream() || 'http://192.168.4.1:81/stream') + '" spellcheck="false"></label>';
          if (cfg.mode === 'ws') f = '<label>Adresse WebSocket<input type="text" value="' + esc(cfg.ws) + '" data-ch="espws" placeholder="ws://192.168.4.1:81/ws" spellcheck="false"></label>';
          if (cfg.mode === 'sim') f = '<p class="note">Simulation : état et SMS générés par la page, aucune caméra.</p>';
          if (cfg.mode === 'serveur') f = '<p class="note">Le boîtier ou le relais envoie état, SMS et photos à la fonction device-event. Cette page les lit en temps réel.</p>';
          return '<div class="card-h"><h2 class="card-t">Connexion</h2><button class="btn btn-sm btn-ghost" type="button" data-act="esphelp" aria-expanded="' + !!e.help + '">' + ic('info-circle', 'ic-sm') + 'Format attendu</button></div>' +
            '<div class="form"><div class="seg light" role="group" aria-label="Mode de liaison">' + ESP_MODES.map(([k, l]) => '<button type="button" data-act="espmode" data-a="' + k + '" aria-pressed="' + (cfg.mode === k) + '">' + l + '</button>').join('') + '</div>' + f +
            (m.warn ? '<p class="note warn">' + esc(m.warn) + '</p>' : '') + (m.err ? '<p class="note crit">' + esc(m.err) + '</p>' : '') +
            '<button class="btn ' + (cfg.mode !== 'serveur' && e.on ? 'btn-ghost' : '') + '" type="button" data-act="esptoggle">' + ic(cfg.mode === 'serveur' ? 'refresh' : e.on ? 'x' : 'wifi', 'ic-sm') + (cfg.mode === 'serveur' ? 'Actualiser' : e.on ? 'Déconnecter' : 'Connecter') + '</button>' +
            (e.help ? '<pre class="code">' + esc(m.help) + '</pre>' : '') + '</div>';
        },
        esptiles() { const m = self.espModel(); return '<div class="card-h"><h2 class="card-t">État du boîtier</h2></div><div class="stiles">' + [{ k: 'Liaison', v: m.link[1] }].concat(m.tiles).map(t => '<div class="stile"><span>' + esc(t.k) + '</span><b>' + esc(t.v) + '</b></div>').join('') + '</div>'; },
        espsms() { const m = self.espModel(); return '<div class="card-h"><h2 class="card-t">Messages SIM<small>' + m.sms.length + ' reçus' + (m.gsm ? ' · ' + esc(m.gsm) : '') + '</small></h2></div>' + (m.sms.length ? '<div class="sms">' + m.sms.map(x => '<div class="sms-m' + (x.alert ? ' alert' : '') + '"><header><span>' + esc(x.from) + '</span><span>' + esc(x.time) + '</span></header>' + esc(x.text) + '</div>').join('') + '</div>' : '<div class="empty">' + esc(m.smsEmpty) + '</div>'); },
        demo() {
          const s = self.state, c = self.ctx;
          const opts = [['serveur', 'Boîtier · serveur', 'Mesures réelles reçues par Supabase'], ['reel', 'ESP32 · Wi-Fi local', 'Lecture directe du boîtier'], ['optique', 'Webcam', 'Turbidité estimée par la caméra'], ['rejeu', 'Simulation', 'Valeurs générées par la page']];
          const note = s.demoSource === 'serveur' ? (s.server.ok ? 'Mesures du boîtier PH-CI-003 reçues par le serveur et poussées en temps réel. L’alerte et Telegram sont créés côté serveur. Réinitialiser clôture l’alerte pour la démo suivante.' : s.server.msg + ' : passez en Simulation ou lancez le plan B (docs/DEMO.md).')
            : s.demoSource === 'rejeu' ? 'Simulation : valeurs générées par la page, badge « Simulation » affiché. Aucune alerte n’est enregistrée.'
            : s.demoSource === 'optique' ? 'Verre d’eau devant la caméra, rayures noires et blanches imprimées derrière. Étalonnez sur eau claire, puis versez la terre : l’eau trouble efface les rayures et la turbidité monte.'
            : (self.espMeasure() ? 'Mesures reçues en direct de l’ESP32.' : 'ESP32 non connecté ou sans turbidité · ouvrez Station ESP32 pour le connecter.');
          return '<div><p class="sect-t">Source des mesures</p><div class="opt-grid">' + opts.map(([k, l, sub]) => '<button class="opt" type="button" data-act="source" data-a="' + k + '" aria-pressed="' + (s.demoSource === k) + '">' + l + '<small>' + sub + '</small></button>').join('') + '</div><p class="note" style="margin-top:10px">' + esc(note) + '</p>' + (s.demoSource === 'optique' && s.camErr ? '<p class="note crit" style="margin-top:8px">' + esc(s.camErr) + '</p>' : '') + '</div>' +
            '<div class="stiles"><div class="stile"><span>Badge affiché</span><b>' + esc(c.badge) + '</b></div><div class="stile"><span>Serveur</span><b>' + esc(s.server.ok ? 'Connecté' : 'Hors ligne') + '</b></div></div>';
        },
        demo2() {
          const s = self.state;
          return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-gold" type="button" data-act="seq">' + ic('player-play') + 'Lancer</button><button class="btn btn-ghost" type="button" data-act="reset">' + ic('refresh') + 'Réinitialiser</button><button class="btn btn-ghost" type="button" data-act="telegram">' + ic('brand-telegram') + 'Tester Telegram</button><button class="btn btn-ghost" type="button" data-act="mute" aria-pressed="' + !s.muted + '">' + ic(s.muted ? 'volume-off' : 'volume') + (s.muted ? 'Son coupé' : 'Son activé') + '</button></div>' +
            '<div><p class="sect-t">Raccourcis clavier</p><div class="keys"><span class="kbd">D</span><span>Lancer la séquence de démonstration</span><span class="kbd">Maj D</span><span>Ouvrir ou fermer ce panneau</span><span class="kbd">R</span><span>Réinitialiser (panneau ouvert)</span><span class="kbd">Ctrl K</span><span>Rechercher sur la carte</span></div></div>';
        },
        optic() { const o = self.opt; return esc(!o ? 'Caméra en attente…' : !o.sd0 ? 'Contraste ' + fr(o.sd, 1) + ' · non étalonné' : 'Contraste ' + Math.round(100 * Math.min(1, o.sd / o.sd0)) + ' % · ' + fr(o.turb, 0) + ' NTU'); }
      };
      return this._R;
    }

    siteCard(where) {
      const s = this.state, c = this.ctx, info = s.selected && SITE_INFO[s.selected];
      if (!info) return '';
      const S = c.SS, CI = CX();
      const rows = info.real ? (S ? [['Sol mis à nu', CI.fr(S.surface_totale_ha, 1) + ' ha · ' + S.n_zones + ' zones'], ['Première baisse', S.premiere_detection ? CI.monthLong(S.premiere_detection) : 'non confirmée'], ['Dernière image', CI.dateFr(c.sat.lastImage)], ['Permis', 'Aucun · cadastre fictif']] : [['Données satellite', 'indisponibles']]) : info.rows;
      const d = c.d;
      const sens = info.live && !c.noLive ? [['Turbidité', fr(d.turb, 0) + ' NTU'], ['pH', fr(d.ph, 1)], ['Conductivité', fr(d.tds, 0) + ' ppm'], ['Indice', String(c.idx)]] : null;
      const compact = where === 'dash';
      return '<div class="site glass-light" id="cx-site" role="dialog" aria-label="' + esc(info.title) + '">' +
        '<div class="site-h"><div><h3>' + esc(info.title) + (info.real ? '' : ' <span style="font-weight:600;color:var(--ink-3);font-size:14px">(fictif)</span>') + '</h3><div style="margin-top:6px">' + this.pill(SITE_P[info.st]) + '</div></div><button class="cbtn" type="button" data-act="closesite" aria-label="Fermer la fiche" style="width:36px;height:36px">' + ic('x', 'ic-sm') + '</button></div>' +
        (compact ? '' : '<dl class="kv">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd' + (r[2] === 'up' ? ' class="up"' : '') + '>' + esc(r[1]) + '</dd>').join('') + '</dl>') +
        (info.real && S ? '<div class="signal"><span>Baisse NDVI</span><span class="bar"><i style="width:' + Math.round(S.signal_moyen * 100) + '%"></i></span><b style="color:var(--ink)">' + CI.fr(S.signal_moyen, 2) + '</b></div><p class="foot" style="margin-top:6px">' + esc(c.sat.sourceLabel) + ' · pas une probabilité</p>' : '') +
        (sens && !compact ? '<p class="lg-h" style="margin-top:14px">Capteur ' + esc(info.sensor) + '</p><div class="stiles">' + sens.map(x => '<div class="stile"><span>' + x[0] + '</span><b class="num">' + x[1] + '</b></div>').join('') + '</div>' : (!info.live && !compact ? '<p class="foot">Capteur le plus proche : ' + esc(info.sensor) + '</p>' : '')) +
        '<div class="actions"><button class="btn btn-sm" type="button" data-act="go" data-a="satellite"' + (s.selected !== 'ORP-0142' ? ' disabled title="Analyse disponible pour ORP-0142 seulement"' : '') + '>' + ic('layers-subtract', 'ic-sm') + 'Avant / après</button><button class="btn btn-sm btn-gold" type="button" data-act="mission" data-a="' + esc(s.selected) + '">' + ic('route', 'ic-sm') + (s.selected === 'ORP-0142' && s.mission ? esc(s.mission) : 'Mission') + '</button></div></div>';
    }
  }

  function start() { if (!document.getElementById('cx')) return; window.CIREX_APP = new App(document.getElementById('cx')); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
