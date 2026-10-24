/*!
 * Padel Apsny — виджет онлайн-бронирования.
 * Один компонент для всех версий сайта; внешний вид задаётся CSS-переменными --bw-*.
 */
(function (global) {
  'use strict';

  var B = global.PadelBooking;
  var U = B.util;

  var PARTS = [
    { id: 'morning', name: 'Утро', test: function (m) { return m < 12 * 60; } },
    { id: 'day', name: 'День', test: function (m) { return m >= 12 * 60 && m < 17 * 60; } },
    { id: 'evening', name: 'Вечер', test: function (m) { return m >= 17 * 60; } }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var TEMPLATE =
    '<div class="bw-grid">' +
      '<div class="bw-main">' +
        '<section class="bw-step">' +
          '<header class="bw-step-h"><span class="bw-n">01</span><span class="bw-t">Дата</span>' +
            '<div class="bw-nav"><button type="button" class="bw-arrow" data-scroll="-1" aria-label="Раньше">‹</button><button type="button" class="bw-arrow" data-scroll="1" aria-label="Позже">›</button></div>' +
          '</header>' +
          '<div class="bw-dates" data-dates role="listbox" aria-label="Дата"></div>' +
        '</section>' +
        '<section class="bw-step">' +
          '<header class="bw-step-h"><span class="bw-n">02</span><span class="bw-t">Корт</span></header>' +
          '<div class="bw-courts" data-courts></div>' +
        '</section>' +
        '<section class="bw-step">' +
          '<header class="bw-step-h"><span class="bw-n">03</span><span class="bw-t">Время</span>' +
            '<div class="bw-seg" data-durations role="radiogroup" aria-label="Длительность"></div>' +
          '</header>' +
          '<div class="bw-slots" data-slots aria-live="polite"></div>' +
          '<div class="bw-legend"><span><i class="is-free"></i>Свободно</span><span><i class="is-busy"></i>Занято</span><span><i class="is-peak"></i>Вечер и выходные</span></div>' +
        '</section>' +
      '</div>' +
      '<form class="bw-summary" data-form novalidate>' +
        '<div class="bw-sum-h"><span>Ваша бронь</span><span class="bw-live"><i></i>онлайн</span></div>' +
        '<dl class="bw-dl" data-dl></dl>' +
        '<fieldset class="bw-extras" data-extras><legend>Добавить к игре</legend></fieldset>' +
        '<div class="bw-fields">' +
          '<label class="bw-field"><span>Имя</span><input name="name" autocomplete="name" placeholder="Как к вам обращаться" maxlength="60"></label>' +
          '<label class="bw-field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (940) 000-00-00"></label>' +
        '</div>' +
        '<div class="bw-total"><span>Итого</span><b data-total>—</b></div>' +
        '<button class="bw-submit" type="submit" data-submit>Выберите время</button>' +
        '<p class="bw-error" data-error role="alert"></p>' +
        '<p class="bw-note">Оплата на месте или онлайн · бесплатная отмена за 12 часов</p>' +
      '</form>' +
    '</div>';

  function mount(root, options) {
    if (!root) return null;
    var opts = Object.assign({ days: 14, adminUrl: '../admin/', duration: 90 }, options || {});
    var cfg = B.config();
    var state = {
      date: U.todayISO(),
      court: cfg.courts[0].id,
      duration: opts.duration,
      start: null,
      extras: []
    };
    // поздно вечером сегодня уже нечего бронировать — сразу показываем завтра
    if (B.freeCount(state.date, state.duration) < 3) state.date = U.addDays(state.date, 1);
    state.court = bestCourt();

    function bestCourt() {
      var best = state.court, max = -1;
      B.config().courts.forEach(function (c) {
        var n = B.daySlots(state.date, c.id, state.duration).filter(function (s) { return s.free; }).length;
        if (n > max) { max = n; best = c.id; }
      });
      return best;
    }

    root.classList.add('bw');
    root.innerHTML = TEMPLATE;
    var $ = function (sel) { return root.querySelector(sel); };
    var datesEl = $('[data-dates]'), courtsEl = $('[data-courts]'), durEl = $('[data-durations]'),
      slotsEl = $('[data-slots]'), dlEl = $('[data-dl]'), extrasEl = $('[data-extras]'),
      totalEl = $('[data-total]'), submitEl = $('[data-submit]'), errorEl = $('[data-error]'),
      form = $('[data-form]');

    function renderDates() {
      var html = '';
      for (var i = 0; i < opts.days; i++) {
        var iso = U.addDays(U.todayISO(), i);
        var free = B.freeCount(iso, state.duration);
        var level = free === 0 ? 'none' : free < 12 ? 'low' : 'ok';
        var top = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : U.fmtDate(iso, { weekday: 'short' });
        html += '<button type="button" class="bw-date' + (iso === state.date ? ' is-active' : '') + (U.isWeekend(iso) ? ' is-weekend' : '') +
          '" data-date="' + iso + '" role="option" aria-selected="' + (iso === state.date) + '"' + (free === 0 ? ' disabled' : '') + '>' +
          '<span class="bw-date-w">' + top + '</span>' +
          '<span class="bw-date-d">' + U.fromISO(iso).getDate() + '</span>' +
          '<span class="bw-date-m">' + U.fmtDate(iso, { month: 'short' }).replace('.', '') + '</span>' +
          '<i class="bw-dot is-' + level + '" title="' + (free ? 'Свободных окон: ' + free : 'Мест нет') + '"></i>' +
          '</button>';
      }
      datesEl.innerHTML = html;
    }

    function renderCourts() {
      var html = '';
      B.config().courts.forEach(function (c) {
        var free = B.daySlots(state.date, c.id, state.duration).filter(function (s) { return s.free; }).length;
        html += '<button type="button" class="bw-court' + (c.id === state.court ? ' is-active' : '') + '" data-court="' + c.id + '"' + (c.active ? '' : ' disabled') + ' aria-pressed="' + (c.id === state.court) + '">' +
          '<span class="bw-court-n">' + esc(c.name) + '</span>' +
          '<span class="bw-court-t">' + esc(c.title) + (c.covered ? ' · под крышей' : ' · открытый') + '</span>' +
          '<span class="bw-court-f">' + (c.active ? (free ? free + ' ' + plural(free, 'окно', 'окна', 'окон') : 'нет мест') : 'на обслуживании') + '</span>' +
          '</button>';
      });
      courtsEl.innerHTML = html;
    }

    function renderDurations() {
      durEl.innerHTML = B.config().durations.map(function (d) {
        return '<button type="button" role="radio" aria-checked="' + (d === state.duration) + '" class="' + (d === state.duration ? 'is-active' : '') + '" data-duration="' + d + '">' + U.durationLabel(d) + '</button>';
      }).join('');
    }

    function renderSlots() {
      var slots = B.daySlots(state.date, state.court, state.duration);
      if (state.start != null && !slots.some(function (s) { return s.start === state.start && s.free; })) state.start = null;
      var html = '';
      PARTS.forEach(function (part) {
        var items = slots.filter(function (s) { return part.test(s.start); });
        if (!items.length) return;
        html += '<div class="bw-part"><div class="bw-part-h">' + part.name + '</div><div class="bw-part-grid">';
        items.forEach(function (s) {
          var peak = s.tariff === 'evening' || s.tariff === 'weekend';
          html += '<button type="button" class="bw-slot' + (s.free ? '' : ' is-busy') + (s.past ? ' is-past' : '') + (peak ? ' is-peak' : '') + (s.start === state.start ? ' is-active' : '') +
            '" data-start="' + s.start + '"' + (s.free ? '' : ' disabled aria-disabled="true"') + ' aria-pressed="' + (s.start === state.start) + '">' +
            '<span class="bw-slot-t">' + s.label + '</span><span class="bw-slot-p">' + (s.free ? U.money(s.price) : s.past ? 'прошло' : 'занято') + '</span></button>';
        });
        html += '</div></div>';
      });
      if (!slots.some(function (s) { return s.free; })) {
        html = '<div class="bw-empty">На этот день свободного времени на корте нет — выберите другой корт или дату.</div>' + html;
      }
      slotsEl.innerHTML = html;
    }

    function renderExtras() {
      var html = '<legend>Добавить к игре</legend>';
      B.config().extras.forEach(function (x) {
        var on = state.extras.indexOf(x.id) !== -1;
        html += '<label class="bw-extra' + (on ? ' is-on' : '') + '"><input type="checkbox" value="' + x.id + '"' + (on ? ' checked' : '') + '>' +
          '<span class="bw-box" aria-hidden="true"></span><span class="bw-extra-n">' + esc(x.name) + '</span><span class="bw-extra-p">+' + U.money(x.price) + '</span></label>';
      });
      extrasEl.innerHTML = html;
    }

    function renderSummary() {
      var c = B.court(state.court);
      var time = state.start != null ? U.fmtTime(state.start) + '–' + U.fmtTime(state.start + state.duration) : '—';
      dlEl.innerHTML =
        '<div><dt>Корт</dt><dd>' + esc(c.name) + ' · ' + esc(c.title) + '</dd></div>' +
        '<div><dt>Дата</dt><dd>' + U.fmtDate(state.date, { weekday: 'long', day: 'numeric', month: 'long' }) + '</dd></div>' +
        '<div><dt>Время</dt><dd>' + time + '</dd></div>' +
        '<div><dt>Длительность</dt><dd>' + U.durationLabel(state.duration) + '</dd></div>';
      if (state.start != null) {
        totalEl.textContent = U.money(B.priceFor(state.date, state.start, state.duration, state.extras));
        submitEl.disabled = false;
        submitEl.textContent = 'Забронировать';
      } else {
        totalEl.textContent = '—';
        submitEl.disabled = true;
        submitEl.textContent = 'Выберите время';
      }
    }

    function renderAll() {
      renderDates(); renderCourts(); renderDurations(); renderSlots(); renderExtras(); renderSummary();
    }

    function showError(msg) {
      errorEl.textContent = msg || '';
      errorEl.classList.toggle('is-on', !!msg);
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !root.contains(t) || t.disabled) return;
      if (t.dataset.date) { state.date = t.dataset.date; renderDates(); renderCourts(); renderSlots(); renderSummary(); }
      else if (t.dataset.court) { state.court = t.dataset.court; renderCourts(); renderSlots(); renderSummary(); }
      else if (t.dataset.duration) { state.duration = +t.dataset.duration; renderDates(); renderCourts(); renderDurations(); renderSlots(); renderSummary(); }
      else if (t.dataset.start) {
        state.start = +t.dataset.start;
        slotsEl.querySelectorAll('.bw-slot').forEach(function (b) {
          var on = +b.dataset.start === state.start;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on);
        });
        renderSummary();
        showError('');
        if (global.matchMedia('(max-width: 960px)').matches) {
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (t.dataset.scroll) {
        datesEl.scrollBy({ left: +t.dataset.scroll * datesEl.clientWidth * 0.8, behavior: 'smooth' });
      }
    });

    extrasEl.addEventListener('change', function (e) {
      var v = e.target.value;
      if (e.target.checked) state.extras.push(v);
      else state.extras = state.extras.filter(function (x) { return x !== v; });
      e.target.closest('.bw-extra').classList.toggle('is-on', e.target.checked);
      renderSummary();
    });

    var phone = form.elements.phone;
    phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+7 ('; });
    phone.addEventListener('input', function () {
      var digits = phone.value.replace(/\D/g, '');
      phone.value = digits.length <= 1 ? '+7 (' : U.formatPhone(digits);
    });
    phone.addEventListener('blur', function () { if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.start == null) return;
      try {
        var booking = B.create({
          courtId: state.court, date: state.date, start: state.start, duration: state.duration,
          name: form.elements.name.value, phone: phone.value, extras: state.extras.slice(), source: 'online'
        });
        showError('');
        form.reset();
        state.start = null; state.extras = [];
        renderAll();
        success(booking);
      } catch (err) {
        showError(err.message);
        if (err.code === 'name') form.elements.name.focus();
        if (err.code === 'phone') phone.focus();
        if (err.code === 'overlap') { renderSlots(); renderSummary(); }
      }
    });

    function success(b) {
      var c = B.court(b.courtId);
      var ics = URL.createObjectURL(new Blob([B.icsFor(b)], { type: 'text/calendar' }));
      var modal = document.createElement('div');
      modal.className = 'bw-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Бронь создана');
      modal.innerHTML =
        '<div class="bw-modal-card">' +
          '<svg class="bw-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>' +
          '<h3>Корт забронирован!</h3>' +
          '<p class="bw-modal-sub">' + esc(b.name) + ', подтверждение придёт в SMS и Telegram на ' + esc(b.phone) + '</p>' +
          '<div class="bw-ticket">' +
            '<div class="bw-ticket-code"><span>Код брони</span><b>' + b.code + '</b></div>' +
            '<div class="bw-ticket-rows">' +
              '<div><span>Корт</span><b>' + esc(c.name) + '</b></div>' +
              '<div><span>Дата</span><b>' + U.fmtDate(b.date, { day: 'numeric', month: 'long' }) + '</b></div>' +
              '<div><span>Время</span><b>' + U.fmtTime(b.start) + '–' + U.fmtTime(b.start + b.duration) + '</b></div>' +
              '<div><span>Сумма</span><b>' + U.money(b.price) + '</b></div>' +
            '</div>' +
          '</div>' +
          '<div class="bw-modal-actions">' +
            '<a class="bw-btn" href="' + ics + '" download="padel-apsny-' + b.code + '.ics">В календарь</a>' +
            '<a class="bw-btn bw-btn--accent" href="' + opts.adminUrl + '#schedule/' + b.date + '/' + b.id + '" target="_blank" rel="noopener">Открыть в админ-панели ↗</a>' +
          '</div>' +
          '<p class="bw-demo-hint"><b>Демо:</b> бронь уже появилась в админ-панели со статусом «Ожидает». Откройте её в соседней вкладке — она обновляется вживую.</p>' +
          '<button type="button" class="bw-close" aria-label="Закрыть">×</button>' +
        '</div>';
      document.body.appendChild(modal);
      document.documentElement.classList.add('bw-locked');
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
      var close = function () {
        modal.classList.remove('is-open');
        document.documentElement.classList.remove('bw-locked');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () { modal.remove(); URL.revokeObjectURL(ics); }, 400);
      };
      var onKey = function (e) { if (e.key === 'Escape') close(); };
      modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('.bw-close')) close(); });
      document.addEventListener('keydown', onKey);
      modal.querySelector('.bw-close').focus();
    }

    // изменения из админки или другой вкладки — сразу перерисовываем свободные окна
    B.subscribe(function () {
      var before = state.start;
      renderDates(); renderCourts(); renderSlots(); renderSummary();
      if (before != null && state.start == null) showError('Выбранное время только что заняли — выберите другое');
    });

    // кнопки «Забронировать этот корт» в любом месте страницы
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-book-court],[data-book-duration]');
      if (!t) return;
      if (t.dataset.bookCourt) state.court = t.dataset.bookCourt;
      if (t.dataset.bookDuration) state.duration = +t.dataset.bookDuration;
      renderAll();
    });

    renderAll();
    return { root: root, state: state, refresh: renderAll };
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* ---------- живые данные на странице: цены из настроек и ближайшее свободное время ---------- */
  function nextFree() {
    var courts = B.config().courts;
    for (var off = 0; off < 4; off++) {
      var iso = U.addDays(U.todayISO(), off);
      var best = null;
      courts.forEach(function (c) {
        var s = B.daySlots(iso, c.id, 60).filter(function (x) { return x.free; })[0];
        if (s && (!best || s.start < best.start)) best = { start: s.start, court: c, date: iso, off: off };
      });
      if (best) return best;
    }
    return null;
  }
  function bindLive() {
    var cfg = B.config();
    var prices = {};
    cfg.tariffs.forEach(function (t) { prices[t.id] = t.price; });
    prices.weekend = cfg.weekendPrice;
    prices.min = Math.min.apply(null, cfg.tariffs.map(function (t) { return t.price; }));
    var nf = new Intl.NumberFormat('ru-RU');
    document.querySelectorAll('[data-price]').forEach(function (el) {
      var v = prices[el.dataset.price];
      if (v != null) el.textContent = nf.format(v);
    });
    var count = B.freeCount(U.todayISO(), 60);
    document.querySelectorAll('[data-live-count]').forEach(function (el) { el.textContent = count; });
    var n = nextFree();
    var label = n ? (n.off === 0 ? 'сегодня ' : n.off === 1 ? 'завтра ' : U.fmtDate(n.date, { day: 'numeric', month: 'short' }) + ' ') + U.fmtTime(n.start) : '—';
    document.querySelectorAll('[data-live-next]').forEach(function (el) { el.textContent = label; });
    document.querySelectorAll('[data-live-court]').forEach(function (el) { el.textContent = n ? n.court.name : ''; });
  }

  global.PadelWidget = { mount: mount, plural: plural, nextFree: nextFree, bindLive: bindLive };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-booking-widget]').forEach(function (el) {
      mount(el, { adminUrl: el.dataset.adminUrl || '../admin/' });
    });
    bindLive();
    B.subscribe(bindLive);
    setInterval(bindLive, 60000);
  });
})(window);
