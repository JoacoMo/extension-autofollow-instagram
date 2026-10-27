// =========================================================================
// popup.js — Lógica del popup de la extensión
// =========================================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseUsuarios(raw) {
  if (!raw) return [];
  const tokens = raw.replace(/,/g, '\n').split(/[\n\s]+/);
  const usuarios = tokens.map(token => {
    const limpio = token.trim().toLowerCase();
    if (!limpio) return '';

    const urlMatch = limpio.match(/instagram\.com\/([a-z0-9._]+)\/?(?:\?.*)?$/i);
    if (urlMatch) return urlMatch[1].replace(/@/g, '');

    return limpio.replace(/^@/, '').replace(/@/g, '');
  }).filter(u => u.length > 0 && u.length < 35 && /^[a-z0-9._]+$/.test(u));

  return [...new Set(usuarios)];
}

function sendBg(action, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...payload }, (res) => {
      if (chrome.runtime.lastError) return resolve({});
      resolve(res || {});
    });
  });
}

// Los seguidos se guardan como { usuario, fecha, motivo }; puede haber
// entradas viejas guardadas como string suelto.
function nombreDeSeguido(entrada) {
  if (typeof entrada === 'string') return entrada;
  return (entrada && entrada.usuario) || '';
}

function parseLineas(raw) {
  return String(raw || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

function leerConfigFiltro() {
  return {
    activo: document.getElementById('cfgFiltroActivo').checked,
    incluirInterior: document.getElementById('cfgFiltroInterior').checked,
    extra: parseLineas(document.getElementById('cfgFiltroExtra').value),
    prohibidas: parseLineas(document.getElementById('cfgFiltroProhibidas').value),
    edadActiva: document.getElementById('cfgEdadActiva').checked,
    edadMin: parseInt(document.getElementById('cfgEdadMin').value) || 18,
    edadMax: parseInt(document.getElementById('cfgEdadMax').value) || 99,
    edadExigir: document.getElementById('cfgEdadExigir').checked,
    negocioActivo: document.getElementById('cfgNegocioActivo').checked,
    negocioExtra: parseLineas(document.getElementById('cfgNegocioExtra').value),
  };
}

function formatTime() {
  return new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Log ──────────────────────────────────────────────────────────────────────

const logBox = document.getElementById('logBox');
const MAX_LOG = 60;
let logLines = [];

function addLog(text, color = '#8e8e93') {
  logLines.unshift({ text, color, ts: formatTime() });
  if (logLines.length > MAX_LOG) logLines = logLines.slice(0, MAX_LOG);
  renderLog();
}

function renderLog() {
  logBox.innerHTML = logLines.map(e =>
    `<span class="log-entry" style="color:${e.color}">[${e.ts}] ${escHtml(e.text)}</span>`
  ).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'lista') renderCola();
    if (tab.dataset.tab === 'historial') renderHistorial();
  });
});

// ── Estado UI ────────────────────────────────────────────────────────────────

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusUser = document.getElementById('statusUser');
const btnStart   = document.getElementById('btnStart');

function applyState(state) {
  if (!state) return;

  // Stats
  document.getElementById('statSeguidos').textContent  = (state.seguidos || []).length;
  document.getElementById('statSaltados').textContent  = (state.saltados || []).length;
  document.getElementById('statErrores').textContent   = (state.errores  || []).length;
  document.getElementById('statRevision').textContent   = (state.revision || []).length;
  document.getElementById('statPendientes').textContent = (state.lista   || []).length;
  document.getElementById('infoCount').textContent      = (state.lista   || []).length;

  // Status
  if (state.running) {
    statusDot.className  = 'status-dot running';
    statusText.textContent = 'Corriendo';
    statusUser.textContent = state.usuarioActual ? `@${state.usuarioActual}` : '';
    btnStart.className   = 'btn btn-stop';
    btnStart.textContent = '⏹ DETENER';
  } else {
    statusDot.className  = 'status-dot stopped';
    statusText.textContent = 'Detenido';
    statusUser.textContent = '';
    btnStart.className   = 'btn btn-start';
    btnStart.textContent = '▶ INICIAR SEGUIMIENTO';
  }
}

// ── Cargar estado inicial ─────────────────────────────────────────────────────

async function loadState() {
  const state = await sendBg('GET_STATE');
  applyState(state);
  await renderHistorial();

  // Cargar config
  // No pisar el campo que el usuario está editando en ese momento
  const setValor = (id, valor) => {
    const el = document.getElementById(id);
    if (el && el !== document.activeElement) el.value = valor;
  };

  setValor('cfgPausaMin', state.pausaMin || 20);
  setValor('cfgPausaMax', state.pausaMax || 35);
  document.getElementById('cfgSaltarSeguidos').checked = state.saltarYaSeguidos !== false;

  document.getElementById('cfgFiltroActivo').checked   = state.filtroActivo !== false;
  document.getElementById('cfgFiltroInterior').checked = state.filtroInterior === true;
  setValor('cfgFiltroExtra', (state.filtroExtra || []).join('\n'));
  setValor('cfgFiltroProhibidas', (state.filtroProhibidas || ['dj']).join('\n'));

  document.getElementById('cfgEdadActiva').checked = state.edadActiva !== false;
  document.getElementById('cfgEdadExigir').checked = state.edadExigir === true;
  document.getElementById('cfgVaciarTrasExportar').checked = state.vaciarTrasExportar !== false;
  document.getElementById('cfgNegocioActivo').checked = state.negocioActivo !== false;
  setValor('cfgNegocioExtra', (state.negocioExtra || []).join('\n'));
  setValor('cfgEdadMin', state.edadMin || 18);
  setValor('cfgEdadMax', state.edadMax || 99);
}

loadState();

// ── Botón Iniciar / Detener ───────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');

  if (state.running) {
    // Detener
    await sendBg('STOP');
    addLog('⏹ Bot detenido.', '#ffcc00');
    applyState(await sendBg('GET_STATE'));
    return;
  }

  // Iniciar — verificar que haya lista
  if (!state.lista || state.lista.length === 0) {
    addLog('⚠️ La lista está vacía. Agregá usuarios primero.', '#ff9500');
    return;
  }

  // Verificar que IG esté abierta
  chrome.tabs.query({ url: 'https://www.instagram.com/*' }, async (tabs) => {
    if (!tabs || tabs.length === 0) {
      addLog('❌ Abrí instagram.com en una pestaña primero.', '#ff3b30');
      return;
    }

    const pausaMin = parseInt(document.getElementById('cfgPausaMin').value) || 20;
    const pausaMax = parseInt(document.getElementById('cfgPausaMax').value) || 35;
    const saltarYaSeguidos = document.getElementById('cfgSaltarSeguidos').checked;

    const res = await sendBg('START', {
      lista: state.lista,
      pausaMin,
      pausaMax,
      saltarYaSeguidos,
      filtro: leerConfigFiltro(),
    });

    if (res.ok) {
      addLog(`🚀 Iniciando. ${state.lista.length} usuarios en cola.`, '#00ffff');
    } else {
      addLog(`❌ Error al iniciar: ${res.error}`, '#ff3b30');
    }

    applyState(await sendBg('GET_STATE'));
  });
});

// ── TAB LISTA — Agregar usuarios ─────────────────────────────────────────────

async function agregarUsuarios(raw) {
  const lista = parseUsuarios(raw);
  if (lista.length === 0) {
    addLog('⚠️ No se encontraron usernames válidos.', '#ff9500');
    return;
  }
  const res = await sendBg('SAVE_LISTA', { lista });
  addLog(`➕ ${lista.length} usuarios agregados. Total en cola: ${res.total}.`, '#34c759');
  document.getElementById('inputLista').value = '';
  document.getElementById('infoCount').textContent = res.total;
  document.getElementById('statPendientes').textContent = res.total;
  renderCola();
}

document.getElementById('btnAgregar').addEventListener('click', () => {
  const raw = document.getElementById('inputLista').value;
  agregarUsuarios(raw);
});

document.getElementById('btnImportar').addEventListener('click', () => {
  document.getElementById('inputArchivo').click();
});

document.getElementById('inputArchivo').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    agregarUsuarios(ev.target.result || '');
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnCopiarCola').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  const texto = (state.lista || []).join(', ');
  navigator.clipboard.writeText(texto).then(() => addLog('📋 Cola copiada.', '#00ffff'));
});

document.getElementById('btnLimpiarCola').addEventListener('click', async () => {
  if (!confirm('¿Limpiar toda la cola de pendientes? (Los historial de seguidos se mantiene)')) return;
  const state = await sendBg('GET_STATE');
  await sendBg('SAVE_LISTA', { lista: [] });
  // Limpiar manualmente la lista en el state
  const newState = Object.assign({}, state, { lista: [] });
  chrome.storage.local.set({ af_state: newState }, () => {
    addLog('🗑 Cola limpiada.', '#ffcc00');
    loadState();
    renderCola();
  });
});

async function renderCola() {
  const state = await sendBg('GET_STATE');
  const lista = state.lista || [];
  const el = document.getElementById('colaActual');
  if (lista.length === 0) {
    el.innerHTML = '<span style="color:#444; font-size:11px;">Vacía.</span>';
    return;
  }
  el.innerHTML = lista.slice(0, 100).map(u =>
    `<div class="lista-item"><span class="lista-item-name">@${escHtml(u)}</span></div>`
  ).join('') + (lista.length > 100 ? `<div style="color:#666;font-size:11px;padding:4px 10px;">...y ${lista.length - 100} más</div>` : '');
}

// ── TAB CONFIG ───────────────────────────────────────────────────────────────

document.getElementById('btnGuardarConfig').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  const filtro = leerConfigFiltro();
  const newState = Object.assign({}, state, {
    pausaMin: parseInt(document.getElementById('cfgPausaMin').value) || 20,
    pausaMax: parseInt(document.getElementById('cfgPausaMax').value) || 35,
    saltarYaSeguidos: document.getElementById('cfgSaltarSeguidos').checked,
    filtroActivo: filtro.activo,
    filtroInterior: filtro.incluirInterior,
    filtroExtra: filtro.extra,
    filtroProhibidas: filtro.prohibidas,
    edadActiva: filtro.edadActiva,
    edadMin: filtro.edadMin,
    edadMax: filtro.edadMax,
    edadExigir: filtro.edadExigir,
    vaciarTrasExportar: document.getElementById('cfgVaciarTrasExportar').checked,
    negocioActivo: filtro.negocioActivo,
    negocioExtra: filtro.negocioExtra,
  });
  chrome.storage.local.set({ af_state: newState }, () => {
    addLog('💾 Configuración guardada.', '#34c759');
  });
});

document.getElementById('btnLimpiarTodo').addEventListener('click', async () => {
  if (!confirm('¿Limpiar TODO? Se borrarán la cola, historial y configuración.')) return;
  await sendBg('CLEAR_LISTA');
  addLog('🗑 Todo limpiado.', '#ffcc00');
  loadState();
  renderCola();
  renderHistorial();
});

// ── TAB HISTORIAL ─────────────────────────────────────────────────────────────

// Los nombres de las listas abren el perfil en una pestaña nueva en segundo
// plano: el popup no se cierra, así se pueden ir abriendo varios de una.
const perfilesAbiertos = new Set();

function escAttr(s) {
  return escHtml(s).replace(/"/g, '&quot;');
}

function filaUsuario(usuario, color, extra) {
  if (!usuario) return '';
  const visitado = perfilesAbiertos.has(usuario) ? ' visitado' : '';
  const detalle = extra
    ? `<span class="lista-item-count">${escHtml(extra)}</span>`
    : '';
  return `<div class="lista-item">
    <span class="lista-item-name abrir-perfil${visitado}"
          data-usuario="${escAttr(usuario)}"
          style="color:${color}"
          title="Abrir @${escAttr(usuario)} en Instagram">@${escHtml(usuario)}</span>
    ${detalle}
  </div>`;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.abrir-perfil');
  if (!el) return;
  const usuario = el.dataset.usuario;
  if (!usuario) return;
  chrome.tabs.create({ url: `https://www.instagram.com/${usuario}/`, active: false });
  perfilesAbiertos.add(usuario);
  el.classList.add('visitado');
});

async function renderHistorial() {
  const state = await sendBg('GET_STATE');
  const seguidos = state.seguidos || [];
  const errores  = state.errores  || [];
  const revision = state.revision || [];

  const vacio = (texto) => `<span style="color:#444; font-size:11px;">${texto}</span>`;

  document.getElementById('histSeguidos').innerHTML = seguidos.length === 0
    ? vacio('Ninguno aún.')
    : seguidos.map(item => filaUsuario(nombreDeSeguido(item), '#34c759', (item && item.motivo) || '')).join('');

  document.getElementById('histErrores').innerHTML = errores.length === 0
    ? vacio('Ninguno.')
    : errores.map(u => filaUsuario(u, '#ff453a')).join('');

  document.getElementById('histRevision').innerHTML = revision.length === 0
    ? vacio('Ninguno.')
    : revision.map(u => filaUsuario(u, '#5856d6')).join('');
}

document.getElementById('btnCopiarSeguidos').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  const texto = (state.seguidos || []).map(nombreDeSeguido).filter(Boolean).join('\n');
  navigator.clipboard.writeText(texto).then(() => addLog('📋 Seguidos copiados.', '#00ffff'));
});

document.getElementById('btnExportarSeguidos').addEventListener('click', async () => {
  const res = await sendBg('EXPORT_SEGUIDOS');
  if (res.ok) {
    addLog(`💾 ${res.total} seguidos exportados a Descargas.`, '#34c759');
  } else {
    addLog(`⚠️ ${res.error || 'No se pudo exportar.'}`, '#ff9500');
  }
  loadState();
  renderHistorial();
});

document.getElementById('btnLimpiarSeguidos').addEventListener('click', async () => {
  await sendBg('CLEAR_SEGUIDOS');
  addLog('🗑 Historial de seguidos limpiado.', '#ffcc00');
  renderHistorial();
});

document.getElementById('btnCopiarErrores').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  navigator.clipboard.writeText((state.errores || []).join('\n')).then(() => addLog('📋 Errores copiados.', '#00ffff'));
});

document.getElementById('btnAbrirRevision').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  if ((state.revision || []).length === 0) {
    addLog('📭 No hay perfiles en revisión.', '#ff9500');
    return;
  }
  await sendBg('ABRIR_REVISION');
  window.close();
});

document.getElementById('btnCopiarRevision').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  navigator.clipboard.writeText((state.revision || []).join('\n')).then(() => addLog('📋 Revisión copiada.', '#00ffff'));
});

document.getElementById('btnLimpiarRevision').addEventListener('click', async () => {
  const state = await sendBg('GET_STATE');
  const newState = Object.assign({}, state, { revision: [] });
  chrome.storage.local.set({ af_state: newState }, () => {
    addLog('🗑 Revisión limpiada.', '#ffcc00');
    loadState();
  });
});

// ── Mensajes en tiempo real desde el background ───────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'STATE_UPDATE') return;

  switch (message.action) {
    case 'LOG':
      addLog(message.text, message.color);
      break;
    case 'PROCESSING':
      statusUser.textContent = `@${message.usuario}`;
      break;
    case 'FINISHED':
      addLog('🏁 ¡Lista terminada!', '#00ffff');
      loadState();
      break;
  }

  // Actualizar stats en tiempo real
  loadState();
});

// Polling liviano para mantener stats al día si el popup está abierto
setInterval(async () => {
  const state = await sendBg('GET_STATE');
  applyState(state);
}, 3000);
