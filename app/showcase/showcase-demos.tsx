"use client";

import { useState, type ReactNode } from "react";
import { ShowcaseArrow } from "./showcase-arrow";
import { buildNodes, makeReportPreview, skillFileExamples, type ReportAudience } from "./showcase-demo-data";

type MethodStep = { number: string; title: string; detail: string; followup: string; icon: string };

const walkthroughChoices = ["粘贴零散记录，再由 AI 归类", "先按固定栏目整理好", "上传已有的任务清单"];
const walkthroughHints = ["AI 先归类，你确认后再写正文。", "沿用你的栏目，不擅自改变结构。", "从清单提取信息，缺失内容会向你确认。"];
const walkthroughShortLabels = ["说出目标", "校正做法", "生成 Skill", "对比效果"];

export function MethodWalkthrough({ steps, heading }: { steps: MethodStep[]; heading?: ReactNode }) {
  const [active, setActive] = useState(0);
  const [goal, setGoal] = useState("帮我做一个周报助手");
  const [inputMode, setInputMode] = useState(0);
  const step = steps[active];
  return (
    <div className="sc-walkthrough" data-sc-reveal>
      <div className="sc-walkthrough-guide">
      {heading}
      <ol className="sc-walkthrough-steps" aria-label="选择想了解的步骤">
        {steps.map((item, index) => (
          <li key={item.number} data-active={active === index}>
            <button type="button" aria-label={item.title} aria-pressed={active === index} aria-controls="sc-method-preview" onClick={() => setActive(index)}>
              <span className="sc-step-number">{item.number}</span>
              <span><strong><span className="sc-step-label-full">{item.title}</span><span className="sc-step-label-compact" aria-hidden="true">{walkthroughShortLabels[index] ?? item.title}</span></strong><small>{index === 0 ? "从你的目标开始" : index === 1 ? "AI 预选，你来校正" : index === 2 ? "方法与资料一起保存" : "用同一任务比较回答"}</small></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="sc-selection-feedback" role="status" aria-atomic="true"><small>当前演示 · {step.number} / 04</small><strong>{step.title}</strong></div>
      </div>
      <div className="sc-walkthrough-preview" id="sc-method-preview" role="region" aria-label="步骤演示" aria-live="polite">
        <div className="sc-demo-caption"><span>定制过程示意</span><span>{step.number} / 04</span></div>
        <p className="sc-walkthrough-disclaimer">周报助手预设演示 · 不调用 AI</p>
        <ol className="sc-walkthrough-progress" aria-label="演示进度">{steps.map((item, index) => <li key={item.number} aria-current={index === active ? "step" : undefined} data-complete={index < active}><span className="sc-sr-only">第 {index + 1} 步：{item.title}</span></li>)}</ol>
        <div className="sc-preview-stage sc-swap" key={active}>
          <img className="sc-stage-illustration" src={step.icon} width="144" height="144" alt="" loading="lazy" />
          <h3>{step.title}</h3>
          {active === 0 && <><form className="sc-goal-demo" onSubmit={event => { event.preventDefault(); if (goal.trim()) setActive(1); }}><label className="sc-sr-only" htmlFor="sc-demo-goal">你想完成的任务（演示输入）</label><input id="sc-demo-goal" value={goal} onChange={event => setGoal(event.target.value)} placeholder="简单说说你希望 AI 做什么" required maxLength={160} /><button type="submit" aria-label="查看下一步演示" disabled={!goal.trim()}><img src="/icons/tabler/send.svg" width="20" height="20" alt="" /></button></form><div className="sc-goal-suggestions"><strong>你可以这样描述：</strong><div>{["日常工作助手", "竞品研究报告", "市场分析", "每日学习计划"].map(item => <button key={item} type="button" onClick={() => setGoal(`帮我做一个${item}`)}>{item}</button>)}</div></div><p className="sc-preview-note">不用写完整提示词，直接说出你的目标即可。</p></>}
          {active === 1 && <><p>AI 根据你的目标，提出一些可能需要确认的问题。</p><fieldset className="sc-choice-illustration"><legend>每周的工作记录怎么交给 AI？</legend>{walkthroughChoices.map((choice, index) => <label key={choice} data-selected={inputMode === index}><input type="radio" name="sc-walkthrough-input" value={index} checked={inputMode === index} onChange={() => setInputMode(index)} /><span>{choice}</span></label>)}</fieldset><p className="sc-preview-note">{walkthroughHints[inputMode]}</p></>}
          {active === 2 && <><p>系统会结合你确认的要求，整理资料并生成可复用的 Skill。</p><ul className="sc-mini-files">{[["SKILL.md", "工作流程与执行步骤", "已生成"], ["references/", "个人资料与判断标准", "已整理"], ["tools.json", "可使用的工具与接口", "按需生成"]].map(([file, description, status]) => <li key={file}><img src={file === "references/" ? "/icons/tabler/folder.svg" : "/icons/tabler/file-description.svg"} width="24" height="24" alt="" /><span><b>{file}</b><small>{description}</small></span><em>{status}</em></li>)}</ul><p className="sc-preview-note">文件结构示例。实际文件按任务需要生成，不强制增加工具。</p></>}
          {active === 3 && <><p>用同一个任务，比较普通 AI 和加载 Skill 后的回答。</p><div className="sc-mini-comparison"><div><small>普通 AI 示例</small><p>直接写完整周报</p><ul><li>可能改变你的格式</li><li>缺少你的资料</li><li>未经确认就写正文</li></ul></div><div><small>加载 Skill 后的示例</small><p>先归类，确认后再写</p><ul><li>按你的结构生成</li><li>引用你的资料</li><li>按约定等你确认</li></ul></div></div><p className="sc-preview-note">预设回答示意，非实测结果。实际表现需要用你的任务验证。</p></>}
        </div>
        <div className="sc-demo-next"><span>{active === 3 ? "发现不符合的地方，再调整要求并重新测试。" : "可以选择、修改或补充，让 AI 更懂你的工作习惯。"}</span><button type="button" data-walkthrough-next onClick={() => setActive((active + 1) % steps.length)}>{active === 3 ? "从头看看" : "下一步"}<ShowcaseArrow /></button></div>
        <details className="sc-walkthrough-details" key={`details-${active}`}><summary>了解这一步</summary><p>{step.detail}</p><p>{step.followup}</p></details>
      </div>
    </div>
  );
}

export function PersonalizationDemo({ heading }: { heading?: ReactNode } = {}) {
  const [audience, setAudience] = useState<ReportAudience>("self");
  const report = makeReportPreview(audience, audience === "team" ? "risks" : "changes");
  return (
    <div className="sc-personalization" data-sc-reveal>
      <div className="sc-preferences">
        {heading}
        <p className="sc-demo-goal-label">你的目标</p>
        <blockquote className="sc-demo-request">“帮我做一个基金周报助手。”</blockquote>
        <fieldset><legend>这份周报给谁看？</legend><div className="sc-option-pair">{([['self', '给自己看', '关注变化、证据与下一步'], ['team', '给团队看', '突出风险、协作与待确认事项']] as const).map(([value, title, detail]) => <label key={value} data-selected={audience === value}><input type="radio" name="sc-report-audience" value={value} checked={audience === value} onChange={() => setAudience(value)} /><strong>{title}</strong><small>{detail}</small></label>)}</div></fieldset>
        <div className="sc-selection-feedback" role="status" aria-atomic="true"><small>当前预览重点 · {report.recipient}</small><strong>{report.sections[0].title}</strong><p>{report.sections[0].detail}</p></div>
        <p className="sc-demo-switch-note">切换选项，观察 Skill 输出如何变化。</p>
      </div>
      <div className="sc-personalized-output" aria-live="polite" aria-atomic="true">
        <div className="sc-demo-caption"><span>Skill 输出预览</span><span>预设示意，非 AI 实时生成</span></div>
        <div className="sc-swap" key={audience}>
          <div className="sc-report-heading"><img src="/showcase-icons/weekly-report.png" width="96" height="96" alt="" loading="lazy" decoding="async" /><div><small>{report.recipient}</small><h3>{report.title}</h3></div></div>
          <ol className="sc-report-outline">{report.sections.map(({ title, detail }, index) => <li key={title}><span>{String(index + 1).padStart(2, '0')}</span><strong>{title}</strong><p>{detail}</p></li>)}</ol>
          <div className="sc-rule-receipt"><span>这会成为 Skill 的工作规则</span>{report.rules.map(rule => <p key={rule}>{rule}</p>)}</div>
        </div>
      </div>
    </div>
  );
}

export function AnswerComparison() {
  return (
    <div className="sc-answer-demo sc-answer-demo-summary" data-sc-reveal>
      <div className="sc-demo-caption"><span>测试输入 · 周报助手</span></div>
      <div className="sc-answer-input"><p>本周完成登录改版，转化率尚未统计；接口联调受阻，影响待确认；下周计划灰度上线。</p></div>
      <ul className="sc-answer-rules" aria-label="已确认的工作规则"><li>不编造数据</li><li>风险单独说明</li><li>发送前先确认</li></ul>
      <div className="sc-answer-columns">
        <article className="sc-answer-column">
          <h3>普通 AI · 示例</h3>
          <p>本周完成登录改版，接口联调仍在推进，下周计划开展灰度上线。</p>
          <div className="sc-answer-finding"><span className="sc-answer-finding-icon" style={{ maskImage: 'url("/icons/tabler/shield-exclamation.svg")' }} aria-hidden="true" /><span>遗漏待统计指标，弱化了风险</span></div>
        </article>
        <article className="sc-answer-column sc-answer-personal">
          <h3>加载 Skill 后 · 示例</h3>
          <p><strong>进展：</strong>登录改版完成，转化率待统计。<strong>风险：</strong>接口联调受阻，影响待确认。<strong>计划：</strong>下周拟灰度上线。<strong>待确认：</strong>请核对内容后再生成正式周报。</p>
          <div className="sc-answer-finding"><span className="sc-answer-finding-icon" style={{ maskImage: 'url("/icons/tabler/circle-check.svg")' }} aria-hidden="true" /><span>保留事实，说明风险，等待确认</span></div>
        </article>
      </div>
      <p className="sc-answer-disclaimer">以上为人工编写的对比示意，实际模型表现应通过测试验证。</p>
    </div>
  );
}

export function SkillFileExplorer() {
  const [active, setActive] = useState(0);
  const file = skillFileExamples[active];
  return (
    <div className="sc-file-explorer" data-sc-reveal>
      <div className="sc-demo-caption"><span>基金周报 Skill · 文件预览</span><span>演示内容</span></div>
      <div className="sc-file-layout">
        <div className="sc-file-navigation" role="group" aria-label="选择文件示例">{skillFileExamples.map((item, index) => <button type="button" key={item.path} aria-pressed={active === index} aria-controls="sc-file-content" onClick={() => setActive(index)}><strong>{item.label}</strong><small>{item.path.split('/').pop()}</small>{active === index && <img src="/icons/tabler/check.svg" width="24" height="24" alt="" />}</button>)}</div>
        <div className="sc-file-content" id="sc-file-content" role="region" aria-label="所选文件的规则说明" aria-live="polite" aria-atomic="true"><div className="sc-swap" key={active}><small className="sc-file-path">{file.path}</small><h3>{file.label}</h3><p>{file.intro}</p><ol className="sc-file-rules" aria-label={`${file.label}规则`}>{file.rules.map((rule, index) => <li key={rule}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></li>)}</ol></div></div>
      </div>
    </div>
  );
}

export function BuildFlowExplorer() {
  const [active, setActive] = useState(0);
  const node = buildNodes[active];
  return (
    <div className="sc-build-explorer" data-sc-reveal>
      <ol className="sc-build-path" aria-label="查看每个检查环节">{buildNodes.map((item, index) => <li key={item.title} data-passed={index < active}><button type="button" aria-pressed={active === index} aria-controls="sc-build-detail" onClick={() => setActive(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong></button></li>)}</ol>
      <div className="sc-build-detail" id="sc-build-detail" aria-live="polite" aria-atomic="true"><div className="sc-swap" key={active}><h3>{node.title}</h3><p>{node.detail}</p><dl><div><dt>这一环读取</dt><dd>{node.input}</dd></div><div><dt>这一环交付</dt><dd>{node.output}</dd></div></dl><div className="sc-build-check"><strong>需要守住的要求</strong><p>{node.check}</p></div></div></div>
      <p className="sc-build-return"><ShowcaseArrow direction="back-up" /> 发现问题，回到对应环节修复；候选变差，保留原版。<span>流程示意，不代表实时运行状态。</span></p>
    </div>
  );
}
