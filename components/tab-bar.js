/**
 * OK Design System — TabBar navigation
 *
 * Привязывает переходы к иконкам таббара (.tabbar-icon).
 * Приоритет: явный data-href на кнопке → дефолтная карта по слоту.
 * Подключение: <script src="components/tab-bar.js"></script> на странице с .tabbar.
 */
(function () {
  var ROUTES = {
    feed: 'lenta-q3.html',
    book: 'tribune.html',
    message: 'messages.html',
    clip: 'klipy.html',
    menu: 'menu.html'
  };

  function hrefFor(btn) {
    var explicit = btn.getAttribute('data-href');
    if (explicit) return explicit;
    for (var slot in ROUTES) {
      if (btn.classList.contains('__slot-' + slot)) return ROUTES[slot];
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.tabbar-icon') : null;
    if (!btn) return;

    if (btn.classList.contains('__state-on')) {
      if (btn.classList.contains('__slot-menu')) {
        sessionStorage.setItem('nav-tab', '1');
        location.href = ROUTES.menu;
      }
      return;
    }

    var href = hrefFor(btn);
    if (href) {
      sessionStorage.setItem('nav-tab', '1');
      location.href = href;
    }
  });

  /* Home-indicator swipe-up: жест по .tabbar__handle → q3-view.html */
  var handle = document.querySelector('.tabbar__handle');
  if (handle) {
    var sy = 0, dy = 0, dragging = false;

    handle.addEventListener('pointerdown', function (e) {
      dragging = true;
      sy = e.clientY;
      dy = 0;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });

    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = e.clientY - sy;
    });

    function endGesture() {
      if (!dragging) return;
      dragging = false;
      if (dy < -40) location.href = 'q3-view.html';
    }
    handle.addEventListener('pointerup', endGesture);
    handle.addEventListener('pointercancel', endGesture);
  }
})();
