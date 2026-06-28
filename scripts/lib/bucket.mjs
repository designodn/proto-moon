/**
 * bucket.mjs — единая работа с S3-бакетом (Yandex Object Storage).
 *
 * Одна точка для всех, кто пишет в облако: страница загрузки (upload.mjs),
 * пайплайн сбора (media-cache.mjs) и разовые миграции (scripts/migrate-*.mjs).
 * Вынесено отдельно, чтобы не было дублирования и циклических импортов.
 *
 * Конфиг — из окружения (см. UPLOADS.md). Если бакет не настроен,
 * isUploadConfigured() === false, и вызывающий код работает по-старому
 * (media-cache качает в assets/, страница загрузки отдаёт «не настроено»).
 */

import { createHash } from 'node:crypto';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const MIME_BY_EXT = {
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};

/** MIME по расширению (для корректной отдачи из бакета). */
export function mimeForExt(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

/** Конфиг из окружения. Читаем на каждый вызов — env может меняться без рестарта. */
export function bucketConfig() {
  const bucket = process.env.UPLOADS_BUCKET || '';
  const endpoint = process.env.UPLOADS_ENDPOINT || 'https://storage.yandexcloud.net';
  const region = process.env.UPLOADS_REGION || 'ru-central1';
  const accessKeyId = process.env.UPLOADS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey =
    process.env.UPLOADS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
  const prefix = process.env.UPLOADS_PREFIX || '';
  const publicBase =
    process.env.UPLOADS_PUBLIC_BASE ||
    (bucket ? `https://${bucket}.storage.yandexcloud.net/` : '');
  return { bucket, endpoint, region, accessKeyId, secretAccessKey, prefix, publicBase };
}

/** Настроен ли бакет (есть имя + ключи). */
export function isUploadConfigured() {
  const c = bucketConfig();
  return Boolean(c.bucket && c.accessKeyId && c.secretAccessKey);
}

/** Публичный URL для ключа в бакете. */
export function publicUrlFor(key) {
  const c = bucketConfig();
  return c.publicBase.replace(/\/?$/, '/') + String(key).replace(/^\//, '');
}

// S3-клиент создаём лениво (и кэшируем): чтобы импорт модуля не падал, если
// @aws-sdk/client-s3 ещё не установлен — ошибка всплывёт только при заливке.
let _s3 = null;
async function getS3(c) {
  if (_s3) return _s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _s3 = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return _s3;
}

/** Заливает байты по конкретному ключу. Возвращает { url, key }. */
export async function putAtKey(key, bytes, contentType) {
  const c = bucketConfig();
  if (!isUploadConfigured()) throw new Error('Хранилище не настроено (env UPLOADS_*).');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await getS3(c);
  await s3.send(new PutObjectCommand({
    Bucket: c.bucket,
    Key: key,
    Body: bytes,
    ContentType: contentType || mimeForExt((key.split('.').pop() || '')),
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { url: publicUrlFor(key), key };
}

/** Контент-адресный ключ <prefix><sha16>.<ext> (для загрузок дизайнеров). */
export async function putContentAddressed(bytes, ext, contentType) {
  const c = bucketConfig();
  const key = `${c.prefix}${sha(bytes).slice(0, 16)}.${ext}`;
  return putAtKey(key, bytes, contentType);
}

/** Есть ли объект в бакете (HEAD). false, если бакет не настроен или объекта нет.
 *  Нужно, чтобы в облачном режиме не отдавать URL «протухшей» копии, которой на
 *  самом деле в бакете нет (аналог existsSync для дискового режима). */
export async function existsAtKey(key) {
  const c = bucketConfig();
  if (!isUploadConfigured()) return false;
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3(c);
    await s3.send(new HeadObjectCommand({ Bucket: c.bucket, Key: key }));
    return true;
  } catch { return false; }
}
