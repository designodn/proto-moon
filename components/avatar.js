/**
 * OK Design System — Avatar image fallback
 *
 * Если <img> внутри .avatar не загрузился (404/нет сети/битый src) — вместо
 * «битой» иконки браузера оставляем чистую заливку surface/base/primary:
 * прячем картинку и вешаем класс .__img-error на сам .avatar (стили — в
 * components/avatar.css).
 *
 * Слушатель в фазе capture: событие error у <img> не всплывает, поэтому
 * один документ-уровневый листенер с capture=true ловит ошибки всех аватаров,
 * включая динамически проставленный src (user-data.js и пр.).
 */
(function () {
  function handle(e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.closest) return;
    var av = img.closest('.avatar');
    if (av) av.classList.add('__img-error');
  }
  document.addEventListener('error', handle, true);
})();
