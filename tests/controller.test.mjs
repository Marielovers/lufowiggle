import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, normalizeToRange, toOpenRange, MotionController, ExpressionController } from '../src/controller.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const param = { id: 'ParamX', minimum: -30, defaultValue: 0, maximum: 30 };
const near = (actual, expected, epsilon = 0.05) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('parameter mapping honors model ranges and clamps', () => {
  assert.equal(normalizeToRange(1, param), 30);
  assert.equal(normalizeToRange(-1, param), -30);
  assert.equal(normalizeToRange(0, param), 0);
  assert.equal(normalizeToRange(2, param), 30);
  assert.equal(normalizeToRange(-2, param), -30);
  assert.equal(toOpenRange(0.5, { minimum: 0, maximum: 1, defaultValue: 0 }), 0.5);
  assert.equal(clamp(19, 0, 10), 10);
});

test('drag affects both axes, vertical convention is up positive', () => {
  const m = new MotionController();
  m.startDrag();
  m.dragBy(120, -100, 400, 400);
  for (let i = 0; i < 20; i++) m.step(1 / 60);
  assert.ok(m.x > 0.55 && m.y > 0.4);
  near(m.targetX, 0.66, 0.01);
  near(m.targetY, 0.55, 0.01);
});

test('release smoothly returns to neutral', () => {
  const m = new MotionController();
  m.startDrag();
  m.dragBy(180, 160, 300, 300);
  for (let i = 0; i < 24; i++) m.step(1 / 60);
  m.stopDrag();
  for (let i = 0; i < 180; i++) m.step(1 / 60);
  near(m.x, 0, 0.001);
  near(m.y, 0, 0.001);
});

test('shake impulse is thresholded, debounced and clamped', () => {
  const m = new MotionController();
  assert.equal(m.impulse(0.1, 0.1, 500), false);
  assert.equal(m.impulse(8, -6, 500), true);
  assert.equal(m.impulse(-8, 6, 510), false);
  for (let i = 0; i < 4; i++) m.step(1 / 60);
  assert.ok(m.x > 0 && m.y > 0);
  m.reset();
  near(m.x, 0, 0);
});

test('fallback high-pass motion sensor ignores initial gravity', () => {
  const m = new MotionController();
  const baseline = { acceleration: null, accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 } };
  assert.equal(m.acceptDeviceMotion(baseline, 1000), false);
  const shake = { acceleration: null, accelerationIncludingGravity: { x: 8, y: 9.8, z: 0 } };
  assert.equal(m.acceptDeviceMotion(shake, 1200), true);
});

test('blink is temporary, eyey tracks vertical pupil movement', () => {
  const e = new ExpressionController(() => 0);
  let latest = {};
  for (let i = 0; i < 25; i++) latest = e.step(0.05, { x: 0, y: 0.85, energy: 0.1 });
  assert.ok(latest.eyey > 0.25, `Pupil movement: ${latest.eyey}`);
  let blinkMax = 0;
  for (let i = 0; i < 30; i++) {
    latest = e.step(0.05, { x: 0, y: 0, energy: 0 });
    blinkMax = Math.max(blinkMax, latest.blink);
  }
  assert.ok(blinkMax > 0.65, `Blink amplitude: ${blinkMax}`);
  assert.equal(latest.blink, 0);
  assert.ok(latest.mouthopen >= 0 && latest.mouthopen <= 1);
});

test('all Live2D model3 references point to copied assets', () => {
  const dir = resolve('public/models/rupo');
  const data = JSON.parse(readFileSync(resolve(dir, 'model.model3.json'), 'utf8'));
  const refs = data.FileReferences;
  for (const path of [refs.Moc, refs.Physics, refs.DisplayInfo, ...refs.Textures]) {
    assert.ok(existsSync(resolve(dir, path)), `${path} missing`);
  }
  assert.equal(readFileSync(resolve(dir, refs.Moc)).subarray(0, 4).toString(), 'MOC3');
});

test('default shake gain is 10x without changing drag gain', () => {
  const stronger = new MotionController();
  const baseline = new MotionController();
  baseline.shakeSensitivity = 1;
  assert.equal(stronger.shakeSensitivity, 10);
  assert.equal(stronger.sensitivity, 1);
  stronger.startDrag();
  baseline.startDrag();
  stronger.dragBy(50, -30, 400, 400);
  baseline.dragBy(50, -30, 400, 400);
  near(stronger.targetX, baseline.targetX, 0.00001);
  near(stronger.targetY, baseline.targetY, 0.00001);
  stronger.stopDrag();
  baseline.stopDrag();
  stronger.reset();
  baseline.reset();
  assert.equal(stronger.impulse(0.5, 0, 1000), true, 'small shakes now register');
  assert.equal(baseline.impulse(0.5, 0, 1000), false, 'original threshold unchanged for baseline');
  assert.equal(stronger.impulse(3.3, 0, 1100), true);
  assert.equal(baseline.impulse(3.3, 0, 1100), true);
  near(stronger.vx, (0.5 + 3.3) * 0.087 * 10, 0.00001);
  near(baseline.vx, 3.3 * 0.087, 0.00001);
});


test('shake counter counts distinct sensor gestures, not each sample', () => {
  const m = new MotionController();
  assert.equal(m.shakeCount, 0);
  // First shake counts; samples within 380ms must not inflate the count.
  assert.equal(m.impulse(2, 0, 1000), true);
  assert.equal(m.shakeCount, 1);
  assert.equal(m.impulse(-2, 0, 1100), true);
  assert.equal(m.impulse(3, 0, 1200), true);
  assert.equal(m.shakeCount, 1);
  assert.equal(m.impulse(2, 0, 1380), true);
  assert.equal(m.shakeCount, 2);
  // Dragging does not count as a shake.
  m.startDrag();
  m.dragBy(100, 80, 400, 400);
  assert.equal(m.impulse(10, 8, 2000), false);
  assert.equal(m.shakeCount, 2);
  m.stopDrag();
  // Recentering does not erase the session's cumulative count.
  m.reset();
  assert.equal(m.shakeCount, 2);
});

test('tiny sensor noise does not count as shaking even with 10x movement sensitivity', () => {
  const m = new MotionController();
  assert.equal(m.impulse(0.5, 0, 1000), true);
  assert.equal(m.shakeCount, 0);
  assert.equal(m.acceptDeviceMotion({ acceleration: { x: 1.2, y: -1.2 } }, 1800), true);
  assert.equal(m.shakeCount, 1);
});
