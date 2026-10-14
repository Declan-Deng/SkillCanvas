import type { Metadata } from "next";
import Image from "next/image";
import { ShowcaseFooter, ShowcaseNav } from "../showcase-shell";
import "../showcase.css";

export const metadata: Metadata = {
  title: "工程设计 | SkillCanvas",
  description: "了解 SkillCanvas 怎样保存用户确认的要求、选择所需工具、检查生成文件，并通过独立测试决定是否保留优化后的版本。",
};

const sourceItems = [
  ["用户确认过的要求", "记录任务目标、输入材料、输出形式和判断标准，也记录哪些内容不能改、什么时候需要询问用户。它们是生成文件和检查结果的共同依据。"],
  ["资料及其来源", "区分用户提供的资料、检索得到的专业知识和模型自己的推断，保留对应来源，避免把未经确认的推断当成用户事实。"],
  ["需要的工具和使用位置", "说明参考资料、脚本、助手自带工具或外部连接分别解决什么问题，以及在哪个步骤使用。工具选择要对应具体任务需要。"],
  ["步骤怎样衔接", "记录每一步需要什么输入、产出什么结果，后续步骤怎样接着使用。也说明遇到信息缺失或工具失败时，流程怎样继续或暂停。"],
  ["怎样检查是否符合要求", "把用户要求对应到测试任务和判断标准。例如，用户要求先确认再写正文，测试就需要检查 AI 有没有越过这一步。"],
];

const capabilityItems = [
  ["参考资料（Reference）", "保存用户文档、领域规则和检查过的外部知识。Skill 会说明什么时候读取哪些资料，帮助 AI 根据任务选择参考内容。"],
  ["脚本（Script）", "用于计算、格式转换和校验等有明确规则的工作。这些任务适合交给代码执行，避免所有结果都依赖模型临时生成。"],
  ["AI 助手自带工具（Host Tool）", "文件读写、PDF 处理、表格分析或联网等能力，可能由使用 Skill 的助手提供。Skill 描述调用方式，实际执行依赖该助手是否具备相应工具。"],
  ["外部服务连接（MCP）", "当任务需要特定外部服务时，Skill 可以声明需要怎样连接和调用。用户仍需完成安装或授权，工具不可用时也要有明确的处理方式。"],
];

const gateItems = [
  ["文件和必要内容是否齐全", "检查 Skill 的入口文件、所需资料和必要字段，避免生成了目录，却漏掉完成任务要用的内容。"],
  ["声明的能力是否真的被使用", "每项工具都要对应调用条件、工作步骤和具体产出，不能只列在能力清单里。工具失败时，也要说明接下来怎样处理。"],
  ["步骤能不能接到最终结果", "检查步骤之间的输入输出关系，识别重复产出、结果无人使用和修改顺序不清楚等问题，避免某个步骤成为无法继续的死胡同。"],
  ["不同文件有没有互相矛盾", "工作说明、参考资料和工具规则都依据同一份蓝图生成与更新，检查名称和要求是否一致，减少多次修改之后出现的冲突。"],
];

const evalItems = [
  ["先确定本轮检查什么", "锁定用户已经确认的要求和判断标准。比较版本时沿用这些标准，避免为了让新版本看起来更好而临时改变任务目标。"],
  ["分别运行不同版本", "在网页测试环境中，分别运行普通模型、当前 Skill 和候选版本，隔离它们的上下文，防止一组看到另一组的回答。"],
  ["根据回答查找具体问题", "评测根据任务要求和执行结果，检查是否遗漏要求、缺少知识、跳过步骤或使用了冲突规则，再把问题对应到相关内容。"],
  ["围绕发现的问题修改", "系统针对有证据支持的问题提出改动，避免把不相关的步骤和资料一起重写。涉及用户做法的改变，需要保持与已确认要求一致。"],
  ["重测并决定保留哪个版本", "修改后再运行已通过的任务和额外保留的测试，检查整体表现。没有改善或损害原有表现时，继续保留之前的版本。"],
];

function DetailList({ items }: { items: string[][] }) {
  return <div className="sc-engineering-list">{items.map(([title, detail], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{detail}</p></article>)}</div>;
}

export default function ShowcaseEngineeringPage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="engineering" />
      <header className="sc-subpage-hero">
        <div>
          <p className="sc-section-label">工程设计</p>
          <h1><span className="sc-title-line">你确认的要求，</span><span className="sc-title-line">怎样变成可检查的 Skill。</span></h1>
        </div>
        <div className="sc-subpage-intro"><Image src="/showcase-icons/system-hub.png" width={138} height={138} alt="" priority /><p>生成一套文件还不够：你的要求要保留下来，步骤要能够衔接，工具要有实际用途，修改之后还要重新测试。这一页解释系统怎样组织和检查这些内容。</p></div>
      </header>

      <section className="sc-engineering-section">
        <header><Image className="sc-section-icon" src="/showcase-icons/single-source.png" width={120} height={120} alt="" loading="lazy" /><p className="sc-section-label">先整理一份完整说明</p><h2><span className="sc-title-line">先记清你的要求，</span><span className="sc-title-line">再生成对应文件。</span></h2><p>系统用一份统一蓝图（SkillIR）记录需求、资料、工具和步骤之间的关系。生成和修改都先依据这份蓝图，再更新对应文件，让不同文件沿用同一套要求。</p></header>
        <DetailList items={sourceItems} />
      </section>

      <section className="sc-engineering-section">
        <header><Image className="sc-section-icon" src="/showcase-icons/tools.png" width={120} height={120} alt="" loading="lazy" /><p className="sc-section-label">按需要选择知识和工具</p><h2><span className="sc-title-line">任务需要什么，</span><span className="sc-title-line">就说明怎样使用。</span></h2><p>有的任务主要需要工作说明和参考资料，有的还需要脚本或外部服务。系统会判断这些能力具体解决什么问题，并检查它们有没有进入实际步骤。</p></header>
        <DetailList items={capabilityItems} />
      </section>

      <section className="sc-engineering-section">
        <header><Image className="sc-section-icon" src="/showcase-icons/context-stack.png" width={120} height={120} alt="" loading="lazy" /><p className="sc-section-label">生成之后检查完整性</p><h2><span className="sc-title-line">文件生成了，</span><span className="sc-title-line">还要检查能否衔接。</span></h2><p>程序会检查文件、规则和步骤关系。能明确判断的结构问题可以按规则修复；涉及业务含义时，系统需要重新生成或请求确认，不能随意改掉你的要求。</p></header>
        <DetailList items={gateItems} />
      </section>

      <section className="sc-engineering-section">
        <header><Image className="sc-section-icon" src="/showcase-icons/independent-check.png" width={120} height={120} alt="" loading="lazy" /><p className="sc-section-label">用任务比较修改效果</p><h2><span className="sc-title-line">修改之后，</span><span className="sc-title-line">再看结果是否改善。</span></h2><p>系统将执行任务、判断结果和提出修改分开处理。每轮根据测试发现的问题尝试优化，再与当前版本比较，决定是否保留候选版本。</p></header>
        <DetailList items={evalItems} />
      </section>

      <section className="sc-engineering-section">
        <header><Image className="sc-section-icon" src="/showcase-icons/rollback.png" width={120} height={120} alt="" loading="lazy" /><p className="sc-section-label">保留进度和可用版本</p><h2><span className="sc-title-line">遇到问题，</span><span className="sc-title-line">保留已经完成的内容。</span></h2><p>每个阶段都记录输入、输出和继续条件。生成失败时保留已完成阶段，优化未通过时保留原版本，让用户知道停在哪里，以及哪些内容仍然可以使用。</p></header>
        <div className="sc-pipeline">
          <div><span>01</span><strong>确认你的要求</strong><p>记录目标、处理方式和你认可的完成标准。</p></div>
          <div><span>02</span><strong>整理统一说明</strong><p>让资料、工具和工作步骤对应这些要求。</p></div>
          <div><span>03</span><strong>生成并检查文件</strong><p>检查必要内容是否完整、规则是否一致。</p></div>
          <div><span>04</span><strong>测试并选择版本</strong><p>比较任务结果，决定保留修改还是使用原版本。</p></div>
        </div>
      </section>

      <ShowcaseFooter />
    </main>
  );
}
