// =========================================================================
// revision-ui.js — La tarjeta de revisión, compartida
// =========================================================================
// La misma pantalla se monta en tres lugares:
//   1. revision.html  → pestaña completa
//   2. popup.html     → panel dentro del popup de la extensión
//   3. content.js     → panel flotante arriba de instagram.com
// Cada contexto solo cambia el transporte (de dónde salen los datos), el
// tamaño y qué hace al abrir un perfil. La lógica vive acá una sola vez.
// =========================================================================

(function () {
  if (window.AFRevision) return;

  // ── Estilos ────────────────────────────────────────────────────────────
  // Todo cuelga de .af-rev para no pisar los estilos de Instagram.

  const CSS = [
    '.af-rev, .af-rev *, .af-rev *::before, .af-rev *::after {',
    '  box-sizing: border-box; margin: 0; padding: 0;',
    '}',
    '.af-rev [hidden] { display: none !important; }',
    '.af-rev {',
    '  width: 100%; color: #f0f0f0; font-size: 14px; line-height: 1.45; text-align: left;',
    '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    '}',
    '.af-rev button { font: inherit; color: inherit; }',
    '.af-rev a { color: #4aa8ff; }',
    '.af-rev--tab { max-width: 440px; margin: 0 auto; }',
    '.af-rev--popup { font-size: 12.5px; }',

    /* ── Barra superior ── */
    '.af-rev .af-topbar {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  gap: 8px; margin-bottom: 10px;',
    '}',
    '.af-rev .af-topbar-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 7px; }',
    '.af-rev .af-topbar-der { display: flex; align-items: center; gap: 6px; }',
    '.af-rev .af-contador {',
    '  font-size: 11px; color: #8e8e93; white-space: nowrap;',
    '  background: #1a1a1d; border: 1px solid #2a2a2e; border-radius: 20px; padding: 3px 10px;',
    '}',
    '.af-rev .af-icono {',
    '  background: #1a1a1d; border: 1px solid #2a2a2e; border-radius: 8px;',
    '  color: #8e8e93; cursor: pointer; font-size: 13px; line-height: 1; padding: 5px 8px;',
    '}',
    '.af-rev .af-icono:hover { color: #fff; border-color: #3a3a42; }',
    '.af-rev .af-barra { height: 3px; background: #1f1f23; border-radius: 3px; overflow: hidden; margin-bottom: 12px; }',
    '.af-rev .af-barra-fill {',
    '  height: 100%; width: 0%; transition: width 0.3s ease;',
    '  background: linear-gradient(90deg, #5856d6, #0a84ff);',
    '}',

    /* ── Tarjeta ── */
    '.af-rev .af-card {',
    '  background: #15151a; border: 1px solid #26262c; border-radius: 16px; overflow: hidden;',
    '  transition: transform 0.22s ease, opacity 0.22s ease;',
    '}',
    '.af-rev .af-card.sale-izq { transform: translateX(-120%) rotate(-8deg); opacity: 0; }',
    '.af-rev .af-card.sale-der { transform: translateX(120%) rotate(8deg); opacity: 0; }',
    '.af-rev .af-card-header { padding: 16px 16px 12px; display: flex; gap: 13px; align-items: flex-start; }',
    '.af-rev--popup .af-card-header { padding: 12px 12px 10px; gap: 10px; }',
    '.af-rev .af-avatar {',
    '  width: 70px; height: 70px; border-radius: 50%; object-fit: cover;',
    '  background: #26262c; border: 2px solid #3a3a42; flex-shrink: 0; cursor: pointer;',
    '}',
    '.af-rev--popup .af-avatar { width: 54px; height: 54px; }',
    '.af-rev .af-avatar:hover { border-color: #0a84ff; }',
    '.af-rev .af-ident { flex: 1; min-width: 0; }',
    '.af-rev .af-nombre { font-size: 16px; font-weight: 700; word-break: break-word; }',
    '.af-rev--popup .af-nombre { font-size: 14px; }',
    '.af-rev .af-usuario {',
    '  font-size: 12.5px; color: #0a84ff; text-decoration: none; cursor: pointer;',
    '  font-family: ui-monospace, monospace; word-break: break-all;',
    '}',
    '.af-rev .af-usuario:hover { text-decoration: underline; }',
    '.af-rev .af-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }',
    '.af-rev .af-badge {',
    '  font-size: 10px; font-weight: 600; border-radius: 5px; padding: 2px 7px;',
    '  text-transform: uppercase; letter-spacing: 0.4px;',
    '}',
    '.af-rev .af-badge-privado { background: #4a2a00; color: #ffb340; }',
    '.af-rev .af-badge-verif   { background: #00345a; color: #4aa8ff; }',
    '.af-rev .af-badge-sigo    { background: #0a3d1a; color: #4ade80; }',
    '.af-rev .af-badge-ok      { background: #1f1b4d; color: #a5a3ff; }',
    '.af-rev .af-badge-alerta  { background: #4a0f0f; color: #ff8a80; }',
    '.af-rev .af-stats { display: flex; border-top: 1px solid #26262c; border-bottom: 1px solid #26262c; }',
    '.af-rev .af-stat { flex: 1; text-align: center; padding: 9px 4px; }',
    '.af-rev .af-stat + .af-stat { border-left: 1px solid #26262c; }',
    '.af-rev .af-stat b { display: block; font-size: 14px; }',
    '.af-rev .af-stat span { font-size: 9.5px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.5px; }',
    '.af-rev .af-bio {',
    '  padding: 13px 16px; font-size: 12.5px; line-height: 1.6; color: #d8d8dc;',
    '  white-space: pre-wrap; word-break: break-word; max-height: 150px; overflow-y: auto;',
    '}',
    '.af-rev--popup .af-bio { padding: 11px 12px; max-height: 110px; }',
    '.af-rev .af-bio-vacia { color: #5a5a60; font-style: italic; }',
    '.af-rev .af-link-externo {',
    '  display: block; padding: 0 16px 11px; font-size: 11.5px;',
    '  color: #4aa8ff; text-decoration: none; word-break: break-all;',
    '}',
    '.af-rev .af-link-externo:hover { text-decoration: underline; }',

    /* ── Grilla de fotos ── */
    '.af-rev .af-grilla { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; background: #0c0c0e; }',
    '.af-rev .af-foto { position: relative; aspect-ratio: 1; overflow: hidden; cursor: pointer; background: #1f1f23; }',
    '.af-rev .af-foto img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s ease; }',
    '.af-rev .af-foto:hover img { transform: scale(1.06); }',
    '.af-rev .af-foto-video { position: absolute; top: 5px; right: 5px; font-size: 10px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }',
    '.af-rev .af-sin-fotos {',
    '  padding: 24px 16px; text-align: center; color: #6e6e73;',
    '  font-size: 11.5px; line-height: 1.6; background: #101014;',
    '}',
    '.af-rev .af-ver-mas {',
    '  display: block; width: 100%; text-align: center; padding: 12px; background: #1c1c22;',
    '  color: #4aa8ff; font-size: 12.5px; font-weight: 600; text-decoration: none;',
    '  border: none; border-top: 1px solid #26262c; cursor: pointer;',
    '}',
    '.af-rev .af-ver-mas:hover { background: #24242c; }',

    /* ── Botones de acción ── */
    '.af-rev .af-acciones { display: flex; gap: 10px; margin-top: 14px; }',
    '.af-rev .af-btn {',
    '  flex: 1; padding: 15px; border: none; border-radius: 13px;',
    '  font-size: 14px; font-weight: 700; cursor: pointer; color: #fff;',
    '  display: flex; align-items: center; justify-content: center; gap: 7px;',
    '  transition: filter 0.15s, transform 0.1s;',
    '}',
    '.af-rev--popup .af-btn { padding: 12px; font-size: 13px; border-radius: 11px; }',
    '.af-rev .af-btn:hover:not(:disabled) { filter: brightness(1.15); }',
    '.af-rev .af-btn:active:not(:disabled) { transform: scale(0.97); }',
    '.af-rev .af-btn:disabled { opacity: 0.45; cursor: default; }',
    '.af-rev .af-btn-descartar { background: #d62f26; }',
    '.af-rev .af-btn-seguir { background: #1a9e42; }',
    /* En el popup y en el panel de Instagram la tarjeta no entra entera:
       los botones quedan pegados abajo para no tener que scrollear. */
    '.af-rev--popup .af-acciones, .af-rev--overlay .af-acciones {',
    '  position: sticky; bottom: 0; z-index: 2; padding: 10px 0 4px;',
    '}',
    '.af-rev--popup .af-acciones { background: #111; }',
    '.af-rev--overlay .af-acciones { background: #0c0c0e; }',
    '.af-rev .af-atajos { margin-top: 12px; font-size: 10.5px; color: #5a5a60; text-align: center; line-height: 1.7; }',
    '.af-rev kbd {',
    '  background: #1f1f23; border: 1px solid #33333a; border-bottom-width: 2px;',
    '  border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, monospace;',
    '  font-size: 10px; color: #a0a0a8;',
    '}',

    /* ── Estados ── */
    '.af-rev .af-estado { text-align: center; padding: 42px 20px; color: #8e8e93; font-size: 13px; line-height: 1.7; }',
    '.af-rev--popup .af-estado { padding: 30px 14px; font-size: 12px; }',
    '.af-rev .af-estado .af-ico { font-size: 40px; display: block; margin-bottom: 12px; }',
    '.af-rev .af-estado b { color: #f0f0f0; }',
    '.af-rev .af-aviso {',
    '  background: #2a1a00; border: 1px solid #5a3c00; color: #e0a800; border-radius: 10px;',
    '  padding: 10px 13px; font-size: 11.5px; line-height: 1.6; margin-bottom: 12px;',
    '}',
    '.af-rev .af-aviso.error { background: #2a0d0d; border-color: #5a1a1a; color: #ff8a80; }',
    '.af-rev .af-aviso a { color: inherit; font-weight: 600; }',
    '.af-rev .af-spinner {',
    '  width: 24px; height: 24px; border: 3px solid #26262c; border-top-color: #0a84ff;',
    '  border-radius: 50%; animation: af-girar 0.8s linear infinite; margin: 0 auto 12px;',
    '}',
    '@keyframes af-girar { to { transform: rotate(360deg); } }',

    /* ── Foto ampliada ── */
    '.af-rev .af-lightbox {',
    '  position: fixed; inset: 0; background: rgba(0,0,0,0.93);',
    '  display: flex; align-items: center; justify-content: center;',
    '  z-index: 2147483001; cursor: zoom-out; padding: 24px;',
    '}',
    '.af-rev .af-lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; object-fit: contain; }',
    '.af-rev .af-lightbox-cerrar {',
    '  position: absolute; top: 14px; right: 18px; font-size: 24px; color: #fff;',
    '  background: none; border: none; cursor: pointer; line-height: 1;',
    '}',
  ].join('\n');

  const PLANTILLA = [
    '<div class="af-topbar">',
    '  <div class="af-topbar-title"><span>👀</span><span>Revisión de perfiles</span></div>',
    '  <div class="af-topbar-der">',
    '    <div class="af-contador" data-rol="contador">—</div>',
    '    <button class="af-icono" data-rol="cerrar" title="Cerrar" hidden>✕</button>',
    '  </div>',
    '</div>',
    '<div class="af-barra"><div class="af-barra-fill" data-rol="progreso"></div></div>',
    '<div data-rol="aviso"></div>',
    '<div data-rol="contenido"></div>',
    '<div class="af-acciones" data-rol="acciones" hidden>',
    '  <button class="af-btn af-btn-descartar" data-rol="btnDescartar"><span>✕ Descartar</span></button>',
    '  <button class="af-btn af-btn-seguir" data-rol="btnSeguir"><span>✓ Seguir</span></button>',
    '</div>',
    '<div class="af-atajos" data-rol="atajos" hidden>',
    '  <kbd>←</kbd> descartar &nbsp;·&nbsp; <kbd>→</kbd> seguir &nbsp;·&nbsp; <kbd>espacio</kbd> abrir en Instagram',
    '</div>',
  ].join('\n');

  // ── Utilidades ─────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function miles(n) {
    if (n == null) return '—';
    try { return n.toLocaleString('es-AR'); } catch (e) { return String(n); }
  }

  function urlPerfil(usuario) {
    return 'https://www.instagram.com/' + encodeURIComponent(usuario) + '/';
  }

  function inyectarEstilos(destino) {
    if (!destino) return;

    // Dentro de Instagram la hoja va como stylesheet construida: no depende de
    // que la CSP del sitio permita etiquetas <style> inyectadas.
    if (destino.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
      try {
        if (destino.adoptedStyleSheets.some(h => h.afRevision)) return;
        const hoja = new CSSStyleSheet();
        hoja.replaceSync(CSS);
        hoja.afRevision = true;
        destino.adoptedStyleSheets = destino.adoptedStyleSheets.concat(hoja);
        return;
      } catch (e) {
        // Si no se puede, sigue el camino de siempre
      }
    }

    if (destino.querySelector('style[data-af-rev]')) return;
    const doc = destino.ownerDocument || document;
    const style = doc.createElement('style');
    style.setAttribute('data-af-rev', '1');
    style.textContent = CSS;
    destino.appendChild(style);
  }

  // ── Montaje ────────────────────────────────────────────────────────────
  // Devuelve un controlador: { iniciar, destruir, raiz }

  function montar(opciones) {
    const contenedor = opciones.contenedor;
    const enviar = opciones.enviar;
    const modo = opciones.modo || 'tab';
    const abrirUrl = opciones.abrirUrl || ((url) => window.open(url, '_blank', 'noreferrer'));
    const comprobarSesion = opciones.comprobarSesion || null;
    const alCerrar = opciones.alCerrar || null;
    const alCambiarPendientes = opciones.alCambiarPendientes || null;

    const doc = contenedor.ownerDocument || document;
    const raizEstilos = opciones.raizEstilos
      || (contenedor.getRootNode && contenedor.getRootNode() !== doc
            ? contenedor.getRootNode()
            : doc.head);
    inyectarEstilos(raizEstilos);

    const raiz = doc.createElement('div');
    raiz.className = 'af-rev af-rev--' + modo;
    raiz.innerHTML = PLANTILLA;
    contenedor.textContent = '';
    contenedor.appendChild(raiz);

    const el = (rol) => raiz.querySelector('[data-rol="' + rol + '"]');

    // Estado de esta sesión de revisión
    let pendientes = [];
    let indice = 0;
    let total = 0;
    let perfilActual = null;
    let cache = new Map();
    let ocupado = false;
    let destruido = false;

    // ── Avisos ───────────────────────────────────────────────────────────

    function mostrarAviso(html, esError) {
      el('aviso').innerHTML = '<div class="af-aviso' + (esError ? ' error' : '') + '">' + html + '</div>';
    }

    function limpiarAviso() { el('aviso').innerHTML = ''; }

    // ── Datos ────────────────────────────────────────────────────────────

    async function pedirPerfil(usuario) {
      if (!usuario) return null;
      if (cache.has(usuario)) return cache.get(usuario);
      const res = await enviar('PERFIL_INFO', { usuario });
      cache.set(usuario, res);
      return res;
    }

    // Trae el siguiente en segundo plano para que la próxima tarjeta sea instantánea
    function precargarSiguiente() {
      const siguiente = pendientes[indice + 1];
      if (siguiente && !cache.has(siguiente)) {
        setTimeout(() => { if (!destruido) pedirPerfil(siguiente); }, 900);
      }
    }

    // ── Render ───────────────────────────────────────────────────────────

    function actualizarContador() {
      el('contador').textContent = total === 0 ? '—' : (Math.min(indice + 1, total) + ' de ' + total);
      el('progreso').style.width = total === 0 ? '0%' : ((indice / total) * 100) + '%';
      if (alCambiarPendientes) alCambiarPendientes(Math.max(0, pendientes.length - indice));
    }

    function mostrarEstado(icono, titulo, detalle) {
      el('contenido').innerHTML =
        '<div class="af-estado"><span class="af-ico">' + icono + '</span><b>' + titulo + '</b>' +
        (detalle ? '<div style="margin-top:8px">' + detalle + '</div>' : '') + '</div>';
      el('acciones').hidden = true;
      el('atajos').hidden = true;
    }

    function mostrarCargando(usuario) {
      el('contenido').innerHTML =
        '<div class="af-estado"><div class="af-spinner"></div>Cargando <b>@' + esc(usuario) + '</b>…</div>';
      el('acciones').hidden = true;
      el('atajos').hidden = true;
    }

    function badgesDe(p) {
      const out = [];
      if (p.privado) out.push('<span class="af-badge af-badge-privado">🔒 Privado</span>');
      if (p.verificado) out.push('<span class="af-badge af-badge-verif">✔ Verificado</span>');
      if (p.yaLoSigo) out.push('<span class="af-badge af-badge-sigo">Ya lo seguís</span>');
      if (p.solicitado) out.push('<span class="af-badge af-badge-sigo">Solicitud enviada</span>');

      const a = p.analisis || {};
      const zona = a.cordoba || {};
      if (zona.estado === 'negocio') {
        out.push('<span class="af-badge af-badge-alerta">Negocio: ' + esc(zona.termino) + '</span>');
      } else if (zona.estado === 'cordoba') {
        out.push('<span class="af-badge af-badge-ok">Zona: ' + esc(zona.termino) + '</span>');
      }
      const edad = a.edad || {};
      if (edad.estado === 'secundario') {
        out.push('<span class="af-badge af-badge-alerta">Secundario: ' + esc(edad.detalle) + '</span>');
      } else if (edad.edad) {
        out.push('<span class="af-badge af-badge-ok">~' + edad.edad + ' años</span>');
      }
      return out.join('');
    }

    function render(p) {
      const posts = p.posts || [];
      const grilla = posts.length > 0
        ? '<div class="af-grilla">' + posts.map(f =>
            '<div class="af-foto" data-grande="' + esc(f.imagen) + '">' +
            '<img src="' + esc(f.imagen) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            (f.esVideo ? '<span class="af-foto-video">▶</span>' : '') +
            '</div>').join('') + '</div>'
        : '<div class="af-sin-fotos">' + (p.privado
            ? '🔒 La cuenta es privada: no se pueden ver las publicaciones sin seguirla.'
            : 'Esta cuenta no tiene publicaciones visibles.') + '</div>';

      el('contenido').innerHTML =
        '<div class="af-card" data-rol="card">' +
          '<div class="af-card-header">' +
            '<img class="af-avatar" src="' + esc(p.fotoPerfil) + '" alt="" referrerpolicy="no-referrer" data-grande="' + esc(p.fotoPerfil) + '">' +
            '<div class="af-ident">' +
              '<div class="af-nombre">' + esc(p.nombre || p.usuario) + '</div>' +
              '<a class="af-usuario" data-perfil="1" href="' + esc(urlPerfil(p.usuario)) + '">@' + esc(p.usuario) + '</a>' +
              '<div class="af-badges">' + badgesDe(p) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="af-stats">' +
            '<div class="af-stat"><b>' + miles(p.publicaciones) + '</b><span>Posts</span></div>' +
            '<div class="af-stat"><b>' + miles(p.seguidores) + '</b><span>Seguidores</span></div>' +
            '<div class="af-stat"><b>' + miles(p.siguiendo) + '</b><span>Siguiendo</span></div>' +
          '</div>' +
          '<div class="af-bio">' + (p.bio ? esc(p.bio) : '<span class="af-bio-vacia">Sin biografía.</span>') + '</div>' +
          (p.enlaceExterno
            ? '<a class="af-link-externo" href="' + esc(p.enlaceExterno) + '" target="_blank" rel="noreferrer">🔗 ' + esc(p.enlaceExterno) + '</a>'
            : '') +
          grilla +
          '<button class="af-ver-mas" data-perfil="1">Abrir y ver más en Instagram ↗</button>' +
        '</div>';

      el('acciones').hidden = false;
      el('atajos').hidden = false;
      el('btnDescartar').disabled = false;
      el('btnSeguir').disabled = !!p.yaLoSigo;
      el('btnSeguir').querySelector('span').textContent = p.yaLoSigo ? '✓ Ya lo seguís' : '✓ Seguir';

      raiz.querySelectorAll('[data-grande]').forEach(nodo => {
        nodo.addEventListener('click', () => abrirLightbox(nodo.dataset.grande));
      });
      raiz.querySelectorAll('.af-card img').forEach(rescatarSiFalla);
    }

    // Si el CDN de Instagram rechaza la carga directa, se pide la imagen al
    // background, que la trae y la devuelve como data URL.
    function rescatarSiFalla(img) {
      img.addEventListener('error', async () => {
        const url = img.getAttribute('src') || '';
        if (!url || url.startsWith('data:') || img.dataset.rescatada) return;
        img.dataset.rescatada = '1';

        const res = await enviar('FETCH_IMAGEN', { url });
        if (res && res.ok && res.dataUrl) {
          img.src = res.dataUrl;
          const wrap = img.closest('[data-grande]');
          if (wrap) wrap.dataset.grande = res.dataUrl;
        } else {
          img.alt = 'No se pudo cargar';
          img.style.opacity = '0.25';
        }
      }, { once: true });
    }

    // ── Foto ampliada ────────────────────────────────────────────────────

    function abrirLightbox(url) {
      if (!url) return;
      const box = doc.createElement('div');
      box.className = 'af-lightbox';
      box.innerHTML =
        '<button class="af-lightbox-cerrar" title="Cerrar">✕</button>' +
        '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer">';
      box.addEventListener('click', () => box.remove());
      raiz.appendChild(box);
      rescatarSiFalla(box.querySelector('img'));
    }

    function cerrarLightbox() {
      const box = raiz.querySelector('.af-lightbox');
      if (box) { box.remove(); return true; }
      return false;
    }

    // ── Avance ───────────────────────────────────────────────────────────

    async function mostrarActual() {
      limpiarAviso();
      actualizarContador();

      if (indice >= pendientes.length) {
        perfilActual = null;
        mostrarEstado('🎉', 'No queda nadie por revisar',
          total > 0 ? 'Revisaste ' + total + (total === 1 ? ' perfil.' : ' perfiles.') : '');
        return;
      }

      const usuario = pendientes[indice];
      mostrarCargando(usuario);

      const res = await pedirPerfil(usuario);
      if (destruido) return;
      // Puede haber cambiado de tarjeta mientras cargaba
      if (pendientes[indice] !== usuario) return;

      if (!res || !res.ok) {
        const motivo = (res && res.error) || 'No se pudo cargar el perfil';
        perfilActual = { usuario, id: null, soloNombre: true };

        mostrarEstado('⚠️', '@' + esc(usuario),
          esc(motivo) + '<br><br><a data-perfil="1" href="' + esc(urlPerfil(usuario)) + '">' +
          'Abrir el perfil en Instagram ↗</a>');

        // Igual se puede descartar o intentar seguir a mano
        el('acciones').hidden = false;
        el('atajos').hidden = false;
        el('btnDescartar').disabled = false;
        el('btnSeguir').disabled = false;
        el('btnSeguir').querySelector('span').textContent = '✓ Seguir';
        return;
      }

      perfilActual = res.perfil;
      render(res.perfil);
      precargarSiguiente();
    }

    function animarSalida(haciaDerecha) {
      const card = el('card');
      if (card) card.classList.add(haciaDerecha ? 'sale-der' : 'sale-izq');
      return new Promise(r => setTimeout(r, card ? 200 : 0));
    }

    async function descartar() {
      if (ocupado || !perfilActual) return;
      ocupado = true;
      el('btnDescartar').disabled = true;
      el('btnSeguir').disabled = true;

      const usuario = perfilActual.usuario;
      await animarSalida(false);
      const res = await enviar('REVISION_DESCARTAR', { usuario });
      if (destruido) return;

      if (!res || !res.ok) {
        mostrarAviso('No se pudo descartar a @' + esc(usuario) + ': ' + esc((res && res.error) || ''), true);
        el('btnDescartar').disabled = false;
        el('btnSeguir').disabled = false;
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
      el('btnDescartar').disabled = true;
      el('btnSeguir').disabled = true;
      el('btnSeguir').querySelector('span').textContent = 'Siguiendo…';

      const usuario = perfilActual.usuario;
      const userId = perfilActual.id;
      const res = await enviar('REVISION_SEGUIR', { usuario, userId });
      if (destruido) return;

      if (!res || !res.ok) {
        mostrarAviso('No se pudo seguir a @' + esc(usuario) + ': ' + esc((res && res.error) || ''), true);
        el('btnDescartar').disabled = false;
        el('btnSeguir').disabled = false;
        el('btnSeguir').querySelector('span').textContent = '✓ Seguir';
        ocupado = false;
        return;
      }

      await animarSalida(true);
      cache.delete(usuario);
      indice++;
      ocupado = false;
      await mostrarActual();

      if (res.solicitado) {
        mostrarAviso('🔒 @' + esc(usuario) + ' es privado: se envió la solicitud.', false);
      }
    }

    function abrirPerfilActual() {
      if (!perfilActual) return;
      abrirUrl(urlPerfil(perfilActual.usuario));
    }

    // ── Eventos ──────────────────────────────────────────────────────────

    el('btnDescartar').addEventListener('click', descartar);
    el('btnSeguir').addEventListener('click', seguir);

    if (alCerrar) {
      el('cerrar').hidden = false;
      el('cerrar').addEventListener('click', alCerrar);
    }

    // Los links a Instagram se abren como pida el contexto: desde el popup y
    // desde el panel de Instagram conviene una pestaña nueva en segundo plano,
    // para no perder lo que estabas haciendo.
    raiz.addEventListener('click', (e) => {
      const link = e.target.closest ? e.target.closest('[data-perfil]') : null;
      if (!link) return;
      e.preventDefault();
      const url = link.getAttribute('href') || (perfilActual ? urlPerfil(perfilActual.usuario) : '');
      if (url) abrirUrl(url);
    });

    // Atajos de teclado. Dentro de Instagram solo responden cuando el panel
    // tiene el foco o el mouse encima, así no pisan los atajos propios de IG.
    let conFoco = (modo !== 'overlay');
    if (modo === 'overlay') {
      raiz.addEventListener('pointerenter', () => { conFoco = true; });
      raiz.addEventListener('pointerleave', () => { conFoco = false; });
      raiz.addEventListener('focusin', () => { conFoco = true; });
    }

    function onKey(e) {
      if (destruido || !conFoco) return;
      const activo = doc.activeElement;
      if (activo && /^(INPUT|TEXTAREA)$/.test(activo.tagName || '')) return;
      if (activo && activo.isContentEditable) return;

      if (e.key === 'Escape') {
        if (cerrarLightbox()) { e.preventDefault(); return; }
        if (alCerrar) { e.preventDefault(); alCerrar(); }
        return;
      }
      if (raiz.querySelector('.af-lightbox')) return;

      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); descartar(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seguir(); }
      else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); abrirPerfilActual(); }
    }

    doc.addEventListener('keydown', onKey, true);

    // ── Arranque ─────────────────────────────────────────────────────────

    async function iniciar() {
      mostrarEstado('⏳', 'Cargando la lista…');

      if (comprobarSesion) {
        const problema = await comprobarSesion();
        if (destruido) return;
        if (problema) {
          mostrarEstado(problema.icono || '📵', problema.titulo || 'No se puede revisar', problema.detalle || '');
          return;
        }
      }

      const res = await enviar('REVISION_LISTA');
      if (destruido) return;

      pendientes = ((res && res.revision) || []).slice();
      total = pendientes.length;
      indice = 0;
      cache = new Map();

      if (total === 0) {
        actualizarContador();
        mostrarEstado('📭', 'No hay perfiles en revisión',
          'Cuando el bot encuentre perfiles sin señales claras de tu zona, van a aparecer acá.');
        return;
      }

      await mostrarActual();
    }

    function destruir() {
      destruido = true;
      doc.removeEventListener('keydown', onKey, true);
      contenedor.textContent = '';
    }

    return { iniciar, destruir, raiz };
  }

  window.AFRevision = { montar, inyectarEstilos, css: CSS };
})();
