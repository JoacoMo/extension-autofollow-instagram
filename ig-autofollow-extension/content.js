// =========================================================================
// content.js — Se ejecuta en instagram.com
// Realiza las acciones reales: navegar, detectar botones, seguir usuarios
// =========================================================================

(function () {
  if (window.__afBotInjected) return;
  window.__afBotInjected = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // =======================================================================
  // FILTRO CÓRDOBA — normalización de tipografías raras + matching
  // =======================================================================

  // ── Homoglifos que NFKD no resuelve solo ────────────────────────────────
  // (versalitas ᴄʙᴀ, cirílico соrdоbа, griego, letras estilizadas)

  const MAPA_HOMOGLIFOS = (() => {
    const mapa = Object.create(null);
    const pares = [
      ['a', 'ᴀɐɑɒªαаᾰᾱᾳǎɐₐ∀ᗅᗩ'],
      ['b', 'ʙƀƃɓβϐвьъᙠᏸ'],
      ['c', 'ᴄϲсçćĉċčɔƈᑕᏟℂ'],
      ['d', 'ᴅԁđɖɗᑯᗪĎ'],
      ['e', 'ᴇєеεёэǝɇɘₑᗴℰ'],
      ['f', 'ꜰғƒϝʃ'],
      ['g', 'ɢԍǥɠɡƍ'],
      ['h', 'ʜһнƕɦℏĥ'],
      ['i', 'ɪіїıɨɩίιϊ¡ᴉℹ'],
      ['j', 'ᴊϳјɉʝ'],
      ['k', 'ᴋкκƙᶄᏦ'],
      ['l', 'ʟɭłɬƚℓǀ'],
      ['m', 'ᴍмμϻɱᗰ'],
      ['n', 'ɴпηɲƞñᴎᑎ'],
      ['o', 'ᴏоοσøɵθδϙᴑᴓ°ᗝ'],
      ['p', 'ᴘрρƥþϱᑭ'],
      ['q', 'ǫʠԛɋϥ'],
      ['r', 'ʀгяɍɽɾᖇℛ'],
      ['s', 'ꜱѕşśšʂƨᔕ'],
      ['t', 'ᴛтτţŧƭϯ†'],
      ['u', 'ᴜυµμцɥʉᵾᑌ'],
      ['v', 'ᴠνѵʋᐯ'],
      ['w', 'ᴡωшщѡɯᗯ'],
      ['x', 'хχҳᕽ✗✘'],
      ['y', 'ʏуүγψɏƴ'],
      ['z', 'ᴢʐƶźżžᏃ'],
      ["'", '’‘`´ʼ′‛'],
      [' ', '​‌‍⁠﻿   '],
    ];
    for (const [destino, fuentes] of pares) {
      for (const ch of fuentes) mapa[ch] = destino;
    }
    return mapa;
  })();

  // Bloques enteros de letras decoradas que conviene mapear por rango
  function letraDesdeRango(cp) {
    if (cp >= 0x1F130 && cp <= 0x1F149) return String.fromCharCode(97 + cp - 0x1F130); // 🄰 squared
    if (cp >= 0x1F150 && cp <= 0x1F169) return String.fromCharCode(97 + cp - 0x1F150); // 🅐 circled
    if (cp >= 0x1F170 && cp <= 0x1F189) return String.fromCharCode(97 + cp - 0x1F170); // 🅰 neg. squared
    if (cp >= 0x1F1E6 && cp <= 0x1F1FF) return String.fromCharCode(97 + cp - 0x1F1E6); // 🇨 banderas
    return '';
  }

  function esCombinante(cp) {
    return (cp >= 0x0300 && cp <= 0x036F)  // diacríticos
        || (cp >= 0x1AB0 && cp <= 0x1AFF)
        || (cp >= 0x20D0 && cp <= 0x20F0)  // tachados, círculos combinantes
        || (cp >= 0xFE00 && cp <= 0xFE2F); // selectores de variación
  }

  // Deja cualquier tipografía en texto plano: 𝘊𝘣𝘢 / ᴄʙᴀ / Ｃｂａ / 🅲🅱🅰 → "cba"
  // `conservar` mantiene signos extra (el filtro de edad necesita ' y / para
  // leer "'03" y "15/06/03").
  function normalizarTexto(valor, conservar) {
    let texto = String(valor || '');
    // NFKD cubre el grueso: matemáticas (𝘊), fullwidth (Ｃ), circulados (Ⓒ), etc.
    try { texto = texto.normalize('NFKD'); } catch (e) {}
    // Antes de mapear homoglifos, para que "С" cirílica llegue al mapa como "с"
    texto = texto.toLowerCase();

    let salida = '';
    for (const ch of texto) {
      const cp = ch.codePointAt(0);
      if (esCombinante(cp)) continue;
      const porRango = letraDesdeRango(cp);
      if (porRango) { salida += porRango; continue; }
      const mapeado = MAPA_HOMOGLIFOS[ch];
      salida += (mapeado !== undefined) ? mapeado : ch;
    }

    const extra = String(conservar || '').replace(/[\]\\^-]/g, '\\$&');
    return salida
      .replace(new RegExp(`[^a-z0-9${extra}]+`, 'g'), ' ')  // emojis, puntos → separador
      .trim();
  }

  // "u.n.c" → "u n c" (por la normalización) → "unc"
  // También rescata "C 🌸 B 🌸 A" y nombres escrit os con espacios.
  function colapsarSiglas(texto) {
    return texto.replace(/\b(?:[a-z] ){1,7}[a-z]\b/g, (m) => m.replace(/ /g, ''));
  }

  // ── Términos que delatan a alguien de Córdoba capital ───────────────────
  // Sufijo "*" = coincide también con lo que siga (cordobes* → cordobesa).
  // Sin "*" = tiene que aparecer como palabra completa.

  const TERMINOS_CORDOBA = [
    // Ciudad, provincia, gentilicio, característica telefónica
    'cordoba', 'cba', 'cordobes*', 'docta', '351',

    // Universidades de Córdoba capital
    'unc',                              // Universidad Nacional de Córdoba
    'utn', 'frc', 'utn frc',            // UTN Facultad Regional Córdoba
    'upc',                              // Universidad Provincial de Córdoba
    'ucc',                              // Universidad Católica de Córdoba
    'ubp', 'blas pascal',               // Universidad Blas Pascal
    'ues21', 'siglo21', 'siglo 21', 'empresarial siglo',
    'iua', 'undef',                     // Instituto Universitario Aeronáutico
    'ispc',                             // Instituto Superior de Prof. de Córdoba
    'ciudad universitaria',

    // Facultades de la UNC
    'famaf',                            // Matemática, Astronomía, Física y Computación
    'fcefyn', 'fcefn',                  // Ciencias Exactas, Físicas y Naturales
    'ffyh',                             // Filosofía y Humanidades
    'fcm',                              // Ciencias Médicas
    'fcq',                              // Ciencias Químicas
    'fcc',                              // Ciencias de la Comunicación
    'faud',                             // Arquitectura, Urbanismo y Diseño
    'fcs',                              // Ciencias Sociales
    'fce',                              // Ciencias Económicas
    'fca',                              // Ciencias Agropecuarias
    'fl',                               // Lenguas
    'fodo', 'odo',                      // Odontología

    // Colegios preuniversitarios de Córdoba capital
    'monserrat', 'montserrat',          // Colegio Nacional de Monserrat
    'enmb', 'manuel belgrano',          // Esc. Superior de Comercio Manuel Belgrano
    'carbo',                            // Escuela Normal Alejandro Carbó
  ];

  // Interior / Gran Córdoba: apagado por defecto porque no es capital.
  const TERMINOS_INTERIOR = [
    'carlos paz', 'alta gracia', 'villa allende', 'rio ceballos', 'la calera',
    'saldan', 'malagueño', 'unquillo', 'mendiolaza', 'jesus maria',
    'unvm', 'villa maria', 'unrc', 'rio cuarto', 'cosquin', 'la falda',
    'rio tercero', 'san francisco', 'bell ville', 'marcos juarez', 'villa dolores',
  ];

  // ── Señales de que la cuenta es un local, boliche o negocio ────────────
  // El bloque más confiable son los botones que Instagram muestra solo en
  // cuentas profesionales con dirección o contacto cargado: si el perfil
  // ofrece "Cómo llegar" o "Ver tienda", hay un local atrás.

  const TERMINOS_NEGOCIO = [
    // Botones de cuenta comercial (aparecen en el texto del header)
    'como llegar', 'get directions', 'ver tienda', 'view shop',
    'pedir comida', 'order food', 'reservar', 'book now', 'reserve',

    // Categoría profesional que muestra Instagram bajo el nombre
    'empresa local', 'empresa de', 'tienda de', 'marca de', 'producto servicio',
    'servicio de comida', 'bar de copas', 'club nocturno', 'salon de eventos',

    // Rubro nocturno
    'boliche', 'boliches', 'discoteca', 'nightclub', 'night club',
    'after office', 'afteroffice', 'pub', 'bar', 'cerveceria', 'birreria',
    'restobar', 'resto bar', 'karaoke', 'salon de fiestas',

    // Gastronomía y comercios
    'restaurante', 'parrilla', 'rotiseria', 'pizzeria', 'hamburgueseria',
    'cafeteria', 'heladeria', 'panaderia', 'confiteria', 'catering',
    'boutique', 'peluqueria', 'barberia', 'hotel', 'hostel', 'cabañas',
    'sucursal', 'sucursales', 'franquicia', 'showroom', 'mayorista',
    'distribuidora', 'indumentaria', 'tienda online', 'ecommerce',

    // Vocabulario comercial
    'delivery', 'pedidos', 'envios', 'catalogo', 'promos', 'promociones',
    'descuentos', 'turnos', 'reservas', 'entradas', 'horarios',
    'atencion al cliente', 'local comercial', 'productora de eventos',
  ];

  const PROHIBIDAS_DEFAULT = ['dj'];

  // ── Compilación de términos a regex (cacheada por config) ───────────────

  function compilarTermino(raw) {
    const texto = String(raw || '').trim();
    if (!texto) return null;
    const esPrefijo = /\*$/.test(texto);
    const limpio = normalizarTexto(texto.replace(/\*+$/, ''));
    if (!limpio) return null;
    const escapado = limpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      termino: limpio,
      regex: new RegExp(esPrefijo ? `\\b${escapado}[a-z0-9]*\\b` : `\\b${escapado}\\b`),
    };
  }

  function compilarLista(lista) {
    return (lista || []).map(compilarTermino).filter(Boolean);
  }

  let cacheFiltro = null;

  function getFiltroCompilado(config) {
    const cfg = config || {};
    const clave = JSON.stringify([
      cfg.incluirInterior === true,
      cfg.extra || [],
      cfg.prohibidas || PROHIBIDAS_DEFAULT,
      cfg.negocioActivo !== false,
      cfg.negocioExtra || [],
    ]);
    if (cacheFiltro && cacheFiltro.clave === clave) return cacheFiltro;

    const permitidos = [...TERMINOS_CORDOBA];
    if (cfg.incluirInterior === true) permitidos.push(...TERMINOS_INTERIOR);
    permitidos.push(...(cfg.extra || []));

    const negocio = cfg.negocioActivo === false
      ? []
      : [...TERMINOS_NEGOCIO, ...(cfg.negocioExtra || [])];

    cacheFiltro = {
      clave,
      permitidos: compilarLista(permitidos),
      prohibidas: compilarLista(cfg.prohibidas || PROHIBIDAS_DEFAULT),
      negocio: compilarLista(negocio),
    };
    return cacheFiltro;
  }

  function buscarTermino(compilados, textos) {
    for (const item of compilados) {
      for (const texto of textos) {
        if (item.regex.test(texto)) return item.termino;
      }
    }
    return null;
  }

  // ── Texto del perfil (nombre + bio + categoría + links) ─────────────────

  function extraerTextoPerfil() {
    const partes = [];
    const header = document.querySelector('header');
    if (header) partes.push(header.innerText || '');

    // Si el header viene vacío o Instagram cambió el layout, caemos a <main>
    const acumulado = partes.join(' ').trim();
    if (acumulado.length < 40) {
      const main = document.querySelector('main');
      if (main) partes.push((main.innerText || '').slice(0, 1500));
    }

    // Los links de la bio a veces son la única pista ("linktr.ee/juan.cba")
    const contenedor = header || document.querySelector('main');
    if (contenedor) {
      contenedor.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href && !href.startsWith('/')) partes.push(href);
      });
    }

    return partes.join('\n');
  }

  // ── Evaluación de un perfil ─────────────────────────────────────────────

  function evaluarPerfil(textoCrudo, config) {
    const normal = normalizarTexto(textoCrudo);
    if (!normal) return { estado: 'sin_texto' };

    const textos = [normal, colapsarSiglas(normal)];
    const filtro = getFiltroCompilado(config);

    const prohibida = buscarTermino(filtro.prohibidas, textos);
    if (prohibida) return { estado: 'prohibida', termino: prohibida };

    // Antes que Córdoba: un boliche de Córdoba también dice "cba" en la bio
    const negocio = buscarTermino(filtro.negocio, textos);
    if (negocio) return { estado: 'negocio', termino: negocio };

    const permitido = buscarTermino(filtro.permitidos, textos);
    if (permitido) return { estado: 'cordoba', termino: permitido };

    return { estado: 'sin_cordoba' };
  }

  // =======================================================================
  // FILTRO EDAD — se estima desde el texto, nunca desde la foto
  // =======================================================================
  // Instagram no expone la edad. Lo único confiable son las pistas que la
  // persona escribe: "21 años", "2003", "'04", "promo 2021".
  // Si no hay ninguna, se devuelve "sin_dato" (no se inventa un número).

  const ANIO_ACTUAL = new Date().getFullYear();
  const EDAD_MIN_PLAUSIBLE = 13;
  const EDAD_MAX_PLAUSIBLE = 99;

  function plausible(edad) {
    return Number.isFinite(edad) && edad >= EDAD_MIN_PLAUSIBLE && edad <= EDAD_MAX_PLAUSIBLE;
  }

  // "03" → 2003, pero "78" → 1978 (nadie nacido hace <12 años está acá)
  function anioNacimientoDesde2Digitos(yy) {
    const n = Number(yy);
    const siglo21 = 2000 + n;
    return siglo21 <= ANIO_ACTUAL - 12 ? siglo21 : 1900 + n;
  }

  function textoParaEdad(textoCrudo) {
    return normalizarTexto(textoCrudo, "'/");
  }

  function estimarEdad(textoCrudo) {
    const t = textoParaEdad(textoCrudo);
    if (!t) return null;

    // 1. Edad escrita tal cual: "23 años", "23yo", "23 yrs"
    const explicita = t.match(/\b(\d{2})\s*(?:anos|anitos|yo|y\/o|yrs|years?)\b/);
    if (explicita && plausible(Number(explicita[1]))) {
      return { edad: Number(explicita[1]), fuente: explicita[0].trim(), confianza: 'alta' };
    }

    // 2. Fecha de nacimiento completa: "🎂 15/06/2003" o "15/06/03"
    const fecha = t.match(/\b\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})\b/);
    if (fecha) {
      const anio = fecha[1].length === 4 ? Number(fecha[1]) : anioNacimientoDesde2Digitos(fecha[1]);
      const edad = ANIO_ACTUAL - anio;
      if (plausible(edad)) return { edad, fuente: `nacido en ${anio}`, confianza: 'alta' };
    }

    // 3. Promo / egresados: se egresa del secundario a los ~18
    const promo = t.match(/\b(?:promo|promocion|egresad\w*|generacion|class of)\s*'?(\d{2}|\d{4})\b/);
    if (promo) {
      const anio = promo[1].length === 4 ? Number(promo[1]) : 2000 + Number(promo[1]);
      const edad = 18 + (ANIO_ACTUAL - anio);
      if (plausible(edad)) return { edad, fuente: `promo ${anio}`, confianza: 'media' };
    }

    // 4. Año corto con apóstrofe: "'03" o "03'"
    const corto = t.match(/'(\d{2})\b|\b(\d{2})'/);
    if (corto) {
      const yy = corto[1] || corto[2];
      const anio = anioNacimientoDesde2Digitos(yy);
      const edad = ANIO_ACTUAL - anio;
      if (plausible(edad)) return { edad, fuente: `'${yy}`, confianza: 'media' };
    }

    // 5. Año de nacimiento suelto de 4 dígitos
    const anioSuelto = t.match(/\b(19[5-9]\d|200\d|201[0-3])\b/);
    if (anioSuelto) {
      const edad = ANIO_ACTUAL - Number(anioSuelto[1]);
      if (plausible(edad)) return { edad, fuente: `año ${anioSuelto[1]}`, confianza: 'media' };
    }

    return null;
  }

  // Señales de que la persona todavía está en el secundario.
  // Se saltea siempre que el filtro de edad esté activo, sin importar el rango.
  function senalDeSecundario(textoCrudo) {
    const t = textoParaEdad(textoCrudo);
    if (!t) return null;

    const promo = t.match(/\b(?:promo|promocion|egresad\w*|generacion)\s*'?(\d{2}|\d{4})\b/);
    if (promo) {
      const anio = promo[1].length === 4 ? Number(promo[1]) : 2000 + Number(promo[1]);
      if (anio >= ANIO_ACTUAL) return `promo ${anio}`;
    }

    if (/\b(?:4to|5to|6to|cuarto|quinto|sexto)\s*ano\b/.test(t)) return 'cursando el secundario';
    if (/\bsecundari[ao]\b/.test(t) && !/\bex\s+secundari[ao]\b/.test(t)) return 'menciona el secundario';

    return null;
  }

  function evaluarEdad(textoCrudo, config) {
    const cfg = config || {};
    const min = Number(cfg.edadMin) > 0 ? Number(cfg.edadMin) : 18;
    const max = Number(cfg.edadMax) > 0 ? Number(cfg.edadMax) : 99;

    const secundario = senalDeSecundario(textoCrudo);
    if (secundario) return { estado: 'secundario', detalle: secundario, min, max };

    const est = estimarEdad(textoCrudo);
    if (!est) return { estado: 'sin_dato', min, max };
    if (est.edad < min || est.edad > max) {
      return Object.assign({ estado: 'fuera_rango', min, max }, est);
    }
    return Object.assign({ estado: 'ok', min, max }, est);
  }

  // Para probar a mano desde la consola de Instagram:
  //   __afFiltro.probar('𝘊𝘣𝘢 | ғᴀᴍᴀꜰ ᴜɴᴄ')
  //   __afFiltro.edad('21 años | Córdoba')
  window.__afFiltro = {
    normalizar: normalizarTexto,
    probar: (texto, config) => evaluarPerfil(texto, config),
    edad: (texto, config) => evaluarEdad(texto, config),
    perfilActual: (config) => ({
      cordoba: evaluarPerfil(extraerTextoPerfil(), config),
      edad: evaluarEdad(extraerTextoPerfil(), config),
    }),
    terminos: TERMINOS_CORDOBA,
    terminosInterior: TERMINOS_INTERIOR,
    terminosNegocio: TERMINOS_NEGOCIO,
  };

  // ── Avisar al background que el content script está listo ───────────────

  function notificarListo() {
    try {
      chrome.runtime.sendMessage({ action: 'CONTENT_READY' }, () => {
        if (chrome.runtime.lastError) {} // ignorar si popup cerrado
      });
    } catch (e) {}
  }

  // Esperar a que IG cargue bien antes de avisar
  if (document.readyState === 'complete') {
    setTimeout(notificarListo, 2000);
  } else {
    window.addEventListener('load', () => setTimeout(notificarListo, 2000));
  }

  // ── Navegar a un perfil usando la API de historia de IG ─────────────────

  async function navegarAPerfil(usuario) {
    const username = String(usuario || '')
      .trim()
      .replace(/^@/, '')
      .match(/instagram\.com\/([a-z0-9._]+)\/?(?:\?.*)?$/i)?.[1] || String(usuario || '').trim().replace(/^@/, '');
    const url = `https://www.instagram.com/${username}/`;
    if (location.href === url) return;
    location.href = url;
  }

  // ── Detectar si ya seguimos al usuario ──────────────────────────────────

  function yaLoSeguimos() {
    const botones = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (const btn of botones) {
      const texto = (btn.innerText || btn.textContent || '').trim();
      if (/^(Siguiendo|Following|Dejar de seguir|Unfollow|Solicitado|Requested)$/i.test(texto)) return true;
    }
    return false;
  }

  // ── Verificar si la página es un perfil válido ───────────────────────────

  function esPerfilValido() {
    // Instagram muestra "Lo sentimos" o "Page Not Found" en perfiles inexistentes
    const body = document.body?.innerText || '';
    const title = (document.title || '').toLowerCase();
    if (title.includes('page not found') || title.includes('no encontrada')) return false;
    if (body.includes('Page Not Found') || body.includes('Lo sentimos') || body.includes('Esta página no está disponible')) return false;
    // Debe haber algún elemento de perfil
    const tieneHeader = document.querySelector('header') !== null || document.querySelector('main') !== null;
    return tieneHeader;
  }

  // ── Encontrar el botón "Seguir" ──────────────────────────────────────────

  async function encontrarBotonSeguir(timeoutMs = 12000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const contenedor = document.querySelector('header') || document.querySelector('main') || document.body;
      const botones = Array.from(contenedor.querySelectorAll('button, div[role="button"]'));
      for (const btn of botones) {
        const texto = (btn.innerText || btn.textContent || '').trim();
        if (/^(Seguir|Follow)$/.test(texto)) return btn;
      }
      await sleep(400);
    }
    return null;
  }

  // ── Manejar diálogos de confirmación (perfiles privados) ─────────────────

  async function aceptarDialogoSolicitud() {
    await sleep(1000);
    const dialogoBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
    for (const db of dialogoBtns) {
      const dt = (db.innerText || db.textContent || '').trim();
      if (/^(Enviar solicitud|Send request|Confirmar|Confirm|Aceptar|Accept)$/i.test(dt)) {
        db.click();
        await sleep(800);
        return true;
      }
    }
    return false;
  }

  // ── Flujo completo de seguir a un usuario ────────────────────────────────

  async function seguirUsuario(usuario, filtroConfig) {
    const username = String(usuario || '')
      .trim()
      .replace(/^@/, '')
      .match(/instagram\.com\/([a-z0-9._]+)\/?(?:\?.*)?$/i)?.[1] || String(usuario || '').trim().replace(/^@/, '');

    // 1. Verificar que estemos en el perfil correcto
    const pathname = location.pathname.replace(/\/+$/, '').toLowerCase();
    const enPerfil = pathname === `/${username.toLowerCase()}`;

    if (!enPerfil) {
      await navegarAPerfil(username);
      return { resultado: 'navegando' };
    }

    // 2. Esperar a que el perfil cargue
    await sleep(2500);

    if (!esPerfilValido()) {
      return { resultado: 'saltado', razon: 'Perfil no encontrado o no disponible' };
    }

    // 3. Analizar nombre, bio, categoría y links del perfil
    const cfg = filtroConfig || {};
    const textoPerfil = extraerTextoPerfil();
    const motivos = [];

    if (cfg.activo !== false) {
      const evaluacion = evaluarPerfil(textoPerfil, cfg);

      if (evaluacion.estado === 'sin_texto') {
        return { resultado: 'revision', razon: 'No se pudo leer la bio del perfil' };
      }
      if (evaluacion.estado === 'prohibida') {
        return { resultado: 'saltado', razon: `Palabra prohibida: "${evaluacion.termino}"` };
      }
      if (evaluacion.estado === 'negocio') {
        return { resultado: 'saltado', razon: `Local o negocio: "${evaluacion.termino}"` };
      }
      if (evaluacion.estado === 'sin_cordoba') {
        return { resultado: 'revision', razon: 'No menciona Córdoba en la bio/nombre' };
      }
      motivos.push(evaluacion.termino);
    }

    // 3b. Filtro de edad
    if (cfg.edadActiva !== false) {
      const ev = evaluarEdad(textoPerfil, cfg);

      if (ev.estado === 'secundario') {
        return { resultado: 'saltado', razon: `Parece estar en el secundario (${ev.detalle})` };
      }
      if (ev.estado === 'fuera_rango') {
        return { resultado: 'saltado', razon: `Edad ~${ev.edad} fuera de ${ev.min}-${ev.max} (${ev.fuente})` };
      }
      if (ev.estado === 'sin_dato') {
        if (cfg.edadExigir === true) {
          return { resultado: 'revision', razon: 'No se pudo estimar la edad' };
        }
      } else {
        motivos.push(`~${ev.edad} años`);
      }
    }

    // 4. Verificar si ya lo seguimos
    const estadoActual = await getEstadoSeguimiento();
    if (estadoActual === 'siguiendo') {
      return { resultado: 'saltado', razon: 'Ya lo seguís' };
    }
    if (estadoActual === 'solicitado') {
      return { resultado: 'saltado', razon: 'Solicitud pendiente' };
    }

    // 5. Buscar botón Seguir
    const botonSeguir = await encontrarBotonSeguir(8000);

    if (!botonSeguir) {
      return { resultado: 'saltado', razon: 'No se encontró botón Seguir' };
    }

    // 6. Click en Seguir
    botonSeguir.click();
    await sleep(1500);

    // 7. Manejar posible diálogo de solicitud
    await aceptarDialogoSolicitud();

    // 8. Verificar que el seguimiento fue exitoso
    const estadoFinal = await getEstadoSeguimiento();
    if (estadoFinal === 'siguiendo' || estadoFinal === 'solicitado') {
      return { resultado: 'seguido', motivo: motivos.filter(Boolean).join(', ') };
    }

    return { resultado: 'saltado', razon: 'No se pudo confirmar el seguimiento' };
  }

  async function getEstadoSeguimiento() {
    const contenedor = document.querySelector('header') || document.querySelector('main') || document.body;
    const botones = Array.from(contenedor.querySelectorAll('button, div[role="button"]'));
    for (const btn of botones) {
      const texto = (btn.innerText || btn.textContent || '').trim();
      if (/^(Siguiendo|Following)$/i.test(texto)) return 'siguiendo';
      if (/^(Solicitado|Requested)$/i.test(texto)) return 'solicitado';
      if (/^(Seguir|Follow)$/i.test(texto)) return 'no_sigue';
    }
    return null;
  }

  // =======================================================================
  // DATOS DE PERFIL — para la pantalla de revisión
  // =======================================================================
  // Se usa la misma API web que consume instagram.com cuando abrís un perfil.
  // Al correr dentro de instagram.com la request va con tu sesión y es una
  // sola llamada por perfil, en vez de navegar y scrapear el DOM.

  const IG_APP_ID_FALLBACK = '936619743392459';

  function getAppId() {
    // Instagram deja el App ID en los scripts de configuración de la página
    try {
      const html = document.documentElement.innerHTML;
      const m = html.match(/"X-IG-App-ID"\s*:\s*"(\d+)"/)
             || html.match(/"app_id"\s*:\s*"(\d+)"/);
      if (m) return m[1];
    } catch (e) {}
    return IG_APP_ID_FALLBACK;
  }

  function getCookie(nombre) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function getPerfilInfo(usuario) {
    const username = String(usuario || '').trim().replace(/^@/, '');
    if (!username) return { ok: false, error: 'Usuario vacío' };

    try {
      const res = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: { 'X-IG-App-ID': getAppId() },
          credentials: 'include',
        }
      );

      if (res.status === 404) return { ok: false, error: 'El perfil no existe' };
      if (res.status === 401) return { ok: false, error: 'Sesión cerrada: volvé a entrar a Instagram' };
      if (res.status === 429) return { ok: false, error: 'Instagram pidió esperar (demasiadas consultas)' };
      if (!res.ok) return { ok: false, error: `Instagram respondió ${res.status}` };

      const json = await res.json();
      const u = json?.data?.user;
      if (!u) return { ok: false, error: 'Respuesta inesperada de Instagram' };

      const posts = (u.edge_owner_to_timeline_media?.edges || [])
        .slice(0, 9)
        .map(e => ({
          imagen: e.node?.thumbnail_src || e.node?.display_url || '',
          esVideo: !!e.node?.is_video,
          enlace: e.node?.shortcode ? `https://www.instagram.com/p/${e.node.shortcode}/` : '',
        }))
        .filter(p => p.imagen);

      const perfil = {
        id: u.id,
        usuario: u.username || username,
        nombre: u.full_name || '',
        bio: u.biography || '',
        enlaceExterno: u.external_url || '',
        fotoPerfil: u.profile_pic_url_hd || u.profile_pic_url || '',
        privado: !!u.is_private,
        verificado: !!u.is_verified,
        seguidores: u.edge_followed_by?.count ?? null,
        siguiendo: u.edge_follow?.count ?? null,
        publicaciones: u.edge_owner_to_timeline_media?.count ?? null,
        yaLoSigo: !!u.followed_by_viewer,
        solicitado: !!u.requested_by_viewer,
        posts,
      };

      // Qué dirían los filtros sobre este perfil, para mostrarlo como contexto
      const textoFiltro = [perfil.nombre, perfil.usuario, perfil.bio, perfil.enlaceExterno].join(' ');
      perfil.analisis = {
        cordoba: evaluarPerfil(textoFiltro, {}),
        edad: evaluarEdad(textoFiltro, {}),
      };

      return { ok: true, perfil };
    } catch (e) {
      return { ok: false, error: e?.message || 'Falló la consulta a Instagram' };
    }
  }

  // Seguir con un solo request, igual que el botón de la web.
  async function seguirPorApi(userId) {
    const csrf = getCookie('csrftoken');
    if (!csrf) return { ok: false, error: 'No se encontró el token de sesión' };

    try {
      const res = await fetch(`https://www.instagram.com/api/v1/friendships/create/${userId}/`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrf,
          'X-IG-App-ID': getAppId(),
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: '',
      });

      if (res.status === 429) return { ok: false, error: 'Instagram pidió esperar antes de seguir a alguien más' };
      if (!res.ok) return { ok: false, error: `Instagram respondió ${res.status}` };

      const json = await res.json();
      // friendship_status.following / outgoing_request según sea público o privado
      const estado = json?.friendship_status || {};
      if (json?.status === 'ok' && (estado.following || estado.outgoing_request)) {
        return { ok: true, solicitado: !!estado.outgoing_request && !estado.following };
      }
      return { ok: false, error: 'Instagram no confirmó el seguimiento' };
    } catch (e) {
      return { ok: false, error: e?.message || 'Falló el seguimiento' };
    }
  }

  // =======================================================================
  // PANEL DE REVISIÓN DENTRO DE INSTAGRAM
  // =======================================================================
  // Misma tarjeta que el popup y que revision.html (la arma revision-ui.js),
  // montada en un shadow DOM: así los estilos de Instagram no tocan el panel
  // ni el panel toca los de Instagram.

  function sendBgDesdeContent(action, payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(Object.assign({ action }, payload || {}), (res) => {
        if (chrome.runtime.lastError) {
          return resolve({ ok: false, error: chrome.runtime.lastError.message });
        }
        resolve(res || { ok: false, error: 'Sin respuesta' });
      });
    });
  }

  async function enviarDesdeIg(action, payload) {
    // Ya estamos dentro de Instagram: el perfil se pide acá mismo, sin dar la
    // vuelta por el background ni depender de qué pestaña esté activa.
    if (action === 'PERFIL_INFO') return getPerfilInfo(payload.usuario);

    // sinFallback: el plan B por DOM navegaría la página y se perdería el panel
    if (action === 'REVISION_SEGUIR') {
      return sendBgDesdeContent(action, Object.assign({}, payload, { sinFallback: true }));
    }

    return sendBgDesdeContent(action, payload);
  }

  const ESTILOS_PANEL = [
    '.caja {',
    '  width: 390px; max-width: calc(100vw - 32px); max-height: min(76vh, 760px);',
    '  overflow-y: auto; background: #0c0c0e; border: 1px solid #26262c;',
    '  border-radius: 18px; padding: 14px; box-shadow: 0 18px 50px rgba(0,0,0,0.6);',
    '}',
    '.caja[hidden] { display: none; }',
    '.fab {',
    '  display: flex; align-items: center; gap: 8px; border: none; cursor: pointer;',
    '  background: linear-gradient(135deg, #5856d6, #0a84ff); color: #fff;',
    '  font: 700 13px system-ui, -apple-system, sans-serif; padding: 11px 15px;',
    '  border-radius: 24px; box-shadow: 0 6px 18px rgba(0,0,0,0.45);',
    '}',
    '.fab:hover { filter: brightness(1.12); }',
    '.fab .cuenta {',
    '  background: #fff; color: #10233a; border-radius: 12px;',
    '  font-size: 11px; font-weight: 700; padding: 1px 7px;',
    '}',
    '.fab .cuenta[hidden] { display: none; }',
  ].join('\n');

  const panelIg = (() => {
    let host = null;
    let shadow = null;
    let contenedor = null;
    let caja = null;
    let fab = null;
    let control = null;
    let visible = false;
    let pendientes = 0;

    function construir() {
      if (host && host.isConnected) return true;
      if (!window.AFRevision) return false;

      host = document.createElement('div');
      host.id = 'af-revision-host';
      host.style.cssText = [
        'position: fixed', 'right: 16px', 'bottom: 16px', 'z-index: 2147483000',
        'display: flex', 'flex-direction: column', 'align-items: flex-end', 'gap: 10px',
      ].join('; ');

      shadow = host.attachShadow({ mode: 'open' });
      const estilo = document.createElement('style');
      estilo.textContent = ESTILOS_PANEL;
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
      return true;
    }

    function pintarFab() {
      if (!fab) return;
      fab.querySelector('.texto').textContent = visible ? 'Cerrar' : 'Revisar';
      const cuenta = fab.querySelector('.cuenta');
      cuenta.textContent = pendientes;
      cuenta.hidden = pendientes === 0;
    }

    function abrir() {
      if (!construir()) return;
      visible = true;
      caja.hidden = false;
      pintarFab();

      if (control) control.destruir();
      control = window.AFRevision.montar({
        contenedor,
        enviar: enviarDesdeIg,
        modo: 'overlay',
        // Pestaña nueva: si navegáramos esta, se cerraría el panel
        abrirUrl: (url) => window.open(url, '_blank', 'noreferrer'),
        alCerrar: cerrar,
        alCambiarPendientes: (n) => { pendientes = n; pintarFab(); },
      });
      control.iniciar();
    }

    function cerrar() {
      visible = false;
      if (control) { control.destruir(); control = null; }
      if (caja) caja.hidden = true;
      pintarFab();
      sincronizar();
    }

    function quitar() {
      if (control) { control.destruir(); control = null; }
      visible = false;
      if (host) host.remove();
      host = null; shadow = null; contenedor = null; caja = null; fab = null;
    }

    // El botón aparece solo cuando hay algo para revisar y el panel está activado
    async function sincronizar() {
      const state = await sendBgDesdeContent('GET_STATE');
      const activado = !state || state.panelIgActivo !== false;
      pendientes = (state && state.revision) ? state.revision.length : 0;

      if (!activado || (pendientes === 0 && !visible)) { quitar(); return; }
      if (!construir()) return;
      pintarFab();
    }

    return { sincronizar };
  })();

  // El bot va sumando perfiles a revisión mientras corre, y la config puede
  // apagar el panel: en los dos casos el botón se actualiza solo.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((cambios, area) => {
      if (area !== 'local' || !cambios.af_state) return;
      panelIg.sincronizar();
    });
  }

  panelIg.sincronizar();

  // ── Listener de mensajes del background ─────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // El background hace PING antes de cada orden para saber si ya estamos
    // inyectados. Sin esta respuesta reinyecta el script en cada llamada.
    if (message.action === 'PING') {
      sendResponse({ ok: true });
      return;
    }

    if (message.action === 'FOLLOW_USER') {
      seguirUsuario(message.usuario, message.filtro).then(sendResponse);
      return true; // async
    }

    if (message.action === 'GET_PERFIL_INFO') {
      getPerfilInfo(message.usuario).then(sendResponse);
      return true;
    }

    if (message.action === 'FOLLOW_BY_API') {
      seguirPorApi(message.userId).then(sendResponse);
      return true;
    }
  });

})();
