import type { Metadata } from "next";
import Image from "next/image";
import { ShowcaseFooter, ShowcaseNav } from "./showcase-shell";
import "./showcase.css";

export const metadata: Metadata = {
  title: "SkillCanvas | 把工作方法变成可复用的 AI Skill",
  description: "从一句目标开始，澄清流程、判断标准和能力边界，再用真实任务验证生成的 AI Skill。",
  openGraph: {
    title: "SkillCanvas | 把工作方法变成可复用的 AI Skill",
    description: "让 AI 理解你的方法，并在真实任务中证明它能够稳定执行。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SkillCanvas 项目视觉" }],
  },
};

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";

const problemLines = [
  { title: "上下文反复重建", detail: "背景、来源与输出要求无法自动延续。", icon: "/showcase-icons/context-stack.png" },
  { title: "隐性判断难以表达", detail: "关键取舍来自经验，单条 Prompt 很难覆盖。", icon: "/showcase-icons/clarify.png" },
  { title: "结果缺少稳定性", detail: "偶尔答对，不等于能够持续按同一标准执行。", icon: "/showcase-icons/regression.png" },
];

const methodSteps = [
  { number: "01", title: "描述目标", detail: "用一句话说明要完成的任务，无需先设计 Prompt 或 Agent。", icon: "/showcase-icons/goal.png" },
  { number: "02", title: "校准方法", detail: "AI 预先整理关键问题与推荐选项，你只需确认、修改和补充。", icon: "/showcase-icons/interview.png" },
  { number: "03", title: "组装 Skill", detail: "把资料、知识、规则和必要工具组织成可执行结构。", icon: "/showcase-icons/skill-build.png" },
  { number: "04", title: "验证效果", detail: "用同一任务对比裸模型与 Skill，只保留经验证更好的版本。", icon: "/showcase-icons/compare.png" },
];

const exampleQuestions = [
  "周报面向自己、团队还是客户？",
  "需要跟踪哪些基金、指数与事件？",
  "哪些变化值得重点解释？",
  "允许使用哪些信息来源？",
  "数据不完整时应该怎样处理？",
  "什么样的周报才算合格？",
];

const skillParts = [
  { title: "执行流程", detail: "任务顺序、继续条件和需要切换处理方式的情况。", icon: "/showcase-icons/workflow-simple.png" },
  { title: "判断标准", detail: "信息优先级、来源可信度和结果验收条件。", icon: "/showcase-icons/judgment.png" },
  { title: "知识资产", detail: "用户资料、历史案例、组织口径和必要的专业知识。", icon: "/showcase-icons/knowledge.png" },
  { title: "能力边界", detail: "工具的调用条件、权限范围和失败处理。", icon: "/showcase-icons/boundary.png" },
];

const diagnoses = [
  { title: "需求偏移", icon: "/showcase-icons/drift.png" },
  { title: "知识缺口", icon: "/showcase-icons/knowledge-gap.png" },
  { title: "执行链路异常", icon: "/showcase-icons/broken-flow.png" },
  { title: "既有能力退化", icon: "/showcase-icons/rollback.png" },
];

export default function ShowcasePage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="home" />

      <header className="sc-hero" id="top">
        <div className="sc-hero-copy">
          <p className="sc-kicker">让 AI 稳定复现你的工作方法</p>
          <h1><span className="sc-title-line">不必反复教 AI，</span><span className="sc-title-line sc-title-accent">让它记住你的方法。</span></h1>
          <p className="sc-hero-summary">从一句目标开始，澄清流程、判断标准与边界，再用真实任务验证效果。</p>
          <div className="sc-actions">
            <a className="sc-button sc-button-primary" href={productUrl}>用一句话开始 <span aria-hidden="true">→</span></a>
            <a className="sc-button sc-button-secondary" href="#method">看看它怎么工作</a>
          </div>
          <p className="sc-use-cases">适用于研究、分析、写作、汇报和产品方案等高频任务。</p>
        </div>
        <picture className="sc-hero-art">
          <source srcSet="/skillcanvas-workflow-hero-emoji.avif" type="image/avif" />
          <img src="/skillcanvas-workflow-hero-emoji.png" width="1254" height="1254" alt="SkillCanvas 机器人正在组织任务、工作流和日程" decoding="async" fetchPriority="high" />
        </picture>
      </header>

      <section className="sc-problem" aria-labelledby="problem-title">
        <div className="sc-problem-lead">
          <p className="sc-section-label">为什么需要它</p>
          <h2 id="problem-title"><span className="sc-title-line">反复使用 AI，</span><span className="sc-title-line">不该意味着反复解释。</span></h2>
          <p>多数 AI 会话只记住当前输入。背景、流程和判断标准一旦散落，结果就难以稳定复现。</p>
        </div>
        <div className="sc-problem-list">
          {problemLines.map(({ title, detail, icon }, index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Image className="sc-row-icon" src={icon} width={88} height={88} alt="" loading="lazy" />
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sc-origin" aria-labelledby="origin-title">
        <picture className="sc-origin-art">
          <source srcSet="/skillcanvas-unclear-intent-emoji-640.avif" type="image/avif" />
          <img src="/skillcanvas-unclear-intent-emoji-640.png" width="640" height="640" alt="正在整理模糊想法的 SkillCanvas 机器人" loading="lazy" decoding="async" />
        </picture>
        <div className="sc-origin-copy">
          <p className="sc-section-label">产品起点</p>
          <h2 id="origin-title"><span className="sc-title-line">一条 Prompt 保存指令，</span><span className="sc-title-line">一套 Skill 保存方法。</span></h2>
          <p>SkillCanvas 源于长期使用 AI 完成研究、分析和产品工作的真实需求。重复任务需要保留的，不只是最终格式，还有信息取舍与判断依据。</p>
          <p>这些经验通常分散在资料、案例和日常决策中。系统需要主动识别缺口，而不是要求用户一次写完整。</p>
          <blockquote>先把方法说清，再验证 AI 能否稳定执行。</blockquote>
        </div>
      </section>

      <section className="sc-method" id="method" aria-labelledby="method-title">
        <div className="sc-section-heading">
          <p className="sc-section-label">它怎么工作</p>
          <h2 id="method-title"><span className="sc-title-line">从一句目标，</span><span className="sc-title-line">到一套可执行的方法。</span></h2>
          <p>用户只处理关键决定，需求建模、能力组装和验证由系统完成。</p>
        </div>
        <ol className="sc-method-list">
          {methodSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.detail}</p></div>
              <Image className="sc-step-icon" src={step.icon} width={118} height={118} alt="" loading="lazy" />
            </li>
          ))}
        </ol>
      </section>

      <section className="sc-example" aria-labelledby="example-title">
        <div className="sc-example-heading">
          <p className="sc-section-label">一个具体例子</p>
          <h2 id="example-title"><span className="sc-title-line">一句“帮我做周报”，</span><span className="sc-title-line">如何变成完整 Skill。</span></h2>
          <p>系统先识别关键决策，再由用户确认范围、来源与质量标准。</p>
        </div>
        <div className="sc-example-board">
          <div className="sc-example-request">
            <span>最初输入</span>
            <Image className="sc-example-icon" src="/showcase-icons/calendar-simple.png" width={150} height={150} alt="" loading="lazy" />
            <strong>“帮我做一个基金周报助手。”</strong>
          </div>
          <div className="sc-example-questions">
            <span>AI 继续问清</span>
            <ol>
              {exampleQuestions.map((question, index) => <li key={question}><b>{String(index + 1).padStart(2, "0")}</b>{question}</li>)}
            </ol>
          </div>
          <div className="sc-example-output">
            <span>最终沉淀</span>
            <div>{['输入要求', '信息来源规则', '分析与判断流程', '输出结构', '异常处理', '验证 Case'].map(item => <b key={item}>{item}</b>)}</div>
          </div>
        </div>
        <p className="sc-example-conclusion">用户输入的是一句目标，系统最终保存的是一整套做事方式。</p>
        <a className="sc-text-link" href="/showcase/examples">查看更多案例 <span aria-hidden="true">→</span></a>
      </section>

      <section className="sc-anatomy" aria-labelledby="anatomy-title">
        <div className="sc-anatomy-heading">
          <p className="sc-section-label">Skill 里保存了什么</p>
          <h2 id="anatomy-title"><span className="sc-title-line">一个 Skill，</span><span className="sc-title-line">保存四类核心资产。</span></h2>
          <p>只保留完成任务所需的流程、标准、知识和能力，不为复杂而复杂。</p>
        </div>
        <div className="sc-anatomy-list">
          {skillParts.map((part, index) => (
            <article key={part.title}><span>{String(index + 1).padStart(2, "0")}</span><Image className="sc-row-icon" src={part.icon} width={88} height={88} alt="" loading="lazy" /><h3>{part.title}</h3><p>{part.detail}</p></article>
          ))}
        </div>
      </section>

      <section className="sc-validation" aria-labelledby="validation-title">
        <div className="sc-validation-copy">
          <p className="sc-section-label">验证与优化</p>
          <h2 id="validation-title"><span className="sc-title-line">生成不是终点，</span><span className="sc-title-line">有效才是标准。</span></h2>
          <p>同一任务分别交给裸模型与 Skill，以真实输出判断需求遵循、知识使用和流程执行是否改善。</p>
          <div className="sc-diagnosis-list">
            {diagnoses.map((item, index) => <span key={item.title}><Image src={item.icon} width={42} height={42} alt="" loading="lazy" /><b>{String(index + 1).padStart(2, "0")}</b>{item.title}</span>)}
          </div>
          <p className="sc-validation-rule">系统只修改与失败证据相关的部分。新版本通过回归验证后才会保留，否则自动回滚。</p>
        </div>
        <div className="sc-compare" aria-label="裸模型与 Skill 的隔离验证流程">
          <div className="sc-compare-input"><span>同一个真实任务</span><strong>代表性 Case</strong></div>
          <div className="sc-compare-runs">
            <div><span>对照组</span><strong>裸模型</strong><small>不加载 Skill</small></div>
            <div><span>实验组</span><strong>当前 Skill</strong><small>加载流程、知识与工具</small></div>
          </div>
          <div className="sc-compare-result"><span>独立判断</span><strong>识别真实提升与剩余问题</strong></div>
        </div>
      </section>

      <section className="sc-engineering-teaser" aria-labelledby="engineering-title">
        <div><Image className="sc-teaser-icon" src="/showcase-icons/system-hub.png" width={104} height={104} alt="" loading="lazy" /><p className="sc-section-label">工程可靠性</p><h2 id="engineering-title"><span className="sc-title-line">系统承担复杂性，</span><span className="sc-title-line">用户只确认关键决定。</span></h2></div>
        <div><p>统一蓝图维护需求、知识、工具、工作流与评测关系。结构门禁和回归验证共同决定版本能否交付。</p><a className="sc-text-link" href="/showcase/engineering">查看工程设计 <span aria-hidden="true">→</span></a></div>
      </section>

      <section className="sc-proof" aria-labelledby="proof-title">
        <div className="sc-proof-copy">
          <p className="sc-section-label">已经在线运行</p>
          <h2 id="proof-title"><span className="sc-title-line">从模糊目标，</span><span className="sc-title-line">到可运行的 Skill。</span></h2>
          <p>产品已经覆盖需求细化、知识引入、Skill 构建、真实任务验证、优化与回滚。</p>
          <div className="sc-actions">
            <a className="sc-button sc-button-primary" href={productUrl}>打开 SkillCanvas <span aria-hidden="true">↗</span></a>
            <a className="sc-button sc-button-secondary" href="https://github.com/Declan-Deng/SkillCanvas" target="_blank" rel="noreferrer">查看源代码 <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <picture className="sc-proof-art">
          <source srcSet="/skillcanvas-quality-gate-emoji-640.avif" type="image/avif" />
          <img src="/skillcanvas-quality-gate-emoji-640.png" width="640" height="640" alt="SkillCanvas 机器人正在检查生成结果" loading="lazy" decoding="async" />
        </picture>
      </section>

      <ShowcaseFooter />
    </main>
  );
}
