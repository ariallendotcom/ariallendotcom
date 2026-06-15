// Zen cursor — a soft copper-glow aura that gently trails the pointer and breathes,
// leaving a warm ripple in its wake. Activates on the first real mouse movement
// (never touch), and respects prefers-reduced-motion. Self-contained: injects styles.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CSS =
    '.zen-cursor{position:fixed;top:0;left:0;z-index:9998;pointer-events:none;will-change:transform;transition:opacity .5s ease}' +
    '.zen-cursor__dot{width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;' +
      'background:radial-gradient(circle,rgba(236,186,142,.36) 0%,rgba(217,154,106,.15) 45%,rgba(217,154,106,0) 72%);' +
      'animation:zenBreathe 5s ease-in-out infinite}' +
    '.zen-ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;' +
      'border:1px solid rgba(236,186,142,.45);pointer-events:none;z-index:9997;will-change:transform,opacity;' +
      'animation:zenRipple 1.5s cubic-bezier(.22,1,.36,1) forwards}' +
    '.zen-ripple--click{border-color:rgba(236,186,142,.64);animation:zenRippleClick 1.8s cubic-bezier(.22,1,.36,1) forwards}' +
    '@keyframes zenBreathe{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.18);opacity:1}}' +
    '@keyframes zenRipple{0%{transform:scale(.5);opacity:.55}100%{transform:scale(6.5);opacity:0}}' +
    '@keyframes zenRippleClick{0%{transform:scale(.5);opacity:.6}100%{transform:scale(11);opacity:0}}';
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var inited = false, aura, tx, ty, ax, ay, lastX, lastY;
  var THRESH = 42 * 42;  // px^2 between ripples in the wake

  function isMouse(e) { return !e.pointerType || e.pointerType === 'mouse'; }

  function init(x, y) {
    inited = true;
    aura = document.createElement('div');
    aura.className = 'zen-cursor';
    var dot = document.createElement('div');
    dot.className = 'zen-cursor__dot';
    aura.appendChild(dot);
    document.body.appendChild(aura);
    tx = ax = lastX = x;
    ty = ay = lastY = y;
    requestAnimationFrame(loop);
  }

  window.addEventListener('pointermove', function (e) {
    if (!isMouse(e)) return;                 // ignore touch / pen
    if (!inited) { init(e.clientX, e.clientY); return; }
    tx = e.clientX; ty = e.clientY;
    var dx = tx - lastX, dy = ty - lastY;
    if (dx * dx + dy * dy > THRESH) { ripple(tx, ty, false); lastX = tx; lastY = ty; }
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (!isMouse(e)) return;
    if (!inited) init(e.clientX, e.clientY);
    ripple(e.clientX, e.clientY, true);
  }, { passive: true });

  document.addEventListener('mouseout', function (e) { if (aura && !e.relatedTarget) aura.style.opacity = '0'; });
  document.addEventListener('mouseover', function () { if (aura) aura.style.opacity = '1'; });

  function ripple(x, y, click) {
    var r = document.createElement('div');
    r.className = click ? 'zen-ripple zen-ripple--click' : 'zen-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    r.addEventListener('animationend', function () { if (r.parentNode) r.parentNode.removeChild(r); });
  }

  function loop() {
    ax += (tx - ax) * 0.16;   // gentle easing = the calm trailing lag
    ay += (ty - ay) * 0.16;
    aura.style.transform = 'translate3d(' + ax.toFixed(2) + 'px,' + ay.toFixed(2) + 'px,0)';
    requestAnimationFrame(loop);
  }
})();
