/**
 * New Vision — виджет «Бонсай».
 *
 * Рендерит подпись «N поливов · M уровень» и иллюстрацию-стадию по уровню,
 * а по кнопке «Полить» проигрывает анимацию роста (Figma 2719:199306):
 *   Полить → Поливаем… → +уровень + новая стадия + grow-пульс →
 *   кулдаун «Через 23ч 59м» + тост «Вы помогли бонсай расцвести».
 *
 * Состояние живёт в data-bonsai-level / data-bonsai-poured на `.nv-bonsai`.
 * Профиль сидит сверху: window.NVBonsai.setState(level, poured) — переустановка
 * под текущий вид (self/friend/stranger). Иллюстрации — эмодзи-плейсхолдеры
 * по стадиям (заменим на ассеты из assets/new-vision/bonsai/).
 */
(function () {
  var root = document.querySelector('.nv-bonsai');
  if (!root) return;

  var subEl   = root.querySelector('[data-pr-bonsai-sub]');
  var artEl   = root.querySelector('[data-pr-bonsai-art]');
  var labelEl = root.querySelector('.nv-bonsai__water-label');
  var iconEl  = root.querySelector('.nv-bonsai__water-icon');
  var btn     = root.querySelector('[data-bonsai-water]');

  // стадии роста по уровню (плейсхолдеры)
  var STAGES = { 1: '🌱', 2: '🌿', 3: '🌳', 4: '🌷', 5: '💐', 6: '🌸' };
  function artFor(level) { return STAGES[Math.min(6, Math.max(1, level))] || '🌱'; }

  // склонение «полив / полива / поливов»
  function plural(n) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return 'поливов';
    if (b > 1 && b < 5) return 'полива';
    if (b === 1) return 'полив';
    return 'поливов';
  }

  function lvl()  { return +root.getAttribute('data-bonsai-level')  || 1; }
  function pour() { return +root.getAttribute('data-bonsai-poured') || 0; }

  function render() {
    var p = pour();
    subEl.textContent = p + ' ' + plural(p) + ' · ' + lvl() + ' уровень';
    artEl.textContent = artFor(lvl());
  }

  function setState(level, poured) {
    root.setAttribute('data-bonsai-level', level);
    root.setAttribute('data-bonsai-poured', poured);
    root.classList.remove('__watering', '__cooldown');
    if (iconEl) iconEl.style.display = '';
    labelEl.textContent = 'Полить';
    render();
  }

  function showToast() {
    var t = document.getElementById('nvToast');
    if (!t) return;
    t.classList.add('__show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.remove('__show'); }, 2600);
  }

  var busy = false;
  function water() {
    if (busy || root.classList.contains('__cooldown')) return;
    busy = true;

    // 1) «Поливаем…»
    root.classList.add('__watering');
    if (iconEl) iconEl.style.display = 'none';
    labelEl.textContent = 'Поливаем…';

    setTimeout(function () {
      // 2) рост: +уровень, +полив, новая стадия + пульс
      root.setAttribute('data-bonsai-level', lvl() + 1);
      root.setAttribute('data-bonsai-poured', pour() + 1);
      render();
      artEl.classList.add('__grow');
      setTimeout(function () { artEl.classList.remove('__grow'); }, 740);

      // 3) кулдаун + тост
      root.classList.remove('__watering');
      root.classList.add('__cooldown');
      labelEl.textContent = 'Через 23ч 59м';
      showToast();
      busy = false;
    }, 1100);
  }

  if (btn) btn.addEventListener('click', function (e) {
    e.stopPropagation();   // не открывать шторку «Живой подарок»
    water();
  });

  window.NVBonsai = { setState: setState, render: render };
  render();
})();
