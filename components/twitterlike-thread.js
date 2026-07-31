/** Включает «Посмотреть все ответы» только для веток длиннее двух комментариев. */
(function () {
  function init(thread) {
    var count = thread.querySelectorAll('.twitterlike-thread__comment').length;
    var more = thread.querySelector('.twitterlike-thread__more');
    if (more) more.hidden = count <= 2;
  }

  function boot() {
    document.querySelectorAll('.twitterlike-thread').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
