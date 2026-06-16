/**
 * OK Design System — Tab (поведение)
 *
 * Делает табы внутри .tabs-row интерактивными: по клику на .tab-wrapper
 * выбранным становится он, с остальных снимается __selected (и обновляется
 * aria-selected). Переключение __selected запускает CSS-анимацию линии
 * (scaleX 0 → 1 — «разъезжание» из центра).
 *
 * Подключение: <script src="components/tab.js"></script>
 * Авто-инициализация всех .tabs-row на странице.
 */
(function () {
  function wire(row) {
    if (row.__tabsWired) return;
    row.__tabsWired = true;
    row.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.tab-wrapper');
      if (!tab || !row.contains(tab)) return;
      var tabs = row.querySelectorAll('.tab-wrapper');
      Array.prototype.forEach.call(tabs, function (t) {
        var on = (t === tab);
        t.classList.toggle('__selected', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    });
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.tabs-row'), wire);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
