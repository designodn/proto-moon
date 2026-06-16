/* App-launch — анимация открытия приложения с иконки.

   Тап по элементу [data-launch="<url>"] → иконка из этого элемента
   летит в центр экрана, расплывается в блюр и гаснет, фон сплеша
   раскрывается circular-reveal'ом из точки тапа, по центру из блюра
   проявляется splash-логотип. По окончании — навигация на <url>.

   DOM-требования (см. components/app-launch.css):
     - на странице должны быть #launch (.launch + .launch__glyph) и
       #splash (.splash + .splash__logo + опц. .splash__subtitle)
     - триггер: <button data-launch="path.html">…</button>; внутри
       триггера должен быть элемент-иконка. По умолчанию ищется
       .app__icon — можно переопределить через data-launch-icon-sel.

   Тонкости:
   - Контейнер для координат — ближайший .device или .phone-frame.
     Если нет — body.
   - Двойной rAF между добавлением .is-animating и .is-faded:
     иначе браузер схлопывает оба class-add в один style recalc и
     opacity 0→1→0 не отыгрывается (иконку не видно).
   - SPLASH_MS = время до навигации; должно превышать сумму всех
     анимаций, иначе следующая страница загрузится раньше, чем
     splash-логотип дойдёт до полной чёткости.

   API:
     <button data-launch="<url>"
             data-launch-icon-sel="<selector>"      // optional
             data-launch-splash-size="128">…</button>

   Событие на document:
     'app-launch:start' — детали { trigger, iconEl, target }
     'app-launch:done'  — перед самой навигацией
     Хост может в обработчике записать sessionStorage и т.п.

   Программный API:
     window.AppLaunch.go(triggerEl, iconEl, target)
     window.AppLaunch.reset()  // сбросить стейт после bfcache restore
*/
(function (global) {
  var DEFAULT_SPLASH_MS = 1150;
  var DEFAULT_LOGO_SIZE = 128;

  function findRoot(el) {
    return el.closest('.device, .phone-frame') || document.body;
  }

  function reset() {
    var launch = document.getElementById('launch');
    var splash = document.getElementById('splash');
    var glyph  = document.getElementById('launchGlyph');
    if (launch) {
      launch.className = 'launch';
      launch.removeAttribute('style');
    }
    if (glyph) glyph.innerHTML = '';
    if (splash) {
      splash.style.display = 'none';
      splash.classList.remove('is-revealing', 'is-loaded');
      splash.style.clipPath = '';
    }
  }

  function go(triggerEl, iconEl, target, opts) {
    opts = opts || {};
    var SPLASH_MS  = opts.splashMs  || DEFAULT_SPLASH_MS;
    var LOGO_SIZE  = opts.logoSize  || DEFAULT_LOGO_SIZE;

    var launch = document.getElementById('launch');
    var glyph  = document.getElementById('launchGlyph');
    var splash = document.getElementById('splash');
    if (!launch || !splash) {
      // Нет инфры компонента — просто навигируем без анимации
      window.location.href = target;
      return;
    }

    var root     = findRoot(triggerEl);
    var rootRect = root.getBoundingClientRect();
    var iconRect = iconEl.getBoundingClientRect();

    // Координаты иконки относительно root
    var startLeft = iconRect.left - rootRect.left;
    var startTop  = iconRect.top  - rootRect.top;
    var iconCx    = startLeft + iconRect.width  / 2;
    var iconCy    = startTop  + iconRect.height / 2;

    // Куда летит лого — в центр root, размером LOGO_SIZE
    var endLeft = (rootRect.width  - LOGO_SIZE) / 2;
    var endTop  = (rootRect.height - LOGO_SIZE) / 2;

    // Радиус — чтобы круговая волна покрыла весь root от точки тапа
    var maxR = Math.hypot(
      Math.max(iconCx, rootRect.width  - iconCx),
      Math.max(iconCy, rootRect.height - iconCy)
    );

    // Поставить launch ровно над тапнутой иконкой
    launch.className = 'launch';
    if (iconEl.className) launch.className += ' ' + iconEl.className;
    launch.style.top    = startTop  + 'px';
    launch.style.left   = startLeft + 'px';
    launch.style.width  = iconRect.width  + 'px';
    launch.style.height = iconRect.height + 'px';
    launch.style.borderRadius = '50%';
    if (glyph) glyph.innerHTML = iconEl.innerHTML;

    // Подготовить сплеш: круг радиуса 0 в точке тапа
    splash.style.display = 'flex';
    splash.classList.remove('is-revealing', 'is-loaded');
    splash.style.clipPath = 'circle(0px at ' + iconCx + 'px ' + iconCy + 'px)';

    // Хук для хост-страницы (например, выставить sessionStorage-флаг)
    document.dispatchEvent(new CustomEvent('app-launch:start', {
      detail: { trigger: triggerEl, iconEl: iconEl, target: target }
    }));

    // Reflow → запускаем переходы
    void launch.offsetWidth;
    void splash.offsetWidth;

    launch.classList.add('is-animating');
    launch.style.top    = endTop  + 'px';
    launch.style.left   = endLeft + 'px';
    launch.style.width  = LOGO_SIZE + 'px';
    launch.style.height = LOGO_SIZE + 'px';
    launch.style.borderRadius = '24%';

    splash.classList.add('is-revealing');
    splash.style.clipPath = 'circle(' + maxR + 'px at ' + iconCx + 'px ' + iconCy + 'px)';

    // Кроссфейд: иконка блюрится+гаснет параллельно с движением,
    // splashLogo проявляется из блюра. Double-rAF, чтобы между
    // is-animating и is-faded прошёл полный кадр paint'а — иначе
    // оба class-add'а резолвятся в одном style recalc и opacity 1→0
    // не отыгрывается.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        launch.classList.add('is-arrived');
        splash.classList.add('is-loaded');
        launch.classList.add('is-faded');
      });
    });

    setTimeout(function () {
      document.dispatchEvent(new CustomEvent('app-launch:done', {
        detail: { trigger: triggerEl, target: target }
      }));
      window.location.href = target;
    }, SPLASH_MS);
  }

  function wire() {
    document.querySelectorAll('[data-launch]').forEach(function (el) {
      if (el.__launchWired) return;
      el.__launchWired = true;
      el.addEventListener('click', function (e) {
        var target = el.getAttribute('data-launch');
        if (!target) return;
        var sel    = el.getAttribute('data-launch-icon-sel') || '.app__icon';
        var iconEl = el.querySelector(sel) || el;
        var opts = {};
        var sz = el.getAttribute('data-launch-splash-size');
        if (sz) opts.logoSize = parseInt(sz, 10);
        var ms = el.getAttribute('data-launch-ms');
        if (ms) opts.splashMs = parseInt(ms, 10);
        go(el, iconEl, target, opts);
      });
    });
  }

  global.AppLaunch = { go: go, reset: reset };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})(window);
