import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/showcase/showcase.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/showcase/page.tsx', import.meta.url), 'utf8');
const examples = readFileSync(new URL('../app/showcase/examples/page.tsx', import.meta.url), 'utf8');
const engineering = readFileSync(new URL('../app/showcase/engineering/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../app/showcase/showcase-shell.tsx', import.meta.url), 'utf8');
const motion = readFileSync(new URL('../app/showcase/showcase-motion.tsx', import.meta.url), 'utf8');

test('all showcase routes use local SVG arrows instead of font glyphs', () => {
  const root = new URL('../app/showcase/', import.meta.url);
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith('.tsx'))) {
    const source = readFileSync(new URL(file, root), 'utf8');
    assert(!/[\u2190-\u21ff\u2794-\u27bf]/u.test(source), `${file}: no character arrows`);
  }
  assert.match(css, /\.sc-arrow \{[^}]*background: currentColor;[^}]*flex: 0 0 auto;[^}]*mask-size: contain;/);
  for (const direction of ['right', 'up-right', 'down', 'back-up']) {
    const svg = readFileSync(new URL(`../public/icons/tabler/arrow-${direction}.svg`, import.meta.url), 'utf8');
    for (const attribute of ['viewBox="0 0 24 24"', 'stroke-width="2"', 'stroke-linecap="round"', 'stroke-linejoin="round"']) assert(svg.includes(attribute));
  }
});

test('header and footer share the tab robot artwork in a high-resolution asset', () => {
  assert.equal((shell.match(/src="\/skillcanvas-apple-icon.png\?v=20260927"/g) || []).length, 2);
  assert(!shell.includes('skillcanvas-icon-small.png'));
  const robot = readFileSync(new URL('../public/skillcanvas-apple-icon.png', import.meta.url));
  assert.equal(robot.readUInt32BE(16), 180);
  assert.equal(robot.readUInt32BE(20), 180);
});

test('polish retains reading space, semantic heading weights and adjacent mobile feedback', () => {
  assert.match(css, /\.sc-page h2 \{ font-weight: var\(--sc-weight-heading\); \}/);
  assert.match(css, /\.sc-page h3 \{ font-weight: var\(--sc-weight-card\); \}/);
  assert.match(css, /\.sc-phrase \{ white-space: nowrap; \}/);
  assert.match(css, /min-height: min\(780px, calc\(100dvh - 76px\)\)/);
  assert.match(css, /\.sc-file-layout \{[^}]*grid-template-columns: minmax\(0, \.65fr\) minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.sc-selection-feedback \{ display: none; \}/);
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 700px)'));
  assert.match(mobile, /\.sc-walkthrough-steps \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.sc-selection-feedback \{[^}]*display: grid/);
  assert.match(css, /\.sc-problem-list p \{ grid-column: 1 \/ -1; grid-row: 3;/);
});

test('all showcase font sizes and line heights use the shared typography scale', () => {
  for (const [property, prefix] of [['font-size', 'type'], ['line-height', 'leading']]) {
    const declarations = [...css.matchAll(new RegExp(`${property}:\\s*([^;]+);`, 'g'))];
    assert(declarations.length > 50, property);
    for (const [, value] of declarations) {
      assert.match(value, new RegExp(`^var\\(--sc-${prefix}-[a-z-]+\\)$`));
      const token = value.slice(4, -1);
      assert(css.includes(`${token}:`), `${property}: ${token} must exist`);
    }
  }
});

test('matching captions, controls and paragraphs retain the same semantic sizes', () => {
  const groups = {
    caption: ['.sc-page small', '.sc-demo-caption', '.sc-walkthrough-disclaimer', '.sc-file-path', '.sc-answer-input small', '.sc-demo-switch-note'],
    control: ['.sc-button', '.sc-nav-cta', '.sc-nav-links a', '.sc-goal-demo input', '.sc-comparison-options button', '.sc-comparison-reason summary'],
    body: ['.sc-problem-list p', '.sc-understanding-steps p', '.sc-quality-cards p', '.sc-report-outline p', '.sc-answer-input p', '.sc-answer-column > p'],
    'item-title': ['.sc-demo-caption > span:first-child', '.sc-file-navigation strong', '.sc-answer-column h3'],
  };
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [role, selectors] of Object.entries(groups)) {
    for (const selector of selectors) {
      const sizes = rules.filter(([, names]) => names.trim().split(/,\s*/).includes(selector))
        .flatMap(([, , body]) => [...body.matchAll(/font-size:\s*([^;]+);/g)].map(([, size]) => size));
      assert(sizes.length, selector);
      for (const size of sizes) assert.equal(size, `var(--sc-type-${role})`, selector);
    }
  }
});

test('mobile typography scales the body without shrinking captions or controls', () => {
  const base = css.slice(css.indexOf('.sc-page {'), css.indexOf('.sc-page a'));
  assert.match(base, /--sc-type-caption: 14px;/);
  assert.match(base, /--sc-type-control: 16px;/);
  const mobile = css.slice(css.indexOf('@media (max-width: 700px)'));
  assert.match(mobile, /--sc-type-body: 16px;/);
  assert.match(mobile, /--sc-type-lead: 18px;/);
  assert(!mobile.includes('--sc-type-caption:'));
  assert(!mobile.includes('--sc-type-control:'));
});

test('leads with the user problem and keeps the primary product link', () => {
  assert(page.includes('className="sc-hero-summary"'));
  assert(page.includes('className="sc-problem-list"'));
  assert(page.includes('https://skillcanvas-studio.declandeng.chatgpt.site/'));
});

test('first screen preserves the supplied headline and complete explanatory copy', () => {
  assert(page.includes('不用懂 Prompt，也能创建自己的 AI Skill'));
  assert(page.includes('>把你的工作方法</span>'));
  assert(page.includes('>变成专属 AI Skill。</span>'));
  const uninterruptedCopy = page.replace(/<span className="sc-phrase">([^<]+)<\/span>/g, '$1');
  assert(uninterruptedCopy.includes('从一句目标开始，先看 AI 如何完成任务，再通过选项和资料，逐步校准你的工作流程、判断标准与个人偏好。生成后用真实任务验证效果，持续优化。'));
  for (const phrase of ['工作流程', '判断标准', '个人偏好', '真实任务']) assert(page.includes(`<span className="sc-phrase">${phrase}</span>`));
});

test('second screen explains all three problems and concludes with reusable, verifiable methods', () => {
  for (const text of ['为什么需要 SkillCanvas', '你有自己的工作方法，', '重新学。', '每次重新交代', '经验难以说清', '结果难以验证', '成为可复用、可验证的 AI Skill。']) assert(page.includes(text));
  assert(page.includes('className="sc-problem-card"'));
  assert(page.includes('className="sc-problem-takeaway"'));
  assert(page.includes('type="image/webp"'));
  assert(css.includes('.sc-problem-list { grid-template-columns: 1fr; }'));
});

test('problem takeaway is text-only and the closing copy matches the supplied reference', () => {
  const takeaway = page.slice(page.indexOf('<div className="sc-problem-takeaway"'), page.indexOf('</div>', page.indexOf('<div className="sc-problem-takeaway"')));
  assert(!takeaway.includes('<img'));
  assert(!css.includes('.sc-problem-takeaway > img'));
  const closing = page.slice(page.indexOf('<section className="sc-proof"'), page.indexOf('<ShowcaseFooter />'));
  for (const text of ['创建完成后', '把你的专属 Skill，', '带进日常工作。', '把工作流程、参考资料与执行规则保存为 Skill，在支持的 AI 助手中加载，随时复用你的工作方法。', '查看使用指南', 'GitHub · 查看源代码']) assert(closing.includes(text));
  assert(closing.includes('href="/showcase/guide"'));
  assert(closing.includes('/skillcanvas-quality-gate-emoji-640.png'));
  assert(!closing.includes('创建之后怎样使用'));
  const guide = readFileSync(new URL('../app/showcase/guide/page.tsx', import.meta.url), 'utf8');
  for (const text of ['导出你的 Skill', '在支持的 AI 助手中加载', '用日常任务复用与检查', '整个 Skill 文件夹', '配置相应能力与授权']) assert(guide.includes(text));
});

test('new card illustrations are local, appropriately sized, transparent PNGs with WebP alternatives', () => {
  for (const scene of ['context', 'experience', 'validation']) {
    const png = readFileSync(new URL(`../public/showcase-illustrations/problem-${scene}-640.png`, import.meta.url));
    const webp = readFileSync(new URL(`../public/showcase-illustrations/problem-${scene}-640.webp`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 640);
    assert.equal(png.readUInt32BE(20), 640);
    assert.equal(png[25], 6, 'RGBA PNG preserves alpha');
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    assert(webp.length < 150_000, `${scene}: optimized web asset`);
  }
});

test('main narrative follows problem, origin, method, example, validation and proof', () => {
  const sections = ['problem', 'origin', 'method', 'example', 'anatomy', 'validation', 'engineering-teaser', 'proof'];
  const indexes = sections.map(name => page.indexOf(`className="sc-${name}"`));
  assert(indexes.every((value, index) => value >= 0 && (index === 0 || value > indexes[index - 1])));
});

test('third screen uses the supplied copy, preserves the original picture and explains three steps', () => {
  const origin = page.slice(page.indexOf('<section className="sc-origin"'), page.indexOf('<section className="sc-method"'));
  for (const copy of ['怎样了解你的方法', '你不用一次说清，', 'AI 帮你逐步补全。', '从一句目标开始，AI 先展示理解结果，再围绕工作流程、判断标准和个人偏好主动提问。你只需要选择、校正或补充资料。']) assert(origin.includes(copy));
  assert(origin.includes('/skillcanvas-unclear-intent-emoji-640.avif'));
  assert(origin.includes('/skillcanvas-unclear-intent-emoji-640.png'));
  for (const copy of ['从一句目标开始', '简单描述你希望 AI 完成的工作', '先预演，再主动提问', '通过具体结果发现可能遗漏的要求', '选择与校正', '逐步明确流程、标准与个人偏好']) assert(page.includes(copy));
  assert(origin.includes('<ol className="sc-understanding-steps">'));
  assert(origin.includes('understanding-${art}-320.webp'));
  assert(!origin.includes('<blockquote>'));
  assert(css.includes('grid-template-columns: 64px minmax(0, 1fr)'));
});

test('third screen illustrations have transparent, optimized local alternatives', () => {
  for (const scene of ['goal', 'preview', 'calibration']) {
    const png = readFileSync(new URL(`../public/showcase-illustrations/understanding-${scene}-320.png`, import.meta.url));
    const webp = readFileSync(new URL(`../public/showcase-illustrations/understanding-${scene}-320.webp`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 320);
    assert.equal(png.readUInt32BE(20), 320);
    assert.equal(png[25], 6);
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    assert(webp.length < 60_000);
  }
});

test('shows a concrete example rather than an abstract requirements grid', () => {
  assert(page.includes('<PersonalizationDemo heading='));
  assert(page.includes('同一句需求，'));
  assert(page.includes('也能做出符合你的 Skill。'));
  assert(page.includes('同样一句目标，你的选择会改变 Skill 的注意重点与工作方式。'));
  assert(examples.includes('并非用户实测结果'));
  assert(!page.includes('16 维 AI 选项式需求澄清'));
});

test('provides dedicated examples and engineering pages', () => {
  for (const title of ['基金周报助手', '竞品研究助手', '写作修改助手']) assert(examples.includes(title));
  assert(engineering.includes('SkillIR'));
  assert(engineering.includes('DetailList items={capabilityItems}'));
  assert(engineering.includes('DetailList items={evalItems}'));
  assert(shell.includes('/showcase/examples'));
  assert(shell.includes('/showcase/engineering'));
});

test('skill anatomy uses the supplied warm file-preview composition and copy', () => {
  const anatomy = page.slice(page.indexOf('<section className="sc-anatomy"'), page.indexOf('<section className="sc-validation"'));
  for (const text of ['把经验与偏好，变成专属 Skill。', '你确认的工作流程、判断标准、资料来源和行为边界，会成为 AI 执行任务时遵循的规则。', '这些要求会保存为结构化文件，在执行任务时供 AI 读取和遵循。', '<SkillFileExplorer />']) assert(anatomy.includes(text));
  assert(!anatomy.includes('sc-file-context'));
  assert(css.includes('.sc-anatomy { background: #f3ead3;'));
  assert(css.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);'));
  assert(css.includes('.sc-file-layout { grid-template-columns: 1fr; }'));
});

test('uses semantic title lines instead of accidental browser wrapping', () => {
  assert(page.includes('className="sc-title-line"'));
  assert(examples.includes('className="sc-title-line"'));
  assert(engineering.includes('className="sc-title-line"'));
  assert.match(css, /\.sc-title-line \{ display: block;/);
});

test('validation has a short introduction, one comparison and honest optimization boundaries', () => {
  const section = page.slice(page.indexOf('<section className="sc-validation"'), page.indexOf('<section className="sc-engineering-teaser"'));
  assert(section.includes('你的工作规则，'));
  assert(section.includes('AI 真的会遵守吗？'));
  assert(section.includes('给普通 AI 和加载 Skill 的 AI 同一段工作记录'));
  assert(section.includes('<AnswerComparison />'));
  assert(section.includes('针对性优化 Skill，再通过回归测试确认是否改善。'));
  assert(section.includes('仍需在实际使用的 AI 助手中验证。'));
  assert(!section.includes('sc-diagnosis-list'));
  assert(!section.includes('sc-validation-rule'));
  assert(!css.includes('.sc-answer-column button'));
  assert(!css.includes('.sc-comparison-reason { min-height:'));
});

test('later sections reuse four distinct task-matched 3D illustrations without crowding mobile copy', () => {
  const validation = page.slice(page.indexOf('<section className="sc-validation"'), page.indexOf('<section className="sc-engineering-teaser"'));
  assert(validation.includes('className="sc-validation-intro"'));
  assert(validation.includes('src="/showcase-icons/eval.png"'));
  assert(validation.includes('loading="lazy" decoding="async"'));
  for (const [title, art] of [['规则检查', 'independent-check'], ['任务验证', 'regression'], ['版本决策', 'rollback']]) {
    assert(page.includes(`title: "${title}", art: "${art}"`));
  }
  for (const art of ['eval', 'independent-check', 'regression', 'rollback']) {
    const png = readFileSync(new URL(`../public/showcase-icons/${art}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[25], 6, 'transparent RGBA artwork');
  }
  assert.match(css, /\.sc-validation-intro \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(180px, \.32fr\)/);
  assert.match(css, /\.sc-validation-copy h2 \{ grid-column: 1 \/ -1; grid-row: 2;/);
  assert.match(css, /\.sc-validation-art \{ grid-column: 2; grid-row: 1; height: 96px; width: 96px;/);
});

test('quality section uses the supplied three-card composition and complete copy', () => {
  const section = page.slice(page.indexOf('<section className="sc-engineering-teaser"'), page.indexOf('<section className="sc-proof"'));
  for (const text of ['系统怎样检查质量', '你的每一项要求，都有据可查。', '从需求确认到 Skill 生成，再到实际任务验证，系统会持续检查规则、执行结果与版本变化。', '效果改善，接受新版本；效果退化，保留原版本。', '了解质量检查机制']) assert(section.includes(text));
  for (const text of ['规则检查', '任务验证', '版本决策', '检查用户确认的要求是否保留、规则是否冲突，以及工作流和工具能力是否完整。', '运行测试任务，对比生成效果，并重新检查此前已经通过的任务。', '只有通过验证的候选版本才能晋级；效果变差时保留原版本，并定位问题继续修复。']) assert(page.includes(text));
  assert(section.includes('<ol className="sc-quality-cards"'));
  assert(section.includes('href="/showcase/engineering"'));
  assert(!section.includes('<BuildFlowExplorer'));
  assert(!section.includes('sc-teaser-icon'));
  assert(css.includes('background: #f5ecdc;'));
  assert(css.includes('.sc-quality-cards { grid-template-columns: 1fr; }'));
  assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
});

test('quality icons are local Tabler vectors with consistent strokes and retained license', () => {
  for (const icon of ['clipboard-check', 'flask', 'git-branch', 'circle-check']) {
    const svg = readFileSync(new URL(`../public/icons/tabler/${icon}.svg`, import.meta.url), 'utf8');
    assert(svg.includes('viewBox="0 0 24 24"'));
    assert(svg.includes('stroke-width="2"'));
    assert(!svg.includes('<script'));
    assert(!svg.includes('<image'));
  }
  assert(readFileSync(new URL('../public/icons/tabler/LICENSE.txt', import.meta.url), 'utf8').includes('MIT'));
  assert(css.includes('mask-size: contain;'));
});

test('mobile navigation remains available and layout collapses without hiding content', () => {
  assert(!css.includes('.sc-nav-links { display: none; }'));
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.sc-example-board, \.sc-compare-runs, \.sc-case-flow, \.sc-pipeline \{ grid-template-columns: 1fr; \}/);
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

test('uses distinct generated icons for methods and case studies', () => {
  const assets = [
    'goal.png', 'interview.png', 'skill-build.png', 'compare.png',
    'calendar-simple.png', 'competitor.png', 'writing.png', 'system-hub.png',
    'single-source.png', 'independent-check.png',
  ];
  for (const asset of assets) assert(page.includes(asset) || examples.includes(asset) || engineering.includes(asset), asset);
  assert.match(page, /loading="lazy"/);
  assert.match(css, /\.sc-step-icon/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('adds restrained progressive motion without scroll hijacking', () => {
  assert(page.includes('<ShowcaseMotion />'));
  assert(page.includes('data-sc-reveal'));
  assert(motion.includes('IntersectionObserver'));
  assert(motion.includes('observer.unobserve'));
  assert(motion.includes('prefers-reduced-motion'));
  assert(!motion.includes('addEventListener("scroll"'));
  assert(!motion.includes('requestAnimationFrame'));
  assert(css.includes('--sc-ease-out'));
  assert(css.includes('@keyframes sc-hero-enter'));
  assert(css.includes('.sc-motion-ready'));
  assert(css.includes('@media (hover: hover) and (pointer: fine)'));
  assert(!css.includes('transition: all'));
});

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

test('primary text and controls meet AA contrast', () => {
  const pairs = [
    ['132822', 'f4f0e8'],
    ['59665f', 'f4f0e8'],
    ['132822', 'fcfaf6'],
    ['59665f', 'fcfaf6'],
    ['132822', 'eadfcb'],
    ['59665f', 'eadfcb'],
    ['132822', 'f6f0e5'],
    ['59665f', 'f6f0e5'],
    ['ffffff', 'b53223'],
    ['ffffff', '132822'],
  ];
  for (const [foreground, background] of pairs) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05);
    assert(ratio >= 4.5, `${foreground} / ${background}: ${ratio.toFixed(2)}:1`);
  }
});

test('every text token stays readable across the entire warm background palette', () => {
  for (const token of ['ink', 'muted', 'green', 'red']) {
    const foreground = css.match(new RegExp(`--sc-${token}: #([\\da-f]{6});`, 'i'))[1];
    for (const background of ['f4f0e8', 'fcfaf6', 'eadfcb', 'f6f0e5']) {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      const ratio = (values[0] + .05) / (values[1] + .05);
      assert(ratio >= 4.5, `${token} / ${background}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test('background changes with ordinary scrolling without browser-specific animation support', () => {
  const pageRules = css.slice(css.indexOf('.sc-page {'), css.indexOf('.sc-page a'));
  assert(pageRules.includes('linear-gradient(180deg,'));
  for (const stop of ['var(--sc-bg) 0%', '#fcfaf6 23%', '#eadfcb 52%', '#f6f0e5 78%', 'var(--sc-bg) 100%']) {
    assert(pageRules.includes(stop));
  }
  assert(pageRules.includes('background-attachment: scroll'));
  assert(!css.includes('animation-timeline'));
  assert(!css.includes('.sc-page::before'));
  assert(!css.includes('.sc-page::after'));
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.sc-page \{ background: var\(--sc-bg\); \}/);
});
