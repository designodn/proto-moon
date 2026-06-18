/**
 * OK Design System — shared user data
 *
 * Единый источник данных о текущем пользователе для прототипа.
 * Элементы с data-user-name / data-pr-name получают имя,
 * data-user-avatar / data-pr-avatar — src аватара (data-pr-* — в NV-профиле).
 */
(function () {
  var USER = {
    name:      'Эмиль Дружинин',
    avatarSrc: 'https://i.pravatar.cc/144?img=68',
    subtitle:  ''
  };

  function ageWord(n) {
    var a = Math.abs(n) % 100, b = n % 10;
    if (a > 10 && a < 20) return 'лет';
    if (b === 1) return 'год';
    if (b >= 2 && b <= 4) return 'года';
    return 'лет';
  }

  // Если подключён реестр людей (data/people.js) — берём профиль из строки my_profile.
  var me = (window.DS_PEOPLE_DATA || []).filter(function (p) { return p.id === 'my_profile'; })[0];
  if (me) {
    USER.name = me.name;
    if (me.photo) USER.avatarSrc = me.photo;
    // подпись под ФИ — из таблицы (возраст · город)
    var bits = [];
    if (me.age)  bits.push(me.age + ' ' + ageWord(me.age));
    if (me.city) bits.push(me.city);
    USER.subtitle = bits.join(' · ');
  }

  function apply() {
    document.querySelectorAll('[data-user-name], [data-pr-name]').forEach(function (el) {
      el.textContent = USER.name;
    });
    document.querySelectorAll('[data-user-avatar], [data-pr-avatar]').forEach(function (el) {
      el.src = USER.avatarSrc;
      el.alt = USER.name;
    });
    if (USER.subtitle) {
      document.querySelectorAll('[data-pr-sub]').forEach(function (el) {
        el.textContent = USER.subtitle;
      });
    }
  }

  // Применяем сразу: скрипт parser-blocking и стоит ПОСЛЕ разметки профиля,
  // поэтому элементы уже в DOM, а первой отрисовки ещё не было — это убирает
  // «мигание» статичного плейсхолдера (чужой аватар/имя) до подстановки данных.
  apply();
  // Подстраховка для элементов, добавленных позже (если скрипт подключён в head).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  }

  window.DS_USER = USER;
})();
