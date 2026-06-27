/**
 * sheet-cache.mjs — пропуск неизменённых листов (инкрементальный синк).
 *
 * Зачем: gviz отдаёт лист целиком и media-cache перекачивает все картинки на
 * каждом прогоне, чтобы сравнить хэши — это «прогон с нуля». Если содержимое
 * листа (CSV) не менялось И код рендера тот же — пересобирать нечего: ни
 * ре-рендера, ни перекачки картинок. Google не даёт времени правки по
 * отдельному листу (только по всему файлу), поэтому детект — по хэшу CSV,
 * который всё равно дёшево скачать.
 *
 *   import { createSyncGate } from './lib/sheet-cache.mjs';
 *   const gate = createSyncGate({ root: ROOT, key: 'clips',
 *                                 codeDeps: [fileURLToPath(import.meta.url)] });
 *   const csvText = await res.text();
 *   if (gate.unchanged(csvText) && !FORCE) { console.log('без изменений'); return; }
 *   … собираем как обычно …
 *   gate.commit();        // запоминаем хэш ТОЛЬКО после успешной пересборки
 *
 * Состояние — общий файл data/.sync-state.json (key → { csv, code, at }).
 * Скрипты в fetch-all.mjs идут последовательно, поэтому гонок за файл нет.
 *
 * `codeDeps` — файлы, чьё изменение должно форсировать пересборку (сам скрипт +
 * шаблоны/хелперы, от которых он зависит). Правка кода → code-хэш меняется →
 * лист пересобирается даже при неизменном CSV.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export function createSyncGate({ root, key, codeDeps = [] }) {
  const storePath = resolve(root, 'data/.sync-state.json');
  let store = {};
  try { store = JSON.parse(readFileSync(storePath, 'utf8')); } catch { /* первый запуск */ }

  // Хэш кода: содержимое всех codeDeps. Недоступный файл → пустая строка
  // (не валим прогон из-за детекта — в худшем случае лишний раз пересоберём).
  const codeHash = sha(codeDeps.map(f => {
    try { return readFileSync(f, 'utf8'); } catch { return ''; }
  }).join('\0'));

  let pendingCsvHash = null;

  return {
    /** Считает хэш CSV (можно несколько кусков — напр. лист + его под-лист) и
     *  сравнивает с сохранённым. true → ничего не менялось, можно пропускать. */
    unchanged(...csvTexts) {
      pendingCsvHash = sha(csvTexts.join('\0'));
      const prev = store[key];
      return !!prev && prev.csv === pendingCsvHash && prev.code === codeHash;
    },
    /** Запоминает текущий хэш CSV+кода. Звать ТОЛЬКО после успешной пересборки. */
    commit() {
      if (pendingCsvHash == null) return;          // unchanged() не вызывали
      store[key] = { csv: pendingCsvHash, code: codeHash, at: new Date().toISOString() };
      writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n');
    },
  };
}
