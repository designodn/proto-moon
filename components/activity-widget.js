/* Activity widget — конвейер «Вокруг вас» (бегущая лента коротких ячеек).

   Компонентная версия инлайн-скрипта из new-vision/lenta.html: работает с
   ЛЮБЫМ числом виджетов `.ds-activity-conveyor` на странице (не привязан к
   конкретному id), поэтому остров можно вставлять в ленту как переиспользуемый
   блок (см. components/activity-widget.css + генерацию острова в fetch-q3.mjs).

   Разметка (минимум):
     <div class="ds-activity-conveyor">
       <div class="ds-activity-conveyor__track">
         <div class="uni-cell-wrapper __type-activity [__cat-win|__cat-neuro|__cat-holiday]">…</div>
         … (ячеек больше, чем видимых рядов --conv-rows) …
       </div>
     </div>

   Как работает: раз в STEP_MS первая скрытая (под видимой зоной) ячейка
   поднимается наверх и «возникает из точки» (.__conv-enter, animations.css),
   нижняя видимая сжимается и исчезает (.__conv-leave). На входе ячейка
   вспыхивает подложкой цвета своей категории (.__conv-appear, палитра в
   activity-widget.css); у «Праздника» (.__cat-holiday) поверх играет
   Lottie-конфетти — только если на странице есть window.nvLottie.

   Уважает prefers-reduced-motion (конвейер не запускается).

   Настройки через data-атрибуты на .ds-activity-conveyor (опционально):
     data-step-ms="3000"                 — период смены ячеек
     data-confetti-src="assets/lottie/confetti.json"  — путь к Lottie-конфетти
*/
(function () {
  var STEP_MS_DEFAULT = 3000;
  var APPEAR_MS = 1300;   // синхронно с au-fade 1.3s (activity-widget.css)
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initConveyor(conv) {
    var track = conv.querySelector('.ds-activity-conveyor__track');
    if (!track) return;
    var measureFrame = 0;
    var measuredViewportWidth = -1;
    var cachedRowHeight = 0;
    var cachedStackHeight = 0;

    function cssNum(name, dflt) {
      var v = parseFloat(getComputedStyle(conv).getPropertyValue(name));
      return isNaN(v) ? dflt : v;
    }

    // Если источник пока содержит меньше строк, чем рассчитан виджет,
    // не резервируем пустые ряды. При добавлении данных максимум останется 2.
    var configuredRows = Math.round(cssNum('--conv-rows', 2));
    conv.style.setProperty('--conv-rows', Math.max(0, Math.min(configuredRows, track.children.length)));

    // Каждая строка сохраняет естественную высоту. Высота всего конвейера —
    // максимум + медиана + gap, поэтому единичная высокая строка не создаёт
    // пустоту внутри каждой ячейки. Замер кешируется до изменения viewport.
    function measureRows() {
      if (animating) return;
      var viewportWidth = Math.round(document.documentElement.clientWidth || window.innerWidth || 0);
      if (cachedRowHeight > 0 && viewportWidth === measuredViewportWidth) {
        conv.style.setProperty('--conv-row-h', cachedRowHeight + 'px');
        if (cachedStackHeight > 0) conv.style.setProperty('--conv-stack-h', cachedStackHeight + 'px');
        return;
      }
      conv.classList.add('__conv-measuring');
      var max = 0;
      var heights = [];
      Array.prototype.forEach.call(track.children, function (cell) {
        // Измеряем только содержимое строки. scrollHeight wrapper включает
        // декоративный overlay с inset:-8px и завышает высоту на 8px.
        var content = cell.querySelector('.uni-cell') || cell;
        var height = Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height));
        heights.push(height);
        max = Math.max(max, height);
      });
      conv.classList.remove('__conv-measuring');
      var next = Math.ceil(max);
      if (next > 0) {
        measuredViewportWidth = viewportWidth;
        cachedRowHeight = next;
        Array.prototype.forEach.call(track.children, function (cell, index) {
          cell.style.setProperty('--conv-cell-h', heights[index] + 'px');
        });
        var rows = Math.round(cssNum('--conv-rows', 2));
        var sorted = heights.slice().sort(function (a, b) { return a - b; });
        var middle = Math.floor(sorted.length / 2);
        var median = sorted.length % 2
          ? sorted[middle]
          : Math.ceil((sorted[middle - 1] + sorted[middle]) / 2);
        // На любой ширине не умножаем аномально высокую строку на число рядов:
        // резервируем максимум + типичную (медианную) строку + межстрочный gap.
        cachedStackHeight = (sorted[sorted.length - 1] || 0) + (median || 0)
          + cssNum('--conv-gap', 0) * Math.max(0, rows - 1);
        conv.style.setProperty('--conv-stack-h', cachedStackHeight + 'px');
      }
    }

    function scheduleMeasure() {
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(measureRows);
    }

    var confettiSrc = conv.getAttribute('data-confetti-src') || 'assets/lottie/confetti.json';

    // Конфетти «Праздника» — разовый бёрст по центру ячейки (body-оверлей, т.к.
    // должен выходить за overflow:hidden ряда). Только если nvLottie подключён.
    function playCellLottie(cell) {
      if (cell.classList.contains('__cat-holiday') && window.nvLottie) {
        var cr = cell.getBoundingClientRect();
        var size = 220;
        window.nvLottie.play(confettiSrc,
          cr.left + cr.width / 2 - size / 2, cr.top + cr.height / 2 - size / 2, size);
      }
    }

    // Вспышка категорийной подложки на входящей ячейке.
    function appear(cell) {
      cell.classList.add('__conv-appear');
      setTimeout(function () { cell.classList.remove('__conv-appear'); }, APPEAR_MS);
    }

    var animating = false;

    measureRows();
    if ('ResizeObserver' in window) {
      var resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(conv);
    } else {
      window.addEventListener('resize', scheduleMeasure, { passive: true });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleMeasure);
    }

    function syncPoolVisibility() {
      var rows = Math.round(cssNum('--conv-rows', 3));
      Array.prototype.forEach.call(track.children, function (cell, index) {
        cell.classList.toggle('__conv-pool-hidden',
          index >= rows && !cell.classList.contains('__conv-leave'));
      });
    }

    syncPoolVisibility();

    function step() {
      var rows = Math.round(cssNum('--conv-rows', 3));
      if (animating || track.children.length < rows + 1) return;
      animating = true;

      // следующую скрытую (первую под видимой зоной) поднимаем наверх
      var entering = track.children[rows];
      track.insertBefore(entering, track.firstElementChild);
      entering.classList.remove('__conv-pool-hidden');
      void entering.offsetWidth;                 // reflow → enter стартует с height:0
      entering.classList.add('__conv-enter');    // возникает из точки (animations.css)
      appear(entering);                          // + вспышка категорийной подложки

      // нижняя видимая (теперь снова children[rows]) — сжимается к центру и исчезает
      var leaving = track.children[rows];
      leaving.classList.remove('__conv-pool-hidden');
      leaving.classList.add('__conv-leave');

      setTimeout(function () {
        leaving.classList.remove('__conv-leave');
        entering.classList.remove('__conv-enter');
        track.appendChild(leaving);             // ушедшую — в конец пула (станет скрытой)
        syncPoolVisibility();
        animating = false;
        playCellLottie(entering);               // эффект — после раскрытия (rect стабилен)
      }, cssNum('--conv-dur', 0.5) * 1000 + 60);
    }

    // Вспышка запускается только на реально входящей ячейке внутри step().
    // При первоначальном открытии страницы видимые строки остаются статичными.
    if (!reduce) {
      var stepMs = parseInt(conv.getAttribute('data-step-ms'), 10) || STEP_MS_DEFAULT;
      setInterval(step, stepMs);
    }
  }

  function init() {
    document.querySelectorAll('.ds-activity-conveyor').forEach(initConveyor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
