/**
 * PARACEL · SONDEO SEMÁFORO
 * Backend Google Apps Script
 * - Auth: password in usuarios.hash_password as plain OR SHA-256 hex
 * - Permissions: dashboard if rol in {editor, admin} OR permiso_tablero is TRUE
 * - API via doPost JSON for GitHub Pages / mobile PWA
 *
 * Spreadsheet:
 *   usuarios: usuario | hash_password | nombre | rol | activo | tipo_informante_default | observacion | (opcional) permiso_tablero
 *   respuestas: ts | usuario | nombre | rol | tipo_informante | zona_depto | zona_distrito | zona_comunidad | tipo_lugar | id_encuesta | P05 | P06 | P07 | P08 | P08_otro | P09 | P10 | P11 | tema_origen | P14 | P14_otro | P18 | P19 | comentario | semaforo_color | semaforo_score | semaforo_confiabilidad | gps_lat | gps_lng
 */

const CFG = {
  SPREADSHEET_ID: '1viXJfHTebeCyStJkAkA4uRdNXa4FgHgsomcmhlxNB0k',
  SHEET_USERS: 'usuarios',
  SHEET_QUESTIONS: 'preguntas',
  SHEET_RESPONSES: 'respuestas',
  SHEET_PARAMS: 'parametros',
  SESSION_TTL_MIN: 240,
  DASHBOARD_ROLES: ['editor', 'admin'],
  RESP_HEADERS: [
    'ts','usuario','nombre','rol','tipo_informante',
    'zona_depto','zona_distrito','zona_comunidad','tipo_lugar',
    'id_encuesta',
    'P05','P06','P07','P08','P08_otro','P09','P10',
    'P11','tema_origen','P14','P14_otro',
    'P18','P19','comentario',
    'semaforo_color','semaforo_score','semaforo_confiabilidad',
    'gps_lat','gps_lng'
  ]
};

/* =========================
 * Entry points
 * ========================= */

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, service:'PARACEL_SEMAFORO_API', ts:new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = parseJson_(e);
  const action = String((payload && payload.action) ? payload.action : '').trim();

  let out;
  try {
    if (!action) throw new Error('Missing action');

    if (action === 'ping') out = apiPing_();
    else if (action === 'config') out = apiConfig_();
    else if (action === 'login') out = apiLogin_(payload);
    else if (action === 'questions') out = apiQuestions_(payload);
    else if (action === 'submit') out = apiSubmit_(payload);
    else if (action === 'dashboard_summary') out = apiDashboardSummary_(payload);
    else throw new Error('Unknown action');

    return jsonOut_(out);
  } catch (err) {
    return jsonOut_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

/* =========================
 * API implementations
 * ========================= */

function apiPing_() {
  return { ok:true, ts:new Date().toISOString() };
}

function apiConfig_() {
  const params = readParams_();
  return {
    ok:true,
    app_title: params.app_title || 'PARACEL · Sondeo Semáforo',
    logo_url: params.logo_url || 'https://i.postimg.cc/SNHrYXDV/logo-PARACEL.jpg'
  };
}

function apiLogin_(p) {
  requireFields_(p, ['usuario','password']);
  const usuario = String(p.usuario || '').trim();
  const password = String(p.password || '');

  const u = getUserRecord_(usuario);
  if (!u) return { ok:false, error:'Usuario no registrado.' };
  if (!truthy_(u.activo)) return { ok:false, error:'Usuario inactivo.' };

  const stored = String(u.hash_password || '').trim();
  const computed = sha256Hex_(password);

  const looksHash = /^[0-9a-f]{64}$/i.test(stored);
  const ok = looksHash ? (stored.toLowerCase() === computed) : (stored === password);

  if (!ok) return { ok:false, error:'Credenciales inválidas.' };

  const token = Utilities.getUuid();
  const now = new Date();
  const exp = new Date(now.getTime() + CFG.SESSION_TTL_MIN * 60 * 1000);

  const canDashboard = roleAllowsDashboard_(u.rol) || truthy_(u.permiso_tablero);

  const ses = {
    token,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    tipo_informante_default: u.tipo_informante_default,
    can_dashboard: canDashboard,
    iat: now.toISOString(),
    exp: exp.toISOString()
  };

  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify(ses), CFG.SESSION_TTL_MIN * 60);

  return { ok:true, session: ses };
}

function apiQuestions_(p) {
  // Legacy endpoint — questions are now hardcoded in frontend
  const ses = requireSession_(p);
  return { ok:true, session: stripSession_(ses), questions: [] };
}

function apiSubmit_(p) {
  const ses = requireSession_(p);
  requireFields_(p, ['answers']);

  const a = p.answers || {};
  const sem = p.semaforo || {};

  const tipo_informante = String(a.tipo_informante || ses.tipo_informante_default || '').trim();
  if (!tipo_informante) throw new Error('Tipo de informante es obligatorio.');

  const ts = new Date();
  const id_encuesta = String(p.id_encuesta || Utilities.getUuid());

  // Build row matching RESP_HEADERS
  const row = [
    ts,
    ses.usuario,
    ses.nombre,
    ses.rol,
    tipo_informante,
    String(a.zona_depto || ''),
    String(a.zona_distrito || ''),
    String(a.zona_comunidad || ''),
    String(a.tipo_lugar || ''),
    id_encuesta,
    String(a.P05 || ''),
    String(a.P06 || ''),
    String(a.P07 || ''),
    String(a.P08 || ''),
    String(a.P08_otro || ''),
    String(a.P09 || ''),
    String(a.P10 || ''),
    String(a.P11 || ''),
    String(a.tema_origen || ''),
    String(a.P14 || ''),
    String(a.P14_otro || ''),
    String(a.P18 || ''),
    String(a.P19 || ''),
    String(a.comentario || ''),
    String(sem.color || ''),
    sem.score !== null && sem.score !== undefined ? Number(sem.score) : '',
    sem.confiabilidad !== undefined ? Number(sem.confiabilidad) : '',
    a.gps_lat !== undefined && a.gps_lat !== '' ? Number(a.gps_lat) : '',
    a.gps_lng !== undefined && a.gps_lng !== '' ? Number(a.gps_lng) : ''
  ];

  appendRowsSafe_(CFG.SHEET_RESPONSES, [row]);

  return { ok:true, id_encuesta };
}

function apiDashboardSummary_(p) {
  const ses = requireSession_(p);
  if (!ses.can_dashboard) throw new Error('Acceso denegado. Tablero solo para usuarios autorizados.');

  const windowDays = Number(p.window_days || 30);
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const tipo = String(p.tipo_informante || '').trim();
  const comunidad = String(p.comunidad || '').trim();

  const rows = fetchResponses_(from, to, tipo, comunidad);

  const summary = buildSummary_(rows, windowDays, from, to);
  return { ok:true, session: stripSession_(ses), summary };
}

/* =========================
 * Summary and semaphore
 * ========================= */

function buildSummary_(rows, windowDays, from, to) {
  const nRows = rows.length;
  const nEncuestas = uniqueCount_(rows.map(r => r.id_encuesta));
  const nInformantes = uniqueCount_(rows.map(r => r.usuario));

  // Score from semaforo_score column
  const scores = rows.map(r => Number(r.semaforo_score || 0));
  const sumScore = sum_(scores);
  const avgScore = nRows ? sumScore / nRows : 0;

  const byDay = {};
  rows.forEach(r => {
    const day = String(r.ts).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + Number(r.semaforo_score || 0);
  });

  const sem = computeSemaphore_(rows, byDay);

  // Build sample for table
  const sample = rows.slice(0, 200).map(r => ({
    ts: r.ts,
    usuario: r.usuario,
    tipo_informante: r.tipo_informante,
    comunidad: r.zona_comunidad,
    dimension: r.P11 || '',
    id_pregunta: '',
    pregunta: r.P11 || '',
    respuesta: `P05:${r.P05} P06:${r.P06} P10:${r.P10 || '-'}`,
    puntaje: r.semaforo_score,
    id_encuesta: r.id_encuesta
  }));

  // Dimension ranking (by P11 themes)
  const byDim = {};
  rows.forEach(r => {
    const dim = r.P11 || '(sin tema)';
    byDim[dim] = (byDim[dim] || 0) + 1;
  });
  const dimRank = Object.keys(byDim).map(k => ({ dimension: k, puntaje: byDim[k] }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 20);

  const communities = uniqueList_(rows.map(r => r.zona_comunidad).filter(Boolean)).sort();

  return {
    window_days: windowDays,
    range: { from: from.toISOString(), to: to.toISOString() },
    kpi: {
      n_rows: nRows,
      n_encuestas: nEncuestas,
      n_informantes: nInformantes,
      sum_score: round_(sumScore, 4),
      avg_score: round_(avgScore, 4)
    },
    semaforo: sem,
    aggregates: { byDay, byDim },
    rankings: { byDim: dimRank },
    sample,
    filter_values: { comunidades: communities }
  };
}

function computeSemaphore_(rows, byDay) {
  const days = Object.keys(byDay || {}).sort();
  let meanDaily = 0;
  if (days.length) {
    const daily = days.map(d => Number(byDay[d] || 0));
    meanDaily = sum_(daily) / daily.length;
  }

  let color = 'VERDE';
  let hasRed = false;
  let hasYellow = false;
  const signals = [];

  // Check each row for red triggers per Section 6.1
  rows.forEach(r => {
    const p08 = String(r.P08 || '').split('|').map(s => s.trim()).filter(Boolean);
    const p10 = String(r.P10 || '');
    const p09 = String(r.P09 || '');
    const p05 = Number(r.P05 || 0);

    // P08 has C, D, or F
    if (['C', 'D', 'F'].some(v => p08.includes(v))) {
      hasRed = true;
      signals.push({ nivel: 'ROJO', fuente: 'P08', señal: 'Corte/protesta/quejas contratista', ts: r.ts, id_encuesta: r.id_encuesta });
    }

    // P10 = Rojo
    if (p10 === 'Rojo') {
      hasRed = true;
      signals.push({ nivel: 'ROJO', fuente: 'P10', señal: 'Urgente hoy o mañana', ts: r.ts, id_encuesta: r.id_encuesta });
    }

    // P09 = Alta AND P05 >= 4
    if (p09 === 'Alta' && p05 >= 4) {
      hasRed = true;
      signals.push({ nivel: 'ROJO', fuente: 'P09+P05', señal: 'Alta probabilidad + tensión', ts: r.ts, id_encuesta: r.id_encuesta });
    }

    // Yellow: P10 = Amarillo
    if (p10 === 'Amarillo') {
      hasYellow = true;
      signals.push({ nivel: 'AMARILLO', fuente: 'P10', señal: 'Actuar esta semana', ts: r.ts, id_encuesta: r.id_encuesta });
    }
  });

  if (hasRed) color = 'ROJO';
  else if (hasYellow) color = 'AMARILLO';
  else if (meanDaily > 5) color = 'ROJO';
  else if (meanDaily > 3) color = 'AMARILLO';

  const rationale = [
    { tipo: 'Índice cuantitativo', detalle: 'Promedio diario de puntaje', valor: round_(meanDaily, 4), regla: 'Verde<=3, Amarillo(3-5), Rojo>5' }
  ];
  if (hasRed) rationale.push({ tipo: 'Gatillo', detalle: 'Señales críticas detectadas', valor: 'ROJO', regla: 'P08(C/D/F) / P10=Rojo / P09=Alta+P05≥4' });
  if (!hasRed && hasYellow) rationale.push({ tipo: 'Gatillo', detalle: 'Señales de atención', valor: 'AMARILLO', regla: 'P10=Amarillo' });

  return { color, mean_daily_score: round_(meanDaily, 4), rationale, signals: signals.slice(0, 50) };
}

/* =========================
 * Data access
 * ========================= */

function fetchResponses_(from, to, tipo, comunidad) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_RESPONSES);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(String);
  const idx = {};
  header.forEach((h, i) => { idx[String(h).trim()] = i; });

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const tsVal = r[idx.ts];
    const ts = tsVal instanceof Date ? tsVal : new Date(tsVal);
    if (from && ts < from) continue;
    if (to && ts > to) continue;

    const ti = String(r[idx.tipo_informante] || '');
    if (tipo && ti !== tipo) continue;

    const com = String(r[idx.zona_comunidad] || '');
    if (comunidad && com !== comunidad) continue;

    out.push({
      ts: ts.toISOString(),
      usuario: String(r[idx.usuario] || ''),
      tipo_informante: ti,
      zona_comunidad: com,
      zona_depto: String(r[idx.zona_depto] || ''),
      id_encuesta: String(r[idx.id_encuesta] || ''),
      P05: String(r[idx.P05] || ''),
      P06: String(r[idx.P06] || ''),
      P07: String(r[idx.P07] || ''),
      P08: String(r[idx.P08] || ''),
      P09: String(r[idx.P09] || ''),
      P10: String(r[idx.P10] || ''),
      P11: String(r[idx.P11] || ''),
      tema_origen: String(r[idx.tema_origen] || ''),
      P18: String(r[idx.P18] || ''),
      semaforo_color: String(r[idx.semaforo_color] || ''),
      semaforo_score: Number(r[idx.semaforo_score] || 0),
      semaforo_confiabilidad: Number(r[idx.semaforo_confiabilidad] || 0)
    });
  }

  out.sort((a, b) => (a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0)));
  return out;
}

/* =========================
 * Users
 * ========================= */

function getUserRecord_(usuario) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_USERS);
  if (!sh) throw new Error('No existe hoja usuarios.');

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const header = values[0].map(String);
  const idx = indexMapStrict_(header, ['usuario', 'hash_password', 'nombre', 'rol', 'activo', 'tipo_informante_default', 'observacion']);

  const hasPermCol = header.map(h => String(h).trim()).indexOf('permiso_tablero') >= 0;
  const permIdx = hasPermCol ? header.map(h => String(h).trim()).indexOf('permiso_tablero') : -1;

  for (let i = 1; i < values.length; i++) {
    const u = String(values[i][idx.usuario] || '').trim();
    if (u && u.toLowerCase() === usuario.toLowerCase()) {
      return {
        usuario: u,
        hash_password: String(values[i][idx.hash_password] || '').trim(),
        nombre: String(values[i][idx.nombre] || '').trim(),
        rol: String(values[i][idx.rol] || '').trim(),
        activo: values[i][idx.activo],
        tipo_informante_default: String(values[i][idx.tipo_informante_default] || '').trim(),
        observacion: String(values[i][idx.observacion] || '').trim(),
        permiso_tablero: hasPermCol ? values[i][permIdx] : ''
      };
    }
  }
  return null;
}

/* =========================
 * Session management
 * ========================= */

function requireSession_(p) {
  requireFields_(p, ['token']);
  const token = String(p.token || '').trim();
  const raw = CacheService.getScriptCache().get(sessionKey_(token));
  if (!raw) throw new Error('Sesión expirada o inválida.');
  return JSON.parse(raw);
}

function stripSession_(ses) {
  return {
    usuario: ses.usuario,
    nombre: ses.nombre,
    rol: ses.rol,
    tipo_informante_default: ses.tipo_informante_default,
    can_dashboard: ses.can_dashboard,
    exp: ses.exp
  };
}

function sessionKey_(token) {
  return 'PARACEL_SEM_SESSION_' + token;
}

function roleAllowsDashboard_(rol) {
  const r = String(rol || '').trim().toLowerCase();
  return CFG.DASHBOARD_ROLES.indexOf(r) >= 0;
}

/* =========================
 * Write safety
 * ========================= */

function appendRowsSafe_(sheetName, rows) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    appendRows_(sheetName, rows);
  } finally {
    lock.releaseLock();
  }
}

function appendRows_(sheetName, rows) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('No existe hoja: ' + sheetName);

  ensureHeaders_(sh, CFG.RESP_HEADERS);

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureHeaders_(sh, headers) {
  const lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

/* =========================
 * Helpers
 * ========================= */

function parseJson_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!body) return {};
  return JSON.parse(body);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireFields_(obj, fields) {
  if (!obj || typeof obj !== 'object') throw new Error('Payload inválido.');
  fields.forEach(f => { if (!(f in obj)) throw new Error('Falta parámetro: ' + f); });
}

function readParams_() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_PARAMS);
  if (!sh) return {};
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return {};
  const out = {};
  for (let i = 1; i < vals.length; i++) {
    const k = String(vals[i][0] || '').trim();
    const v = String(vals[i][1] || '').trim();
    if (k) out[k] = v;
  }
  return out;
}

function indexMapStrict_(header, requiredCols) {
  const idx = {};
  header.forEach((h, i) => { idx[String(h).trim()] = i; });
  requiredCols.forEach(c => { if (!(c in idx)) throw new Error('Falta columna requerida: ' + c); });
  return new Proxy(idx, {
    get(target, prop) {
      const k = String(prop);
      if (!(k in target)) throw new Error('Falta columna requerida: ' + k);
      return target[k];
    }
  });
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function truthy_(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || '').trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes');
}

function uniqueCount_(arr) {
  const s = {};
  arr.forEach(x => { s[String(x || '')] = true; });
  return Object.keys(s).filter(Boolean).length;
}

function uniqueList_(arr) {
  const s = {};
  arr.forEach(x => { s[String(x || '')] = true; });
  return Object.keys(s).filter(Boolean);
}

function sum_(arr) {
  let s = 0;
  arr.forEach(v => { s += Number(v || 0); });
  return s;
}

function round_(x, d) {
  const p = Math.pow(10, Number(d || 0));
  return Math.round(Number(x || 0) * p) / p;
}
