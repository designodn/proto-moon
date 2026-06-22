/* ============================================================
   Onboarding — Фотомарафон (листаемые слайды)
   Показывается при тапе «Перейти к фотомарафону» из ленты.
   Перехват клика идёт на window в фазе capture — то есть РАНЬШЕ
   глобального обработчика навигации в screen-transition.js (он на document).

   2 слайда: Участвуйте → Тематика+Голосование.
   • «Далее» — только на 1-м слайде (ручной переход).
   • Кнопка «Перейти к фотомарафону» видна на обоих слайдах.
   • На 2-м (последнем) слайде анимация чипов/голосования играет сама.
   Свайп вверх/вниз листает вручную.

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
            '<p class="omar-slide__text">Публикуйте фото, собирайте классы и получайте подарки</p>' +
          '</section>' +

          /* 2 — Тематика + Голосование: один экран, 50/50 */
          '<section class="omar-slide omar-slide--combo">' +
            '<div class="omar-topics">' +
              '<h2 class="omar-slide__title">Выбирайте тематику</h2>' +
              '<p class="omar-slide__text omar-topics__sub">Выберите близкую тему — спорт, кулинария, сад и другое</p>' +
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
              '<p class="omar-slide__text omar-vote__sub">Поддержите фото друга классом — так у него больше шансов победить</p>' +
              img('smile.png', 'omar-stickers') +
            '</div>' +
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
    var ctaWrap  = el.querySelector('.omar__cta');
    var footer   = el.querySelector('.omar__footer');
    var ctaBtn   = el.querySelector('.omar__cta button');
    var ctaLabel = ctaBtn.querySelector('.button-content');
    var last     = slides.length - 1;
    var index    = 0;
    var COMBO_INDEX = 1;       // тематика + голосование
    var timers = [];
    var played = {};           // какие слайды уже проигрывали интро (чтобы не перезапускать)
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    // Футер по фазам:
    //   hero  — «Перейти к фотомарафону» (secondary) + «Далее» (primary)
    //   combo — те же две кнопки, что и на hero (последний слайд): secondary
    //           «Перейти к фотомарафону» + primary «Далее» (на последнем шаге
    //           «Далее» ведёт внутрь фотомарафона, см. обработчик nextWrap).
    //   hidden — спрятан
    function setFooter(mode) {
      footer.classList.toggle('__hidden', mode === 'hidden');
      if (mode === 'hero' || mode === 'combo') {
        ctaWrap.style.display = 'block'; nextWrap.style.display = 'block';
        ctaBtn.className = 'button-container __style-secondary';
        ctaLabel.textContent = 'Перейти к фотомарафону';
      }
    }

    // Combo: чипсы → подпись тематики → голосование (бамп-стикер) → подпись
    // голосования. Кнопка «Перейти к фотомарафону» видна сразу (setFooter
    // вызывается в goTo), поэтому здесь только тайминги анимации — ускорены.
    function startCombo() {
      var slide = slides[COMBO_INDEX];
      timers.push(setTimeout(function () { slide.classList.add('__vote'); }, 1700));
      timers.push(setTimeout(function () { slide.classList.add('__vote-settle'); }, 2300));
    }

    function goTo(i) {
      i = Math.max(0, Math.min(last, i));
      clearTimers();
      index = i;
      track.style.transform = 'translateY(' + (-i * 100) + '%)';   // свайп вверх — следующая страница
      slides[i].classList.add('is-active');   // не снимаем у предыдущих — анимации не перезапускаются

      if (i === 0) {
        setFooter('hero');
      } else if (i === COMBO_INDEX) {
        // combo — последний слайд. Кнопка «Перейти к фотомарафону» видна сразу;
        // анимация чипов/голосования играет параллельно.
        setFooter('combo');
        if (!played[i]) { played[i] = true; startCombo(); }
        else { slides[i].classList.add('__vote', '__vote-settle'); }
      }
    }

    el.querySelector('.omar__close').addEventListener('click', close);
    ctaBtn.addEventListener('click', go);
    nextWrap.querySelector('button').addEventListener('click', function () {
      // «Далее»: на последнем слайде ведёт внутрь фотомарафона, иначе — следующий слайд.
      if (index >= last) go();
      else goTo(index + 1);
    });

    // Свайп вверх → следующая страница; вниз → предыдущая.
    var sy = null, sdy = 0;
    slidesEl.addEventListener('pointerdown', function (e) { sy = e.clientY; sdy = 0; });
    slidesEl.addEventListener('pointermove', function (e) { if (sy != null) sdy = e.clientY - sy; });
    slidesEl.addEventListener('pointerup', function () {
      if (sy == null) return;
      var d = sdy; sy = null;
      if (d < -40) goTo(index + 1);
      else if (d > 40) goTo(index - 1);
    });
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

    el._reset = function () {
      played = {};
      slides.forEach(function (s) { s.classList.remove('is-active', '__vote', '__vote-settle'); });
      goTo(0);
    };
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
