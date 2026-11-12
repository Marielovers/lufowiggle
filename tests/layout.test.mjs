import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/panel.js', import.meta.url), 'utf8');

test('pink title and all settings live in accessible left sidebar', () => {
  assert.match(html, /<title>너무 세게 흔들어 버린 것이다!<\/title>/);
  for (const id of ['control-panel', 'panel-toggle', 'panel-body', 'motion-btn', 'sensitivity', 'reset-btn', 'param-eye']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-hidden="true" inert/);
  assert.match(css, /#ffd2e7/);
  assert.match(css, /\.control-panel\.is-collapsed/);
});

test('mobile layout reserves a stage and respects viewport and safe areas', () => {
  assert.match(css, /#stage\s*\{/);
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /@media \(max-height: 520px\) and \(orientation: landscape\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(main, /fit: 'full'/);
  assert.match(main, /character\.setFit\('full'\)/);
});

test('collapsing panel disables settings focus while keeping toggle accessible', () => {
  assert.match(panel, /body\.inert = collapsed/);
  assert.match(panel, /toggle\.setAttribute\('aria-expanded'/);
  assert.match(panel, /event\.key === 'Escape'/);
});
