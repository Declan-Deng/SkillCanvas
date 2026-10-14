import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const compile = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const dataSource = readFileSync(new URL("../app/showcase/showcase-demo-data.ts", import.meta.url), "utf8");
const dataUrl = moduleUrl(compile(dataSource));
const data = await import(dataUrl);
const arrowUrl = moduleUrl(compile(readFileSync(new URL("../app/showcase/showcase-arrow.tsx", import.meta.url), "utf8")).replace(/from "([^"]+)"/g, (_, path) => `from "${import.meta.resolve(path)}"`));

test("shared arrows render decorative SVG masks in every required direction", async () => {
  const { ShowcaseArrow } = await import(arrowUrl);
  for (const direction of ['right', 'up-right', 'down', 'back-up']) {
    const icon = ShowcaseArrow({ direction });
    assert.equal(icon.props['aria-hidden'], 'true');
    assert.equal(icon.props.children, undefined);
    assert.equal(icon.props.style.maskImage, `url("/icons/tabler/arrow-${direction}.svg")`);
    assert(renderToStaticMarkup(icon).includes('class="sc-arrow"'));
  }
});

test("all four preference combinations preserve factual boundaries and change the report", () => {
  const results = [];
  for (const audience of ["self", "team"]) for (const focus of ["changes", "risks"]) {
    const result = data.makeReportPreview(audience, focus);
    assert.equal(result.structure[0], focus === "risks" ? "风险与待确认" : "本周变化");
    assert.equal(result.recipient, audience === "team" ? "给团队看" : "给自己看");
    assert(result.rules.some(rule => rule.includes("不自行补齐")));
    assert.equal(new Set(result.structure).size, 3);
    assert.deepEqual(result.sections.map(section => section.title), result.structure);
    assert(result.sections.every(section => section.detail.length > 10));
    results.push(JSON.stringify(result));
  }
  assert.equal(new Set(results).size, 4);
});

// Exercise the actual event handlers and re-render their JSX without browser control.
// A tiny state adapter replaces only useState; real React renders the returned tree.
async function demoDriver() {
  const stateUrl = moduleUrl(`let values = [], cursor = 0;
    export function begin(){ cursor = 0; }
    export function reset(){ values = []; cursor = 0; }
    export function useState(initial){ const slot = cursor++; if (!(slot in values)) values[slot] = initial;
      return [values[slot], value => { values[slot] = typeof value === 'function' ? value(values[slot]) : value; }]; }`);
  const state = await import(stateUrl);
  state.reset();
  const source = readFileSync(new URL("../app/showcase/showcase-demos.tsx", import.meta.url), "utf8");
  const compiled = compile(source).replace(/from "([^"]+)"/g, (_, path) => `from "${path === "react" ? stateUrl : path === "./showcase-demo-data" ? dataUrl : path === "./showcase-arrow" ? arrowUrl : import.meta.resolve(path)}"`);
  const components = await import(moduleUrl(compiled));
  return { render(name, props = {}) { state.begin(); return components[name](props); }, reset: state.reset };
}

function find(tree, predicate) {
  if (Array.isArray(tree)) { for (const child of tree) { const result = find(child, predicate); if (result) return result; } }
  else if (tree && typeof tree === "object") { if (predicate(tree)) return tree; return find(tree.props?.children, predicate); }
}

test("nearby preference feedback stays synchronized with the complete report", async () => {
  const driver = await demoDriver();
  for (const audience of ['team', 'self', 'team']) {
    find(driver.render('PersonalizationDemo'), el => el.type === 'input' && el.props.value === audience).props.onChange();
    const tree = driver.render('PersonalizationDemo');
    const feedback = find(tree, el => el.props.className === 'sc-selection-feedback');
    const report = data.makeReportPreview(audience, audience === 'team' ? 'risks' : 'changes');
    const html = renderToStaticMarkup(feedback);
    assert.equal(feedback.props.role, 'status');
    for (const text of [report.recipient, report.sections[0].title, report.sections[0].detail]) assert(html.includes(text));
    assert(renderToStaticMarkup(find(tree, el => el.props.className === 'sc-report-outline')).includes(report.sections[0].detail));
  }
});

test("nearby walkthrough feedback follows every selected step", async () => {
  const driver = await demoDriver();
  for (const index of [2, 0, 3, 1]) {
    chooseWalkthroughStep(driver, index);
    const tree = renderWalkthrough(driver);
    const feedback = find(tree, el => el.props.className === 'sc-selection-feedback');
    assert.equal(feedback.props.role, 'status');
    assert(renderToStaticMarkup(feedback).includes(walkthroughSteps[index].title));
    assert(renderToStaticMarkup(feedback).includes(`${walkthroughSteps[index].number} / 04`));
  }
});

test("preference radio events update the visible preview and selected state", async () => {
  const driver = await demoDriver();
  let tree = driver.render("PersonalizationDemo");
  find(tree, el => el.type === "input" && el.props.value === "team").props.onChange();
  tree = driver.render("PersonalizationDemo");
  assert.equal(find(tree, el => el.type === "input" && el.props.value === "team").props.checked, true);
  assert.match(renderToStaticMarkup(tree), /团队基金周报/);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /风险与待确认/);
  assert(html.indexOf("风险与待确认") < html.indexOf("本周变化"));
  assert.match(html, /未指定负责人时标注待确认/);
  assert.match(html, /人工|预设示意/);
  assert.match(html, /name="sc-report-audience"/);
  assert(!html.includes("sc-report-focus"));
  find(tree, el => el.type === "input" && el.props.value === "self").props.onChange();
  const self = renderToStaticMarkup(driver.render("PersonalizationDemo"));
  assert(self.indexOf("本周变化") < self.indexOf("风险与待确认"));
  for (const text of ["我的基金观察周报", "先列变化，再解释证据。", "不直接替你做投资判断。", "缺失数据时明确标注，不自行补齐。"]) assert(self.includes(text));
});

test("personalized example places its heading with the single question and shows three complete preview rows", async () => {
  const driver = await demoDriver();
  const tree = driver.render("PersonalizationDemo", { heading: "同一句需求，也能做出符合你的 Skill。" });
  const preferences = renderToStaticMarkup(find(tree, el => el.props.className === "sc-preferences"));
  assert(preferences.includes("同一句需求"));
  assert(preferences.includes("你的目标"));
  assert.equal((preferences.match(/<fieldset/g) || []).length, 1);
  assert.equal((preferences.match(/type="radio"/g) || []).length, 2);
  assert.equal(find(tree, el => el.props.value === "self").props.checked, true);
  const preview = renderToStaticMarkup(find(tree, el => el.props.className === "sc-personalized-output"));
  assert(!preview.includes("同一句需求"));
  assert(preview.includes("Skill 输出预览"));
  assert(preview.includes("预设示意，非 AI 实时生成"));
  assert(preview.includes("/showcase-icons/weekly-report.png"));
  const outline = renderToStaticMarkup(find(tree, el => el.props.className === "sc-report-outline"));
  assert.equal((outline.match(/<p>/g) || []).length, 3);
});

test("approved comparison displays the complete input, rules and both answers without switching", async () => {
  const html = renderToStaticMarkup((await demoDriver()).render("AnswerComparison"));
  for (const text of ["转化率尚未统计", "影响待确认", "不编造数据", "风险单独说明", "发送前先确认", "接口联调仍在推进", "下周计划开展灰度上线", "请核对内容后再生成正式周报", "遗漏待统计指标，弱化了风险", "保留事实，说明风险，等待确认"]) assert(html.includes(text), text);
  assert(!html.includes("项目整体进展顺利"));
  assert(!html.includes("需确认好接口依赖"));
  assert.equal((html.match(/<article/g) || []).length, 2);
  assert.equal((html.match(/<strong>/g) || []).length, 4);
  assert(html.includes("/icons/tabler/shield-exclamation.svg"));
  assert(html.includes("/icons/tabler/circle-check.svg"));
});

test("comparison starts with one readable pair and makes its illustrative status explicit", async () => {
  const tree = (await demoDriver()).render("AnswerComparison");
  const html = renderToStaticMarkup(tree);
  assert(html.includes("以上为人工编写的对比示意，实际模型表现应通过测试验证。"));
  assert(html.includes("加载 Skill 后 · 示例"));
  assert.equal((html.match(/<button/g) || []).length, 0);
  assert.equal((html.match(/<details/g) || []).length, 0);
  assert(!html.includes("<blockquote"));
  assert(html.includes('aria-label="已确认的工作规则"'));
});

test("all four file selections render readable rules and exactly one selected check", async () => {
  const driver = await demoDriver();
  for (const item of data.skillFileExamples) {
    find(driver.render("SkillFileExplorer"), el => el.type === "button" && renderToStaticMarkup(el).includes(item.label)).props.onClick();
    const tree = driver.render("SkillFileExplorer");
    const content = find(tree, el => el.props?.id === "sc-file-content");
    const html = renderToStaticMarkup(content);
    assert(html.includes(item.path));
    assert(html.includes(item.label));
    assert(html.includes(item.intro));
    for (const rule of item.rules) assert(html.includes(rule));
    assert.equal((html.match(/<li>/g) || []).length, item.rules.length);
    const whole = renderToStaticMarkup(tree);
    assert.equal((whole.match(/aria-pressed="true"/g) || []).length, 1);
    assert.equal((whole.match(/<img[^>]+src="\/icons\/tabler\/check.svg"/g) || []).length, 1);
    assert(renderToStaticMarkup(find(tree, el => el.type === "button" && el.props["aria-pressed"] === true)).includes(item.label));
    assert(!html.includes("<code>"));
  }
});

test("file preview defaults to workflow and preserves confirmation, source and permission boundaries", async () => {
  const driver = await demoDriver();
  const html = renderToStaticMarkup(driver.render("SkillFileExplorer"));
  for (const text of ["基金周报 Skill · 文件预览", "演示内容", "工作流程", "等你确认后再撰写正文"]) assert(html.includes(text));
  assert.equal(data.skillFileExamples.length, 4);
  const rules = data.skillFileExamples.flatMap(file => file.rules).join(" ");
  for (const text of ["缺失数据", "来源和材料日期", "不能改写已确认的工作方式", "不替你作投资决定", "AI 不能代替你确认", "不假装执行成功"]) assert(rules.includes(text));
});

test("all workflow nodes expose their own input, output and check", async () => {
  const driver = await demoDriver();
  for (const item of data.buildNodes) {
    find(driver.render("BuildFlowExplorer"), el => el.type === "button" && renderToStaticMarkup(el).includes(item.title)).props.onClick();
    const content = find(driver.render("BuildFlowExplorer"), el => el.props?.id === "sc-build-detail");
    const html = renderToStaticMarkup(content);
    for (const text of [item.title, item.input, item.output, item.check]) assert(html.includes(text));
  }
});

test("walkthrough next buttons cycle all steps and retain complete explanations", async () => {
  const driver = await demoDriver();
  const steps = Array.from({ length: 4 }, (_, index) => ({ number: `0${index + 1}`, title: `任务${index + 1}`, detail: `完整说明${index + 1}`, followup: `后续说明${index + 1}`, icon: "/showcase-icons/goal.png" }));
  for (let index = 0; index < 5; index++) {
    const tree = driver.render("MethodWalkthrough", { steps });
    const preview = find(tree, el => el.props?.id === "sc-method-preview");
    assert(renderToStaticMarkup(preview).includes(steps[index % 4].title));
    const selected = find(tree, el => el.type === "button" && el.props["aria-pressed"] === true);
    assert(renderToStaticMarkup(selected).includes(steps[index % 4].title));
    assert(renderToStaticMarkup(preview).includes(steps[index % 4].detail));
    assert(renderToStaticMarkup(preview).includes(steps[index % 4].followup));
    find(tree, el => el.type === "button" && el.props["data-walkthrough-next"] === true).props.onClick();
  }
});

const walkthroughSteps = Array.from({ length: 4 }, (_, index) => ({ number: `0${index + 1}`, title: `任务${index + 1}`, detail: `说明${index + 1}`, followup: `后续${index + 1}`, icon: "/showcase-icons/goal.png" }));
const renderWalkthrough = driver => driver.render("MethodWalkthrough", { steps: walkthroughSteps, heading: "从一句目标开始" });
const chooseWalkthroughStep = (driver, index) => find(renderWalkthrough(driver), el => el.type === "button" && el.props["aria-controls"] === "sc-method-preview" && renderToStaticMarkup(el).includes(walkthroughSteps[index].title)).props.onClick();

test("compact walkthrough labels keep complete accessible names and preview titles", async () => {
  const driver = await demoDriver();
  const labels = ["说出目标", "校正做法", "生成 Skill", "对比效果"];
  for (const index of [0, 1, 2, 3]) {
    chooseWalkthroughStep(driver, index);
    const tree = renderWalkthrough(driver);
    const selected = find(tree, el => el.type === 'button' && el.props['aria-pressed'] === true);
    assert.equal(selected.props['aria-label'], walkthroughSteps[index].title);
    const short = find(selected, el => el.props.className === 'sc-step-label-compact');
    assert.equal(short.props.children, labels[index]);
    assert.equal(short.props['aria-hidden'], 'true');
    assert(renderToStaticMarkup(find(tree, el => el.props.id === 'sc-method-preview')).includes(walkthroughSteps[index].title));
  }
});

test("walkthrough step selection synchronizes its title, illustration and four-dot progress", async () => {
  const driver = await demoDriver();
  for (const index of [3, 1, 2, 0]) {
    chooseWalkthroughStep(driver, index);
    const tree = renderWalkthrough(driver);
    const progress = find(tree, el => el.props.className === "sc-walkthrough-progress");
    assert.equal(progress.props.children.length, 4);
    assert(renderToStaticMarkup(find(progress, el => el.props["aria-current"] === "step")).includes(walkthroughSteps[index].title));
    assert(renderToStaticMarkup(find(tree, el => el.props.id === "sc-method-preview")).includes(`${walkthroughSteps[index].number} / 04`));
    assert(renderToStaticMarkup(tree).includes("从一句目标开始"));
  }
});

test("walkthrough goal input and suggestion chips work, retain input and reject blank submissions", async () => {
  const driver = await demoDriver();
  find(renderWalkthrough(driver), el => el.type === "button" && el.props.children === "每日学习计划").props.onClick();
  assert.equal(find(renderWalkthrough(driver), el => el.props.id === "sc-demo-goal").props.value, "帮我做一个每日学习计划");
  find(renderWalkthrough(driver), el => el.props.id === "sc-demo-goal").props.onChange({ target: { value: "   " } });
  let tree = renderWalkthrough(driver);
  assert.equal(find(tree, el => el.type === "button" && el.props.type === "submit").props.disabled, true);
  find(tree, el => el.type === "form").props.onSubmit({ preventDefault() {} });
  assert(find(renderWalkthrough(driver), el => el.props.id === "sc-demo-goal"));
  find(renderWalkthrough(driver), el => el.props.id === "sc-demo-goal").props.onChange({ target: { value: "帮我写周报" } });
  find(renderWalkthrough(driver), el => el.type === "form").props.onSubmit({ preventDefault() {} });
  assert(find(renderWalkthrough(driver), el => el.type === "fieldset"));
  chooseWalkthroughStep(driver, 0);
  assert.equal(find(renderWalkthrough(driver), el => el.props.id === "sc-demo-goal").props.value, "帮我写周报");
});

test("walkthrough radio selection is centered native input and persists across steps", async () => {
  const driver = await demoDriver();
  chooseWalkthroughStep(driver, 1);
  find(renderWalkthrough(driver), el => el.type === "input" && el.props.value === 2).props.onChange();
  assert.match(renderToStaticMarkup(renderWalkthrough(driver)), /从清单提取信息/);
  chooseWalkthroughStep(driver, 3);
  chooseWalkthroughStep(driver, 1);
  assert.equal(find(renderWalkthrough(driver), el => el.type === "input" && el.props.value === 2).props.checked, true);
});

test("walkthrough files are task-dependent and comparison is explicitly illustrative", async () => {
  const driver = await demoDriver();
  chooseWalkthroughStep(driver, 2);
  let html = renderToStaticMarkup(renderWalkthrough(driver));
  for (const text of ["SKILL.md", "references/", "tools.json", "按需生成", "文件结构示例"]) assert(html.includes(text));
  chooseWalkthroughStep(driver, 3);
  html = renderToStaticMarkup(renderWalkthrough(driver));
  for (const text of ["普通 AI 示例", "加载 Skill 后的示例", "非实测结果", "按你的结构生成", "按约定等你确认"]) assert(html.includes(text));
});

test("demos remain local, accessible and responsive with no new network dependency", () => {
  const source = readFileSync(new URL("../app/showcase/showcase-demos.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/showcase/showcase.css", import.meta.url), "utf8");
  assert(!/fetch\(|setInterval|setTimeout|addEventListener/.test(source));
  assert(source.includes('aria-live="polite"'));
  assert(source.includes('aria-pressed='));
  assert(source.includes('<fieldset>'));
  assert(css.includes('.sc-walkthrough, .sc-personalization, .sc-answer-columns { grid-template-columns: 1fr; }'));
  assert(css.includes('.sc-file-layout { grid-template-columns: 1fr; }'));
  assert(css.includes('@starting-style'));
  assert(css.includes('.sc-swap { transition: none; }'));
});
