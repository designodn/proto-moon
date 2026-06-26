/* Masonry — снап аспекта медиа пинов к 16:9 / 1:1 / 9:16 в рантайме.

   У каждого пина (.pin .uni-card-media img) по натуральным размерам картинки
   выбираем БЛИЖАЙШИЙ из трёх разрешённых аспектов и вешаем класс на медиа-бокс
   (__ar-16-9 | __ar-1-1 | __ar-9-16). Картинка — object-fit:cover по боксу,
   высоты получаются разные → masonry. Стили — components/masonry.css. */
(function () {
  var RATIOS = [['__ar-16-9', 16 / 9], ['__ar-1-1', 1], ['__ar-9-16', 9 / 16]];
  var CLASSES = RATIOS.map(function (r) { return r[0]; });

  function snap(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    var r = w / h, best = RATIOS[0][0], bd = Infinity;
    RATIOS.forEach(function (x) {
      var d = Math.abs(Math.log(r / x[1]));   // лог-расстояние: симметрично к «ближе»
      if (d < bd) { bd = d; best = x[0]; }
    });
    var media = img.closest('.uni-card-media');
    if (!media) return;
    media.classList.remove.apply(media.classList, CLASSES);
    media.classList.add(best);
  }

  function init() {
    document.querySelectorAll('.pin .uni-card-media img').forEach(function (img) {
      if (img.complete && img.naturalWidth) snap(img);
      else img.addEventListener('load', function () { snap(img); }, { once: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
