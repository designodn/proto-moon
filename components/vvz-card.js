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

  function avatarHtml(src) {
    // src — либо готовый URL фото (реальные люди из people.json), либо число
    // (id для pravatar-заглушки, обратная совместимость).
    var url = (typeof src === 'string' && /^(https?:|\/|data:|assets)/.test(src))
      ? src
      : 'https://i.pravatar.cc/72?img=' + src;
    return '<div class="avatar __size-36 __type-image">' +
             '<img src="' + url + '" alt="">' +
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

    // Фиксируем текущую высоту карточки, чтобы при переходе в «Рекомендация
    // скрыта» (контент короче) высота не схлопывалась — карточка остаётся
    // того же размера, что и до скрытия.
    card.style.minHeight = card.offsetHeight + 'px';

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

  // ============================================================
  // FRIEND-REQUEST — кнопка «Дружить» (вариант СТОРИЗ, .__stories).
  //   normal    → тап «Дружить»: общие друзья скрываются, сабтайтл →
  //               «Заявка в друзья отправлена», кнопка → secondary «Отменить».
  //   requested → тап по «Отменить»: открывается шторка подтверждения
  //               отмены, сториз ставятся на паузу.
  // ============================================================
  function enterRequested(card) {
    // Фиксируем высоту до изменений, чтобы карточка не «скакала» при скрытии
    // общих друзей / переносе текста «Заявка отправлена».
    card.style.minHeight = card.offsetHeight + 'px';
    var sub = card.querySelector('.vvz-card__subtitle');
    var btnWrap = card.querySelector('.vvz-card__btn');
    if (sub) {
      if (sub.dataset.originalText == null) sub.dataset.originalText = sub.textContent;
      sub.textContent = 'Заявка в друзья отправлена';
    }
    if (btnWrap) {
      if (btnWrap.dataset.originalHtml == null) btnWrap.dataset.originalHtml = btnWrap.innerHTML;
      // Кнопка становится secondary-on-color «Отменить» (на тёмном фоне сториз).
      btnWrap.innerHTML =
        '<button class="button-container __style-secondary-on-color" type="button">' +
          '<span class="button-content">Отменить</span>' +
        '</button>';
    }
    card.classList.add('__state-requested');
  }

  function revertRequested(card) {
    var sub = card.querySelector('.vvz-card__subtitle');
    var btnWrap = card.querySelector('.vvz-card__btn');
    if (sub && sub.dataset.originalText != null) {
      sub.textContent = sub.dataset.originalText;
      delete sub.dataset.originalText;
    }
    if (btnWrap && btnWrap.dataset.originalHtml != null) {
      btnWrap.innerHTML = btnWrap.dataset.originalHtml;
      delete btnWrap.dataset.originalHtml;
    }
    card.classList.remove('__state-requested');
    card.style.minHeight = '';
  }

  // Пауза/возобновление сториз, в которых лежит карточка (через .__state-paused
  // на корне .moment — то же, что использует long-press в moment.js).
  function pauseMoment(card) {
    var m = card.closest && card.closest('.moment');
    if (m) m.classList.add('__state-paused');
    return m;
  }
  function resumeMoment(m) {
    if (m) m.classList.remove('__state-paused');
  }

  // Шторка подтверждения отмены заявки. Confirm → откат карточки в normal.
  // Закрытие (✕ / «Закрыть» / тап по фону) — состояние requested остаётся.
  function openCancelSheet(card) {
    if (document.querySelector('.vvz-sheet')) return; // уже открыта
    var moment = pauseMoment(card);

    var sheet = document.createElement('div');
    sheet.className = 'vvz-sheet';
    sheet.innerHTML = [
      '<div class="vvz-sheet__overlay" data-sheet-close></div>',
      '<div class="vvz-sheet__panel" role="dialog" aria-modal="true">',
        '<div class="vvz-sheet__handle"></div>',
        '<div class="vvz-sheet__navbar">',
          '<button class="vvz-sheet__close button-inline" aria-label="Закрыть" data-sheet-close>',
            '<span class="icon __size-24 __slot-close"></span>',
          '</button>',
        '</div>',
        '<h2 class="vvz-sheet__title ds-title-xl">Вы действительно хотите отменить заявку в друзья?</h2>',
        '<div class="vvz-sheet__buttons">',
          '<div class="button-wrapper __size-56 __full-width">',
            '<button class="button-container __style-destructive" type="button" data-sheet-confirm>',
              '<span class="button-content">Отменить заявку</span>',
            '</button>',
          '</div>',
          '<div class="button-wrapper __size-56 __full-width">',
            '<button class="button-container __style-secondary" type="button" data-sheet-close>',
              '<span class="button-content">Закрыть</span>',
            '</button>',
          '</div>',
        '</div>',
        '<div class="vvz-sheet__home"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(sheet);
    // Запуск анимации появления на следующем кадре.
    requestAnimationFrame(function () { sheet.classList.add('__open'); });

    var closing = false;
    function close(confirm) {
      if (closing) return;
      closing = true;
      if (confirm) revertRequested(card);
      sheet.classList.remove('__open');
      var done = function () { sheet.remove(); resumeMoment(moment); };
      var panel = sheet.querySelector('.vvz-sheet__panel');
      var fired = false;
      panel.addEventListener('transitionend', function () {
        if (!fired) { fired = true; done(); }
      });
      // Фолбэк, если transitionend не придёт.
      setTimeout(function () { if (!fired) { fired = true; done(); } }, 400);
    }

    sheet.addEventListener('click', function (e) {
      if (e.target.closest('[data-sheet-confirm]')) { e.stopPropagation(); close(true); return; }
      if (e.target.closest('[data-sheet-close]'))   { e.stopPropagation(); close(false); }
    });
  }

  // «Отменить» в state-hidden — возврат к исходному виду карточки.
  function revertHidden(card) {
    var title = card.querySelector('.vvz-card__title');
    var btnContent = card.querySelector('.vvz-card__btn .button-content');
    if (title && title.dataset.originalText) title.textContent = title.dataset.originalText;
    if (btnContent && btnContent.dataset.originalText) btnContent.textContent = btnContent.dataset.originalText;
    card.classList.remove('__state-hidden');
    card.style.minHeight = '';
  }

  // Единый делегированный клик по кнопке карточки. Один обработчик на все
  // состояния, чтобы клики не «протекали» между ними (hidden → normal и т.п.):
  //   hidden    → «Отменить» возвращает карточку;
  //   requested → «галочка» открывает шторку отмены заявки;
  //   normal    → «Дружить» переводит карточку в requested.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.vvz-card__btn');
    if (!btn) return;
    var card = btn.closest('[data-vvz-card]');
    if (!card) return;
    e.stopPropagation();
    if (card.classList.contains('__state-hidden')) {
      revertHidden(card);
    } else if (card.classList.contains('__state-requested')) {
      openCancelSheet(card);
    } else {
      enterRequested(card);
    }
  });

  // Единый блок «заголовок + сетка карточек» для ВВЗ-слайдов (клипы и сториз
  //   переиспользуют один компонент). Карточки — через render() выше.
  //   VvzCard.section({ title?, people: [{name,img,sub?,mutuals?,m?}, …] })
  // Возвращает <h2 …>+<div сетка>; обёртку/CTA/фон даёт вызывающий контекст.
  function section(opts) {
    opts = opts || {};
    var title = opts.title || 'Возможно, вы знакомы';
    var cards = (opts.people || []).map(render).join('');
    return '<h2 class="vvz-section__title ds-title-xl">' + title + '</h2>' +
           '<div class="vvz-section__grid" data-vvz-grid>' + cards + '</div>';
  }

  window.VvzCard = { render: render, section: section };
})();
