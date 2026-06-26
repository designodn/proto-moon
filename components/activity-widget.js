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

    function cssNum(name, dflt) {
      var v = parseFloat(getComputedStyle(conv).getPropertyValue(name));
      return isNaN(v) ? dflt : v;
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

    function step() {
      var rows = Math.round(cssNum('--conv-rows', 3));
      if (animating || track.children.length < rows + 1) return;
      animating = true;

      // следующую скрытую (первую под видимой зоной) поднимаем наверх
      var entering = track.children[rows];
      track.insertBefore(entering, track.firstElementChild);
      void entering.offsetWidth;                 // reflow → enter стартует с height:0
      entering.classList.add('__conv-enter');    // возникает из точки (animations.css)
      appear(entering);                          // + вспышка категорийной подложки

      // нижняя видимая (теперь снова children[rows]) — сжимается к центру и исчезает
      var leaving = track.children[rows];
      leaving.classList.add('__conv-leave');

      setTimeout(function () {
        leaving.classList.remove('__conv-leave');
        entering.classList.remove('__conv-enter');
        track.appendChild(leaving);             // ушедшую — в конец пула (станет скрытой)
        animating = false;
        playCellLottie(entering);               // эффект — после раскрытия (rect стабилен)
      }, cssNum('--conv-dur', 0.5) * 1000 + 60);
    }

    // Первый показ: видимые ряды тоже «приходят к дефолту» из цветной подложки —
    // иначе категории видны только на сменяемой верхней ячейке.
    var rows0 = Math.round(cssNum('--conv-rows', 3));
    for (var i = 0; i < rows0 && i < track.children.length; i++) {
      var cell = track.children[i];
      appear(cell);
      requestAnimationFrame(playCellLottie.bind(null, cell)); // ряды статичны → rect готов
    }

    var stepMs = parseInt(conv.getAttribute('data-step-ms'), 10) || STEP_MS_DEFAULT;
    setInterval(step, stepMs);
  }

  function init() {
    if (reduce) return;   // без анимаций конвейер не крутим (ячейки видны статично)
    document.querySelectorAll('.ds-activity-conveyor').forEach(initConveyor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
