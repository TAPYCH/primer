/* Концепт «Море»: слайдер отзывов */
(function () {
  var track = document.querySelector('[data-quotes]');
  if (!track) return;
  var items = track.children;
  var dots = document.querySelectorAll('.quote-dots button');
  var i = 0, timer = null;
  function go(n) {
    i = (n + items.length) % items.length;
    Array.prototype.forEach.call(items, function (q, k) { q.classList.toggle('is-active', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('is-active', k === i); d.setAttribute('aria-selected', k === i); });
  }
  function start() { stop(); timer = setInterval(function () { go(i + 1); }, 6500); }
  function stop() { if (timer) clearInterval(timer); }
  dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); start(); }); });
  var sx = null;
  track.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', function (e) {
    if (sx == null) return;
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); start(); }
    sx = null;
  });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
})();
