/** Input and motion math. No DOM dependencies; easy to test in Node. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeToRange(normalized, param) {
  if (!param) return 0;
  const n = clamp(Number.isFinite(normalized) ? normalized : 0, -1, 1);
  const min = param.minimum;
  const max = param.maximum;
  const center = clamp(param.defaultValue, min, max);
  return clamp(center + n * (n >= 0 ? max - center : center - min), min, max);
}

export function toOpenRange(intensity, param) {
  if (!param) return 0;
  // Idle: model's own default; peak: model's upper bound.
  return clamp(param.defaultValue + clamp(intensity, 0, 1) * (param.maximum - param.defaultValue), param.minimum, param.maximum);
}

export class MotionController {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.dragging = false;
    this.energy = 0;
    this.sensitivity = 1; // Drag sensitivity only (unchanged default).
    this.shakeSensitivity = 10; // Mobile shake response 10x the original default.
    this.lastMotionAt = 0;
    this.lastShakeAt = 0;
    // One count per distinct physical gesture (debounced sensor samples).
    this.shakeCount = 0;
    this.lastCountedShakeAt = -Infinity;
    this.gravity = { x: 0, y: 0, z: 0 };
    this.hasGravityBaseline = false;
  }

  startDrag() {
    this.dragging = true;
    this.targetX = this.x;
    this.targetY = this.y;
    this.vx = 0;
    this.vy = 0;
  }

  dragBy(dx, dy, width, height) {
    if (!this.dragging) return;
    const sx = Math.max(width, 140);
    const sy = Math.max(height, 140);
    this.targetX = clamp(this.targetX + dx / sx * 2.2 * this.sensitivity, -1, 1);
    this.targetY = clamp(this.targetY - dy / sy * 2.2 * this.sensitivity, -1, 1);
    this.energy = Math.max(this.energy, clamp(Math.hypot(dx, dy) / 50, 0, 0.85));
  }

  stopDrag() {
    this.dragging = false;
    // Release: carry a little momentum, return naturally via the spring.
    this.vx = clamp(this.vx, -2, 2);
    this.vy = clamp(this.vy, -2, 2);
  }

  reset() {
    this.dragging = false;
    this.x = this.y = this.vx = this.vy = 0;
    this.targetX = this.targetY = this.energy = 0;
  }

  impulse(ax, ay, now = performance.now()) {
    if (this.dragging || now - this.lastShakeAt < 80) return false;
    // Independent shake gain. The drag slider never changes this multiplier.
    const gain = this.shakeSensitivity;
    const magnitude = Math.hypot(ax, ay) * gain;
    if (magnitude < 3.2) return false;
    this.lastShakeAt = now;
    // Sensor samples arrive dozens of times per second. Count a meaningful shake
    // at most once every 380ms without altering the movement's 10x sensitivity.
    if (Math.hypot(ax, ay) >= 0.85 && now - this.lastCountedShakeAt >= 380) {
      this.shakeCount += 1;
      this.lastCountedShakeAt = now;
    }
    this.vx = clamp(this.vx + ax * 0.087 * gain, -4.8, 4.8);
    this.vy = clamp(this.vy - ay * 0.087 * gain, -4.8, 4.8);
    this.energy = clamp(this.energy + magnitude / 26, 0, 1);
    return true;
  }

  /** Gravity-free sensor data, or high-pass-filtered accelerationIncludingGravity. */
  acceptDeviceMotion(event, now = performance.now(), rotation = 0) {
    let ax;
    let ay;
    const a = event.acceleration;
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      ax = a.x;
      ay = a.y;
    } else {
      const g = event.accelerationIncludingGravity;
      if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) return false;
      if (!this.hasGravityBaseline) {
        this.gravity = { x: g.x, y: g.y, z: g.z || 0 };
        this.hasGravityBaseline = true;
        return false;
      }
      const alpha = 0.12;
      this.gravity.x += (g.x - this.gravity.x) * alpha;
      this.gravity.y += (g.y - this.gravity.y) * alpha;
      ax = g.x - this.gravity.x;
      ay = g.y - this.gravity.y;
    }
    const angle = ((rotation % 360) + 360) % 360;
    if (angle === 90) [ax, ay] = [-ay, ax];
    if (angle === 180) [ax, ay] = [-ax, -ay];
    if (angle === 270) [ax, ay] = [ay, -ax];
    this.lastMotionAt = now;
    return this.impulse(ax, ay, now);
  }

  step(dtSeconds) {
    // Guard against huge deltas if a background tab resumes.
    const dt = clamp(dtSeconds, 0, 0.034);
    if (this.dragging) {
      const oldX = this.x;
      const oldY = this.y;
      const rate = 1 - Math.exp(-dt * 19);
      this.x += (this.targetX - this.x) * rate;
      this.y += (this.targetY - this.y) * rate;
      if (dt > 0) {
        this.vx = clamp((this.x - oldX) / dt, -2, 2);
        this.vy = clamp((this.y - oldY) / dt, -2, 2);
      }
    } else {
      // Sub-stepped damped spring avoids instability at fluctuating FPS.
      const count = Math.max(1, Math.ceil(dt / 0.009));
      const h = dt / count;
      for (let i = 0; i < count; i += 1) {
        this.vx += (-37 * this.x - 10.5 * this.vx) * h;
        this.vy += (-37 * this.y - 10.5 * this.vy) * h;
        this.x = clamp(this.x + this.vx * h, -1, 1);
        this.y = clamp(this.y + this.vy * h, -1, 1);
        if (Math.abs(this.x) >= 1) this.vx *= 0.55;
        if (Math.abs(this.y) >= 1) this.vy *= 0.55;
      }
    }
    this.energy *= Math.exp(-dt * 3.2);
    return { x: this.x, y: this.y, energy: this.energy };
  }
}

export class ExpressionController {
  constructor(random = Math.random) {
    this.random = random;
    this.time = 0;
    this.nextBlink = 1.7 + random() * 1.4;
    this.blinkTime = -1;
    this.mouth = 0;
    this.gaze = 0;
    this.brow = 0;
    this.blink = 0;
    this.mouthMoment = 0;
    this.nextMouthMoment = 5 + random() * 6;
  }

  step(dtSeconds, movement) {
    const dt = clamp(dtSeconds, 0, 0.05);
    this.time += dt;

    if (this.blinkTime < 0 && this.time >= this.nextBlink) {
      this.blinkTime = 0;
      this.nextBlink = this.time + 2.5 + this.random() * 3.8;
    }
    if (this.blinkTime >= 0) {
      this.blinkTime += dt;
      const t = this.blinkTime;
      this.blink = t < 0.09 ? t / 0.09 : t < 0.26 ? 1 - (t - 0.09) / 0.17 : 0;
      if (t >= 0.26) this.blinkTime = -1;
    } else {
      this.blink = 0;
    }

    // No automatic talking loop: brief mouth responses to interactions.
    if (this.time >= this.nextMouthMoment) {
      this.mouthMoment = 0.22 + this.random() * 0.35;
      this.nextMouthMoment = this.time + 6 + this.random() * 9;
    }
    this.mouthMoment = Math.max(0, this.mouthMoment - dt);
    const activity = clamp(movement.energy, 0, 1);
    const mouthTarget = clamp(
      0.014 + activity * (0.22 + Math.max(0, Math.sin(this.time * 24)) * 0.22)
      + this.mouthMoment * 0.21,
      0, 0.82,
    );
    this.mouth += (mouthTarget - this.mouth) * (1 - Math.exp(-dt * 10));

    // eyey: only vertical pupil movement. Never repurpose as eye open/close.
    const gazeTarget = clamp(movement.y * 0.74 + 0.055 * Math.sin(this.time * 0.78), -0.98, 0.98);
    this.gaze += (gazeTarget - this.gaze) * (1 - Math.exp(-dt * 5.2));
    const browTarget = clamp(movement.y * 0.36 + activity * 0.32 + 0.055 * Math.sin(this.time * 0.65), -0.8, 0.8);
    this.brow += (browTarget - this.brow) * (1 - Math.exp(-dt * 4.8));

    return {
      blink: clamp(this.blink, 0, 1),
      mouthopen: clamp(this.mouth, 0, 1),
      brow: clamp(this.brow, -1, 1),
      eyey: clamp(this.gaze, -1, 1),
    };
  }
}
