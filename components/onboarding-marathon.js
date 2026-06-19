/* ============================================================
   Onboarding — Фотомарафон (листаемые слайды)
   Показывается при тапе «Перейти к фотомарафону» из ленты.
   Перехват клика идёт на window в фазе capture — то есть РАНЬШЕ
   глобального обработчика навигации в screen-transition.js (он на document).

   4 слайда: Участвуйте → Тематика → Голосуйте → Приглашайте.
   • «Далее» — только на 1-м слайде (ручной переход).
   • 2-й и 3-й слайды перелистываются сами (автопереход).
   • На последнем слайде «Далее» нет — только «Перейти к фотомарафону».
   Свайп влево/вправо листает вручную (отменяет автопереход).

   Подключение:
     <link rel="stylesheet" href="components/onboarding-marathon.css">
     <script src="components/onboarding-marathon.js"></script>

   Картинки — слоты в assets/onboarding/marathon/ (кладутся отдельно):
     photo-1/2/3.png · icon-sport/cooking/garden.png · stickers.png · invite-1/2/3.png
   ============================================================ */
(function () {
  'use strict';

  var SEEN_KEY = 'omar-seen';          // флаг «онбординг уже показан»
  var TARGET   = 'marathon.html';      // целевой экран фотомарафона
  var ASSETS   = 'assets/onboarding/marathon/';
  var MARATHON_JSON = 'data/marathon.json';   // фото первых работ для веера 1-го слайда

  // true — показывать онбординг КАЖДЫЙ раз (флаг игнорируется, удобно для демо).
  // false — показывать один раз и запоминать в localStorage.
  var SHOW_EVERY_TIME = true;

  function seen() {
    if (SHOW_EVERY_TIME) return false;
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
      '<span class="button-inline-wrapper __size-24 __view-secondary omar__close">' +
        '<button class="button-inline __size-24" type="button" aria-label="Закрыть">' +
          '<span class="button-inline__content"><span class="icon __size-24 __slot-close"></span></span>' +
        '</button>' +
      '</span>' +

      '<div class="omar__slides">' +
        '<div class="omar__track">' +

          /* 1 — Участвуйте */
          '<section class="omar-slide omar-slide--hero">' +
            '<div class="omar-fan"><div class="omar-fan__stage">' +    // фото подставляются из data/marathon.json
              '<img class="omar-fan__photo omar-fan__photo--1" alt="" loading="lazy">' +
              '<img class="omar-fan__photo omar-fan__photo--2" alt="" loading="lazy">' +
              '<img class="omar-fan__photo omar-fan__photo--3" alt="" loading="lazy">' +
            '</div></div>' +
            '<h2 class="omar-slide__title">Участвуйте<br>в фотомарафонах</h2>' +
            '<p class="omar-slide__text">Публикуйте фото и получайте подарки! Приглашайте друзей голосовать за ваше фото и собирайте классы</p>' +
          '</section>' +

          /* 2 — Тематика + Голосование: один прокручиваемый блок (как в раскадровке) */
          '<section class="omar-slide omar-slide--combo">' +
            '<div class="omar-combo">' +
              '<div class="omar-topics">' +
                '<h2 class="omar-slide__title">Выбирайте тематику</h2>' +
                '<p class="omar-slide__text omar-topics__sub">Любите готовить? Выложите свои кулинарные шедевры. Может, вы в восторге от рыбалки? Путешественник, спортсмен, делаете что-то своими руками?</p>' +
                '<div class="omar-chips">' +
                  '<div class="omar-chipgrp omar-chipgrp--sport">' +
                    '<span class="omar-chip omar-chip--sport">спорт</span>' +
                    img('weight.png', 'omar-chip__icon omar-chip__icon--sport') +
                  '</div>' +
                  '<div class="omar-chipgrp omar-chipgrp--cooking">' +
                    img('pizza.png', 'omar-chip__icon omar-chip__icon--cooking') +
                    '<span class="omar-chip omar-chip--cooking">кулинария</span>' +
                  '</div>' +
                  '<div class="omar-chipgrp omar-chipgrp--garden">' +
                    '<span class="omar-chip omar-chip--garden">сад</span>' +
                    img('plant.png', 'omar-chip__icon omar-chip__icon--garden') +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="omar-vote">' +
                '<h2 class="omar-slide__title">Голосуйте за фото</h2>' +
                '<p class="omar-slide__text">Поддержите фото друга классом - так у него будет больше шанса выиграть в фотомарафоне или пригласите голосовать за вас</p>' +
                img('smile.png', 'omar-stickers') +
              '</div>' +
            '</div>' +
          '</section>' +

          /* 4 — Приглашайте всех (лейаут из автолейаута фрейма 01) */
          '<section class="omar-slide omar-slide--invite">' +
            '<div class="omar-invite__text">' +
              '<h2 class="omar-slide__title">Приглашайте всех</h2>' +
              '<p class="omar-slide__text">Зовите друзей, делитесь своими достижениями, ведь вместе всегда интереснее</p>' +
            '</div>' +
            '<img class="omar-invite" src="assets/icons/Resourses.png" alt="" loading="lazy">' +   // вайб Трибуны
          '</section>' +

        '</div>' +
      '</div>' +

      '<div class="omar__footer">' +
        '<div class="button-wrapper __size-56 __full-width omar__cta">' +
          '<button class="button-container __style-secondary" type="button" style="width:100%">' +
            '<span class="button-content">Перейти к фотомарафону</span>' +
          '</button>' +
        '</div>' +
        '<div class="button-wrapper __size-56 __full-width omar__next">' +
          '<button class="button-container __style-primary" type="button" style="width:100%">' +
            '<span class="button-content">Далее</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    // Фото веера на 1-м слайде берём из data/marathon.json (первые 3 работы).
    // Если json недоступен — остаются плейсхолдеры photo-1/2/3.png.
    (function () {
      var heroImgs = el.querySelectorAll('.omar-slide--hero .omar-fan__photo');
      if (!heroImgs.length || typeof fetch !== 'function') return;
      fetch(MARATHON_JSON).then(function (r) { return r.json(); }).then(function (d) {
        var entries = (d && d.entries) || [];
        for (var i = 0; i < heroImgs.length && i < entries.length; i++) {
          if (entries[i] && entries[i].photo) heroImgs[i].src = entries[i].photo;
        }
      }).catch(function () {});
    })();

    /* ---------- Карусель ---------- */
    var slidesEl = el.querySelector('.omar__slides');
    var track    = el.querySelector('.omar__track');
    var slides   = Array.prototype.slice.call(el.querySelectorAll('.omar-slide'));
    var nextWrap = el.querySelector('.omar__next');
    var ctaBtn   = el.querySelector('.omar__cta button');
    var last     = slides.length - 1;
    var index    = 0;
    var COMBO_INDEX = 1;       // объединённый блок «Тематика + Голосование»
    var timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    // Сценарий объединённого блока: тематика (чипсы → подпись) →
    // прокрутка вниз к «Голосуйте» (подпись тематики ещё видна) → переход дальше.
    function startCombo() {
      var slide = slides[COMBO_INDEX];
      slide.classList.remove('__vote');
      // «Голосуйте» проявляется на своём месте после тегов+подписи (всё на одном экране)
      timers.push(setTimeout(function () { slide.classList.add('__vote'); }, 3000));
      // переход к «Приглашайте»
      timers.push(setTimeout(function () { goTo(COMBO_INDEX + 1); }, 6200));
    }

    function goTo(i) {
      i = Math.max(0, Math.min(last, i));
      clearTimers();
      index = i;
      track.style.transform = 'translateY(' + (-i * 100) + '%)';   // смах вниз — лента уходит вверх
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      nextWrap.style.display = (i === 0) ? 'block' : 'none';   // «Далее» только на первом
      // на последнем слайде «Перейти к фотомарафону» становится основной (оранжевой)
      ctaBtn.className = 'button-container ' + (i === last ? '__style-primary' : '__style-secondary');
      if (i === COMBO_INDEX) startCombo();
    }

    el.querySelector('.omar__close').addEventListener('click', close);
    ctaBtn.addEventListener('click', go);
    nextWrap.querySelector('button').addEventListener('click', function () { goTo(index + 1); });

    // Свайп вверх/вниз (отменяет автосценарий).
    var sy = null, sdy = 0;
    slidesEl.addEventListener('pointerdown', function (e) { sy = e.clientY; sdy = 0; clearTimers(); });
    slidesEl.addEventListener('pointermove', function (e) { if (sy != null) sdy = e.clientY - sy; });
    function endSwipe() {
      if (sy == null) return;
      var d = sdy; sy = null;
      if (d < -40) goTo(index + 1);             // смах вверх → следующий блок снизу
      else if (d > 40) goTo(index - 1);         // смах вниз → предыдущий
      else if (index === COMBO_INDEX) startCombo();   // не свайп — перезапускаем сценарий блока
    }
    slidesEl.addEventListener('pointerup', endSwipe);
    slidesEl.addEventListener('pointercancel', function () { sy = null; });

    // Масштаб блока фото на 1-м слайде: занимает весь остаток над текстом.
    function fitFan() {
      var wrap = el.querySelector('.omar-slide--hero .omar-fan');
      var stage = el.querySelector('.omar-slide--hero .omar-fan__stage');
      if (!wrap || !stage) return;
      var s = Math.min(wrap.clientWidth / 360, wrap.clientHeight / 396);
      if (s > 0 && isFinite(s)) stage.style.setProperty('--omar-fan-scale', s);
    }
    window.addEventListener('resize', fitFan);

    el._reset = function () { goTo(0); };
    el._clearAuto = clearTimers;
    el._fitFan = fitFan;
    return el;
  }

  /* ---------- Управление ---------- */
  function open() {
    if (!overlay) overlay = build();
    markSeen();
    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add('__open');
      overlay._reset();              // на первый слайд + запуск анимаций
      if (overlay._fitFan) {
        overlay._fitFan();           // подгон масштаба фото под экран
        setTimeout(overlay._fitFan, 80);   // повтор после полной раскладки
      }
    });
  }
  function close() {
    if (!overlay) return;
    if (overlay._clearAuto) overlay._clearAuto();
    overlay.classList.remove('__open');
    var done = function () { overlay.hidden = true; overlay.removeEventListener('transitionend', done); };
    overlay.addEventListener('transitionend', done);
    setTimeout(done, 350);
  }
  function go() {
    if (overlay && overlay._clearAuto) overlay._clearAuto();
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
