import type { Metadata } from "next";
import { ShowcaseFooter, ShowcaseNav } from "../showcase-shell";
import "../showcase.css";

export const metadata: Metadata = {
  title: "工程设计 | SkillCanvas",
  description: "了解 SkillCanvas 如何用统一蓝图、能力路由、质量门禁、独立评测与版本回滚生成可靠的 AI Skill。",
};

const sourceItems = [
  ["需求契约", "记录用户确认的目标、输入输出、边界、异常处理和验收标准。"],
  ["知识与证据", "区分用户资料、外部专业知识和系统推断，并保留来源关系。"],
  ["能力计划", "说明每项 Reference、Script、Host Tool 或 MCP 为什么需要，以及由哪个步骤调用。"],
  ["工作流", "定义步骤之间的数据依赖、终态输出和失败路径。"],
  ["评测关系", "把需求与代表性 Case、评分标准和回归任务对应起来。"],
];

const capabilityItems = [
  ["Reference", "承载用户资料、领域规则和必要的外部知识，并明确读取条件。"],
  ["Script", "处理计算、转换和校验等确定性任务，减少模型自由发挥。"],
  ["Host Tool", "调用宿主已有的文件、PDF、表格和联网能力，不重复造工具。"],
  ["MCP", "仅在任务依赖具体外部服务时接入，并定义授权与失败降级。"],
];

const gateItems = [
  ["结构完整", "检查 Skill 文件、声明字段和必要产物是否齐全。"],
  ["能力闭环", "每项能力都有触发条件、调用步骤、可观察产出和失败处理。"],
  ["工作流可达", "步骤之间的数据依赖明确，没有重复生产者、死胡同或未排序冲突。"],
  ["跨文件一致", "所有文件都从同一份蓝图生成，避免规则和名称逐步漂移。"],
];

const evalItems = [
  ["冻结契约", "锁定本轮需求、能力和验收标准，防止评测过程中改变目标。"],
  ["独立执行", "分别运行裸模型、当前 Skill 和候选版本，隔离它们的上下文。"],
  ["隔离判断", "根据验收标准和真实输出定位需求偏移、知识不足、能力缺陷或规则问题。"],
  ["有限修改", "只修改与失败证据对应的蓝图节点，减少无关变化。"],
  ["回归与回滚", "重跑已通过任务和保留任务。整体没有改善时继续使用旧版本。"],
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
          <h1>把模型的不确定性，限制在可以检查和回滚的流程里。</h1>
        </div>
        <p>SkillCanvas 不把完整产物交给一次模型生成。需求、知识、能力、工作流和评测由统一蓝图维护，并在不同阶段接受确定性检查。</p>
      </header>

      <section className="sc-engineering-section">
        <header><p className="sc-section-label">统一设计源</p><h2>所有文件都从一份 SkillIR 出发。</h2><p>用户确认和系统判断先进入统一蓝图，再投影成 Skill 文件。后续修改也先更新蓝图，减少局部修补造成的冲突。</p></header>
        <DetailList items={sourceItems} />
      </section>

      <section className="sc-engineering-section">
        <header><p className="sc-section-label">能力路由</p><h2>能力不是越多越好。</h2><p>每项能力都需要明确的任务价值、调用位置和失败处理。没有可观察产出和使用路径的能力不会进入最终 Skill。</p></header>
        <DetailList items={capabilityItems} />
      </section>

      <section className="sc-engineering-section">
        <header><p className="sc-section-label">生成质量门禁</p><h2>模型生成候选，规则决定它能否继续。</h2><p>确定性修复只处理可以安全判断的结构问题。涉及用户意图或业务语义时，系统保留现场并要求重新生成或确认。</p></header>
        <DetailList items={gateItems} />
      </section>

      <section className="sc-engineering-section">
        <header><p className="sc-section-label">验证与优化</p><h2>改动必须证明自己更好。</h2><p>执行、判断与修改彼此隔离。候选版本只有在代表性任务改善，并且原有能力没有退化时才会被保留。</p></header>
        <DetailList items={evalItems} />
      </section>

      <section className="sc-engineering-section">
        <header><p className="sc-section-label">完整生产线</p><h2>从用户确认到可回滚版本。</h2><p>每一阶段都有明确输入、产物和继续条件。失败时保留最近一次有效状态，避免整条链路从头开始。</p></header>
        <div className="sc-pipeline">
          <div><span>01</span><strong>需求契约</strong><p>确认目标、边界与验收标准。</p></div>
          <div><span>02</span><strong>统一蓝图</strong><p>组织知识、能力和工作流关系。</p></div>
          <div><span>03</span><strong>生成与门禁</strong><p>生成文件并检查结构与能力闭环。</p></div>
          <div><span>04</span><strong>执行与评测</strong><p>运行真实任务，定位问题并决定提交或回滚。</p></div>
        </div>
      </section>

      <ShowcaseFooter />
    </main>
  );
}
