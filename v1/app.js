/* Концепт «Неон»: свечение за курсором в первом экране */
(function () {
  var hero = document.querySelector('.hero');
  var glow = document.querySelector('.hero-glow');
  if (!hero || !glow || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var raf = 0, x = 70, y = 40;
  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect();
    x = (e.clientX - r.left) / r.width * 100;
    y = (e.clientY - r.top) / r.height * 100;
    if (!raf) raf = requestAnimationFrame(function () {
      raf = 0;
      glow.style.setProperty('--gx', x.toFixed(1) + '%');
      glow.style.setProperty('--gy', y.toFixed(1) + '%');
    });
  });
})();
