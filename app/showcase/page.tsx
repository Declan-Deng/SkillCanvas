import type { Metadata } from "next";
import Image from "next/image";
import { LoopDiagram } from "./loop-diagram";
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

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";
const githubUrl = "https://github.com/Declan-Deng/SkillCanvas";

const stages = [
  { title: "描述需求", detail: "一句自然语言即可开始" },
  { title: "需求细化", detail: "AI 动态生成并预选关键问题" },
  { title: "确认工作方式", detail: "四轮校正需求、边界与工作方式" },
  { title: "生成并优化", detail: "从统一蓝图生成并校验 Skill" },
  { title: "验证效果", detail: "用真实 Case 验证并定位缺口" },
  { title: "保存并使用", detail: "回归验证通过后输出完整 Skill" },
];

const requirementGroups = [
  { title: "任务定义", items: ["使用场景", "核心价值", "任务变化", "成功标准"] },
  { title: "运行方式", items: ["输入信息", "工作流程", "交付形式", "信息策略"] },
  { title: "质量与边界", items: ["自主程度", "质量标准", "失败模式", "协作边界"] },
  { title: "真实使用", items: ["实战任务", "触发语言", "偏好复用", "交付确认"] },
];

const capabilities = [
  {
    icon: "file-pencil",
    type: "Reference",
    title: "补充专业知识与用户资料",
    detail: "承载用户私有资料、领域规则与外部专业知识，并明确什么条件下读取。",
  },
  {
    icon: "terminal-2",
    type: "Script",
    title: "把确定性工作交给代码",
    detail: "处理计算、转换、校验等确定性任务，提高重复执行的稳定性。",
  },
  {
    icon: "browser",
    type: "Host Tool",
    title: "调用 Agent 自带能力",
    detail: "按任务需要调用文件、PDF、表格、联网搜索等宿主能力，不重复造工具。",
  },
  {
    icon: "plug",
    type: "MCP",
    title: "连接具体外部服务",
    detail: "仅在任务依赖具体外部服务时接入，并明确授权、调用条件与失败降级。",
  },
];

const loopSteps = [
  { title: "冻结契约", detail: "锁定需求、能力与验收标准。", phase: "Harness" },
  { title: "组织测试 Case", detail: "覆盖核心任务、异常场景与能力边界。", phase: "Harness" },
  { title: "独立执行", detail: "分别运行裸模型、当前 Skill 与候选版本。", phase: "Harness" },
  { title: "隔离评分", detail: "Grader 只根据验收标准与实际输出评分。", phase: "Harness" },
  { title: "失败归因", detail: "定位需求偏移、知识缺口、能力缺陷或规则问题。", phase: "Loop" },
  { title: "有限修改", detail: "只修改与失败证据对应的 SkillIR 节点。", phase: "Loop" },
  { title: "回归验证", detail: "重跑 held-out 与已通过任务，检查是否能力退化。", phase: "Loop" },
  { title: "提交或回滚", detail: "确认提升才更新版本，否则保留旧版。", phase: "Loop" },
];

const decisions = [
  {
    title: "降低需求表达成本",
    problem: "问题：用户说不清",
    choice: "决策：AI 先生成，用户校正",
    icon: "browser",
  },
  {
    title: "保证多文件一致性",
    problem: "问题：局部修改会漂",
    choice: "决策：先改 SkillIR，再同步生成",
    icon: "file-pencil",
  },
  {
    title: "控制能力复杂度",
    problem: "问题：能力堆多了反而不稳定",
    choice: "决策：有明确价值才接入",
    icon: "plug",
  },
  {
    title: "防止优化退化",
    problem: "问题：看起来更好不代表真的更好",
    choice: "决策：Eval + held-out 证明后才替换",
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
          <Image src="/skillcanvas-icon-small.png" width="34" height="34" alt="" />
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
          <p className="showcase-eyebrow">AGENT SKILL 工程化构建与验证系统</p>
          <h1><span>把模糊需求，</span><span>编译成可运行的 AI Skill。</span></h1>
          <p className="showcase-hero-summary">从需求澄清，到工程化生成、验证与迭代。</p>
          <div className="showcase-actions">
            <a className="showcase-primary" href={productUrl}>体验 SkillCanvas <span aria-hidden="true">→</span></a>
            <a className="showcase-secondary" href={githubUrl} target="_blank" rel="noreferrer">查看源代码 <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="showcase-hero-visual">
          <picture className="showcase-hero-workflow">
            <source srcSet="/skillcanvas-workflow-hero-emoji.avif" type="image/avif" />
            <img src="/skillcanvas-workflow-hero-emoji.png" width="1254" height="1254" alt="机器人协同任务清单、工作流、目标和日程的 SkillCanvas 插画" decoding="async" fetchPriority="high" />
          </picture>
        </div>
      </header>

      <section className="showcase-intro" id="story">
        <div className="showcase-intro-message">
          <p className="showcase-intro-lead">用户往往知道自己想要什么，却很难一次说清 AI 应该怎么工作。</p>
          <picture className="showcase-intro-illustration">
            <source srcSet="/skillcanvas-unclear-intent-emoji-640.avif" type="image/avif" />
            <img src="/skillcanvas-unclear-intent-emoji-640.png" width="640" height="640" alt="" loading="lazy" decoding="async" />
          </picture>
        </div>
        <p className="showcase-intro-answer">SkillCanvas 从一句模糊需求开始，基于 16 个需求方向动态生成问题与选项，并由 AI 预选推荐答案。用户只需选择、校正或少量补充，就能逐步形成可执行的 Skill 蓝图。</p>
      </section>

      <section className="showcase-problem" aria-labelledby="problem-title">
        <div className="showcase-problem-heading">
          <h2 id="problem-title">创建 Skill，真正难的不是生成本身</h2>
          <p>难的是生成前把需求说清，生成后证明它真的好用。</p>
        </div>
        <div className="showcase-problem-rows">
          <article>
            <span>需求很难一次说清</span>
            <p>用户通常知道想达到什么效果，却很难完整表达流程、输入输出、边界和异常处理。</p>
          </article>
          <article>
            <span>开放式访谈容易漏关键决策</span>
            <p>仅靠自由问答，访谈深度依赖模型临场判断，容易遗漏授权边界、失败处理和信息策略。</p>
          </article>
          <article>
            <span>生成完成不等于真正可用</span>
            <p>结构完整仍可能存在能力断链、规则冲突和知识缺失，只有真实 Case 才能暴露问题。</p>
          </article>
        </div>
        <div className="showcase-benchmark">
          <div className="showcase-benchmark-intro">
            <span>对标研究</span>
            <h3>两组样本，分别回答“怎么创建”和“什么才算好”</h3>
          </div>
          <article>
            <div><ShowcaseIcon name="browser" size={24} /><strong>主流 Skill 生成器</strong></div>
            <p>拆解需求输入、澄清、生成与迭代链路，识别用户表达成本和过程可控性的机会点。</p>
            <span>产品判断：创建门槛可以降低，但最终质量不能只依赖用户首轮描述和模型临场发挥。</span>
          </article>
          <article>
            <div><ShowcaseIcon name="brand-github" size={24} /><strong>高使用量 Agent Skills</strong></div>
            <p>反向拆解成熟 Skill 的触发条件、执行流程、Reference、异常处理与结构组织，提炼优质产物共性。</p>
            <span>质量标准：将依赖作者经验的优秀写法，沉淀为生成规则、结构约束和 Build Gate。</span>
          </article>
          <div className="showcase-benchmark-result">
            <b>研究如何进入产品</b>
            <p>生成器研究决定产品怎么做，Top Skill 研究决定生成质量怎么验。</p>
          </div>
        </div>
      </section>

      <section className="showcase-journey" aria-labelledby="journey-title">
        <div className="showcase-journey-heading">
          <div className="showcase-section-heading">
            <h2 id="journey-title">把开放式表达，改成 AI 预选的选项式澄清</h2>
            <p>16 个需求方向保证关键维度覆盖，AI 动态生成问题与推荐选项，用户主要负责选择和校正。</p>
          </div>
          <picture className="showcase-journey-illustration">
            <source srcSet="/skillcanvas-ai-clarification-emoji-640.avif" type="image/avif" />
            <img src="/skillcanvas-ai-clarification-emoji-640.png" width="640" height="640" alt="" loading="lazy" decoding="async" />
          </picture>
        </div>
        <ol className="showcase-stage-list">
          {stages.map((stage, index) => (
            <li key={stage.title} style={{ "--stage-index": index } as React.CSSProperties}>
              <div className="showcase-stage-meta">
                <span className="showcase-stage-number">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <strong>{stage.title}</strong>
              <span>{stage.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="showcase-requirements" id="requirements" aria-labelledby="requirements-title">
        <div className="showcase-requirements-heading">
          <div className="showcase-requirements-copy">
            <span className="showcase-large-index">16</span>
            <h2 id="requirements-title">16 维 AI 选项式需求澄清</h2>
            <p className="showcase-requirements-principle">框架负责不漏关键维度，AI 负责怎么问，用户只负责校正。</p>
            <p>16 个需求方向保证覆盖，AI 根据任务与资料动态生成问题、选项并预选答案；用户只需选择、校正或少量补充，即可形成 Skill 蓝图。</p>
          </div>
          <picture className="showcase-requirements-illustration">
            <source srcSet="/skillcanvas-16d-clarification-emoji-640.avif" type="image/avif" />
            <img src="/skillcanvas-16d-clarification-emoji-640.png" alt="" width="640" height="640" loading="lazy" decoding="async" />
          </picture>
        </div>
        <div className="showcase-requirement-groups">
          {requirementGroups.map((group, groupIndex) => (
            <article key={group.title}>
              <header><span>{String(groupIndex + 1).padStart(2, "0")}</span><h3>{group.title}</h3></header>
              <ol>
                {group.items.map((item, itemIndex) => (
                  <li key={item}><span>{String(groupIndex * 4 + itemIndex + 1).padStart(2, "0")}</span>{item}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        <div className="showcase-requirement-outcome">
          <span>用户动作</span><strong>选择 / 校正推荐项</strong>
          <b aria-hidden="true">→</b>
          <span>系统产物</span><strong>可追溯的 Skill 蓝图</strong>
        </div>
      </section>

      <section className="showcase-decisions" aria-labelledby="decisions-title">
        <div className="showcase-section-heading showcase-decisions-heading">
          <h2 id="decisions-title">四个决定，定义了这个产品</h2>
          <p>从降低需求表达成本，到把优秀 Skill 的经验写成规则，再用真实任务验证改动。</p>
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

      <section className="showcase-system" id="system" aria-labelledby="system-title">
        <div className="showcase-system-copy">
          <h2 id="system-title">所有生成与修改，都从一份 SkillIR 出发</h2>
          <p>SkillIR 统一记录需求、能力、知识、工作流与评测关系，所有 Skill 文件都从同一份蓝图生成与修改；系统按任务必要性引入 Reference、Script、MCP 等能力，并融合用户资料与外部专业知识。</p>
          <p>所有行为修改先进入 SkillIR，再同步到 SKILL.md、Reference、Tool 与 Eval，避免局部修改造成规则冲突、能力断链和跨文件不一致。</p>
        </div>
        <div className="showcase-architecture" role="img" aria-label="对话、资料、能力和外部证据进入统一设计源 SkillIR，再同步为可执行 Skill 文件">
          <div className="showcase-architecture-inputs">
            <span>对话与确认</span>
            <span>文件与上下文</span>
            <span>Host Tools 与 MCP</span>
            <span>外部专业证据</span>
          </div>
          <div className="showcase-architecture-core">
            <span>统一设计源</span>
            <strong>SkillIR</strong>
          </div>
          <div className="showcase-architecture-outputs">
            <span>SKILL.md</span>
            <span>专业知识库</span>
            <span>工具契约</span>
            <span>Eval 用例库</span>
          </div>
        </div>
      </section>

      <section className="showcase-capabilities" aria-labelledby="capabilities-title">
        <div className="showcase-capabilities-heading">
          <h2 id="capabilities-title">能力不是越多越好，只保留真正有用的</h2>
          <p>每项能力先判断是否真正需要、由谁使用、失败时怎么办；没有明确收益和调用路径，就不进入 Skill。</p>
        </div>
        <div className="showcase-capability-flow" aria-label="能力从需求证据经过必要性判断后进入工作流并接受评测">
          <span>任务需求</span><b aria-hidden="true">→</b><span>必要性判断</span><b aria-hidden="true">→</b><span>接入工作流</span><b aria-hidden="true">→</b><span>对应 Eval</span>
        </div>
        <div className="showcase-capability-list">
          {capabilities.map((capability) => (
            <article key={capability.type}>
              <span className="showcase-capability-icon"><ShowcaseIcon name={capability.icon} size={25} /></span>
              <div><b>{capability.type}</b><h3>{capability.title}</h3></div>
              <p>{capability.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="showcase-gates" aria-labelledby="gates-title">
        <div className="showcase-gates-heading">
          <h2 id="gates-title">把 Top Skill 共性，沉淀成生成质量门禁</h2>
          <p>模型负责生成候选，规则负责检查结构与语义；没有通过 Gate 的版本不会进入最终交付。</p>
          <picture className="showcase-system-illustration">
            <source srcSet="/skillcanvas-quality-gate-emoji-640.avif" type="image/avif" />
            <img src="/skillcanvas-quality-gate-emoji-640.png" alt="" width="640" height="640" loading="lazy" decoding="async" />
          </picture>
        </div>
        <div className="showcase-gate-track">
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="terminal-2" size={21} /></span><b>Build Gate</b></div>
            <h3>先证明它完整可用</h3>
            <p>先检查结构、调用路径与能力闭环，再检查知识来源和跨文件一致性。</p>
          </article>
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="git-branch" size={21} /></span><b>Optimization Gate</b></div>
            <h3>再证明改动真的更好</h3>
            <p>候选版本独立执行和评分，只修改被定位的问题；出现回归就保留旧版本。</p>
          </article>
          <article>
            <div className="showcase-gate-label"><span><ShowcaseIcon name="messages" size={21} /></span><b>用户验证</b></div>
            <h3>最后证明它符合用户</h3>
            <p>用代表性 Case 展示实际运行结果，用户反馈再次进入修改与回归验证。</p>
          </article>
        </div>
      </section>

      <section className="showcase-loop" aria-labelledby="loop-title">
        <div className="showcase-loop-heading">
          <h2 id="loop-title">Eval 先找证据，Loop 再定向修复</h2>
          <p>执行、评分与修改彼此隔离；held-out 不进入优化上下文，候选只能通过 SkillIR 修改，避免过拟合和规则漂移。</p>
          <div className="showcase-loop-legend"><span>Harness</span><span>Optimization Loop</span></div>
          <picture className="showcase-system-illustration">
            <source srcSet="/skillcanvas-eval-repair-clean-emoji-640.avif" type="image/avif" />
            <img src="/skillcanvas-eval-repair-clean-emoji-640.png" alt="" width="640" height="640" loading="lazy" decoding="async" />
          </picture>
        </div>
        <LoopDiagram steps={loopSteps} />
        <div className="showcase-eval-flow showcase-loop-eval" id="eval-title" aria-label="评测规模与成本控制">
          <div><strong>10–20</strong><span>完整 Eval Case</span></div>
          <b aria-hidden="true">→</b>
          <div><strong>诊断 + held-out</strong><span>分层验证</span></div>
          <b aria-hidden="true">→</b>
          <div><strong>按需补跑</strong><span>控制评测成本</span></div>
        </div>
        <div className="showcase-loop-rule">
          <span>晋级规则</span>
          <strong>held-out 改善</strong>
          <b>+</b>
          <strong>能力闭环不下降</strong>
          <b>+</b>
          <strong>保留任务不退化</strong>
          <b aria-hidden="true">→</b>
          <strong>Commit / Rollback</strong>
        </div>
      </section>

      <section className="showcase-proof" id="proof" aria-labelledby="proof-title">
        <div className="showcase-proof-copy">
          <h2 id="proof-title">不是概念稿，已经在线运行</h2>
          <p>公开版本已部署在 Cloudflare Worker，并通过 D1 + Checkpoint 保存任务状态；模型与联网检索凭据统一由服务端管理，用户无需配置 API Key。</p>
          <a href={githubUrl} target="_blank" rel="noreferrer">阅读工程实现 <span aria-hidden="true">↗</span></a>
        </div>
        <div className="showcase-proof-metrics">
          <div className="showcase-proof-primary">
            <strong>514</strong>
            <span>项自动化测试</span>
            <p>覆盖 SkillIR、生成校验、能力编排、Eval、回滚与发布等核心链路。</p>
          </div>
          <dl>
            <div><dt><i><ShowcaseIcon name="cloud" size={20} /></i>运行环境</dt><dd>Cloudflare Workers</dd></div>
            <div><dt><i><ShowcaseIcon name="table" size={20} /></i>状态持久化</dt><dd>D1 + Checkpoint</dd></div>
            <div><dt><i><ShowcaseIcon name="terminal-2" size={20} /></i>模型服务</dt><dd>Server-managed</dd></div>
            <div><dt><i><ShowcaseIcon name="git-branch" size={20} /></i>失败恢复</dt><dd>Repair + Rollback</dd></div>
          </dl>
        </div>
      </section>

      <footer className="showcase-footer">
        <div>
          <Image src="/skillcanvas-icon-small.png" width="42" height="42" alt="" />
          <h2>让 AI 不只会回答，还能稳定地替你做事。</h2>
        </div>
        <a className="showcase-primary" href={productUrl}>开始构建 Skill <span aria-hidden="true">→</span></a>
        <p>SkillCanvas · AI 产品设计案例</p>
      </footer>
    </main>
  );
}
