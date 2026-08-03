#!/usr/bin/env node
/* Проверка текстов активностей: род сказуемого, разрешение токена N, ссылки на
   людей. Ничего не переписывает — только докладывает; правит тексты генератор
   (fetch-activity.mjs) через ту же либу scripts/lib/activity-text.mjs.

   Правила живут в либе, а не здесь: этот скрипт лишь обходит датасеты и печатает
   находки. Раньше он держал собственную копию правила «кого подставить вместо N»
   и она разошлась с генератором — активности с одним человеком и токеном N
   проверка молча пропускала.

   Коды выхода: 0 — структурных ошибок нет (замечания допустимы), 1 — есть.
*/
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { activityTextIssues } from './lib/activity-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// Все датасеты, которые генерирует fetch-activity.mjs из одной либы. Проверка
// привязана к списку источников, а не к одному захардкоженному файлу: добавится
// лента с активностями — дописывается строка сюда.
const DATASETS = [
  { file: 'data/events-activity.json', label: 'события друзей' },
  { file: 'data/activity.json', label: 'вокруг нас' },
];

// Структурные — ломают вёрстку (N уедет буквой, аватар не найдётся).
// Остальные — замечания: генератор их поправит сам, но знать о них полезно.
const isStructural = issue => issue.startsWith('не найден')
  || issue.startsWith('не заполнен')
  || issue.includes('некого подставить')
  || issue.includes('N не удалось заменить');

const people = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const byId = Object.fromEntries(people.map(person => [String(person.id), person]));

const errors = [];
let notes = 0;
let checked = 0;

for (const { file, label } of DATASETS) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.log(`↷ ${label}: ${file} нет — пропускаю`);
    continue;
  }
  const activities = JSON.parse(readFileSync(path, 'utf8')).activities || [];
  for (const activity of activities) {
    if (activity.lead !== 'person') continue;
    checked++;
    for (const issue of activityTextIssues(activity, byId)) {
      const structural = isStructural(issue);
      const where = `${label}:${activity.id}`;
      console[structural ? 'error' : 'log'](`${structural ? '✗' : '↳'} ${where}: ${issue}`);
      if (structural) errors.push(`${where}: ${issue}`);
      else notes++;
    }
  }
}

if (errors.length) {
  console.error(`\n✗ Верификация текстов: ${errors.length} структурных ошибок из ${checked} активностей.`);
  process.exit(1);
}
console.log(`✓ Верификация текстов: ${checked} активностей, ошибок нет${notes ? `, замечаний: ${notes}` : ''}.`);
