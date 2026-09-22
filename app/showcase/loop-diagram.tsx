"use client";

import { useId, useState } from "react";

type LoopStep = { title: string; detail: string; phase: string };

// Preparation is fixed; subsequent optimization rounds return to independent execution.
export function LoopDiagram({ steps }: { steps: LoopStep[] }) {
  const [selected, setSelected] = useState(2);
  const id = useId().replace(/:/g, "");
  const current = steps[selected];
  const next = selected === steps.length - 1 ? 2 : selected + 1;

  function node(index: number) {
    const step = steps[index];
    return (
      <button
        type="button"
        className={`showcase-cycle-node ${step.phase === "Harness" ? "is-harness" : "is-loop"}`}
        aria-pressed={selected === index}
        aria-controls={`${id}-detail`}
        onClick={() => setSelected(index)}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{step.title}</strong>
      </button>
    );
  }

  return (
    <div className="showcase-cycle" aria-label="Eval 与 Optimization Loop 流程">
      <div className="showcase-cycle-preparation">
        <ol>
          <li>{node(0)}</li>
          <li>{node(1)}</li>
        </ol>
      </div>
      <div className="showcase-cycle-entry" aria-hidden="true"><span>进入评测</span><b>↓</b></div>
      <div className="showcase-cycle-track">
        <svg className="showcase-cycle-connectors" viewBox="0 0 900 330" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id={`${id}-green`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="var(--showcase-green)" strokeWidth="1.5" />
            </marker>
            <marker id={`${id}-coral`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="var(--showcase-coral)" strokeWidth="1.5" />
            </marker>
          </defs>
          <g fill="none" strokeWidth="2">
            <path d="M 190 60 H 318" stroke="var(--showcase-green)" markerEnd={`url(#${id}-green)`} />
            <path d="M 490 60 H 605" stroke="var(--showcase-green)" markerEnd={`url(#${id}-green)`} />
            <path d="M 780 60 H 850 Q 880 60 880 90 V 176" stroke="var(--showcase-coral)" markerEnd={`url(#${id}-coral)`} />
            <path d="M 880 176 V 240 Q 880 270 850 270 H 780" stroke="var(--showcase-coral)" />
            <path d="M 710 270 H 581" stroke="var(--showcase-coral)" markerEnd={`url(#${id}-coral)`} />
            <path d="M 410 270 H 295" stroke="var(--showcase-coral)" markerEnd={`url(#${id}-coral)`} />
            <path d="M 110 270 H 50 Q 20 270 20 240 V 154" stroke="var(--showcase-green)" strokeDasharray="5 5" markerEnd={`url(#${id}-green)`} />
            <path d="M 20 154 V 90 Q 20 60 50 60 H 110" stroke="var(--showcase-green)" strokeDasharray="5 5" />
          </g>
        </svg>
        <ol className="showcase-cycle-nodes" start={3}>
          {steps.slice(2).map((step, index) => <li key={step.title}>{node(index + 2)}</li>)}
        </ol>
        <div className="showcase-cycle-center">
          <strong>执行 → 评分 → 修复 → 再验证</strong>
        </div>
      </div>
      <div className={`showcase-cycle-detail ${current.phase === "Harness" ? "is-harness" : "is-loop"}`}>
        <div id={`${id}-detail`} aria-live="polite" aria-atomic="true">
          <span>{String(selected + 1).padStart(2, "0")} / {current.phase === "Harness" ? "Eval Harness" : "Optimization Loop"}</span>
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
        </div>
        <button type="button" onClick={() => setSelected(next)} aria-label={`查看下一步：${steps[next].title}`}>
          {selected === steps.length - 1 ? "再看一轮" : "下一步"} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
