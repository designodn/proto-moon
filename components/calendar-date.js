/**
 * OK Design System (proto) — CalendarDate
 *
 * 1) Проставляет текущее число месяца в каждый .calendar-date__num на странице.
 * 2) По тапу ведёт в раздел «Сегодня» (today.html). Цель можно переопределить
 *    атрибутом data-calendar-href на самом .calendar-date, либо отключить
 *    переход значением data-calendar-href="" (пустая строка).
 *
 * Подключение: <script src="components/calendar-date.js"></script> в конце body.
 */
(function () {
  var DEFAULT_HREF = 'today.html';

  function fill() {
    var day = String(new Date().getDate());
    var nodes = document.querySelectorAll('.calendar-date__num');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = day;
  }

  function wireNav() {
    var cals = document.querySelectorAll('.calendar-date');
    for (var i = 0; i < cals.length; i++) {
      (function (cal) {
        // Кликабельная цель — ближайшая кнопка-обёртка, иначе сам календарик.
        var target = cal.closest('button') || cal;
        // Переход отключён, если задан пустой data-calendar-href.
        var href = cal.hasAttribute('data-calendar-href')
          ? cal.getAttribute('data-calendar-href')
          : DEFAULT_HREF;
        if (!href || target.dataset.calendarWired) return;
        target.dataset.calendarWired = '1';
        target.addEventListener('click', function () {
          window.location.href = href;
        });
      })(cals[i]);
    }
  }

  function init() {
    fill();
    wireNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
