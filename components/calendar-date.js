/**
 * OK Design System (proto) — CalendarDate
 *
 * Проставляет текущее число месяца в каждый .calendar-date__num на странице.
 * Подключение: <script src="components/calendar-date.js"></script> в конце body.
 */
(function () {
  function fill() {
    var day = String(new Date().getDate());
    var nodes = document.querySelectorAll('.calendar-date__num');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = day;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fill);
  } else {
    fill();
  }
})();
