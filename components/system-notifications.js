/* System notifications — компонент для пушей. Стрим сохраняется в
   sessionStorage и продолжается между страницами.

   Раскладка стэка зависит от режима контейнера .notifs:
     .notifs.__mode-lock      — плоский список (gap 8) для лок-скрина.
     .notifs.__mode-heads-up  — iOS-style «колода»: новая поверх,
                                 прошлые уезжают вглубь.

   Схема одного пуша (передаётся в setItems / fire):
     {
       sender:   'Сергей Федоров',     // bold имя/приложение в шапке
       time:     '15 мин назад',       // правая часть шапки
       title:    'Это было легендарно!', // optional — жирный заголовок
                                       //   строкой над body (для системных
                                       //   пушей ОК)
       body:     'Добавил...',         // основной текст
       delay:    2000,                 // optional — через сколько ms
                                       //   появиться (от start() или
                                       //   от прошлого пуша). Если
                                       //   не задан — NOTIF_GAP.
       lifetime: 30000,                // optional — override времени
                                       //   жизни карточки
       image:    'url',                // optional — превью справа 36×36
       appIcon:  '<svg>...</svg>'      // optional — лого приложения-
                                       //   отправителя в шапке (по
                                       //   умолчанию — белый «ОК»)
     }

   API:
     OkNotifs.start()                  — запустить стрим из расписания
     OkNotifs.stop(clear?)             — пауза или полный сброс
     OkNotifs.reset()                  — сбросить индекс
     OkNotifs.setMode('lock'|'heads-up') — переключить раскладку
     OkNotifs.setItems(array)          — подменить список пушей
     OkNotifs.fire(itemOrIndex)        — показать пуш СЕЙЧАС (не двигая
                                          расписание). Можно передать
                                          объект или индекс из NOTIFS.
     OkNotifs.fireNext()               — продвинуть стрим на следующий
                                          элемент немедленно
     OkNotifs.clearShown()             — снять видимые карточки */
(function (global) {
  var NOTIFS = [
    // DailyPhotoPageNotification — кто-то из друзей опубликовал фото
    { sender: 'Антон Семенов',          time: '5 мин назад', body: 'Опубликовал фото после долгого перерыва',                                            delay: 2000 },
    // MemoriesRetention — воспоминание о прошлогодней заметке
    { sender: 'Одноклассники', time: 'сейчас', title: 'Это было легендарно!',   body: 'Вы поделились этой заметкой в ОК 1 год назад и получили 7 комментариев и 48 классов.', delay: 6000 },
    // GuestVisit — новые гости профиля
    { sender: 'Одноклассники', time: 'сейчас', title: 'Алена, у вас новые гости', body: 'Давайте проверим, кто это',                                                          delay: 6000 }
  ];
  var NOTIF_GAP      = 6000;   // дефолт между пушами, если у элемента не задан delay
  var NOTIF_LIFETIME = 30000;  // дефолт времени жизни карточки
  var MAX_STACK      = 3;      // сколько карточек одновременно в стэке

  var IDX_KEY  = 'ok_notif_idx';
  var NEXT_KEY = 'ok_notif_next_at';

  var timer = null;

  function box()  { return document.getElementById('notifs'); }
  function now()  { return Date.now(); }
  function isHeadsUp(b) { return b && b.classList.contains('__mode-heads-up'); }

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

  /* ── Управление режимом ───────────────────────────────────── */
  function setMode(mode) {
    var b = box(); if (!b) return;
    b.classList.remove('__mode-lock', '__mode-heads-up');
    b.classList.add(mode === 'heads-up' ? '__mode-heads-up' : '__mode-lock');
    // Перестраиваем раскладку текущих карточек под новый режим
    relayout(b);
  }

  /* ── Анимации дисмисса и snap-back ───────────────────────── */
  function dismiss(el) {
    if (!el || el.__leaving) return;
    el.__leaving = true;
    if (el.__hideTimer) { clearTimeout(el.__hideTimer); el.__hideTimer = null; }
    el.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
    el.style.transform  = 'translateY(-150%)';
    el.style.opacity    = '0';
    var done = function () {
      var b = el.parentNode;
      if (b) {
        b.removeChild(el);
        relayout(b);
      }
    };
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 360);
  }

  function snapBack(el) {
    var b = el.parentNode;
    if (b && isHeadsUp(b)) {
      // вернуть в свою позицию в колоде
      relayout(b);
    } else {
      el.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
      el.style.transform  = '';
      el.style.opacity    = '';
    }
  }

  /* ── Swipe-up to dismiss ──────────────────────────────────── */
  function attachSwipe(el) {
    var sy = 0, dy = 0, dragging = false;
    el.addEventListener('pointerdown', function (e) {
      if (el.__leaving) return;
      dragging = true; sy = e.clientY; dy = 0;
      el.style.transition = 'none';
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.min(0, e.clientY - sy);
      el.style.transform = 'translateY(' + dy + 'px)';
      el.style.opacity   = String(Math.max(0, 1 + dy / 120));
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (dy < -34) dismiss(el);
      else          snapBack(el);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ── Раскладка по режиму ──────────────────────────────────── */
  // В режиме heads-up превращаем DOM-порядок в колоду:
  // depth 0 = новейшая (спереди), depth N = старая (глубже).
  function restackHeadsUp(b) {
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

  // Lock-mode: чистим inline-стили, пусть flex-column разложит.
  function restackLock(b) {
    var kids = b.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.__leaving) continue;
      el.style.transition = 'transform 0.36s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.28s ease';
      el.style.zIndex     = '';
      el.style.opacity    = '';
      el.style.transform  = '';
    }
    // Если карточек больше MAX_STACK — гасим самые старые (первые).
    var alive = [];
    for (var k = 0; k < b.children.length; k++) {
      if (!b.children[k].__leaving) alive.push(b.children[k]);
    }
    while (alive.length > MAX_STACK) dismiss(alive.shift());
  }

  function relayout(b) {
    if (!b) return;
    if (isHeadsUp(b)) restackHeadsUp(b);
    else              restackLock(b);
  }

  /* ── Рендер карточки ──────────────────────────────────────── */
  // Дефолтный лого приложения в шапке пуша — PNG бренда ОК.
  var DEFAULT_APP_ICON = '<img src="assets/icons/appLogoDefault.png" alt="" width="18" height="18">';

  function renderCardHTML(data) {
    var appIcon = data.appIcon || DEFAULT_APP_ICON;
    return (
      '<div class="notif__main">' +
        '<div class="notif__head">' +
          '<span class="notif__appicon">' + appIcon + '</span>' +
          '<span class="notif__app"></span>' +
          '<span class="notif__sep">·</span>' +
          '<span class="notif__time"></span>' +
        '</div>' +
        (data.title ? '<div class="notif__title"></div>' : '') +
        '<div class="notif__body"></div>' +
      '</div>' +
      (data.image ? '<div class="notif__thumb"><img alt=""></div>' : '')
    );
  }

  function addNotif(data) {
    var b = box(); if (!b) return;
    var el = document.createElement('div');
    el.className = 'notif';
    el.innerHTML = renderCardHTML(data);
    el.querySelector('.notif__app').textContent  = data.sender;
    el.querySelector('.notif__time').textContent = data.time;
    if (data.title) el.querySelector('.notif__title').textContent = data.title;
    el.querySelector('.notif__body').textContent = data.body;
    if (data.image) el.querySelector('.notif__thumb img').src = data.image;
    b.appendChild(el);
    attachSwipe(el);

    // Entry-анимация зависит от режима.
    if (isHeadsUp(b)) {
      // Прилетает поверх «колоды»: чуть выше и без сдвига глубины,
      // потом restack раскидает по depth'ам.
      el.style.transition = 'none';
      el.style.transform  = 'translateY(-46px) scale(1)';
      el.style.opacity    = '0';
      void el.offsetWidth;
      restackHeadsUp(b);
    } else {
      // Lock-mode: лёгкий slide-down + fade.
      el.style.transition = 'none';
      el.style.transform  = 'translateY(-12px)';
      el.style.opacity    = '0';
      void el.offsetWidth;
      el.style.transition = 'transform 0.36s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.28s ease';
      el.style.transform  = '';
      el.style.opacity    = '';
      // Обрезка по MAX_STACK
      var alive = [];
      for (var i = 0; i < b.children.length; i++) {
        if (!b.children[i].__leaving) alive.push(b.children[i]);
      }
      while (alive.length > MAX_STACK) dismiss(alive.shift());
    }

    // Авто-дисмисс по таймеру — только в heads-up (лента). На лок-скрине
    // (__mode-lock) пуши висят постоянно, как реальные уведомления: ничего
    // не уезжает само, пока экран не разблокируют (или свайп по карточке).
    if (isHeadsUp(b)) {
      el.__hideTimer = setTimeout(function () { dismiss(el); }, data.lifetime || NOTIF_LIFETIME);
    }
  }

  /* ── Планирование стрима ─────────────────────────────────── */
  function itemDelay(item) {
    return (item && typeof item.delay === 'number') ? item.delay : NOTIF_GAP;
  }

  function scheduleAt(when) {
    if (timer) { clearTimeout(timer); timer = null; }
    var delay = Math.max(0, when - now());
    timer = setTimeout(tick, delay);
  }

  function tick() {
    timer = null;
    var idx = getIdx();
    if (idx >= NOTIFS.length) { setNextAt(0); return; }
    addNotif(NOTIFS[idx]);
    idx++;
    setIdx(idx);
    if (idx >= NOTIFS.length) { setNextAt(0); return; }
    var nextAt = now() + itemDelay(NOTIFS[idx]);
    setNextAt(nextAt);
    scheduleAt(nextAt);
  }

  function start() {
    if (!box()) return;
    if (timer) return;
    var idx = getIdx();
    if (idx >= NOTIFS.length) return;
    var nextAt = getNextAt();
    if (!nextAt) {
      nextAt = now() + itemDelay(NOTIFS[idx]);
      setNextAt(nextAt);
    }
    scheduleAt(nextAt);
  }

  /* ── Программные триггеры (вне расписания) ────────────────── */
  function fire(itemOrIndex) {
    if (typeof itemOrIndex === 'number') {
      var item = NOTIFS[itemOrIndex];
      if (item) addNotif(item);
    } else if (itemOrIndex && typeof itemOrIndex === 'object') {
      addNotif(itemOrIndex);
    }
  }

  function fireNext() {
    // Мгновенно показать следующий из расписания (без ожидания delay).
    if (timer) { clearTimeout(timer); timer = null; }
    tick();
  }

  function clearShown() {
    var b = box(); if (!b) return;
    for (var i = 0; i < b.children.length; i++) {
      var el = b.children[i];
      if (el.__hideTimer) clearTimeout(el.__hideTimer);
    }
    b.innerHTML = '';
  }

  function stop(clear) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (clear) {
      clearShown();
      reset();
    }
  }

  function reset() {
    setIdx(0);
    setNextAt(0);
  }

  function setItems(arr) {
    if (Array.isArray(arr) && arr.length) NOTIFS = arr;
  }

  global.OkNotifs = {
    start: start,
    stop: stop,
    reset: reset,
    setMode: setMode,
    setItems: setItems,
    fire: fire,
    fireNext: fireNext,
    clearShown: clearShown
  };

  /* ── Декларативный автостарт ──────────────────────────────────
     В новых прототипах достаточно положить контейнер с атрибутами:
       <div class="notifs" id="notifs"
            data-autostart data-mode="heads-up"></div>
     и подключить этот файл. Никаких дополнительных <script> не
     надо. data-mode может быть 'lock' или 'heads-up' (по умолчанию
     'heads-up'). data-autostart — флаг включения. */
  function autoInit() {
    var b = document.getElementById('notifs');
    if (!b || !b.hasAttribute('data-autostart')) return;
    var mode = b.getAttribute('data-mode') || 'heads-up';
    setMode(mode);
    start();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(window);
