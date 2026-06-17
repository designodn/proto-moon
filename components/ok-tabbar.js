/**
 * OK Design System — <ok-tabbar> (единый таб-бар из одного места)
 *
 * Light-DOM кастомный элемент: рендерит разметку таб-бара и сам вешает поведение
 * (клики по слотам + свайп-вверх по хвату). Используем light-DOM (без Shadow DOM),
 * чтобы существующий CSS — общий tabbar.css и переопределения nv-tabbar.css — красил
 * элемент как раньше (маски + currentColor + токены).
 *
 * Зачем: раньше разметка таб-бара копировалась в каждый .html руками и разъезжалась
 * (разный набор слотов, разные обёртки, ручной __state-on). Теперь источник правды
 * один — конфиг VARIANTS ниже.
 *
 * Использование на странице (подключать в <head>, чтобы элемент апгрейдился до парса
 * остального и существовал до любых внешних обработчиков):
 *   <script src="../components/ok-tabbar.js"></script>
 *   ...
 *   <ok-tabbar data-variant="nv" data-active="feed"></ok-tabbar>
 *
 * Атрибуты:
 *   data-variant — ключ в VARIANTS (по умолчанию 'nv').
 *   data-active  — slot активной вкладки (получает __state-on).
 */
(function () {
  var VARIANTS = {
    /* New Vision: 5 слотов, обёртка phone-frame__tabbar (см. nv-tabbar.css) */
    nv: {
      platform: 'android',
      wrapper: 'phone-frame__tabbar',
      home: 'start.html',
      menuSlot: 'menu',
      tabs: [
        { slot: 'feed',    href: 'lenta.html',       label: 'Лента' },
        { slot: 'tribune', href: '../tribune.html',  label: 'Трибуна' },
        { slot: 'message', href: '../messages.html', label: 'Сообщения' },
        { slot: 'clip',    href: '#',                label: 'Клипы' },
        { slot: 'menu',    href: 'menu.html',         label: 'Меню' }
      ]
    }
  };

  function render(el) {
    var variant = VARIANTS[el.getAttribute('data-variant') || 'nv'] || VARIANTS.nv;
    var active = el.getAttribute('data-active') || '';

    var btns = variant.tabs.map(function (t) {
      var cls = 'tabbar-icon __slot-' + t.slot + (t.slot === active ? ' __state-on' : '');
      // Каждая иконка в своей ячейке .tabbar__cell — она тянется на равную долю
      // ширины (flex:1) и центрирует кнопку, чтобы таб-бар растягивался по экрану.
      return '<div class="tabbar__cell">' +
               '<button class="' + cls + '" data-href="' + t.href + '" aria-label="' + t.label + '"></button>' +
             '</div>';
    }).join('');

    el.innerHTML =
      '<div class="' + variant.wrapper + '">' +
        '<div class="tabbar __platform-' + variant.platform + '">' +
          '<div class="tabbar__row">' + btns + '</div>' +
          '<div class="tabbar__handle"></div>' +
        '</div>' +
      '</div>';

    bind(el, variant);
  }

  /* Поведение вешаем на узлы самого компонента (а не глобально на document),
     потому что разметка появляется только после рендера элемента. */
  function bind(el, variant) {
    el.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.tabbar-icon') : null;
      if (!btn) return;

      if (btn.classList.contains('__state-on')) {
        // повторный тап по активной вкладке меню → меню (паритет с tab-bar.js)
        if (btn.classList.contains('__slot-' + variant.menuSlot)) {
          var menu = variant.tabs.filter(function (t) { return t.slot === variant.menuSlot; })[0];
          if (menu) { sessionStorage.setItem('nav-tab', '1'); location.href = menu.href; }
        }
        return;
      }

      var href = btn.getAttribute('data-href');
      if (href && href !== '#') {
        sessionStorage.setItem('nav-tab', '1');
        location.href = href;
      }
    });

    /* Home-indicator: свайп-вверх по .tabbar__handle → домашний экран */
    var handle = el.querySelector('.tabbar__handle');
    if (handle) {
      var sy = 0, dy = 0, dragging = false;
      handle.addEventListener('pointerdown', function (e) {
        dragging = true; sy = e.clientY; dy = 0;
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      });
      handle.addEventListener('pointermove', function (e) {
        if (dragging) dy = e.clientY - sy;
      });
      function endGesture() {
        if (!dragging) return;
        dragging = false;
        if (dy < -40) location.href = variant.home;
      }
      handle.addEventListener('pointerup', endGesture);
      handle.addEventListener('pointercancel', endGesture);
    }
  }

  if ('customElements' in window) {
    customElements.define('ok-tabbar', class extends HTMLElement {
      connectedCallback() {
        if (this.__rendered) return;
        this.__rendered = true;
        render(this);
      }
    });
  }
})();
