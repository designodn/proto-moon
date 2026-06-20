/**
 * OK Design System (proto) — ClipVvz JS
 *
 * Фабрика полноэкранного ВВЗ-слайда для ленты клипов (см. clip-vvz.css).
 * Рендерит секцию .klip.__vvz с заголовком, сеткой карточек VvzCard и CTA.
 *
 *   var html = ClipVvz.render({
 *     title:  'Возможно, вы знакомы',          // опц.
 *     people: [{ name, img, sub?, mutuals?, m? }, …],  // карточки
 *     cta:    'Показать всех'                   // опц., лейбл кнопки
 *   });
 *
 * Карточки собираются через window.VvzCard.render — модуль должен быть
 * подключён. Если VvzCard недоступен, сетка останется пустой.
 */
(function () {
  function render(opts) {
    opts = opts || {};
    var title = opts.title || 'Возможно, вы знакомы';
    var people = opts.people || [];
    var cta = opts.cta || 'Показать всех';
    var renderCard = (window.VvzCard && window.VvzCard.render) || function () { return ''; };
    var cards = people.map(renderCard).join('');

    // Контейнер заголовок+сетка переиспользует классы ВВЗ-сториз
    // (.moment__body-inner / .moment__body-title / .moment__body-grid) —
    // те же расположение и стили (сетка ≤220, центрирование, равные ряды).
    return '' +
      '<section class="klip __vvz" data-klip data-vvz>' +
        '<div class="klip__vvz-inner">' +
          '<div class="moment__body-inner">' +
            '<h2 class="moment__body-title ds-title-xl">' + title + '</h2>' +
            '<div class="moment__body-grid" data-vvz-grid>' + cards + '</div>' +
          '</div>' +
          '<div class="klip__vvz-cta">' +
            '<div class="button-wrapper __size-44 __style-secondary-on-color">' +
              '<button class="button-container __style-secondary-on-color" type="button">' +
                '<span class="button-content">' + cta + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="klip__rail">' +
          '<button class="klip__rail-btn" aria-label="Ещё">' +
            '<span class="klip__rail-ico" style="--ico:url(\'assets/icons/more_24.svg\')"></span>' +
          '</button>' +
        '</div>' +
      '</section>';
  }

  window.ClipVvz = { render: render };
})();
