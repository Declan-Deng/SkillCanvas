import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/showcase/showcase.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/showcase/page.tsx', import.meta.url), 'utf8');
const examples = readFileSync(new URL('../app/showcase/examples/page.tsx', import.meta.url), 'utf8');
const engineering = readFileSync(new URL('../app/showcase/engineering/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../app/showcase/showcase-shell.tsx', import.meta.url), 'utf8');

test('leads with the user problem and keeps the primary product link', () => {
  assert(page.includes('不再每次从头教 AI'));
  assert(page.includes('同一种任务做过很多次，下一次还是要重新解释'));
  assert(page.includes('https://skillcanvas-studio.declandeng.chatgpt.site/'));
});

test('main narrative follows problem, origin, method, example, validation and proof', () => {
  const sections = ['problem', 'origin', 'method', 'example', 'anatomy', 'validation', 'engineering-teaser', 'proof'];
  const indexes = sections.map(name => page.indexOf(`className="sc-${name}"`));
  assert(indexes.every((value, index) => value >= 0 && (index === 0 || value > indexes[index - 1])));
});

test('shows a concrete example rather than an abstract requirements grid', () => {
  assert(page.includes('帮我做一个基金周报助手'));
  for (const item of ['信息来源规则', '分析与判断流程', '异常处理', '验证 Case']) {
    assert(page.includes(item));
  }
  assert(!page.includes('16 维 AI 选项式需求澄清'));
});

test('provides dedicated examples and engineering pages', () => {
  for (const title of ['基金周报助手', '竞品研究助手', '写作修改助手']) assert(examples.includes(title));
  for (const title of ['所有文件都从一份 SkillIR 出发', '能力不是越多越好', '改动必须证明自己更好']) assert(engineering.includes(title));
  assert(shell.includes('/showcase/examples'));
  assert(shell.includes('/showcase/engineering'));
});

test('mobile navigation remains available and layout collapses without hiding content', () => {
  assert(!css.includes('.sc-nav-links { display: none; }'));
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.sc-example-board, \.sc-diagnosis-list, \.sc-compare-runs, \.sc-case-flow, \.sc-pipeline \{ grid-template-columns: 1fr; \}/);
});

test('supports keyboard focus, reduced transparency, contrast and reduced motion', () => {
  for (const rule of [':focus-visible', 'prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'prefers-reduced-motion: reduce']) {
    assert(css.includes(rule));
  }
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /overflow: clip/);
  assert.match(css, /font-optical-sizing: auto/);
});

test('does not ship stale proof metrics or external icon dependencies', () => {
  assert(!page.includes('514'));
  assert(!page.includes('unpkg.com'));
  assert(!examples.includes('unpkg.com'));
  assert(!engineering.includes('unpkg.com'));
});

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

test('primary text and controls meet AA contrast', () => {
  const pairs = [
    ['132822', 'f4f0e8'],
    ['5f6d67', 'f4f0e8'],
    ['ffffff', 'c83827'],
    ['ffffff', '132822'],
  ];
  for (const [foreground, background] of pairs) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05);
    assert(ratio >= 4.5, `${foreground} / ${background}: ${ratio.toFixed(2)}:1`);
  }
});
