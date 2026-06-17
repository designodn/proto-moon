#!/usr/bin/env node
/**
 * wire-vvz.mjs — разовый трансформер: проставляет data-person-* на карточки
 * блоков «Возможно, вы знакомы» и подключает скрипты people.
 *
 * Поддерживает три варианта разметки блока:
 *   - .vvz-portlet + .vvz-card (blur + img)         — profile, guests, lenta-q3
 *   - .vvz-portlet + .vvz-card.__message (только img) — messages
 *   - .pymk + .friend-card (blur + img)             — lenta
 *
 * Людей из листа ВВЗ всего 4 (vvz-1..vvz-4) → в колодах длиннее 4 идём по кругу,
 * счётчик сбрасывается на каждый портлет. Блок «Давно не общались» (dnoBlock)
 * пропускается — это существующие контакты, а не подсказки знакомств.
 * friends.html уже размечен числовыми id (3..6) → перенаправляем на vvz-1..4.
 *
 *   node scripts/wire-vvz.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['friends.html', 'profile.html', 'guests.html', 'lenta.html', 'lenta-q3.html', 'messages.html'];
const POOL = 4;

const isSectionStart = (l) => l.includes('<section') && (l.includes('vvz-portlet') || l.includes('pymk'));
const BLUR = /<div class="(?:vvz-card|friend-card)__blur"[^>]*><\/div>/;
const AVATAR = /<img\s+src="https:\/\/i\.pravatar[^"]*"[^>]*>/;
const TITLE = /<div class="(vvz-card|friend-card)__title([^"]*)"/;

for (const rel of FILES) {
  const path = resolve(ROOT, rel);
  let text = readFileSync(path, 'utf8');

  // friends.html: числовые id 3..6 → vvz-1..4
  text = text.replace(/data-person-(avatar|name|bg)="([3-6])"/g,
    (_, attr, n) => `data-person-${attr}="vvz-${n - 2}"`);

  const lines = text.split('\n');
  let inSection = false, skip = false, counter = 0, lastPid = null, blurOpen = false, changed = 0;
  const nextPid = () => (lastPid = 'vvz-' + (counter++ % POOL + 1));

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    if (isSectionStart(l)) {
      inSection = true; counter = 0; lastPid = null; blurOpen = false;
      skip = /id="dnoBlock"|Давно не общались/.test(l);
      continue;
    }
    if (inSection && l.includes('</section>')) { inSection = false; skip = false; continue; }
    if (!inSection || skip) continue;

    // блюр-фон — открывает карточку, назначает нового человека
    if (BLUR.test(l) && l.includes('pravatar')) {
      nextPid(); blurOpen = true;
      lines[i] = l.replace(BLUR, `<div class="vvz-card__blur" data-person-bg="${lastPid}"></div>`
        .replace('vvz-card__blur', /friend-card__blur/.test(l) ? 'friend-card__blur' : 'vvz-card__blur'));
      changed++;
      continue;
    }
    // аватар: если перед ним был блюр — та же карточка; иначе (card без блюра) — новая
    if (AVATAR.test(l)) {
      if (!blurOpen) nextPid();
      blurOpen = false;
      lines[i] = l.replace(AVATAR, `<img data-person-avatar="${lastPid}" alt="">`);
      changed++;
      continue;
    }
    // имя
    if (lastPid && TITLE.test(l) && !l.includes('help-title') && !l.includes('data-person-name')) {
      lines[i] = l.replace(TITLE, `<div class="$1__title$2" data-person-name="${lastPid}"`);
      changed++;
    }
  }
  text = lines.join('\n');

  // подключаем скрипты people, если их нет (все файлы — в корне репо)
  const inserts = [];
  if (!text.includes('data/people.js')) inserts.push('  <script src="data/people.js"></script>');
  if (!text.includes('components/people-data.js')) inserts.push('  <script src="components/people-data.js"></script>');
  if (inserts.length) {
    text = text.replace(/([ \t]*)<\/body>/,
      '  <!-- Реальные люди из Google-таблицы (data-person-*) -->\n' + inserts.join('\n') + '\n$1</body>');
  }

  writeFileSync(path, text);
  console.log(`${rel}: размечено ${changed} строк${inserts.length ? ', +скрипты people' : ''}`);
}
