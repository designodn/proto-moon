/* ============================================================
   Анимация «веера» фото в карточке фотомарафона (.marathon__gallery)
   Та же механика, что и в hero онбординга: плитки собираются из схлопнутого
   полупрозрачного состояния в финальный наклон при попадании во вьюпорт.

   Подключение: <script src="components/marathon-gallery-anim.js"></script>
   Работает декларативно — достаточно наличия .marathon__gallery на странице.
   ============================================================ */
(function () {
  'use strict';

  function init() {
    var gals = document.querySelectorAll('.marathon__gallery');
    if (!gals.length) return;

    // Нет IntersectionObserver — показываем сразу (без анимации, но без скрытия).
    if (!('IntersectionObserver' in window)) {
      gals.forEach(function (g) { g.classList.add('__anim', 'is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.25 });

    gals.forEach(function (g) {
      g.classList.add('__anim');   // переводим в схлопнутое состояние
      io.observe(g);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
