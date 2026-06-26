/* Today widgets — поведение виджетов ленты «Сегодня» (переиспользуемо).

   Подключай на любой странице с виджетами «Сегодня» (today.html, таб «Сегодня»
   в activity-lenta). Нужны: data/people.js (для карусели друзей) — до этого
   скрипта. Разметка — components/today-widgets.partial.html; стили —
   components/today-widgets.css.

   Что делает:
   1. Карусель «Друзья на сайте» (#friendsRow) — рендер реальных людей из реестра.
   2. Виджет «Колесо призов» (#rouletteWidget) — открытие рулетки.
*/
(function () {
  function initFriends() {
    var row = document.getElementById('friendsRow');
    if (!row || row.children.length || !window.DS_PEOPLE_DATA) return;
    var IDS = [7, 2, 4, 8, 10];
    var byId = {};
    window.DS_PEOPLE_DATA.forEach(function (p) { byId[p.id] = p; });
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    IDS.forEach(function (id) {
      var p = byId[id];
      if (!p) return;
      var item = document.createElement('div');
      item.className = 'tg-friend';
      item.innerHTML =
        '<div class="tg-friend__ava"><div class="avatar __size-56 __type-image"><img alt=""></div></div>' +
        '<div class="tg-friend__name ds-title-m"></div>';
      item.querySelector('img').src = p.photo;
      // Имя — первой строкой, фамилия — второй (каждая в своём span, чтобы
      // длинная фамилия обрезалась в «…», см. .tg-friend__name span).
      var parts = String(p.name || '').trim().split(/\s+/);
      item.querySelector('.tg-friend__name').innerHTML = parts.length > 1
        ? '<span>' + esc(parts[0]) + '</span><span>' + esc(parts.slice(1).join(' ')) + '</span>'
        : '<span>' + esc(p.name) + '</span>';
      row.appendChild(item);
    });
  }

  function initRoulette() {
    var w = document.getElementById('rouletteWidget');
    if (!w || w.__rouletteWired) return;
    w.__rouletteWired = true;
    // ?nv сохраняем (screen-transition.js дальше сам его протаскивает).
    function open() { window.location.href = 'koleso/koleso-splash.html' + location.search; }
    w.addEventListener('click', open);
    w.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  function init() { initFriends(); initRoulette(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
