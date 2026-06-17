/**
 * OK Design System — FeedText (runtime)
 *
 * Снимает ограничение компонента: понимает, реально ли текст оборвался.
 * Замеряет .feed-text__body в СВЁРНУТОМ состоянии: если контент помещается
 * в отведённые строки (scrollHeight ≤ clientHeight), текст виден целиком —
 * на .feed-text вешается класс .__fits, по которому CSS прячет кнопку
 * «Раскрыть/Свернуть» (см. feed-text.css).
 *
 * Пересчитывается при ресайзе и после загрузки шрифтов (высота строк может
 * измениться). Подключать после разметки:
 *   <script src="../components/feed-text.js"></script>
 *
 * API: window.DS_FEED_TEXT.apply(rootEl?)
 */
(function () {
  function evaluate(ft) {
    var body = ft.querySelector('.feed-text__body');
    var expand = ft.querySelector('.feed-text__expand');
    if (!body || !expand) return;
    // Мерить корректно можно только в свёрнутом состоянии: в развёрнутом
    // clamp снят и scrollHeight === clientHeight всегда.
    var input = expand.querySelector('input[type="checkbox"]');
    if (input && input.checked) return;
    var fits = body.scrollHeight <= body.clientHeight + 1;
    ft.classList.toggle('__fits', fits);
  }

  function apply(root) {
    (root || document).querySelectorAll('.feed-text').forEach(evaluate);
  }

  function init() {
    apply();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { apply(); });
    }
  }

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { apply(); }, 150);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DS_FEED_TEXT = { apply: apply };
})();
