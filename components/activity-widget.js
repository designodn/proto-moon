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

    // Ячейки, не прошедшие порог высоты, помечены .__conv-oversize и в ротации
    // не участвуют — работаем со списком оставшихся.
    function eligibleCells() {
      return Array.prototype.filter.call(track.children, function (cell) {
        return !cell.classList.contains('__conv-oversize');
      });
    }

    // Самая частая высота пула. При равенстве частот берём меньшую — так порог
    // не уползает вверх от пары случайно длинных карточек.
    function modeOf(list) {
      var counts = {};
      var bestCount = 0;
      var bestValue = 0;
      list.forEach(function (h) {
        counts[h] = (counts[h] || 0) + 1;
        if (counts[h] > bestCount || (counts[h] === bestCount && h < bestValue)) {
          bestCount = counts[h];
          bestValue = h;
        }
      });
      return bestValue;
    }

    // Разброс высот ячеек (1/2/3 строки текста) ломает конвейер с фиксированной
    // высотой: под низкой парой копится пустота снизу, а высокая пара наоборот
    // не влезает и наезжает на блок под виджетом. Поэтому в ротацию берём только
    // ячейки не выше порога и тянем каждую РОВНО до порога — контент внутри
    // центрируется (justify-content:center у ряда), пустого места не остаётся.
    // Высокие карточки не теряются: полный список открывается по шеврону.
    // Замер кешируется до изменения viewport.
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
        var rows = Math.round(cssNum('--conv-rows', 2));
        var gap = cssNum('--conv-gap', 0) * Math.max(0, rows - 1);
        var threshold = modeOf(heights);

        // Страховка: если под порог попадает меньше ячеек, чем нужно конвейеру
        // для ротации (видимые + одна на подмену), не фильтруем вовсе — порогом
        // становится максимум, и в ротации остаётся весь пул. Замерший виджет
        // хуже лишнего воздуха в коротких ячейках.
        if (heights.filter(function (h) { return h <= threshold; }).length < rows + 1) {
          threshold = max;
        }

        Array.prototype.forEach.call(track.children, function (cell, index) {
          var oversize = heights[index] > threshold;
          cell.classList.toggle('__conv-oversize', oversize);
          // Ряды в ротации тянем до общей высоты, чтобы резерв совпадал с любой
          // парой; отсеянным оставляем натуральную (вернутся при пересчёте).
          cell.style.setProperty('--conv-cell-h',
            (oversize ? heights[index] : threshold) + 'px');
        });

        // Все ротируемые ряды одной высоты — резерв точный, без остатка.
        cachedStackHeight = threshold * rows + gap;
        conv.style.setProperty('--conv-stack-h', cachedStackHeight + 'px');
        syncPoolVisibility();
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
      eligibleCells().forEach(function (cell, index) {
        cell.classList.toggle('__conv-pool-hidden',
          index >= rows && !cell.classList.contains('__conv-leave'));
      });
    }

    syncPoolVisibility();

    function step() {
      var rows = Math.round(cssNum('--conv-rows', 3));
      var pool = eligibleCells();
      if (animating || pool.length < rows + 1) return;
      animating = true;

      // следующую скрытую (первую под видимой зоной) поднимаем наверх
      var entering = pool[rows];
      track.insertBefore(entering, pool[0]);
      entering.classList.remove('__conv-pool-hidden');
      void entering.offsetWidth;                 // reflow → enter стартует с height:0
      entering.classList.add('__conv-enter');    // возникает из точки (animations.css)
      appear(entering);                          // + вспышка категорийной подложки

      // нижняя видимая (теперь снова [rows] в списке) — сжимается и исчезает
      var leaving = eligibleCells()[rows];
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
