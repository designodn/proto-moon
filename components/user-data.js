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
