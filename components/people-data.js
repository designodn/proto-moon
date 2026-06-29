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

  // Имена верифицированных авторов (лист «Люди», колонка «Верификация»=да) —
  // для «запечённых» лент (Q3/Трибуна/Activity), где имя стоит в разметке
  // литералом, а не через data-person-name. Гидратированные ленты (New Vision)
  // матчим точнее — по id.
  var verifiedNames = {};
  list.forEach(function (p) { if (p && p.verified && p.name) verifiedNames[p.name] = true; });

  // База для локальных фото: каталог, из которого подключён этот скрипт
  // (на корневых страницах — "", в подпапках вроде new-vision/ — "../"),
  // чтобы пути вида "assets/people/1.webp" работали на любой глубине.
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) {
      var ss = document.getElementsByTagName('script');
      for (var i = ss.length - 1; i >= 0; i--) {
        if (/people-data\.js(\?|$)/.test(ss[i].src)) { s = ss[i]; break; }
      }
    }
    var src = s ? (s.getAttribute('src') || '') : '';
    return src.replace(/components\/people-data\.js.*$/, '');
  })();

  function resolveSrc(u) {
    if (!u) return u;
    return /^(https?:)?\/\/|^data:|^\//.test(u) ? u : BASE + u; // абсолютные оставляем как есть
  }

  function srcFor(p) {
    return (p && p.photo) ? resolveSrc(p.photo) : FALLBACK;
  }

  /** Превращает <img data-person-avatar> в <video>, если медиа — видео. */
  function toVideo(img, p) {
    var v = document.createElement('video');
    v.className = img.className;
    if (img.id) v.id = img.id;
    v.src = resolveSrc(p.photo);
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

  // ВЕРИФИКАЦИЯ — бейдж справа от имени автора (зазор 4px). Показываем, если
  // автор verified: для [data-person-name] — по id, иначе — по совпадению текста
  // имени с верифицированным из листа «Люди». Имя+бейдж кладём в инлайн-флекс
  // .ds-verified-row, чтобы бейдж не попадал под ellipsis имени (см. feed-header.css).
  var BADGE_SRC = 'assets/badges/badge_verified_16.svg';
  function isAuthorVerified(el) {
    var id = el.getAttribute('data-person-name');
    if (id) { var p = get(id); return !!(p && p.verified); }
    var t = (el.textContent || '').trim();
    return !!t && verifiedNames[t] === true;
  }
  function applyVerified(el) {
    if (!isAuthorVerified(el)) return;
    var parent = el.parentNode;
    if (!parent || (parent.classList && parent.classList.contains('ds-verified-row'))) return; // уже обёрнут
    var wrap = document.createElement('span');
    wrap.className = 'ds-verified-row';
    var badge = document.createElement('img');
    badge.className = 'ds-badge-verified';
    badge.src = resolveSrc(BADGE_SRC);
    badge.width = 16; badge.height = 16;
    badge.alt = '';
    badge.setAttribute('aria-label', 'Подтверждённый профиль');
    badge.setAttribute('role', 'img');
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(badge);
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-person-name]').forEach(applyName);
    root.querySelectorAll('[data-person-bg]').forEach(applyBg);
    root.querySelectorAll('[data-person-avatar]').forEach(applyAvatar);
    // Бейдж верификации — после имён (чтобы матч по тексту видел готовое имя).
    ['.feed-header__name', '.fc-comment__author', '.caf__name'].forEach(function (sel) {
      root.querySelectorAll(sel).forEach(applyVerified);
    });
  }

  window.DS_PEOPLE = { list: list, get: get, apply: apply };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); });
  } else {
    apply();
  }
})();
