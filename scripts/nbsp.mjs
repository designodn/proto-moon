#!/usr/bin/env node
/**
 * nbsp.mjs — авто-расстановка неразрывных пробелов (U+00A0) в ТЕКСТАХ макетов.
 *
 * Детерминированный фиксер русской типографики. Правит ТОЛЬКО видимые текстовые
 * узлы HTML; НЕ трогает теги, атрибуты и содержимое <script>/<style>/<pre>/
 * <textarea>/<code> (там код, а не текст). Запускается git-хуком pre-commit на
 * изменённых .html (см. .githooks/pre-commit) — поэтому руками nbsp ставить не нужно.
 *
 * Правила (безопасный консервативный набор):
 *   1) короткие предлоги/союзы (в, на, с, к, по, и, а, но, для, как …) → клеятся
 *      к СЛЕДУЮЩЕМУ слову неразрывным пробелом, чтобы не висели в конце строки;
 *   2) частицы (же, ли, бы, ведь) → клеятся к ПРЕДЫДУЩЕМУ слову;
 *   3) число + слово (5 лет, 18 общих) → неразрывный пробел;
 *   4) пробел перед длинным тире «—» → неразрывный.
 *
 * Использование:
 *   node scripts/nbsp.mjs file1.html [file2.html …]   — править на месте
 *   node scripts/nbsp.mjs --check file1.html …         — только проверка (код 1, если есть что править)
 */

import { readFileSync, writeFileSync } from 'node:fs';

const NBSP = ' ';

// Предлоги/союзы — клеим к следующему слову. Без точек/якорей — сопоставляем как
// отдельные слова (см. регэксп с lookbehind/lookahead по буквам).
const PREPOSITIONS = [
  'в','во','к','ко','с','со','о','об','обо','у','и','а','но','да','или','либо',
  'на','по','за','из','изо','от','ото','до','не','ни','для','как','что','это',
  'при','над','под','без','про','через','перед','между','около','чтобы','если',
  'то','же_skip', // (же — частица, обрабатывается отдельно ниже)
];
// Убираем плейсхолдер
const PREPS = PREPOSITIONS.filter((w) => w.indexOf('_skip') < 0);

// Частицы — клеим к предыдущему слову (nbsp ПЕРЕД ними).
const PARTICLES = ['же', 'ли', 'бы', 'ведь', 'ль'];

const LETTER = '\\p{L}';
const LETTER_NUM = '[\\p{L}\\p{N}]';

const relist = (arr) => arr.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

// 1) предлог + пробел(ы) + слово  →  предлог + NBSP + слово
const RE_PREP = new RegExp(
  `(?<![${LETTER}\\p{N}-])(${relist(PREPS)})\\x20+(?=[${LETTER}\\p{N}«„“"'])`,
  'giu'
);
// 2) слово + пробел(ы) + частица  →  слово + NBSP + частица  (частица как отдельное слово)
const RE_PARTICLE = new RegExp(
  `(?<=${LETTER_NUM})\\x20+(${relist(PARTICLES)})(?![${LETTER}\\p{N}-])`,
  'giu'
);
// 3) число + пробел(ы) + слово  →  число + NBSP + слово
const RE_NUM = new RegExp(
  `(?<![${LETTER}])(\\p{N}+)\\x20+(?=[${LETTER}])`,
  'giu'
);
// 4) пробел(ы) перед длинным тире  →  NBSP + тире
const RE_DASH = /\x20+—/g;

function fixText(text) {
  return text
    .replace(RE_PREP, (_, w) => w + NBSP)
    .replace(RE_PARTICLE, (_, p) => NBSP + p)
    .replace(RE_NUM, (_, n) => n + NBSP)
    .replace(RE_DASH, NBSP + '—');
}

// «Не-текст», который оставляем КАК ЕСТЬ: HTML-комментарии, кодовые контейнеры
// целиком (script/style/pre/textarea/code) и обычные теги. Всё, что МЕЖДУ этими
// кусками, — видимый текст, к нему применяем fixText. Вырезаем контейнеры
// целиком (а не считаем глубину), чтобы не спотыкаться о `<`/`>` внутри JS/CSS.
const NONTEXT = new RegExp(
  [
    '<!--[\\s\\S]*?-->',                                 // комментарии
    '<script\\b[^>]*>[\\s\\S]*?</script>',               // <script>…</script>
    '<style\\b[^>]*>[\\s\\S]*?</style>',                 // <style>…</style>
    '<pre\\b[^>]*>[\\s\\S]*?</pre>',
    '<textarea\\b[^>]*>[\\s\\S]*?</textarea>',
    '<code\\b[^>]*>[\\s\\S]*?</code>',
    '<[^>]*>',                                           // обычный тег
  ].join('|'),
  'gi'
);

function fixHtml(html) {
  let out = '';
  let last = 0;
  let m;
  while ((m = NONTEXT.exec(html)) !== null) {
    out += fixText(html.slice(last, m.index));  // текст до куска — правим
    out += m[0];                                 // сам кусок — без изменений
    last = NONTEXT.lastIndex;
  }
  out += fixText(html.slice(last));              // хвост после последнего куска
  return out;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => a !== '--check');

if (!files.length) {
  console.error('nbsp: укажите .html файлы');
  process.exit(0);
}

let changed = 0;
for (const f of files) {
  if (!/\.html$/.test(f)) continue;
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const fixed = fixHtml(src);
  if (fixed !== src) {
    changed++;
    if (check) {
      console.error(`nbsp: требуется правка — ${f}`);
    } else {
      writeFileSync(f, fixed);
      console.log(`nbsp: поправлен ${f}`);
    }
  }
}

if (check && changed) process.exit(1);
process.exit(0);
