/**
 * nv-lottie — общий загрузчик lottie-web и проигрыватель разовых оверлеев.
 *
 * Раньше ensureLottie/playLottie дублировались в трёх инлайн-скриптах ленты
 * (конвейер «Вокруг вас», трофей «1 место», поздравительные фиды). Вынесено
 * в один помощник: window.nvLottie.
 *
 *   nvLottie.ensure()                  → Promise<lottie> (ленивая загрузка с CDN)
 *   nvLottie.play(path, left, top, sz) → разовый fixed-оверлей size×size в (left,top),
 *                                        самоудаляется по завершении
 *
 * Сеть/CDN недоступны → промис реджектится, play() молча ничего не делает.
 */
(function () {
  var LOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
  var loading = null;

  function ensure() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LOTTIE_CDN;
      s.async = true;
      s.onload = function () { resolve(window.lottie); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  // Разовый Lottie-оверлей в координатах left/top (fixed).
  // size — число (квадрат size×size) либо объект {w, h, par}, где par —
  // preserveAspectRatio для rendererSettings ('none' = растянуть на бокс,
  // по умолчанию 'xMidYMid meet'). Кладём на body — ряды/острова могут быть
  // overflow:hidden, а эффект должен выходить за их пределы.
  function play(path, left, top, size) {
    return ensure().then(function (lottie) {
      var w = typeof size === 'object' ? size.w : size;
      var h = typeof size === 'object' ? size.h : size;
      var par = (typeof size === 'object' && size.par) || 'xMidYMid meet';
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;' +
        'width:' + w + 'px;height:' + h + 'px;left:' + left + 'px;top:' + top + 'px;';
      document.body.appendChild(host);
      var anim = lottie.loadAnimation({
        container: host, renderer: 'svg', loop: false, autoplay: true, path: path,
        rendererSettings: { preserveAspectRatio: par }
      });
      anim.addEventListener('complete', function () { anim.destroy(); host.remove(); });
    }).catch(function () {});
  }

  window.nvLottie = { ensure: ensure, play: play };
})();
