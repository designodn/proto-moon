#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { activityTextIssues, agreeGenderText, replacePersonToken } from './lib/activity-text.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const activities = JSON.parse(readFileSync(resolve(ROOT, 'data/events-activity.json'), 'utf8')).activities;
const people = JSON.parse(readFileSync(resolve(ROOT, 'data/people.json'), 'utf8')).people;
const byId = Object.fromEntries(people.map(person => [String(person.id), person]));
const errors = [];
let corrections = 0;

for (const activity of activities) {
  if (activity.lead !== 'person') continue;
  const ids = String(activity.who || '').split(',').map(id => id.trim()).filter(Boolean);
  const issues = activityTextIssues(activity, byId);
  for (const issue of issues) {
    const structural = issue.startsWith('не найден') || issue.includes('нет второго id');
    console[structural ? 'error' : 'log'](`${structural ? '✗' : '↳'} events:${activity.id}: ${issue}`);
    if (structural) errors.push(`${activity.id}: ${issue}`);
    else corrections++;
  }
  const primary = byId[ids[0]];
  const addressedToUser = /(?:^|\s)(?:у|для)\s+вас(?=\s|$|[,.!?])/i.test(activity.text || '');
  const referenced = byId[ids[1] || (addressedToUser ? ids[0] : '')];
  const agreed = agreeGenderText(activity.text, primary?.gender);
  if (/\bN\b/.test(agreed) && referenced) {
    const resolved = replacePersonToken(agreed, referenced.name.replace(/\s*\(.*$/, '').trim(), referenced.gender);
    if (/\bN\b/.test(resolved)) errors.push(`${activity.id}: N не удалось заменить`);
  }
}

if (errors.length) {
  console.error(`\n✗ Верификация текстов: ${errors.length} структурных ошибок.`);
  process.exit(1);
}
console.log(`✓ Верификация текстов: ошибок нет${corrections ? `, автокоррекций рода: ${corrections}` : ''}.`);
