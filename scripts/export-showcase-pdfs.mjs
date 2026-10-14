import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/declan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const work = path.resolve('tmp/pdfs/skillcanvas-portfolio');
await mkdir(work, { recursive: true });
await mkdir(path.resolve('output/pdf'), { recursive: true });
const live = 'https://skillcanvas-studio.declandeng.chatgpt.site/showcase';
const width = 1440, height = 1080, inset = 24;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const snapshots = [];
const svgSources = Object.fromEntries(await Promise.all(['arrow-right', 'arrow-up-right', 'arrow-down', 'arrow-back-up', 'circle-check'].map(async name => [`/icons/tabler/${name}.svg`, await readFile(path.resolve(`public/icons/tabler/${name}.svg`), 'utf8')])));
try {
  await page.goto('http://localhost:3011/showcase', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}.sc-nav{position:static!important}[data-sc-reveal]{opacity:1!important;transform:none!important;transition:none!important}.sc-swap{animation:none!important}' });
  await page.evaluate(async () => {
    document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  });
  async function capture(selector, label, { hero = false, footer = false } = {}) {
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const info = await page.evaluate(({ selector, hero, footer, live, width, svgSources }) => {
      const target = document.querySelector(selector);
      const rect = target.getBoundingClientRect();
      const y = hero ? 0 : Math.max(0, Math.ceil(rect.y + scrollY));
      const bottom = footer ? document.querySelector('main.sc-page').getBoundingClientRect().bottom + scrollY : Math.floor(rect.bottom + scrollY);
      const cropHeight = Math.ceil(bottom - y);
      const broken = [...target.querySelectorAll('img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.src);
      if (broken.length) throw Error(`Images not loaded: ${broken.join(', ')}`);
      const clone = document.querySelector('main.sc-page').cloneNode(true);
      clone.querySelectorAll('input').forEach((input, index) => {
        const original = document.querySelectorAll('main.sc-page input')[index];
        input.toggleAttribute('checked', original.checked);
        input.setAttribute('value', original.value);
      });
      clone.querySelectorAll('a').forEach(a => a.href = new URL(a.getAttribute('href'), live).href);
      const originalIcons = document.querySelectorAll('main.sc-page .sc-arrow, main.sc-page .sc-quality-icon');
      clone.querySelectorAll('.sc-arrow, .sc-quality-icon').forEach((icon, index) => {
        const url = icon.style.maskImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (!svgSources[url]) return;
        const svg = new DOMParser().parseFromString(svgSources[url], 'image/svg+xml').documentElement;
        svg.setAttribute('class', icon.className);
        svg.setAttribute('aria-hidden', 'true');
        svg.style.color = getComputedStyle(originalIcons[index]).backgroundColor;
        svg.style.background = 'none';
        svg.style.maskImage = 'none';
        icon.replaceWith(svg);
      });
      const sourceHeight = Math.ceil(document.querySelector('main.sc-page').getBoundingClientRect().height);
      const selected = clone.querySelector(selector);
      const pieces = hero ? [clone.querySelector('.sc-nav'), selected] : footer ? [selected, clone.querySelector('.sc-footer')] : [selected];
      clone.replaceChildren(...pieces);
      // Reuse the complete section, not a translated copy of the entire long page.
      // Preserve its original location in the page-height background gradient.
      clone.style.backgroundSize = `${width}px ${sourceHeight}px`;
      clone.style.backgroundPosition = `0px -${y}px`;
      const links = [...document.querySelectorAll('main.sc-page a')].map(a => {
        const r = a.getBoundingClientRect();
        return { href: new URL(a.getAttribute('href'), live).href, x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
      }).filter(r => r.y >= y && r.y + r.height <= bottom && r.width > 0);
      return { y, height: cropHeight, html: clone.outerHTML, sourceHeight, links };
    }, { selector, hero, footer, live, width, svgSources });
    const filename = `${String(snapshots.length + 1).padStart(2, '0')}.png`;
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: info.y, width, height: info.height, scale: 1 } });
    await writeFile(path.join(work, filename), Buffer.from(screenshot.data, 'base64'));
    snapshots.push({ ...info, filename, label });
    console.log(JSON.stringify({ page: snapshots.length, label, cropHeight: info.height }));
  }
  await capture('.sc-hero', '把你的工作方法变成专属 AI Skill', { hero: true });
  await capture('.sc-problem', '为什么需要 SkillCanvas');
  await capture('.sc-origin', '怎样了解你的方法');
  const stepButtons = page.locator('.sc-walkthrough-steps button');
  for (let i = 0; i < 4; i++) {
    await stepButtons.nth(i).dispatchEvent('click');
    await capture('.sc-method', `定制过程 ${i + 1} / 4`);
  }
  for (const audience of ['self', 'team']) {
    await page.locator(`input[name="sc-report-audience"][value="${audience}"]`).check();
    await capture('.sc-example', audience === 'self' ? '同一句目标：给自己看' : '同一句目标：给团队看');
  }
  await capture('.sc-anatomy', 'Skill 里保存了什么');
  await page.locator('.sc-comparison-options button').nth(1).dispatchEvent('click');
  await capture('.sc-validation', '验证与优化');
  await capture('.sc-engineering-teaser', '系统怎样检查质量');
  await capture('.sc-proof', '创建完成后', { footer: true });
  const original = await page.evaluate(() => ({
    css: [...document.styleSheets].map(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText).join('\n'); } catch { return ''; } }).join('\n'),
    bodyClass: document.body.className,
    htmlClass: document.documentElement.className,
  }));
  const pages = snapshots.map((item, index) => {
    const scale = Math.min((width - inset * 2) / width, (height - inset * 2) / item.height);
    const x = (width - width * scale) / 2, y = (height - item.height * scale) / 2;
    item.fit = { scale, x, y };
    return `<article class="pdf-page" aria-label="${item.label}"><div class="pdf-stage" style="left:${x}px;top:${y}px;transform:scale(${scale})"><div class="pdf-crop" style="height:${item.height}px"><div class="pdf-source" style="height:${item.height}px">${item.html}</div></div></div></article>`;
  }).join('\n');
  const printCss = `
    @page { size: ${width}px ${height}px; margin: 0; }
    html, body { margin: 0!important; padding: 0!important; width: ${width}px!important; background: #f4f0e8!important; }
    * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    .pdf-page { background:#f4f0e8; height:${height}px; width:${width}px; position:relative; overflow:hidden; break-after:page; page-break-after:always; }
    .pdf-page:last-child { break-after:auto; page-break-after:auto; }
    .pdf-stage { width:${width}px; position:absolute; transform-origin:top left; }
    .pdf-crop { width:${width}px; position:relative; overflow:hidden; }
    .pdf-source { width:${width}px; position:absolute; left:0; top:0; }
    .pdf-source .sc-page { width:${width}px; min-height:0!important; }
    .pdf-source .sc-page > section, .pdf-source .sc-page > .sc-hero { margin-block:0!important; }
    .sc-nav { position:static!important; }
    [data-sc-reveal] { opacity:1!important; transform:none!important; transition:none!important; }
    .sc-swap { animation:none!important; }
  `;
  await writeFile(path.join(work, 'manifest.json'), JSON.stringify({ width, height, snapshots: snapshots.map(({ html, ...item }) => item) }, null, 2));
  // Keep the source HTML, original CSS, images and fonts; only add page crops.
  const fixedViewportCss = original.css.replace(/(-?\d+(?:\.\d+)?)(d?vw|d?vh)/g, (_, value, unit) => `${Number(value) * (unit.endsWith('vw') ? width : height) / 100}px`);
  const html = `<!doctype html><html class="${original.htmlClass}"><head><meta charset="utf-8"><base href="http://localhost:3011/"><style>${fixedViewportCss}\n${printCss}</style></head><body class="${original.bodyClass}">${pages}</body></html>`;
  await writeFile(path.join(work, 'selectable-source.html'), html);
  const printPage = await context.newPage();
  // Establish the site's origin before loading its local images, masks and fonts.
  await printPage.goto('http://localhost:3011/showcase', { waitUntil: 'networkidle' });
  await printPage.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
  await printPage.emulateMedia({ media: 'screen' });
  await printPage.evaluate(async () => {
    document.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    const broken = [...document.images].filter(img => !img.naturalWidth).map(img => img.src);
    if (broken.length) throw Error(`Print images not loaded: ${broken.slice(0, 5).join(', ')}`);
  });
  const printLayout = await printPage.evaluate(({ width, height, inset, expected }) => [...document.querySelectorAll('.pdf-page')].map((frame, index) => {
    const main = frame.querySelector('main.sc-page');
    const measured = Math.ceil(main.offsetHeight);
    const scale = Math.min((width - inset * 2) / width, (height - inset * 2) / measured);
    const stage = frame.querySelector('.pdf-stage');
    stage.style.left = `${(width - width * scale) / 2}px`;
    stage.style.top = `${(height - measured * scale) / 2}px`;
    stage.style.transform = `scale(${scale})`;
    frame.querySelector('.pdf-crop').style.height = `${measured}px`;
    frame.querySelector('.pdf-source').style.height = `${measured}px`;
    return { page: index + 1, expected: expected[index], measured };
  }), { width, height, inset, expected: snapshots.map(item => item.height) });
  console.log(JSON.stringify({ printLayout }));
  // Print untransformed sections separately. Scaling is performed in the PDF
  // compositor, so browser pagination cannot cut a rounded card or long panel.
  const singleCss = `html,body{margin:0!important;padding:0!important;width:${width}px!important;background:#f4f0e8!important}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .sc-page{width:${width}px;min-height:0!important}.sc-page>section,.sc-page>.sc-hero{margin-block:0!important}
    .sc-nav{position:static!important;backdrop-filter:none!important}
    [data-sc-reveal]{opacity:1!important;transform:none!important;transition:none!important}.sc-swap{animation:none!important}`;
  for (let index = 0; index < snapshots.length; index++) {
    const item = snapshots[index];
    await printPage.setContent(`<!doctype html><html class="${original.htmlClass}"><head><meta charset="utf-8"><base href="http://localhost:3011/"><style>${fixedViewportCss}\n${singleCss}</style></head><body class="${original.bodyClass}">${item.html}</body></html>`, { waitUntil: 'networkidle' });
    await printPage.evaluate(async () => { document.querySelectorAll('img').forEach(img => img.loading = 'eager'); await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
    const naturalHeight = await printPage.locator('main.sc-page').evaluate(el => Math.ceil(el.getBoundingClientRect().height));
    item.nativeHeight = naturalHeight + 16;
    item.nativeFile = `native-${String(index + 1).padStart(2, '0')}.pdf`;
    await printPage.addStyleTag({ content: `@page{size:${width}px ${item.nativeHeight}px;margin:0}` });
    await printPage.pdf({ path: path.join(work, item.nativeFile), width: `${width}px`, height: `${item.nativeHeight}px`, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  }
  await writeFile(path.join(work, 'manifest.json'), JSON.stringify({ width, height, snapshots: snapshots.map(({ html, ...item }) => item) }, null, 2));
  console.log(JSON.stringify({ pages: snapshots.length, work }));
} finally {
  await context.close();
  await browser.close();
}
