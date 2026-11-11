// ==UserScript==
// @name         IG Revisión (celular)
// @namespace    https://github.com/JoacoMo/extension-autofollow-instagram
// @version      1.1.0
// @description  Revisa perfil por perfil la cola del bot, desde el celular, sin salir de Instagram
// @author       JoacoMo
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

// GENERADO POR movil/construir.js — no lo edites a mano.
// El motor de filtros y las llamadas a la API salen de content.js;
// la tarjeta, de revision-ui.js; el arranque, de movil/revision-movil.js.
(function () {
  'use strict';

  if (window.__afRevisionMovil) return;
  window.__afRevisionMovil = true;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ===== motor de filtros (copiado de content.js) =====
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

    // Emprendimientos y servicios por cuenta propia
    'emprendimiento', 'emprendedor*', 'marca propia', 'hecho a mano',
    'productos artesanales', 'venta mayorista', 'por mayor', 'lista de precios',
    'pedidos por dm', 'consultas por dm', 'envios a todo el pais',
    'estudio juridico', 'estudio contable', 'estudio de tatuajes', 'tatuador*',
    'manicuria', 'nail*', 'esculpidas', 'semipermanente', 'lashes', 'pestañas',
    'diseño de cejas', 'make up artist', 'makeup artist', 'maquillaje profesional',
    'depilacion', 'cosmetologia', 'estetica', 'spa', 'masajes',
    'reposteria', 'pasteleria', 'tortas', 'cupcakes', 'souvenirs',
    'decoracion de eventos', 'ambientacion', 'sesiones de fotos',
    'personal trainer', 'entrenador personal',
  ];

  // ── Cuentas que no son una persona ─────────────────────────────────────
  // Instituciones, organismos, medios y clubes. Muchas mencionan la facultad
  // o la ciudad, así que sin esto pasarían el filtro de zona.

  const TERMINOS_INSTITUCION = [
    'cuenta oficial', 'pagina oficial', 'perfil oficial', 'sitio oficial', 'official account',

    // Casas de estudio (la institución, no quien estudia ahí)
    'universidad nacional', 'universidad tecnologica', 'universidad catolica',
    'universidad provincial', 'universidad empresarial', 'universidad blas pascal',
    'centro de estudiantes', 'federacion universitaria',
    'instituto superior', 'instituto tecnico', 'centro educativo', 'academia de',
    'jardin de infantes', 'escuela primaria', 'escuela secundaria', 'colegio nacional',
    'escuela de futbol',

    // Estado y organismos
    'municipalidad', 'ministerio de', 'secretaria de', 'subsecretaria',
    'gobierno de', 'direccion general', 'concejo deliberante', 'legislatura',
    'defensoria', 'agencia cordoba',

    // Organizaciones
    'fundacion', 'asociacion civil', 'asociacion de', 'ong', 'cooperativa',
    'mutual', 'sindicato', 'gremio', 'camara de comercio', 'colegio de',
    'club atletico', 'club deportivo', 'club social',
    'parroquia', 'iglesia', 'capilla', 'congregacion',

    // Salud, cultura y medios
    'hospital', 'sanatorio', 'clinica', 'centro de salud',
    'biblioteca', 'museo', 'medio de comunicacion', 'portal de noticias',
    'agencia de noticias', 'diario', 'periodico', 'revista', 'emisora',
  ];

  // ── Figuras públicas ───────────────────────────────────────────────────
  // Lo más confiable es el tilde de verificado y la cantidad de seguidores
  // (se chequea aparte, con números). Esto cubre lo que escriben en la bio.

  const TERMINOS_FAMOSO = [
    'figura publica', 'public figure', 'personalidad publica', 'artista musical',
    'booking', 'contrataciones', 'representante', 'representacion', 'management',
    'prensa y difusion', 'contacto comercial', 'canjes', 'publicidad',
    'embajador de', 'embajadora de', 'sponsor',
    'influencer', 'creador de contenido', 'creadora de contenido', 'content creator',
    'youtuber', 'streamer', 'twitch', 'tiktoker', 'modelo profesional',
    'cantante', 'musico', 'banda de', 'productor musical', 'beatmaker',
    'freestyler', 'trapero', 'actor', 'actriz', 'conductor', 'conductora',
    'locutor', 'locutora', 'periodista deportivo', 'futbolista', 'jugador de',
  ];

  // ── Vida ya armada: familia, pareja ────────────────────────────────────
  // Van en frases, no en palabras sueltas: "mama" sola aparece en cualquier
  // bio ("mamá te amo"), "mama de" no.

  const TERMINOS_FAMILIA = [
    'mama de', 'madre de', 'mami de', 'papa de', 'padre de', 'papi de',
    'mama soltera', 'mama primeriza', 'futura mama', 'orgullosa mama', 'orgulloso papa',
    'embarazada', 'mi bebe', 'mi hijo', 'mi hija', 'mis hijos', 'mis hijas',
    'mis nenes', 'mis nenas', 'mom of', 'dad of', 'mother of', 'father of',
    'boy mom', 'girl mom',
    'mi esposa', 'mi esposo', 'mi marido', 'mi señora', 'esposa de', 'esposo de',
    'casada', 'casado', 'casados', 'wife', 'husband',
    'abuela de', 'abuelo de', 'soy abuela', 'soy abuelo',
  ];

  // ── Profesionales recibidos ────────────────────────────────────────────
  // Ojo: "futura abogada" es una estudiante. Por eso estas palabras no
  // cuentan si en el mismo perfil hay alguna señal de que todavía estudia.

  const TERMINOS_PROFESION = [
    'recibida', 'recibido', 'egresada', 'egresado', 'graduada', 'graduado',
    'matricula profesional', 'posgrado', 'maestria', 'doctorado', 'mba', 'phd',
    'residencia medica',
    'abogada', 'abogado', 'escribana', 'escribano', 'contadora', 'contador',
    'licenciada', 'licenciado', 'lic', 'ing', 'ingeniera', 'ingeniero',
    'arquitecta', 'arquitecto', 'dra', 'medica', 'medico', 'cirujano',
    'odontologa', 'odontologo', 'psicologa', 'psicologo', 'psicopedagoga',
    'nutricionista', 'kinesiologa', 'kinesiologo', 'fonoaudiologa',
    'veterinaria', 'veterinario', 'farmaceutica', 'bioquimica', 'bioquimico',
    'enfermera', 'enfermero', 'docente', 'profesora', 'profesor', 'maestra',
    'traductora', 'traductor', 'economista', 'martillera', 'terapeuta',
    'consultora', 'consultor', 'asesora', 'asesor', 'coach',
  ];

  // ── Señales de que todavía estudia ─────────────────────────────────────
  // Frases que escribe una persona, no una institución: una facultad no dice
  // "estudiante de", dice "formamos estudiantes".

  const SENALES_ESTUDIANTE = [
    'estudiante de', 'estudiante en', 'soy estudiante', 'estudiando',
    'cursando', 'cursada', 'parciales', 'ingresante', 'alumna', 'alumno',
    'futura', 'futuro', 'universitaria', 'universitario', 'facu', 'promo',
  ];

  // Para el modo estricto también vale nombrar dónde estudia
  const TERMINOS_ESTUDIO = [
    'facultad', 'universidad', 'carrera', 'uni', 'colegio', 'secundario',
    'unc', 'utn', 'frc', 'upc', 'ucc', 'ubp', 'ues21', 'siglo21', 'siglo 21',
    'iua', 'ispc', 'ciudad universitaria', 'blas pascal',
    'famaf', 'fcefyn', 'fcefn', 'ffyh', 'fcm', 'fcq', 'fcc', 'faud', 'fcs',
    'fce', 'fca', 'fodo',
  ];

  const PROHIBIDAS_DEFAULT = ['dj'];
  const SEGUIDORES_FAMOSO_DEFAULT = 20000;

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
      cfg.institucionActiva !== false,
      cfg.famosoActivo !== false,
      cfg.familiaActiva !== false,
      cfg.profesionActiva !== false,
    ]);
    if (cacheFiltro && cacheFiltro.clave === clave) return cacheFiltro;

    const permitidos = [...TERMINOS_CORDOBA];
    if (cfg.incluirInterior === true) permitidos.push(...TERMINOS_INTERIOR);
    permitidos.push(...(cfg.extra || []));

    const negocio = cfg.negocioActivo === false
      ? []
      : [...TERMINOS_NEGOCIO, ...(cfg.negocioExtra || [])];

    const siActiva = (bandera, lista) => (bandera === false ? [] : lista);

    cacheFiltro = {
      clave,
      permitidos: compilarLista(permitidos),
      prohibidas: compilarLista(cfg.prohibidas || PROHIBIDAS_DEFAULT),
      negocio: compilarLista(negocio),
      institucion: compilarLista(siActiva(cfg.institucionActiva, TERMINOS_INSTITUCION)),
      famoso: compilarLista(siActiva(cfg.famosoActivo, TERMINOS_FAMOSO)),
      familia: compilarLista(siActiva(cfg.familiaActiva, TERMINOS_FAMILIA)),
      profesion: compilarLista(siActiva(cfg.profesionActiva, TERMINOS_PROFESION)),
      estudiante: compilarLista(SENALES_ESTUDIANTE),
      estudio: compilarLista([...SENALES_ESTUDIANTE, ...TERMINOS_ESTUDIO]),
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

    // Todo lo que descarta va antes que Córdoba: la facultad, el boliche y la
    // heladería de Córdoba también dicen "cba" en la bio.
    const estudia = buscarTermino(filtro.estudiante, textos);

    // Una facultad no dice "estudiante de": si lo dice, es alguien que estudia ahí
    const institucion = estudia ? null : buscarTermino(filtro.institucion, textos);
    if (institucion) return { estado: 'institucion', termino: institucion };

    const famoso = buscarTermino(filtro.famoso, textos);
    if (famoso) return { estado: 'famoso', termino: famoso };

    const negocio = buscarTermino(filtro.negocio, textos);
    if (negocio) return { estado: 'negocio', termino: negocio };

    const familia = buscarTermino(filtro.familia, textos);
    if (familia) return { estado: 'familia', termino: familia };

    // "futura abogada" es estudiante, "abogada" a secas ya se recibió
    const profesion = estudia ? null : buscarTermino(filtro.profesion, textos);
    if (profesion) return { estado: 'profesion', termino: profesion };

    const permitido = buscarTermino(filtro.permitidos, textos);
    if (!permitido) return { estado: 'sin_cordoba' };

    // Modo estricto: además de la zona, tiene que haber señal de que estudia
    if (config && config.soloEstudiantes === true) {
      if (!buscarTermino(filtro.estudio, textos)) {
        return { estado: 'sin_estudio', termino: permitido };
      }
    }

    return { estado: 'cordoba', termino: permitido, estudia: estudia || null };
  }

  // ── Figura pública por números, no por texto ───────────────────────────
  // El tilde de verificado y un número alto de seguidores son la señal más
  // confiable. Los datos salen del DOM (bot) o de la API (revisión).

  function evaluarFama(datos, config) {
    const cfg = config || {};
    if (cfg.famosoActivo === false) return null;
    const d = datos || {};

    if (d.verificado) return { estado: 'famoso', termino: 'cuenta verificada' };

    const tope = Number(cfg.famosoMaxSeguidores) > 0
      ? Number(cfg.famosoMaxSeguidores)
      : SEGUIDORES_FAMOSO_DEFAULT;

    if (Number.isFinite(d.seguidores) && d.seguidores > tope) {
      return { estado: 'famoso', termino: `${d.seguidores.toLocaleString('es-AR')} seguidores` };
    }
    return null;
  }

  // Lo que se puede leer del perfil abierto: el tilde y el contador de
  // seguidores. Instagram deja el número exacto en el title del span.
  function senalesDelDom() {
    const header = document.querySelector('header') || document.body;

    const verificado = !!header.querySelector(
      'svg[aria-label*="erificad"], svg[aria-label*="erified"]'
    );

    let seguidores = null;
    const enlace = header.querySelector('a[href$="/followers/"]')
      || header.querySelector('a[href*="/followers"]');
    if (enlace) {
      const span = enlace.querySelector('span[title]');
      const crudo = span ? span.getAttribute('title') : (enlace.innerText || '');
      seguidores = numeroDeSeguidores(crudo);
    }

    return { verificado, seguidores };
  }

  // "1.234" → 1234 · "15,3 mil" → 15300 · "1,2 M" → 1200000
  function numeroDeSeguidores(crudo) {
    const texto = String(crudo || '').toLowerCase().trim();
    const m = texto.match(/([\d.,]+)\s*(mil|k|m|millones)?/);
    if (!m) return null;

    // es-AR: el punto separa miles y la coma es decimal. En inglés es al revés,
    // y ahí la coma siempre viene seguida de tres dígitos ("25,000").
    const crudoNumero = /^\d{1,3}(,\d{3})+$/.test(m[1])
      ? m[1].replace(/,/g, '')
      : m[1].replace(/\./g, '').replace(',', '.');
    const base = Number(crudoNumero);
    if (!Number.isFinite(base)) return null;

    const sufijo = m[2];
    if (sufijo === 'mil' || sufijo === 'k') return Math.round(base * 1000);
    if (sufijo === 'm' || sufijo === 'millones') return Math.round(base * 1000000);
    return Math.round(base);
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
    const max = Number(cfg.edadMax) > 0 ? Number(cfg.edadMax) : 26;

    const secundario = senalDeSecundario(textoCrudo);
    if (secundario) return { estado: 'secundario', detalle: secundario, min, max };

    const est = estimarEdad(textoCrudo);
    if (!est) return { estado: 'sin_dato', min, max };
    if (est.edad < min || est.edad > max) {
      return Object.assign({ estado: 'fuera_rango', min, max }, est);
    }
    return Object.assign({ estado: 'ok', min, max }, est);
  }

  // ===== API de Instagram (copiado de content.js) =====
  // =======================================================================
  // DATOS DE PERFIL — para la pantalla de revisión
  // =======================================================================
  // Se usa la misma API web que consume instagram.com cuando abrís un perfil.
  // Al correr dentro de instagram.com la request va con tu sesión y es una
  // sola llamada por perfil, en vez de navegar y scrapear el DOM.
  //
  // Instagram viene cerrando web_profile_info de a poco: para algunas cuentas
  // contesta 404 o 400 aunque el perfil exista y estés con la sesión abierta.
  // Por eso hay dos respaldos que todavía responden, y con lo que devuelvan
  // se arma una tarjeta parcial en vez de dar el perfil por inexistente.

  const IG_APP_ID_FALLBACK = '936619743392459';
  const IG_ASBD_ID_FALLBACK = '129477';

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

  function getAsbdId() {
    try {
      const m = document.documentElement.innerHTML.match(/"asbd_id"\s*:\s*"?(\d+)"?/);
      if (m) return m[1];
    } catch (e) {}
    return IG_ASBD_ID_FALLBACK;
  }

  // Instagram marca la sesión con este valor y lo exige en sus propias
  // llamadas; sin él responde 400 en varias cuentas.
  function getWwwClaim() {
    try {
      return sessionStorage.getItem('www-claim-v2') || '0';
    } catch (e) {
      return '0';
    }
  }

  function getCookie(nombre) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // Las mismas cabeceras que manda el Instagram web
  function cabecerasIg(extra) {
    const cabeceras = {
      'X-IG-App-ID': getAppId(),
      'X-ASBD-ID': getAsbdId(),
      'X-IG-WWW-Claim': getWwwClaim(),
      'X-Requested-With': 'XMLHttpRequest',
    };
    const csrf = getCookie('csrftoken');
    if (csrf) cabeceras['X-CSRFToken'] = csrf;
    return Object.assign(cabeceras, extra || {});
  }

  function explicarEstado(status) {
    if (status === 404) {
      return 'Instagram no devolvió el perfil (404). Puede que haya cambiado de nombre de usuario, ' +
             'o que te esté cortando las consultas por un rato.';
    }
    if (status === 400) {
      return 'Instagram rechazó la consulta (400). Suele arreglarse recargando instagram.com.';
    }
    if (status === 401 || status === 403) {
      return 'Sesión cerrada o sin permiso: volvé a entrar a Instagram.';
    }
    if (status === 429) {
      return 'Instagram pidió esperar: demasiadas consultas seguidas.';
    }
    return 'Instagram respondió ' + status + '.';
  }

  async function pedirJson(url) {
    try {
      const res = await fetch(url, { headers: cabecerasIg(), credentials: 'include' });
      if (!res.ok) return { ok: false, status: res.status, error: explicarEstado(res.status) };
      return { ok: true, status: res.status, json: await res.json() };
    } catch (e) {
      return { ok: false, status: 0, error: e?.message || 'No se pudo consultar a Instagram' };
    }
  }

  function limpiarUsuario(usuario) {
    return String(usuario || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  }

  // Calcula los filtros sobre lo que haya y completa lo que falte
  function armarPerfil(base) {
    const perfil = Object.assign({
      id: null, usuario: '', nombre: '', bio: '', enlaceExterno: '', fotoPerfil: '',
      privado: false, verificado: false, seguidores: null, siguiendo: null,
      publicaciones: null, yaLoSigo: false, solicitado: false,
      enComun: null, enComunEjemplos: [], posts: [], parcial: false, aviso: '',
    }, base || {});

    const textoFiltro = [perfil.nombre, perfil.usuario, perfil.bio, perfil.enlaceExterno].join(' ');
    perfil.analisis = {
      cordoba: evaluarPerfil(textoFiltro, {}),
      edad: evaluarEdad(textoFiltro, {}),
      fama: evaluarFama({ verificado: perfil.verificado, seguidores: perfil.seguidores }, {}),
    };
    return perfil;
  }

  // ── Camino principal: el mismo endpoint que usa la web ─────────────────

  async function perfilDesdeWebInfo(username) {
    const r = await pedirJson(
      'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username)
    );
    if (!r.ok) return r;

    const u = r.json?.data?.user;
    if (!u) return { ok: false, status: r.status, error: 'Respuesta inesperada de Instagram' };

    const posts = (u.edge_owner_to_timeline_media?.edges || [])
      .slice(0, 9)
      .map(e => ({
        imagen: e.node?.thumbnail_src || e.node?.display_url || '',
        esVideo: !!e.node?.is_video,
        enlace: e.node?.shortcode ? 'https://www.instagram.com/p/' + e.node.shortcode + '/' : '',
      }))
      .filter(p => p.imagen);

    // Gente que vos seguís y también lo sigue: la señal más rápida de si
    // es del mismo ambiente. Instagram la devuelve con hasta 3 ejemplos.
    const comun = u.edge_mutual_followed_by || {};
    const comunEjemplos = (comun.edges || [])
      .map(e => e.node && e.node.username)
      .filter(Boolean);

    return { ok: true, perfil: armarPerfil({
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
      enComun: Number.isFinite(comun.count) ? comun.count : null,
      enComunEjemplos: comunEjemplos.slice(0, 3),
      posts,
    }) };
  }

  // ── Respaldo 1: el feed del usuario (trae las fotos) ───────────────────

  function fotoDeItem(item) {
    const fuente = item?.carousel_media?.[0] || item;
    const candidatas = fuente?.image_versions2?.candidates || [];
    if (!candidatas.length) return '';
    // La primera es la más grande; para una grilla alcanza una del medio
    const media = candidatas.find(c => c.width >= 240 && c.width <= 720);
    return (media || candidatas[0]).url || '';
  }

  async function perfilDesdeFeed(username) {
    const r = await pedirJson(
      'https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(username) + '/username/?count=9'
    );
    if (!r.ok) return r;

    const items = r.json?.items || [];
    const u = r.json?.user || items[0]?.user;
    if (!u) return { ok: false, status: r.status, error: 'El feed no trajo el perfil' };

    const amistad = u.friendship_status || {};
    return { ok: true, perfil: armarPerfil({
      id: String(u.pk || u.id || ''),
      usuario: u.username || username,
      nombre: u.full_name || '',
      bio: u.biography || '',
      fotoPerfil: u.profile_pic_url || '',
      privado: !!u.is_private,
      verificado: !!u.is_verified,
      yaLoSigo: !!amistad.following,
      solicitado: !!amistad.outgoing_request,
      posts: items.slice(0, 9)
        .map(item => ({
          imagen: fotoDeItem(item),
          esVideo: item?.media_type === 2,
          enlace: item?.code ? 'https://www.instagram.com/p/' + item.code + '/' : '',
        }))
        .filter(p => p.imagen),
    }) };
  }

  // ── Respaldo 2: el buscador (trae el id y la foto de perfil) ───────────

  async function perfilDesdeBusqueda(username) {
    const r = await pedirJson(
      'https://www.instagram.com/web/search/topsearch/?context=blended&count=10&query=' +
      encodeURIComponent(username)
    );
    if (!r.ok) return r;

    const buscado = username.toLowerCase();
    const encontrado = (r.json?.users || [])
      .map(x => x.user)
      .find(u => u && String(u.username || '').toLowerCase() === buscado);

    if (!encontrado) return { ok: false, status: r.status, error: 'El buscador no encontró @' + username };

    // El byline del buscador suele decir "1.234 seguidores"
    const seguidores = numeroDeSeguidores(encontrado.byline || '');
    const amistad = encontrado.friendship_status || {};

    return { ok: true, perfil: armarPerfil({
      id: String(encontrado.pk || ''),
      usuario: encontrado.username || username,
      nombre: encontrado.full_name || '',
      fotoPerfil: encontrado.profile_pic_url || '',
      privado: !!encontrado.is_private,
      verificado: !!encontrado.is_verified,
      seguidores: /seguidor|follower/i.test(encontrado.byline || '') ? seguidores : null,
      yaLoSigo: !!amistad.following,
      solicitado: !!amistad.outgoing_request,
    }) };
  }

  // ── Lo que usa la pantalla de revisión ─────────────────────────────────

  async function getPerfilInfo(usuario) {
    const username = limpiarUsuario(usuario);
    if (!username) return { ok: false, error: 'Usuario vacío' };

    const principal = await perfilDesdeWebInfo(username);
    if (principal.ok) return principal;

    // Si el endpoint principal se cerró para esta cuenta, se arma lo que se
    // pueda con los otros dos antes de dar el perfil por perdido.
    const feed = await perfilDesdeFeed(username);
    const busqueda = await perfilDesdeBusqueda(username);

    if (!feed.ok && !busqueda.ok) {
      return { ok: false, error: principal.error, status: principal.status };
    }

    const desdeFeed = feed.ok ? feed.perfil : null;
    const desdeBusqueda = busqueda.ok ? busqueda.perfil : null;

    const mezcla = armarPerfil({
      id: desdeFeed?.id || desdeBusqueda?.id || null,
      usuario: desdeFeed?.usuario || desdeBusqueda?.usuario || username,
      nombre: desdeFeed?.nombre || desdeBusqueda?.nombre || '',
      bio: desdeFeed?.bio || '',
      fotoPerfil: desdeBusqueda?.fotoPerfil || desdeFeed?.fotoPerfil || '',
      privado: !!(desdeFeed?.privado || desdeBusqueda?.privado),
      verificado: !!(desdeFeed?.verificado || desdeBusqueda?.verificado),
      seguidores: desdeBusqueda?.seguidores ?? null,
      yaLoSigo: !!(desdeFeed?.yaLoSigo || desdeBusqueda?.yaLoSigo),
      solicitado: !!(desdeFeed?.solicitado || desdeBusqueda?.solicitado),
      posts: desdeFeed?.posts || [],
      parcial: true,
      aviso: 'Instagram no dio los datos completos de este perfil, así que falta ' +
             'la bio y los números. ' + (principal.error || ''),
    });

    return { ok: true, perfil: mezcla };
  }

  // ── Seguir ─────────────────────────────────────────────────────────────

  // Seguir con un solo request, igual que el botón de la web.
  async function seguirPorApi(userId) {
    const csrf = getCookie('csrftoken');
    if (!csrf) return { ok: false, error: 'No se encontró el token de sesión' };

    try {
      const res = await fetch('https://www.instagram.com/api/v1/friendships/create/' + userId + '/', {
        method: 'POST',
        headers: cabecerasIg({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        credentials: 'include',
        body: '',
      });

      if (res.status === 429) return { ok: false, error: 'Instagram pidió esperar antes de seguir a alguien más' };
      if (!res.ok) return { ok: false, error: explicarEstado(res.status) };

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

  // Cuando no se pudo leer el perfil no hay id, pero el buscador lo sabe
  async function seguirAUsuario(usuario, userId) {
    let id = userId;

    if (!id) {
      const encontrado = await perfilDesdeBusqueda(limpiarUsuario(usuario));
      if (encontrado.ok) id = encontrado.perfil.id;
    }

    if (!id) return { ok: false, error: 'No se pudo averiguar el id de @' + limpiarUsuario(usuario) };
    return seguirPorApi(id);
  }

  // Para pegar en la consola cuando algo no anda:
  //   await __afFiltro.diagnostico('usuario')
  async function diagnosticarPerfil(usuario) {
    const username = limpiarUsuario(usuario);
    const resumen = (r) => (r.ok ? 'ok' : (r.status || 0) + ' · ' + r.error);
    const [web, feed, busqueda] = await Promise.all([
      perfilDesdeWebInfo(username),
      perfilDesdeFeed(username),
      perfilDesdeBusqueda(username),
    ]);
    return {
      usuario: username,
      sesion: getCookie('sessionid') ? 'hay cookie de sesión' : 'SIN cookie de sesión',
      csrf: getCookie('csrftoken') ? 'ok' : 'falta',
      appId: getAppId(),
      asbdId: getAsbdId(),
      wwwClaim: getWwwClaim(),
      web_profile_info: resumen(web),
      feed_usuario: resumen(feed),
      buscador: resumen(busqueda),
    };
  }

  // ===== la tarjeta (revision-ui.js) =====
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
    '.af-rev .af-stat-comun b { color: #4ade80; }',
    '.af-rev .af-comun {',
    '  padding: 10px 16px 0; font-size: 11.5px; color: #8e8e93; line-height: 1.5;',
    '}',
    '.af-rev .af-comun b { color: #4ade80; font-weight: 600; }',
    '.af-rev--popup .af-comun { padding: 9px 12px 0; }',
    /* Foto que ni el CDN ni el background pudieron traer */
    '.af-rev .af-foto.af-rota { background: repeating-linear-gradient(45deg, #1a1a1f, #1a1a1f 6px, #15151a 6px, #15151a 12px); }',
    '.af-rev img.af-rota { background: #26262c; }',
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
    '.af-rev .af-reintentar { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 16px; }',
    '.af-rev .af-reintentar button {',
    '  background: #1f1f23; border: 1px solid #3a3a42; color: #f0f0f0;',
    '  border-radius: 10px; padding: 9px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer;',
    '}',
    '.af-rev .af-reintentar button:hover { background: #2a2a31; }',
    /* La tarjeta se armó con datos sueltos porque Instagram no los dio todos */
    '.af-rev .af-parcial {',
    '  background: #2a1a00; color: #e0a800; font-size: 11px; line-height: 1.5;',
    '  padding: 9px 14px; border-bottom: 1px solid #5a3c00;',
    '}',
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

  // Por qué lo habría descartado el bot, para mostrarlo como contexto
  const MOTIVOS_DESCARTE = {
    negocio: 'Negocio',
    institucion: 'Institución',
    famoso: 'Figura pública',
    familia: 'Familia',
    profesion: 'Recibido',
    prohibida: 'Palabra prohibida',
  };

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
      if (zona.estado === 'cordoba') {
        out.push('<span class="af-badge af-badge-ok">Zona: ' + esc(zona.termino) + '</span>');
      } else if (MOTIVOS_DESCARTE[zona.estado]) {
        out.push('<span class="af-badge af-badge-alerta">' +
          MOTIVOS_DESCARTE[zona.estado] + ': ' + esc(zona.termino) + '</span>');
      }
      if (a.fama) {
        out.push('<span class="af-badge af-badge-alerta">Figura pública: ' + esc(a.fama.termino) + '</span>');
      }
      const edad = a.edad || {};
      if (edad.estado === 'secundario') {
        out.push('<span class="af-badge af-badge-alerta">Secundario: ' + esc(edad.detalle) + '</span>');
      } else if (edad.edad) {
        const fuera = edad.estado === 'fuera_rango';
        out.push('<span class="af-badge af-badge-' + (fuera ? 'alerta' : 'ok') + '">~' +
          edad.edad + ' años</span>');
      }
      return out.join('');
    }

    // "Lo siguen @sofi, @juan y 12 más": de un vistazo se ve si es del ambiente
    function lineaEnComun(p) {
      const ejemplos = p.enComunEjemplos || [];
      if (!ejemplos.length) return '';

      const nombres = ejemplos.map(u => '<b>@' + esc(u) + '</b>').join(', ');
      const resto = (p.enComun || 0) - ejemplos.length;
      return '<div class="af-comun">👥 Lo siguen ' + nombres +
        (resto > 0 ? ' y ' + resto + ' más' : '') + ' de los que seguís</div>';
    }

    function render(p) {
      const posts = p.posts || [];
      const grilla = posts.length > 0
        ? '<div class="af-grilla">' + posts.map(f =>
            '<div class="af-foto" data-grande="' + esc(f.imagen) + '">' +
            '<img data-src="' + esc(f.imagen) + '" alt="" referrerpolicy="no-referrer">' +
            (f.esVideo ? '<span class="af-foto-video">▶</span>' : '') +
            '</div>').join('') + '</div>'
        : '<div class="af-sin-fotos">' + (p.privado
            ? '🔒 La cuenta es privada: no se pueden ver las publicaciones sin seguirla.'
            : 'Esta cuenta no tiene publicaciones visibles.') + '</div>';

      el('contenido').innerHTML =
        '<div class="af-card" data-rol="card">' +
          (p.parcial ? '<div class="af-parcial">⚠️ ' + esc(p.aviso || 'Datos incompletos') + '</div>' : '') +
          '<div class="af-card-header">' +
            '<img class="af-avatar" data-src="' + esc(p.fotoPerfil) + '" alt="" referrerpolicy="no-referrer" data-grande="' + esc(p.fotoPerfil) + '">' +
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
            (p.enComun == null ? '' :
              '<div class="af-stat af-stat-comun"><b>' + miles(p.enComun) + '</b><span>En común</span></div>') +
          '</div>' +
          lineaEnComun(p) +
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
      cargarImagenes();
    }

    // ── Fotos ────────────────────────────────────────────────────────────
    // Instagram sirve las fotos desde su CDN y fuera de instagram.com a veces
    // las rechaza. Por eso el src se pone acá y no en el HTML: así el manejo
    // del error queda enganchado antes de que empiece la carga, y si falla
    // (o si no carga nunca) la trae el background, que sí tiene permiso.

    function cargarImagenes() {
      raiz.querySelectorAll('img[data-src]').forEach(img => {
        const url = img.getAttribute('data-src');
        img.removeAttribute('data-src');
        cargarImagen(img, url);
      });
    }

    function cargarImagen(img, url) {
      if (!url) return;
      let pedida = false;

      const porElBackground = async () => {
        if (pedida || destruido) return;
        pedida = true;
        if (url.startsWith('data:')) return;

        const res = await enviar('FETCH_IMAGEN', { url });
        if (destruido) return;

        if (res && res.ok && res.dataUrl) {
          img.src = res.dataUrl;
          const wrap = img.closest('[data-grande]');
          if (wrap) wrap.dataset.grande = res.dataUrl;
        } else {
          img.removeAttribute('src');
          img.alt = 'sin foto';
          const contenedorFoto = img.closest('.af-foto') || img;
          contenedorFoto.classList.add('af-rota');
          console.warn('[revisión] no se pudo cargar la foto', url, res && res.error);
        }
      };

      img.addEventListener('error', porElBackground, { once: true });
      img.src = url;

      // Red de seguridad: hay fallas que no disparan el evento error
      setTimeout(() => {
        if (!img.complete || img.naturalWidth === 0) porElBackground();
      }, 3000);
    }

    // ── Foto ampliada ────────────────────────────────────────────────────

    function abrirLightbox(url) {
      if (!url) return;
      const box = doc.createElement('div');
      box.className = 'af-lightbox';
      box.innerHTML =
        '<button class="af-lightbox-cerrar" title="Cerrar">✕</button>' +
        '<img alt="" referrerpolicy="no-referrer">';
      box.addEventListener('click', () => box.remove());
      raiz.appendChild(box);
      const foto = box.querySelector('img');
      foto.removeAttribute('data-src');
      cargarImagen(foto, url);
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
          esc(motivo) +
          '<div class="af-reintentar"><button data-rol="reintentar">↻ Reintentar</button>' +
          '<a data-perfil="1" href="' + esc(urlPerfil(usuario)) + '">Abrir en Instagram ↗</a></div>');

        el('reintentar').addEventListener('click', () => {
          cache.delete(usuario);
          mostrarActual();
        });

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


  // ===== arranque del celular (movil/revision-movil.js) =====
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

})();
