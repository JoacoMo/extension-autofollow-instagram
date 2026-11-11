// =========================================================================
// construir.js — Arma el userscript del celular
// =========================================================================
// El userscript no tiene código propio duplicado: toma los mismos tramos de
// content.js que usa la extensión (el motor de filtros y las llamadas a la
// API de Instagram), la tarjeta de revision-ui.js, y les pega encima el
// arranque de revision-movil.js.
//
// Uso:  node movil/construir.js
// =========================================================================

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const EXT = path.join(raiz, 'ig-autofollow-extension');
const SALIDA = path.join(__dirname, 'ig-revision.user.js');

const VERSION = '1.2.0';

// Saca el texto entre "// >>> NOMBRE" y "// <<< NOMBRE" de content.js
function tramo(texto, nombre) {
  const inicio = texto.indexOf('// >>> ' + nombre);
  const fin = texto.indexOf('// <<< ' + nombre);
  if (inicio === -1 || fin === -1 || fin < inicio) {
    console.error('No encontré el tramo "' + nombre + '" en content.js');
    process.exit(1);
  }
  return texto.slice(texto.indexOf('\n', inicio) + 1, fin).trimEnd();
}

const contenido = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
const filtros = tramo(contenido, 'MOTOR DE FILTROS');
const api = tramo(contenido, 'API DE INSTAGRAM');
const tarjeta = fs.readFileSync(path.join(EXT, 'revision-ui.js'), 'utf8');
const arranque = fs.readFileSync(path.join(__dirname, 'revision-movil.js'), 'utf8');

const cabecera = [
  '// ==UserScript==',
  '// @name         IG Revisión (celular)',
  '// @namespace    https://github.com/JoacoMo/extension-autofollow-instagram',
  '// @version      ' + VERSION,
  '// @description  Revisa perfil por perfil la cola del bot, desde el celular, sin salir de Instagram',
  '// @author       JoacoMo',
  '// @match        https://www.instagram.com/*',
  '// @match        https://instagram.com/*',
  '// @grant        GM_setValue',
  '// @grant        GM_getValue',
  '// @run-at       document-idle',
  '// ==/UserScript==',
  '',
  '// GENERADO POR movil/construir.js — no lo edites a mano.',
  '// El motor de filtros y las llamadas a la API salen de content.js;',
  '// la tarjeta, de revision-ui.js; el arranque, de movil/revision-movil.js.',
  '',
].join('\n');

const cuerpo = [
  '(function () {',
  "  'use strict';",
  '',
  '  if (window.__afRevisionMovil) return;',
  '  window.__afRevisionMovil = true;',
  '',
  '  const sleep = (ms) => new Promise(r => setTimeout(r, ms));',
  '',
  '  // ===== motor de filtros (copiado de content.js) =====',
  filtros,
  '',
  '  // ===== API de Instagram (copiado de content.js) =====',
  api,
  '',
  '  // ===== la tarjeta (revision-ui.js) =====',
  tarjeta,
  '',
  '  // ===== arranque del celular (movil/revision-movil.js) =====',
  arranque,
  '})();',
  '',
].join('\n');

const salida = cabecera + cuerpo;
fs.writeFileSync(SALIDA, salida);

// Si esto no parsea, el userscript no arranca en el celular y no hay consola
// a mano para enterarse.
try {
  new Function(salida.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, ''));
} catch (e) {
  console.error('El userscript generado no parsea: ' + e.message);
  process.exit(1);
}

const kb = (salida.length / 1024).toFixed(1);
console.log('listo: movil/ig-revision.user.js (' + kb + ' KB, v' + VERSION + ')');
