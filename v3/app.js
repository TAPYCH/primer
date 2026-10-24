/* Концепт «Минимал»: эффекты прокрутки, переключатели и тема */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]shot\b/.test(location.search);

  /* ---------- тема ---------- */
  var toggle = d.querySelector('[data-theme-toggle]');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (toggle) toggle.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('padelApsny.theme', next); } catch (e) { /* тема просто не запомнится */ }
  });

  /* ---------- изображение раскрывается на весь экран ---------- */
  var zoom = d.querySelector('[data-zoom]');
  /* ---------- слова манифеста проявляются ---------- */
  var manifest = d.querySelector('[data-words]');
  if (manifest) {
    var words = manifest.textContent.trim().split(/[ \t\n\r]+/);
    manifest.setAttribute('aria-label', manifest.textContent.trim());
    manifest.innerHTML = words.map(function (w, i) {
      return '<span class="mw" aria-hidden="true" style="--w:' + (i / words.length).toFixed(3) + '">' + w + '</span>';
    }).join(' ');
  }

  var ticking = false;
  function update() {
    ticking = false;
    var vh = innerHeight;
    if (zoom) {
      var r = zoom.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -r.top / (r.height - vh)));
      zoom.style.setProperty('--p', still ? 1 : p.toFixed(4));
    }
    if (manifest) {
      var m = manifest.getBoundingClientRect();
      // старт, когда верх абзаца у 85% экрана, финиш — когда низ поднялся до 45%
      var start = vh * 0.85, end = vh * 0.45;
      var q = (start - m.top) / (start - end + m.height);
      manifest.style.setProperty('--p', still ? 1.2 : Math.min(1.2, Math.max(0, q * 1.1)).toFixed(4));
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();

  /* ---------- сегментированные переключатели ---------- */
  function moveThumb(seg) {
    var active = seg.querySelector('button.is-active');
    var thumb = seg.querySelector('.segmented-thumb');
    if (!active || !thumb) return;
    thumb.style.setProperty('--x', active.offsetLeft + 'px');
    thumb.style.setProperty('--w', active.offsetWidth + 'px');
  }
  function select(seg, btn) {
    seg.querySelectorAll('button').forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on);
    });
    moveThumb(seg);
  }
  d.querySelectorAll('.segmented').forEach(function (seg) {
    moveThumb(seg);
    addEventListener('resize', function () { moveThumb(seg); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { moveThumb(seg); });
  });

  // корты
  var tabs = d.querySelector('[data-tabs]');
  if (tabs) {
    var panels = d.querySelectorAll('.court-panel');
    var infos = d.querySelectorAll('.court-info');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      select(tabs, b);
      var i = +b.dataset.tab;
      panels.forEach(function (p, k) { p.classList.toggle('is-active', k === i); });
      infos.forEach(function (p, k) { p.classList.toggle('is-active', k === i); });
    });
  }

  // цены: будни / выходные (берём из тех же настроек, что и бронирование)
  var modeSeg = d.querySelector('[data-price-mode]');
  if (modeSeg && window.PadelBooking) {
    var nf = new Intl.NumberFormat('ru-RU');
    var mode = 'weekday';
    var render = function (animate) {
      var cfg = PadelBooking.config();
      cfg.tariffs.forEach(function (t) {
        var el = d.querySelector('[data-pt="' + t.id + '"]');
        if (!el) return;
        var value = nf.format(mode === 'weekend' ? cfg.weekendPrice : t.price);
        if (!animate || still) { el.textContent = value; return; }
        el.classList.add('is-swapping');
        setTimeout(function () { el.textContent = value; el.classList.remove('is-swapping'); }, 220);
      });
    };
    modeSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === mode) return;
      select(modeSeg, b);
      mode = b.dataset.mode;
      render(true);
    });
    render(false);
    PadelBooking.subscribe(function () { render(false); });
  }
})();
