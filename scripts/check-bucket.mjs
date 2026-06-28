#!/usr/bin/env node
/**
 * check-bucket.mjs — самопроверка бакета загрузок.
 *
 * Проверяет всю цепочку: ключи → запись в бакет → публичное чтение по URL.
 * Запускать ПОСЛЕ того, как задал env UPLOADS_* (см. UPLOADS.md):
 *
 *   node scripts/check-bucket.mjs
 *
 * Печатает по шагам ✓/✗ и подсказку, что чинить. Ничего в репозитории не меняет.
 * Тестовый объект (__proto-moon-healthcheck.txt) кладётся в бакет и затем удаляется.
 */

import { bucketConfig, isUploadConfigured, putAtKey, publicUrlFor } from './lib/bucket.mjs';

const KEY = '__proto-moon-healthcheck.txt';
const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);

function showConfig() {
  const c = bucketConfig();
  console.log('Конфиг бакета:');
  console.log(`  bucket:     ${c.bucket || '— (UPLOADS_BUCKET не задан)'}`);
  console.log(`  endpoint:   ${c.endpoint}`);
  console.log(`  region:     ${c.region}`);
  console.log(`  publicBase: ${c.publicBase || '— (UPLOADS_PUBLIC_BASE не задан)'}`);
  console.log(`  ключи:      ${c.accessKeyId ? 'заданы' : '— НЕ заданы'}`);
  console.log('');
}

async function main() {
  showConfig();

  if (!isUploadConfigured()) {
    bad('Бакет не настроен. Нужны UPLOADS_BUCKET + UPLOADS_ACCESS_KEY_ID + UPLOADS_SECRET_ACCESS_KEY.');
    console.log('\nЗадай переменные окружения (см. UPLOADS.md) и запусти снова.');
    process.exit(1);
  }

  // 1. Запись в бакет
  const payload = Buffer.from('proto-moon healthcheck\n');
  let url;
  try {
    const r = await putAtKey(KEY, payload, 'text/plain; charset=utf-8');
    url = r.url;
    ok(`Запись в бакет прошла (ключ ${KEY}).`);
  } catch (e) {
    bad(`Запись не удалась: ${e.message}`);
    console.log('\nВероятные причины: неверные ключи, нет прав на запись, не тот endpoint/регион,');
    console.log('или не установлен @aws-sdk/client-s3 (npm install).');
    process.exit(1);
  }

  // 2. Публичное чтение по URL
  console.log(`  → публичный URL: ${url}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!res.ok) {
      bad(`Чтение по URL вернуло HTTP ${res.status}.`);
      if (res.status === 403) {
        console.log('\nОбъект залит, но не читается публично. Включи публичный доступ на чтение');
        console.log('у бакета (или проверь, что ACL public-read разрешён политикой бакета).');
      } else if (res.status === 404) {
        console.log('\nUPLOADS_PUBLIC_BASE, похоже, не совпадает с реальной отдачей бакета.');
        console.log('Проверь домен/путь публичной базы.');
      }
      process.exit(1);
    }
    const text = await res.text();
    if (text.includes('healthcheck')) ok('Публичное чтение по URL работает, содержимое совпало.');
    else { bad('Прочитали URL, но содержимое не то — проверь UPLOADS_PUBLIC_BASE.'); process.exit(1); }
  } catch (e) {
    bad(`Не удалось прочитать URL: ${e.message}`);
    console.log('\nПроверь UPLOADS_PUBLIC_BASE и публичность бакета.');
    process.exit(1);
  }

  // 3. Уборка тестового объекта (не критично, если не выйдет)
  try {
    const c = bucketConfig();
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: c.region, endpoint: c.endpoint, forcePathStyle: false,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
    await s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: KEY }));
    ok('Тестовый объект удалён.');
  } catch {
    console.log(`  · (тестовый объект ${KEY} удалить не вышло — можно убрать вручную)`);
  }

  console.log('\n✅ Бакет настроен правильно. Можно запускать миграцию: node scripts/migrate-assets.mjs');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
