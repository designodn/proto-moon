/**
 * OK Design System — ActionsBar (JS-часть)
 *
 * Поведение action-кнопок в `.actions-bar`:
 *  - тактильный отклик (navigator.vibrate) на каждый тап по `.button-klass`;
 *  - Lottie-анимация «Класс!» при постановке лайка (на анлайк не играет).
 *
 * Подключение (один раз на странице, где есть actions-bar):
 *   <script src="components/actions-bar.js"></script>
 * (lottie-web CDN подгружается лениво при первом тапе, если ещё не загружен)
 *
 * Реализация:
 *  - один делегированный change-листенер на document → ловит динамически
 *    добавленные кнопки тоже;
 *  - анимация рендерится в fixed-overlay, центрируется по видимой
 *    `.button-container` (не по label — label шире из-за иконки + счётчика);
 *  - после `complete` оверлей удаляется.
 */
(function () {
  var LOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
  var LOTTIE_PATH = 'assets/lottie/like.json';
  var SIZE = 160; // px — overlay

  var lottieLoading = null;

  function ensureLottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lottieLoading) return lottieLoading;
    lottieLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LOTTIE_CDN;
      s.async = true;
      s.onload = function () { resolve(window.lottie); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return lottieLoading;
  }

  function playLike(label) {
    ensureLottie().then(function (lottie) {
      var anchor = label.querySelector('.button-container') || label;
      var rect = anchor.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;

      var host = document.createElement('div');
      host.style.cssText =
        'position:fixed;z-index:9999;pointer-events:none;' +
        'width:' + SIZE + 'px;height:' + SIZE + 'px;' +
        'left:' + cx + 'px;top:' + cy + 'px;' +
        'transform:translate(-50%,-50%);';
      document.body.appendChild(host);

      var anim = lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: LOTTIE_PATH
      });
      anim.addEventListener('complete', function () {
        anim.destroy();
        host.remove();
      });
    }).catch(function () { /* CDN недоступен — молча игнорируем */ });
  }

  document.addEventListener('change', function (e) {
    var input = e.target;
    if (!input || input.type !== 'checkbox') return;
    var label = input.closest ? input.closest('.button-klass') : null;
    if (!label) return;
    // Тактильный отклик на тап по «классу» (и лайк, и снятие). Vibration API
    // есть на Android-Chrome; iOS Safari его не поддерживает → тихий no-op.
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
    // Lottie «Класс!» — только при постановке лайка, на анлайк не играет.
    if (!input.checked) return;
    playLike(label);
  });
})();
