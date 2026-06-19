/* Back-button — общий компонент для кнопок «назад» в навбаре.

   Подключение: положи кнопку с атрибутом `data-action="back"` где удобно
   (в навбаре, в шапке оверлея, в любом месте). Стили — стандартные DS-
   классы (.button-inline и т.п.). JS-модуль автоматически навешивает
   обработчик на DOMContentLoaded.

   Поведение клика:
     1. Если в `history.length > 1` — `history.back()`.
     2. Иначе — навигация на `data-back-fallback` (или 'lenta-q3.html'
        как разумный дефолт для этого прототипа).

   Пример:
     <span class="button-inline-wrapper __size-24 __view-secondary">
       <button class="button-inline __size-24"
               data-action="back"
               data-back-fallback="lenta-q3.html"
               aria-label="Назад">
         <span class="button-inline__content">
           <img class="ll-icon button-inline__icon"
                src="assets/icons/arrow_left_24.svg"
                width="24" height="24" alt="">
         </span>
       </button>
     </span>
*/
(function () {
  var DEFAULT_FALLBACK = 'lenta-q3.html';

  function onClick(e) {
    var btn = e.currentTarget;
    var fallback = btn.getAttribute('data-back-fallback') || DEFAULT_FALLBACK;
    // history.length считает текущую запись тоже, поэтому проверяем > 1.
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = fallback;
    }
  }

  function wire() {
    var nodes = document.querySelectorAll('[data-action="back"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__backWired) continue;
      el.__backWired = true;
      el.addEventListener('click', onClick);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
