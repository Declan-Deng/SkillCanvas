import Image from "next/image";
import { ShowcaseArrow } from "./showcase-arrow";

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";

export function ShowcaseNav({ current }: { current: "home" | "examples" | "engineering" }) {
  return (
    <nav className="sc-nav" aria-label="SkillCanvas 项目介绍导航">
      <a className="sc-brand" href="/showcase" aria-label="返回 SkillCanvas 项目介绍首页">
        <Image src="/skillcanvas-apple-icon.png?v=20260927" width="36" height="36" alt="" />
        <span>SkillCanvas</span>
      </a>
      <div className="sc-nav-links">
        <a href="/showcase" aria-current={current === "home" ? "page" : undefined}>项目介绍</a>
        <a href="/showcase/examples" aria-current={current === "examples" ? "page" : undefined}>案例</a>
        <a href="/showcase/engineering" aria-current={current === "engineering" ? "page" : undefined}>工程设计</a>
      </div>
      <a className="sc-nav-cta" href={productUrl}>打开产品 <ShowcaseArrow direction="up-right" /></a>
    </nav>
  );
}

export function ShowcaseFooter() {
  return (
    <footer className="sc-footer">
      <div>
        <Image src="/skillcanvas-apple-icon.png?v=20260927" width="44" height="44" alt="" />
        <h2>把你熟悉的做法，保存成自己的 AI Skill。</h2>
      </div>
      <a className="sc-button sc-button-primary" href={productUrl}>创建我的 Skill <ShowcaseArrow /></a>
      <p>SkillCanvas · 根据你的资料、经验和标准定制，支持任务测试与文件导出。</p>
    </footer>
  );
}
