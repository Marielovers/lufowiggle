/** Cubism Core is distributed by Live2D Inc., separately from this project.
 *  Only run this script after reviewing the applicable Live2D SDK terms.
 *  The downloaded file is gitignored to avoid accidentally redistributing it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const url = 'https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js';
const dest = resolve('public/live2dcubismcore.min.js');
console.log('Live2D Cubism Core 06 다운로드');
console.log('약관: https://www.live2d.com/ko/sdk/download/web/');
console.log('소스:', url);

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const source = await response.text();
  if (source.length < 2000 || /<html|<!doctype/i.test(source.slice(0, 512))) {
    throw new Error('다운로드된 파일이 올바른 JavaScript Core로 보이지 않습니다.');
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, source, 'utf8');
  console.log(`완료: ${dest} (${Math.round(source.length / 1024)} KiB)`);
  console.log('이 파일은 .gitignore에 의해 GitHub에 올라가지 않습니다.');
} catch (error) {
  console.error('다운로드 실패:', error.message);
  console.error('공식 SDK 웹 배포판에서 Core 06을 직접 받아 public/live2dcubismcore.min.js로 넣을 수도 있습니다.');
  process.exitCode = 1;
}
