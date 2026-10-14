"use client";

import type { ComparisonBenefit } from "./comparison-presentation";

export function ComparisonBenefits({ benefits }: { benefits: ComparisonBenefit[] }) {
  if (!benefits.length) return null;
  return (
    <section className="demo-improvement-summary" aria-label="相比普通 AI，具体好在哪里">
      <div className="demo-improvement-heading"><span>对照测试中观察到的提升</span><strong>相比普通 AI，具体好在哪里</strong></div>
      <ul>{benefits.slice(0, 3).map((benefit) => (
        <li className="improved" key={benefit.caseId}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          <div>
            <strong>{benefit.title}</strong>
            {benefit.baseline && benefit.skill
              ? <dl className="demo-benefit-comparison"><div><dt>普通 AI</dt><dd>{benefit.baseline}</dd></div><div><dt>你的 Skill</dt><dd>{benefit.skill}</dd></div></dl>
              : <p>{benefit.detail}</p>}
            <details className="demo-benefit-task"><summary>查看测试场景</summary><p>{benefit.task}</p></details>
          </div>
        </li>
      ))}</ul>
      <p className="demo-benefit-scope">仅针对这些测试场景，不代表所有任务都有提升。</p>
    </section>
  );
}
