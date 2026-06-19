/* smart-crop.js — авто-кадрирование фото «в моменте», чтобы не срезать лицо.
 *
 * Контекст: фото в прототипе — хотлинки на внешние CDN (okcdn, dzen), которые
 * НЕ отдают CORS-заголовок. Поэтому прочитать пиксели через <canvas> браузер
 * запрещает (taint), а значит распознать само лицо ни одной библиотекой нельзя
 * (нативный FaceDetector из браузеров тоже убрали). Это станет возможным, когда
 * картинки начнут отдаваться со своего домена / с CORS.
 *
 * Что МОЖНО без CORS: natural-размеры кадра доступны и для cross-origin картинок.
 * По ним и по пропорциям слота определяем НАПРАВЛЕНИЕ обрезки object-fit:cover:
 *   • портрет режется сверху/снизу (узкий источник в более широком слоте) →
 *     лицо обычно в верхней трети → смещаем object-position вверх;
 *   • режется по бокам / уже хорошо вписан → оставляем центр.
 * Так «в моменте» и автоматически перестаём резать лица в портретах, не трогая
 * нормально закадрированные и пейзажные фото.
 */
(function () {
  // Доля по вертикали, к которой прижимаем кадр при верхней обрезке (≈ верхняя
  // треть, где статистически находится лицо, с небольшим запасом сверху).
  var TOP_BIAS = '50% 30%';
  var CENTER = '50% 50%';
  // Запас, чтобы микро-расхождения пропорций не считались обрезкой.
  var EPS = 0.03;

  function eligible(img) {
    if (img.closest('.avatar')) return false;           // аватары квадратные — не трогаем
    return getComputedStyle(img).objectFit === 'cover';  // только cover-обрезка
  }

  function fit(img) {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    var box = img.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (!eligible(img)) { img.style.objectPosition = ''; return; }
    var srcRatio = nw / nh;          // пропорции исходного кадра
    var boxRatio = box.width / box.height;
    // Смещаем кадр вверх только когда:
    //   • источник ПОРТРЕТНЫЙ (выше, чем шире) — именно там лица, и
    //   • cover режет его сверху/снизу (источник уже слота: srcRatio < boxRatio).
    // Пейзажные кадры (srcRatio ≥ 1) оставляем по центру, даже если их слегка
    // подрезает по вертикали, — у них сюжет обычно по центру.
    var portraitCutVertically = srcRatio < 1 && srcRatio < boxRatio - EPS;
    img.style.objectPosition = portraitCutVertically ? TOP_BIAS : CENTER;
  }

  function attach(img) {
    if (img.dataset.smartCrop) return;
    img.dataset.smartCrop = '1';
    // Не once: при смене src (превью клипа, плеер) пере-кадрируем заново.
    img.addEventListener('load', function () { fit(img); });
    if (img.complete && img.naturalWidth) fit(img);
  }

  function scan() {
    document.querySelectorAll('img').forEach(function (img) {
      if (eligible(img)) attach(img);
    });
  }

  if (document.readyState !== 'loading') scan();
  else document.addEventListener('DOMContentLoaded', scan);

  // Пере-кадрируем на ресайз/повороте — направление обрезки могло измениться.
  var raf = null;
  window.addEventListener('resize', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      document.querySelectorAll('img[data-smart-crop]').forEach(fit);
    });
  });

  // На случай динамически добавленных картинок (напр. первый слайд плеера,
  // который собирается из кадров) — добираем их чуть позже.
  window.addEventListener('load', scan);
})();
