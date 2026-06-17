/* Механика «Давно не общались» — чередуется с ВВЗ при каждом заходе.

   При каждом заходе на страницу верхний блок меняется строго по кругу
   A → B → A → B …:

     A — ВВЗ «Возможно, вы знакомы» (#vvzBlock);
     B — блок-карусель «Давно не общались» (#dnoBlock, карточки vvz-card
         с кнопкой «Написать») ВМЕСТЕ с диалогами этих контактов, поднятыми
         наверх списка и помеченными тегом-чипом «Вы давно не общались»
         ([data-dno-item]).

   Состояние задаётся атрибутом [data-dno="a"|"b"] на .phone-frame; CSS
   показывает/прячет соответствующие узлы (см. messages.html).

   Счётчик заходов хранится в sessionStorage, поэтому чередование живёт в
   рамках сессии вкладки и предсказуемо для демо. В разметке по умолчанию
   стоит data-dno="a" — то есть без JS / в первый заход показывается A.
*/
(function () {
  var KEY   = 'messagesDnoVisits';
  var frame = document.querySelector('.phone-frame[data-dno]');
  if (!frame) return;

  var visits = 0;
  try { visits = parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch (e) {}

  // Чётный заход → A (ВВЗ), нечётный → B (давно не общались). Строгое
  // чередование A, B, A, B …
  frame.setAttribute('data-dno', visits % 2 === 0 ? 'a' : 'b');

  try { sessionStorage.setItem(KEY, String(visits + 1)); } catch (e) {}
})();
