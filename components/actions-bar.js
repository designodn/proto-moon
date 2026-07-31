/**
 * OK Design System — ActionsBar (JS-часть)
 *
 * Lottie-бёрст «Класс!» по тапу на лайк ОТКЛЮЧЁН: визуальный отклик теперь
 * даёт плавный переход самой кнопки (см. components/actions-bar.css —
 * кросс-фейд иконок + золотой фон при :checked). Файл оставлен как точка
 * расширения и чтобы существующие подключения <script> не падали.
 *
 * Чтобы вернуть бёрст — см. историю git (анимация на assets/lottie/like.json).
 */
(function () {
  /* Вариант с одной иконкой: меняет src без второго скрытого элемента,
     поэтому геометрия кнопки и gap не меняются между состояниями. */
  function syncIcon(input) {
    var button = input && input.closest('.button-klass');
    var icon = button && button.querySelector('.button-klass__icon-swap');
    if (!icon) return;
    icon.src = input.checked ? icon.dataset.srcFilled : icon.dataset.srcOutline;
  }

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (input.matches('.button-klass > input[type="checkbox"]')) syncIcon(input);
  });

  document.querySelectorAll('.button-klass > input[type="checkbox"]').forEach(syncIcon);
})();
