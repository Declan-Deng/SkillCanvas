import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/showcase/showcase.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/showcase/page.tsx', import.meta.url), 'utf8');
const loop = readFileSync(new URL('../app/showcase/loop-diagram.tsx', import.meta.url), 'utf8');

test('preserves approved product decisions and section order', () => {
  for (const title of ['降低需求表达成本', '保证多文件一致性', '控制能力复杂度', '防止优化退化']) {
    assert(page.includes(title));
  }
  const sections = ['requirements', 'decisions', 'system', 'capabilities', 'gates', 'loop', 'proof'];
  const indexes = sections.map(name => page.indexOf(`<section className="showcase-${name}"`));
  assert(indexes.every((n, i) => n >= 0 && (i === 0 || n > indexes[i - 1])));
  assert(page.includes('https://skillcanvas-studio.declandeng.chatgpt.site/'));
});

test('keeps the light loop summary and tactile green next button', () => {
  assert.match(css, /\.showcase-cycle-center strong\s*\{[^}]*font-weight: 300;/);
  assert.match(css, /\.showcase-cycle-detail > button\s*\{[^}]*linear-gradient/);
  assert.match(css, /\.showcase-cycle-detail > button:active\s*\{[^}]*translateY\(3px\)/);
  assert(loop.includes('执行 → 评分 → 修复 → 再验证'));
});

test('mobile navigation remains available and anchors clear the header', () => {
  assert(!css.includes('.showcase-nav-links { display: none; }'));
  assert.match(css, /scroll-margin-top: 8rem/);
  assert.match(css, /grid-template-rows: 60px 44px/);
});

test('supports keyboard, reduced transparency, contrast and reduced motion', () => {
  for (const rule of [':focus-visible', 'prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'prefers-reduced-motion: reduce']) {
    assert(css.includes(rule));
  }
  assert(!css.includes('animation: showcase-rise'));
  assert.match(css, /overflow: clip/);
  assert.match(css, /font-optical-sizing: auto/);
});

test('keeps bare icons and four requirement columns on desktop', () => {
  assert.match(css, /\.showcase-capability-icon\s*\{[^}]*background: transparent;[^}]*border: 0;/);
  assert.match(css, /\.showcase-gate-label > span,\s*\.showcase-decision-meta i\s*\{[^}]*background: transparent;[^}]*border: 0;/);
  assert.match(css, /\.showcase-requirement-groups\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('loop arrows have individual endpoints and selection remains accessible', () => {
  assert(!loop.includes('M 190 60 H 318 M 490'));
  assert(!loop.includes('M 710 270 H 581 M 410'));
  assert(loop.includes('aria-pressed={selected === index}'));
  assert(loop.includes('aria-live="polite"'));
  assert(loop.includes('selected === steps.length - 1 ? 2 : selected + 1'));
});

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16) / 255);
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
test('brand text and primary controls meet AA contrast in both themes', () => {
  const pairs = [
    ['5f6d67', 'f4f0e8'], ['a8b4af', '14201d'],
    ['fffaf4', 'b93726'], ['f8f5ed', '0d443a'],
    ['fffdf7', '307861'], ['8ed9c2', '14201d'],
  ];
  for (const [fg, bg] of pairs) {
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05);
    assert(ratio >= 4.5, `${fg} / ${bg}: ${ratio.toFixed(2)}:1`);
  }
});
