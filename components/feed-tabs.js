/* Feed tabs — переключение панелей ленты НА МЕСТЕ (без перехода).

   Разметка (генерит scripts/fetch-q3.mjs --activity):
     - таб-стрип .tabs.ll-feed-tabs с кнопками .tabs-tab[data-tab="<id>"]
       (дублируется в первый остров каждой панели — активна своя кнопка);
     - панели .ll-tabpanel[data-tab-panel="<id>"]; невидимые помечены [hidden].

   Клик по .tabs-tab[data-tab] → показываем соответствующую панель, прячем
   остальные, подсвечиваем активный таб во всех копиях стрипа.

   Тонкости:
   - #3 press-фидбэк (бамп) на мобилке: при делегировании :active часто не
     срабатывает, поэтому ставим .__clicked на pointerdown (tabs.css → scale).
   - #7 не сбрасывать горизонтальный скролл таб-стрипа: у каждой панели свой
     дубль стрипа, поэтому переносим scrollLeft со старого на новый при switch. */
(function () {
  function tabs() { return document.querySelectorAll('.tabs-tab[data-tab]'); }

  function activate(id) {
    document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-tab-panel') !== id;
    });
    tabs().forEach(function (btn) {
      btn.classList.toggle('__state-on', btn.getAttribute('data-tab') === id);
    });
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

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.tabs-tab[data-tab]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var id = btn.getAttribute('data-tab');
    // #7 — позиция скролла текущего стрипа → перенесём на стрип новой панели.
    var fromStrip = btn.closest('.ll-feed-tabs');
    var scrollLeft = fromStrip ? fromStrip.scrollLeft : 0;
    activate(id);
    var panel = document.querySelector('[data-tab-panel="' + id + '"]');
    var toStrip = panel && panel.querySelector('.ll-feed-tabs');
    if (toStrip) toStrip.scrollLeft = scrollLeft;
    // Скролл ленты в начало: новый таб открывается сверху + не «скачет» sticky-таббар
    // (разная высота панелей иначе дёргает его при переключении).
    var feed = document.querySelector('.phone-frame__feed');
    if (feed) feed.scrollTop = 0;
    clearPressed();
  }, true);
})();
