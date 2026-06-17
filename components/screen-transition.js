/**
 * OK Design System (proto) — ScreenTransition
 *
 * Помечает кросс-документный переход как «назад» (html.nav-back) и
 * централизованно обрабатывает кнопку «назад» в навбаре.
 * Анимацию задаёт components/screen-transition.css.
 *
 *   .nav-bar__back     — стандартная навбар-кнопка назад → history.back()
 *   [data-screen-back] — явный хук (опц. data-href переопределяет цель)
 *
 * Направление определяется: флагом из sessionStorage (ставится по тапу «назад»),
 * либо по Navigation API (traverse на меньший индекс — браузерный back-жест).
 *
 * ВАЖНО: подключать синхронно в <head> — событие pagereveal одноразовое и
 * срабатывает очень рано (до первой отрисовки нового документа). Скрипт в конце
 * <body> (и defer) опаздывает зарегистрировать listener, и html.nav-back не ставится.
 */
/* ── New Vision mode ──────────────────────────────────────────────────────
 * Протягивает NV-шрифты на общие q3-страницы (messages, tribune, …), когда
 * навигация идёт в рамках прототипа New Vision.
 *
 * Режим активен, если страница лежит в /new-vision/ ИЛИ в URL есть ?nv=1.
 *  - на общих (не-NV) страницах подмешиваем new-vision/nv-fonts.css;
 *  - проброс ?nv=1 на все локальные .html-ссылки (href и data-href), чтобы
 *    режим сохранялся при переходах вглубь.
 * q3-прототип без ?nv не затрагивается. */
(function () {
  var onNVPage = location.pathname.indexOf('/new-vision/') !== -1;
  var hasNVParam = /[?&]nv=1(?:&|$)/.test(location.search);
  if (!onNVPage && !hasNVParam) return;

  // Шрифтовая карта NV на общую страницу (на родных NV-страницах она уже есть).
  if (!onNVPage) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'new-vision/nv-fonts.css';
    document.head.appendChild(link);
  }

  // Дописать ?nv=1 к локальной .html-ссылке, сохранив существующий query/hash.
  function withNV(url) {
    if (!url || url.charAt(0) === '#') return url;
    if (!/\.html(?:[?#]|$)/.test(url)) return url;
    if (/[?&]nv=1(?:[&#]|$)/.test(url)) return url;
    var hash = '', base = url, h = url.indexOf('#');
    if (h !== -1) { hash = url.slice(h); base = url.slice(0, h); }
    return base + (base.indexOf('?') !== -1 ? '&' : '?') + 'nv=1' + hash;
  }
  function propagateNV() {
    var nodes = document.querySelectorAll('a[href], [data-href]'), i, el, attr, v;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      attr = el.hasAttribute('href') ? 'href' : 'data-href';
      v = el.getAttribute(attr);
      if (v != null) el.setAttribute(attr, withNV(v));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', propagateNV);
  else propagateNV();
})();

(function () {
  var BACK_KEY = 'screenNavBack';
  var TAB_KEY  = 'nav-tab';

  function isBackByNav(activation) {
    if (!activation || activation.navigationType !== 'traverse') return false;
    var from = activation.from, to = activation.entry;
    return !!(from && to && typeof from.index === 'number' &&
              typeof to.index === 'number' && to.index < from.index);
  }

  // Входящий документ: до первой отрисовки решаем направление и метим html
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var html = document.documentElement;

    // Переход по табу — без анимации
    try {
      if (sessionStorage.getItem(TAB_KEY)) {
        sessionStorage.removeItem(TAB_KEY);
        html.classList.add('nav-tab');
        e.viewTransition.finished.finally(function () { html.classList.remove('nav-tab'); });
        return;
      }
    } catch (_) {}

    var back = false;
    try { if (sessionStorage.getItem(BACK_KEY)) { back = true; sessionStorage.removeItem(BACK_KEY); } } catch (_) {}
    if (!back) back = isBackByNav(window.navigation && window.navigation.activation);
    if (!back) return;
    html.classList.add('nav-back');
    e.viewTransition.finished.finally(function () { html.classList.remove('nav-back'); });
  });

  // Кнопка «назад» в навбаре — централизованно
  document.addEventListener('click', function (e) {
    var back = e.target.closest ? e.target.closest('.nav-bar__back, [data-screen-back]') : null;
    if (!back) return;
    e.preventDefault();
    try { sessionStorage.setItem(BACK_KEY, '1'); } catch (_) {}
    var href = back.getAttribute('data-href');
    if (href) location.href = href;
    else history.back();
  });
})();
