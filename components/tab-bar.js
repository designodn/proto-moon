/**
 * OK Design System — TabBar navigation
 *
 * Привязывает переходы к иконкам таббара (.tabbar-icon).
 * Приоритет: явный data-href на кнопке → дефолтная карта по слоту.
 * Подключение: <script src="components/tab-bar.js"></script> на странице с .tabbar.
 */
(function () {
  var EVENTS_MODE_KEY = 'tabbar-events-lenta';
  var FEED_ROUTE_KEY = 'tabbar-feed-route';
  var path = location.pathname;

  // Сохраняем, из какого прототипа открыт общий экран (например, Сообщения).
  // Тогда кнопка «Лента» возвращает в тот же прототип, а состав таббара
  // остаётся таким же, как на исходной странице.
  if (/\/events-lenta\//.test(path)) {
    sessionStorage.setItem(EVENTS_MODE_KEY, '1');
    sessionStorage.setItem(FEED_ROUTE_KEY, 'events-lenta/lenta.html');
  } else if (/\/lenta-q3\.html$/.test(path)) {
    sessionStorage.removeItem(EVENTS_MODE_KEY);
    sessionStorage.setItem(FEED_ROUTE_KEY, 'lenta-q3.html');
  }

  var eventsMode = sessionStorage.getItem(EVENTS_MODE_KEY) === '1';
  if (eventsMode) {
    document.querySelectorAll('.tabbar-icon.__slot-book').forEach(function (button) {
      var cell = button.closest('.tabbar__cell');
      (cell || button).remove();
    });
  }

  var ROUTES = {
    feed: sessionStorage.getItem(FEED_ROUTE_KEY) || 'lenta-q3.html',
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
