import type { Metadata } from "next";
import Image from "next/image";
import { ShowcaseFooter, ShowcaseNav } from "../showcase-shell";
import "../showcase.css";

export const metadata: Metadata = {
  title: "案例 | SkillCanvas",
  description: "通过基金周报、竞品研究和写作修改的定制示例，了解你的资料、偏好和判断标准怎样改变 AI 的处理方式。",
};

const cases = [
  {
    index: "01",
    title: "基金周报助手",
    description: "同样是基金周报，给自己看和给团队看，重点可能不同。SkillCanvas 会帮你确认跟踪范围、可信来源、关注重点和呈现方式，再把这些要求写进 Skill。",
    request: "帮我做一个基金周报助手。",
    context: "这句话还没有说明你想看什么。需要继续确认读者、范围和分析标准，才能形成适合你的周报方法。",
    questions: ["这份周报主要给谁看？", "只跟踪你的持仓，还是也看指定指数？", "什么变化需要重点解释？", "你认可哪些数据与信息来源？", "缺少数据时，怎样呈现才符合你的要求？"],
    result: ["只整理你指定的基金和指数。", "先列变化与对应证据，再写分析。", "优先使用你确认的信息来源。", "缺失的数据明确标注，不自行补齐。", "按你确认的栏目和详略组织周报。"],
    alternative: "如果你是为团队准备周报，可以把重点改为风险和需要讨论的问题，也可以要求先确认分析提纲。读者和用途改变，处理顺序和输出要求就应跟着改变。",
    icon: "/showcase-icons/calendar-simple.png",
  },
  {
    index: "02",
    title: "竞品研究助手",
    description: "产品经理、运营人员和设计师关注的竞品变化往往不同。先说清这次研究要支持什么决定，再确定研究范围、证据要求和什么情况值得继续查。",
    request: "帮我持续研究几个竞品。",
    context: "你可能想为下一版产品寻找机会，也可能只是了解行业动态。研究目的会决定哪些信息值得投入时间。",
    questions: ["研究结果要帮助你做什么决定？", "哪些竞品、功能或商业策略值得关注？", "哪些来源可以作为证据？", "出现什么变化时需要继续深挖？", "你希望看到简短摘要还是详细分析？"],
    result: ["围绕你指定的竞品和研究维度查找信息。", "先整理证据，再区分已知事实与分析推断。", "把你关注的变化放在报告前面。", "证据不足时标注待核实，不直接下结论。", "按你希望的详略整理结果。"],
    alternative: "如果你主要关心交互设计，就可以把功能操作和用户体验放在前面；如果你要判断商业机会，可以重点看定价和目标客户。每次加载 Skill 执行时，使用你确认的研究方法。",
    icon: "/showcase-icons/competitor.png",
  },
  {
    index: "03",
    title: "写作修改助手",
    description: "“帮我润色”可能意味着只顺一下句子，也可能允许重写结构。你提供的文章、修改案例和偏好，可以帮助系统明确怎样改才符合你的表达习惯。",
    request: "按我的习惯帮我修改文档。",
    context: "先确认你认可的写作样例和允许修改的范围，才能避免文章被改得流畅，却已经不像你写的。",
    questions: ["哪些文章能代表你希望保留的风格？", "只调整语句，还是允许重新组织结构？", "哪些词、数字和事实必须保留？", "遇到含义不明的句子，要先问你吗？", "你想直接看修改稿，还是先看修改建议？"],
    result: ["参考你提供的样例和语气偏好。", "只顺语句，保留原有结构和意思。", "数字与事实保持原样，不添加新结论。", "含义不清的地方标注并询问你。", "按你确认的方式交付修改稿。"],
    alternative: "如果你允许大幅改写，Skill 可以记录先调整结构、再修改表达的顺序。个人偏好保存在你生成的文件中；使用时加载这套 Skill，更新偏好时也要修改对应内容。",
    icon: "/showcase-icons/writing.png",
  },
];

export default function ShowcaseExamplesPage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="examples" />
      <header className="sc-subpage-hero">
        <div>
          <p className="sc-section-label">看看怎样为你定制</p>
          <h1><span className="sc-title-line">同一项任务，</span><span className="sc-title-line">可以有不同的做法。</span></h1>
        </div>
        <p>下面是三个定制过程示意，展示个人要求怎样影响 AI 的处理方式。示例中的选择用于说明产品机制，并非用户实测结果。你可以确认推荐选项，也可以改成自己的做法。</p>
      </header>

      {cases.map((item) => (
        <section className="sc-case" key={item.index}>
          <div className="sc-case-head">
            <span className="sc-case-index">{item.index}</span>
            <div className="sc-case-title"><Image src={item.icon} width={126} height={126} alt="" loading="lazy" /><div><h2>{item.title}</h2><p>{item.description}</p></div></div>
          </div>
          <div className="sc-case-flow">
            <article><span>先说出你的目标</span><strong>“{item.request}”</strong><p>{item.context}</p></article>
            <article><span>AI 帮你说清具体要求</span><ul>{item.questions.map(question => <li key={question}>{question}</li>)}</ul></article>
            <article><span>一种个人选择对应的做法</span><ul>{item.result.map(result => <li key={result}>{result}</li>)}</ul></article>
          </div>
          <div className="sc-case-personalization"><h3>换一种要求，做法也会不同</h3><p>{item.alternative}</p></div>
        </section>
      ))}

      <ShowcaseFooter />
    </main>
  );
}
