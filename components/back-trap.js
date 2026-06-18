/* Back-trap — принудительный редирект на заданную страницу при back-навигации.

   Полезен для прототипа, где «Back из ленты» должен всегда вести на меню,
   какая бы ни была реальная история (например, лента открыта по прямой
   ссылке, без q3-view.html в стэке).

   Использование:
     <script src="components/back-trap.js" data-target="q3-view.html"></script>

   Что делает:
   - На загрузке pushState'ит sentinel-state в историю.
   - В popstate (Back) делает window.location.replace(target).
   - Перед replace dispatch'ит CustomEvent 'back-trap:before-navigate',
     чтобы хост успел записать в sessionStorage что-нибудь (например,
     флаг «at_home», чтобы целевая страница раскрылась как меню, а не
     как локскрин).

   Хук в хост-странице:
     <script>
       document.addEventListener('back-trap:before-navigate', function () {
         sessionStorage.setItem('okstart_at_home', '1');
       });
     </script>
*/
(function () {
  var script = document.currentScript;
  var target = (script && script.getAttribute('data-target')) || 'index.html';
  var STATE  = '__back-trap';

  if (!history.state || history.state.scr !== STATE) {
    try { history.pushState({ scr: STATE }, ''); } catch (e) {}
  }

  window.addEventListener('popstate', function () {
    document.dispatchEvent(new CustomEvent('back-trap:before-navigate', {
      detail: { target: target }
    }));
    window.location.replace(target);
  });
})();
