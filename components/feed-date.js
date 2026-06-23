/**
 * OK Design System (proto) — FeedDate
 *
 * Проставляет относительную дату в строку времени внутри .feed-header.
 * Элементы-мишени: любой [data-feed-hm] (кроме рекламных блоков, у которых
 * атрибута нет). NV: .feed-header__time, Q3: .text-feed__time и т.п.
 *
 * Формат (по хронологической позиции — верх ленты = свежее):
 *   • первые N постов (сегодня)  → «HH:MM» из data-feed-hm
 *   • следующие M постов (вчера) → «вчера»
 *   • остальные                  → «12 мая»
 *
 * Пороги N и M задаются атрибутами data-feed-today / data-feed-yesterday
 * на ближайшем родительском контейнере (.feed-container, .phone-frame__feed
 * и т.п.) — или глобально на <body>. Иначе действуют умолчания (4 / 3).
 *
 * Подключение: <script src="../components/feed-date.js"></script> в конце body.
 */
(function () {
  var MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  var DEFAULT_TODAY = 4;
  var DEFAULT_YESTERDAY = 3;

  function dateLabel(d) {
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function init() {
    var items = document.querySelectorAll('[data-feed-hm]');
    if (!items.length) return;

    var container = items[0].closest('[data-feed-today], [data-feed-yesterday]');
    var todayN = parseInt((container && container.getAttribute('data-feed-today'))  || DEFAULT_TODAY,     10);
    var yestN  = parseInt((container && container.getAttribute('data-feed-yesterday')) || DEFAULT_YESTERDAY, 10);

    var now = new Date();

    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (i < todayN) {
        el.textContent = el.getAttribute('data-feed-hm');
      } else if (i < todayN + yestN) {
        el.textContent = 'вчера';
      } else {
        var daysAgo = 2 + (i - todayN - yestN);
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
        el.textContent = dateLabel(d);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
