// =========================================================================
// revision.js — Arranque de la revisión en pestaña completa
// La pantalla en sí vive en revision-ui.js, compartida con el popup y con
// el panel que se monta dentro de instagram.com.
// =========================================================================

function sendBg(action, payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(Object.assign({ action }, payload || {}), (res) => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: chrome.runtime.lastError.message });
      }
      resolve(res || { ok: false, error: 'Sin respuesta' });
    });
  });
}

// Los datos de cada perfil salen de una pestaña de Instagram con tu sesión
async function hayPestanaDeInstagram() {
  const tabs = await new Promise(resolve => {
    chrome.tabs.query({ url: 'https://www.instagram.com/*' }, resolve);
  });
  return !!(tabs && tabs.length > 0);
}

const control = AFRevision.montar({
  contenedor: document.getElementById('app'),
  enviar: sendBg,
  modo: 'tab',
  abrirUrl: (url) => chrome.tabs.create({ url }),
  comprobarSesion: async () => {
    if (await hayPestanaDeInstagram()) return null;
    return {
      icono: '📵',
      titulo: 'Abrí Instagram primero',
      detalle: 'Esta pantalla lee los perfiles desde una pestaña de Instagram con tu sesión.' +
               '<br><br><a href="https://www.instagram.com/" target="_blank" rel="noreferrer">' +
               'Abrir instagram.com ↗</a><br><br>Después recargá esta página.',
    };
  },
});

control.iniciar();
