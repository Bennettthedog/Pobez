import * as THREE from 'three';

const FRUSTUM = 30;          // world units visible vertically at zoom 1
const PITCH = THREE.MathUtils.degToRad(55);
const DISTANCE = 80;
const PAN_SPEED = 22;
const EDGE = 14;             // edge scrolling: pixels from the screen edge where the camera pans

// Angled top-down RTS camera: orthographic, pans on the ground plane, rotates in 90° steps.
export class CameraController {
  constructor(dom) {
    this.dom = dom;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.target = new THREE.Vector3();
    this.yaw = Math.PI / 4;
    this.targetYaw = this.yaw;
    this.zoom = 1;
    this.keys = new Set();
    this.dragging = false;
    this.mouse = null; // where the mouse is (for edge scrolling), or null when it's off the window

    // Edge scrolling: the camera pans while the mouse is at the edge of the screen.
    window.addEventListener('pointermove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    document.addEventListener('mouseleave', () => { this.mouse = null; });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) this.mouse = null; });
    window.addEventListener('blur', () => { this.mouse = null; });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey || e.metaKey) return; // shortcuts like Ctrl+A don't pan the camera
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.targetYaw -= Math.PI / 2;
      if (e.code === 'KeyE') this.targetYaw += Math.PI / 2;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 8);
    }, { passive: false });

    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 1) { this.dragging = true; e.preventDefault(); }
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 1) this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const wpp = FRUSTUM / this.zoom / this.dom.clientHeight; // world units per pixel
      const { right, forward } = this.axes();
      this.target.addScaledVector(right, -e.movementX * wpp);
      this.target.addScaledVector(forward, e.movementY * wpp / Math.sin(PITCH));
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  axes() {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { forward, right };
  }

  resize() {
    const aspect = this.dom.clientWidth / Math.max(1, this.dom.clientHeight);
    const cam = this.camera;
    cam.left = (-FRUSTUM * aspect) / 2; cam.right = (FRUSTUM * aspect) / 2;
    cam.top = FRUSTUM / 2; cam.bottom = -FRUSTUM / 2;
    cam.updateProjectionMatrix();
  }

  update(dt, bounds) {
    const { forward, right } = this.axes();
    const k = this.keys, speed = (PAN_SPEED / this.zoom) * dt;
    // The mouse at a screen edge (or the arrow keys) pans that way.
    const m = !this.dragging && document.hasFocus() ? this.mouse : null;
    const W = window.innerWidth, H = window.innerHeight;
    const up = k.has('ArrowUp') || (m && m.y <= EDGE), down = k.has('ArrowDown') || (m && m.y >= H - 1 - EDGE);
    const rt = k.has('ArrowRight') || (m && m.x >= W - 1 - EDGE), lt = k.has('ArrowLeft') || (m && m.x <= EDGE);
    if (up) this.target.addScaledVector(forward, speed);
    if (down) this.target.addScaledVector(forward, -speed);
    if (rt) this.target.addScaledVector(right, speed);
    if (lt) this.target.addScaledVector(right, -speed);
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, bounds);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, bounds);

    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 10);

    const cam = this.camera;
    if (cam.zoom !== this.zoom) { cam.zoom = this.zoom; cam.updateProjectionMatrix(); }
    const h = Math.cos(PITCH) * DISTANCE;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * h,
      this.target.y + Math.sin(PITCH) * DISTANCE,
      this.target.z + Math.cos(this.yaw) * h,
    );
    cam.lookAt(this.target);
  }
}
