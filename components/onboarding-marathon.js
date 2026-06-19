/* ============================================================
   Onboarding — Фотомарафон
   Показывается ОДИН раз при первом тапе «Перейти к фотомарафону».
   Перехват клика идёт на window в фазе capture — то есть РАНЬШЕ
   глобального обработчика навигации в screen-transition.js (он на document).

   Подключение: на странице с кнопками data-href="marathon.html" достаточно
     <link rel="stylesheet" href="components/onboarding-marathon.css">
     <script src="components/onboarding-marathon.js"></script>

   Картинки — слоты в assets/onboarding/marathon/ (кладутся отдельно):
     photo-1/2/3.png   — фото в hero «Участвуйте»
     icon-sport/cooking/garden.png — 3D-иконки тематик
     stickers.png      — стикеры в блоке «Голосуйте»
     invite-1/2/3.png  — фото в блоке «Приглашайте всех»
   ============================================================ */
(function () {
  'use strict';

  var SEEN_KEY = 'omar-seen';          // флаг «онбординг уже показан»
  var TARGET   = 'marathon.html';      // целевой экран фотомарафона
  var ASSETS   = 'assets/onboarding/marathon/';

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (_) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) {}
  }

  // Ссылка ведёт в фотомарафон? (учитываем возможный ?nv=1 и префиксы пути)
  function isMarathonHref(raw) {
    if (!raw) return false;
    return raw.split('?')[0].split('#')[0].replace(/^.*\//, '') === TARGET;
  }

  var overlay = null;     // корневой .omar
  var destHref = TARGET;  // куда уходить по CTA (с сохранением исходного href)

  /* ---------- Разметка ---------- */
  function img(name, cls, alt) {
    return '<img class="' + cls + '" src="' + ASSETS + name + '" alt="' + (alt || '') + '" loading="lazy">';
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'omar';
    el.hidden = true;
    el.innerHTML =
      '<button class="omar__close" type="button" aria-label="Закрыть">' +
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
        '</svg>' +
      '</button>' +

      '<div class="omar__scroll">' +

        /* 1 — Участвуйте */
        '<section class="omar-sec omar-hero">' +
          '<div class="omar-fan">' +
            img('photo-1.png', 'omar-fan__photo omar-fan__photo--1') +
            img('photo-2.png', 'omar-fan__photo omar-fan__photo--2') +
            img('photo-3.png', 'omar-fan__photo omar-fan__photo--3') +
          '</div>' +
          '<h2 class="omar-sec__title omar-hero__title">Участвуйте<br>в фотомарафонах</h2>' +
          '<p class="omar-sec__text">Публикуйте фото и получайте подарки! Приглашайте друзей голосовать за ваше фото и собирайте классы</p>' +
        '</section>' +

        /* 2 — Выбирайте тематику */
        '<section class="omar-sec">' +
          '<h2 class="omar-sec__title">Выбирайте тематику</h2>' +
          '<p class="omar-sec__text">Любите готовить? Выложите свои кулинарные шедевры. Может, вы в восторге от рыбалки? Путешественник, спортсмен, делаете что-то своими руками?</p>' +
          '<div class="omar-chips">' +
            '<span class="omar-chip omar-chip--sport">спорт' + img('icon-sport.png', 'omar-chip__icon') + '</span>' +
            '<span class="omar-chip omar-chip--cooking">кулинария' + img('icon-cooking.png', 'omar-chip__icon') + '</span>' +
            '<span class="omar-chip omar-chip--garden">сад' + img('icon-garden.png', 'omar-chip__icon') + '</span>' +
          '</div>' +
        '</section>' +

        /* 3 — Голосуйте за фото */
        '<section class="omar-sec">' +
          '<h2 class="omar-sec__title">Голосуйте за фото</h2>' +
          '<p class="omar-sec__text">Поддержите фото друга классом — так у него будет больше шанса выиграть в фотомарафоне, или пригласите голосовать за вас.</p>' +
          img('stickers.png', 'omar-stickers') +
        '</section>' +

        /* 4 — Приглашайте всех */
        '<section class="omar-sec">' +
          '<h2 class="omar-sec__title">Приглашайте всех</h2>' +
          '<p class="omar-sec__text">Зовите друзей, делитесь своими достижениями, ведь вместе всегда интереснее</p>' +
          '<div class="omar-fan">' +
            img('invite-1.png', 'omar-fan__photo omar-fan__photo--1') +
            img('invite-2.png', 'omar-fan__photo omar-fan__photo--2') +
            img('invite-3.png', 'omar-fan__photo omar-fan__photo--3') +
          '</div>' +
        '</section>' +

      '</div>' +

      '<div class="omar__footer">' +
        '<div class="button-wrapper __size-56 __full-width omar__cta" style="display:block">' +
          '<button class="button-container __style-primary" type="button" style="width:100%">' +
            '<span class="button-content">Перейти к фотомарафону</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    el.querySelector('.omar__close').addEventListener('click', close);
    el.querySelector('.omar__cta button').addEventListener('click', go);

    // Подъезд секций при скролле
    var scroll = el.querySelector('.omar__scroll');
    var secs = Array.prototype.slice.call(el.querySelectorAll('.omar-sec'));
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        // помечаем секцию и все предыдущие — чтобы при резком прыжке скролла
        // не осталось «не подъехавших» блоков между hero и текущим
        var idx = secs.indexOf(en.target);
        for (var i = 0; i <= idx; i++) secs[i].classList.add('is-in');
      });
    }, { root: scroll, threshold: 0.2 });
    secs.forEach(function (s) { io.observe(s); });

    return el;
  }

  /* ---------- Управление ---------- */
  function open() {
    if (!overlay) overlay = build();
    markSeen();                        // показываем один раз
    overlay.hidden = false;
    // hero виден сразу (наблюдатель сработает асинхронно)
    var hero = overlay.querySelector('.omar-hero');
    requestAnimationFrame(function () {
      overlay.classList.add('__open');
      if (hero) hero.classList.add('is-in');
    });
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('__open');
    var done = function () { overlay.hidden = true; overlay.removeEventListener('transitionend', done); };
    overlay.addEventListener('transitionend', done);
    setTimeout(done, 350);             // страховка, если transitionend не прилетит
  }
  function go() {
    markSeen();
    location.href = destHref;
  }

  /* ---------- Перехват первого тапа (window capture → раньше document) ---------- */
  window.addEventListener('click', function (e) {
    if (seen()) return;                            // уже видели — обычная навигация
    if (!e.target.closest) return;
    var el = e.target.closest('a[href], [data-href]');
    if (!el) return;
    var raw = el.getAttribute('href') || el.getAttribute('data-href');
    if (!isMarathonHref(raw)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    destHref = raw;                                // сохраняем исходный href (с ?nv и т.п.)
    open();
  }, true);

  // Ручной запуск из консоли/кода при необходимости
  window.OnboardingMarathon = { open: open, close: close, reset: function () { try { localStorage.removeItem(SEEN_KEY); } catch (_) {} } };
})();
