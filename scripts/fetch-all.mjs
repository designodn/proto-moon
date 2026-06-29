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
  ['fetch-q3.mjs', '--activity'],    // лист «lenta-activity» (Q3-схема) → activity-lenta/lenta.html
  ['fetch-profile.mjs'],             // лист «Профили» (gid 877262163) → profile.html
  ['fetch-clips.mjs'],               // лист «Клипы» → data/clips.*
  ['fetch-activity.mjs'],            // лист «Активности» (Вокруг вас)
  ['fetch-stories.mjs'],             // лист «Сториз» (Моменты) → data/stories.*
  ['fetch-marathon.mjs'],            // лист «Марафон» → marathon.html
  ['fetch-gifts.mjs'],               // лист «Подарки» → data/gifts.*
  ['wire-vvz.mjs'],                  // доразметка data-person на ВВЗ-карточках страниц
];

// --force прокидываем во все шаги: пересобрать всё, игнорируя инкрементальный
// пропуск неизменённых листов (по умолчанию лист без правок пропускается).
const FORCE = process.argv.includes('--force');

// Картинки из таблицы складываются ОПТИМИЗИРОВАННЫМИ: media-cache (sharp) ресайзит
// до ≤1600px и перекодирует в webp q80, на диск кладётся только webp. Без sharp
// сжатие молча отключается и в репо уедут тяжёлые оригиналы — поэтому требуем его.
// Обход (прогнать без сжатия): ALLOW_NO_SHARP=1 node scripts/fetch-all.mjs
if (!process.env.ALLOW_NO_SHARP) {
  try {
    await import('sharp');
  } catch {
    console.error(
      '\n✗ sharp не установлен — картинки не сожмутся в webp (уедут тяжёлые оригиналы).\n' +
      '  Установи:            npm install   (или npm i sharp)\n' +
      '  Прогнать без сжатия: ALLOW_NO_SHARP=1 node scripts/fetch-all.mjs\n'
    );
    process.exit(1);
  }
}

const results = [];
for (const [script, ...args] of STEPS) {
  const stepArgs = FORCE ? [...args, '--force'] : args;
  const label = [script, ...stepArgs].join(' ');
  console.log(`\n════════ ${label} ════════`);
  const r = spawnSync(process.execPath, [resolve(HERE, script), ...stepArgs], { stdio: 'inherit', cwd: ROOT });
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
