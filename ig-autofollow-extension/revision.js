// =========================================================================
// revision.js — Pantalla de revisión perfil por perfil
// Corre en su propia pestaña: el popup se cierra al hacer click afuera y
// no sirve para un flujo de revisión largo.
// =========================================================================

const $ = (id) => document.getElementById(id);

function sendBg(action, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...payload }, (res) => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: chrome.runtime.lastError.message });
      }
      resolve(res || { ok: false, error: 'Sin respuesta' });
    });
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function miles(n) {
  if (n == null) return '—';
  return n.toLocaleString('es-AR');
}

// ── Estado de la sesión de revisión ──────────────────────────────────────

let pendientes = [];      // usernames por revisar
let indice = 0;           // posición actual
let total = 0;            // cuántos había al abrir
let perfilActual = null;  // datos del perfil en pantalla
let cache = new Map();    // username -> resultado de PERFIL_INFO
let ocupado = false;      // evita doble click / doble atajo

// ── Avisos ───────────────────────────────────────────────────────────────

function mostrarAviso(html, esError) {
  $('avisoBox').innerHTML = `<div class="aviso${esError ? ' error' : ''}">${html}</div>`;
}

function limpiarAviso() {
  $('avisoBox').innerHTML = '';
}

// ── Carga de datos ───────────────────────────────────────────────────────

async function pedirPerfil(usuario) {
  if (!usuario) return null;
  if (cache.has(usuario)) return cache.get(usuario);
  const res = await sendBg('PERFIL_INFO', { usuario });
  cache.set(usuario, res);
  return res;
}

// Trae el siguiente en segundo plano para que la próxima tarjeta sea instantánea
function precargarSiguiente() {
  const siguiente = pendientes[indice + 1];
  if (siguiente && !cache.has(siguiente)) {
    setTimeout(() => pedirPerfil(siguiente), 900);
  }
}

// ── Render ───────────────────────────────────────────────────────────────

function actualizarContador() {
  $('contador').textContent = total === 0 ? '—' : `${Math.min(indice + 1, total)} de ${total}`;
  $('progreso').style.width = total === 0 ? '0%' : `${(indice / total) * 100}%`;
}

function mostrarEstado(icono, titulo, detalle) {
  $('contenido').innerHTML = `
    <div class="estado">
      <span class="icono">${icono}</span>
      <b>${titulo}</b>
      ${detalle ? `<div style="margin-top:8px">${detalle}</div>` : ''}
    </div>`;
  $('acciones').hidden = true;
  $('atajos').hidden = true;
}

function mostrarCargando(usuario) {
  $('contenido').innerHTML = `
    <div class="estado">
      <div class="spinner"></div>
      Cargando <b>@${esc(usuario)}</b>…
    </div>`;
  $('acciones').hidden = true;
  $('atajos').hidden = true;
}

function badgesDe(p) {
  const out = [];
  if (p.privado) out.push('<span class="badge badge-privado">🔒 Privado</span>');
  if (p.verificado) out.push('<span class="badge badge-verif">✔ Verificado</span>');
  if (p.yaLoSigo) out.push('<span class="badge badge-sigo">Ya lo seguís</span>');
  if (p.solicitado) out.push('<span class="badge badge-sigo">Solicitud enviada</span>');

  const a = p.analisis || {};
  if (a.cordoba?.estado === 'negocio') {
    out.push(`<span class="badge badge-alerta">Negocio: ${esc(a.cordoba.termino)}</span>`);
  } else if (a.cordoba?.estado === 'cordoba') {
    out.push(`<span class="badge badge-ok">Zona: ${esc(a.cordoba.termino)}</span>`);
  }
  if (a.edad?.estado === 'secundario') {
    out.push(`<span class="badge badge-alerta">Secundario: ${esc(a.edad.detalle)}</span>`);
  } else if (a.edad?.edad) {
    out.push(`<span class="badge badge-ok">~${a.edad.edad} años</span>`);
  }
  return out.join('');
}

function render(p) {
  const perfilUrl = `https://www.instagram.com/${encodeURIComponent(p.usuario)}/`;

  const grilla = p.posts.length > 0
    ? `<div class="grilla">${p.posts.map(f => `
        <div class="foto-wrap" data-grande="${esc(f.imagen)}">
          <img src="${esc(f.imagen)}" alt="" loading="lazy" referrerpolicy="no-referrer">
          ${f.esVideo ? '<span class="foto-video">▶</span>' : ''}
        </div>`).join('')}</div>`
    : `<div class="sin-fotos">${p.privado
        ? '🔒 La cuenta es privada: no se pueden ver las publicaciones sin seguirla.'
        : 'Esta cuenta no tiene publicaciones visibles.'}</div>`;

  $('contenido').innerHTML = `
    <div class="card" id="card">
      <div class="card-header">
        <img class="avatar" src="${esc(p.fotoPerfil)}" alt="" referrerpolicy="no-referrer"
             data-grande="${esc(p.fotoPerfil)}">
        <div class="ident">
          <div class="nombre">${esc(p.nombre || p.usuario)}</div>
          <a class="usuario" href="${esc(perfilUrl)}" target="_blank" rel="noreferrer">@${esc(p.usuario)}</a>
          <div class="badges">${badgesDe(p)}</div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-cell"><b>${miles(p.publicaciones)}</b><span>Posts</span></div>
        <div class="stat-cell"><b>${miles(p.seguidores)}</b><span>Seguidores</span></div>
        <div class="stat-cell"><b>${miles(p.siguiendo)}</b><span>Siguiendo</span></div>
      </div>

      <div class="bio">${p.bio ? esc(p.bio) : '<span class="bio-vacia">Sin biografía.</span>'}</div>
      ${p.enlaceExterno ? `<a class="link-externo" href="${esc(p.enlaceExterno)}" target="_blank" rel="noreferrer">🔗 ${esc(p.enlaceExterno)}</a>` : ''}

      ${grilla}

      <a class="ver-mas" href="${esc(perfilUrl)}" target="_blank" rel="noreferrer">
        Abrir y ver más en Instagram ↗
      </a>
    </div>`;

  $('acciones').hidden = false;
  $('atajos').hidden = false;
  $('btnDescartar').disabled = false;
  $('btnSeguir').disabled = !!p.yaLoSigo;
  $('btnSeguir').querySelector('span').textContent = p.yaLoSigo ? '✓ Ya lo seguís' : '✓ Seguir';

  // Click en cualquier foto para verla grande
  document.querySelectorAll('[data-grande]').forEach(el => {
    el.addEventListener('click', () => abrirLightbox(el.dataset.grande));
  });

  document.querySelectorAll('.card img').forEach(rescatarSiFalla);
}

// Si el CDN de Instagram rechaza la carga directa, se pide la imagen al
// background, que la trae como data URL.
function rescatarSiFalla(img) {
  img.addEventListener('error', async () => {
    const url = img.getAttribute('src') || '';
    if (!url || url.startsWith('data:') || img.dataset.rescatada) return;
    img.dataset.rescatada = '1';

    const res = await sendBg('FETCH_IMAGEN', { url });
    if (res.ok && res.dataUrl) {
      img.src = res.dataUrl;
      const wrap = img.closest('[data-grande]');
      if (wrap) wrap.dataset.grande = res.dataUrl;
    } else {
      img.alt = 'No se pudo cargar';
      img.style.opacity = '0.25';
    }
  }, { once: true });
}

// ── Lightbox ─────────────────────────────────────────────────────────────

function abrirLightbox(url) {
  if (!url) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `
    <button class="lightbox-cerrar" title="Cerrar">✕</button>
    <img src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
  rescatarSiFalla(box.querySelector('img'));
}

function cerrarLightbox() {
  const box = document.querySelector('.lightbox');
  if (box) { box.remove(); return true; }
  return false;
}

// ── Avance ───────────────────────────────────────────────────────────────

async function mostrarActual() {
  limpiarAviso();
  actualizarContador();

  if (indice >= pendientes.length) {
    perfilActual = null;
    mostrarEstado('🎉', 'No queda nadie por revisar',
      total > 0 ? `Revisaste ${total} ${total === 1 ? 'perfil' : 'perfiles'}.` : '');
    return;
  }

  const usuario = pendientes[indice];
  mostrarCargando(usuario);

  const res = await pedirPerfil(usuario);

  // Puede haber cambiado de tarjeta mientras cargaba
  if (pendientes[indice] !== usuario) return;

  if (!res || !res.ok) {
    const motivo = res?.error || 'No se pudo cargar el perfil';
    perfilActual = { usuario, id: null, soloNombre: true };

    mostrarEstado('⚠️', `@${esc(usuario)}`,
      `${esc(motivo)}<br><br>
       <a href="https://www.instagram.com/${encodeURIComponent(usuario)}/" target="_blank"
          rel="noreferrer" style="color:#4aa8ff">Abrir el perfil en Instagram ↗</a>`);

    // Igual se puede descartar o intentar seguir a mano
    $('acciones').hidden = false;
    $('atajos').hidden = false;
    $('btnDescartar').disabled = false;
    $('btnSeguir').disabled = false;
    $('btnSeguir').querySelector('span').textContent = '✓ Seguir';
    return;
  }

  perfilActual = res.perfil;
  render(res.perfil);
  precargarSiguiente();
}

function animarSalida(haciaDerecha) {
  const card = $('card');
  if (card) card.classList.add(haciaDerecha ? 'sale-der' : 'sale-izq');
  return new Promise(r => setTimeout(r, card ? 200 : 0));
}

async function descartar() {
  if (ocupado || !perfilActual) return;
  ocupado = true;
  $('btnDescartar').disabled = true;
  $('btnSeguir').disabled = true;

  const usuario = perfilActual.usuario;
  await animarSalida(false);
  const res = await sendBg('REVISION_DESCARTAR', { usuario });

  if (!res.ok) {
    mostrarAviso(`No se pudo descartar a @${esc(usuario)}: ${esc(res.error || '')}`, true);
    ocupado = false;
    return;
  }

  cache.delete(usuario);
  indice++;
  ocupado = false;
  await mostrarActual();
}

async function seguir() {
  if (ocupado || !perfilActual) return;
  ocupado = true;
  $('btnDescartar').disabled = true;
  $('btnSeguir').disabled = true;
  $('btnSeguir').querySelector('span').textContent = 'Siguiendo…';

  const usuario = perfilActual.usuario;
  const userId = perfilActual.id;
  const res = await sendBg('REVISION_SEGUIR', { usuario, userId });

  if (!res.ok) {
    mostrarAviso(`No se pudo seguir a @${esc(usuario)}: ${esc(res.error || '')}`, true);
    $('btnDescartar').disabled = false;
    $('btnSeguir').disabled = false;
    $('btnSeguir').querySelector('span').textContent = '✓ Seguir';
    ocupado = false;
    return;
  }

  await animarSalida(true);
  cache.delete(usuario);
  indice++;
  ocupado = false;
  await mostrarActual();

  if (res.solicitado) {
    mostrarAviso(`🔒 @${esc(usuario)} es privado: se envió la solicitud.`, false);
  }
}

function abrirEnInstagram() {
  if (!perfilActual) return;
  window.open(`https://www.instagram.com/${encodeURIComponent(perfilActual.usuario)}/`, '_blank', 'noreferrer');
}

// ── Eventos ──────────────────────────────────────────────────────────────

$('btnDescartar').addEventListener('click', descartar);
$('btnSeguir').addEventListener('click', seguir);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { cerrarLightbox(); return; }
  if (document.querySelector('.lightbox')) return;

  if (e.key === 'ArrowLeft')  { e.preventDefault(); descartar(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); seguir(); }
  if (e.key === ' ')          { e.preventDefault(); abrirEnInstagram(); }
});

// ── Arranque ─────────────────────────────────────────────────────────────

async function iniciar() {
  mostrarEstado('⏳', 'Cargando la lista…');

  // Necesita una pestaña de Instagram abierta: de ahí salen los datos
  const tabs = await new Promise(resolve => {
    chrome.tabs.query({ url: 'https://www.instagram.com/*' }, resolve);
  });

  if (!tabs || tabs.length === 0) {
    mostrarEstado('📵', 'Abrí Instagram primero',
      'Esta pantalla lee los perfiles desde una pestaña de Instagram con tu sesión.<br><br>' +
      '<a href="https://www.instagram.com/" target="_blank" rel="noreferrer" style="color:#4aa8ff">' +
      'Abrir instagram.com ↗</a><br><br>Después recargá esta página.');
    return;
  }

  const res = await sendBg('REVISION_LISTA');
  pendientes = (res.revision || []).slice();
  total = pendientes.length;
  indice = 0;

  if (total === 0) {
    mostrarEstado('📭', 'No hay perfiles en revisión',
      'Cuando el bot encuentre perfiles sin señales claras de tu zona, van a aparecer acá.');
    return;
  }

  await mostrarActual();
}

iniciar();
