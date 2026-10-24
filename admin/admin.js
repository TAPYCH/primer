/*!
 * Padel Apsny — админ-панель (демо).
 * Работает с тем же слоем данных PadelBooking, что и сайт: брони, сделанные на сайте,
 * появляются здесь мгновенно (в том числе из соседней вкладки), а офлайн-брони сразу
 * закрывают время в онлайн-виджете.
 */
(() => {
  'use strict';

  const B = window.PadelBooking;
  const U = B.util;
  const ROW = 30;                       // px на 30 минут, синхронно с --row в CSS
  const AUTH_KEY = 'padelApsny.admin.auth';
  const SEEN_KEY = 'padelApsny.admin.seen';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const nf = new Intl.NumberFormat('ru-RU');
  const shot = /[?&]shot\b/.test(location.search);

  const SRC_ICON = { online: 'i-globe', phone: 'i-phone', walkin: 'i-walk' };
  const STATUS_LABEL = B.statuses;
  const SRC_LABEL = { online: 'Онлайн', phone: 'Телефон', walkin: 'На месте' };
  const SRC_COLOR = { online: '#2a78d6', phone: '#eb6834', walkin: '#1baf7a' };
  const HEAT = ['#f1f5fb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

  const state = {
    view: 'schedule',
    date: U.todayISO(),
    showCancelled: false,
    scrolledFor: null,
    bkPeriod: 'today',
    bkSource: '',
    bkStatus: '',
    search: '',
    anDays: 7,
    editingId: null,
    form: { duration: 90, source: 'phone', paid: 'unpaid' }
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const initials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  const timeRange = (b) => `${U.fmtTime(b.start)}–${U.fmtTime(b.start + b.duration)}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } }
  };

  /* ================= ВХОД ================= */
  let memAuth = false;
  const isAuthed = () => { try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return memAuth; } };
  const setAuthed = (v) => { memAuth = v; try { v ? sessionStorage.setItem(AUTH_KEY, '1') : sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* память вкладки */ } };

  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    route();
    updateBell();
  }
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.login.value.trim().toLowerCase() === 'admin' && f.password.value === 'demo') {
      setAuthed(true);
      showApp();
    } else {
      $('#loginError').textContent = 'Неверный логин или пароль. Для демо: admin / demo';
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-logout]')) { setAuthed(false); location.hash = ''; location.reload(); }
  });

  /* ================= НАВИГАЦИЯ ================= */
  function route() {
    const [view, date, id] = (location.hash.replace(/^#/, '') || 'schedule').split('/');
    const known = ['schedule', 'bookings', 'clients', 'analytics', 'settings'];
    state.view = known.includes(view) ? view : 'schedule';
    if (state.view === 'schedule' && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) state.date = date;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + state.view; });
    $$('[data-view]').forEach((a) => a.classList.toggle('is-active', a.dataset.view === state.view));
    $('#viewTitle').textContent = $('#view-' + state.view).dataset.title;
    render();
    if (id) {
      const b = B.get(id);
      if (b) setTimeout(() => { openDrawer(id); flashBooking(id); }, 250);
    }
  }
  addEventListener('hashchange', () => { if (isAuthed() || shot) route(); });

  function render() {
    updatePendingBadge();
    if (state.view === 'schedule') renderSchedule();
    if (state.view === 'bookings') renderBookings();
    if (state.view === 'clients') renderClients();
    if (state.view === 'analytics') renderAnalytics();
    if (state.view === 'settings') renderSettings();
  }

  function updatePendingBadge() {
    const n = B.all().filter((b) => b.status === 'pending' && b.date >= U.todayISO()).length;
    const el = $('[data-pending-count]');
    el.hidden = !n;
    el.textContent = n;
  }

  /* ================= РАСПИСАНИЕ ================= */
  function dayStats(date) {
    const cfg = B.config();
    const list = B.list({ date }).filter((b) => b.status !== 'cancelled');
    const capacity = cfg.courts.filter((c) => c.active).length * (cfg.close - cfg.open);
    const minutes = list.reduce((s, b) => s + b.duration, 0);
    return {
      count: list.length,
      load: capacity ? Math.round(minutes / capacity * 100) : 0,
      revenue: list.reduce((s, b) => s + b.price, 0),
      online: list.filter((b) => b.source === 'online').length,
      pending: list.filter((b) => b.status === 'pending').length,
      paid: list.filter((b) => b.paid === 'paid').reduce((s, b) => s + b.price, 0)
    };
  }

  function renderSchedule() {
    const cfg = B.config();
    const date = state.date;
    const today = U.todayISO();
    const now = U.nowMinutes();
    const st = dayStats(date);

    const label = U.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#dayLabel').textContent = label.charAt(0).toUpperCase() + label.slice(1);
    $('#dayInput').value = date;
    $('#dayKpis').innerHTML = `
      <div class="kpi"><span>Броней</span><b>${st.count}</b><small>${st.online} онлайн · ${st.count - st.online} офлайн</small></div>
      <div class="kpi"><span>Загрузка кортов</span><b>${st.load}%</b><div class="meter"><i style="width:${Math.min(100, st.load)}%"></i></div></div>
      <div class="kpi"><span>Выручка дня</span><b>${U.money(st.revenue)}</b><small>оплачено ${U.money(st.paid)}</small></div>
      <div class="kpi"><span>Ждут подтверждения</span><b>${st.pending}</b><small class="${st.pending ? 'is-warn' : ''}">${st.pending ? 'новые онлайн-брони' : 'всё подтверждено'}</small></div>`;

    const rows = (cfg.close - cfg.open) / 30;
    const all = B.list({ date });
    let head = '<div class="sched-head"><div class="sh-time"></div>';
    let body = '<div class="sched-body"><div class="sb-times">';
    for (let i = 0; i < rows; i++) {
      const t = cfg.open + i * 30;
      body += `<div class="sb-time${t % 60 ? ' is-half' : ''}">${U.fmtTime(t)}</div>`;
    }
    body += '</div>';
    cfg.courts.forEach((c) => {
      const items = all.filter((b) => b.courtId === c.id && (state.showCancelled || b.status !== 'cancelled'));
      const active = items.filter((b) => b.status !== 'cancelled').length;
      head += `<div class="sh-court${c.active ? '' : ' is-off'}"><b>${esc(c.name)}</b><small>${esc(c.title)} · ${c.active ? active + ' ' + plural(active, 'бронь', 'брони', 'броней') : 'на обслуживании'}</small></div>`;
      body += `<div class="sb-col${c.active ? '' : ' is-off'}" data-court="${c.id}">`;
      for (let i = 0; i < rows; i++) {
        const t = cfg.open + i * 30;
        const past = date < today || (date === today && t + 30 <= now);
        body += `<button type="button" class="sb-cell${t % 60 ? '' : ' is-hour'}${past ? ' is-past' : ''}" data-start="${t}"${past ? ' disabled tabindex="-1"' : ''} aria-label="${esc(c.name)}, ${U.fmtTime(t)}: создать бронь">+ ${U.fmtTime(t)}</button>`;
      }
      items.forEach((b) => {
        const top = (b.start - cfg.open) / 30 * ROW + 2;
        const h = b.duration / 30 * ROW - 4;
        body += `<button type="button" class="bk bk--${b.source} bk--${b.status}" data-id="${b.id}" style="top:${top}px;height:${h}px" aria-label="${esc(b.name)}, ${timeRange(b)}, ${SRC_LABEL[b.source]}, ${STATUS_LABEL[b.status]}">
          <span class="bk-time">${timeRange(b)}${b.paid === 'paid' ? icon('i-check') : ''}</span>
          <span class="bk-name">${esc(b.name)}</span>
          ${h > 50 ? `<span class="bk-meta">${icon(SRC_ICON[b.source])}${SRC_LABEL[b.source]}${b.status === 'pending' ? ' · ждёт' : b.status === 'cancelled' ? ' · отменена' : ''}</span>` : ''}
        </button>`;
      });
      body += '</div>';
    });
    if (date === today && now >= cfg.open && now < cfg.close) {
      body += `<div class="now-line" style="top:${(now - cfg.open) / 30 * ROW}px" data-time="${U.fmtTime(now)}"></div>`;
    }
    body += '</div>';
    head += '</div>';
    const sched = $('#sched');
    sched.style.setProperty('--cols', cfg.courts.length);
    sched.innerHTML = head + body;

    if (state.scrolledFor !== date) {
      state.scrolledFor = date;
      const scroller = $('.sched-scroll');
      const target = date === today ? Math.max(0, (now - cfg.open) / 30 * ROW - 120) : (17 * 60 - cfg.open) / 30 * ROW - 160;
      requestAnimationFrame(() => { scroller.scrollTop = Math.max(0, target); });
    }
  }

  function flashBooking(id) {
    const el = $(`.bk[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('bk--flash');
    setTimeout(() => el.classList.remove('bk--flash'), 3800);
  }

  $('#view-schedule').addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) {
      const d = +day.dataset.day;
      setDate(d === 0 ? U.todayISO() : U.addDays(state.date, d));
      return;
    }
    const bk = e.target.closest('.bk');
    if (bk) { openDrawer(bk.dataset.id); return; }
    const cell = e.target.closest('.sb-cell');
    if (cell && !cell.disabled) {
      openForm({ courtId: cell.closest('.sb-col').dataset.court, date: state.date, start: +cell.dataset.start });
    }
  });
  $('#dayInput').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
  $('#showCancelled').addEventListener('change', (e) => { state.showCancelled = e.target.checked; renderSchedule(); });
  function setDate(iso) {
    state.date = iso;
    history.replaceState(null, '', '#schedule/' + iso);
    renderSchedule();
  }

  /* ================= СПИСОК БРОНЕЙ ================= */
  function filteredBookings() {
    const today = U.todayISO();
    let list = B.all().slice();
    if (state.bkPeriod === 'today') list = list.filter((b) => b.date === today);
    if (state.bkPeriod === 'upcoming') list = list.filter((b) => b.date >= today && (b.status === 'pending' || b.status === 'confirmed'));
    if (state.bkPeriod === 'week') list = list.filter((b) => b.date >= U.addDays(today, -6) && b.date <= today);
    if (state.bkSource) list = list.filter((b) => b.source === state.bkSource);
    if (state.bkStatus) list = list.filter((b) => b.status === state.bkStatus);
    if (state.search) {
      const q = state.search.toLowerCase();
      const digits = q.replace(/\D/g, '');
      list = list.filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (digits.length >= 3 && b.phone.replace(/\D/g, '').includes(digits)));
    }
    const desc = state.bkPeriod === 'all' || state.bkPeriod === 'week';
    return list.sort((a, b) => {
      const k = a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1;
      return desc ? -k : k;
    });
  }

  function renderBookings() {
    const list = filteredBookings();
    const rows = list.slice(0, 300).map((b) => `
      <tr data-id="${b.id}">
        <td data-k="code" class="code">${b.code}</td>
        <td data-k="when">${U.fmtDate(b.date, { day: 'numeric', month: 'short' })}, ${timeRange(b)}<span class="sub">${U.fmtDate(b.date, { weekday: 'long' })}</span></td>
        <td data-k="court">${esc(B.court(b.courtId).name)}</td>
        <td data-k="client"><b>${esc(b.name)}</b><span class="sub">${esc(b.phone)}</span></td>
        <td data-k="src"><span class="src src--${b.source}"><i></i>${SRC_LABEL[b.source]}</span></td>
        <td data-k="status">${statusBadge(b)}</td>
        <td data-k="paid">${paidBadge(b)}</td>
        <td data-k="sum" class="num">${U.money(b.price)}</td>
      </tr>`).join('');
    $('#bkTable tbody').innerHTML = rows;
    $('#bkEmpty').hidden = list.length > 0;
    const sum = list.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.price, 0);
    $('#bkCount').textContent = `${list.length} ${plural(list.length, 'бронь', 'брони', 'броней')} · ${U.money(sum)}${state.search ? ` · поиск «${state.search}»` : ''}`;
  }
  const statusBadge = (b) => {
    const ico = b.status === 'pending' ? icon('i-clock') : b.status === 'confirmed' ? icon('i-check') : b.status === 'cancelled' ? icon('i-x') : '';
    return `<span class="badge badge--${b.status}">${ico}${STATUS_LABEL[b.status]}</span>`;
  };
  const paidBadge = (b) => b.paid === 'paid' ? `<span class="badge badge--paid">${icon('i-check')}Оплачено</span>` : '<span class="badge badge--unpaid">Не оплачено</span>';

  $('#bkPeriod').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $$('#bkPeriod button').forEach((b) => b.classList.toggle('is-active', b === btn));
    state.bkPeriod = btn.dataset.period;
    renderBookings();
  });
  $('#bkSource').addEventListener('change', (e) => { state.bkSource = e.target.value; renderBookings(); });
  $('#bkStatus').addEventListener('change', (e) => { state.bkStatus = e.target.value; renderBookings(); });
  $('#bkTable').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(tr.dataset.id); });

  let searchTimer = 0;
  $('#globalSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      if (state.search && state.view !== 'bookings') {
        state.bkPeriod = 'all';
        $$('#bkPeriod button').forEach((b) => b.classList.toggle('is-active', b.dataset.period === 'all'));
        location.hash = 'bookings';
      } else renderBookings();
    }, 180);
  });

  /* ================= КЛИЕНТЫ ================= */
  function clientsList() {
    const today = U.todayISO();
    const map = new Map();
    B.all().forEach((b) => {
      if (b.status === 'cancelled') return;
      const key = b.phone.replace(/\D/g, '');
      const c = map.get(key) || { name: b.name, phone: b.phone, games: 0, spent: 0, last: null, next: null, courts: {}, firstDate: b.date };
      c.games++;
      if (b.date <= today) { c.spent += b.price; if (!c.last || b.date > c.last) c.last = b.date; }
      else if (!c.next || b.date < c.next) c.next = b.date;
      if (b.date < c.firstDate) c.firstDate = b.date;
      c.courts[b.courtId] = (c.courts[b.courtId] || 0) + 1;
      if (!b.demo) c.name = b.name;
      map.set(key, c);
    });
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }
  function renderClients() {
    const list = clientsList();
    const weekAgo = U.addDays(U.todayISO(), -6);
    const regular = list.filter((c) => c.games >= 4).length;
    const fresh = list.filter((c) => c.firstDate >= weekAgo).length;
    const avg = list.length ? (list.reduce((s, c) => s + c.games, 0) / list.length) : 0;
    $('#clientKpis').innerHTML = `
      <div class="kpi"><span>Клиентов в базе</span><b>${list.length}</b><small>за последние 3 недели</small></div>
      <div class="kpi"><span>Постоянные</span><b>${regular}</b><small>4 и более игр</small></div>
      <div class="kpi"><span>Новые за неделю</span><b>${fresh}</b><small>первая игра в клубе</small></div>
      <div class="kpi"><span>Игр на клиента</span><b>${avg.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</b><small>в среднем</small></div>`;
    $('#clTable tbody').innerHTML = list.map((c) => {
      const fav = Object.entries(c.courts).sort((a, b) => b[1] - a[1])[0][0];
      const seg = c.games >= 8 ? '<span class="seg-badge seg-badge--vip">VIP</span>' : c.games >= 4 ? '<span class="seg-badge seg-badge--reg">Постоянный</span>' : '<span class="seg-badge">Новый</span>';
      return `<tr data-phone="${esc(c.phone)}">
        <td data-k="client"><b>${esc(c.name)}</b></td>
        <td data-k="phone">${esc(c.phone)}</td>
        <td data-k="games" class="num">${c.games}</td>
        <td data-k="sum" class="num">${U.money(c.spent)}</td>
        <td data-k="when">${c.last ? U.fmtDate(c.last, { day: 'numeric', month: 'short' }) : '—'}${c.next ? `<span class="sub">следующая: ${U.fmtDate(c.next, { day: 'numeric', month: 'short' })}</span>` : ''}</td>
        <td data-k="court">${esc(B.court(fav).name)}</td>
        <td data-k="seg">${seg}</td>
      </tr>`;
    }).join('');
  }
  $('#clTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-phone]');
    if (!tr) return;
    $('#globalSearch').value = tr.dataset.phone;
    state.search = tr.dataset.phone;
    state.bkPeriod = 'all';
    $$('#bkPeriod button').forEach((b) => b.classList.toggle('is-active', b.dataset.period === 'all'));
    location.hash = 'bookings';
  });

  /* ================= АНАЛИТИКА ================= */
  function renderAnalytics() {
    const cfg = B.config();
    const days = state.anDays;
    const today = U.todayISO();
    const from = U.addDays(today, -(days - 1));
    const list = B.list({ from, to: today }).filter((b) => b.status !== 'cancelled');
    const total = list.reduce((s, b) => s + b.price, 0);
    const minutes = list.reduce((s, b) => s + b.duration, 0);
    const capacity = cfg.courts.length * (cfg.close - cfg.open) * days;
    const online = list.filter((b) => b.source === 'online').length;

    $('#anKpis').innerHTML = `
      <div class="kpi"><span>Выручка</span><b>${U.money(total)}</b><small>за ${days} ${plural(days, 'день', 'дня', 'дней')}</small></div>
      <div class="kpi"><span>Броней</span><b>${list.length}</b><small>${(list.length / days).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} в день</small></div>
      <div class="kpi"><span>Средний чек</span><b>${U.money(list.length ? total / list.length : 0)}</b><small>за одну бронь</small></div>
      <div class="kpi"><span>Загрузка кортов</span><b>${capacity ? Math.round(minutes / capacity * 100) : 0}%</b><div class="meter"><i style="width:${capacity ? Math.min(100, minutes / capacity * 100) : 0}%"></i></div></div>
      <div class="kpi"><span>Доля онлайн</span><b>${list.length ? Math.round(online / list.length * 100) : 0}%</b><small>без звонка администратору</small></div>`;

    // выручка по дням
    const daysArr = [];
    for (let i = 0; i < days; i++) {
      const iso = U.addDays(from, i);
      const items = list.filter((b) => b.date === iso);
      daysArr.push({ iso, sum: items.reduce((s, b) => s + b.price, 0), count: items.length, online: items.filter((b) => b.source === 'online').length });
    }
    const max = Math.max(1, ...daysArr.map((d) => d.sum));
    const step = niceStep(max / 4);
    const top = step * Math.ceil(max / step);
    let axis = '', grid = '';
    for (let v = 0; v <= top; v += step) {
      const p = v / top * 100;
      axis += `<span style="bottom:${p}%">${v >= 1000 ? nf.format(v / 1000) + 'к' : v}</span>`;
      if (v > 0) grid += `<i class="bars-grid" style="bottom:${p}%"></i>`;
    }
    $('#revChart').innerHTML = `<div class="bars-axis">${axis}</div><div class="bars-plot">${grid}${daysArr.map((d) => `
      <div class="bar-col${d.iso === today ? ' is-today' : ''}${U.isWeekend(d.iso) ? ' is-weekend' : ''}" tabindex="0"
           data-tip="${esc(U.fmtDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short' }))}|${U.money(d.sum)}|${d.count} ${plural(d.count, 'бронь', 'брони', 'броней')}">
        <div class="bar" style="height:${d.sum / top * 100}%"></div>
        <span class="bar-lbl">${days > 7 ? U.fromISO(d.iso).getDate() : U.fmtDate(d.iso, { weekday: 'short', day: 'numeric' })}</span>
      </div>`).join('')}</div>`;
    $('#revChart').classList.add('bars-wrap');
    $('#revSub').textContent = 'итого ' + U.money(total);
    $('#revTable').innerHTML = '<thead><tr><th>День</th><th class="num">Броней</th><th class="num">Онлайн</th><th class="num">Выручка</th></tr></thead><tbody>' +
      daysArr.map((d) => `<tr><td>${U.fmtDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td class="num">${d.count}</td><td class="num">${d.online}</td><td class="num">${U.money(d.sum)}</td></tr>`).join('') + '</tbody>';

    // каналы
    const chans = ['online', 'phone', 'walkin'].map((k) => ({ k, n: list.filter((b) => b.source === k).length }));
    const n = Math.max(1, list.length);
    $('#chanChart').innerHTML = chans.map((c) => `<i style="flex:${c.n};background:${SRC_COLOR[c.k]}" data-tip="${SRC_LABEL[c.k]}|${Math.round(c.n / n * 100)}%|${c.n} ${plural(c.n, 'бронь', 'брони', 'броней')}"></i>`).join('');
    $('#chanLegend').innerHTML = chans.map((c) => `<li><i style="background:${SRC_COLOR[c.k]}"></i><span>${SRC_LABEL[c.k]}</span><b>${c.n}</b><span class="pct">${Math.round(c.n / n * 100)}%</span></li>`).join('');

    // корты
    const courts = cfg.courts.map((c) => ({ c, sum: list.filter((b) => b.courtId === c.id).reduce((s, b) => s + b.price, 0) }));
    const cmax = Math.max(1, ...courts.map((x) => x.sum));
    $('#courtChart').innerHTML = courts.map((x) => `<div class="hbar"><span>${esc(x.c.name)}</span><div class="hbar-track"><i style="width:${x.sum / cmax * 100}%"></i></div><b>${U.money(x.sum)}</b></div>`).join('');

    // тепловая карта: день недели × час
    const hours = [];
    for (let h = cfg.open; h < cfg.close; h += 60) hours.push(h);
    const occ = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < days; i++) occ[(U.fromISO(U.addDays(from, i)).getDay() + 6) % 7]++;
    const grid2 = Array.from({ length: 7 }, () => hours.map(() => 0));
    list.forEach((b) => {
      const wd = (U.fromISO(b.date).getDay() + 6) % 7;
      hours.forEach((h, hi) => {
        const overlap = Math.max(0, Math.min(b.start + b.duration, h + 60) - Math.max(b.start, h));
        grid2[wd][hi] += overlap;
      });
    });
    const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    let heat = '<span></span>' + hours.map((h) => `<span class="hh">${h / 60}</span>`).join('');
    WD.forEach((name, wd) => {
      heat += `<span class="hd">${name}</span>`;
      hours.forEach((h, hi) => {
        const cap = cfg.courts.length * 60 * (occ[wd] || 1);
        const v = occ[wd] ? grid2[wd][hi] / cap : 0;
        const idx = v <= 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor(v * (HEAT.length - 1)));
        heat += `<span class="hc" tabindex="0" style="--v:${HEAT[idx]}" data-tip="${name}, ${U.fmtTime(h)}–${U.fmtTime(h + 60)}|${Math.round(v * 100)}%|занято кортов"></span>`;
      });
    });
    $('#heatChart').innerHTML = heat;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  $('#anPeriod').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $$('#anPeriod button').forEach((b) => b.classList.toggle('is-active', b === btn));
    state.anDays = +btn.dataset.days;
    renderAnalytics();
  });

  // общий тултип для графиков (мышь и клавиатура)
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(el) {
    const [title, value, sub] = el.dataset.tip.split('|');
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = value;
    const s1 = document.createElement('span'); s1.textContent = title;
    tip.append(b, s1);
    if (sub) { const s2 = document.createElement('div'); s2.textContent = sub; s2.style.color = '#cbd5e1'; tip.append(s2); }
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(innerWidth - 90, Math.max(90, r.left + r.width / 2)) + 'px';
    tip.style.top = r.top + 'px';
    tip.hidden = false;
  }
  document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
  addEventListener('scroll', () => { tip.hidden = true; }, { passive: true, capture: true });

  /* ================= НАСТРОЙКИ ================= */
  function renderSettings() {
    const cfg = B.config();
    const f = $('#settingsForm');
    cfg.tariffs.forEach((t) => { f.elements[t.id].value = t.price; });
    f.elements.weekend.value = cfg.weekendPrice;
    $('#courtToggles').innerHTML = cfg.courts.map((c) => `
      <label class="court-toggle"><div><b>${esc(c.name)}</b><small>${esc(c.title)}</small></div>
      <span class="toggle"><input type="checkbox" name="court-${c.id}"${c.active ? ' checked' : ''}><span></span></span></label>`).join('');
  }
  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const cfg = B.config();
    const tariffs = {};
    cfg.tariffs.forEach((t) => { tariffs[t.id] = Math.max(0, +f.elements[t.id].value || t.price); });
    const courts = {};
    cfg.courts.forEach((c) => { courts[c.id] = f.elements['court-' + c.id].checked; });
    B.saveConfig({ tariffs, weekendPrice: Math.max(0, +f.elements.weekend.value || cfg.weekendPrice), courts });
    toast({ title: 'Настройки сохранены', text: 'Сайт уже показывает новые цены и доступные корты.' });
    render();
  });
  $('#resetDemo').addEventListener('click', () => {
    if (!confirm('Сбросить все демо-брони и настройки к исходным?')) return;
    B.reset();
    toast({ title: 'Демо-данные сброшены', text: 'Расписание заполнено заново.' });
    state.scrolledFor = null;
    render();
  });

  /* ================= КАРТОЧКА БРОНИ ================= */
  let drawerId = null;
  function openDrawer(id) {
    const b = B.get(id);
    if (!b) return;
    drawerId = id;
    const c = B.court(b.courtId);
    const extras = b.extras.map((x) => (B.config().extras.find((e) => e.id === x) || {}).name).filter(Boolean);
    const created = new Date(b.createdAt);
    let actions = '';
    if (b.status === 'pending') actions += `<button class="btn btn--good btn--wide" data-act="confirm">${icon('i-check')}Подтвердить бронь</button>`;
    if (b.status !== 'cancelled') {
      actions += b.paid === 'paid'
        ? '<button class="btn btn--ghost" data-act="unpay">Снять оплату</button>'
        : `<button class="btn btn--ghost" data-act="pay">${icon('i-coin')}Оплачено</button>`;
      actions += '<button class="btn btn--ghost" data-act="edit">Изменить</button>';
      if (b.status !== 'completed') actions += '<button class="btn btn--danger-ghost btn--wide" data-act="cancel">Отменить бронь</button>';
    } else {
      actions += '<button class="btn btn--ghost" data-act="restore">Восстановить</button><button class="btn btn--danger-ghost" data-act="delete">Удалить</button>';
    }
    $('#drawer').innerHTML = `
      <div class="dr-head">
        <div>
          <span class="dr-code">${b.code}</span>
          <h2>${esc(c.name)} · ${timeRange(b)}</h2>
          <div class="dr-badges">${statusBadge(b)}${paidBadge(b)}<span class="badge badge--completed"><span class="src src--${b.source}"><i></i>${SRC_LABEL[b.source]}</span></span></div>
        </div>
        <button class="icon-btn" type="button" data-close-drawer aria-label="Закрыть">${icon('i-x')}</button>
      </div>
      <div class="dr-body">
        <div class="dr-client"><span class="avatar">${esc(initials(b.name))}</span><div><b>${esc(b.name)}</b><a href="tel:+${b.phone.replace(/\D/g, '')}">${esc(b.phone)}</a></div></div>
        <dl class="dr-list">
          <div><dt>Дата</dt><dd>${U.fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })}</dd></div>
          <div><dt>Время</dt><dd>${timeRange(b)} · ${U.durationLabel(b.duration)}</dd></div>
          <div><dt>Корт</dt><dd>${esc(c.name)} · ${esc(c.title)}</dd></div>
          <div><dt>Игроков</dt><dd>${b.players}</dd></div>
          <div><dt>Доп. услуги</dt><dd>${extras.length ? esc(extras.join(', ')) : '—'}</dd></div>
          <div><dt>Стоимость</dt><dd>${U.money(b.price)}</dd></div>
          <div><dt>Создана</dt><dd>${created.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${created.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · ${SRC_LABEL[b.source].toLowerCase()}</dd></div>
        </dl>
        ${b.comment ? `<div class="dr-comment">${esc(b.comment)}</div>` : ''}
      </div>
      <div class="dr-foot">${actions}</div>`;
    $('#drawerBackdrop').hidden = false;
    const dr = $('#drawer');
    dr.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => dr.classList.add('is-open'));
  }
  function closeDrawer() {
    drawerId = null;
    $('#drawer').classList.remove('is-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').hidden = true;
  }
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) { closeDrawer(); return; }
    const act = e.target.closest('[data-act]');
    if (!act || !drawerId) return;
    const id = drawerId;
    const b = B.get(id);
    try {
      switch (act.dataset.act) {
        case 'confirm': B.update(id, { status: 'confirmed' }); toast({ title: 'Бронь подтверждена', text: `${b.name} получит SMS с подтверждением.` }); break;
        case 'pay': B.update(id, { paid: 'paid' }); toast({ title: 'Оплата отмечена', text: `${U.money(b.price)} · ${b.code}` }); break;
        case 'unpay': B.update(id, { paid: 'unpaid' }); break;
        case 'edit': closeDrawer(); openForm(null, b); return;
        case 'cancel':
          if (!confirm(`Отменить бронь ${b.code} (${b.name}, ${timeRange(b)})? Время снова станет доступно на сайте.`)) return;
          B.update(id, { status: 'cancelled', paid: 'unpaid' });
          toast({ title: 'Бронь отменена', text: 'Время снова доступно для онлайн-брони.' });
          break;
        case 'restore': B.update(id, { status: b.date < U.todayISO() ? 'completed' : 'confirmed' }); break;
        case 'delete':
          if (!confirm('Удалить бронь безвозвратно?')) return;
          B.remove(id); closeDrawer(); render(); return;
      }
      render();
      openDrawer(id);
    } catch (err) {
      toast({ title: 'Не получилось', text: err.message, error: true });
    }
  });

  /* ================= ФОРМА БРОНИ ================= */
  const form = $('#bookingForm');
  function fillStartOptions(selected) {
    const cfg = B.config();
    const dur = state.form.duration;
    let html = '';
    for (let t = cfg.open; t + dur <= cfg.close; t += 30) html += `<option value="${t}"${t === selected ? ' selected' : ''}>${U.fmtTime(t)}</option>`;
    form.elements.start.innerHTML = html;
    if (selected != null && +form.elements.start.value !== selected) {
      // выбранное время не помещается с этой длительностью — берём последнее возможное
      form.elements.start.value = Math.min(selected, cfg.close - dur);
    }
  }
  function setSeg(field, value) {
    state.form[field] = field === 'duration' ? +value : value;
    $$(`[data-field="${field}"] button`, form).forEach((b) => b.classList.toggle('is-active', b.dataset.v === String(value)));
  }
  function openForm(prefill, booking) {
    const cfg = B.config();
    state.editingId = booking ? booking.id : null;
    const p = booking || Object.assign({ courtId: cfg.courts[0].id, date: state.date, start: 18 * 60, duration: 90, source: 'phone', paid: 'unpaid', extras: [] }, prefill || {});
    $('#modalTitle').textContent = booking ? `Бронь ${booking.code}` : 'Новая бронь';
    $('#formSubmit').textContent = booking ? 'Сохранить' : 'Создать бронь';
    form.reset();
    form.elements.courtId.innerHTML = cfg.courts.map((c) => `<option value="${c.id}"${c.active ? '' : ' disabled'}>${esc(c.name)} · ${esc(c.title)}</option>`).join('');
    form.elements.courtId.value = p.courtId;
    form.elements.date.value = p.date;
    setSeg('duration', p.duration || 90);
    setSeg('source', p.source || 'phone');
    setSeg('paid', p.paid || 'unpaid');
    fillStartOptions(p.start);
    form.elements.name.value = booking ? booking.name : '';
    form.elements.phone.value = booking ? booking.phone : '';
    form.elements.comment.value = booking ? booking.comment : '';
    $('#formExtras').innerHTML = cfg.extras.map((x) => `<label class="chip"><input type="checkbox" value="${x.id}"${(p.extras || []).includes(x.id) ? ' checked' : ''}>${esc(x.name)} · ${U.money(x.price)}</label>`).join('');
    $('#clientList').innerHTML = clientsList().slice(0, 60).map((c) => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join('');
    $('#modal').hidden = false;
    updateFormInfo();
    setTimeout(() => form.elements.name.focus(), 60);
  }
  function closeForm() { $('#modal').hidden = true; state.editingId = null; }
  function formData() {
    return {
      courtId: form.elements.courtId.value,
      date: form.elements.date.value,
      start: +form.elements.start.value,
      duration: state.form.duration,
      source: state.form.source,
      paid: state.form.paid,
      name: form.elements.name.value,
      phone: form.elements.phone.value,
      comment: form.elements.comment.value.trim(),
      extras: $$('#formExtras input:checked').map((i) => i.value)
    };
  }
  function updateFormInfo() {
    const d = formData();
    if (!d.date || isNaN(d.start)) return;
    $('#formTotal').textContent = U.money(B.priceFor(d.date, d.start, d.duration, d.extras));
    const free = B.isFree(d.courtId, d.date, d.start, d.duration, state.editingId);
    const box = $('#availBox');
    if (free) {
      const past = d.date < U.todayISO() || (d.date === U.todayISO() && d.start < U.nowMinutes());
      box.className = 'avail avail--ok';
      box.innerHTML = `${icon('i-check')}<span>${esc(B.court(d.courtId).name)}, ${U.fmtTime(d.start)}–${U.fmtTime(d.start + d.duration)} свободен${past ? ' (время уже прошло: бронь попадёт в историю)' : ''}</span>`;
    } else {
      const clash = B.list({ date: d.date, courtId: d.courtId, active: true }).find((b) => b.id !== state.editingId && b.start < d.start + d.duration && d.start < b.start + b.duration);
      box.className = 'avail avail--bad';
      box.innerHTML = `${icon('i-alert')}<span>Пересекается с бронью ${clash ? `${clash.code}: ${esc(clash.name)}, ${timeRange(clash)}` : ''}. Выберите другое время или корт.</span>`;
    }
    $('#formSubmit').disabled = !free;
  }
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-field] button');
    if (b) {
      const field = b.closest('[data-field]').dataset.field;
      setSeg(field, b.dataset.v);
      if (field === 'duration') fillStartOptions(+form.elements.start.value);
      updateFormInfo();
    }
    if (e.target.closest('[data-close-modal]')) closeForm();
  });
  form.addEventListener('change', updateFormInfo);
  form.elements.name.addEventListener('input', () => {
    const c = clientsList().find((x) => x.name === form.elements.name.value);
    if (c && !form.elements.phone.value) form.elements.phone.value = c.phone;
  });
  form.elements.phone.addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    e.target.value = digits ? U.formatPhone(digits) : '';
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeForm(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData();
    try {
      let b;
      if (state.editingId) {
        if (!d.name.trim()) throw new Error('Укажите имя клиента');
        b = B.update(state.editingId, Object.assign(d, { price: B.priceFor(d.date, d.start, d.duration, d.extras), name: d.name.trim(), phone: U.formatPhone(d.phone) }));
        toast({ title: 'Бронь обновлена', text: `${b.code} · ${b.name}` });
      } else {
        const past = d.date < U.todayISO() || (d.date === U.todayISO() && d.start + d.duration <= U.nowMinutes());
        b = B.create(Object.assign(d, { status: past ? 'completed' : 'confirmed' }));
        toast({ title: 'Бронь создана', text: `${b.code} · ${B.court(b.courtId).name}, ${timeRange(b)}. Время закрыто на сайте.` });
      }
      closeForm();
      if (state.view === 'schedule' && b.date !== state.date) setDate(b.date);
      render();
      if (state.view === 'schedule') setTimeout(() => flashBooking(b.id), 60);
    } catch (err) {
      const box = $('#availBox');
      box.className = 'avail avail--bad';
      box.innerHTML = `${icon('i-alert')}<span>${esc(err.message)}</span>`;
      if (err.code === 'name') form.elements.name.focus();
      if (err.code === 'phone') form.elements.phone.focus();
    }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-new-booking]')) openForm({ date: state.view === 'schedule' ? state.date : U.todayISO() }); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) closeForm();
    else if (drawerId) closeDrawer();
    else if (!$('#bellPop').hidden) toggleBell(false);
  });

  /* ================= УВЕДОМЛЕНИЯ ================= */
  function notifications() {
    return B.all().filter((b) => b.source === 'online').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 12);
  }
  function lastSeen() { return store.get(SEEN_KEY) || new Date(Date.now() - 864e5).toISOString(); }
  function unreadList() { const seen = lastSeen(); return B.all().filter((b) => !b.demo && b.source === 'online' && b.createdAt > seen); }
  function updateBell() {
    const unread = unreadList();
    const cnt = $('#bellCount');
    cnt.hidden = !unread.length;
    cnt.textContent = unread.length;
    document.title = (unread.length ? `(${unread.length}) ` : '') + 'Padel Apsny — админ-панель';
    const seen = lastSeen();
    const items = notifications();
    $('#bellList').innerHTML = items.length ? items.map((b) => {
      const created = new Date(b.createdAt);
      return `<div class="bell-item${!b.demo && b.createdAt > seen ? ' is-new' : ''}" data-open="${b.id}">
        <span class="src-ico" style="--c:${SRC_COLOR.online}">${icon('i-globe')}</span>
        <div><b>${esc(b.name)} · ${esc(B.court(b.courtId).name)}</b><span>${U.fmtDate(b.date, { day: 'numeric', month: 'short' })}, ${timeRange(b)} · ${U.money(b.price)}</span><br><span>${created.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} в ${created.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>`;
    }).join('') : '<div class="bell-empty">Пока нет онлайн-броней</div>';
  }
  function toggleBell(open) {
    const pop = $('#bellPop');
    pop.hidden = !open;
    $('#bellBtn').setAttribute('aria-expanded', open);
  }
  $('#bellBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleBell($('#bellPop').hidden); });
  $('#bellClear').addEventListener('click', () => { store.set(SEEN_KEY, new Date().toISOString()); updateBell(); });
  $('#bellList').addEventListener('click', (e) => {
    const it = e.target.closest('[data-open]');
    if (!it) return;
    const b = B.get(it.dataset.open);
    toggleBell(false);
    if (b) goToBooking(b);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) toggleBell(false); });
  function goToBooking(b) {
    state.date = b.date;
    state.scrolledFor = null;
    location.hash = `schedule/${b.date}/${b.id}`;
  }

  function toast(o) {
    const el = document.createElement('div');
    el.className = 'toast';
    const ico = o.source ? `<span class="src-ico" style="--c:${SRC_COLOR[o.source]}">${icon(SRC_ICON[o.source])}</span>`
      : `<span class="toast-ok"${o.error ? ' style="background:var(--critical)"' : ''}>${icon(o.error ? 'i-alert' : 'i-check')}</span>`;
    el.innerHTML = `${ico}<div><b>${esc(o.title)}</b><span>${esc(o.text || '')}</span></div>`;
    el.addEventListener('click', () => { if (o.onClick) o.onClick(); dismiss(); });
    $('#toasts').appendChild(el);
    const dismiss = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); };
    setTimeout(dismiss, o.duration || 5200);
  }

  // брони и настройки, изменённые на сайте или в другой вкладке
  B.subscribe((detail) => {
    if (detail.external) {
      const sync = $('.sync');
      sync.classList.remove('is-flash'); void sync.offsetWidth; sync.classList.add('is-flash');
      (detail.added || []).forEach((b) => {
        toast({
          title: b.source === 'online' ? 'Новая онлайн-бронь' : 'Новая бронь',
          text: `${b.name} · ${B.court(b.courtId).name}, ${U.fmtDate(b.date, { day: 'numeric', month: 'short' })} ${timeRange(b)}`,
          source: b.source,
          duration: 9000,
          onClick: () => goToBooking(b)
        });
      });
    }
    if (isAuthed() || shot) render();
    updateBell();
    if (drawerId) { if (B.get(drawerId)) openDrawer(drawerId); else closeDrawer(); }
  });

  // раз в минуту двигаем линию «сейчас»
  setInterval(() => { if (state.view === 'schedule' && !$('#app').hidden) renderSchedule(); }, 60000);

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  if (isAuthed() || shot) showApp();
})();
