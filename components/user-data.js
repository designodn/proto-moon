/**
 * OK Design System — shared user data
 *
 * Единый источник данных о текущем пользователе для прототипа.
 * Элементы с data-user-name получают имя, data-user-avatar — src аватара.
 */
(function () {
  var USER = {
    name:      'Эмиль Дружинин',
    avatarSrc: 'https://i.pravatar.cc/144?img=68'
  };

  // Если подключён реестр людей (data/people.js) — берём профиль из строки my_profile.
  var me = (window.DS_PEOPLE_DATA || []).filter(function (p) { return p.id === 'my_profile'; })[0];
  if (me) {
    USER.name = me.name;
    if (me.photo) USER.avatarSrc = me.photo;
  }

  function apply() {
    document.querySelectorAll('[data-user-name]').forEach(function (el) {
      el.textContent = USER.name;
    });
    document.querySelectorAll('[data-user-avatar]').forEach(function (el) {
      el.src = USER.avatarSrc;
      el.alt = USER.name;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.DS_USER = USER;
})();
