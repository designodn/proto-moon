/*
 * image-skeleton.js — шиммер-плейсхолдер на время загрузки картинок.
 *
 * Зачем: после переезда картинок в облако они грузятся по сети, и пустые
 * рамки выглядят «криво». Этот скрипт вешает существующий в дизайн-системе
 * класс «.__state-loading» (шиммер для .media / .avatar / .picture) на
 * контейнер картинки, пока она грузится, и снимает его по событию load/error.
 *
 * Самодостаточно, без зависимостей, идемпотентно — безопасно подключать на
 * любой странице:  <script src="<путь>/components/image-skeleton.js" defer></script>
 */
(function () {
  var BOX = '.media, .avatar, .picture';
  var TIMEOUT = 10000; // страховка: снять шиммер, даже если событие не пришло

  function track(img) {
    if (!img || img.tagName !== 'IMG' || !img.closest) return;
    var box = img.closest(BOX);
    if (!box) return;
    // уже загружено (из кэша / синхронно) — плейсхолдер не нужен, без мигания
    if (img.complete && img.naturalWidth > 0) { box.classList.remove('__state-loading'); return; }
    if (box.__skel) return;                 // уже отслеживаем этот контейнер
    box.__skel = true;
    box.classList.add('__state-loading');
    var done = function () {
      box.classList.remove('__state-loading');
      box.__skel = false;
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
    };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
    setTimeout(done, TIMEOUT);
  }

  function scan(root) {
    var imgs = (root || document).querySelectorAll(BOX + ' img, img[data-person-avatar], img[data-user-avatar]');
    for (var i = 0; i < imgs.length; i++) track(imgs[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }

  // Картинки, у которых src проставляется позже (people-data.js и др.) или которые
  // дорисовываются в DOM динамически — ловим через наблюдатель.
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes' && m.target.tagName === 'IMG') track(m.target);
        else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.tagName === 'IMG') track(n);
            else if (n.querySelectorAll) scan(n);
          }
        }
      }
    });
    mo.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['src'],
    });
  }

  window.DS_IMAGE_SKELETON = { scan: scan };
})();
