// Mouse lock: keeps the cursor inside the game window (for players with several monitors,
// whose cursor would otherwise slide onto the next screen instead of edge-scrolling).
//
// Browsers can't trap the real cursor, so this uses the Pointer Lock API: the real cursor
// is hidden and only its movement is reported. A drawn cursor follows that movement and
// stops at the window edges. Every real mouse event is swallowed and sent again, as if it
// happened at the drawn cursor (to the element under it), so the rest of the game's mouse
// handling works unchanged.
//
// It locks on a click in the game view (when enabled). Esc frees the mouse (the browser does
// that); the next click locks it again. toggle() turns locking on and off (remembered).

const STORE_KEY = 'colossus.lockMouse';
const ARROW = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 1.5 L2 18 L6.4 14 L9.4 20.5 L12.3 19.2 L9.4 12.8 L15.5 12.8 Z"
  fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const CROSS = `<svg width="26" height="26" viewBox="0 0 26 26"><g stroke="#111" stroke-width="3.4" stroke-linecap="round">
  <path d="M13 2v7M13 17v7M2 13h7M17 13h7"/></g><g stroke="#fff" stroke-width="1.6" stroke-linecap="round">
  <path d="M13 2v7M13 17v7M2 13h7M17 13h7"/></g></svg>`;

export function createPointerLock({ lockOn, onChange = () => {} }) {
  let enabled = localStorage.getItem(STORE_KEY) !== '0';
  let x = innerWidth / 2, y = innerHeight / 2; // the drawn cursor
  let downTarget = null;                        // where the held button went down (gets the moves, like pointer capture)
  const locked = () => document.pointerLockElement === document.body;

  const cursor = document.createElement('div');
  Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', display: 'none' });
  document.body.appendChild(cursor);
  let shape = '';
  function drawCursor(under) {
    const want = under && getComputedStyle(under).cursor === 'crosshair' ? 'cross' : 'arrow';
    if (want !== shape) { shape = want; cursor.innerHTML = want === 'cross' ? CROSS : ARROW; }
    cursor.style.transform = shape === 'cross' ? `translate(${x - 13}px, ${y - 13}px)` : `translate(${x - 2}px, ${y - 1}px)`;
  }

  const under = () => document.elementFromPoint(x, y) || document.body;
  const init = (e) => ({
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, screenX: x, screenY: y, movementX: e.movementX || 0, movementY: e.movementY || 0,
    button: e.button, buttons: e.buttons, detail: e.detail,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
    pointerId: e.pointerId ?? 1, pointerType: 'mouse', isPrimary: true,
  });
  const send = (target, Kind, type, e, extra = {}) => {
    const ev = new Kind(type, { ...init(e), ...extra });
    target.dispatchEvent(ev);
    return ev;
  };

  // Real (trusted) mouse events while locked: swallow them and replay them at the drawn cursor.
  // (The replayed ones aren't trusted, so they pass straight through here.)
  const swallow = (e) => { if (!e.isTrusted || !locked()) return false; e.stopImmediatePropagation(); return true; };
  window.addEventListener('pointermove', (e) => {
    if (!swallow(e)) return;
    x = Math.max(0, Math.min(innerWidth - 1, x + e.movementX));
    y = Math.max(0, Math.min(innerHeight - 1, y + e.movementY));
    const t = under();
    drawCursor(t);
    send(downTarget && e.buttons ? downTarget : t, PointerEvent, 'pointermove', e);
  }, true);
  window.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) return;
    if (!locked()) { // a click in the game view locks the mouse (this click still counts as usual)
      if (enabled && e.target === lockOn) { x = e.clientX; y = e.clientY; requestLock(); }
      return;
    }
    swallow(e);
    downTarget = under();
    send(downTarget, PointerEvent, 'pointerdown', e);
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (!swallow(e)) return;
    send(downTarget && downTarget.isConnected ? downTarget : under(), PointerEvent, 'pointerup', e);
  }, true);
  for (const type of ['mousedown', 'mouseup', 'mousemove', 'auxclick', 'dblclick']) window.addEventListener(type, swallow, true);
  // A click goes to what's under the cursor if the button also went down there.
  window.addEventListener('click', (e) => {
    if (!swallow(e)) return;
    const t = under(), d = downTarget;
    downTarget = null;
    if (d && (d === t || d.contains(t) || t.contains(d))) send(t, MouseEvent, 'click', e);
  }, true);
  window.addEventListener('contextmenu', (e) => {
    if (!swallow(e)) return;
    e.preventDefault();
    send(under(), MouseEvent, 'contextmenu', e);
    downTarget = null;
  }, true);
  // The wheel: zoom (or whatever is under the cursor), and scroll a panel if nothing took it.
  window.addEventListener('wheel', (e) => {
    if (!swallow(e)) return;
    e.preventDefault();
    const t = under();
    const ev = send(t, WheelEvent, 'wheel', e, { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode });
    if (ev.defaultPrevented) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    for (let el = t; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTop += dy; break; }
    }
  }, { capture: true, passive: false });

  function requestLock() {
    try {
      const p = document.body.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // e.g. asked again too soon after Esc: the next click tries again
    } catch { /* not supported: the mouse just isn't locked */ }
  }
  let wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    const on = locked();
    cursor.style.display = on ? 'block' : 'none';
    if (on) drawCursor(under());
    downTarget = null;
    if (on !== wasLocked) { wasLocked = on; onChange(on); }
  });
  addEventListener('resize', () => { x = Math.min(x, innerWidth - 1); y = Math.min(y, innerHeight - 1); });

  return {
    get enabled() { return enabled; },
    get locked() { return locked(); },
    // Turn locking on or off (remembered for next time). Off frees the mouse now.
    toggle() {
      enabled = !enabled;
      localStorage.setItem(STORE_KEY, enabled ? '1' : '0');
      if (!enabled && locked()) document.exitPointerLock();
      return enabled;
    },
  };
}
