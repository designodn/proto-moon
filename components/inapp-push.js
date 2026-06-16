/* In-app push (notificationToast 1.0) — пуш ВНУТРИ приложения.

   Это не системная шторка (та живёт в components/system-notifications.*),
   а DS-баннер поверх контента: «пришло новое сообщение» и т.п. Прилетает
   сверху, складывается колодой, свайпается вверх, тапается (открывает
   href), сам гаснет по таймеру. Стрим хранится в sessionStorage и
   продолжается между страницами прототипа.

   Схема одного пуша (передаётся в setItems / fire):
     {
       type:   'user' | 'ok',         // тип карточки (по умолчанию 'user')
       title:  'Мария Чай',           // верхняя строка (title-s)
       body:   'Петровна, а ты…',     // текст (body-m, 2 стр) — только 'user'
       image:  'https://…',           // аватар 56 — только 'user'
       icon:   '<svg>…' | 'url.svg',  // глиф в круге — только 'ok'
       iconBg: '#0099FF',             // optional — цвет круга для 'ok'
       href:   'messages.html',       // optional — куда вести по тапу
       delay:    2000,                // optional — через сколько ms показать
       lifetime: 6000                 // optional — override времени жизни
     }

   API:
     OkInApp.start()                 — запустить стрим из расписания
     OkInApp.stop(clear?)            — пауза или полный сброс (clear=true)
     OkInApp.reset()                 — сбросить индекс стрима
     OkInApp.setItems(array)         — подменить список пушей
     OkInApp.fire(itemOrIndex)       — показать пуш СЕЙЧАС (вне расписания)
     OkInApp.fireNext()              — продвинуть стрим немедленно
     OkInApp.clearShown()            — снять видимые карточки

   Декларативный автостарт: положи контейнер и подключи файл —
       <div class="inapp-pushes" id="inappPushes" data-autostart></div>
       <script src="components/inapp-push.js"></script> */
(function (global) {
  var ITEMS = [
    {
      type: 'user', title: 'Мария Чай',
      body: 'Петровна, а ты уже видела скидки на удобрения? Нужно срочно бежать покупать на следующий год',
      image: 'https://i.pravatar.cc/240?img=45', href: 'messages.html', delay: 2000
    },
    {
      type: 'ok', title: 'Посмотрите еще больше публикаций о политике',
      // delay < lifetime первого пуша (6000) → второй ложится колодой
      // ПОВЕРХ ещё живого первого, видно стэк
      icon: 'assets/icons/web_24.svg', delay: 4000
    }
  ];
  var GAP      = 6000;   // дефолт между пушами, если у элемента не задан delay
  var LIFETIME = 6000;   // дефолт времени жизни карточки
  var MAX_STACK = 3;     // сколько карточек одновременно в колоде

  var IDX_KEY  = 'ok_inapp_idx';
  var NEXT_KEY = 'ok_inapp_next_at';

  var timer = null;

  function box()  { return document.getElementById('inappPushes'); }
  function now()  { return Date.now(); }

  function getIdx() {
    try { return parseInt(sessionStorage.getItem(IDX_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setIdx(v) {
    try { sessionStorage.setItem(IDX_KEY, String(v)); } catch (e) {}
  }
  function getNextAt() {
    try { return parseInt(sessionStorage.getItem(NEXT_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setNextAt(v) {
    try {
      if (v) sessionStorage.setItem(NEXT_KEY, String(v));
      else   sessionStorage.removeItem(NEXT_KEY);
    } catch (e) {}
  }

  /* ── Дисмисс и snap-back ──────────────────────────────────── */
  function dismiss(el) {
    if (!el || el.__leaving) return;
    el.__leaving = true;
    if (el.__hideTimer) { clearTimeout(el.__hideTimer); el.__hideTimer = null; }
    el.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
    el.style.transform  = 'translateY(-150%)';
    el.style.opacity    = '0';
    var done = function () {
      var b = el.parentNode;
      if (b) { b.removeChild(el); restack(b); }
    };
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 360);
  }

  /* ── Раскладка колоды ──────────────────────────────────────
     depth 0 = новейшая (спереди), depth N = старее (глубже). */
  function restack(b) {
    if (!b) return;
    var kids = b.children, visible = [];
    for (var i = 0; i < kids.length; i++) {
      if (!kids[i].__leaving) visible.push(kids[i]);
    }
    var n = visible.length;
    for (var j = 0; j < n; j++) {
      var el = visible[j];
      var depth = n - 1 - j;
      if (depth >= MAX_STACK) { dismiss(el); continue; }
      el.style.transition = 'transform 0.38s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.3s ease';
      el.style.zIndex     = String(100 - depth);
      el.style.opacity    = depth === 0 ? '1' : (depth === 1 ? '0.92' : '0.8');
      el.style.transform  = 'translateY(' + (depth * 10) + 'px) scale(' + (1 - depth * 0.05) + ')';
    }
  }

  /* ── Свайп вверх + тап ────────────────────────────────────── */
  function attachGestures(el, data) {
    var sy = 0, dy = 0, dragging = false, moved = false;
    el.addEventListener('pointerdown', function (e) {
      if (el.__leaving) return;
      dragging = true; moved = false; sy = e.clientY; dy = 0;
      el.style.transition = 'none';
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.min(0, e.clientY - sy);
      if (Math.abs(dy) > 4) moved = true;
      el.style.transform = 'translateY(' + dy + 'px)';
      el.style.opacity   = String(Math.max(0, 1 + dy / 120));
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (dy < -34) dismiss(el);
      else          restack(el.parentNode);
    }
    el.addEventListener('pointerup', function (e) {
      var wasDrag = moved;
      end();
      // Чистый тап (без свайпа) → переход по href
      if (!wasDrag && !el.__leaving && data.href) {
        dismiss(el);
        location.href = data.href;
      }
    });
    el.addEventListener('pointercancel', end);
  }

  /* ── Рендер карточки ──────────────────────────────────────── */
  function renderUserHTML() {
    return (
      '<div class="avatar __size-56 __type-image"><img alt=""></div>' +
      '<div class="inapp-push__main">' +
        '<div class="inapp-push__title ds-title-s"></div>' +
        '<div class="inapp-push__body ds-body-m"></div>' +
      '</div>'
    );
  }
  function renderOkHTML(data) {
    var iconBgStyle = data.iconBg ? ' style="--inapp-push-icon-bg:' + data.iconBg + '"' : '';
    // icon может быть готовой svg-разметкой или путём до svg/png
    var inner = /<svg|<img/i.test(data.icon || '')
      ? data.icon
      : '<img alt="" src="' + (data.icon || 'assets/icons/web_24.svg') + '">';
    return (
      '<div class="inapp-push__avaicon"' + iconBgStyle + '>' + inner + '</div>' +
      '<div class="inapp-push__main">' +
        '<div class="inapp-push__title ds-title-s"></div>' +
      '</div>'
    );
  }

  function addPush(data) {
    var b = box(); if (!b) return;
    var isOk = data.type === 'ok';
    var el = document.createElement('div');
    el.className = 'inapp-push ' + (isOk ? '__type-ok' : '__type-user');
    el.innerHTML = isOk ? renderOkHTML(data) : renderUserHTML();
    el.querySelector('.inapp-push__title').textContent = data.title || '';
    if (!isOk) {
      var bodyEl = el.querySelector('.inapp-push__body');
      if (bodyEl) bodyEl.textContent = data.body || '';
      if (data.image) el.querySelector('.avatar img').src = data.image;
    }
    b.appendChild(el);
    attachGestures(el, data);

    // Прилёт сверху, затем restack раскидает по depth'ам
    el.style.transition = 'none';
    el.style.transform  = 'translateY(-46px) scale(1)';
    el.style.opacity    = '0';
    void el.offsetWidth;
    restack(b);

    el.__hideTimer = setTimeout(function () { dismiss(el); }, data.lifetime || LIFETIME);
  }

  /* ── Планирование стрима ─────────────────────────────────── */
  function itemDelay(item) {
    return (item && typeof item.delay === 'number') ? item.delay : GAP;
  }
  function scheduleAt(when) {
    if (timer) { clearTimeout(timer); timer = null; }
    timer = setTimeout(tick, Math.max(0, when - now()));
  }
  function tick() {
    timer = null;
    var idx = getIdx();
    if (idx >= ITEMS.length) { setNextAt(0); return; }
    addPush(ITEMS[idx]);
    idx++;
    setIdx(idx);
    if (idx >= ITEMS.length) { setNextAt(0); return; }
    var nextAt = now() + itemDelay(ITEMS[idx]);
    setNextAt(nextAt);
    scheduleAt(nextAt);
  }

  function start() {
    if (!box() || timer) return;
    var idx = getIdx();
    if (idx >= ITEMS.length) return;
    var nextAt = getNextAt();
    if (!nextAt) { nextAt = now() + itemDelay(ITEMS[idx]); setNextAt(nextAt); }
    scheduleAt(nextAt);
  }

  /* ── Программные триггеры ─────────────────────────────────── */
  function fire(itemOrIndex) {
    if (typeof itemOrIndex === 'number') {
      if (ITEMS[itemOrIndex]) addPush(ITEMS[itemOrIndex]);
    } else if (itemOrIndex && typeof itemOrIndex === 'object') {
      addPush(itemOrIndex);
    }
  }
  function fireNext() {
    if (timer) { clearTimeout(timer); timer = null; }
    tick();
  }
  function clearShown() {
    var b = box(); if (!b) return;
    for (var i = 0; i < b.children.length; i++) {
      if (b.children[i].__hideTimer) clearTimeout(b.children[i].__hideTimer);
    }
    b.innerHTML = '';
  }
  function reset() { setIdx(0); setNextAt(0); }
  function stop(clear) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (clear) { clearShown(); reset(); }
  }
  function setItems(arr) {
    if (Array.isArray(arr) && arr.length) ITEMS = arr;
  }

  global.OkInApp = {
    start: start, stop: stop, reset: reset, setItems: setItems,
    fire: fire, fireNext: fireNext, clearShown: clearShown
  };

  /* ── Автостарт ────────────────────────────────────────────── */
  function autoInit() {
    var b = document.getElementById('inappPushes');
    if (!b || !b.hasAttribute('data-autostart')) return;
    start();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(window);
