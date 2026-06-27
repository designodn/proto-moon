/* Feed tabs — переключение панелей ленты НА МЕСТЕ (тап + свайп, без перехода).

   Разметка (генерит scripts/fetch-q3.mjs --activity):
     - таб-стрип .tabs.ll-feed-tabs с кнопками .tabs-tab[data-tab="<id>"]
       (дублируется в первый остров каждой панели — активна своя кнопка);
     - панели .ll-tabpanel[data-tab-panel="<id>"]; невидимые помечены [hidden].

   Переключение:
   - ТАП по .tabs-tab[data-tab] → показываем соответствующую панель.
   - СВАЙП по ленте влево/вправо → соседняя лента (порядок = порядок панелей).

   Почему свайп на touch-events, а не на pointer-events:
   на странице touch-action: auto, поэтому при горизонтальном пальце браузер
   сразу забирает указатель под нативный пан и шлёт pointercancel (pointerup не
   приходит) — обработчик на pointerup не срабатывал. На touchmove мы сами
   определяем горизонталь и делаем preventDefault → жест остаётся за нами и
   touchend гарантированно приходит. Для мыши (десктоп) — отдельная ветка на
   pointer-events с фолбэком на pointercancel.

   Тонкости:
   - #3 press-фидбэк (бамп) на мобилке: при делегировании :active часто не
     срабатывает, поэтому ставим .__clicked на pointerdown (tabs.css → scale).
   - #7 не сбрасывать горизонтальный скролл таб-стрипа: у каждой панели свой
     дубль стрипа, поэтому переносим scrollLeft со старого на новый при switch.
   - свайп НЕ срабатывает, если жест начат на горизонтальном скроллере
     (таб-стрип, карусели, чипсы, сториз) — иначе конфликт с их прокруткой. */
(function () {
  function tabs() { return document.querySelectorAll('.tabs-tab[data-tab]'); }
  function panelIds() {
    return Array.prototype.map.call(
      document.querySelectorAll('[data-tab-panel]'),
      function (p) { return p.getAttribute('data-tab-panel'); }
    );
  }
  function currentId() {
    var on = document.querySelector('.tabs-tab.__state-on[data-tab]');
    if (on) return on.getAttribute('data-tab');
    var ids = panelIds();
    return ids.length ? ids[0] : null;
  }

  function activate(id) {
    document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-tab-panel') !== id;
    });
    tabs().forEach(function (btn) {
      btn.classList.toggle('__state-on', btn.getAttribute('data-tab') === id);
    });
  }

  // Подскролл таб-стрипа по горизонтали, чтобы активный таб целиком попал во
  // вьюпорт стрипа (с отступом от краёв). Только горизонталь — страницу по
  // вертикали не трогаем (поэтому не scrollIntoView, который дёргает и блок).
  var TAB_INSET = 20;   // комфортный отступ активного таба от края стрипа
  function scrollTabIntoView(strip, btn) {
    if (!strip || !btn) return;
    var sRect = strip.getBoundingClientRect();
    var bRect = btn.getBoundingClientRect();
    var delta = 0;
    if (bRect.left - TAB_INSET < sRect.left) {
      delta = bRect.left - TAB_INSET - sRect.left;          // таб подрезан слева
    } else if (bRect.right + TAB_INSET > sRect.right) {
      delta = bRect.right + TAB_INSET - sRect.right;        // таб подрезан справа
    }
    if (Math.abs(delta) < 1) return;
    var max = strip.scrollWidth - strip.clientWidth;
    var target = Math.max(0, Math.min(strip.scrollLeft + delta, max));
    strip.scrollTo({ left: target, behavior: 'smooth' });
  }

  // Единый переход на ленту id: переносим scrollLeft текущего стрипа на новый,
  // затем плавно доводим активный таб целиком во вьюпорт.
  // Вертикальный скролл НЕ трогаем — страница не «скачет» вверх при смене таба.
  function switchTo(id) {
    if (!id) return;
    var fromStrip = document.querySelector('[data-tab-panel]:not([hidden]) .ll-feed-tabs');
    var scrollLeft = fromStrip ? fromStrip.scrollLeft : 0;
    activate(id);
    var panel = document.querySelector('[data-tab-panel="' + id + '"]');
    var toStrip = panel && panel.querySelector('.ll-feed-tabs');
    if (toStrip) {
      toStrip.scrollLeft = scrollLeft;                       // визуальная непрерывность
      var activeBtn = toStrip.querySelector('.tabs-tab.__state-on[data-tab="' + id + '"]')
        || toStrip.querySelector('.tabs-tab[data-tab="' + id + '"]');
      scrollTabIntoView(toStrip, activeBtn);
    }
    clearPressed();
  }

  function step(delta) {
    var ids = panelIds();
    var i = ids.indexOf(currentId());
    if (i < 0) return;
    var j = i + delta;
    if (j < 0 || j >= ids.length) return;   // края — без зацикливания
    switchTo(ids[j]);
  }

  // #3 — press-фидбэк по тапу (мобилка).
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.tabs-tab[data-tab]');
    if (b) b.classList.add('__clicked');
  }, true);
  function clearPressed() {
    document.querySelectorAll('.tabs-tab.__clicked').forEach(function (b) { b.classList.remove('__clicked'); });
  }
  document.addEventListener('pointerup', clearPressed, true);
  document.addEventListener('pointercancel', clearPressed, true);

  // ТАП по табу.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.tabs-tab[data-tab]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    switchTo(btn.getAttribute('data-tab'));
  }, true);

  // ── СВАЙП между лентами ───────────────────────────────────────────────────
  // Горизонтальные скроллеры, на которых свайп НЕ должен переключать ленту.
  var H_SCROLLERS = '.ll-feed-tabs, .tg-carousel, .chips-view__row, .tg-news__tabs,'
    + ' .collection-chips, .stories-row, .tg-chan-row, .clips-rail, [data-no-feed-swipe]';
  var SWIPE_MIN = 50;        // мин. горизонталь, чтобы счесть жест свайпом
  var DECIDE = 8;            // порог, на котором фиксируем направление жеста
  var H_DOMINANCE = 1.2;     // горизонталь должна доминировать над вертикалью

  function onHScroller(node) {
    return !!(node && node.closest && node.closest(H_SCROLLERS));
  }

  // — TOUCH (мобилка) — определяем направление на move, горизонталь «забираем». —
  var tx = 0, ty = 0, tActive = false, tLock = 0;  // tLock: 0 undecided, 1 horiz, -1 vert

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || onHScroller(e.target)) { tActive = false; return; }
    var t = e.touches[0];
    tActive = true; tLock = 0; tx = t.clientX; ty = t.clientY;
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', function (e) {
    if (!tActive) return;
    var t = e.touches[0];
    var dx = t.clientX - tx, dy = t.clientY - ty;
    if (tLock === 0) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      tLock = (Math.abs(dx) > Math.abs(dy) * H_DOMINANCE) ? 1 : -1;
    }
    if (tLock === 1) e.preventDefault();   // горизонталь наша → браузер не отменит жест
    else tActive = false;                  // вертикаль → отдаём нативному скроллу
  }, { passive: false, capture: true });

  document.addEventListener('touchend', function (e) {
    if (!tActive) return;
    tActive = false;
    if (tLock !== 1) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - tx;
    if (Math.abs(dx) < SWIPE_MIN) return;
    step(dx < 0 ? 1 : -1);                  // влево → следующая, вправо → предыдущая
  }, { passive: true, capture: true });

  document.addEventListener('touchcancel', function () { tActive = false; }, true);

  // — MOUSE (десктоп / фолбэк) — pointer-events, срабатывает и на pointercancel. —
  var mx = 0, my = 0, mLast = 0, mDown = false, mLock = 0, mSkip = false;

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    mDown = true; mLock = 0; mSkip = onHScroller(e.target);
    mx = e.clientX; my = e.clientY; mLast = e.clientX;
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!mDown || mSkip) return;
    mLast = e.clientX;
    var dx = e.clientX - mx, dy = e.clientY - my;
    if (mLock === 0 && (Math.abs(dx) >= DECIDE || Math.abs(dy) >= DECIDE)) {
      mLock = (Math.abs(dx) > Math.abs(dy) * H_DOMINANCE) ? 1 : -1;
    }
  }, true);

  function mEnd(e) {
    if (!mDown) return;
    mDown = false;
    if (mSkip || mLock !== 1) return;
    var x = (e && typeof e.clientX === 'number' && e.type !== 'pointercancel') ? e.clientX : mLast;
    var dx = x - mx;
    if (Math.abs(dx) < SWIPE_MIN) return;
    step(dx < 0 ? 1 : -1);
  }
  document.addEventListener('pointerup', mEnd, true);
  document.addEventListener('pointercancel', mEnd, true);
})();
