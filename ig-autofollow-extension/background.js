// =========================================================================
// background.js — Service Worker de la extensión IG Auto-Follow Bot
// Maneja el estado global persistente y la comunicación con content scripts
// =========================================================================

// ── Estado global ────────────────────────────────────────────────────────────

const STATE_KEY = 'af_state';

const defaultState = {
  running: false,
  lista: [],           // usernames pendientes (se va consumiendo)
  listaOriginal: [],   // para estadísticas
  seguidos: [],
  saltados: [],
  errores: [],
  revision: [],
  pausaMin: 20,
  pausaMax: 35,
  saltarYaSeguidos: true,
  filtroActivo: true,          // solo seguir perfiles con señales de Córdoba
  filtroInterior: false,       // incluir Gran Córdoba / interior provincial
  filtroExtra: [],             // términos propios que suma el usuario
  filtroProhibidas: ['dj'],    // si aparece esto, se saltea el perfil
  edadActiva: true,            // filtrar por la edad que se deduce del texto
  edadMin: 18,
  edadMax: 99,
  edadExigir: false,           // true = mandar a revisión si no hay pista de edad
  vaciarTrasExportar: true,    // no acumular el historial en el navegador
  negocioActivo: true,         // saltear locales, boliches y cuentas comerciales
  negocioExtra: [],            // rubros propios que suma el usuario
  usuarioActual: null,
  totalProcesados: 0,
  esperandoCargaHasta: 0,
};

async function getState() {
  return new Promise(resolve => {
    chrome.storage.local.get(STATE_KEY, (res) => {
      resolve(Object.assign({}, defaultState, res[STATE_KEY] || {}));
    });
  });
}

async function setState(patch) {
  const current = await getState();
  const next = Object.assign({}, current, patch);
  return new Promise(resolve => {
    chrome.storage.local.set({ [STATE_KEY]: next }, resolve);
  });
}

// ── Enviar mensaje al content script en la pestaña de Instagram ──────────────

async function sendToContent(message) {
  async function getInstagramTab() {
    return new Promise(resolve => {
      chrome.tabs.query({ url: 'https://www.instagram.com/*', active: true }, (tabs) => {
        if (tabs && tabs.length > 0) return resolve(tabs[0]);
        chrome.tabs.query({ url: 'https://www.instagram.com/*' }, (allTabs) => {
          resolve((allTabs && allTabs.length > 0) ? allTabs[0] : null);
        });
      });
    });
  }

  async function ensureContentScript(tabId) {
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { action: 'PING' }, () => {
        if (!chrome.runtime.lastError) return resolve(true);
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        }, () => resolve(!chrome.runtime.lastError));
      });
    });
  }

  const tab = await getInstagramTab();
  if (!tab) return { ok: false, error: 'No hay pestaña de Instagram abierta.' };

  const ready = await ensureContentScript(tab.id);
  if (!ready) return { ok: false, error: 'No se pudo preparar el script de Instagram.' };

  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, message, (res) => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: chrome.runtime.lastError.message || 'Sin receptor en la pestaña de Instagram.' });
      }
      resolve(res || { ok: false, error: 'Sin respuesta del content script.' });
    });
  });
}

// ── Exportar los seguidos a un CSV en Descargas ──────────────────────────────
// Se guarda con BOM UTF-8: abre directo en Excel y se importa a Google Sheets.

// Tolera el formato viejo (array de strings) y el nuevo (array de objetos)
function nombreDeSeguido(entrada) {
  if (typeof entrada === 'string') return entrada;
  return (entrada && entrada.usuario) || '';
}

function escaparCsv(valor) {
  const s = String(valor == null ? '' : valor);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function armarCsv(seguidos) {
  const filas = [['usuario', 'fecha', 'hora', 'motivo', 'perfil']];
  for (const item of seguidos) {
    const usuario = nombreDeSeguido(item);
    if (!usuario) continue;
    const iso = (item && item.fecha) || '';
    const d = iso ? new Date(iso) : null;
    filas.push([
      usuario,
      d ? d.toLocaleDateString('es-AR') : '',
      d ? d.toLocaleTimeString('es-AR') : '',
      (item && item.motivo) || '',
      `https://www.instagram.com/${usuario}/`,
    ]);
  }
  return '﻿' + filas.map(f => f.map(escaparCsv).join(',')).join('\r\n');
}

// El service worker no tiene URL.createObjectURL, así que va como data: URL
function csvADataUrl(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return 'data:text/csv;charset=utf-8;base64,' + btoa(binario);
}

function nombreArchivo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ig-seguidos/seguidos-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.csv`;
}

async function exportarSeguidos() {
  const state = await getState();
  const seguidos = state.seguidos || [];
  if (seguidos.length === 0) return { ok: false, error: 'No hay seguidos para exportar.' };

  const filename = nombreArchivo();
  const downloadId = await new Promise(resolve => {
    chrome.downloads.download({
      url: csvADataUrl(armarCsv(seguidos)),
      filename,
      saveAs: false,
    }, (id) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(id);
    });
  });

  if (!downloadId) return { ok: false, error: 'No se pudo guardar el archivo.' };

  notifyPopup({
    action: 'LOG',
    text: `💾 ${seguidos.length} seguidos guardados en Descargas/${filename}`,
    color: '#34c759',
  });

  // Solo se vacía después de que la descarga arrancó bien
  if (state.vaciarTrasExportar !== false) {
    await setState({ seguidos: [] });
    notifyPopup({ action: 'LOG', text: '🧹 Historial vaciado (ya quedó en el archivo).', color: '#8e8e93' });
  }

  return { ok: true, total: seguidos.length, filename };
}

// ── Notificar al popup si está abierto ───────────────────────────────────────

function notifyPopup(data) {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', ...data }).catch(() => {});
}

// ── Lógica principal del bot ─────────────────────────────────────────────────

async function procesarSiguiente() {
  const state = await getState();
  if (!state.running) return;
  if (state.lista.length === 0) {
    await setState({ running: false, usuarioActual: null, esperandoCargaHasta: 0 });
    await exportarSeguidos();
    notifyPopup({ action: 'FINISHED' });
    return;
  }

  const usuario = state.lista[0];
  await setState({ usuarioActual: usuario });
  notifyPopup({ action: 'PROCESSING', usuario });

  // Ordenar al content script que siga al usuario
  const res = await sendToContent({
    action: 'FOLLOW_USER',
    usuario,
    filtro: {
      activo: state.filtroActivo !== false,
      incluirInterior: state.filtroInterior === true,
      extra: state.filtroExtra || [],
      prohibidas: state.filtroProhibidas || [],
      edadActiva: state.edadActiva !== false,
      edadMin: state.edadMin || 18,
      edadMax: state.edadMax || 99,
      edadExigir: state.edadExigir === true,
      negocioActivo: state.negocioActivo !== false,
      negocioExtra: state.negocioExtra || [],
    },
  });

  const stateNow = await getState();
  const nuevaLista = stateNow.lista.slice(1);

  if (res.resultado === 'navegando') {
    const esperaNavegacionMs = 2500;
    await setState({
      esperandoCargaHasta: Date.now() + esperaNavegacionMs,
    });
    notifyPopup({ action: 'LOG', text: `📄 Abriendo @${usuario}. Esperando un momento...`, color: '#8e8e93' });
    chrome.alarms.clear('NEXT_FOLLOW');
    chrome.alarms.create('NEXT_FOLLOW', { delayInMinutes: esperaNavegacionMs / 60000 });
    return;
  }

  if (res.resultado === 'seguido') {
    await setState({
      lista: nuevaLista,
      seguidos: [...stateNow.seguidos, {
        usuario,
        fecha: new Date().toISOString(),
        motivo: res.motivo || '',
      }],
      totalProcesados: stateNow.totalProcesados + 1,
      esperandoCargaHasta: 0,
    });
    const pista = res.motivo ? ` (por "${res.motivo}")` : '';
    notifyPopup({ action: 'LOG', text: `✅ Seguido @${usuario}${pista}`, color: '#34c759' });
  } else if (res.resultado === 'saltado') {
    await setState({
      lista: nuevaLista,
      saltados: [...stateNow.saltados, usuario],
      totalProcesados: stateNow.totalProcesados + 1,
      esperandoCargaHasta: 0,
    });
    notifyPopup({ action: 'LOG', text: `⏭️ Saltado @${usuario}: ${res.razon || ''}`, color: '#ff9500' });
  } else if (res.resultado === 'revision') {
    await setState({
      lista: nuevaLista,
      revision: [...(stateNow.revision || []), usuario],
      totalProcesados: stateNow.totalProcesados + 1,
      esperandoCargaHasta: 0,
    });
    notifyPopup({ action: 'LOG', text: `👀 A revisión @${usuario}: ${res.razon || ''}`, color: '#5856d6' });
  } else {
    const detalle = res.error
      ? res.error
      : res.resultado
        ? `${res.resultado}${res.razon ? `: ${res.razon}` : ''}`
        : 'sin respuesta del perfil';
    await setState({
      lista: nuevaLista,
      errores: [...stateNow.errores, usuario],
      totalProcesados: stateNow.totalProcesados + 1,
      esperandoCargaHasta: 0,
    });
    notifyPopup({ action: 'LOG', text: `❌ Error @${usuario}: ${detalle}`, color: '#ff3b30' });
  }

  const stateAfter = await getState();
  if (!stateAfter.running || stateAfter.lista.length === 0) {
    if (stateAfter.lista.length === 0) {
      await setState({ running: false, usuarioActual: null, esperandoCargaHasta: 0 });
      await exportarSeguidos();
      notifyPopup({ action: 'FINISHED' });
    }
    return;
  }

  // Pausa aleatoria
  const minMs = (stateAfter.pausaMin || 20) * 1000;
  const maxMs = (stateAfter.pausaMax || 35) * 1000;
  const espera = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);

  notifyPopup({ action: 'LOG', text: `⏳ Esperando ${Math.round(espera/1000)}s...`, color: '#8e8e93' });

  // Programar siguiente con alarm (sobrevive recargas del service worker)
  chrome.alarms.create('NEXT_FOLLOW', { delayInMinutes: espera / 60000 });
}

// ── Listeners ────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'NEXT_FOLLOW') {
    const state = await getState();
    if (state.running) await procesarSiguiente();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // async
});

async function handleMessage(message, sender, sendResponse) {
  const state = await getState();

  switch (message.action) {

    case 'START': {
      if (state.running) { sendResponse({ ok: false, error: 'Ya está corriendo.' }); return; }
      const { lista, pausaMin, pausaMax, saltarYaSeguidos, filtro } = message;
      if (!lista || lista.length === 0) { sendResponse({ ok: false, error: 'Lista vacía.' }); return; }
      await setState({
        running: true,
        lista,
        listaOriginal: [...lista],
        seguidos: state.seguidos || [],
        saltados: [],
        errores: [],
        revision: state.revision || [],
        pausaMin: pausaMin || 20,
        pausaMax: pausaMax || 35,
        saltarYaSeguidos: saltarYaSeguidos !== false,
        filtroActivo: filtro ? filtro.activo !== false : state.filtroActivo !== false,
        filtroInterior: filtro ? filtro.incluirInterior === true : state.filtroInterior === true,
        filtroExtra: filtro ? (filtro.extra || []) : (state.filtroExtra || []),
        filtroProhibidas: filtro ? (filtro.prohibidas || []) : (state.filtroProhibidas || []),
        edadActiva: filtro ? filtro.edadActiva !== false : state.edadActiva !== false,
        edadMin: filtro ? (filtro.edadMin || 18) : (state.edadMin || 18),
        edadMax: filtro ? (filtro.edadMax || 99) : (state.edadMax || 99),
        edadExigir: filtro ? filtro.edadExigir === true : state.edadExigir === true,
        negocioActivo: filtro ? filtro.negocioActivo !== false : state.negocioActivo !== false,
        negocioExtra: filtro ? (filtro.negocioExtra || []) : (state.negocioExtra || []),
        totalProcesados: 0,
        usuarioActual: null,
        esperandoCargaHasta: 0,
      });
      sendResponse({ ok: true });
      await procesarSiguiente();
      break;
    }

    case 'STOP': {
      chrome.alarms.clear('NEXT_FOLLOW');
      await setState({ running: false, usuarioActual: null, esperandoCargaHasta: 0 });
      // Guardar lo hecho hasta acá: si no, se pierde al arrancar la próxima tanda
      await exportarSeguidos();
      sendResponse({ ok: true });
      break;
    }

    case 'EXPORT_SEGUIDOS': {
      sendResponse(await exportarSeguidos());
      break;
    }

    case 'GET_STATE': {
      sendResponse(state);
      break;
    }

    case 'SAVE_LISTA': {
      // Solo guarda la lista sin iniciar el bot
      const merged = mergeAndDedup([...(state.lista || []), ...(message.lista || [])]);
      await setState({ lista: merged });
      sendResponse({ ok: true, total: merged.length });
      break;
    }

    case 'CLEAR_LISTA': {
      await setState({ lista: [], listaOriginal: [], seguidos: [], saltados: [], errores: [], revision: [], totalProcesados: 0, esperandoCargaHasta: 0 });
      sendResponse({ ok: true });
      break;
    }

    case 'CLEAR_SEGUIDOS': {
      await setState({ seguidos: [] });
      sendResponse({ ok: true });
      break;
    }

    case 'CONTENT_READY': {
      // El content script avisó que cargó. Si el bot estaba corriendo, retomar.
      if (state.running && state.lista.length > 0) {
        const ahora = Date.now();
        if (state.esperandoCargaHasta && ahora < state.esperandoCargaHasta) {
          const restante = state.esperandoCargaHasta - ahora;
          if (restante > 800) {
            chrome.alarms.clear('NEXT_FOLLOW');
            chrome.alarms.create('NEXT_FOLLOW', { delayInMinutes: restante / 60000 });
            sendResponse({ ok: true, postponed: true });
            break;
          }
        }
        notifyPopup({ action: 'LOG', text: '🔄 Página recargada. Reanudando...', color: '#ffcc00' });
        chrome.alarms.clear('NEXT_FOLLOW');
        setTimeout(() => procesarSiguiente(), 1000);
      }
      sendResponse({ ok: true });
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Acción desconocida' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeAndDedup(arr) {
  return [...new Set(arr.map(u => u.toLowerCase().trim()).filter(Boolean))];
}

// Arrancar al instalar / actualizar
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clear('NEXT_FOLLOW');
  getState().then(state => {
    if (state.running) {
      setState({ running: false });
    }
  });
});
