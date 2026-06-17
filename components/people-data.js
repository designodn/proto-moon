/**
 * OK Design System (proto) — People roster
 *
 * Раздаёт реальных людей (data/people.js, источник — Google-таблица «Люди»)
 * в разметку прототипа по data-атрибутам:
 *
 *   <div class="vvz-card__title ds-title-s" data-person-name="2"></div>
 *   <img data-person-avatar="2" alt="">
 *   <div class="vvz-card__blur" data-person-bg="2"></div>
 *
 * Значение атрибута — id человека из листа «Люди».
 *
 * Медиа:
 *   image → src на <img> (или background-image на [data-person-bg])
 *   video → <img> подменяется на зацикленное <video muted autoplay loop playsinline>
 *   null  → запасная заглушка (FALLBACK)
 *
 * Подключение на странице (после разметки):
 *   <script src="data/people.js"></script>
 *   <script src="components/people-data.js"></script>
 *
 * API: window.DS_PEOPLE.get(id), window.DS_PEOPLE.apply(rootEl?)
 */
(function () {
  var FALLBACK = 'https://i.pravatar.cc/240?img=12';

  var list = (window.DS_PEOPLE_DATA || []);
  var byId = {};
  list.forEach(function (p) { byId[String(p.id)] = p; });

  function get(id) { return byId[String(id)] || null; }

  function srcFor(p) {
    return (p && p.photo) ? p.photo : FALLBACK;
  }

  /** Превращает <img data-person-avatar> в <video>, если медиа — видео. */
  function toVideo(img, p) {
    var v = document.createElement('video');
    v.className = img.className;
    if (img.id) v.id = img.id;
    v.src = p.photo;
    v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('data-person-avatar', img.getAttribute('data-person-avatar'));
    img.replaceWith(v);
    return v;
  }

  function applyAvatar(el) {
    var p = get(el.getAttribute('data-person-avatar'));
    if (!p) return;
    if (p.media === 'video' && el.tagName === 'IMG') {
      toVideo(el, p);
      return;
    }
    el.src = srcFor(p);
    el.alt = p.name;
  }

  function applyName(el) {
    var p = get(el.getAttribute('data-person-name'));
    if (p) el.textContent = p.name;
  }

  function applyBg(el) {
    var p = get(el.getAttribute('data-person-bg'));
    if (p) el.style.backgroundImage = "url('" + srcFor(p) + "')";
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-person-name]').forEach(applyName);
    root.querySelectorAll('[data-person-bg]').forEach(applyBg);
    root.querySelectorAll('[data-person-avatar]').forEach(applyAvatar);
  }

  window.DS_PEOPLE = { list: list, get: get, apply: apply };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); });
  } else {
    apply();
  }
})();
