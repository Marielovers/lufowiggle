import { createLive2D, OFFICIAL_CUBISM_CORE_URL } from 'live2d-web';
import { MotionController, ExpressionController, normalizeToRange, toOpenRange } from './controller.js';
import { initPanel } from './panel.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const motion = new MotionController();
const expression = new ExpressionController();
const state = { x: 0, y: 0, energy: 0, blink: 0, mouthopen: 0, brow: 0, eyey: 0 };
let character;
let sensorEnabled = false;
let sensorPermissionPending = false;
let lastSensorReceived = 0;
let currentPointer = null;
let lastPointerPos = null;
let lastFrame = performance.now();
let lastHudTime = 0;
// Keep the whole rig fitted when mobile browser bars, rotation or viewport size change.
const stageObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(() => character?.setFit('full'))
  : null;
stageObserver?.observe(stage);

function setStatus(message, kind = '') {
  $('load-state').textContent = message;
  $('connection').className = `connection ${kind}`;
}

function notify(message) { $('help-text').textContent = message; }

function showError(error) {
  console.error('[루포 Live2D]', error);
  const message = error instanceof Error ? error.message : String(error);
  setStatus('모델 로딩 실패', 'failed');
  $('loading').hidden = false;
  $('loading').innerHTML = `<strong>모델을 불러오지 못했습니다</strong><span>개발자 도구(F12)의 Console에서 원인을 확인하세요.</span>`;
  notify(`오류: ${message.slice(0, 170)}`);
}

// Local (self-hosted) Core takes priority. No proprietary Core is committed to Git.
// If no local file is provided, use Live2D's official hosting-only Core 06 endpoint.
async function resolveCoreUrl() {
  const local = `${import.meta.env.BASE_URL}live2dcubismcore.min.js`;
  try {
    const response = await fetch(local, { method: 'HEAD', cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    if (response.ok && /javascript|octet-stream/.test(type)) return local;
  } catch { /* Use official fallback. */ }
  return OFFICIAL_CUBISM_CORE_URL;
}

function bindInput() {
  stage.addEventListener('pointerdown', (event) => {
    if (currentPointer !== null || event.button > 0) return;
    currentPointer = event.pointerId;
    lastPointerPos = { x: event.clientX, y: event.clientY };
    motion.startDrag();
    try { stage.setPointerCapture(event.pointerId); } catch { /* no capture support */ }
    event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    if (event.pointerId !== currentPointer || !lastPointerPos) return;
    const rect = stage.getBoundingClientRect();
    motion.dragBy(event.clientX - lastPointerPos.x, event.clientY - lastPointerPos.y, rect.width, rect.height);
    lastPointerPos = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });
  const finish = (event) => {
    if (event.pointerId !== currentPointer) return;
    currentPointer = null;
    lastPointerPos = null;
    motion.stopDrag();
    try { if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); } catch { /* no capture */ }
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
  stage.addEventListener('lostpointercapture', finish);
  window.addEventListener('blur', () => { currentPointer = null; lastPointerPos = null; motion.stopDrag(); });
  window.addEventListener('contextmenu', (e) => { if (stage.contains(e.target)) e.preventDefault(); });
}

function onDeviceMotion(event) {
  lastSensorReceived = performance.now();
  const rotation = screen.orientation?.angle ?? window.orientation ?? 0;
  const previousCount = motion.shakeCount;
  motion.acceptDeviceMotion(event, lastSensorReceived, rotation);
  if (motion.shakeCount !== previousCount) {
    $('shake-count').textContent = String(motion.shakeCount);
  }
}

function isMobileDevice() {
  const nav = navigator;
  return Boolean(
    nav.userAgentData?.mobile
    || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '')
    || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) // iPadOS desktop UA
    || (nav.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches)
  );
}

function setSensorButton() {
  const intendedOn = sensorEnabled || sensorPermissionPending;
  $('motion-btn').setAttribute('aria-pressed', String(intendedOn));
  $('motion-text').textContent = sensorPermissionPending
    ? '흔들기 ON · 권한 허용'
    : sensorEnabled ? '흔들기 끄기' : '흔들기 활성화';
}

function stopSensors() {
  sensorEnabled = false;
  sensorPermissionPending = false;
  window.removeEventListener('devicemotion', onDeviceMotion);
  setSensorButton();
}

function listenToSensors() {
  sensorPermissionPending = false;
  sensorEnabled = true;
  motion.hasGravityBaseline = false;
  lastSensorReceived = 0;
  window.removeEventListener('devicemotion', onDeviceMotion);
  window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
  setSensorButton();
  notify('휴대폰 흔들기 자동 ON · 흔들기 감도 기본 10배 (드래그 감도는 그대로).');
  setTimeout(() => {
    if (sensorEnabled && !lastSensorReceived) {
      notify('센서 데이터가 도착하지 않습니다. HTTPS 및 브라우저의 동작 센서 권한을 확인해 주세요.');
    }
  }, 2000);
}

async function enableSensors(userGesture = false) {
  if (!window.isSecureContext) {
    stopSensors();
    notify('흔들기 기능은 HTTPS 주소에서 이용할 수 있습니다. 드래그는 정상 동작합니다.');
    return;
  }
  if (!('DeviceMotionEvent' in window)) {
    stopSensors();
    notify('이 브라우저는 모션 센서를 지원하지 않습니다. 드래그는 정상 동작합니다.');
    return;
  }
  // iOS/iPadOS Safari: browser requires a genuine user gesture for permission.
  if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
    if (!userGesture) {
      sensorPermissionPending = true;
      setSensorButton();
      notify('흔들기 기본 ON · iPhone/iPad에서는 왼쪽 ☰ 메뉴의 “흔들기 ON · 권한 허용”을 한 번 눌러 주세요.');
      return;
    }
    try {
      // Must be invoked directly from a click handler, before any await.
      const permission = await window.DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') throw new Error('모션 센서 권한이 거부되었습니다.');
    } catch (error) {
      stopSensors();
      notify(error instanceof Error ? error.message : '센서 권한을 받을 수 없습니다.');
      return;
    }
  }
  listenToSensors();
}

async function toggleSensors() {
  if (sensorPermissionPending) {
    await enableSensors(true);
  } else if (sensorEnabled) {
    stopSensors();
    notify('흔들기 입력이 꺼졌습니다. 드래그는 계속 사용할 수 있습니다.');
  } else {
    await enableSensors(true);
  }
}

function bindButtons() {
  initPanel({ panel: $('control-panel'), toggle: $('panel-toggle'), body: $('panel-body') });
  $('motion-btn').addEventListener('click', toggleSensors);
  $('reset-btn').addEventListener('click', () => {
    motion.reset();
    currentPointer = null;
    notify('중앙으로 초기화했습니다. 화면을 드래그해 다시 움직여 보세요.');
  });
  $('sensitivity').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    motion.sensitivity = value / 100;
    $('sensitivity-value').value = `${value}%`;
  });
  $('shake-sensitivity').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    motion.shakeSensitivity = value / 100; // 1000% means original x10, drag unchanged.
    $('shake-sensitivity-value').value = `${value}%`;
  });
  setSensorButton();
  if (isMobileDevice()) void enableSensors(false); // Automatic ON where browsers allow it.
}

function animationLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  const axis = motion.step(dt);
  const face = expression.step(dt, axis);
  Object.assign(state, axis, face);
  if (character && now - lastHudTime > 95) {
    lastHudTime = now;
    const px = character.getParameter('ParamX');
    const py = character.getParameter('ParamY');
    const ey = character.getParameter('eyey');
    $('param-x').textContent = Number.isFinite(px) ? px.toFixed(2) : '--';
    $('param-y').textContent = Number.isFinite(py) ? py.toFixed(2) : '--';
    $('param-eye').textContent = Number.isFinite(ey) ? ey.toFixed(2) : '--';
  }
  requestAnimationFrame(animationLoop);
}

async function start() {
  bindInput();
  bindButtons();
  requestAnimationFrame(animationLoop);
  try {
    if (!document.createElement('canvas').getContext('webgl2')) {
      throw new Error('이 브라우저에서는 WebGL2가 비활성화되어 있습니다.');
    }
    const coreUrl = await resolveCoreUrl();
    character = await createLive2D({
      container: stage,
      coreUrl,
      src: `${import.meta.env.BASE_URL}models/rupo/model.model3.json`,
      fit: 'full',
      followPointer: false,
      idleMotion: false,
      quality: 'auto',
      onError: (error) => showError(error),
    });
    const parameters = new Map((character.getModelInfo().parameters || []).map(p => [p.id, p]));
    const required = ['ParamX', 'ParamY', 'mouthopen', 'blink', 'brow', 'eyey'];
    const missing = required.filter(id => !parameters.has(id));
    if (missing.length) {
      console.warn('Live2D parameter metadata missing:', missing);
      notify(`주의: 모델에서 ${missing.join(', ')} ID를 확인하지 못했습니다.`);
    }
    const driver = (id, getter, phase = 'after-motion') => {
      if (!parameters.has(id)) return;
      character.addParameterDriver(id, { phase, getValue: () => getter(parameters.get(id)) });
    };
    // BEFORE physics: the model's ear/hair/skirt/leg chains react to ParamX/Y.
    driver('ParamX', p => normalizeToRange(state.x, p), 'before-physics');
    driver('ParamY', p => normalizeToRange(state.y, p), 'before-physics');
    // AFTER motions: autonomous expressions. eyey = vertical PUPIL, not blinking.
    driver('mouthopen', p => toOpenRange(state.mouthopen, p));
    driver('blink', p => toOpenRange(state.blink, p));
    driver('brow', p => normalizeToRange(state.brow, p));
    driver('eyey', p => normalizeToRange(state.eyey, p));
    character.setFit('full');
    $('loading').hidden = true;
    setStatus('모델 준비 완료', 'ready');
    console.info('[루포] Loaded parameters:', [...parameters.keys()]);
    console.info('[루포] Core source:', coreUrl);
  } catch (error) { showError(error); }
}

window.addEventListener('pagehide', () => {
  stageObserver?.disconnect();
  if (sensorEnabled) window.removeEventListener('devicemotion', onDeviceMotion);
  character?.dispose();
}, { once: true });

start();
