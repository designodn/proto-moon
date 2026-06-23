/**
 * OK Design System — InviteList (логика)
 *
 * Рендерит список друзей для приглашения в фотомарафон и обрабатывает кнопки.
 * Берёт людей из window.DS_PEOPLE_DATA (data/people.js — подключить ДО этого
 * скрипта). Первая ячейка — «Поделиться» ссылкой; далее друзья: кнопка
 * «Пригласить» → таймер «Приглашаем» (radial-анимация .__state-timered) →
 * «Перейти» → открывает диалог чата (data-chat-url).
 *
 * Разметка-точка монтирования:
 *   <div class="mp-sheet__list" data-invite-list
 *        data-chat-url="../marathon-chat.html"   // URL диалога (по умолч. marathon-chat.html)
 *        data-photo-base="../"                    // префикс к photo для <img> со страниц в подпапке
 *        data-theme="#РадостьДетства"></div>      // опц. тема, уходит в чат ?theme=
 *
 * data-photo-base: people.js хранит photo как корне-относительный путь
 * (assets/people/1.jpg). Для страниц в подпапке (koleso/) к <img src> нужен
 * префикс «../». Диалог (data-chat-url) живёт в той же папке, что и список,
 * поэтому в ?photo= уходит ТОТ ЖЕ префиксированный путь. Для страниц в корне
 * photo-base пустой — без изменений.
 */
(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var TIMER_SEC = 3;

  function shareCellHTML() {
    return '<div class="user-cell" data-invite-share>' +
      '<div class="avatar __size-56 __type-icon"><span class="icon __size-24 __slot-reshare"></span></div>' +
      '<div class="user-cell__body">' +
        '<div class="ds-title-s user-cell__title">Друга нет в ОК?</div>' +
        '<div class="ds-caption-m user-cell__time">Отправьте ссылку</div>' +
      '</div>' +
      '<div class="user-cell__actions">' +
        '<div class="button-wrapper __size-28"><button class="button-container __style-secondary" data-invite-share-btn><span class="button-content">Поделиться</span></button></div>' +
      '</div>' +
    '</div>';
  }
  function inviteBtnHTML() { return '<div class="button-wrapper __size-28 rf-invite"><button class="button-container __style-secondary"><span class="button-content">Пригласить</span></button></div>'; }
  function goBtnHTML()     { return '<div class="button-wrapper __size-28 rf-go"><button class="button-container __style-secondary"><span class="button-content">Перейти</span></button></div>'; }

  // Друзья: люди id 1..10 + vvz-1..3 (как в шторке фотомарафона lenta-q3).
  function pickFriends() {
    var ALL = window.DS_PEOPLE_DATA || [];
    var nums = ALL.filter(function (p) { return p.id >= 1 && p.id <= 10; })
                  .sort(function (a, b) { return a.id - b.id; });
    var extra = ['vvz-1', 'vvz-2', 'vvz-3']
      .map(function (id) { return ALL.filter(function (p) { return p.id === id; })[0]; })
      .filter(Boolean);
    return nums.concat(extra).map(function (p) { return { n: p.name, photo: p.photo }; });
  }

  function init(listEl) {
    if (listEl.dataset.inviteListInit) return;
    listEl.dataset.inviteListInit = '1';

    var chatUrl   = listEl.dataset.chatUrl || 'marathon-chat.html';
    var theme     = listEl.dataset.theme || '';
    var photoBase = listEl.dataset.photoBase || '';

    listEl.insertAdjacentHTML('beforeend', shareCellHTML());
    pickFriends().forEach(function (f) {
      var cell = document.createElement('div');
      cell.className = 'user-cell';
      cell.dataset.name = f.n;
      cell.dataset.photo = f.photo || '';   // исходный (корне-относит.) путь — для ?photo= в чат
      cell.innerHTML =
        '<div class="avatar __size-56 __type-image"><img src="' + esc(photoBase + (f.photo || '')) + '" alt=""></div>' +
        '<div class="user-cell__body"><div class="ds-title-s user-cell__title">' + esc(f.n) + '</div></div>' +
        '<div class="user-cell__actions">' + inviteBtnHTML() + '</div>';
      listEl.appendChild(cell);
    });

    // «Пригласить» → таймер «Приглашаем» (radial fill) → «Перейти».
    function startTimer(wrapper) {
      var btn = wrapper.querySelector('.button-container');
      var label = btn.querySelector('.button-content');
      wrapper.className = 'button-wrapper __size-28 rf-timer';
      btn.classList.add('__state-timered');
      btn.style.setProperty('--timered-animation-duration', TIMER_SEC + 's');
      label.textContent = 'Приглашаем';
      setTimeout(function () {
        wrapper.className = 'button-wrapper __size-28 rf-go';
        btn.classList.remove('__state-timered');
        label.textContent = 'Перейти';
      }, TIMER_SEC * 1000);
    }
    function goToChat(cell) {
      location.href = chatUrl +
        '?name=' + encodeURIComponent(cell.dataset.name || '') +
        '&photo=' + encodeURIComponent(photoBase + (cell.dataset.photo || '')) +
        (theme ? '&theme=' + encodeURIComponent(theme) : '');
    }

    listEl.addEventListener('click', function (e) {
      var invite = e.target.closest('.rf-invite');
      if (invite) { startTimer(invite); return; }
      var go = e.target.closest('.rf-go');
      if (go) { goToChat(go.closest('.user-cell')); return; }
      var share = e.target.closest('[data-invite-share-btn]');
      if (share) {
        var data = { title: 'Фотомарафон', text: 'Участвую в фотомарафоне — присоединяйся и голосуй за моё фото!', url: location.href };
        if (navigator.share) navigator.share(data).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(data.url).catch(function () {});
      }
    });
  }

  function boot() {
    document.querySelectorAll('[data-invite-list]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
