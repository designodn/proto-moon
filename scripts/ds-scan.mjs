#!/usr/bin/env node
// ds-scan — автопарсинг чужой дизайн-системы с живого веба.
//
// Обходит указанные страницы в Chromium, снимает computed styles со всех
// элементов и агрегирует их в инвентарь: цвета, типографика, отступы, радиусы,
// тени, толщины бордеров. На выходе — машинный json, черновик tokens.css и
// человекочитаемый html-отчёт.
//
// Зачем: чтобы у БЮ появился реестр их DS в коде ДО того, как они соберут
// дизайн-систему руками. Из этого реестра дальше работают правила и проверки.
//
// Использование:
//   node scripts/ds-scan.mjs --url https://example.com [--url ...] [--out ds-scan]
//   node scripts/ds-scan.mjs --url http://localhost:8080/lenta.html --viewport 390x844
//
// Флаги:
//   --url <адрес>      страница для обхода, можно повторять (обязателен)
//   --out <папка>      куда писать результат (по умолчанию ds-scan/)
//   --viewport WxH     размер окна (по умолчанию 390x844 — мобильный)
//   --max-elements N   потолок элементов на страницу (по умолчанию 8000)
//   --wait N           доп. ожидание после загрузки, мс (по умолчанию 1200)
//   --top N            сколько значений показывать в черновике токенов (по умолчанию 24)
//
// Зависимостей от этого репозитория нет намеренно: скрипт переезжает
// в proto-kit без единой правки.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ─── playwright: локальный, иначе глобальный ────────────────────────────────

async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {}
  let globalRoot;
  try {
    globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  } catch {
    globalRoot = null;
  }
  for (const base of [globalRoot, '/opt/node22/lib/node_modules'].filter(Boolean)) {
    for (const pkg of ['playwright', 'playwright-core']) {
      try {
        const mod = await import(join(base, pkg, 'index.js'));
        const chromium = mod.chromium ?? mod.default?.chromium;
        if (chromium) return chromium;
      } catch {}
    }
  }
  throw new Error(
    'Не найден playwright. Установите в проект:  npm i -D playwright\n' +
      '(браузер качать не нужно, если PLAYWRIGHT_BROWSERS_PATH уже настроен)'
  );
}

// ─── разбор аргументов ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { urls: [], out: 'ds-scan', viewport: { width: 390, height: 844 }, maxElements: 8000, wait: 1200, top: 24 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') opts.urls.push(next());
    else if (a === '--out') opts.out = next();
    else if (a === '--max-elements') opts.maxElements = Number(next());
    else if (a === '--wait') opts.wait = Number(next());
    else if (a === '--top') opts.top = Number(next());
    else if (a === '--viewport') {
      const [w, hh] = next().split('x').map(Number);
      opts.viewport = { width: w, height: hh };
    }
  }
  return opts;
}

// ─── сбор внутри страницы ───────────────────────────────────────────────────
// Выполняется в контексте браузера: никакого доступа к Node здесь нет.

function collectInPage(maxElements) {
  const NOISE_COLORS = new Set(['rgba(0, 0, 0, 0)', 'transparent', 'currentcolor', 'none']);

  const bump = (map, key, sample) => {
    if (!key) return;
    let rec = map[key];
    if (!rec) rec = map[key] = { count: 0, samples: [] };
    rec.count++;
    if (sample && rec.samples.length < 3 && !rec.samples.includes(sample)) rec.samples.push(sample);
  };

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return cls ? `${tag}.${cls}` : tag;
  };

  const out = {
    colors: {}, backgrounds: {}, borderColors: {},
    typography: {}, fontFamilies: {}, fontSizes: {},
    spacing: {}, radii: {}, shadows: {}, borderWidths: {},
  };

  const all = Array.from(document.querySelectorAll('*')).slice(0, maxElements);
  let visible = 0;

  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    visible++;
    const who = describe(el);

    // цвет текста — только там, где текст действительно есть
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && !NOISE_COLORS.has(cs.color)) bump(out.colors, cs.color, who);

    if (!NOISE_COLORS.has(cs.backgroundColor)) bump(out.backgrounds, cs.backgroundColor, who);

    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = cs[`border${side}Width`];
      if (w && w !== '0px') {
        bump(out.borderWidths, w, who);
        const c = cs[`border${side}Color`];
        if (!NOISE_COLORS.has(c)) bump(out.borderColors, c, who);
      }
    }

    if (hasText) {
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      bump(out.fontFamilies, fam, who);
      bump(out.fontSizes, cs.fontSize, who);
      bump(out.typography, `${cs.fontSize} / ${cs.lineHeight} / ${cs.fontWeight}`, who);
    }

    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                     'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap']) {
      const v = cs[p];
      if (v && v !== '0px' && v !== 'normal' && v.endsWith('px')) bump(out.spacing, v, who);
    }

    for (const p of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
      const v = cs[p];
      if (v && v !== '0px') bump(out.radii, v, who);
    }

    if (cs.boxShadow && cs.boxShadow !== 'none') bump(out.shadows, cs.boxShadow, who);
  }

  return { data: out, scanned: all.length, visible };
}

// ─── агрегация между страницами ─────────────────────────────────────────────

function mergeBuckets(target, source) {
  for (const [key, rec] of Object.entries(source)) {
    let t = target[key];
    if (!t) t = target[key] = { count: 0, samples: [] };
    t.count += rec.count;
    for (const s of rec.samples) if (t.samples.length < 5 && !t.samples.includes(s)) t.samples.push(s);
  }
}

const sortBucket = (bucket) =>
  Object.entries(bucket)
    .map(([value, rec]) => ({ value, count: rec.count, samples: rec.samples }))
    .sort((a, b) => b.count - a.count);

// ─── вспомогательное ────────────────────────────────────────────────────────

function toHex(css) {
  const m = css.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return a === 1 ? hex : `${hex} (alpha ${a})`;
}

// Определяем шаг сетки отступов: какая доля значений кратна 4 и 8.
function detectGrid(spacing) {
  // Отрицательные отступы (наложение аватаров и т.п.) для сетки берём по модулю:
  // знак — приём вёрстки, а не отдельный шаг шкалы.
  const px = spacing.map((s) => Math.abs(parseFloat(s.value))).filter((n) => Number.isFinite(n) && n > 0);
  const total = px.length || 1;
  const share = (step) => Math.round((px.filter((n) => n % step === 0).length / total) * 100);
  return { total: px.length, by4: share(4), by8: share(8) };
}

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// ─── черновик токенов ───────────────────────────────────────────────────────

function draftTokens(agg, top) {
  const L = [];
  L.push('/* Черновик токенов, собран ds-scan. Это ИНВЕНТАРЬ, а не готовая DS:');
  L.push(' * значения отсортированы по частоте использования на просканированных');
  L.push(' * страницах. Дальше их нужно свести руками — выкинуть случайные,');
  L.push(' * назвать по смыслу, объединить близкие. */');
  L.push('');
  L.push(':root {');

  const section = (title, items, prefix, transform = (v) => v) => {
    if (!items.length) return;
    L.push(`  /* ${title} */`);
    items.slice(0, top).forEach((it, i) => {
      const val = transform(it.value);
      L.push(`  --${prefix}-${i + 1}: ${val}; /* ${it.count}× — ${it.samples.join(', ')} */`);
    });
    L.push('');
  };

  section('Цвета текста', agg.colors, 'color-text');
  section('Фоны', agg.backgrounds, 'color-bg');
  section('Цвета бордеров', agg.borderColors, 'color-border');
  section('Размеры шрифта', agg.fontSizes, 'font-size');
  section('Отступы', agg.spacing, 'space');
  section('Радиусы', agg.radii, 'radius');
  section('Толщины бордеров', agg.borderWidths, 'border-width');
  section('Тени', agg.shadows, 'shadow');

  L.push('}');
  L.push('');
  if (agg.fontFamilies.length) {
    L.push('/* Гарнитуры по частоте:');
    agg.fontFamilies.slice(0, 8).forEach((f) => L.push(` *   ${f.value} — ${f.count}×`));
    L.push(' */');
  }
  return L.join('\n');
}

// ─── html-отчёт ─────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function htmlReport(agg, meta, grid) {
  const swatches = (items, label) => `
    <h2>${esc(label)} <span class="n">${items.length}</span></h2>
    <div class="grid">${items.slice(0, 60).map((it) => `
      <div class="sw">
        <div class="chip" style="background:${esc(it.value)}"></div>
        <code>${esc(toHex(it.value) || it.value)}</code>
        <span class="cnt">${it.count}×</span>
        <span class="ex">${esc(it.samples.join(', '))}</span>
      </div>`).join('')}</div>`;

  const rows = (items, label, unit = '') => `
    <h2>${esc(label)} <span class="n">${items.length}</span></h2>
    <table><tbody>${items.slice(0, 60).map((it) => `
      <tr><td><code>${esc(it.value)}${unit}</code></td><td class="cnt">${it.count}×</td>
      <td class="ex">${esc(it.samples.join(', '))}</td></tr>`).join('')}</tbody></table>`;

  return `<!doctype html><meta charset="utf-8"><title>ds-scan — инвентарь дизайн-системы</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;max-width:1100px;color:#1e1e1e;background:#fff}
  h1{font-size:28px;margin:0 0 4px} h2{font-size:19px;margin:32px 0 12px;border-top:1px solid #e6e6e6;padding-top:20px}
  .n{color:#757575;font-weight:400;font-size:14px}
  .meta{color:#575757;font-size:14px;margin-bottom:8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .sw{display:flex;align-items:center;gap:8px;border:1px solid #e6e6e6;border-radius:8px;padding:8px}
  .chip{width:28px;height:28px;border-radius:6px;border:1px solid #d9d9d9;flex:none;
        background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%);background-size:8px 8px}
  code{font:13px/1.4 ui-monospace,monospace;background:#f5f5f5;padding:2px 5px;border-radius:4px}
  .cnt{color:#757575;font-size:13px;white-space:nowrap} .ex{color:#8f8f8f;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  table{border-collapse:collapse;width:100%} td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
  .note{background:#fffbf0;border:1px solid #ffc943;border-radius:8px;padding:12px 16px;margin:16px 0}
  ul{margin:6px 0 0;padding-left:20px}
</style>
<h1>ds-scan — инвентарь дизайн-системы</h1>
<div class="meta">Страниц просканировано: ${meta.pages.length} · элементов осмотрено: ${meta.visible} · окно ${meta.viewport.width}×${meta.viewport.height}</div>
<div class="meta">${meta.pages.map((p) => esc(p)).join('<br>')}</div>
<div class="note"><b>Это инвентарь, а не дизайн-система.</b> Значения отсортированы по частоте на просканированных
страницах. Редкие — почти наверняка случайные отклонения, а не токены. Сводить в DS нужно руками.
<ul><li>Отступов с шагом 4px: <b>${grid.by4}%</b>, с шагом 8px: <b>${grid.by8}%</b> (из ${grid.total} значений)</li></ul></div>
${swatches(agg.colors, 'Цвета текста')}
${swatches(agg.backgrounds, 'Фоны')}
${swatches(agg.borderColors, 'Цвета бордеров')}
${rows(agg.typography, 'Типографика — размер / межстрочный / насыщенность')}
${rows(agg.fontFamilies, 'Гарнитуры')}
${rows(agg.spacing, 'Отступы')}
${rows(agg.radii, 'Радиусы')}
${rows(agg.borderWidths, 'Толщины бордеров')}
${rows(agg.shadows, 'Тени')}
`;
}

// ─── main ───────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
if (!opts.urls.length) {
  console.error('Укажите хотя бы один --url. Пример:\n  node scripts/ds-scan.mjs --url https://example.com');
  process.exit(1);
}

const chromium = await loadChromium();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 2 });

const agg = { colors: {}, backgrounds: {}, borderColors: {}, typography: {}, fontFamilies: {}, fontSizes: {}, spacing: {}, radii: {}, shadows: {}, borderWidths: {} };
const meta = { pages: [], viewport: opts.viewport, visible: 0, scanned: 0, failed: [] };

for (const url of opts.urls) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(opts.wait);
    const res = await page.evaluate(collectInPage, opts.maxElements);
    for (const key of Object.keys(agg)) mergeBuckets(agg[key], res.data[key]);
    meta.pages.push(url);
    meta.visible += res.visible;
    meta.scanned += res.scanned;
    console.log(`✓ ${url} — осмотрено ${res.visible} видимых элементов из ${res.scanned}`);
  } catch (e) {
    meta.failed.push({ url, error: e.message });
    console.log(`✗ ${url} — ${e.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();

if (!meta.pages.length) {
  console.error('\nНи одна страница не открылась. Проверьте адреса и доступность из этого окружения.');
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, sortBucket(v)]));
const grid = detectGrid(sorted.spacing);

await mkdir(opts.out, { recursive: true });
await writeFile(join(opts.out, 'report.json'), JSON.stringify({ meta, grid, inventory: sorted }, null, 2));
await writeFile(join(opts.out, 'tokens.draft.css'), draftTokens(sorted, opts.top));
await writeFile(join(opts.out, 'report.html'), htmlReport(sorted, meta, grid));

console.log(`
Готово. ${opts.out}/
  report.json        — полный инвентарь для скриптов
  tokens.draft.css   — черновик токенов, сводить руками
  report.html        — отчёт для человека, откройте в браузере

Найдено: цветов текста ${sorted.colors.length}, фонов ${sorted.backgrounds.length}, размеров шрифта ${sorted.fontSizes.length}, отступов ${sorted.spacing.length}, радиусов ${sorted.radii.length}.
Сетка отступов: ${grid.by4}% значений кратны 4px, ${grid.by8}% кратны 8px.`);
if (meta.failed.length) console.log(`Не открылись: ${meta.failed.map((f) => f.url).join(', ')}`);
