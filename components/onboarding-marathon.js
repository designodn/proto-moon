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
            '<p class="omar-slide__text">Публикуйте фото, собирайте классы и получайте подарки</p>' +
          '</section>' +

          /* 2 — Длинная страница: Тематика → Голосование → Приглашайте (мотаем вниз) */
          '<section class="omar-slide omar-slide--combo">' +
            '<div class="omar-combo">' +
              '<div class="omar-stage">' +                 // экран 1: тематика + голосование
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
                  '<div class="omar-vote">' +
                    '<h2 class="omar-slide__title">Голосуйте за фото</h2>' +
                    '<p class="omar-slide__text omar-vote__sub">Поддержите фото друга классом — так у него больше шансов победить</p>' +
                    img('smile.png', 'omar-stickers') +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="omar-stage omar-stage--invite">' +   // экран 2: приглашайте
                '<div class="omar-invite__text">' +
                  '<h2 class="omar-slide__title">Приглашайте всех</h2>' +
                  '<p class="omar-slide__text omar-invite__sub">Зовите друзей — вместе интереснее</p>' +
                '</div>' +
                '<img class="omar-invite" src="assets/icons/Resourses.png" alt="" loading="lazy">' +   // вайб Трибуны
              '</div>' +
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
    var footer   = el.querySelector('.omar__footer');
    var ctaBtn   = el.querySelector('.omar__cta button');
    var ctaLabel = ctaBtn.querySelector('.button-content');
    var last     = slides.length - 1;
    var index    = 0;
    var COMBO_INDEX = 1;       // длинная страница: тематика → голосование → приглашайте
    var timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    // Футер по фазам: hero (Перейти+Далее) / hidden (во время автопрокрутки) /
    // invite (одна кнопка «Перейти к марафону», появляется в конце).
    function setFooter(mode) {
      if (mode === 'hero') {
        footer.classList.remove('__hidden');
        nextWrap.style.display = 'block';
        ctaBtn.className = 'button-container __style-secondary';
        ctaLabel.textContent = 'Перейти к фотомарафону';
      } else if (mode === 'invite') {
        footer.classList.remove('__hidden');
        nextWrap.style.display = 'none';
        ctaBtn.className = 'button-container __style-primary';
        ctaLabel.textContent = 'Перейти к марафону';
      } else {
        footer.classList.add('__hidden');
        nextWrap.style.display = 'none';
      }
    }

    // Длинная страница: тематика (чипсы → подпись, 1.5с) → голосование (бамп-стикер,
    // 3с на чтение) → мотаем вниз к «Приглашайте» (кнопка через 300мс после подписи).
    function startCombo() {
      var slide = slides[COMBO_INDEX];
      var inviteStage = slide.querySelector('.omar-stage--invite');
      slide.classList.remove('__vote', '__vote-settle', '__invite', '__scrollable');
      var stages = slide.querySelectorAll('.omar-stage');
      var cs = getComputedStyle(slide);
      var avail = slide.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      for (var k = 0; k < stages.length; k++) stages[k].style.minHeight = avail + 'px';
      slide.scrollTop = 0;
      setFooter('hidden');

      // голосование — через 1.5с после подписи тематики (подпись ~3.0с)
      timers.push(setTimeout(function () { slide.classList.add('__vote'); }, 4500));
      timers.push(setTimeout(function () { slide.classList.add('__vote-settle'); }, 5200));
      // приглашайте — 3с на чтение голосования, затем мотаем страницу вниз (нативный скролл)
      timers.push(setTimeout(function () {
        slide.classList.add('__invite');
        if (inviteStage) slide.scrollTo({ top: inviteStage.offsetTop, behavior: 'smooth' });
      }, 8400));
      // кнопка «Перейти к марафону» — через 300мс после подзаголовка приглашайте;
      // после финала разблокируем прокрутку — можно отмотать назад и дочитать
      timers.push(setTimeout(function () { setFooter('invite'); slide.classList.add('__scrollable'); }, 9300));
    }

    function goTo(i) {
      i = Math.max(0, Math.min(last, i));
      clearTimers();
      index = i;
      track.style.transform = 'translateY(' + (-i * 100) + '%)';   // смах вниз — страница уходит вверх
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      if (i === 0) setFooter('hero');
      if (i === COMBO_INDEX) startCombo();
    }

    el.querySelector('.omar__close').addEventListener('click', close);
    ctaBtn.addEventListener('click', go);
    nextWrap.querySelector('button').addEventListener('click', function () { goTo(index + 1); });

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
