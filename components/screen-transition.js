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
