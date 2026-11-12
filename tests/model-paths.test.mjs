import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const dir = fileURLToPath(new URL('../public/models/rupo/', import.meta.url));
const desc = JSON.parse(readFileSync(join(dir, 'model.model3.json'), 'utf8'));

test('every model3.json file reference points to a real local asset', () => {
  const refs = desc.FileReferences;
  const paths = [refs.Moc, ...(refs.Textures || []), refs.Physics, refs.DisplayInfo].filter(Boolean);
  assert.ok(paths.length >= 3, 'MOC and texture references must be present');
  for (const relative of paths) {
    const actual = resolve(dir, relative);
    assert.ok(actual.startsWith(resolve(dir) + sep), `invalid relative file path: ${relative}`);
    assert.ok(existsSync(actual), `missing model asset: ${relative}`);
  }
});

test('new MOC3 is revision 06, supported by the configured Core 06', () => {
  const moc = readFileSync(join(dir, desc.FileReferences.Moc));
  assert.equal(moc.toString('ascii', 0, 4), 'MOC3');
  assert.equal(moc[4], 6);
});
