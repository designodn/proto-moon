/* Activity indicator — счётчик «новых» в навбаре «Вокруг вас».
   Сценарий жизненного цикла: pulse (ищем новых) → счётчик 1→2→3 → пауза тишины
   → раскрытие в «N новых». Потолок — «9+». Уважает prefers-reduced-motion.

   Разметка (на странице):
     <span class="activity-indicator" data-state="pulse">
       <span class="pulse-dot __view-custom"></span>
       <span class="activity-indicator__badge">
         <span class="activity-indicator__count"><span class="activity-indicator__digit">1</span></span><span class="activity-indicator__word">новых</span>
       </span>
     </span>
   Стили — components/activity-widget.css. Один источник для обеих страниц
   «Вокруг вас» (activity-lenta/okruzhenie.html и new-vision/okruzhenie.html). */
(function () {
  function init() {
    var ind = document.querySelector('.activity-indicator');
    if (!ind || ind.__wired) return;
    ind.__wired = true;

    var badge = ind.querySelector('.activity-indicator__badge');
    var countEl = ind.querySelector('.activity-indicator__count');
    var wordEl = ind.querySelector('.activity-indicator__word');
    if (!badge || !countEl || !wordEl) return;

    var MAX = 9, SILENCE = 2500;
    var SCRIPT = [{ at: 2500, count: 1 }, { at: 1800, count: 2 }, { at: 1600, count: 3 }];
    var FINAL = SCRIPT[SCRIPT.length - 1].count;
    function word(n) { return n === 1 ? 'новое' : 'новых'; }
    function fmt(n) { return n > MAX ? MAX + '+' : String(n); }

    function setCount(n, animate) {
      var text = fmt(n); wordEl.textContent = word(n);
      if (countEl.dataset.value === text) return;
      if (!animate) { countEl.innerHTML = '<span class="activity-indicator__digit">' + text + '</span>'; countEl.dataset.value = text; return; }
      var current = countEl.querySelector('.activity-indicator__digit');
      var isChange = !!current;
      if (current) { current.classList.add('__leave'); current.addEventListener('animationend', function () { current.remove(); }, { once: true }); }
      var incoming = document.createElement('span');
      incoming.className = 'activity-indicator__digit __enter'; incoming.textContent = text;
      incoming.addEventListener('animationend', function () { incoming.classList.remove('__enter'); }, { once: true });
      countEl.appendChild(incoming); countEl.dataset.value = text;
      badge.classList.remove('__pop', '__bump'); void badge.offsetWidth;
      badge.classList.add(isChange ? '__bump' : '__pop');
    }

    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setCount(FINAL, false); ind.dataset.state = 'expanded'; return; }
    countEl.innerHTML = ''; countEl.dataset.value = '';
    function step(i) {
      if (i >= SCRIPT.length) { setTimeout(function () { ind.dataset.state = 'expanded'; }, SILENCE); return; }
      setTimeout(function () { setCount(SCRIPT[i].count, true); ind.dataset.state = 'count'; step(i + 1); }, SCRIPT[i].at);
    }
    step(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
