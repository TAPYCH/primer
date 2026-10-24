/*!
 * Padel Apsny — лёгкий модуль анимаций без зависимостей.
 * data-reveal, data-split, data-count, data-parallax, data-magnetic, data-tilt,
 * data-marquee, data-lightbox, data-header, data-menu-toggle, data-progress.
 */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var still = reduce || /[?&]shot\b/.test(location.search);
  if (still) root.classList.add('is-still');

  function ready(fn) { if (d.readyState !== 'loading') fn(); else d.addEventListener('DOMContentLoaded', fn); }

  /* ---------- разбивка заголовков на слова и буквы ---------- */
  function split(el) {
    var mode = el.dataset.split || 'chars';
    var i = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.textContent.split(/([ \t\n\r\f]+)/).forEach(function (word) {
            if (!word) return;
            if (/^[ \t\n\r\f]+$/.test(word)) { frag.appendChild(d.createTextNode(' ')); return; }
            var w = d.createElement('span');
            w.className = 'w';
            if (mode === 'words') {
              var inner = d.createElement('span');
              inner.className = 'c';
              inner.style.setProperty('--i', i++);
              inner.textContent = word;
              w.appendChild(inner);
            } else {
              Array.from(word).forEach(function (ch) {
                var c = d.createElement('span');
                c.className = 'c';
                c.style.setProperty('--i', i++);
                c.textContent = ch;
                w.appendChild(c);
              });
            }
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.hasAttribute('data-split-whole')) {
          // градиентный текст и подобное анимируем целиком, иначе background-clip ломается
          var ww = d.createElement('span'), cc = d.createElement('span');
          ww.className = 'w'; cc.className = 'c';
          cc.style.setProperty('--i', i); i += 3;
          n.parentNode.replaceChild(ww, n);
          cc.appendChild(n); ww.appendChild(cc);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    }
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    Array.prototype.forEach.call(el.querySelectorAll('.w'), function (w) { w.setAttribute('aria-hidden', 'true'); });
  }

  /* ---------- счётчики ---------- */
  function count(el) {
    var target = parseFloat(el.dataset.count);
    var dec = +(el.dataset.decimals || 0);
    var suffix = el.dataset.suffix || '';
    var fmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (still) { el.textContent = fmt.format(target) + suffix; return; }
    var t0 = performance.now(), dur = +(el.dataset.duration || 1600);
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt.format(target * e) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  ready(function () {
    d.querySelectorAll('[data-split]').forEach(split);

    d.querySelectorAll('[data-stagger]').forEach(function (group) {
      var step = +(group.dataset.stagger || 80);
      Array.prototype.forEach.call(group.children, function (c, i) {
        if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', group.dataset.staggerType || '');
        c.style.setProperty('--d', (i * step) + 'ms');
      });
    });
    d.querySelectorAll('[data-delay]').forEach(function (el) { el.style.setProperty('--d', el.dataset.delay + 'ms'); });

    var targets = d.querySelectorAll('[data-reveal],[data-split],[data-count],[data-inview]');
    if (still || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); if (el.dataset.count) count(el); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          if (en.target.dataset.count) count(en.target);
          io.unobserve(en.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      targets.forEach(function (el) { io.observe(el); });
    }

    /* ---------- бегущая строка: дублируем содержимое для бесшовного цикла ---------- */
    d.querySelectorAll('[data-marquee]').forEach(function (m) {
      var track = m.firstElementChild;
      if (!track) return;
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      m.appendChild(clone);
    });

    /* ---------- шапка ---------- */
    var header = d.querySelector('[data-header]');
    var progress = d.querySelector('[data-progress]');
    var lastY = window.scrollY;
    function onScroll() {
      var y = window.scrollY;
      if (header) {
        header.classList.toggle('is-scrolled', y > 12);
        var hide = y > 480 && y > lastY + 4 && !root.classList.contains('menu-open');
        if (hide) header.classList.add('is-hidden');
        else if (y < lastY - 4 || y < 480) header.classList.remove('is-hidden');
      }
      if (progress) {
        var h = d.documentElement.scrollHeight - innerHeight;
        progress.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- мобильное меню ---------- */
    d.addEventListener('click', function (e) {
      var t = e.target.closest('[data-menu-toggle]');
      if (t) {
        var open = root.classList.toggle('menu-open');
        t.setAttribute('aria-expanded', open);
        return;
      }
      if (e.target.closest('[data-menu] a') && root.classList.contains('menu-open')) {
        root.classList.remove('menu-open');
        var btn = d.querySelector('[data-menu-toggle]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) root.classList.remove('menu-open');
    });

    /* ---------- параллакс ---------- */
    var px = Array.prototype.slice.call(d.querySelectorAll('[data-parallax]'));
    if (px.length && !still) {
      var ticking = false;
      var update = function () {
        ticking = false;
        var vh = innerHeight;
        px.forEach(function (el) {
          var r = el.parentElement.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          var speed = parseFloat(el.dataset.parallax) || 0.15;
          var center = r.top + r.height / 2 - vh / 2;
          el.style.transform = 'translate3d(0,' + (-center * speed).toFixed(1) + 'px,0)';
        });
      };
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      window.addEventListener('resize', update);
      update();
    }

    /* ---------- магнитные кнопки и 3D-наклон (только мышь) ---------- */
    if (fine && !still) {
      d.querySelectorAll('[data-magnetic]').forEach(function (el) {
        var k = parseFloat(el.dataset.magnetic) || 0.3;
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
          el.style.transform = 'translate(' + (x * k).toFixed(1) + 'px,' + (y * k).toFixed(1) + 'px)';
        });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; });
      });
      d.querySelectorAll('[data-tilt]').forEach(function (el) {
        var max = parseFloat(el.dataset.tilt) || 7;
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var px2 = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          el.style.setProperty('--rx', ((0.5 - py) * max).toFixed(2) + 'deg');
          el.style.setProperty('--ry', ((px2 - 0.5) * max).toFixed(2) + 'deg');
          el.style.setProperty('--mx', (px2 * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          el.classList.add('is-tilting');
        });
        el.addEventListener('pointerleave', function () {
          el.style.setProperty('--rx', '0deg');
          el.style.setProperty('--ry', '0deg');
          el.classList.remove('is-tilting');
        });
      });
    }

    /* ---------- лайтбокс галереи ---------- */
    var items = Array.prototype.slice.call(d.querySelectorAll('[data-lightbox]'));
    if (items.length) {
      var box = d.createElement('div');
      box.className = 'lb';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Фотография');
      box.innerHTML = '<button class="lb-btn lb-close" aria-label="Закрыть">×</button><button class="lb-btn lb-prev" aria-label="Предыдущее">‹</button><figure class="lb-fig"><img alt=""><figcaption></figcaption></figure><button class="lb-btn lb-next" aria-label="Следующее">›</button><div class="lb-count"></div>';
      d.body.appendChild(box);
      var img = box.querySelector('img'), cap = box.querySelector('figcaption'), cnt = box.querySelector('.lb-count');
      var idx = 0;
      var show = function (i) {
        idx = (i + items.length) % items.length;
        var a = items[idx];
        img.classList.remove('is-loaded');
        img.onload = function () { img.classList.add('is-loaded'); };
        img.src = a.getAttribute('href');
        img.alt = a.dataset.caption || '';
        cap.textContent = a.dataset.caption || '';
        cnt.textContent = (idx + 1) + ' / ' + items.length;
      };
      var open = function (i) { show(i); box.classList.add('is-open'); root.classList.add('lb-locked'); box.querySelector('.lb-close').focus(); };
      var close = function () { box.classList.remove('is-open'); root.classList.remove('lb-locked'); };
      items.forEach(function (a, i) { a.addEventListener('click', function (e) { e.preventDefault(); open(i); }); });
      box.addEventListener('click', function (e) {
        if (e.target.closest('.lb-next')) show(idx + 1);
        else if (e.target.closest('.lb-prev')) show(idx - 1);
        else if (e.target.closest('.lb-close') || e.target === box) close();
      });
      d.addEventListener('keydown', function (e) {
        if (!box.classList.contains('is-open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowRight') show(idx + 1);
        if (e.key === 'ArrowLeft') show(idx - 1);
      });
      var sx = null;
      box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (sx == null) return;
        var dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
        sx = null;
      });
    }

    /* ---------- горизонтальная прокрутка перетаскиванием ---------- */
    d.querySelectorAll('[data-drag-scroll]').forEach(function (el) {
      var down = false, startX = 0, startLeft = 0, moved = false;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse') return;
        down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
        el.classList.add('is-dragging');
      });
      window.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        el.scrollLeft = startLeft - dx;
      });
      window.addEventListener('pointerup', function () { down = false; el.classList.remove('is-dragging'); });
      el.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    });

    /* ---------- панель переключения концептов (для презентации клиенту) ---------- */
    var concept = d.body.dataset.concept;
    if (concept && !/[?&]shot/.test(location.search)) {
      var list = [
        { id: 'v1', name: 'Неон' },
        { id: 'v2', name: 'Море' },
        { id: 'v3', name: 'Минимал' }
      ];
      var i = list.findIndex(function (c) { return c.id === concept; });
      var prev = list[(i + list.length - 1) % list.length], next = list[(i + 1) % list.length];
      var bar = d.createElement('nav');
      bar.className = 'cbar';
      bar.setAttribute('aria-label', 'Концепции дизайна');
      bar.innerHTML =
        '<a class="cbar-home" href="../" title="Все концепции"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="2"/><rect x="11" y="2" width="7" height="7" rx="2"/><rect x="2" y="11" width="7" height="7" rx="2"/><rect x="11" y="11" width="7" height="7" rx="2"/></svg><span>Концепты</span></a>' +
        '<a class="cbar-arrow" href="../' + prev.id + '/" title="' + prev.name + '">‹</a>' +
        '<span class="cbar-cur"><b>0' + (i + 1) + '</b> ' + list[i].name + '</span>' +
        '<a class="cbar-arrow" href="../' + next.id + '/" title="' + next.name + '">›</a>' +
        '<a class="cbar-admin" href="../admin/">Админка</a>';
      d.body.appendChild(bar);
    }
  });
})();
