/* proto-contain.js — «контейнер» прототипа: не выпускает навигацию за пределы
 * своей папки. Любой клик, который увёл бы на ЧУЖУЮ страницу (другой прототип
 * или корневые q3-страницы: tribune/messages/klipy/menu/notifications/vvz/
 * gifts-catalog, profile, marathon-chat, clip-edit, lenta-q3 и т.п.), гасится.
 *
 * Почему так: у страниц activity-lenta стоит <base href="../">, поэтому
 * относительные переходы вида location.href='profile.html' и href="tribune.html"
 * резолвятся В КОРЕНЬ репозитория — т.е. уводят из прототипа. Компоненты
 * (tab-bar.js, moment.js, inline-хендлеры) НЕ трогаем — перехват на уровне
 * window-capture click ДО их обработчиков (capture: window → document → target,
 * поэтому наш слушатель срабатывает первым; stopImmediatePropagation глушит и
 * делегированные document-листенеры, и target-листенеры кнопок).
 *
 * Подключается ТОЛЬКО на страницах activity-lenta, поэтому q3/NV не затронуты.
 *
 * Принцип «свой каталог»: разрешены переходы, чей путь начинается с папки
 * текущей страницы (…/activity-lenta/). Всё прочее — чужое, блокируем.
 * Никакого хардкода пути монтирования: папку берём из location.pathname. */
(function () {
  var DIR = location.pathname.replace(/[^/]*$/, '');   // …/activity-lenta/

  function foreign(raw) {
    if (!raw) return false;
    if (/^(#|javascript:|tel:|mailto:|blob:|data:|sms:)/i.test(raw)) return false;
    var u;
    try { u = new URL(raw, document.baseURI); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;     // внешние сайты (CDN и пр.) не трогаем
    return u.pathname.indexOf(DIR) !== 0;               // вне своей папки → чужое
  }

  // Таб-бар (components/tab-bar.js): цель = data-href или дефолтная карта по слоту.
  var TAB_ROUTES = { feed: 'lenta-q3.html', book: 'tribune.html', message: 'messages.html', clip: 'klipy.html', menu: 'menu.html' };
  function tabbarForeign(icon) {
    var href = icon.getAttribute('data-href');
    if (!href) {
      for (var s in TAB_ROUTES) { if (icon.classList.contains('__slot-' + s)) { href = TAB_ROUTES[s]; break; } }
    }
    return href ? foreign(href) : false;
  }

  // Узлы, чьи inline-обработчики делают location.href='<чужая>' БЕЗ href на самом
  // узле (перехватываем по селектору): колокольчик, CTA в плеере моментов
  // (ВВЗ «Показать всех» → vvz.html, ДР «Поздравить» → gifts-catalog.html),
  // автор поста (ава/имя в uni-cell → profile.html), «Перейти» в марафон-чат.
  var LEAKY =
    '#notifsBtn,' +
    '.moment__cta:not(.__quick) button,' +
    '.uni-cell .avatar.__size-44,' +
    '.uni-cell .uni-cell-additional-content .ds-title-s,' +
    '.uni-cell .uni-cell-additional-content .feed-header__name,' +
    '.rf-go,' +
    '.ll-memclip__media[data-clip-edit]';

  function block(e) { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); }

  window.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // 1) Таб-бар.
    var icon = t.closest('.tabbar-icon');
    if (icon) { if (tabbarForeign(icon)) block(e); return; }

    // 2) Явный href / data-href на узле или предке (ссылки, friendversary,
    //    марафон-промо, vvz-portlet «Ещё» и т.п.).
    var navEl = t.closest('a[href], [data-href]');
    if (navEl && foreign(navEl.getAttribute('href') || navEl.getAttribute('data-href'))) { block(e); return; }

    // 3) Узлы с inline-навигацией без href. Исключение — «…» (Ещё) в клипе
    //    памяти: он не открывает редактор, навигации нет.
    if (t.closest(LEAKY)) {
      if (t.closest('.ll-memclip__more')) return;
      block(e);
    }
  }, true);
})();
