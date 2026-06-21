/**
 * tabbar-autohide.js — прячет .ll-tabbar при скролле вниз, показывает при скролле
 * вверх. Скроллит .phone-frame__feed (а не document). Подключение: добавь
 * <script src="components/tabbar-autohide.js"></script> на странице с таб-баром.
 */
(function () {
  function init() {
    var feed = document.querySelector('.phone-frame__feed');
    var bar = document.querySelector('.ll-tabbar');
    if (!feed || !bar) return;

    var last = feed.scrollTop;
    var ticking = false;
    var THRESHOLD = 6;     // мин. дельта, чтобы не дёргалось
    var TOP_GUARD = 40;    // у самого верха таб-бар всегда виден

    feed.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = feed.scrollTop;
        if (y > last + THRESHOLD && y > TOP_GUARD) bar.classList.add('__hidden');      // вниз → прячем
        else if (y < last - THRESHOLD) bar.classList.remove('__hidden');               // вверх → показываем
        last = y;
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
