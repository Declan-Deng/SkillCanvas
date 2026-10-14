import type { Metadata } from "next";
import Image from "next/image";
import { ShowcaseArrow } from "./showcase-arrow";
import { ShowcaseMotion } from "./showcase-motion";
import { AnswerComparison, MethodWalkthrough, PersonalizationDemo, SkillFileExplorer } from "./showcase-demos";
import { ShowcaseFooter, ShowcaseNav } from "./showcase-shell";
import "./showcase.css";

export const metadata: Metadata = {
  title: "SkillCanvas | 按你的工作方法，定制专属 AI Skill",
  description: "为经常用 AI 做研究、分析、写作和汇报的人，把自己的经验、资料和判断标准整理成可复用的专属 AI Skill。通过引导式选项说清需求，再用任务测试检查效果。",
  openGraph: {
    title: "SkillCanvas | 按你的工作方法，定制专属 AI Skill",
    description: "从一句目标开始，通过选项和自己的资料，把你的做事方式整理成专属 AI Skill，并比较它与普通 AI 回答的差异。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SkillCanvas 项目视觉" }],
  },
};

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";

const problemLines = [
  { title: "每次重新交代", detail: "做类似任务时，总要重新提供业务背景、资料来源、交付格式和个人偏好。", art: "context", alt: "面对多份背景、资料和格式说明，重新向 AI 交代要求的人" },
  { title: "经验难以说清", detail: "哪些信息更重要、按照什么顺序处理、怎样的结果才算合格，这些判断往往来自长期积累的经验，很难一次写进提示词。", art: "experience", alt: "正在思考如何表达经验与判断标准的人" },
  { title: "结果难以验证", detail: "AI 的回答看似完整，却可能遗漏关键步骤、使用不可靠的信息，或偏离你的工作标准，仍然需要反复检查和修改。", art: "validation", alt: "正在检查回答中遗漏与错误的 SkillCanvas 机器人" },
];

const understandingSteps = [
  { title: "从一句目标开始", detail: "简单描述你希望 AI 完成的工作", art: "goal" },
  { title: "先预演，再主动提问", detail: "通过具体结果发现可能遗漏的要求", art: "preview" },
  { title: "选择与校正", detail: "逐步明确流程、标准与个人偏好", art: "calibration" },
];

const methodSteps = [
  { number: "01", title: "说出你想完成的任务", detail: "一句“帮我做一个周报助手”就可以开始。你不需要先写完整提示词，也不需要知道怎样设计 Agent。", followup: "SkillCanvas 会根据这句话整理接下来需要确认的内容，把模糊目标变成可以逐步讨论的具体问题。", icon: "/showcase-icons/goal.png" },
  { number: "02", title: "通过选择，把你的做法说清楚", detail: "AI 会围绕任务生成问题和推荐选项，并根据你的描述先做预选。你主要负责确认、修改和补充，例如先分析什么、遇到什么情况要停下来问你。", followup: "这更像校正一份已经填了一部分的需求说明。那些平时靠经验判断、却没有主动写下来的要求，也有机会在这个过程中被发现。", icon: "/showcase-icons/interview.png" },
  { number: "03", title: "加入自己的资料，生成专属 Skill", detail: "你可以补充历史案例、公司口径、已有文档和做事方法。系统会结合已确认的要求，组织需要的知识、工作步骤和工具，并生成对应的 Skill 文件。", followup: "任务需要外部专业知识时，系统会检索并检查来源。涉及文件、脚本或外部服务时，Skill 会说明怎样调用，实际使用仍取决于 AI 助手提供的工具和授权。", icon: "/showcase-icons/skill-build.png" },
  { number: "04", title: "看它有没有按你的要求做事", detail: "系统会在网页测试环境中，让普通 AI 和加载 Skill 的 AI 处理同一个任务，比较它们的回答。你也可以提供自己的输入，继续观察它是否遵循你的方法。", followup: "发现问题后，系统会尝试修改相关规则，再重跑测试。新版本没有带来改善时保留原版本，避免一次调整把之前已经做对的部分改坏。", icon: "/showcase-icons/compare.png" },
];

const qualityChecks = [
  { title: "规则检查", art: "independent-check", detail: "检查用户确认的要求是否保留、规则是否冲突，以及工作流和工具能力是否完整。" },
  { title: "任务验证", art: "regression", detail: "运行测试任务，对比生成效果，并重新检查此前已经通过的任务。" },
  { title: "版本决策", art: "rollback", detail: "只有通过验证的候选版本才能晋级；效果变差时保留原版本，并定位问题继续修复。" },
];

export default function ShowcasePage() {
  return (
    <main className="sc-page">
      <ShowcaseMotion />
      <ShowcaseNav current="home" />

      <header className="sc-hero" id="top">
        <div className="sc-hero-copy">
          <p className="sc-kicker">不用懂 Prompt，也能创建自己的 AI Skill</p>
          <h1><span className="sc-title-line">把你的工作方法</span><span className="sc-title-line sc-title-accent">变成专属 AI Skill。</span></h1>
          <p className="sc-hero-summary">从一句目标开始，先看 AI 如何完成任务，再通过选项和资料，逐步校准你的<span className="sc-phrase">工作流程</span>、<span className="sc-phrase">判断标准</span>与<span className="sc-phrase">个人偏好</span>。生成后用<span className="sc-phrase">真实任务</span>验证效果，持续优化。</p>
          <div className="sc-actions">
            <a className="sc-button sc-button-primary" href={productUrl}>创建我的 Skill <ShowcaseArrow /></a>
            <a className="sc-button sc-button-secondary" href="https://github.com/Declan-Deng/SkillCanvas" target="_blank" rel="noopener noreferrer"><span className="sc-github-icon" aria-hidden="true" />查看 GitHub 链接</a>
          </div>
        </div>
        <picture className="sc-hero-art">
          <source srcSet="/skillcanvas-workflow-hero-emoji.avif" type="image/avif" />
          <img src="/skillcanvas-workflow-hero-emoji.png" width="1254" height="1254" alt="SkillCanvas 机器人正在组织任务、工作流和日程" decoding="async" fetchPriority="high" />
        </picture>
      </header>

      <section className="sc-problem" aria-labelledby="problem-title">
        <div className="sc-problem-lead" data-sc-reveal>
          <p className="sc-section-label">为什么需要 SkillCanvas</p>
          <h2 id="problem-title"><span className="sc-title-line">你有自己的工作方法，</span><span className="sc-title-line"><span className="sc-inline-accent">AI</span> 却每次都要<span className="sc-inline-accent">重新学。</span></span></h2>
          <p><span className="sc-intro-line">经常使用 AI 工作的人，往往已经形成了自己的流程、判断标准和表达习惯，</span><span className="sc-intro-line">但这些经验很难在不同任务中直接复用。</span></p>
        </div>
        <div className="sc-problem-list">
          {problemLines.map(({ title, detail, art, alt }, index) => (
            <article className="sc-problem-card" key={title} data-sc-reveal>
              <div className="sc-problem-card-copy"><span className="sc-problem-number">{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{detail}</p></div>
              <picture className="sc-problem-art"><source srcSet={`/showcase-illustrations/problem-${art}-640.webp`} type="image/webp" /><img src={`/showcase-illustrations/problem-${art}-640.png`} width="640" height="640" alt={alt} loading="lazy" decoding="async" /></picture>
            </article>
          ))}
        </div>
        <div className="sc-problem-takeaway" data-sc-reveal><p>SkillCanvas 让你的经验、工作流程与质量标准，成为可复用、可验证的 AI Skill。</p></div>
      </section>

      <section className="sc-origin" aria-labelledby="origin-title">
        <picture className="sc-origin-art" data-sc-reveal>
          <source srcSet="/skillcanvas-unclear-intent-emoji-640.avif" type="image/avif" />
          <img src="/skillcanvas-unclear-intent-emoji-640.png" width="640" height="640" alt="正在整理模糊想法的 SkillCanvas 机器人" loading="lazy" decoding="async" />
        </picture>
        <div className="sc-origin-copy" data-sc-reveal>
          <p className="sc-section-label">怎样了解你的方法</p>
          <h2 id="origin-title"><span className="sc-title-line">你不用一次说清，</span><span className="sc-title-line">AI 帮你逐步补全。</span></h2>
          <p>从一句目标开始，AI 先展示理解结果，再围绕工作流程、判断标准和个人偏好主动提问。你只需要选择、校正或补充资料。</p>
          <ol className="sc-understanding-steps">
            {understandingSteps.map(({ title, detail, art }, index) => (
              <li key={art}>
                <picture className="sc-understanding-art"><source srcSet={`/showcase-illustrations/understanding-${art}-320.webp`} type="image/webp" /><img src={`/showcase-illustrations/understanding-${art}-320.png`} width="320" height="320" alt="" loading="lazy" decoding="async" /></picture>
                <div><h3>{title}</h3><p>{detail}</p></div>
                <span className="sc-understanding-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sc-method" id="method" aria-labelledby="method-title">
        <MethodWalkthrough steps={methodSteps} heading={<div className="sc-section-heading">
          <p className="sc-section-label">它怎么工作</p>
          <h2 id="method-title"><span className="sc-title-line">从一句目标开始，</span><span className="sc-title-line">一步步教会它你的做法。</span></h2>
          <p>你不需要先把所有要求想完整。AI 负责整理问题、生成文件和运行测试，你负责确认它的理解，并用自己的资料、例子和判断标准校正它。</p>
        </div>} />
      </section>

      <section className="sc-example" aria-labelledby="example-title">
        <PersonalizationDemo heading={<div className="sc-example-heading">
          <p className="sc-section-label">一个具体例子</p>
          <h2 id="example-title"><span className="sc-title-line">同一句需求，</span><span className="sc-title-line">也能做出符合你的 Skill。</span></h2>
          <p>只需改变一个选择，看看 AI 如何调整自己的工作重点与输出方式。</p>
        </div>} />
        <div className="sc-example-takeaway" data-sc-reveal>
          <p className="sc-example-conclusion">同样一句目标，你的选择会改变 Skill 的注意重点与工作方式。</p>
          <a className="sc-text-link" href="/showcase/examples">查看更多案例 <ShowcaseArrow /></a>
        </div>
      </section>

      <section className="sc-anatomy" aria-labelledby="anatomy-title">
        <div className="sc-anatomy-heading" data-sc-reveal>
          <p className="sc-section-label">Skill 里保存了什么</p>
          <h2 id="anatomy-title">把经验与偏好，变成专属 Skill。</h2>
          <p>你确认的工作流程、判断标准、资料来源和行为边界，会成为 AI 执行任务时遵循的规则。</p>
        </div>
        <SkillFileExplorer />
        <p className="sc-anatomy-conclusion" data-sc-reveal>这些要求会保存为结构化文件，在执行任务时供 AI 读取和遵循。</p>
      </section>

      <section className="sc-validation" aria-labelledby="validation-title">
        <div className="sc-validation-intro" data-sc-reveal>
        <div className="sc-validation-copy">
          <p className="sc-section-label">验证与优化</p>
          <h2 id="validation-title"><span className="sc-title-line">你的工作规则，</span><span className="sc-title-line">AI 真的会遵守吗？</span></h2>
          <p>给普通 AI 和加载 Skill 的 AI 同一段工作记录，检查它们如何处理你关心的细节。</p>
        </div>
        <img className="sc-validation-art" src="/showcase-icons/eval.png" width="512" height="512" alt="" loading="lazy" decoding="async" />
        </div>
        <AnswerComparison />
        <div className="sc-validation-note" data-sc-reveal>
          <p>发现不符合要求的地方，针对性优化 Skill，再通过回归测试确认是否改善。</p>
          <small>网页测试帮助检查回答是否符合要求；工具和执行效果仍需在实际使用的 AI 助手中验证。</small>
        </div>
      </section>

      <section className="sc-engineering-teaser" aria-labelledby="engineering-title">
        <header className="sc-quality-heading" data-sc-reveal>
          <p className="sc-section-label">系统怎样检查质量</p>
          <h2 id="engineering-title">你的每一项要求，都有据可查。</h2>
          <p>从需求确认到 Skill 生成，再到实际任务验证，系统会持续检查规则、执行结果与版本变化。</p>
        </header>
        <ol className="sc-quality-cards" aria-label="质量检查的三个环节">
          {qualityChecks.map(({ title, art, detail }, index) => (
            <li key={title} data-sc-reveal>
              <div className="sc-quality-card-top"><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><img className="sc-quality-art" src={`/showcase-icons/${art}.png`} width="512" height="512" alt="" loading="lazy" decoding="async" /></div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
        <div className="sc-quality-conclusion" data-sc-reveal><span className="sc-quality-icon" style={{ maskImage: 'url("/icons/tabler/circle-check.svg")' }} aria-hidden="true" /><p>效果改善，接受新版本；效果退化，保留原版本。</p></div>
        <a className="sc-text-link sc-quality-link" href="/showcase/engineering" data-sc-reveal>了解质量检查机制 <ShowcaseArrow /></a>
      </section>

      <section className="sc-proof" aria-labelledby="proof-title">
        <div className="sc-proof-copy" data-sc-reveal>
          <p className="sc-section-label">创建完成后</p>
          <h2 id="proof-title"><span className="sc-phrase">把你的专属 Skill，</span><wbr /><span className="sc-phrase">带进日常工作。</span></h2>
          <p>把工作流程、参考资料与执行规则保存为 Skill，在支持的 AI 助手中加载，随时复用你的工作方法。</p>
          <p className="sc-proof-path">导出 <ShowcaseArrow /> 加载 <ShowcaseArrow /> 复用</p>
          <div className="sc-actions">
            <a className="sc-button sc-button-primary" href={productUrl}>创建我的 Skill <ShowcaseArrow /></a>
            <a className="sc-button sc-button-secondary" href="/showcase/guide">查看使用指南</a>
          </div>
          <a className="sc-proof-source" href="https://github.com/Declan-Deng/SkillCanvas" target="_blank" rel="noreferrer">GitHub · 查看源代码</a>
        </div>
        <picture className="sc-proof-art" data-sc-reveal>
          <source srcSet="/skillcanvas-quality-gate-emoji-640.avif" type="image/avif" />
          <img src="/skillcanvas-quality-gate-emoji-640.png" width="640" height="640" alt="SkillCanvas 机器人正在检查生成结果" loading="lazy" decoding="async" />
        </picture>
      </section>

      <ShowcaseFooter />
    </main>
  );
}
