import type { Metadata } from "next";
import Image from "next/image";
import { ShowcaseFooter, ShowcaseNav } from "./showcase-shell";
import "./showcase.css";

export const metadata: Metadata = {
  title: "SkillCanvas | 把你的工作方法变成 AI Skill",
  description: "SkillCanvas 帮助知识工作者从一句模糊目标开始，把隐性的流程、判断标准和个人偏好沉淀成可复用、可验证的 AI Skill。",
  openGraph: {
    title: "SkillCanvas | 把你的工作方法变成 AI Skill",
    description: "通过引导式澄清、资料学习和真实任务验证，把个人经验沉淀成 AI 能稳定复用的能力。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SkillCanvas 项目视觉" }],
  },
};

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";

const problemLines = [
  { title: "背景要重新讲", detail: "业务背景、分析框架和信息来源，每次都要重新搭建。", icon: "/showcase-icons/context-stack.png" },
  { title: "经验很难一次说全", detail: "真正影响结果的判断方法通常存在于习惯里，用户自己也容易遗漏。", icon: "/showcase-icons/clarify.png" },
  { title: "结果难以稳定复现", detail: "这一次回答不错，不代表下一次还能遵守同样的标准。", icon: "/showcase-icons/regression.png" },
];

const methodSteps = [
  { number: "01", title: "说一句目标", detail: "先描述想解决的问题，不需要先学会写 Prompt 或设计 Agent。", icon: "/showcase-icons/context-stack.png" },
  { number: "02", title: "AI 帮你把方法问出来", detail: "系统动态生成问题、选项和推荐答案。你只需要确认、修改和补充。", icon: "/showcase-icons/clarify.png" },
  { number: "03", title: "把资料、知识和工具编进 Skill", detail: "学习你的资料与案例，按任务需要补充知识，并判断是否需要文件、脚本或外部工具。", icon: "/showcase-icons/blueprint.png" },
  { number: "04", title: "用真实任务证明它学会了", detail: "分别运行裸模型与当前 Skill。没有证明更好的新版本，不会覆盖原来的版本。", icon: "/showcase-icons/eval.png" },
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
  { title: "工作流程", detail: "先做什么，什么时候继续，以及什么情况下改变处理方式。", icon: "/showcase-icons/blueprint.png" },
  { title: "判断规则", detail: "哪些信息重要、哪些来源可信，以及结果达到什么标准才算合格。", icon: "/showcase-icons/eval.png" },
  { title: "资料与知识", detail: "你的文件、历史案例、公司口径，以及任务真正需要的外部知识。", icon: "/showcase-icons/knowledge.png" },
  { title: "工具与边界", detail: "什么时候读取文件、运行脚本或调用服务，以及失败时应该怎么办。", icon: "/showcase-icons/tools.png" },
];

const diagnoses = [
  { title: "需求理解偏了", icon: "/showcase-icons/clarify.png" },
  { title: "缺少必要知识", icon: "/showcase-icons/knowledge.png" },
  { title: "工作流或工具没有正确执行", icon: "/showcase-icons/tools.png" },
  { title: "修改导致原本通过的任务退化", icon: "/showcase-icons/regression.png" },
];

export default function ShowcasePage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="home" />

      <header className="sc-hero" id="top">
        <div className="sc-hero-copy">
          <p className="sc-kicker">把你的工作方法，变成 AI 能长期复用的能力</p>
          <h1>不再每次从头教 AI。<br /><span>把你的做事方式，沉淀成 Skill。</span></h1>
          <p className="sc-hero-summary">SkillCanvas 通过引导式提问，帮你说清隐性的流程、判断标准和个人偏好，再结合资料与工具生成专属 Skill，并用真实任务验证它是否真的学会。</p>
          <div className="sc-actions">
            <a className="sc-button sc-button-primary" href={productUrl}>用一句话开始 <span aria-hidden="true">→</span></a>
            <a className="sc-button sc-button-secondary" href="#method">看看它怎么工作</a>
          </div>
          <p className="sc-use-cases">适合竞品研究、用户反馈分析、周报整理、内容创作和产品方案等重复工作。</p>
        </div>
        <picture className="sc-hero-art">
          <source srcSet="/skillcanvas-workflow-hero-emoji.avif" type="image/avif" />
          <img src="/skillcanvas-workflow-hero-emoji.png" width="1254" height="1254" alt="SkillCanvas 机器人正在组织任务、工作流和日程" decoding="async" fetchPriority="high" />
        </picture>
      </header>

      <section className="sc-problem" aria-labelledby="problem-title">
        <div className="sc-problem-lead">
          <p className="sc-section-label">为什么需要它</p>
          <h2 id="problem-title">同一种任务做过很多次，下一次还是要重新解释。</h2>
          <p>你需要重新告诉 AI 业务背景、分析框架、信息来源、输出标准和个人偏好。真正影响结果的判断方法通常存在于经验里，很难靠一条 Prompt 一次写完整。</p>
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
          <h2 id="origin-title">我想保存的不是一条 Prompt，而是自己做判断的方法。</h2>
          <p>SkillCanvas 来自我反复使用 AI 做竞品研究、用户反馈归纳和产品方案的经历。同一种任务即使已经做过很多次，下一次仍然要重新解释背景、流程和标准。</p>
          <p>更麻烦的是，真正影响结果的往往是一些很难一次说清的经验：哪些信息更重要、什么时候继续往下查、哪些来源可信，以及什么样的结果才算合格。</p>
          <blockquote>能不能让 AI 主动把这些方法问出来，再证明它真的学会了？</blockquote>
        </div>
      </section>

      <section className="sc-method" id="method" aria-labelledby="method-title">
        <div className="sc-section-heading">
          <p className="sc-section-label">它怎么工作</p>
          <h2 id="method-title">从一句模糊目标，到一套能重复执行的方法。</h2>
          <p>产品内部仍然有完整的六步流程。这里先用四个阶段解释用户真正经历了什么。</p>
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
          <h2 id="example-title">从一句“帮我做周报”，到一套真正属于你的工作方法。</h2>
          <p>用户不需要提前知道应该描述哪些维度。系统先提出关键问题，再让用户确认和校正。</p>
        </div>
        <div className="sc-example-board">
          <div className="sc-example-request">
            <span>最初输入</span>
            <Image className="sc-example-icon" src="/showcase-icons/weekly-report.png" width={150} height={150} alt="" loading="lazy" />
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
          <h2 id="anatomy-title">一个 Skill 保存四类东西。</h2>
          <p>系统只接入任务真正需要的能力。能够靠清晰规则完成的事情，不会为了看起来复杂而增加工具。</p>
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
          <h2 id="validation-title">生成只是开始。Skill 必须在真实任务里证明自己。</h2>
          <p>系统会把同一个任务分别交给裸模型和当前 Skill，根据真实输出判断 Skill 是否更准确地遵守需求、使用资料和执行工作流程。</p>
          <div className="sc-diagnosis-list">
            {diagnoses.map((item, index) => <span key={item.title}><Image src={item.icon} width={42} height={42} alt="" loading="lazy" /><b>{String(index + 1).padStart(2, "0")}</b>{item.title}</span>)}
          </div>
          <p className="sc-validation-rule">系统只修改与失败证据有关的部分，然后重新运行测试。新版本整体表现更好才会被保留，否则自动回滚。</p>
        </div>
        <div className="sc-compare" aria-label="裸模型与 Skill 的隔离验证流程">
          <Image className="sc-compare-icon" src="/showcase-icons/eval.png" width={116} height={116} alt="" loading="lazy" />
          <div className="sc-compare-input"><span>同一个真实任务</span><strong>代表性 Case</strong></div>
          <div className="sc-compare-runs">
            <div><span>对照组</span><strong>裸模型</strong><small>不加载 Skill</small></div>
            <div><span>实验组</span><strong>当前 Skill</strong><small>加载流程、知识与工具</small></div>
          </div>
          <div className="sc-compare-result"><Image src="/showcase-icons/regression.png" width={58} height={58} alt="" loading="lazy" /><span>独立判断</span><strong>哪里真的变好了，哪里仍然有问题</strong></div>
        </div>
      </section>

      <section className="sc-engineering-teaser" aria-labelledby="engineering-title">
        <div><div className="sc-icon-cluster" aria-hidden="true"><Image src="/showcase-icons/blueprint.png" width={92} height={92} alt="" loading="lazy" /><Image src="/showcase-icons/tools.png" width={92} height={92} alt="" loading="lazy" /><Image src="/showcase-icons/regression.png" width={92} height={92} alt="" loading="lazy" /></div><p className="sc-section-label">工程可靠性</p><h2 id="engineering-title">复杂性留在系统里，不留给用户。</h2></div>
        <div><p>统一蓝图管理需求、知识、工具、工作流和评测关系，再生成对应文件。结构检查、能力闭环和回归验证共同决定一个版本能否交付。</p><a className="sc-text-link" href="/showcase/engineering">阅读完整工程设计 <span aria-hidden="true">→</span></a></div>
      </section>

      <section className="sc-proof" aria-labelledby="proof-title">
        <div className="sc-proof-copy">
          <p className="sc-section-label">已经在线运行</p>
          <h2 id="proof-title">这套链路已经能从模糊目标走到完整 Skill。</h2>
          <p>当前产品覆盖需求细化、资料与知识引入、Skill 生成、真实任务验证、优化和回滚。用户无需配置模型或搜索服务的 API Key。</p>
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
