import Image from "next/image";

const productUrl = "https://skillcanvas-studio.declandeng.chatgpt.site/";

export function ShowcaseNav({ current }: { current: "home" | "examples" | "engineering" }) {
  return (
    <nav className="sc-nav" aria-label="SkillCanvas 项目介绍导航">
      <a className="sc-brand" href="/showcase" aria-label="返回 SkillCanvas 项目介绍首页">
        <Image src="/skillcanvas-icon-small.png" width="36" height="36" alt="" />
        <span>SkillCanvas</span>
      </a>
      <div className="sc-nav-links">
        <a href="/showcase" aria-current={current === "home" ? "page" : undefined}>项目介绍</a>
        <a href="/showcase/examples" aria-current={current === "examples" ? "page" : undefined}>案例</a>
        <a href="/showcase/engineering" aria-current={current === "engineering" ? "page" : undefined}>工程设计</a>
      </div>
      <a className="sc-nav-cta" href={productUrl}>打开产品 <span aria-hidden="true">↗</span></a>
    </nav>
  );
}

export function ShowcaseFooter() {
  return (
    <footer className="sc-footer">
      <div>
        <Image src="/skillcanvas-icon-small.png" width="44" height="44" alt="" />
        <h2>把反复解释给 AI 的内容，变成可以持续使用的个人能力。</h2>
      </div>
      <a className="sc-button sc-button-primary" href={productUrl}>开始创建我的 Skill <span aria-hidden="true">→</span></a>
      <p>SkillCanvas · AI 产品设计与工程实践</p>
    </footer>
  );
}
