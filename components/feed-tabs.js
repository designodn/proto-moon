/* Feed tabs — переключение панелей ленты НА МЕСТЕ (тап + свайп, без перехода).

   Разметка (генерит scripts/fetch-q3.mjs --activity):
     - таб-стрип .tabs.ll-feed-tabs с кнопками .tabs-tab[data-tab="<id>"]
       (дублируется в первый остров каждой панели — активна своя кнопка);
     - панели .ll-tabpanel[data-tab-panel="<id>"]; невидимые помечены [hidden].

   Переключение:
   - ТАП по .tabs-tab[data-tab] → показываем соответствующую панель.
   - СВАЙП по ленте влево/вправо → соседняя лента (порядок = порядок панелей).

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

  // Единый переход на ленту id: переносим scrollLeft текущего стрипа на новый
  // и скроллим ленту в начало (sticky-таббар не «скачет» из-за разной высоты).
  function switchTo(id) {
    if (!id) return;
    var fromStrip = document.querySelector('[data-tab-panel]:not([hidden]) .ll-feed-tabs');
    var scrollLeft = fromStrip ? fromStrip.scrollLeft : 0;
    activate(id);
    var panel = document.querySelector('[data-tab-panel="' + id + '"]');
    var toStrip = panel && panel.querySelector('.ll-feed-tabs');
    if (toStrip) toStrip.scrollLeft = scrollLeft;
    var feed = document.querySelector('.phone-frame__feed');
    if (feed) feed.scrollTop = 0;
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
  var SWIPE_MIN = 60;        // мин. горизонталь, чтобы счесть жест свайпом
  var SWIPE_RATIO = 1.4;     // горизонталь должна доминировать над вертикалью

  var sx = 0, sy = 0, tracking = false;

  document.addEventListener('pointerdown', function (e) {
    // только основной указатель (тач/мышь левой кнопкой)
    if (e.pointerType === 'mouse' && e.button !== 0) { tracking = false; return; }
    // жест начат на горизонтальном скроллере → не перехватываем
    if (e.target.closest && e.target.closest(H_SCROLLERS)) { tracking = false; return; }
    tracking = true; sx = e.clientX; sy = e.clientY;
  }, true);

  function endSwipe(e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < SWIPE_MIN) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;  // вертикальный скролл
    step(dx < 0 ? 1 : -1);   // влево → следующая, вправо → предыдущая
  }
  document.addEventListener('pointerup', endSwipe, true);
})();
