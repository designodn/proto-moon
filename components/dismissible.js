/**
 * OK Design System (proto) — Dismissible behaviour
 *
 * Делегированный click-листенер для «закрываемых» строк карточек.
 * Разметка и анимации описаны в components/dismissible.css.
 *
 *   [data-dismiss]         → закрыть ближайший [data-dismiss-target]
 *   [data-dismiss="row"]   → закрыть весь [data-dismiss-row]
 *
 *   Когда [data-dismiss] закрывает последнюю карточку в строке,
 *   строка [data-dismiss-row] тоже схлопывается (одним фейдом).
 */
(function () {
  function row(el) { return el.closest('[data-dismiss-row]'); }

  function dismissRow(r) {
    if (!r) return;
    // фиксируем текущую высоту, затем плавно схлопываем до 0
    r.style.height = r.offsetHeight + 'px';
    r.classList.add('__leaving');
    requestAnimationFrame(function () {
      r.style.height = '0px';
      r.style.marginTop = '0px';
      r.style.marginBottom = '0px';
      r.style.paddingTop = '0px';
      r.style.paddingBottom = '0px';
    });
    setTimeout(function () { r.remove(); }, 550);
  }

  function dismissItem(item) {
    if (!item) return;
    var r = row(item);
    // последняя карточка — гасим всю строку одним фейдом
    if (r && r.querySelectorAll('[data-dismiss-target]').length <= 1) {
      dismissRow(r);
      return;
    }
    item.classList.add('__leaving');
    setTimeout(function () { item.remove(); }, 500);
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    // ВВЗ-портлет: тап по «Дружить» внутри карточки-подсказки скрывает карточку
    // (как и крестик). Только для карточек-целей dismiss (.vvz-card.__default
    // в портлете) — сториз-карточки (.__stories) живут по своей логике в
    // vvz-card.js и не являются [data-dismiss-target].
    var friendBtn = e.target.closest('[data-dismiss-target] .vvz-card__btn');
    if (friendBtn) {
      dismissItem(friendBtn.closest('[data-dismiss-target]'));
      return;
    }
    var trigger = e.target.closest('[data-dismiss]');
    if (!trigger) return;
    if (trigger.getAttribute('data-dismiss') === 'row') {
      dismissRow(row(trigger));
    } else {
      dismissItem(trigger.closest('[data-dismiss-target]'));
    }
  });
})();
