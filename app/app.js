const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzZJHNbxZ7YH57jAYeWKMdjRXOGONx5sF-jq2zDISstqcHvj2-4_-ZPVMco08XN8fR5/exec'
};

/* ===========================
 * DOM references
 * =========================== */

const UI = {
  cardLogin: document.getElementById('cardLogin'),
  cardApp: document.getElementById('cardApp'),
  btnLogin: document.getElementById('btnLogin'),
  btnClear: document.getElementById('btnClear'),
  btnLogout: document.getElementById('btnLogout'),
  loginUser: document.getElementById('loginUser'),
  loginPass: document.getElementById('loginPass'),
  loginMsg: document.getElementById('loginMsg'),

  netPill: document.getElementById('netPill'),
  appTitle: document.getElementById('appTitle'),

  tabForm: document.getElementById('tabForm'),
  tabDash: document.getElementById('tabDash'),
  panelForm: document.getElementById('panelForm'),
  panelDash: document.getElementById('panelDash'),

  // Survey fields
  P01: document.getElementById('P01'),
  P02: document.getElementById('P02'),
  P02Otro: document.getElementById('P02Otro'),
  P02OtroWrap: document.getElementById('P02OtroWrap'),
  P03Depto: document.getElementById('P03Depto'),
  P03Distrito: document.getElementById('P03Distrito'),
  P03Comunidad: document.getElementById('P03Comunidad'),
  P08G: document.getElementById('P08G'),
  P11: document.getElementById('P11'),
  P11Otro: document.getElementById('P11Otro'),
  P11OtroWrap: document.getElementById('P11OtroWrap'),
  P18Otro: document.getElementById('P18Otro'),
  P18OtroWrap: document.getElementById('P18OtroWrap'),
  P14Otro: document.getElementById('P14Otro'),
  P14OtroWrap: document.getElementById('P14OtroWrap'),
  P19: document.getElementById('P19'),
  P20Foto: document.getElementById('P20Foto'),
  P08Otro: document.getElementById('P08Otro'),
  metaComentario: document.getElementById('metaComentario'),

  // Skip-logic wrappers
  wrapP09: document.getElementById('wrapP09'),
  wrapP10: document.getElementById('wrapP10'),
  wrapP14: document.getElementById('wrapP14'),

  // GPS
  btnGPS: document.getElementById('btnGPS'),
  gpsResult: document.getElementById('gpsResult'),

  // Semaforo result
  semaforoResult: document.getElementById('semaforoResult'),
  resGreen: document.getElementById('resGreen'),
  resYellow: document.getElementById('resYellow'),
  resRed: document.getElementById('resRed'),
  resTitle: document.getElementById('resTitle'),
  resBadge: document.getElementById('resBadge'),
  resMeta: document.getElementById('resMeta'),
  resConf: document.getElementById('resConf'),

  // Form buttons
  btnSaveLocal: document.getElementById('btnSaveLocal'),
  btnSendNow: document.getElementById('btnSendNow'),
  btnSync: document.getElementById('btnSync'),
  formMsg: document.getElementById('formMsg'),
  pendingCount: document.getElementById('pendingCount'),
  lastSync: document.getElementById('lastSync'),

  // Dashboard
  dashWindow: document.getElementById('dashWindow'),
  dashTipo: document.getElementById('dashTipo'),
  dashComunidad: document.getElementById('dashComunidad'),
  btnDash: document.getElementById('btnDash'),
  dashMsg: document.getElementById('dashMsg'),
  dashSearch: document.getElementById('dashSearch'),
  lightGreen: document.getElementById('lightGreen'),
  lightYellow: document.getElementById('lightYellow'),
  lightRed: document.getElementById('lightRed'),
  semTitle: document.getElementById('semTitle'),
  semBadge: document.getElementById('semBadge'),
  semMeta: document.getElementById('semMeta'),
  semExplain: document.getElementById('semExplain'),
  kpis: document.getElementById('kpis'),
  dashTable: document.getElementById('dashTable'),
  tableCount: document.getElementById('tableCount'),
  chartTimeline: document.getElementById('chartTimeline'),
  chartAlerts: document.getElementById('chartAlerts'),
  chartDims: document.getElementById('chartDims')
};

let STATE = {
  session: null,
  dashData: null,
  charts: {},
  gps: null,
  fotoBase64: null
};

/* ===========================
 * Utilities
 * =========================== */

function setMsg(el, text, kind = 'ok') {
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="msg ${kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'bad'}">${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", "&#039;");
}

function isOnline() { return navigator.onLine; }

function updateNetPill() {
  const online = isOnline();
  UI.netPill.textContent = online ? '● Online' : '○ Offline';
  UI.netPill.className = 'badge ' + (online ? 'pill-online' : 'pill-offline');
}

async function api(action, body) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...body })
  });
  return await res.json();
}

/* ===========================
 * Initialization
 * =========================== */

async function init() {
  updateNetPill();
  window.addEventListener('online', async () => { updateNetPill(); await syncPending(true); });
  window.addEventListener('offline', () => updateNetPill());

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { }
  }

  await loadSessionFromCache();
  await refreshPendingCount();

  setP01Now();

  // Auth buttons
  UI.btnLogin.addEventListener('click', login);
  UI.btnClear.addEventListener('click', () => { UI.loginUser.value = ''; UI.loginPass.value = ''; setMsg(UI.loginMsg, ''); });
  UI.btnLogout.addEventListener('click', logout);

  // Tabs
  UI.tabForm.addEventListener('click', () => setTab('form'));
  UI.tabDash.addEventListener('click', () => setTab('dash'));

  // Form buttons
  UI.btnSaveLocal.addEventListener('click', saveLocalOnly);
  UI.btnSendNow.addEventListener('click', sendNow);
  UI.btnSync.addEventListener('click', () => syncPending(false));

  // Dashboard
  UI.btnDash.addEventListener('click', loadDashboard);
  UI.dashSearch.addEventListener('input', () => {
    if (STATE.dashData) renderDashboard(STATE.dashData);
  });

  // GPS & Photo
  UI.btnGPS.addEventListener('click', captureGPS);
  UI.P20Foto.addEventListener('change', capturePhoto);

  // Skip logic
  setupSkipLogic();
}

function setP01Now() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const local = new Date(now - tzOffset);
  UI.P01.value = local.toISOString().slice(0, 16);
}

/* ===========================
 * Skip Logic
 * =========================== */

function setupSkipLogic() {
  // P02 "Otro"
  UI.P02.addEventListener('change', () => {
    UI.P02OtroWrap.classList.toggle('hidden', UI.P02.value !== 'Otro');
  });

  // P08 checkboxes → toggle P09, P10
  document.querySelectorAll('[data-p08]').forEach(cb => {
    cb.addEventListener('change', () => updateP08Logic());
  });

  // P11 "Otro"
  UI.P11.addEventListener('change', () => {
    UI.P11OtroWrap.classList.toggle('hidden', UI.P11.value !== 'Otro');
  });

  // tema_origen → toggle P14
  document.querySelectorAll('input[name="tema_origen"]').forEach(r => {
    r.addEventListener('change', () => {
      UI.wrapP14.classList.toggle('hidden', getRadio('tema_origen') !== 'Rumores');
    });
  });

  // P14 "Otro"
  document.querySelectorAll('[data-p14]').forEach(cb => {
    cb.addEventListener('change', () => {
      const otroChecked = document.querySelector('[data-p14][value="Otro"]:checked');
      UI.P14OtroWrap.classList.toggle('hidden', !otroChecked);
    });
  });

  // P18 "Otro"
  document.querySelectorAll('input[name="P18"]').forEach(r => {
    r.addEventListener('change', () => {
      UI.P18OtroWrap.classList.toggle('hidden', getRadio('P18') !== 'Otro');
    });
  });
}

function updateP08Logic() {
  const checked = Array.from(document.querySelectorAll('[data-p08]:checked')).map(c => c.value);
  const hasACD = checked.some(v => ['A', 'C', 'D'].includes(v));

  // G exclusion logic
  if (checked.includes('G') && checked.length > 1) {
    document.querySelectorAll('[data-p08]:checked').forEach(cb => {
      if (cb.value !== 'G') cb.checked = false;
    });
    UI.wrapP09.classList.add('hidden');
    UI.wrapP10.classList.add('hidden');
    return;
  }
  if (!checked.includes('G') && checked.length > 0) {
    UI.P08G.checked = false;
  }

  const onlyG = checked.length === 1 && checked[0] === 'G';
  const hasNone = checked.length === 0;

  if (onlyG || hasNone) {
    UI.wrapP09.classList.add('hidden');
    UI.wrapP10.classList.add('hidden');
  } else {
    UI.wrapP10.classList.remove('hidden');
    UI.wrapP09.classList.toggle('hidden', !hasACD);
  }
}

/* ===========================
 * GPS & Photo
 * =========================== */

function captureGPS() {
  if (!navigator.geolocation) {
    UI.gpsResult.textContent = 'GPS no disponible en este dispositivo.';
    return;
  }
  UI.gpsResult.textContent = 'Capturando ubicación…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      STATE.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      UI.gpsResult.textContent = `📍 ${STATE.gps.lat.toFixed(5)}, ${STATE.gps.lng.toFixed(5)} (±${Math.round(STATE.gps.accuracy)}m)`;
    },
    err => { UI.gpsResult.textContent = 'Error GPS: ' + err.message; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function capturePhoto() {
  const file = UI.P20Foto.files[0];
  if (!file) { STATE.fotoBase64 = null; return; }
  const reader = new FileReader();
  reader.onload = () => { STATE.fotoBase64 = reader.result; };
  reader.readAsDataURL(file);
}

/* ===========================
 * Collect answers
 * =========================== */

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function getCheckboxes(attr) {
  return Array.from(document.querySelectorAll(`[${attr}]:checked`)).map(c => c.value);
}

function collectAnswers() {
  const P08 = getCheckboxes('data-p08');
  const P14 = getCheckboxes('data-p14');
  const tipo = UI.P02.value === 'Otro' ? (UI.P02Otro.value.trim() || 'Otro') : UI.P02.value;
  const P11val = UI.P11.value === 'Otro' ? (UI.P11Otro.value.trim() || 'Otro') : UI.P11.value;
  const P18val = getRadio('P18') === 'Otro' ? (UI.P18Otro.value.trim() || 'Otro') : getRadio('P18');

  return {
    P01: UI.P01.value,
    tipo_informante: tipo,
    zona_depto: UI.P03Depto.value,
    zona_distrito: UI.P03Distrito.value.trim(),
    zona_comunidad: UI.P03Comunidad.value.trim(),
    tipo_lugar: getRadio('P04'),
    P05: getRadio('P05'),
    P06: getRadio('P06'),
    P07: getRadio('P07'),
    P08: P08.join('|'),
    P08_otro: UI.P08Otro.value.trim(),
    P09: getRadio('P09'),
    P10: getRadio('P10'),
    P11: P11val,
    tema_origen: getRadio('tema_origen'),
    P14: P14.join('|'),
    P14_otro: P14.includes('Otro') ? (UI.P14Otro ? UI.P14Otro.value.trim() : '') : '',
    P18: P18val,
    P19: UI.P19.value.trim(),
    comentario: UI.metaComentario.value.trim(),
    gps_lat: STATE.gps ? STATE.gps.lat : '',
    gps_lng: STATE.gps ? STATE.gps.lng : '',
    foto_base64: STATE.fotoBase64 || ''
  };
}

/* ===========================
 * Semáforo Calculation
 * =========================== */

function computeSemaforo(answers) {
  const P05 = Number(answers.P05 || 0);
  const P06 = answers.P06;
  const P08 = (answers.P08 || '').split('|').filter(Boolean);
  const P09 = answers.P09;
  const P10 = answers.P10;

  let isRed = false;
  let triggers = [];

  if (['C', 'D', 'F'].some(v => P08.includes(v))) {
    isRed = true;
    triggers.push('P08 marcó C, D o F');
  }
  if (P10 === 'Rojo') {
    isRed = true;
    triggers.push('P10 = Rojo');
  }
  if (P09 === 'Alta' && P05 >= 4) {
    isRed = true;
    triggers.push('P09 = Alta y P05 ≥ 4');
  }

  if (isRed) {
    return { color: 'ROJO', score: null, triggers, confiabilidad: getConfiabilidad(answers.P07) };
  }

  let score = 0;
  score += Math.max(0, P05 - 1);
  if (P06 === 'Sigue igual') score += 1;
  else if (P06 === 'Empeoró') score += 2;
  let p08Score = 0;
  ['A', 'B', 'E'].forEach(v => { if (P08.includes(v)) p08Score++; });
  score += Math.min(p08Score, 3);

  let color;
  if (score <= 3) color = 'VERDE';
  else if (score <= 7) color = 'AMARILLO';
  else color = 'ROJO';

  return { color, score, triggers: [], confiabilidad: getConfiabilidad(answers.P07) };
}

function getConfiabilidad(P07) {
  if (P07 === 'Alta') return 1.0;
  if (P07 === 'Media') return 0.8;
  if (P07 === 'Baja') return 0.6;
  return 0;
}

function showSemaforoResult(sem) {
  UI.semaforoResult.classList.remove('hidden');

  // Reset lights
  UI.resRed.className = 'tl-light';
  UI.resYellow.className = 'tl-light';
  UI.resGreen.className = 'tl-light';

  // Activate correct light
  if (sem.color === 'ROJO') UI.resRed.className = 'tl-light on-red';
  if (sem.color === 'AMARILLO') UI.resYellow.className = 'tl-light on-yellow';
  if (sem.color === 'VERDE') UI.resGreen.className = 'tl-light on-green';

  UI.resTitle.textContent = 'Resultado del Semáforo';

  // Badge
  const badgeClass = sem.color === 'ROJO' ? 'sem-badge-rojo' : sem.color === 'AMARILLO' ? 'sem-badge-amarillo' : 'sem-badge-verde';
  UI.resBadge.innerHTML = `<span class="sem-badge ${badgeClass}">${sem.color}</span>`;

  let detail = '';
  if (sem.score !== null) detail = `Puntaje: ${sem.score}`;
  if (sem.triggers.length) detail += (detail ? ' · ' : '') + sem.triggers.join('; ');
  UI.resMeta.textContent = detail;
  UI.resConf.textContent = `Confiabilidad: ${sem.confiabilidad}`;
}

/* ===========================
 * Validation
 * =========================== */

function validateForm(answers) {
  const errors = [];
  if (!answers.tipo_informante) errors.push('P02: Seleccione tipo de informante');
  if (!answers.zona_depto) errors.push('P03: Seleccione departamento');
  if (!answers.tipo_lugar) errors.push('P04: Seleccione tipo de lugar');
  if (!answers.P05) errors.push('P05: Seleccione ambiente social');
  if (!answers.P06) errors.push('P06: Seleccione tendencia');
  if (!answers.P07) errors.push('P07: Seleccione certeza');
  if (!answers.P08) errors.push('P08: Seleccione al menos una señal');
  if (!answers.P11) errors.push('P11: Seleccione tema principal');
  if (!answers.tema_origen) errors.push('Origen: Seleccione tipo');
  if (!answers.P18) errors.push('P18: Seleccione acción');

  const P08list = (answers.P08 || '').split('|').filter(Boolean);
  const hasACD = P08list.some(v => ['A', 'C', 'D'].includes(v));
  const onlyG = P08list.length === 1 && P08list[0] === 'G';

  if (hasACD && !answers.P09) errors.push('P09: Seleccione probabilidad');
  if (!onlyG && P08list.length > 0 && !answers.P10) errors.push('P10: Seleccione intervención');
  return errors;
}

/* ===========================
 * Build payload
 * =========================== */

function buildPayload() {
  const answers = collectAnswers();
  const sem = computeSemaforo(answers);
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2);
  return { id_encuesta: id, answers, semaforo: sem };
}

/* ===========================
 * Save & Send
 * =========================== */

async function saveLocalOnly() {
  setMsg(UI.formMsg, '');
  if (!STATE.session) { setMsg(UI.formMsg, 'Debe iniciar sesión.', 'bad'); return; }
  const answers = collectAnswers();
  const errors = validateForm(answers);
  if (errors.length) { setMsg(UI.formMsg, errors.join('\n'), 'bad'); return; }
  const payload = buildPayload();
  showSemaforoResult(payload.semaforo);
  await IDB.put(IDB.STORE_PENDING, { local_id: payload.id_encuesta, created_at: new Date().toISOString(), status: 'pending', token: STATE.session.token, payload });
  await refreshPendingCount();
  setMsg(UI.formMsg, 'Guardado localmente. Se enviará al volver la conexión.', 'ok');
}

async function sendNow() {
  setMsg(UI.formMsg, '');
  if (!STATE.session) { setMsg(UI.formMsg, 'Debe iniciar sesión.', 'bad'); return; }
  const answers = collectAnswers();
  const errors = validateForm(answers);
  if (errors.length) { setMsg(UI.formMsg, errors.join('\n'), 'bad'); return; }
  const payload = buildPayload();
  showSemaforoResult(payload.semaforo);
  await IDB.put(IDB.STORE_PENDING, { local_id: payload.id_encuesta, created_at: new Date().toISOString(), status: 'pending', token: STATE.session.token, payload });
  await refreshPendingCount();
  if (!isOnline()) { setMsg(UI.formMsg, 'Sin conexión. Quedó en pendientes.', 'warn'); return; }
  await syncPending(false);
}

/* ===========================
 * Sync
 * =========================== */

async function syncPending(silent) {
  if (!STATE.session) return;
  const items = await IDB.listPending(500);
  const pending = items.filter(x => x && x.status === 'pending');
  if (!pending.length) {
    await refreshPendingCount();
    if (!silent) setMsg(UI.formMsg, 'No hay pendientes.', 'ok');
    return;
  }
  if (!isOnline()) {
    await refreshPendingCount();
    if (!silent) setMsg(UI.formMsg, 'Sin conexión.', 'warn');
    return;
  }

  let okN = 0, badN = 0;
  for (const it of pending) {
    try {
      const res = await api('submit', { token: it.token, id_encuesta: it.payload.id_encuesta, answers: it.payload.answers, semaforo: it.payload.semaforo });
      if (res && res.ok) { okN++; await IDB.del(IDB.STORE_PENDING, it.local_id); }
      else badN++;
    } catch (e) { badN++; }
  }
  await refreshPendingCount();
  UI.lastSync.textContent = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (!silent) {
    if (badN === 0) setMsg(UI.formMsg, `Sincronización completa. Enviados=${okN}.`, 'ok');
    else setMsg(UI.formMsg, `Parcial. Enviados=${okN}, fallidos=${badN}.`, 'warn');
  }
}

async function refreshPendingCount() {
  const items = await IDB.listPending(5000);
  const n = items.filter(x => x && x.status === 'pending').length;
  UI.pendingCount.textContent = String(n);
}

/* ===========================
 * Session
 * =========================== */

async function loadSessionFromCache() {
  const s = await IDB.get(IDB.STORE_CACHE, 'session');
  if (s && s.value && s.value.token) {
    STATE.session = s.value;
    showApp();
    if (STATE.session.can_dashboard) UI.tabDash.style.display = 'inline-flex';
  }
}

async function persistSession(session) {
  STATE.session = session;
  await IDB.put(IDB.STORE_CACHE, { key: 'session', value: session, saved_at: new Date().toISOString() });
}

async function login() {
  setMsg(UI.loginMsg, '');
  const usuario = UI.loginUser.value.trim();
  const password = UI.loginPass.value;
  if (!usuario || !password) { setMsg(UI.loginMsg, 'Complete usuario y contraseña.', 'bad'); return; }
  if (!isOnline()) { setMsg(UI.loginMsg, 'El primer login requiere conexión.', 'warn'); return; }
  UI.btnLogin.disabled = true;
  try {
    const res = await api('login', { usuario, password });
    if (!res.ok) { setMsg(UI.loginMsg, res.error || 'Login inválido.', 'bad'); return; }
    await persistSession(res.session);
    showApp();
    if (STATE.session.can_dashboard) UI.tabDash.style.display = 'inline-flex';
    else UI.tabDash.style.display = 'none';
    setTab('form');
    await syncPending(true);
  } catch (e) { setMsg(UI.loginMsg, 'Error de red.', 'bad'); }
  finally { UI.btnLogin.disabled = false; }
}

async function logout() {
  STATE.session = null;
  await IDB.del(IDB.STORE_CACHE, 'session');
  UI.cardApp.style.display = 'none';
  UI.cardLogin.style.display = '';
  UI.btnLogout.style.display = 'none';
  UI.tabDash.style.display = 'none';
}

function showApp() {
  UI.cardLogin.style.display = 'none';
  UI.cardApp.style.display = 'block';
  UI.btnLogout.style.display = 'inline-flex';
}

function setTab(which) {
  if (which === 'dash') {
    UI.panelForm.style.display = 'none';
    UI.panelDash.style.display = 'block';
    UI.tabForm.classList.remove('active');
    UI.tabDash.classList.add('active');
  } else {
    UI.panelForm.style.display = 'block';
    UI.panelDash.style.display = 'none';
    UI.tabForm.classList.add('active');
    UI.tabDash.classList.remove('active');
  }
}

/* ===========================
 * Dashboard
 * =========================== */

async function loadDashboard() {
  setMsg(UI.dashMsg, '');
  if (!STATE.session) { setMsg(UI.dashMsg, 'Debe iniciar sesión.', 'bad'); return; }
  if (!STATE.session.can_dashboard) { setMsg(UI.dashMsg, 'No autorizado.', 'bad'); return; }
  if (!isOnline()) { setMsg(UI.dashMsg, 'Requiere conexión.', 'warn'); return; }
  UI.btnDash.disabled = true;
  try {
    const res = await api('dashboard_summary', {
      token: STATE.session.token,
      window_days: Number(UI.dashWindow.value || 30),
      tipo_informante: UI.dashTipo.value.trim(),
      comunidad: UI.dashComunidad.value.trim()
    });
    if (!res.ok) { setMsg(UI.dashMsg, res.error || 'Error.', 'bad'); return; }
    STATE.dashData = res.summary;
    renderDashboard(res.summary);
    setMsg(UI.dashMsg, 'Tablero actualizado.', 'ok');
  } catch (e) { setMsg(UI.dashMsg, 'Error de red.', 'bad'); }
  finally { UI.btnDash.disabled = false; }
}

function setSemaphore(sema) {
  UI.lightRed.className = 'tl-light';
  UI.lightYellow.className = 'tl-light';
  UI.lightGreen.className = 'tl-light';

  if (!sema) {
    UI.semTitle.textContent = 'Estado Actual del Sistema';
    UI.semBadge.innerHTML = '';
    UI.semMeta.textContent = 'Sin datos';
    UI.semExplain.textContent = '';
    return;
  }

  const c = String(sema.color || 'VERDE').toUpperCase();
  if (c === 'VERDE') UI.lightGreen.className = 'tl-light on-green';
  if (c === 'AMARILLO') UI.lightYellow.className = 'tl-light on-yellow';
  if (c === 'ROJO') UI.lightRed.className = 'tl-light on-red';

  UI.semTitle.textContent = 'Estado Actual del Sistema';
  const badgeClass = c === 'ROJO' ? 'sem-badge-rojo' : c === 'AMARILLO' ? 'sem-badge-amarillo' : 'sem-badge-verde';
  UI.semBadge.innerHTML = `<span class="sem-badge ${badgeClass}">SEMÁFORO ${c}</span>`;
  UI.semMeta.textContent = 'Promedio diario: ' + String(sema.mean_daily_score ?? '');
  const rationale = (sema.rationale || []).map(x => `${x.tipo}: ${x.detalle} (${x.valor})`).join(' | ');
  UI.semExplain.textContent = rationale;
}

function renderDashboard(s) {
  if (!s) return;
  setSemaphore(s.semaforo);

  // Comunidades filter
  const coms = (s.filter_values && s.filter_values.comunidades) || [];
  const cur = UI.dashComunidad.value;
  UI.dashComunidad.innerHTML = [''].concat(coms).map(v => `<option value="${escapeHtml(v)}">${v ? escapeHtml(v) : '(todas)'}</option>`).join('');
  if (coms.includes(cur)) UI.dashComunidad.value = cur;

  const qText = String(UI.dashSearch.value || '').toLowerCase().trim();

  // KPIs
  const k = s.kpi || {};
  const kpiItems = [
    { label: 'Respuestas', value: k.n_rows, color: '#10b981' },
    { label: 'Encuestas', value: k.n_encuestas, color: '#2563eb' },
    { label: 'Informantes', value: k.n_informantes, color: '#9333ea' },
    { label: 'Score Prom.', value: k.avg_score, color: '#f59e0b' },
  ];
  UI.kpis.innerHTML = kpiItems.map(it => `
    <div class="glass kpi">
      <div class="kpi-bg" style="background:${it.color}"></div>
      <div class="klabel">${escapeHtml(it.label)}</div>
      <div class="kval">${escapeHtml(String(it.value ?? '—'))}</div>
    </div>
  `).join('');

  // Table
  let sample = s.sample || [];
  if (qText) {
    sample = sample.filter(r =>
      String(r.comunidad || '').toLowerCase().includes(qText) ||
      String(r.pregunta || '').toLowerCase().includes(qText) ||
      String(r.respuesta || '').toLowerCase().includes(qText) ||
      String(r.dimension || '').toLowerCase().includes(qText)
    );
  }
  sample = sample.slice(0, 500);
  UI.tableCount.textContent = sample.length + (sample.length === 500 ? '+' : '');

  if (!sample.length) {
    UI.dashTable.innerHTML = '<p class="muted" style="padding:16px;">Sin registros.</p>';
  } else {
    let html = '<table><thead><tr><th>Fecha</th><th>Informante</th><th>Comunidad</th><th>Tema</th><th>Respuesta</th><th>Semáforo</th></tr></thead><tbody>';
    sample.forEach(r => {
      let scoreVal = Number(r.puntaje || 0);
      let tlColor = scoreVal >= 2 ? 'rojo' : scoreVal === 1 ? 'amarillo' : 'verde';
      let tlLabel = tlColor.charAt(0).toUpperCase() + tlColor.slice(1);
      html += `<tr>
        <td>${escapeHtml(String(r.ts || '').slice(0, 16).replace('T', ' '))}</td>
        <td>${escapeHtml(r.tipo_informante || '')}</td>
        <td>${escapeHtml(r.comunidad || '')}</td>
        <td><b>${escapeHtml(r.dimension || '')}</b></td>
        <td>${escapeHtml(r.respuesta || '')}</td>
        <td><span class="tl-badge tl-badge-${tlColor}"><span class="tl-dot"></span>${tlLabel}</span></td>
      </tr>`;
    });
    html += '</tbody></table>';
    UI.dashTable.innerHTML = html;
  }

  renderCharts(s);
}

function renderCharts(s) {
  if (!window.Chart) return;
  ['timeline', 'alerts', 'dims'].forEach(k => { if (STATE.charts[k]) STATE.charts[k].destroy(); });

  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.color = '#6b7280';

  const byDay = s.aggregates?.byDay || {};
  const days = Object.keys(byDay).sort();

  STATE.charts.timeline = new Chart(UI.chartTimeline, {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{ label: 'Puntaje Diario', data: days.map(d => byDay[d]), borderColor: '#0a4d3c', backgroundColor: 'rgba(10,77,60,.1)', fill: true, tension: .35, pointRadius: 3 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  const sample = s.sample || [];
  let counts = { Verde: 0, Amarillo: 0, Rojo: 0 };
  sample.forEach(r => { if (r.puntaje >= 2) counts.Rojo++; else if (r.puntaje === 1) counts.Amarillo++; else counts.Verde++; });

  STATE.charts.alerts = new Chart(UI.chartAlerts, {
    type: 'doughnut',
    data: {
      labels: ['Verde', 'Amarillo', 'Rojo'],
      datasets: [{ data: [counts.Verde, counts.Amarillo, counts.Rojo], backgroundColor: ['#22c55e', '#eab308', '#ef4444'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } }
  });

  const rank = (s.rankings && s.rankings.byDim) ? s.rankings.byDim.filter(r => r.dimension !== '(sin_dimension)') : [];
  STATE.charts.dims = new Chart(UI.chartDims, {
    type: 'bar',
    data: {
      labels: rank.map(r => r.dimension),
      datasets: [{ label: 'Frecuencia', data: rank.map(r => r.puntaje), backgroundColor: rank.map((_, i) => `hsl(160, 70%, ${30 + i * 5}%)`), borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
  });
}

/* ===========================
 * Start
 * =========================== */

init();
