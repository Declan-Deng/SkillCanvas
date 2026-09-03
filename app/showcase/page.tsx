import type { Metadata } from "next";
import Image from "next/image";
import "./showcase.css";

export const metadata: Metadata = {
  title: "SkillCanvas | 把模糊需求编译成可运行的 AI Skill",
  description: "SkillCanvas 产品案例：从 Demo-first 访谈、Canonical SkillIR 到可回滚的评测优化闭环。",
  openGraph: {
    title: "SkillCanvas | AI Skill 生成与验证系统",
    description: "把一句模糊需求，逐步编译成有证据、能执行、可验证的 AI Skill。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SkillCanvas 项目视觉" }],
  },
};

const productUrl = "/";
const githubUrl = "https://github.com/Declan-Deng/SkillCanvas";

const stages = [
  { title: "说清任务", detail: "一句自然语言即可开始", icon: "messages" },
  { title: "预演理解", detail: "先用 Demo 暴露误解", icon: "browser" },
  { title: "确认边界", detail: "四轮收集偏好与授权", icon: "file-pencil" },
  { title: "编译蓝图", detail: "把需求变成可执行契约", icon: "hierarchy-2" },
  { title: "生成优化", detail: "用证据修复局部缺口", icon: "terminal-2" },
  { title: "验证交付", detail: "通过门禁后再发布 Bundle", icon: "git-branch" },
];

const decisions = [
  {
    title: "先给 Demo，再问问题",
    problem: "抽象提问很难让非专业用户说清标准。",
    choice: "先生成一份代表性结果，让用户基于具体产物指出偏差。",
    icon: "browser",
  },
  {
    title: "语义只走一条提交路径",
    problem: "多个文件分别被模型修改，容易互相覆盖或产生漂移。",
    choice: "所有行为变化先写入 Canonical SkillIR，再确定性投影到文件。",
    icon: "file-pencil",
  },
  {
    title: "能力必须进入真实工作流",
    problem: "添加 Tool 或 MCP 不等于 Skill 会正确使用它。",
    choice: "每项能力都要有输入、消费者、终态路径和对应评测。",
    icon: "plug",
  },
  {
    title: "没有证据，就不替换旧版本",
    problem: "语言更流畅的候选版本，也可能让真实任务退化。",
    choice: "优化候选必须通过隔离评分与 held-out 回归，否则自动回滚。",
    icon: "git-branch",
  },
];

function ShowcaseIcon({ name, size = 24 }: { name: string; size?: number }) {
  return <Image src={`/icons/tabler/${name}.svg`} width={size} height={size} alt="" aria-hidden="true" />;
}

export default function ShowcasePage() {
  return (
    <main className="showcase-page">
      <nav className="showcase-nav" aria-label="项目介绍导航">
        <a className="showcase-brand" href="#top" aria-label="返回 SkillCanvas 项目介绍顶部">
          <Image src="/skillcanvas-icon.png" width="34" height="34" alt="" />
          <span>SkillCanvas</span>
        </a>
        <div className="showcase-nav-links">
          <a href="#story">产品故事</a>
          <a href="#system">系统设计</a>
          <a href="#proof">工程验证</a>
        </div>
        <a className="showcase-nav-cta" href={productUrl}>打开产品 <span aria-hidden="true">↗</span></a>
      </nav>

      <header className="showcase-hero" id="top">
        <div className="showcase-hero-copy">
          <p className="showcase-eyebrow">AI Skill 生成与验证系统</p>
          <h1><span>把模糊需求，</span><span>编译成可运行的 AI Skill。</span></h1>
          <p className="showcase-hero-summary">从理解用户，到生成、验证与持续优化。</p>
          <div className="showcase-actions">
            <a className="showcase-primary" href={productUrl}>体验 SkillCanvas <span aria-hidden="true">→</span></a>
            <a className="showcase-secondary" href={githubUrl} target="_blank" rel="noreferrer">查看源代码 <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <figure className="showcase-hero-visual">
          <div className="showcase-shot-frame">
            <Image
              src="/showcase-product.png"
              width="1600"
              height="1000"
              alt="SkillCanvas 真实产品界面，用户可输入任务并补充资料"
              priority
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1040px) 86vw, 42vw"
            />
          </div>
          <figcaption>真实产品界面</figcaption>
        </figure>
      </header>

      <section className="showcase-intro" id="story">
        <p className="showcase-intro-lead">创建 Skill 最费力的，是把隐含偏好、授权边界和失败处理完整说清。</p>
        <p className="showcase-intro-answer">SkillCanvas 从一句模糊需求开始，先用 Demo 暴露理解偏差，再按 16 个需求维度生成并预选关键选项。用户只需校正，系统就能形成可执行蓝图。</p>
      </section>

      <section className="showcase-journey" aria-labelledby="journey-title">
        <div className="showcase-section-heading">
          <h2 id="journey-title">把开放式访谈，改成基于结果的校正</h2>
          <p>四轮动态问题只追问影响结果的缺口。已确认的信息进入后续契约，不再重复询问。</p>
        </div>
        <ol className="showcase-stage-list">
          {stages.map((stage, index) => (
            <li key={stage.title} style={{ "--stage-index": index } as React.CSSProperties}>
              <div className="showcase-stage-meta">
                <span className="showcase-stage-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="showcase-stage-icon"><ShowcaseIcon name={stage.icon} size={22} /></span>
              </div>
              <strong>{stage.title}</strong>
              <span>{stage.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="showcase-system" id="system" aria-labelledby="system-title">
        <div className="showcase-system-copy">
          <h2 id="system-title">一份 Canonical SkillIR，管住整套语义</h2>
          <p>SkillIR 把需求、能力、知识、工作流与评测统一建模。系统按任务必要性接入 Reference、Script、Host Tool 或 MCP，并把用户资料与外部证据绑定到实际决策。</p>
          <p>所有行为变化先写入 SkillIR，再投影到 SKILL.md、references、tools 和 evals，用同一套契约定位结构缺失、规则冲突和能力断链。</p>
        </div>
        <div className="showcase-architecture" role="img" aria-label="对话、资料、能力和外部证据进入 Canonical SkillIR，再投影为可执行 Skill Bundle">
          <div className="showcase-architecture-inputs">
            <span>对话与确认</span>
            <span>文件与上下文</span>
            <span>Host Tools 与 MCP</span>
            <span>外部专业证据</span>
          </div>
          <div className="showcase-architecture-core">
            <span>Semantic source of truth</span>
            <strong>Canonical<br />SkillIR</strong>
          </div>
          <div className="showcase-architecture-outputs">
            <span>SKILL.md</span>
            <span>Domain playbook</span>
            <span>Tool contracts</span>
            <span>Eval bank</span>
          </div>
        </div>
      </section>

      <section className="showcase-gates" aria-labelledby="gates-title">
        <div className="showcase-gates-heading">
          <h2 id="gates-title">把优秀 Skill 的共性，变成可执行门禁</h2>
          <p>模型提出候选，确定性程序检查结构、运行契约与语义闭环。没有通过门禁的内容不会进入交付版本。</p>
        </div>
        <div className="showcase-gate-track">
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="terminal-2" size={21} /></span><b>Build Gate</b></div>
            <h3>先证明它能运行</h3>
            <p>P0 检查结构、路径、DAG 与能力 owner。P1 检查语义闭环、知识来源和跨文件一致性。</p>
          </article>
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="git-branch" size={21} /></span><b>Optimization Gate</b></div>
            <h3>再证明修改值得保留</h3>
            <p>候选在隔离上下文执行和评分。只修改被诊断出的局部节点，出现回归就保留旧版本。</p>
          </article>
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="messages" size={21} /></span><b>Demo Gate</b></div>
            <h3>最后面对真实协作</h3>
            <p>多轮 Episode 会补充缺失材料、回应追问并检查最终产物，不用一条简单问答代替真实任务。</p>
          </article>
        </div>
      </section>

      <section className="showcase-eval" aria-labelledby="eval-title">
        <div className="showcase-eval-number" aria-hidden="true">3</div>
        <div className="showcase-eval-copy">
          <h2 id="eval-title">用真实任务决定候选是否晋级</h2>
          <p>Eval Harness 用多轮任务对照裸模型与当前 Skill，定位需求偏移、能力缺陷和知识不足。完整 Eval Bank 会被压缩成 1 个诊断 Episode 和 2 个 held-out Episode，接近接受门槛时才补跑。</p>
        </div>
        <div className="showcase-eval-flow">
          <div><strong>10 至 20</strong><span>条契约用例</span></div>
          <b aria-hidden="true">→</b>
          <div><strong>3</strong><span>个多轮 Episode</span></div>
          <b aria-hidden="true">→</b>
          <div><strong>按需</strong><span>补跑与缓存基线</span></div>
        </div>
      </section>

      <section className="showcase-decisions" aria-labelledby="decisions-title">
        <div className="showcase-section-heading showcase-decisions-heading">
          <h2 id="decisions-title">四个决定，定义了这个产品</h2>
          <p>这些选择来自真实失败：误解用户、能力断链、文件漂移，以及优化后反而退化。</p>
        </div>
        <div className="showcase-decision-list">
          {decisions.map((decision, index) => (
            <article key={decision.title}>
              <div className="showcase-decision-meta">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i><ShowcaseIcon name={decision.icon} size={23} /></i>
              </div>
              <h3>{decision.title}</h3>
              <p>{decision.problem}</p>
              <strong>{decision.choice}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="showcase-proof" id="proof" aria-labelledby="proof-title">
        <div className="showcase-proof-copy">
          <h2 id="proof-title">不是概念稿，已经在线运行</h2>
          <p>公开版本运行在 Cloudflare Worker 环境，使用 D1 保存会话与 Checkpoint。DeepSeek 和 Firecrawl 凭据只存在服务端 Secret，访客无需填写 API Key，也看不到明文。</p>
          <a href={githubUrl} target="_blank" rel="noreferrer">阅读工程实现 <span aria-hidden="true">↗</span></a>
        </div>
        <div className="showcase-proof-metrics">
          <div className="showcase-proof-primary">
            <strong>514</strong>
            <span>项自动化测试</span>
            <p>覆盖 SkillIR 投影、Bundle Gate、多能力 DAG、Eval 分层、Sandbox 与发布契约。</p>
          </div>
          <dl>
            <div><i><ShowcaseIcon name="cloud" size={20} /></i><dt>运行时</dt><dd>Cloudflare Worker</dd></div>
            <div><i><ShowcaseIcon name="table" size={20} /></i><dt>持久化</dt><dd>D1 + Checkpoint</dd></div>
            <div><i><ShowcaseIcon name="terminal-2" size={20} /></i><dt>模型服务</dt><dd>Server-managed</dd></div>
            <div><i><ShowcaseIcon name="git-branch" size={20} /></i><dt>失败策略</dt><dd>Repair + Rollback</dd></div>
          </dl>
        </div>
      </section>

      <footer className="showcase-footer">
        <div>
          <Image src="/skillcanvas-icon.png" width="42" height="42" alt="" />
          <h2>让 AI 不只会回答，还能稳定地替你做事。</h2>
        </div>
        <a className="showcase-primary" href={productUrl}>开始创建 Skill <span aria-hidden="true">→</span></a>
        <p>SkillCanvas 产品案例</p>
      </footer>
    </main>
  );
}
