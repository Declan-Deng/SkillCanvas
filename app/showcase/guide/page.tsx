import type { Metadata } from "next";
import { ShowcaseArrow } from "../showcase-arrow";
import { ShowcaseFooter, ShowcaseNav } from "../showcase-shell";
import "../showcase.css";

export const metadata: Metadata = {
  title: "使用指南 | SkillCanvas",
  description: "了解怎样导出专属 Skill、在支持的 AI 助手中加载，并用日常任务检查和更新你的工作方法。",
};

const usageSteps = [
  { title: "导出你的 Skill", detail: "完成生成与效果验证后，在“保存并使用”中检查文件并下载 ZIP。解压后保留整个 Skill 文件夹，不要只复制 SKILL.md；参考资料、脚本和其他文件也可能是执行任务所必需的。" },
  { title: "在支持的 AI 助手中加载", detail: "按你所用 AI 助手的 Skill 安装或导入说明加载整个文件夹，并确认它能读到入口文件和参考资料。如果 Skill 需要脚本、外部服务或其他工具，还需按文件中的说明配置相应能力与授权。不同助手的加载方式可能不同。" },
  { title: "用日常任务复用与检查", detail: "先用一个你熟悉的任务试运行，确认它是否按约定处理资料、遵循步骤和输出要求。网页中的测试不代表所有宿主工具都已验证；实际使用时仍需检查工具是否可用。资料、标准或偏好改变后，更新 Skill 文件并重新测试。" },
];

export default function ShowcaseGuidePage() {
  return (
    <main className="sc-page">
      <ShowcaseNav current="home" />
      <header className="sc-subpage-hero">
        <div><p className="sc-section-label">使用指南</p><h1>把专属 Skill 用起来。</h1></div>
        <p>先导出完整文件，再在支持的 AI 助手中加载。用你的实际任务确认效果，并随着工作方法的变化更新它。</p>
      </header>
      <section className="sc-case" aria-label="导出、加载与复用步骤">
        <ol className="sc-usage-steps">{usageSteps.map(({ title, detail }) => <li key={title}><h2>{title}</h2><p>{detail}</p></li>)}</ol>
        <div className="sc-actions"><a className="sc-button sc-button-primary" href="/">打开 SkillCanvas <ShowcaseArrow /></a><a className="sc-button sc-button-secondary" href="/showcase#proof-title">返回项目介绍</a></div>
      </section>
      <ShowcaseFooter />
    </main>
  );
}
