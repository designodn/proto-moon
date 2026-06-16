/**
 * OK Design System (proto) — VvzCard JS
 *
 * Helper-фабрика для DS-карточки «Возможно, вы знакомы» (см. vvz-card.css).
 * Используется в любом проекте, где есть ВВЗ-сториз или ряд ВВЗ-предложений.
 * Рендерит аватарный вариант .__stories (круглый аватар + avatars-view).
 * Остальные варианты компонента — .__message / .__default / .__help —
 * собираются разметкой на местах (см. vvz-card.css), общий тут — стили и
 * dismiss-поведение.
 *
 *   var html = VvzCard.render({
 *     name:    'Карина Затонская',
 *     sub:     '28 лет, Рига',           // используется, если mutuals нет
 *     img:     'https://…/avatar.jpg',
 *     mutuals: 18,                       // опц.: количество общих друзей
 *     m:       [44, 12, 5]               // опц.: id 3 аватарок для стека
 *   });
 *
 * Dismiss-поведение: при клике на ✕ внутри карточки на корне ставится класс
 * .__state-hidden, контент сменяется на «Рекомендация скрыта». Тап на кнопку
 * «Отменить» возвращает карточку. Слушатели делегированы на document.
 */
(function () {
  // Заглушка-аватарка того же размера, что и реальная (36×36 + border 2)
  // — используется в стеке mutuals когда данных нет, чтобы плейсхолдер
  // занимал реальное место (через visibility:hidden на родителе).
  var PLACEHOLDER_AVATAR = '<div class="avatar __size-36 __type-placeholder"></div>';

  function avatarHtml(id) {
    return '<div class="avatar __size-36 __type-image">' +
             '<img src="https://i.pravatar.cc/72?img=' + id + '" alt="">' +
           '</div>';
  }

  function render(p) {
    if (!p) return '';
    var hasMutuals = p.mutuals && p.m && p.m.length;
    // Если данных нет — кладём 3 placeholder-аватарки. Так высота блока
    // равна реальному стеку, независимо от размера avatar / DPR / шрифта.
    var mutAvas = hasMutuals
      ? p.m.map(avatarHtml).join('')
      : PLACEHOLDER_AVATAR + PLACEHOLDER_AVATAR + PLACEHOLDER_AVATAR;
    // Без общих друзей сабтайтл фиксированный «Подобрали для вас» (по Figma
     // 2260:68219). С общими — «N общих друзей».
    var subtitle = hasMutuals ? (p.mutuals + ' общих друзей') : 'Подобрали для вас';
    return [
      '<div class="vvz-card __stories' + (hasMutuals ? ' __has-mutuals' : '') + '" data-vvz-card>',
        '<span class="vvz-card__close button-inline-wrapper __size-16 __view-secondary">',
          '<button class="button-inline __size-16" aria-label="Скрыть" data-vvz-dismiss>',
            '<span class="button-inline__content">',
              '<span class="button-inline__icon icon __size-16 __slot-close"></span>',
            '</span>',
          '</button>',
        '</span>',
        '<div class="vvz-card__media"><img src="' + (p.img || '') + '" alt=""></div>',
        '<div class="vvz-card__content">',
          '<div class="vvz-card__title ds-title-s">' + (p.name || '') + '</div>',
          '<div class="vvz-card__subtitle ds-body-m">' + subtitle + '</div>',
          '<div class="vvz-card__mutuals">',
            '<div class="avatars-view __size-36">',
              '<div class="avatars-view__stack">' + mutAvas + '</div>',
            '</div>',
          '</div>',
          '<div class="vvz-card__btn button-wrapper __size-36 __style-primary">',
            '<button class="button-container __style-primary" type="button">',
              '<span class="button-content">Дружить</span>',
            '</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  // Делегированные listener'ы — один раз на весь документ. Работают с любыми
  // карточками .vvz-card (включая вставленные через innerHTML).
  //
  // dismiss (✕ → V1): запоминаем оригинальные тексты title и кнопки в
  // dataset.originalText, ставим .__state-hidden, подменяем тексты на
  // «Рекомендация скрыта» и «Отменить».
  document.addEventListener('click', function (e) {
    var dismiss = e.target.closest && e.target.closest('[data-vvz-dismiss]');
    if (!dismiss) return;
    e.stopPropagation();
    var card = dismiss.closest('[data-vvz-card]');
    if (!card || card.classList.contains('__state-hidden')) return;

    var title = card.querySelector('.vvz-card__title');
    var btnContent = card.querySelector('.vvz-card__btn .button-content');
    if (title) {
      title.dataset.originalText = title.textContent;
      title.textContent = 'Рекомендация скрыта';
    }
    if (btnContent) {
      btnContent.dataset.originalText = btnContent.textContent;
      btnContent.textContent = 'Отменить';
    }
    card.classList.add('__state-hidden');
  });

  // «Отменить» в state-hidden — клик по .vvz-card__btn внутри карточки с
  // __state-hidden: снимаем класс и возвращаем оригинальные тексты.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.vvz-card.__state-hidden .vvz-card__btn');
    if (!btn) return;
    e.stopPropagation();
    var card = btn.closest('[data-vvz-card]');
    if (!card) return;
    var title = card.querySelector('.vvz-card__title');
    var btnContent = card.querySelector('.vvz-card__btn .button-content');
    if (title && title.dataset.originalText) title.textContent = title.dataset.originalText;
    if (btnContent && btnContent.dataset.originalText) btnContent.textContent = btnContent.dataset.originalText;
    card.classList.remove('__state-hidden');
  });

  window.VvzCard = { render: render };
})();
