/**
 * New Vision — Bottom Sheet chrome (фабрика).
 *
 * Убирает дублирование каркаса шторки. В разметке достаточно описать только
 * уникальный контент:
 *
 *   <div class="nv-sheet" id="mySheet" data-sheet-title="Заголовок">
 *     <div class="nv-sheet__body"> …контент… </div>
 *     <div class="nv-sheet__footer"> …кнопки… </div>
 *   </div>
 *
 * На загрузке скрипт оборачивает это общим chrome: overlay (тап закрывает) +
 * dock (ручка над листом + panel). В panel — navbar (заголовок слева, крестик
 * справа) и авторские body/footer.
 * Открытие/закрытие — класс `.__open` (логика на странице; крестик/overlay
 * помечены [data-sheet-close], их ловит делегированный обработчик страницы).
 *
 * Опц. атрибут data-sheet-close-icon — путь к иконке крестика
 * (по умолчанию ../assets/icons/close_24.svg, т.е. относительно страницы в /new-vision/).
 *
 * Стили chrome — nv-gift-sheet.css (.nv-sheet*).
 */
(function () {
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  document.querySelectorAll('.nv-sheet').forEach(function (sheet) {
    if (sheet.dataset.sheetReady) return;
    sheet.dataset.sheetReady = '1';

    var title = sheet.getAttribute('data-sheet-title') || '';
    var icon  = sheet.getAttribute('data-sheet-close-icon') || '../assets/icons/close_24.svg';
    var authored = Array.prototype.slice.call(sheet.children);   // body + footer

    var overlay = el('div', 'nv-sheet__overlay');
    overlay.setAttribute('data-sheet-close', '');

    // Док: ручка (над листом) + панель — едут вместе.
    var dock = el('div', 'nv-sheet__dock');
    dock.appendChild(el('div', 'nv-sheet__handle'));

    var panel = el('div', 'nv-sheet__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (title) panel.setAttribute('aria-label', title);

    // navbar: DS-компонент nav-bar — заголовок слева (leading), крестик справа (trailing)
    var nav = el('header', 'nav-bar nv-sheet__navbar');
    nav.innerHTML =
      '<div class="nav-bar__leading"><h2 class="ds-title-l nv-sheet__title">' + title + '</h2></div>' +
      '<div class="nav-bar__trailing">' +
        '<span class="button-inline-wrapper __size-24 __view-secondary">' +
          '<button class="button-inline __size-24" data-sheet-close aria-label="Закрыть">' +
            '<span class="button-inline__content">' +
              '<span class="button-inline__icon icon __size-24 __src" style="--icon-src:url(\'' + icon + '\')"></span>' +
            '</span>' +
          '</button>' +
        '</span>' +
      '</div>';
    panel.appendChild(nav);

    authored.forEach(function (c) { panel.appendChild(c); });

    dock.appendChild(panel);
    sheet.appendChild(overlay);
    sheet.appendChild(dock);
  });
})();
