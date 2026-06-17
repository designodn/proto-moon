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

  // Разовый Lottie-оверлей в координатах left/top.
  // size — число (квадрат size×size) либо объект {w, h, par, mount}:
  //   par   — preserveAspectRatio ('none' = растянуть на бокс, по умолчанию
  //           'xMidYMid meet');
  //   mount — DOM-элемент-контейнер. Если задан, оверлей кладётся ВНУТРЬ него
  //           (position:absolute, left/top — относительно mount) — так эффект
  //           едет и клипается вместе с контейнером (нужно для фидов). Если не
  //           задан — fixed-оверлей на body (выходит за overflow:hidden рядов).
  function play(path, left, top, size) {
    return ensure().then(function (lottie) {
      var obj = typeof size === 'object' ? size : null;
      var w = obj ? obj.w : size;
      var h = obj ? obj.h : size;
      var par = (obj && obj.par) || 'xMidYMid meet';
      var mount = obj && obj.mount;
      var host = document.createElement('div');
      host.style.cssText =
        (mount ? 'position:absolute;' : 'position:fixed;') +
        'pointer-events:none;z-index:3;' +
        'width:' + w + 'px;height:' + h + 'px;left:' + left + 'px;top:' + top + 'px;';
      (mount || document.body).appendChild(host);
      var anim = lottie.loadAnimation({
        container: host, renderer: 'svg', loop: false, autoplay: true, path: path,
        rendererSettings: { preserveAspectRatio: par }
      });
      anim.addEventListener('complete', function () { anim.destroy(); host.remove(); });
    }).catch(function () {});
  }

  window.nvLottie = { ensure: ensure, play: play };
})();
