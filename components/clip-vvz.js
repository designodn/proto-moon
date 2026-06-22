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
    var ctaLabel = opts.cta || 'Показать всех';
    // Заголовок + сетку карточек собирает единый компонент VvzCard.section,
    // а CTA-кнопку — VvzCard.cta (оба — общие с сториз-ВВЗ, см. moment.js).
    var section = (window.VvzCard && window.VvzCard.section)
      ? window.VvzCard.section({ title: title, people: people })
      : '';
    var ctaHtml = (window.VvzCard && window.VvzCard.cta)
      ? window.VvzCard.cta({ label: ctaLabel })
      : '';

    return '' +
      '<section class="klip __vvz" data-klip data-vvz>' +
        '<div class="klip__vvz-inner">' +
          // section — это .vvz-section: сама центрирует «заголовок + сетку»
          // по вертикали и скроллится (как в сториз). CTA прижата снизу.
          section +
          '<div class="klip__vvz-cta">' + ctaHtml + '</div>' +
        '</div>' +
      '</section>';
  }

  window.ClipVvz = { render: render };
})();
