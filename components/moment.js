/**
 * OK Design System (proto) — Moment viewer behavior
 *
 * Поведение полноэкранного просмотрщика сториз.
 *  - тап левой половины  → prev (или возврат к началу текущего)
 *  - тап правой половины → next
 *  - автопродвижение по CSS-таймеру (длительность из --moment-duration)
 *  - событие 'moment:viewed' на корне после досмотра последнего сегмента
 *
 * USAGE:
 *   MomentViewer.init(rootEl, {
 *     onChange: (index) => { … },        // опц.: при смене активного сегмента
 *     onNext:   () => true | false,      // тап вправо/таймер за последним
 *                                        //   сегментом. true → компонент НЕ
 *                                        //   закрывается, страница сама
 *                                        //   подменила контент (см. setSlides).
 *     onPrev:   () => true | false,      // тап влево на первом сегменте.
 *                                        //   true → страница перешла к
 *                                        //   предыдущему автору.
 *     onClose:  () => { … },             // явное закрытие (Esc/✕) или досмотр
 *                                        //   последней сториз последнего
 *                                        //   автора. Тут лента ставит ✕ и
 *                                        //   .__ring-viewed аватарке.
 *   });
 *
 * Сколько палочек прогресса — столько и «сториз». Количество и список картинок
 * задаются снаружи: при первом init либо через `slides`, либо просто разметкой
 * .moment__progress-segment в HTML. На переходе между авторами страница
 * вызывает instance.setSlides(newSlides) — viewer пересоберёт сегменты.
 */
(function () {
  // Ленивая подгрузка lottie-web с CDN — используется именинной сториз для
  // полноэкранной конфетти-анимации (см. блок BDAY ниже). Тот же паттерн
  // используется в actions-bar.js для лайка; здесь свой promise-кэш на случай,
  // если страница ещё не загрузила lottie.
  var LOTTIE_CDN = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
  var lottieLoading = null;
  function ensureLottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lottieLoading) return lottieLoading;
    lottieLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LOTTIE_CDN;
      s.async = true;
      s.onload = function () { resolve(window.lottie); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return lottieLoading;
  }

  // Базовый префикс путей к иконкам. createViewer() кладёт пути document-
  // relative ('assets/icons/…'); страницы во вложенных каталогах (например
  // new-vision/) переписывают src уже отрендеренных иконок на '../assets/…'.
  // Динамически собираемым иконкам (панель быстрых действий) тот разовый
  // префикс не достаётся, поэтому выводим его из уже исправленной иконки в
  // шапке вьюера — так путь совпадёт с базой конкретной страницы.
  function iconBase(root) {
    var ref = root.querySelector('img[src*="assets/icons/"]');
    var src = ref ? (ref.getAttribute('src') || '') : '';
    var idx = src.indexOf('assets/icons/');
    return idx > 0 ? src.slice(0, idx) : '';
  }

  function MomentViewer(root, options) {
    this.root = root;
    this.options = options || {};
    this.slides = null;
    this.current = 0;

    this._onPrev = this._onPrev.bind(this);
    this._onNext = this._onNext.bind(this);
    this._onAnimEnd = this._onAnimEnd.bind(this);
    this._onKey = this._onKey.bind(this);

    this._prev = root.querySelector('.moment__nav-zone.__side-prev');
    this._next = root.querySelector('.moment__nav-zone.__side-next');
    if (this._prev) this._prev.addEventListener('click', this._onPrev);
    if (this._next) this._next.addEventListener('click', this._onNext);

    // Long-press (Instagram-like): удержание >250ms → пауза прогресса +
    // скрытие контролов (header/progress/statusbar). CTA остаётся видимым.
    // Тап короче порога — обычный prev/next. Отпускание после long-press —
    // возврат UI и продолжение анимации.
    this._holdTimer = null;
    this._isHolding = false;
    this._onPressStart = this._onPressStart.bind(this);
    this._onPressEnd = this._onPressEnd.bind(this);
    root.addEventListener('pointerdown', this._onPressStart);
    root.addEventListener('pointerup', this._onPressEnd);
    root.addEventListener('pointercancel', this._onPressEnd);
    root.addEventListener('pointerleave', this._onPressEnd);

    // Завершение анимации активного сегмента → автоматический next
    root.addEventListener('animationend', this._onAnimEnd);

    document.addEventListener('keydown', this._onKey);

    // Если slides переданы в опциях — сразу собираем сегменты прогресс-бара.
    // Если нет — компонент работает с уже разложенными в HTML сегментами.
    if (this.options.slides) {
      this.setSlides(this.options.slides);
    } else {
      this.segments = Array.prototype.slice.call(
        root.querySelectorAll('.moment__progress-segment')
      );
    }

    this.go(0);
  }

  MomentViewer.prototype.go = function (index) {
    if (index < 0) {
      // Выход за левую границу — спрашиваем страницу, переходить ли к
      // предыдущему автору. Если страница вернёт true — она сама вызовет
      // setSlides + go(0); мы дальше ничего не делаем.
      if (typeof this.options.onPrev === 'function' && this.options.onPrev() === true) return;
      index = 0;
    }
    if (index >= this.segments.length) {
      // Выход за правую границу — следующий автор. Если страницы нет / нечего
      // показать — закрываемся (досмотр последнего сегмента последнего автора).
      if (typeof this.options.onNext === 'function' && this.options.onNext() === true) return;
      this._finish();
      return;
    }
    this.current = index;

    // Обновляем сегменты прогресс-бара
    this.segments.forEach(function (seg, i) {
      seg.classList.remove('__state-done', '__state-active');
      // Перезапустить CSS-анимацию: убрать и навесить класс заново
      // (см. https://css-tricks.com/restart-css-animation/)
      void seg.offsetWidth; // force reflow
      if (i < index) seg.classList.add('__state-done');
      else if (i === index) seg.classList.add('__state-active');
    });

    // Опц.: подменить контент слайда, если передали массив
    if (this.slides && this.slides[index]) {
      var s = this.slides[index];
      var media = this.root.querySelector('.moment__media');
      if (media) {
        if (s.src) {
          media.src = s.src;
          media.style.display = '';
        } else {
          // Сториз без картинки (цвет/фон/ВВЗ-body) — гасим media, иначе фото
          // предыдущего слайда осталось бы лежать поверх фона (например,
          // именинное фото перекрывало бы фон-картинку ВВЗ).
          media.removeAttribute('src');
          media.style.display = 'none';
        }
      }
      // «Обычный» момент — слайд без именинного (bday) и без произвольного
      // контента (body: ВВЗ / годовщина). По макету такие моменты получают
      // скруглённую карту (как ДР) + нижнюю панель быстрых действий.
      var isRegular = !s.bday && !s.body;

      // Фон слайда. У обычного (скруглённого) момента красим КАРТУ — под ней
      // остаётся чёрный зазор .moment (как у ДР); у остальных слайдов фон на
      // всём .moment. Сбрасываем оба слоя, чтобы фон не «протекал» с прошлого.
      var bgCard = this.root.querySelector('.moment__card');
      this.root.style.background = '';
      this.root.style.backgroundColor = '';
      if (bgCard) { bgCard.style.background = ''; bgCard.style.backgroundColor = ''; }
      var bgEl = (isRegular && bgCard) ? bgCard : this.root;
      if (s.background) {
        // Произвольный CSS-background (например картинка ВВЗ или градиент).
        bgEl.style.background = s.background;
      } else if (s.color) {
        bgEl.style.backgroundColor = s.color;
      }
      // Ни фона, ни цвета (например именинное/обычное фото) — оставляем
      // сброшенным к дефолту .moment (#000 static).
      // s.duration — опциональный override длительности сегмента (CSS-переменная
      // --moment-duration). Используется, например, в bdaySlide, чтобы после
      // улёта шариков (~5.7s) оставалось ещё 2s «передышки» на тап «Поздравить».
      if (s.duration != null) {
        this.root.style.setProperty('--moment-duration', s.duration);
      }
      var title = this.root.querySelector('.moment__header-title');
      if (title && s.title != null) title.textContent = s.title;
      var sub = this.root.querySelector('.moment__header-subtitle');
      if (sub && s.subtitle != null) sub.textContent = s.subtitle;
      var avaImg = this.root.querySelector('.moment__header .avatar img');
      if (avaImg && s.avatar) avaImg.src = s.avatar;

      // BDAY — именинный шаблон: фото-фон + блюр снизу + три строки текста +
      // 3 PNG-шарика, вылетающие снизу при открытии (см. .moment__bday-balloons
      // — отдельный слой поверх контента, на весь размер карточки).
      // Слайд с `s.bday = { kicker, heading, name }` включает .__view-bday
      // и рендерит блок .moment__bday. Header остаётся видимым.
      var bdayHost = this.root.querySelector('.moment__bday');
      var balloonsHost = this.root.querySelector('.moment__bday-balloons');
      if (s.bday) {
        if (!bdayHost) {
          bdayHost = document.createElement('div');
          bdayHost.className = 'moment__bday';
          // Кладём ВНУТРЬ .moment__card, чтобы блюр+текст обрезались её
          // скруглениями (overflow:hidden), как и фото. Кнопка — снаружи карты.
          var card = this.root.querySelector('.moment__card');
          if (card) {
            card.appendChild(bdayHost);
          } else {
            this.root.appendChild(bdayHost);
          }
        }
        var bphoto = s.src || '';
        bdayHost.innerHTML =
          // Прогрессивный блюр: стек из размытых КОПИЙ фото (filter: blur с
          // возрастающим радиусом) + градиентные маски «снизу-сильнее».
          // filter+mask надёжно композитятся в гадиент (в отличие от
          // backdrop-filter, который в части браузеров давал жёсткий шов).
          // Верх — резкое фото (media под слоями), низ — плавно размыто.
          '<div class="moment__bday-blur">' +
            '<img class="moment__bday-blur-img __b-1" src="' + bphoto + '" alt="" aria-hidden="true">' +
            '<img class="moment__bday-blur-img __b-2" src="' + bphoto + '" alt="" aria-hidden="true">' +
            '<img class="moment__bday-blur-img __b-3" src="' + bphoto + '" alt="" aria-hidden="true">' +
            '<img class="moment__bday-blur-img __b-4" src="' + bphoto + '" alt="" aria-hidden="true">' +
            '<div class="moment__bday-blur-tint"></div>' +
          '</div>' +
          '<div class="moment__bday-content">' +
            '<p class="moment__bday-kicker">' + (s.bday.kicker || 'Сегодня') + '</p>' +
            // Заголовок и ФИ переносятся естественно по ширине контейнера.
            '<h2 class="moment__bday-heading">' +
              (s.bday.heading || 'День рождения') +
            '</h2>' +
            '<p class="moment__bday-name">' +
              (s.bday.name || '') +
            '</p>' +
          '</div>';

        // Confetti — лотти-конфетти позади шаров, на всю карточку. Lottie-web
        // подключается страницей (см. lenta-q3.html — он же нужен для лайка);
        // если её нет в окне — пропускаем, шары работают и без конфетти.
        var confettiHost = this.root.querySelector('.moment__bday-confetti');
        if (confettiHost) {
          // Чистим прошлый прогон (если кэшировался .lottie-instance).
          if (confettiHost._lottieAnim) {
            try { confettiHost._lottieAnim.destroy(); } catch (err) {}
          }
          confettiHost.remove();
        }
        confettiHost = document.createElement('div');
        confettiHost.className = 'moment__bday-confetti';
        bdayHost.insertAdjacentElement('afterend', confettiHost);
        // Lottie может быть ещё не загружена (страница ленится). ensureLottie
        // подгружает с CDN при первом вызове. Сохраняем target-узел в замыкании
        // и в момент resolve проверяем, что он всё ещё в DOM — иначе сториз
        // могли уже переключить, и пихать туда лотти не надо.
        (function (host) {
          ensureLottie().then(function (lottie) {
            if (!host.isConnected) return;
            host._lottieAnim = lottie.loadAnimation({
              container: host,
              renderer:  'svg',
              loop:      false,
              autoplay:  true,
              path:      'assets/lottie/confetti.json',
              // slice — заполняет весь контейнер по обеим осям, обрезая
              // по более длинной. Дефолтный meet оставлял пустоты сверху/снизу,
              // если aspect-ratio лотти-композиции не совпадал с карточкой.
              rendererSettings: { preserveAspectRatio: 'xMidYMid slice' }
            });
          }).catch(function () {/* нет интернета — конфетти просто не покажем */});
        })(confettiHost);

        // Шары — отдельный слой на всю карточку (sibling .moment__bday).
        // Пересоздаём каждый раз, чтобы CSS-анимация вылета перезапускалась
        // при повторном открытии сториз. Кладём ПОСЛЕ конфетти — шары
        // поверх (порядок в DOM решает stacking).
        if (balloonsHost) balloonsHost.remove();
        balloonsHost = document.createElement('div');
        balloonsHost.className = 'moment__bday-balloons';
        // Имена файлов с пробелами/кириллицей — URL-encoded, чтобы не
        // зависеть от поведения конкретного браузера.
        balloonsHost.innerHTML =
          // шарик_1 2 — зелёный пудель, шарик_1 — оранжевый ОК-шар,
          // шарик_1 8 — оранжевый круглый.
          '<div class="moment__bday-balloon __b-poodle">' +
            '<img src="assets/icons/%D1%88%D0%B0%D1%80%D0%B8%D0%BA_1%202.png" alt="">' +
          '</div>' +
          '<div class="moment__bday-balloon __b-ok">' +
            '<img src="assets/icons/%D1%88%D0%B0%D1%80%D0%B8%D0%BA_1.png" alt="">' +
          '</div>' +
          '<div class="moment__bday-balloon __b-round">' +
            '<img src="assets/icons/%D1%88%D0%B0%D1%80%D0%B8%D0%BA_1%208.png" alt="">' +
          '</div>';
        confettiHost.insertAdjacentElement('afterend', balloonsHost);

        this.root.classList.add('__view-bday');
      } else {
        if (bdayHost) bdayHost.remove();
        if (balloonsHost) balloonsHost.remove();
        var existingConfetti = this.root.querySelector('.moment__bday-confetti');
        if (existingConfetti) {
          if (existingConfetti._lottieAnim) {
            try { existingConfetti._lottieAnim.destroy(); } catch (err) {}
          }
          existingConfetti.remove();
        }
        this.root.classList.remove('__view-bday');
      }

      // BODY — произвольный контент поверх media (ВВЗ-сториз, например).
      // slide.body — HTML-строка или DOM-узел. Если задан, заменяем содержимое
      // .moment__body и показываем слот; иначе слот скрыт.
      // Также включаем .moment.__view-body — в этом режиме скрываются
      // аватарка и текст автора в header'е (остаётся только прогресс + ✕).
      var body = this.root.querySelector('.moment__body');
      if (body) {
        if (s.body) {
          body.style.display = '';
          if (typeof s.body === 'string') {
            body.innerHTML = s.body;
          } else {
            body.innerHTML = '';
            body.appendChild(s.body);
          }
          this.root.classList.add('__view-body');
          this._fitBody();
        } else {
          body.style.display = 'none';
          body.innerHTML = '';
          this.root.classList.remove('__view-body');
        }
      }

      // ROUNDED — обычный момент: скруглённая карта + панель быстрых действий.
      // Если CTA для слайда не задан — подставляем дефолтную панель «Написать»
      // + эмодзи (один раз, чтобы не пересоздавать массив при каждом показе).
      if (isRegular) {
        this.root.classList.add('__view-rounded');
        if (!s.cta) {
          s.cta = { label: 'Написать', emojis: DEFAULT_QUICK_EMOJIS.slice() };
        }
      } else {
        this.root.classList.remove('__view-rounded');
      }

      // CTA — панель снизу. Варианты:
      //   • slide.cta.emojis — панель быстрых действий: «Написать» + эмодзи
      //     (обычный момент). Колбэки: cta.onWrite(), cta.onEmoji(emoji).
      //   • slide.cta.label  — одиночная кнопка (ДР «Поздравить», ВВЗ и т.п.).
      // Кликовые обработчики навешиваем напрямую (один раз на сегмент).
      var cta = this.root.querySelector('.moment__cta');
      if (cta) {
        cta.classList.remove('__quick');
        if (s.cta && s.cta.emojis) {
          cta.style.display = '';
          cta.classList.add('__quick');
          var emojis = s.cta.emojis;
          var quickHtml =
            '<div class="moment__quick">' +
              '<div class="button-wrapper __size-44 __style-primary moment__quick-write">' +
                '<button class="button-container __style-primary" type="button">' +
                  '<span class="button-content">' +
                    '<img src="' + iconBase(this.root) + 'assets/icons/send_filled_24.svg" alt="" width="20" height="20">' +
                    '<span class="moment__quick-label"></span>' +
                  '</span>' +
                '</button>' +
              '</div>';
          for (var qi = 0; qi < emojis.length; qi++) {
            quickHtml += '<button class="moment__quick-emoji" type="button"></button>';
          }
          quickHtml += '</div>';
          cta.innerHTML = quickHtml;
          // Текст и эмодзи через textContent — без html-инъекции.
          cta.querySelector('.moment__quick-label').textContent = s.cta.label || 'Написать';
          var emojiBtns = cta.querySelectorAll('.moment__quick-emoji');
          for (var qj = 0; qj < emojiBtns.length; qj++) {
            emojiBtns[qj].textContent = emojis[qj];
          }
          if (typeof s.cta.onWrite === 'function') {
            cta.querySelector('.moment__quick-write button').addEventListener('click', s.cta.onWrite);
          }
          if (typeof s.cta.onEmoji === 'function') {
            for (var qk = 0; qk < emojiBtns.length; qk++) {
              (function (btn, emo, handler) {
                btn.addEventListener('click', function () { handler(emo); });
              })(emojiBtns[qk], emojis[qk], s.cta.onEmoji);
            }
          }
        } else if (s.cta && s.cta.label) {
          cta.style.display = '';
          // По умолчанию CTA-кнопка во ВВЗ-стиле «secondary-on-color»
          // (стеклянная). Для именинной сториз и любых других кейсов можно
          // передать s.cta.style = 'primary' (или другой DS-стиль).
          var ctaStyle = s.cta.style || 'secondary-on-color';
          // Кнопка — общий VvzCard.cta (та же, что во ВВЗ-слайде клипов).
          // Фолбэк-разметка на случай, если vvz-card.js не подключён.
          cta.innerHTML = (window.VvzCard && window.VvzCard.cta)
            ? window.VvzCard.cta({ label: s.cta.label, style: ctaStyle })
            : '<div class="button-wrapper __size-44 __style-' + ctaStyle + '">' +
                '<button class="button-container __style-' + ctaStyle + '" type="button">' +
                  '<span class="button-content"></span>' +
                '</button>' +
              '</div>';
          cta.querySelector('.button-content').textContent = s.cta.label;
          if (typeof s.cta.onClick === 'function') {
            cta.querySelector('button').addEventListener('click', s.cta.onClick);
          }
        } else {
          cta.style.display = 'none';
          cta.innerHTML = '';
        }
      }
    }

    if (typeof this.options.onChange === 'function') {
      this.options.onChange(index);
    }
  };

  // Если контент ВВЗ-body не влезает по высоте (маленький экран) — масштабируем
  // его (zoom), чтобы карточки уменьшились и поместились без скролла. zoom
  // меняет и layout, поэтому блок честно вписывается в доступную высоту.
  MomentViewer.prototype._fitBody = function () {
    var root = this.root;
    var run = function () {
      var body = root.querySelector('.moment__body');
      var inner = body && body.querySelector('.vvz-section');
      if (!inner) return;
      inner.style.zoom = '';
      // .vvz-section растянута на всю высоту body (flex:1), поэтому доступная
      // высота — её clientHeight, а натуральная высота контента — scrollHeight.
      var avail = inner.clientHeight;
      var natural = inner.scrollHeight;
      if (avail > 0 && natural > avail) {
        inner.style.zoom = (avail / natural).toFixed(4);
      }
    };
    requestAnimationFrame(run);
    if (!this._onResize) {
      this._onResize = run;
      window.addEventListener('resize', this._onResize);
    }
  };

  MomentViewer.prototype._onPrev = function () { this.go(this.current - 1); };
  MomentViewer.prototype._onNext = function () { this.go(this.current + 1); };

  MomentViewer.prototype._onAnimEnd = function (e) {
    if (!e.target.classList || !e.target.classList.contains('moment__progress-segment')) return;
    if (!e.target.classList.contains('__state-active')) return;
    this.go(this.current + 1);
  };

  MomentViewer.prototype._onKey = function (e) {
    if (e.key === 'ArrowLeft')  { this._onPrev(); }
    if (e.key === 'ArrowRight') { this._onNext(); }
    if (e.key === 'Escape')     { this._finish(); }
  };

  MomentViewer.prototype.pause  = function () { this.root.classList.add('__state-paused'); };
  MomentViewer.prototype.resume = function () { this.root.classList.remove('__state-paused'); };

  // Долгое нажатие: ставим .__state-pressed на корне. CSS-правила в moment.css
  // прячут контролы (header / прогресс / статус-бар) и останавливают анимацию
  // активного сегмента через .__state-paused. CTA-кнопка остаётся видимой.
  // Игнорируем нажатия по интерактивным элементам — крестик, CTA, карточки
  // ВВЗ — чтобы они работали обычно.
  MomentViewer.prototype._onPressStart = function (e) {
    if (e.target && e.target.closest && e.target.closest(
      '.moment__cta, .moment__header [aria-label], [data-vvz-dismiss], .vvz-card__btn'
    )) return;
    var self = this;
    clearTimeout(this._holdTimer);
    this._holdTimer = setTimeout(function () {
      self._isHolding = true;
      self.root.classList.add('__state-pressed');
      self.pause();
    }, 250);
  };

  MomentViewer.prototype._onPressEnd = function () {
    clearTimeout(this._holdTimer);
    if (!this._isHolding) return;
    this._isHolding = false;
    this.root.classList.remove('__state-pressed');
    this.resume();
    // Подавить следующий click — он сработает после pointerup как часть
    // тач-цепочки, и иначе nav-зона переключит сториз сразу после удержания.
    this.root.addEventListener('click', function suppress(e) {
      e.stopPropagation();
      e.preventDefault();
    }, { capture: true, once: true });
  };

  // Подменить сториз нового автора: пересобрать сегменты прогресса и слайды.
  // Страница вызывает это из onNext/onPrev перед тем как вернуть true.
  MomentViewer.prototype.setSlides = function (slides) {
    this.slides = slides || [];
    var bar = this.root.querySelector('.moment__progress');
    if (bar) {
      bar.innerHTML = '';
      for (var i = 0; i < this.slides.length; i++) {
        var seg = document.createElement('div');
        seg.className = 'moment__progress-segment';
        bar.appendChild(seg);
      }
      this.segments = Array.prototype.slice.call(bar.children);
    }
    this.current = 0;
  };

  MomentViewer.prototype._finish = function () {
    // Залить все сегменты «done», убрать активный
    this.segments.forEach(function (seg) {
      seg.classList.remove('__state-active');
      seg.classList.add('__state-done');
    });
    this.root.dispatchEvent(new CustomEvent('moment:viewed', { bubbles: true }));
    if (typeof this.options.onClose === 'function') this.options.onClose();
  };

  MomentViewer.prototype.destroy = function () {
    document.removeEventListener('keydown', this._onKey);
    this.root.removeEventListener('animationend', this._onAnimEnd);
    this.root.removeEventListener('pointerdown', this._onPressStart);
    this.root.removeEventListener('pointerup', this._onPressEnd);
    this.root.removeEventListener('pointercancel', this._onPressEnd);
    this.root.removeEventListener('pointerleave', this._onPressEnd);
    clearTimeout(this._holdTimer);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._prev) this._prev.removeEventListener('click', this._onPrev);
    if (this._next) this._next.removeEventListener('click', this._onNext);
  };

  // ============================================================
  // BIND-ROW — связка карусели аватарок (.stories-row) с viewer'ом
  //
  //   MomentViewer.bindRow(rowEl, viewerEl, {
  //     slides: function (avatarEl) { return [{ color, src, cta, ... }, …]; },
  //     // Не обязателен. Если не передан — по data-stories на аватарке
  //     // и data-cta-label делается базовый набор пустых сегментов.
  //   });
  //
  // Из data-атрибутов аватарки берётся:
  //   data-stories     — количество сегментов прогресса (default 1)
  //   data-name        — заголовок в шапке viewer'а
  //   data-cta-label   — лейбл CTA-кнопки снизу (если есть)
  //   data-skip-viewer — аватарка не открывает viewer
  //
  // Сам viewer должен содержать:
  //   .moment__progress, .moment__header-title, .moment__header .avatar img,
  //   .moment__cta (опц.), [aria-label="Закрыть"] (опц., для тапа на крестик).
  // ============================================================
  function bindRow(rowEl, viewerEl, options) {
    options = options || {};
    var currentAva = null;
    var instance = null;

    function avatars() {
      return Array.prototype.filter.call(
        rowEl.querySelectorAll('.avatar'),
        function (a) { return !a.hasAttribute('data-skip-viewer'); }
      );
    }

    function defaultSlides(ava) {
      var count = parseInt(ava.getAttribute('data-stories'), 10) || 1;
      var ctaLabel = ava.getAttribute('data-cta-label');
      var palette = options.palette || DEFAULT_PALETTE;
      var list = [];
      for (var i = 0; i < count; i++) {
        var s = { color: palette[i % palette.length] };
        if (ctaLabel) s.cta = { label: ctaLabel };
        list.push(s);
      }
      return list;
    }

    function slidesFor(ava) {
      if (typeof options.slides === 'function') {
        var custom = options.slides(ava);
        if (custom) return custom;
      }
      return defaultSlides(ava);
    }

    function applyAuthor(ava) {
      currentAva = ava;
      var titleEl = viewerEl.querySelector('.moment__header-title');
      if (titleEl) titleEl.textContent = ava.getAttribute('data-name') || '';

      // Аватар в шапке viewer'а — копия из источника. Поддерживаем два случая:
      //  1) источник .avatar — копируем classы __type-* и innerHTML в .avatar в шапке
      //  2) источник содержит .avatars-view (стек из 2+ ав) — заменяем .avatar в
      //     шапке клоном .avatars-view с принудительным __size-24
      var headerSlot = viewerEl.querySelector('.moment__header > .avatar, .moment__header > .avatars-view');
      if (!headerSlot) return;

      var sourceView = ava.querySelector ? ava.querySelector('.avatars-view') : null;
      if (sourceView) {
        var clone = sourceView.cloneNode(true);
        clone.classList.add('__size-24'); // в шапке avatars-view меньше
        Array.prototype.slice.call(clone.classList).forEach(function (c) {
          if (/^__size-(?!24$)/.test(c)) clone.classList.remove(c);
        });
        // Уменьшим аватарки внутри стека до __size-24
        Array.prototype.slice.call(clone.querySelectorAll('.avatar')).forEach(function (a) {
          Array.prototype.slice.call(a.classList).forEach(function (c) {
            if (/^__size-/.test(c)) a.classList.remove(c);
          });
          a.classList.add('__size-24');
        });
        headerSlot.replaceWith(clone);
        return;
      }

      // Одна аватарка — старая логика
      if (!headerSlot.classList.contains('avatar')) {
        // в шапке сейчас .avatars-view, нужно вернуть .avatar
        var fresh = document.createElement('div');
        fresh.className = 'avatar __size-36 __type-image';
        fresh.innerHTML = '<img src="" alt="">';
        headerSlot.replaceWith(fresh);
        headerSlot = fresh;
      }
      // Чистим все классы кроме базового avatar и размера __size-36, добавляем
      // все классы источника кроме его __size-* и __ring-* (свой размер
      // сохраняем, кольцо не нужно).
      Array.prototype.slice.call(headerSlot.classList).forEach(function (c) {
        if (c !== 'avatar' && c !== '__size-36') headerSlot.classList.remove(c);
      });
      Array.prototype.slice.call(ava.classList).forEach(function (c) {
        if (c === 'avatar' || /^__size-/.test(c) || /^__ring-/.test(c)) return;
        headerSlot.classList.add(c);
      });
      headerSlot.innerHTML = ava.innerHTML;
    }

    function markViewed(ava) {
      if (!ava) return;
      ava.classList.remove('__ring-active');
      ava.classList.add('__ring-viewed');
    }

    // Шаг к соседней аватарке. dir = +1 | -1. true = переход выполнен.
    function step(dir) {
      var list = avatars();
      var i = list.indexOf(currentAva);
      // Автор не в карусели (например, «виртуальный» автор сториз, открытой
      // не из стака, а из фида) — соседей нет, переход не делаем.
      if (i === -1) return false;
      var nextAva = list[i + dir];
      if (!nextAva) return false;
      if (dir > 0) markViewed(currentAva);
      applyAuthor(nextAva);
      instance.setSlides(slidesFor(nextAva));
      instance.go(0);
      return true;
    }

    function open(ava) {
      applyAuthor(ava);
      viewerEl.hidden = false;

      if (instance) instance.destroy();
      instance = new MomentViewer(viewerEl, {
        slides: slidesFor(ava),
        onNext: function () { return step(+1); },
        onPrev: function () { return step(-1); },
        onClose: function () {
          viewerEl.hidden = true;
          markViewed(currentAva);
        }
      });
    }

    rowEl.addEventListener('click', function (e) {
      var ava = e.target.closest('.avatar');
      if (!ava || !rowEl.contains(ava)) return;
      if (ava.hasAttribute('data-skip-viewer')) return;
      open(ava);
    });

    var closeBtn = viewerEl.querySelector('[aria-label="Закрыть"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (instance) instance._finish();
      });
    }

    // Публичный API. open(ava) позволяет открыть сториз «виртуального» автора,
    // которого нет в карусели (например, годовщину — из тапа по постеру в фиде).
    // ava — обычный элемент-аватарка с нужными data-* (data-name/data-friendship
    // и т.п.) и контентом для шапки; в стак его добавлять не обязательно.
    return { open: open };
  }

  // ============================================================
  // CREATE — фабрика DOM-узла viewer'а с готовой разметкой.
  // На странице: document.getElementById('slot').replaceWith(MomentViewer.create()).
  // ============================================================
  function createViewer(opts) {
    opts = opts || {};
    var duration = opts.duration || '4s';
    var el = document.createElement('div');
    el.className = 'moment __fullscreen';
    el.hidden = true;
    el.style.cssText = '--moment-duration: ' + duration + '; z-index: 1000;';
    el.innerHTML = [
      // Карточка-контейнер: фото + скрим (+ блюр/текст ДР добавляются сюда же).
      // В ДР она получает скругления + overflow:hidden и отделяется от кнопки
      // (кнопка лежит ниже на чёрном фоне). В остальных сториз — на весь экран.
      '<div class="moment__card">',
        '<img class="moment__media" alt="" style="display:none;">',
        '<div class="moment__scrim"></div>',
      '</div>',
      '<div class="moment__statusbar">',
        '<span class="moment__statusbar-time">9:41</span>',
      '</div>',
      '<div class="moment__topbar">',
        '<div class="moment__progress"></div>',
        '<div class="moment__header">',
          '<div class="avatar __size-36 __type-image"><img src="" alt=""></div>',
          '<div class="moment__header-text">',
            '<div class="moment__header-title"></div>',
            '<div class="moment__header-subtitle">только что</div>',
          '</div>',
          '<span class="button-inline-wrapper __view-primary-on-color __size-24">',
            '<button class="button-inline __size-24" aria-label="Ещё">',
              '<span class="button-inline__content">',
                '<img class="button-inline__icon" src="assets/icons/more_24.svg" width="24" height="24" alt="" style="filter: brightness(0) invert(1);">',
              '</span>',
            '</button>',
          '</span>',
          '<span class="button-inline-wrapper __view-primary-on-color __size-24">',
            '<button class="button-inline __size-24" aria-label="Закрыть">',
              '<span class="button-inline__content">',
                // Крестик — static secondary inverse (rgba(255,255,255,0.88)):
                // белый через filter + opacity 0.88.
                '<img class="button-inline__icon" src="assets/icons/close_16_20.svg" width="24" height="24" alt="" style="filter: brightness(0) invert(1); opacity: 0.88;">',
              '</span>',
            '</button>',
          '</span>',
        '</div>',
      '</div>',
      '<div class="moment__body" style="display: none;"></div>',
      '<div class="moment__nav">',
        '<button class="moment__nav-zone __side-prev" aria-label="Назад"></button>',
        '<button class="moment__nav-zone __side-next" aria-label="Дальше"></button>',
      '</div>',
      '<div class="moment__cta-blur" aria-hidden="true"></div>',
      '<div class="moment__cta" style="display: none;"></div>',
      '<div class="moment__handle"></div>'
    ].join('');
    return el;
  }

  // Палитра по умолчанию для обычных сториз без картинки. Используется в
  // bindRow, если slides()-колбэк не передан или вернул null.
  var DEFAULT_PALETTE = ['#FF7700', '#5856D6', '#34C759', '#FF3B30', '#007AFF', '#AF52DE'];

  // Эмодзи быстрых реакций в панели обычного момента (см. квик-CTA в go()).
  var DEFAULT_QUICK_EMOJIS = ['😍', '🔥', '👏', '😂', '❤️', '🙏', '😮', '😢', '💯'];

  // ============================================================
  // VVZ-SLIDE — фабрика slide-объекта для viewer'а с ВВЗ-контентом.
  //   MomentViewer.vvzSlide({
  //     title:  'Возможно вы знакомы',
  //     people: [{ name, sub, img, mutuals?, m? }, …],
  //     cta:    { label: 'Показать всех', onClick? }   // опц.
  //   });
  // Карточки рендерятся через window.VvzCard.render — соответствующий модуль
  // должен быть подключён.
  // ============================================================
  function vvzSlide(opts) {
    opts = opts || {};
    var people = opts.people || [];
    // Заголовок + сетку карточек собирает единый компонент VvzCard.section
    // (он же — в ВВЗ-слайде клипов, см. components/clip-vvz.js).
    var section = (window.VvzCard && window.VvzCard.section)
      ? window.VvzCard.section({ title: opts.title, people: people })
      : '';
    // section — это .vvz-section (заголовок + сетка): сам центрируется и
    // скроллится в .moment__body; viewer масштабирует его (zoom), если он не
    // влезает по высоте на маленьком экране (см. _fitBody в moment.js).
    var body = section;
    var slide = {
      body: body,
      // Фон ВВЗ-сториз — картинка-подложка (оранжево-чёрный градиент сверху-
      // вниз, assets/vvz-story-back.png). Путь относительный — резолвится от
      // URL страницы; вложенные страницы могут переопределить через
      // opts.background. Снизу #000 на случай экранов выше картинки.
      background: opts.background || 'center top / cover no-repeat url("assets/vvz-story-back.png") #000',
      // На ВВЗ-сториз держимся дольше (6с) — успеть рассмотреть карточки.
      duration: opts.duration || '6s'
    };
    if (opts.cta) slide.cta = opts.cta;
    return slide;
  }

  // ============================================================
  // BDAY-SLIDE — фабрика slide-объекта именинного шаблона.
  //   MomentViewer.bdaySlide({
  //     name:     'Лизы Михайловой',   // склонение в род. падеже под "День рождения …"
  //     photo:    'https://…',         // полноэкранный фон (фото именинника)
  //     kicker:   'Сегодня',           // мелкий приглушённый текст сверху  (опц.)
  //     heading:  'День рождения',     // большой заголовок                  (опц.)
  //     cta:      'Поздравить',        // лейбл CTA-кнопки                   (опц.)
  //     headerTitle:    'День рождения Лизы',  // переопределение title в header'е
  //     headerSubtitle: '3 часа назад',        // и subtitle (опц.)
  //   });
  // ============================================================
  function bdaySlide(opts) {
    opts = opts || {};
    var slide = {
      src: opts.photo,
      bday: {
        kicker:  opts.kicker  || 'Сегодня',
        heading: opts.heading || 'День рождения',
        name:    opts.name    || ''
      },
      // Шары летят ~5.7s (5.4s + 0.30s стаггер); даём ещё ~2s «передышки»
      // на тап «Поздравить». Можно переопределить через opts.duration.
      duration: opts.duration || '8s'
    };
    if (opts.headerTitle    != null) slide.title    = opts.headerTitle;
    if (opts.headerSubtitle != null) slide.subtitle = opts.headerSubtitle;
    if (opts.cta) slide.cta = { label: opts.cta, style: 'primary' };
    return slide;
  }

  // ============================================================
  // FRIENDSHIP-SLIDE — фабрика слайда «годовщина дружбы».
  //   MomentViewer.friendshipSlide({
  //     title:   '478 подарков',
  //     sub:     'С 1 июня 2023 года',
  //     avatars: ['url1', 'url2'],   // [0] — верх-право, [1] — центр-лево
  //     pic:     'assets/icons/pic.png',   // опц.: картинка-«мишка»
  //     cta:     { label: 'Отправить другу' }   // style по умолч. primary
  //   });
  // Композиция повторяет фид-постер (см. components/friendship-story.css),
  // подложка вынесена в отдельный слой и в будущем заменится.
  // ============================================================
  function friendshipSlide(opts) {
    opts = opts || {};
    var avs = opts.avatars || [];
    var avaTop = avs[0] || '';
    var avaMid = avs[1] || avs[0] || '';
    var pic = opts.pic || 'assets/icons/pic.png';
    var body = [
      '<div class="friendship-story">',
        // Подложка — отдельный (временный) слой, см. friendship-story.css.
        '<div class="friendship-story__bg"></div>',
        '<div class="friendship-story__content">',
          '<div class="friendship-story__avas">',
            '<div class="friendship-story__row __ava-top">',
              '<div class="avatar __type-image friendship-story__ava"><img src="' + avaTop + '" alt=""></div>',
            '</div>',
            '<div class="friendship-story__row __ava-mid">',
              '<div class="avatar __type-image friendship-story__ava"><img src="' + avaMid + '" alt=""></div>',
            '</div>',
          '</div>',
          '<div class="friendship-story__lower">',
            '<div class="friendship-story__row __pic">',
              '<div class="friendship-story__pic"><img src="' + pic + '" alt=""></div>',
            '</div>',
            '<div class="friendship-story__text">',
              '<h2 class="friendship-story__title">' + (opts.title || '') + '</h2>',
              '<p class="friendship-story__sub">' + (opts.sub || '') + '</p>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
    var slide = { body: body };
    if (opts.cta) {
      slide.cta = opts.cta;
      // По макету кнопка годовщины — primary (оранжевая), на всю ширину.
      if (!slide.cta.style) slide.cta.style = 'primary';
    }
    return slide;
  }

  // ============================================================
  // GENITIVE — склонение русского ФИО в родительный падеж для шаблона
  //   «День рождения <кого>». Эвристика по окончаниям (имя + фамилия),
  //   пол берём из данных, если есть (точнее для согласных окончаний).
  //   Покрывает типовые случаи; редкие/иностранные фамилии остаются как есть.
  // ============================================================
  function normGender(g) {
    if (g === 'ж' || g === 'f' || g === 'female') return 'f';
    if (g === 'м' || g === 'm' || g === 'male')   return 'm';
    return '';
  }
  function isConsonant(ch) { return 'бвгдзйклмнпрстфхцчшщ'.indexOf(ch) !== -1; }

  function genitiveWord(w, gender, isSurname) {
    if (!w) return w;
    var lower = w.toLowerCase();
    var last = lower.slice(-1);
    var last2 = lower.slice(-2);
    var cut = function (n) { return w.slice(0, w.length - n); };

    if (isSurname) {
      if (gender === 'f') {
        if (last2 === 'ая') return cut(2) + 'ой';        // -ская/-цкая → -ской
        if (last === 'а' && (last2 === 'ва' || last2 === 'на')) return cut(1) + 'ой'; // -ова/-ева/-ина → -ой
        if (last2 === 'ия') return cut(1) + 'и';
        return w;                                         // согласная/-ко/-их → не склоняем
      }
      if (last2 === 'ий' || last2 === 'ый') return cut(2) + 'ого'; // -ский → -ского
      if (last === 'й') return cut(1) + 'я';
      if (last === 'о' || last === 'е' || last === 'и' || last === 'у' || last === 'ы' || last === 'х') return w;
      if (isConsonant(last)) return w + 'а';             // -ов/-ин/согласная → +а
      if (last === 'а') return cut(1) + 'ы';
      if (last === 'я') return cut(1) + 'и';
      return w;
    }

    // имя (или отчество)
    if (last2 === 'ия') return cut(1) + 'и';             // Лидия→Лидии, Анастасия→Анастасии
    if (last === 'я') return cut(1) + 'и';               // Оля→Оли, Илья→Ильи
    if (last === 'а') {
      var prev = lower.slice(-2, -1);
      if ('гкхжчшщ'.indexOf(prev) !== -1) return cut(1) + 'и'; // Луша→Луши
      return cut(1) + 'ы';                              // Лиза→Лизы, Никита→Никиты
    }
    if (gender === 'f') {
      if (last === 'ь') return cut(1) + 'и';             // Любовь→Любови
      return w;                                          // жен. имя на согласную — не склоняем
    }
    if (last === 'й' || last === 'ь') return cut(1) + 'я'; // Алексей→Алексея, Игорь→Игоря
    if (isConsonant(last)) return w + 'а';               // Иван→Ивана, Эмиль(?)
    return w;                                            // -о/-е/-и/-у — не склоняем
  }

  // Эвристика пола, когда в данных он не задан: сначала по фамилии (надёжнее),
  // затем по окончанию имени. Нужна, чтобы женские фамилии -ова/-ина/-ая
  // склонялись в -ой, а не уходили в нейтральную ветку.
  function inferGender(parts) {
    for (var i = 1; i < parts.length; i++) {
      var s = parts[i].toLowerCase();
      if (/(ова|ева|ёва|ина|ына|ая|яя)$/.test(s)) return 'f';
      if (/(ов|ев|ёв|ин|ын|ский|цкий|ой|ый|ий)$/.test(s)) return 'm';
    }
    var first = (parts[0] || '').toLowerCase();
    if (/[ая]$/.test(first)) return 'f';
    if (/[йь]$/.test(first) || /[бвгдзклмнпрстфхцчшщ]$/.test(first)) return 'm';
    return '';
  }

  // Полное ФИО → родительный падеж (скобочные прозвища отбрасываем).
  function genitive(name, gender) {
    if (!name) return name || '';
    var clean = name.replace(/\([^)]*\)/g, '').trim();
    if (!clean) return '';
    var parts = clean.split(/\s+/);
    var g = normGender(gender) || inferGender(parts);
    return parts.map(function (w, i) {
      return genitiveWord(w, g, i > 0);
    }).join(' ');
  }
  // Только имя (первое слово) в родительном падеже. Пол выводим из всего ФИО
  // (если передано), чтобы имена на -а/-я не путались с мужскими.
  function genitiveFirst(name, gender) {
    var parts = (name || '').replace(/\([^)]*\)/g, '').trim().split(/\s+/);
    var g = normGender(gender) || inferGender(parts);
    return genitiveWord(parts[0] || '', g, false);
  }

  // Экспорт
  window.MomentViewer = {
    init:            function (root, options) { return new MomentViewer(root, options); },
    bindRow:         bindRow,
    create:          createViewer,
    vvzSlide:        vvzSlide,
    bdaySlide:       bdaySlide,
    friendshipSlide: friendshipSlide,
    genitive:        genitive,
    genitiveFirst:   genitiveFirst,
    palette:         DEFAULT_PALETTE,
    quickEmojis:     DEFAULT_QUICK_EMOJIS
  };
})();
