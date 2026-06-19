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
 * NV-прототип переиспользует часть q3-страниц (today/messages/tribune/…),
 * накладывая на них NV-режим. Чтобы режим не «протекал» (и нельзя было
 * случайно вывалиться в стандартный прототип), вся навигация NV проходит через
 * ОДИН шлюз: перехватчик кликов в фазе capture + nvResolve().
 *
 * Режим активен, если страница лежит в /new-vision/ ИЛИ в URL есть ?nv=1.
 *  - на общих (не-NV) страницах подмешиваем new-vision/nv-fonts.css и NV-таб-бар;
 *  - любая локальная .html-навигация остаётся в NV (?nv=1 не теряется);
 *  - страницы, у которых есть NV-версия (лента/меню/профиль), принудительно
 *    ведут на неё, а не на стандартные q3-страницы.
 * q3-прототип без ?nv не затрагивается. */
(function () {
  var onNVPage = location.pathname.indexOf('/new-vision/') !== -1;
  var hasNVParam = /[?&]nv=1(?:&|$)/.test(location.search);
  if (!onNVPage && !hasNVParam) return;

  // Маркер NV-режима на <html> — хук для точечных NV-оверрайдов в CSS страниц
  // (например .__nv .gp__title на gifts.html, где текст не на ds-* классах).
  document.documentElement.classList.add('__nv');

  // Корень сайта относительно текущего документа (учитывает суб-путь деплоя):
  // на NV-странице это всё до '/new-vision/', иначе — папка текущей страницы.
  var p = location.pathname;
  var ROOT = p.indexOf('/new-vision/') !== -1
    ? p.slice(0, p.indexOf('/new-vision/') + 1)
    : p.slice(0, p.lastIndexOf('/') + 1);

  // Страницы, у которых в NV есть собственная версия → принудительный ремап.
  var NV_TWIN = {
    'lenta.html':    'new-vision/lenta.html',
    'lenta-q3.html': 'new-vision/lenta.html',
    'menu.html':     'new-vision/menu.html',
    'profile.html':  'new-vision/profile.html'
  };

  // Шрифтовая карта NV + NV-навбар на общую страницу (на родных NV-страницах
  // они уже есть). nv-navbar.css нужен ради NV-глифа «назад» (.icon.__slot-back);
  // остальные его правила заскоплены на .nv-feed-nav, которого у q3-навбаров нет.
  if (!onNVPage) {
    ['new-vision/nv-fonts.css', 'components/nv-navbar.css'].forEach(function (href) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = ROOT + href;
      document.head.appendChild(link);
    });
  }

  /* nvResolve(raw): куда реально вести по NV-правилам.
     Возвращает строку-URL (с ?nv=1, при необходимости ремапнутую на NV-двойника)
     либо null — если это не локальная .html-навигация и трогать её не нужно. */
  function nvResolve(raw) {
    if (!raw || raw.charAt(0) === '#') return null;
    var u;
    try { u = new URL(raw, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;       // внешняя ссылка
    if (!/\.html$/.test(u.pathname)) return null;         // не страница
    var file = u.pathname.split('/').pop();
    var path;
    if (u.pathname.indexOf('/new-vision/') !== -1) path = u.pathname;   // уже NV-native
    else if (NV_TWIN[file]) path = ROOT + NV_TWIN[file];                // ремап на NV-версию
    else path = u.pathname;                                            // общая q3-страница
    var search = u.search;
    if (!/[?&]nv=1(?:[&#]|$)/.test(search)) search = (search ? search + '&' : '?') + 'nv=1';
    return path + search + u.hash;
  }

  // Слот таб-бара → логическая цель (относительно корня сайта).
  var SLOT_ROUTE = {
    feed:    'new-vision/lenta.html',
    tribune: 'tribune.html',
    message: 'messages.html',
    menu:    'new-vision/menu.html',
    clip:    '#'
  };

  function slotOf(el) {
    var m = el.className.match(/__slot-([a-z]+)/);
    return m ? m[1] : null;
  }

  /* Единый перехватчик навигации NV (capture: срабатывает РАНЬШЕ tab-bar.js,
     ok-tabbar и любых инлайн-обработчиков, поэтому они не могут увести из NV). */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var raw, isTab = false, isBack = false;
    var tabBtn = e.target.closest('.tabbar-icon');
    if (tabBtn) {
      isTab = true;
      raw = tabBtn.getAttribute('data-href') || SLOT_ROUTE[slotOf(tabBtn)];
    } else {
      var navEl = e.target.closest('a[href], [data-href], .tabs-tab');
      if (!navEl) return;
      raw = navEl.getAttribute('href') || navEl.getAttribute('data-href');
      isBack = e.target.closest('.nav-bar__back, [data-screen-back]') != null;
    }
    if (raw === '#') { if (isTab) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    var dest = nvResolve(raw);
    if (!dest) return;                                  // не наша навигация — пропускаем
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isTab) { try { sessionStorage.setItem('nav-tab', '1'); } catch (_) {} }
    // Кнопка «назад» помечает переход как обратный: capture-перехватчик глотает
    // клик раньше bubble-обработчика .nav-bar__back, поэтому ставим флаг здесь.
    if (isBack) { try { sessionStorage.setItem('screenNavBack', '1'); } catch (_) {} }
    // Кешируем, откуда пришли на «Сегодня», чтобы «Назад» вернул ровно туда,
    // а не на дефолтную NV-ленту (today.html читает todayOrigin).
    if (!isBack && /(^|\/)today\.html(\?|$)/.test(dest)) {
      try { sessionStorage.setItem('todayOrigin', location.pathname.replace(/^\//, '') + location.search); } catch (_) {}
    }
    location.href = dest;
  }, true);

  /* На заимствованной q3-странице рисуем NV-таб-бар вместо стандартного:
     подгружаем nv-tabbar.css и подменяем содержимое существующего .tabbar
     на 5 NV-слотов (роутинг — через перехватчик выше по слотам). */
  function mountNVTabbar() {
    var bar = document.querySelector('.tabbar');
    if (!bar) return;

    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = ROOT + 'components/nv-tabbar.css';
    document.head.appendChild(css);

    // Активный слот переносим со старого таб-бара (book → tribune).
    var active = null, on = bar.querySelector('.tabbar-icon.__state-on');
    if (on) active = ({ feed: 'feed', book: 'tribune', tribune: 'tribune',
                        message: 'message', menu: 'menu', clip: 'clip' })[slotOf(on)] || null;

    var SLOTS = ['feed', 'tribune', 'message', 'clip', 'menu'];
    var LABEL = { feed: 'Лента', tribune: 'Трибуна', message: 'Сообщения', clip: 'Клипы', menu: 'Меню' };
    var row = SLOTS.map(function (s) {
      return '<div class="tabbar__cell"><button class="tabbar-icon __slot-' + s +
             (s === active ? ' __state-on' : '') + '" aria-label="' + LABEL[s] + '"></button></div>';
    }).join('');
    bar.className = 'tabbar __platform-android';
    bar.innerHTML = '<div class="tabbar__row">' + row + '</div><div class="tabbar__handle"></div>';
  }

  // Дописать ?nv=1 к локальной .html-ссылке (для не-JS переходов и как страховка).
  function withNV(url) {
    var dest = nvResolve(url);
    return dest != null ? dest : url;
  }
  function propagateNV() {
    var nodes = document.querySelectorAll('a[href], [data-href]'), i, el, attr, v;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      attr = el.hasAttribute('href') ? 'href' : 'data-href';
      v = el.getAttribute(attr);
      if (v != null) el.setAttribute(attr, withNV(v));
    }
    if (!onNVPage) mountNVTabbar();
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
