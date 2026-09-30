import type { Metadata } from "next";
import { ShowcaseFooter, ShowcaseNav } from "../showcase-shell";
import "../showcase.css";

export const metadata: Metadata = {
  title: "案例 | SkillCanvas",
  description: "查看 SkillCanvas 如何把一句模糊目标，逐步整理成包含流程、知识、判断规则和验证任务的 AI Skill。",
};

const cases = [
  {
    index: "01",
    title: "基金周报助手",
    description: "把分散的持仓、市场事件和个人判断框架，整理成每周可重复执行的周报流程。",
    request: "帮我做一个基金周报助手。",
    questions: ["周报给谁看", "跟踪哪些基金与指数", "哪些变化值得解释", "缺少数据时怎么办", "AI 可以做哪些判断"],
    result: ["信息来源与时效要求", "分析顺序与判断条件", "固定输出结构", "不确定信息的标注规则", "代表性验证 Case"],
  },
  {
    index: "02",
    title: "竞品研究助手",
    description: "保存研究范围、来源优先级和变化判断标准，让下一次研究不必重新搭建整套 Context。",
    request: "帮我持续研究几个竞品。",
    questions: ["研究服务于什么决策", "哪些信息需要持续追踪", "什么来源可以信任", "哪些变化值得提醒", "什么时候继续深挖"],
    result: ["竞品与维度范围", "来源选择规则", "证据与推断的边界", "变化识别流程", "报告与提醒格式"],
  },
  {
    index: "03",
    title: "写作修改助手",
    description: "学习用户自己的文本与修改习惯，明确哪些内容可以润色，哪些事实和表达必须保留。",
    request: "按我的习惯帮我修改文档。",
    questions: ["哪些文本能代表你的风格", "允许调整到什么程度", "数字和事实如何处理", "不确定时是否需要标记", "终稿前是否需要确认"],
    result: ["语气与句式偏好", "不可修改的内容", "事实保真规则", "不确定项处理方式", "交付前检查清单"],
  },
];

export default function ShowcaseExamplesPage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="examples" />
      <header className="sc-subpage-hero">
        <div>
          <p className="sc-section-label">案例</p>
          <h1>同一句模糊目标，背后藏着完全不同的工作方法。</h1>
        </div>
        <p>SkillCanvas 不套用固定模板。它根据任务动态寻找需要确认的决策，再把用户的选择整理成可执行、可验证的 Skill。</p>
      </header>

      {cases.map((item) => (
        <section className="sc-case" key={item.index}>
          <div className="sc-case-head">
            <span className="sc-case-index">{item.index}</span>
            <div><h2>{item.title}</h2><p>{item.description}</p></div>
          </div>
          <div className="sc-case-flow">
            <article><span>最初输入</span><strong>“{item.request}”</strong></article>
            <article><span>需要继续问清</span><ul>{item.questions.map(question => <li key={question}>{question}</li>)}</ul></article>
            <article><span>最终沉淀</span><ul>{item.result.map(result => <li key={result}>{result}</li>)}</ul></article>
          </div>
        </section>
      ))}

      <ShowcaseFooter />
    </main>
  );
}
