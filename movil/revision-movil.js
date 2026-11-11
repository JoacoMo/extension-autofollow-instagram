// =========================================================================
// revision-movil.js — El arranque de la versión para el celular
// =========================================================================
// Acá no hay extensión: no hay background, no hay popup y no hay
// chrome.storage. El userscript corre dentro de instagram.com, así que los
// datos los pide a la misma API de siempre y la cola vive en el navegador.
//
// Este archivo no se instala suelto: construir.js lo pega con el motor de
// filtros y con la tarjeta, y arma movil/ig-revision.user.js.
// =========================================================================

const CLAVE_COLA = 'af_cola_revision';
const CLAVE_SEGUIDOS = 'af_seguidos_revision';

// ── Guardado ─────────────────────────────────────────────────────────────
// Según el gestor de userscripts hay GM_setValue o no; localStorage de
// instagram.com funciona en los dos casos.

function guardar(clave, valor) {
  const texto = JSON.stringify(valor);
  try {
    if (typeof GM_setValue === 'function') { GM_setValue(clave, texto); return; }
  } catch (e) {}
  try { localStorage.setItem(clave, texto); } catch (e) {}
}

function leer(clave) {
  let texto = null;
  try {
    if (typeof GM_getValue === 'function') texto = GM_getValue(clave, null);
  } catch (e) {}
  if (texto == null) {
    try { texto = localStorage.getItem(clave); } catch (e) {}
  }
  try { return texto ? JSON.parse(texto) : []; } catch (e) { return []; }
}

const cola = {
  leer: () => leer(CLAVE_COLA),
  guardar: (lista) => guardar(CLAVE_COLA, lista),
  sacar(usuario) {
    cola.guardar(cola.leer().filter(u => u !== usuario));
  },
};

const seguidos = {
  leer: () => leer(CLAVE_SEGUIDOS),
  sumar(usuario) {
    const lista = seguidos.leer();
    if (!lista.includes(usuario)) {
      lista.push(usuario);
      guardar(CLAVE_SEGUIDOS, lista);
    }
  },
};

// Acepta "usuario", "@usuario", links de perfil, separados por coma o por línea
function parsearUsuarios(crudo) {
  return String(crudo || '')
    .split(/[\s,;]+/)
    .map(t => t.trim())
    .map(t => {
      const link = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      return (link ? link[1] : t).replace(/^@/, '').replace(/\/+$/, '');
    })
    .filter(u => /^[A-Za-z0-9._]{1,30}$/.test(u))
    .map(u => u.toLowerCase())
    .filter((u, i, arr) => arr.indexOf(u) === i);
}

// ── Transporte ───────────────────────────────────────────────────────────
// La tarjeta (revision-ui.js) habla con "acciones"; acá se resuelven todas
// sin salir de la página.

async function enviarEnElCelular(accion, datos) {
  const d = datos || {};

  if (accion === 'REVISION_LISTA') {
    return { ok: true, revision: cola.leer() };
  }

  if (accion === 'PERFIL_INFO') {
    return getPerfilInfo(d.usuario);
  }

  if (accion === 'REVISION_DESCARTAR') {
    cola.sacar(d.usuario);
    return { ok: true };
  }

  if (accion === 'REVISION_SEGUIR') {
    // Sin id igual se intenta: lo busca por nombre de usuario
    const res = await seguirAUsuario(d.usuario, d.userId);
    if (res.ok) {
      cola.sacar(d.usuario);
      seguidos.sumar(d.usuario);
    }
    return res;
  }

  // Las fotos salen del CDN de Meta y acá estamos dentro de instagram.com,
  // así que cargan directo. No hay background que las rescate.
  if (accion === 'FETCH_IMAGEN') {
    return { ok: false, error: 'sin background en el celular' };
  }

  return { ok: false, error: 'Acción desconocida: ' + accion };
}

// ── Panel ────────────────────────────────────────────────────────────────

const ESTILOS_MOVIL = [
  // El shadow DOM no hereda el box-sizing de la página: sin esto el panel
  // mide el ancho + el padding y se va de la pantalla del teléfono.
  '*, *::before, *::after { box-sizing: border-box; }',
  '.caja {',
  '  width: min(430px, calc(100vw - 20px));',
  '  max-height: min(78vh, 820px); overflow-y: auto;',
  '  background: #0c0c0e; border: 1px solid #26262c; border-radius: 18px;',
  '  padding: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.65);',
  '}',
  '.caja[hidden] { display: none; }',
  '.fab {',
  '  display: flex; align-items: center; gap: 8px; border: none; cursor: pointer;',
  '  background: linear-gradient(135deg, #5856d6, #0a84ff); color: #fff;',
  '  font: 700 14px system-ui, -apple-system, sans-serif; padding: 13px 18px;',
  '  border-radius: 26px; box-shadow: 0 6px 18px rgba(0,0,0,0.5);',
  '}',
  '.fab .cuenta { background: #fff; color: #10233a; border-radius: 12px; font-size: 11px; padding: 1px 7px; }',
  '.fab .cuenta[hidden] { display: none; }',
  // Pegar una lista nueva
  '.pegar { color: #f0f0f0; font: 13px system-ui, -apple-system, sans-serif; }',
  '.pegar h2 { font-size: 15px; margin: 0 0 6px; }',
  '.pegar p { color: #8e8e93; font-size: 12px; line-height: 1.6; margin: 0 0 10px; }',
  '.pegar textarea {',
  '  width: 100%; min-height: 110px; background: #15151a; color: #f0f0f0;',
  '  border: 1px solid #2a2a2e; border-radius: 10px; padding: 10px;',
  '  font: 12px ui-monospace, monospace; resize: vertical;',
  '}',
  '.pegar .fila { display: flex; gap: 8px; margin-top: 10px; }',
  '.pegar button {',
  '  flex: 1; padding: 12px; border: none; border-radius: 11px; color: #fff;',
  '  font: 700 13px system-ui, sans-serif; cursor: pointer;',
  '}',
  '.pegar .ok { background: #1a9e42; }',
  '.pegar .gris { background: #2a2a2e; }',
  '.pegar .aviso { margin-top: 10px; font-size: 12px; color: #4ade80; }',
].join('\n');

const panel = (() => {
  let host = null;
  let shadow = null;
  let caja = null;
  let contenedor = null;
  let fab = null;
  let control = null;
  let visible = false;

  function construir() {
    if (host && host.isConnected) return;

    host = document.createElement('div');
    host.id = 'af-revision-movil';
    host.style.cssText = [
      // Levantado para no taparse con la barra de abajo de Instagram
      'position: fixed', 'right: 10px', 'bottom: calc(66px + env(safe-area-inset-bottom))',
      'z-index: 2147483000', 'display: flex', 'flex-direction: column',
      'align-items: flex-end', 'gap: 10px',
    ].join('; ');

    shadow = host.attachShadow({ mode: 'open' });
    const estilo = document.createElement('style');
    estilo.textContent = ESTILOS_MOVIL;
    shadow.appendChild(estilo);

    caja = document.createElement('div');
    caja.className = 'caja';
    caja.hidden = true;
    contenedor = document.createElement('div');
    caja.appendChild(contenedor);

    fab = document.createElement('button');
    fab.className = 'fab';
    fab.type = 'button';
    fab.innerHTML = '<span>👀</span><span class="texto">Revisar</span><span class="cuenta">0</span>';
    fab.addEventListener('click', () => { if (visible) cerrar(); else abrir(); });

    shadow.appendChild(caja);
    shadow.appendChild(fab);
    (document.body || document.documentElement).appendChild(host);
    pintarFab();
  }

  function pintarFab() {
    if (!fab) return;
    const cuantos = cola.leer().length;
    fab.querySelector('.texto').textContent = visible ? 'Cerrar' : 'Revisar';
    const cuenta = fab.querySelector('.cuenta');
    cuenta.textContent = cuantos;
    cuenta.hidden = cuantos === 0;
  }

  function abrir() {
    construir();
    visible = true;
    caja.hidden = false;
    pintarFab();
    if (cola.leer().length === 0) pantallaPegar();
    else montarTarjeta();
  }

  function cerrar() {
    visible = false;
    if (control) { control.destruir(); control = null; }
    if (caja) caja.hidden = true;
    pintarFab();
  }

  function montarTarjeta() {
    if (control) control.destruir();
    control = window.AFRevision.montar({
      contenedor,
      enviar: enviarEnElCelular,
      modo: 'overlay',
      abrirUrl: (url) => window.open(url, '_blank'),
      alCerrar: cerrar,
      alCambiarPendientes: () => pintarFab(),
    });
    control.iniciar();
  }

  // Pantalla para pegar la lista que copiaste de la compu
  function pantallaPegar() {
    if (control) { control.destruir(); control = null; }

    const yaSeguidos = seguidos.leer();
    contenedor.innerHTML =
      '<div class="pegar">' +
        '<h2>👀 Revisión</h2>' +
        '<p>Pegá acá los usuarios que te pasaste de la compu (botón <b>Copiar revisión</b>). ' +
        'Valen separados por coma o uno por línea, con @ o sin @.</p>' +
        '<textarea placeholder="sofi.cba, juanpe, @lucia.unc"></textarea>' +
        '<div class="fila">' +
          '<button class="ok">Cargar</button>' +
          (yaSeguidos.length
            ? '<button class="gris">Copiar seguidos (' + yaSeguidos.length + ')</button>'
            : '') +
        '</div>' +
        '<div class="aviso" hidden></div>' +
      '</div>';

    const area = contenedor.querySelector('textarea');
    const aviso = contenedor.querySelector('.aviso');

    contenedor.querySelector('.ok').addEventListener('click', () => {
      const usuarios = parsearUsuarios(area.value);
      if (!usuarios.length) {
        aviso.hidden = false;
        aviso.style.color = '#ff8a80';
        aviso.textContent = 'No encontré ningún usuario en eso.';
        return;
      }
      const juntos = cola.leer();
      usuarios.forEach(u => { if (!juntos.includes(u)) juntos.push(u); });
      cola.guardar(juntos);
      pintarFab();
      montarTarjeta();
    });

    const copiar = contenedor.querySelector('.gris');
    if (copiar) {
      copiar.addEventListener('click', async () => {
        const texto = seguidos.leer().join(', ');
        try {
          await navigator.clipboard.writeText(texto);
          aviso.hidden = false;
          aviso.style.color = '#4ade80';
          aviso.textContent = 'Copiado. Pegalo en la compu para sumarlo al CSV.';
        } catch (e) {
          area.value = texto;
          aviso.hidden = false;
          aviso.style.color = '#4ade80';
          aviso.textContent = 'Te lo dejé en el cuadro de arriba para copiar a mano.';
        }
      });
    }
  }

  return { construir, pintarFab };
})();

// Instagram en el celular es una SPA: al cambiar de pantalla a veces se
// lleva puesto lo que haya en el body, así que se revisa cada tanto.
function plantarPanel() {
  panel.construir();
  panel.pintarFab();
}

plantarPanel();
setInterval(plantarPanel, 4000);
