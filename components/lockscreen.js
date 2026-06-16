/* Lockscreen — свайп-вверх и тап для разблокировки.

   DOM: <div class="lockscreen" id="lockscreen">…</div> внутри
   контейнера-родителя (по умолчанию #device, переопределяется
   через data-lockscreen-parent у самого .lockscreen).

   Поведение:
   - Pointer-drag вверх двигает экран за пальцем (translateY/opacity).
   - Релиз за порогом (-70 px) или плоский тап (<8 px движения) →
     dispatch 'lockscreen:unlock' на document; хост-страница САМА
     решает, что с этим делать (поставить .unlocked на родителя,
     pushState, выставить sessionStorage-флаги и т.п.).
   - Если родитель уже имеет класс `.unlocked` — pointer-события
     игнорируются.

   Компонент не управляет визибилити сам — стили перехода живут в
   components/lockscreen.css и применяются по классу .unlocked на
   родителе.
*/
(function () {
  function wireOne(lock) {
    var parentSel = lock.getAttribute('data-lockscreen-parent') || '#device';
    var parent    = lock.closest(parentSel) || document.querySelector(parentSel) || document.body;

    var sy = 0, dy = 0, dragging = false;

    lock.addEventListener('pointerdown', function (e) {
      if (parent.classList.contains('unlocked')) return;
      dragging = true; sy = e.clientY; dy = 0;
      lock.style.transition = 'none';
      try { lock.setPointerCapture(e.pointerId); } catch (err) {}
    });

    lock.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.min(0, e.clientY - sy);              // только вверх
      lock.style.transform = 'translateY(' + dy + 'px)';
      lock.style.opacity   = String(Math.max(0, 1 + dy / 420));
    });

    function end() {
      if (!dragging) return;
      dragging = false;
      lock.style.transition = '';                    // вернуть CSS-переход
      lock.style.transform  = '';
      lock.style.opacity    = '';
      if (dy < -70 || Math.abs(dy) < 8) {
        // Свайп за порог ИЛИ короткий тап → unlock
        document.dispatchEvent(new CustomEvent('lockscreen:unlock', {
          detail: { lockscreen: lock, parent: parent }
        }));
      }
      // иначе — пружинит обратно (transform/opacity сброшены)
    }
    lock.addEventListener('pointerup', end);
    lock.addEventListener('pointercancel', end);
  }

  function wire() {
    document.querySelectorAll('.lockscreen').forEach(function (el) {
      if (el.__lockWired) return;
      el.__lockWired = true;
      wireOne(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
