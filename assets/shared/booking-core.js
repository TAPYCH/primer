/*!
 * Padel Apsny — booking core
 * Единый слой данных для сайта и админ-панели.
 * В демо-версии хранит брони в localStorage браузера; в продакшене
 * те же методы обращаются к REST API (см. README → «Архитектура»).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'padelApsny.bookings.v2';
  var CONFIG_KEY = 'padelApsny.config.v2';
  var EVENT = 'padel:change';

  var DEFAULT_CONFIG = {
    open: 7 * 60,
    close: 23 * 60,
    step: 30,
    durations: [60, 90, 120],
    courts: [
      { id: 'c1', name: 'Корт 1', title: 'Панорамный', tag: 'Панорама', covered: false, active: true },
      { id: 'c2', name: 'Корт 2', title: 'Панорамный', tag: 'Панорама', covered: false, active: true },
      { id: 'c3', name: 'Корт 3', title: 'Крытый', tag: 'Крытый', covered: true, active: true }
    ],
    tariffs: [
      { id: 'morning', name: 'Утро', from: 7 * 60, to: 12 * 60, price: 2400 },
      { id: 'day', name: 'День', from: 12 * 60, to: 17 * 60, price: 2800 },
      { id: 'evening', name: 'Вечер', from: 17 * 60, to: 23 * 60, price: 3600 }
    ],
    weekendPrice: 3600,
    extras: [
      { id: 'rackets', name: 'Ракетки, 4 шт.', price: 600 },
      { id: 'balls', name: 'Новые мячи', price: 400 },
      { id: 'coach', name: 'Тренер на игру', price: 2000 }
    ]
  };

  var SOURCES = {
    online: { label: 'Онлайн', short: 'Сайт' },
    phone: { label: 'Телефон', short: 'Звонок' },
    walkin: { label: 'На месте', short: 'Ресепшн' }
  };

  var STATUSES = {
    confirmed: 'Подтверждена',
    pending: 'Ожидает',
    completed: 'Завершена',
    cancelled: 'Отменена'
  };

  /* ---------- память с фолбэком, если localStorage недоступен ---------- */
  var memory = {};
  function readKey(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return memory[key] || null; }
  }
  function writeKey(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { memory[key] = value; }
  }

  /* ---------- даты и форматирование ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayISO() { return toISO(new Date()); }
  function addDays(iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function isWeekend(iso) { var w = fromISO(iso).getDay(); return w === 0 || w === 6; }
  function nowMinutes() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function fmtTime(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function parseTime(s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; }

  var fmtCache = {};
  function fmtDate(iso, opts) {
    var key = JSON.stringify(opts || {});
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat('ru-RU', opts || { weekday: 'short', day: 'numeric', month: 'long' });
    return fmtCache[key].format(fromISO(iso));
  }
  var moneyFmt = new Intl.NumberFormat('ru-RU');
  function money(n) { return moneyFmt.format(Math.round(n)) + ' ₽'; }
  function durationLabel(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + ' ч' : '') + (h && m ? ' ' : '') + (m ? m + ' мин' : '');
  }
  function formatPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d && d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  /* ---------- конфигурация (цены и часы можно менять из админки) ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var configCache = null;
  function getConfig() {
    if (configCache) return configCache;
    var cfg = clone(DEFAULT_CONFIG);
    try {
      var saved = JSON.parse(readKey(CONFIG_KEY) || 'null');
      if (saved) {
        ['open', 'close', 'weekendPrice'].forEach(function (k) { if (typeof saved[k] === 'number') cfg[k] = saved[k]; });
        if (saved.tariffs) cfg.tariffs.forEach(function (t) { if (saved.tariffs[t.id]) t.price = saved.tariffs[t.id]; });
        if (saved.courts) cfg.courts.forEach(function (c) { if (saved.courts[c.id] === false) c.active = false; });
      }
    } catch (e) { /* битый конфиг игнорируем */ }
    configCache = cfg;
    return cfg;
  }
  function saveConfig(patch) {
    var cfg = getConfig();
    var saved = {
      open: patch.open != null ? patch.open : cfg.open,
      close: patch.close != null ? patch.close : cfg.close,
      weekendPrice: patch.weekendPrice != null ? patch.weekendPrice : cfg.weekendPrice,
      tariffs: {},
      courts: {}
    };
    cfg.tariffs.forEach(function (t) { saved.tariffs[t.id] = patch.tariffs && patch.tariffs[t.id] != null ? patch.tariffs[t.id] : t.price; });
    cfg.courts.forEach(function (c) { saved.courts[c.id] = patch.courts && patch.courts[c.id] != null ? patch.courts[c.id] : c.active; });
    writeKey(CONFIG_KEY, JSON.stringify(saved));
    configCache = null;
    emit('config');
  }
  function court(id) {
    var list = getConfig().courts;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- цены ---------- */
  function rateAt(iso, minute) {
    var cfg = getConfig();
    if (isWeekend(iso)) return cfg.weekendPrice;
    for (var i = 0; i < cfg.tariffs.length; i++) {
      var t = cfg.tariffs[i];
      if (minute >= t.from && minute < t.to) return t.price;
    }
    return cfg.tariffs[cfg.tariffs.length - 1].price;
  }
  function tariffAt(iso, minute) {
    var cfg = getConfig();
    if (isWeekend(iso)) return { id: 'weekend', name: 'Выходные' };
    for (var i = 0; i < cfg.tariffs.length; i++) {
      var t = cfg.tariffs[i];
      if (minute >= t.from && minute < t.to) return t;
    }
    return cfg.tariffs[cfg.tariffs.length - 1];
  }
  function priceFor(iso, start, duration, extras) {
    var step = 30, total = 0;
    for (var m = start; m < start + duration; m += step) total += rateAt(iso, m) * step / 60;
    (extras || []).forEach(function (id) {
      getConfig().extras.forEach(function (x) { if (x.id === id) total += x.price; });
    });
    return total;
  }

  /* ---------- детерминированные демо-данные ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var NAMES = ['Астамур Агрба', 'Инал Квициния', 'Саида Ажиба', 'Амра Гумба', 'Тимур Цвейба', 'Мадина Ашуба',
    'Адгур Барциц', 'Нарт Хагба', 'Леван Бигвава', 'Сария Тарба', 'Даур Зухба', 'Анна Соколова',
    'Дмитрий Орлов', 'Георгий Чанба', 'Алиас Отырба', 'Екатерина Миронова', 'Беслан Кварчия', 'Лана Гагулия',
    'Рустам Джопуа', 'Ольга Белова', 'Астанда Шамба', 'Виктория Лапина', 'Мурат Аршба', 'Эсма Кецба'];
  var COMMENTS = ['', '', '', 'Первый раз, нужен инструктаж', 'Нужны ракетки', 'Играем 2×2, уровень C', 'Корпоратив, 4 человека', 'Просит корт ближе к парковке', ''];
  var CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeCode(rand) {
    var s = 'PA-';
    for (var i = 0; i < 4; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)];
    return s;
  }
  function phoneFor(name) {
    var r = rng(hash(name));
    var n = '7940' + (7 + Math.floor(r() * 2)) + String(Math.floor(r() * 1e6)).padStart(6, '0');
    return formatPhone(n);
  }

  function seed() {
    var cfg = getConfig();
    var today = todayISO();
    var list = [];
    for (var off = -13; off <= 9; off++) {
      var iso = addDays(today, off);
      var weekend = isWeekend(iso);
      cfg.courts.forEach(function (c) {
        var rand = rng(hash(iso + c.id));
        var t = cfg.open;
        while (t < cfg.close - 60) {
          var p = t < 12 * 60 ? 0.22 : t < 17 * 60 ? 0.28 : 0.5;
          if (weekend) p += 0.12;
          if (c.covered) p += 0.04;
          if (off > 0) p *= Math.max(0.25, 1 - off * 0.11);
          if (rand() < p) {
            var r = rand();
            var dur = r < 0.45 ? 60 : r < 0.87 ? 90 : 120;
            if (t + dur > cfg.close) dur = cfg.close - t;
            var name = NAMES[Math.floor(rand() * NAMES.length)];
            var sr = rand();
            var source = sr < 0.56 ? 'online' : sr < 0.86 ? 'phone' : 'walkin';
            var extras = [];
            if (rand() < 0.3) extras.push('rackets');
            if (rand() < 0.2) extras.push('balls');
            if (rand() < 0.08) extras.push('coach');
            var past = off < 0 || (off === 0 && t + dur <= nowMinutes());
            var status = past ? 'completed' : (source === 'online' && rand() < 0.18 ? 'pending' : 'confirmed');
            if (rand() < 0.05) status = 'cancelled';
            var paid = past || status === 'cancelled' ? (status === 'cancelled' ? 'unpaid' : 'paid')
              : source === 'online' ? (rand() < 0.6 ? 'paid' : 'unpaid')
              : (rand() < 0.2 ? 'paid' : 'unpaid');
            var created = fromISO(iso);
            created.setDate(created.getDate() - (1 + Math.floor(rand() * 5)));
            created.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60));
            list.push({
              id: 'b' + hash(iso + c.id + t).toString(36),
              code: makeCode(rand),
              courtId: c.id,
              date: iso,
              start: t,
              duration: dur,
              name: name,
              phone: phoneFor(name),
              players: rand() < 0.8 ? 4 : 2,
              extras: extras,
              price: priceFor(iso, t, dur, extras),
              source: source,
              status: status,
              paid: paid,
              comment: COMMENTS[Math.floor(rand() * COMMENTS.length)],
              createdAt: created.toISOString(),
              demo: true
            });
            t += dur + (rand() < 0.5 ? 0 : 30);
          } else {
            t += 30;
          }
        }
      });
    }
    return list;
  }

  /* ---------- хранилище ---------- */
  var cache = null;
  function all() {
    if (cache) return cache;
    var raw = readKey(STORAGE_KEY);
    var data = null;
    try { data = JSON.parse(raw || 'null'); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.items)) {
      data = { seededFor: todayISO(), items: seed() };
      writeKey(STORAGE_KEY, JSON.stringify(data));
    } else if (data.seededFor !== todayISO()) {
      // демо «живёт» относительно сегодняшнего дня: обновляем сгенерированные брони, пользовательские сохраняем
      var mine = data.items.filter(function (b) { return !b.demo && b.date >= addDays(todayISO(), -13); });
      data = { seededFor: todayISO(), items: seed().filter(function (s) {
        return !mine.some(function (m) { return m.status !== 'cancelled' && overlaps(m, s); });
      }).concat(mine) };
      writeKey(STORAGE_KEY, JSON.stringify(data));
    }
    cache = data.items;
    return cache;
  }
  function persist() {
    writeKey(STORAGE_KEY, JSON.stringify({ seededFor: todayISO(), items: cache }));
    emit('bookings');
  }
  function overlaps(a, b) {
    return a.courtId === b.courtId && a.date === b.date && a.start < b.start + b.duration && b.start < a.start + a.duration;
  }

  function list(filter) {
    filter = filter || {};
    return all().filter(function (b) {
      if (filter.date && b.date !== filter.date) return false;
      if (filter.from && b.date < filter.from) return false;
      if (filter.to && b.date > filter.to) return false;
      if (filter.courtId && b.courtId !== filter.courtId) return false;
      if (filter.active && b.status === 'cancelled') return false;
      return true;
    }).sort(function (a, b) { return a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1; });
  }
  function get(id) {
    var items = all();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function isFree(courtId, date, start, duration, ignoreId) {
    var probe = { courtId: courtId, date: date, start: start, duration: duration };
    return !all().some(function (b) { return b.id !== ignoreId && b.status !== 'cancelled' && overlaps(b, probe); });
  }

  function daySlots(date, courtId, duration) {
    var cfg = getConfig();
    var c = court(courtId);
    var past = date < todayISO();
    var now = date === todayISO() ? nowMinutes() : -1;
    var out = [];
    for (var t = cfg.open; t + duration <= cfg.close; t += cfg.step) {
      var gone = past || t <= now;
      var free = !gone && c && c.active && isFree(courtId, date, t, duration);
      out.push({ start: t, end: t + duration, label: fmtTime(t), free: free, past: gone, price: priceFor(date, t, duration), tariff: tariffAt(date, t).id });
    }
    return out;
  }
  function freeCount(date, duration) {
    var n = 0;
    getConfig().courts.forEach(function (c) {
      daySlots(date, c.id, duration || 60).forEach(function (s) { if (s.free) n++; });
    });
    return n;
  }

  function validationError(message, code) { var e = new Error(message); e.code = code; return e; }

  function create(data) {
    var cfg = getConfig();
    var start = typeof data.start === 'string' ? parseTime(data.start) : data.start;
    var duration = +data.duration;
    if (!court(data.courtId)) throw validationError('Выберите корт', 'court');
    if (!data.date) throw validationError('Выберите дату', 'date');
    if (isNaN(start) || start < cfg.open || start + duration > cfg.close) throw validationError('Время вне часов работы клуба', 'time');
    if (!data.name || String(data.name).trim().length < 2) throw validationError('Укажите имя', 'name');
    if (String(data.phone || '').replace(/\D/g, '').length < 11) throw validationError('Укажите телефон полностью', 'phone');
    if (!isFree(data.courtId, data.date, start, duration)) throw validationError('Это время только что заняли — выберите другое', 'overlap');

    var rand = rng(hash(data.phone + Date.now()));
    var b = {
      id: 'u' + Date.now().toString(36) + Math.floor(rand() * 1e4).toString(36),
      code: makeCode(rand),
      courtId: data.courtId,
      date: data.date,
      start: start,
      duration: duration,
      name: String(data.name).trim(),
      phone: formatPhone(data.phone),
      players: +data.players || 4,
      extras: data.extras || [],
      price: data.price != null ? +data.price : priceFor(data.date, start, duration, data.extras),
      source: data.source || 'online',
      status: data.status || (data.source === 'online' || !data.source ? 'pending' : 'confirmed'),
      paid: data.paid || 'unpaid',
      comment: data.comment || '',
      createdAt: new Date().toISOString(),
      demo: false
    };
    all().push(b);
    persist();
    return b;
  }

  function update(id, patch) {
    var b = get(id);
    if (!b) throw validationError('Бронь не найдена', 'missing');
    var next = Object.assign({}, b, patch);
    if (typeof next.start === 'string') next.start = parseTime(next.start);
    next.duration = +next.duration;
    var moved = next.courtId !== b.courtId || next.date !== b.date || next.start !== b.start || next.duration !== b.duration;
    if (moved && next.status !== 'cancelled' && !isFree(next.courtId, next.date, next.start, next.duration, id)) {
      throw validationError('На это время корт уже занят', 'overlap');
    }
    if (moved && patch.price == null) next.price = priceFor(next.date, next.start, next.duration, next.extras);
    Object.assign(b, next);
    persist();
    return b;
  }

  function remove(id) {
    cache = all().filter(function (b) { return b.id !== id; });
    persist();
  }

  function reset() {
    writeKey(STORAGE_KEY, '');
    writeKey(CONFIG_KEY, '');
    cache = null; configCache = null;
    all();
    emit('reset');
  }

  /* ---------- подписка на изменения (в том числе из соседних вкладок) ---------- */
  var listeners = [];
  function emit(type) {
    var detail = { type: type, external: false };
    listeners.forEach(function (fn) { try { fn(detail); } catch (e) { console.error(e); } });
  }
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  global.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY && e.key !== CONFIG_KEY) return;
    var before = cache ? cache.map(function (b) { return b.id; }) : [];
    cache = null; configCache = null;
    var added = all().filter(function (b) { return before.indexOf(b.id) === -1; });
    var detail = { type: e.key === CONFIG_KEY ? 'config' : 'bookings', external: true, added: added };
    listeners.forEach(function (fn) { try { fn(detail); } catch (err) { console.error(err); } });
  });

  /* ---------- экспорт в календарь ---------- */
  function icsFor(b) {
    var c = court(b.courtId);
    var d = b.date.replace(/-/g, '');
    function t(min) { return pad(Math.floor(min / 60)) + pad(min % 60) + '00'; }
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Padel Apsny//Booking//RU', 'BEGIN:VEVENT',
      'UID:' + b.id + '@padel-apsny',
      'DTSTART:' + d + 'T' + t(b.start),
      'DTEND:' + d + 'T' + t(b.start + b.duration),
      'SUMMARY:Падел · ' + (c ? c.name : '') + ' · Padel Apsny',
      'LOCATION:Padel Apsny\\, Сухум',
      'DESCRIPTION:Бронь ' + b.code,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }

  global.PadelBooking = {
    config: getConfig,
    saveConfig: saveConfig,
    court: court,
    sources: SOURCES,
    statuses: STATUSES,
    all: all,
    list: list,
    get: get,
    create: create,
    update: update,
    remove: remove,
    reset: reset,
    isFree: isFree,
    daySlots: daySlots,
    freeCount: freeCount,
    priceFor: priceFor,
    rateAt: rateAt,
    tariffAt: tariffAt,
    subscribe: subscribe,
    icsFor: icsFor,
    util: {
      toISO: toISO, fromISO: fromISO, todayISO: todayISO, addDays: addDays, isWeekend: isWeekend,
      fmtTime: fmtTime, parseTime: parseTime, fmtDate: fmtDate, money: money, durationLabel: durationLabel,
      formatPhone: formatPhone, nowMinutes: nowMinutes
    }
  };
})(window);
