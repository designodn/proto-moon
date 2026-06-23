#!/usr/bin/env node
/**
 * fetch-all.mjs — единый сбор обновлений со ВСЕЙ Google-таблицы за раз.
 * Прогоняет все fetch-скрипты по порядку (люди — первыми, остальные резолвят
 * людей по id), затем wire-vvz (доразметка ВВЗ-карточек на страницах).
 *
 * Падение одного шага не останавливает остальные — в конце печатается сводка.
 *
 *   node scripts/fetch-all.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// Порядок важен: people → ленты/контент → подарки → доразметка vvz.
// Шаг — это [скрипт, ...аргументы]; первый элемент задаёт лейбл в логах.
const STEPS = [
  ['fetch-people.mjs'],              // лист «Люди» → data/people.*
  ['fetch-feed.mjs'],                // лист «Посты» (New Vision) → new-vision/lenta.html
  ['fetch-q3.mjs'],                  // лист «Q3-посты» → lenta-q3.html
  ['fetch-q3.mjs', '--tribune'],     // лист «Трибуна» (gid 803749593) → tribune.html
  ['fetch-profile.mjs'],             // лист «Профили» (gid 877262163) → profile.html
  ['fetch-clips.mjs'],               // лист «Клипы» → data/clips.*
  ['fetch-activity.mjs'],            // лист «Активности» (Вокруг вас)
  ['fetch-stories.mjs'],             // лист «Сториз» (Моменты) → data/stories.*
  ['fetch-marathon.mjs'],            // лист «Марафон» → marathon.html
  ['fetch-gifts.mjs'],               // лист «Подарки» → data/gifts.*
  ['wire-vvz.mjs'],                  // доразметка data-person на ВВЗ-карточках страниц
];

const results = [];
for (const [script, ...args] of STEPS) {
  const label = [script, ...args].join(' ');
  console.log(`\n════════ ${label} ════════`);
  const r = spawnSync(process.execPath, [resolve(HERE, script), ...args], { stdio: 'inherit', cwd: ROOT });
  results.push({ step: label, ok: r.status === 0 });
  if (r.status !== 0) console.error(`⚠ ${label}: ошибка (код ${r.status ?? '—'}) — продолжаю дальше`);
}

console.log('\n════════ СВОДКА ════════');
for (const { step, ok } of results) console.log(`${ok ? '✓' : '✗'} ${step}`);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length} шаг(ов) с ошибкой — проверь доступ к листам/сети у них.`);
  process.exit(1);
}
console.log('\nГотово. Проверь git diff и закоммить изменения.');
