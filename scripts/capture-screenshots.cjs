const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'outputs', 'screenshots');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    // 1. Main page (desktop view) - initial landing
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1440, height: 900 });
    await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);
    await desktopPage.screenshot({
      path: path.join(OUTPUT_DIR, '01-main-desktop.png'),
      fullPage: false
    });
    console.log('Captured: 01-main-desktop.png');

    // 2. Full page desktop screenshot
    await delay(1000);
    await desktopPage.screenshot({
      path: path.join(OUTPUT_DIR, '02-main-desktop-full.png'),
      fullPage: true
    });
    console.log('Captured: 02-main-desktop-full.png');

    // 3. Try to interact - look for textarea or input and type something
    const textarea = await desktopPage.$('textarea');
    if (textarea) {
      await textarea.type('帮我创建一个用于分析财务报表的 AI Skill', { delay: 30 });
      await delay(1000);
      await desktopPage.screenshot({
        path: path.join(OUTPUT_DIR, '03-input-typed.png'),
        fullPage: false
      });
      console.log('Captured: 03-input-typed.png');
    }

    // 4. Try to click context builder if it exists
    const contextBuilder = await desktopPage.$('.context-builder-toggle');
    if (contextBuilder) {
      await contextBuilder.click();
      await delay(1500);
      await desktopPage.screenshot({
        path: path.join(OUTPUT_DIR, '04-context-builder.png'),
        fullPage: false
      });
      console.log('Captured: 04-context-builder.png');
    }

    // 5. Click starter buttons if they exist
    const starterButtons = await desktopPage.$$('.starter-row button');
    if (starterButtons.length > 0) {
      await starterButtons[0].click();
      await delay(2000);
      await desktopPage.screenshot({
        path: path.join(OUTPUT_DIR, '05-starter-clicked.png'),
        fullPage: false
      });
      console.log('Captured: 05-starter-clicked.png');
    }

    // 6. Scroll down to capture more of the page
    await desktopPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await delay(1000);
    await desktopPage.screenshot({
      path: path.join(OUTPUT_DIR, '06-scrolled-down.png'),
      fullPage: false
    });
    console.log('Captured: 06-scrolled-down.png');

    // 7. Mobile view
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 375, height: 812 });
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);
    await mobilePage.screenshot({
      path: path.join(OUTPUT_DIR, '07-mobile-view.png'),
      fullPage: false
    });
    console.log('Captured: 07-mobile-view.png');

    // 8. Mobile full page
    await delay(1000);
    await mobilePage.screenshot({
      path: path.join(OUTPUT_DIR, '08-mobile-full.png'),
      fullPage: true
    });
    console.log('Captured: 08-mobile-full.png');

    // 9. Try to capture the discovery preview / understanding stage
    // Navigate back to desktop page and try different stages
    await desktopPage.bringToFront();
    await desktopPage.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await delay(500);

    // Look for model/settings button
    const modelButton = await desktopPage.$('.model-button');
    if (modelButton) {
      await modelButton.click();
      await delay(1500);
      await desktopPage.screenshot({
        path: path.join(OUTPUT_DIR, '09-model-settings.png'),
        fullPage: false
      });
      console.log('Captured: 09-model-settings.png');
      // Close modal if any
      const escape = await desktopPage.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
    }

    // 10. Capture the understanding evidence panel if available
    const understandingPanel = await desktopPage.$('.understanding-evidence-toggle');
    if (understandingPanel) {
      await understandingPanel.click();
      await delay(1500);
      await desktopPage.screenshot({
        path: path.join(OUTPUT_DIR, '10-understanding-evidence.png'),
        fullPage: false
      });
      console.log('Captured: 10-understanding-evidence.png');
    }

    console.log('\nAll screenshots captured successfully!');
    console.log('Output directory:', OUTPUT_DIR);

    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
    console.log('Total screenshots:', files.length);
    files.forEach(f => console.log('  -', f));

  } catch (error) {
    console.error('Error during screenshot capture:', error.message);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
