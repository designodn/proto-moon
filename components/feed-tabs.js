/* Feed tabs — переключение панелей ленты НА МЕСТЕ (без перехода).

   Разметка (генерит scripts/fetch-q3.mjs --activity):
     - таб-стрип .tabs.ll-feed-tabs с кнопками .tabs-tab[data-tab="<id>"]
       (дублируется в первый остров каждой панели — активна своя кнопка);
     - панели .ll-tabpanel[data-tab-panel="<id>"]; невидимые помечены [hidden].

   Клик по любой .tabs-tab[data-tab] → показываем соответствующую панель,
   прячем остальные, и подсвечиваем активный таб во ВСЕХ копиях стрипа
   (видна всегда одна панель → один стрип). Перехват в capture +
   stopImmediatePropagation — чтобы общий обработчик навигации не уводил. */
(function () {
  function activate(id) {
    document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-tab-panel') !== id;
    });
    document.querySelectorAll('.tabs-tab[data-tab]').forEach(function (btn) {
      btn.classList.toggle('__state-on', btn.getAttribute('data-tab') === id);
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.tabs-tab[data-tab]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    activate(btn.getAttribute('data-tab'));
  }, true);
})();
