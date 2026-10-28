/* tilt3d.js — subtle, delegated 3D tilt for [data-tilt3d] / .t3d elements.
 *
 * Load this AFTER the DOM it should affect exists (end of <body>).
 * It listens once on <document>, so it also works for elements that are
 * created later (no MutationObserver needed).
 *
 * - Only runs on devices with a fine pointer (mouse) and no
 *   "prefers-reduced-motion", so touch users and reduced-motion users
 *   get the static (CSS) depth without any movement.
 * - Rotation is driven by CSS custom properties --rx / --ry which the
 *   .t3d rule in 3d-depth.css consumes. No inline transform is set, so it
 *   never fights existing hover transforms on the same element.
 * - --mx / --my (percent) feed the cursor-tracking glare overlay, and
 *   --tz is a small translateZ "lift" so the surface floats toward the
 *   cursor while tilted.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  var SELECTOR = "[data-tilt3d], .t3d";

  var finePointer =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!finePointer || reduced) return;

  // Subtle by default; override with <script>__TILT3D_MAX__ = 10;</script>
  var MAX = parseFloat(window.__TILT3D_MAX__) || 8;
  // translateZ lift (px) while tilted; override with __TILT3D_POP__.
  var POP = parseFloat(window.__TILT3D_POP__) || 10;

  var activeEl = null;
  var raf = 0;
  var pending = null; // { el, x, y }

  function clear(el) {
    if (!el) return;
    el.classList.remove("t3d-on");
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
    el.style.removeProperty("--tz");
    el.style.removeProperty("--mx");
    el.style.removeProperty("--my");
  }

  function findEl(target) {
    if (!target || target.nodeType !== 1) return null;
    if (typeof target.closest !== "function") return null;
    return target.closest(SELECTOR);
  }

  function frame() {
    raf = 0;
    if (!pending) return;
    var p = pending;
    pending = null;

    var el = p.el;
    if (!el) {
      clear(activeEl);
      activeEl = null;
      return;
    }
    if (activeEl && activeEl !== el) clear(activeEl);

    activeEl = el;
    el.classList.add("t3d-on");

    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    // Add scroll offsets so the glare stays aligned when the surface
    // itself scrolls (its ::after overlay scrolls with the content).
    var px = (p.x - r.left + (el.scrollLeft || 0)) / r.width - 0.5; // -0.5 .. 0.5
    var py = (p.y - r.top + (el.scrollTop || 0)) / r.height - 0.5; // -0.5 .. 0.5
    if (px > 0.5) px = 0.5;
    else if (px < -0.5) px = -0.5;
    if (py > 0.5) py = 0.5;
    else if (py < -0.5) py = -0.5;

    el.style.setProperty("--rx", (-py * MAX).toFixed(2) + "deg");
    el.style.setProperty("--ry", (px * MAX).toFixed(2) + "deg");
    el.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
    el.style.setProperty("--my", ((py + 0.5) * 100).toFixed(1) + "%");
    el.style.setProperty("--tz", POP + "px");
  }

  function onMove(e) {
    pending = { el: findEl(e.target), x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function onOut(e) {
    if (!activeEl) return;
    var rel = e.relatedTarget;
    var still =
      rel && rel.nodeType === 1 && typeof rel.closest === "function"
        ? rel.closest(SELECTOR)
        : null;
    if (still !== activeEl) {
      clear(activeEl);
      activeEl = null;
    }
  }

  function onLeave() {
    clear(activeEl);
    activeEl = null;
    pending = null;
  }

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerout", onOut, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });
})();
