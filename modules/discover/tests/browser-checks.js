/* global document, window, getComputedStyle */
// Supply an existing Playwright browser; the application gains no browser dependency.
// Uses only development seed data and read-only Feed URLs.
const assert = require('node:assert/strict');

module.exports = async function checkFeedBrowser(browser, { baseURL, screenshotDir }) {
  const results = [];
  for (const javaScriptEnabled of [true, false]) {
    for (const handle of ['mandy0hku', 'wing0cuhk', 'jason0ust', 'newbie0hk', 'admin0000']) {
      for (const [width, height] of [
        [390, 844],
        [768, 1024],
        [1440, 900],
        [320, 720],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          javaScriptEnabled,
        });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(`${baseURL}/dev/login-as/${handle}`);
          for (const path of [
            '/feed',
            '/feed?tab=uni',
            '/feed?tab=food',
            '/feed?tab=food&before=1',
          ]) {
            const response = await page.goto(baseURL + path);
            assert.equal(response.status(), 200, `${handle} ${path}`);
            const layout = await page.evaluate(() => ({
              width: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              columns: getComputedStyle(
                document.querySelector('.post-list') || document.querySelector('.discover-feed'),
              ).gridTemplateColumns,
              targets: [...document.querySelectorAll('.discover-feed .tabs a')].map(
                (a) => a.getBoundingClientRect().height,
              ),
            }));
            assert.ok(layout.documentWidth <= width, `${handle} ${width} ${path}: overflow`);
            assert.ok(
              layout.targets.every((target) => target >= 44),
              'Feed tab touch targets',
            );
            assert.equal(await page.locator('.desktop-sidebar').isVisible(), width >= 1024);
            assert.equal(await page.locator('.tabbar').isVisible(), width < 1024);
            assert.equal(await page.locator('.discover-feed [aria-current=page]').count(), 1);
            if (javaScriptEnabled) {
              const selectedVisible = await page
                .locator('.discover-feed [aria-current=page]')
                .evaluate((a) => {
                  const selected = a.getBoundingClientRect();
                  const strip = a.parentElement.getBoundingClientRect();
                  return selected.left >= strip.left - 1 && selected.right <= strip.right + 1;
                });
              assert.ok(
                selectedVisible,
                `${handle} ${width} ${path}: selected filter is off-screen`,
              );
            }
            if (path.endsWith('before=1')) {
              assert.equal(
                await page.locator('.discover-feed .empty p').textContent(),
                'No posts in Food yet.',
              );
            }
            results.push({ handle, width, javaScriptEnabled, path, ...layout });
            if (
              screenshotDir &&
              javaScriptEnabled &&
              handle === 'mandy0hku' &&
              path === '/feed' &&
              width !== 320
            ) {
              await page.screenshot({
                path: `${screenshotDir}/feed-${width}.png`,
                fullPage: width >= 1024,
              });
            }
          }
          // Real links must keep working when JavaScript is disabled.
          await page.getByRole('link', { name: 'Food', exact: true }).click();
          assert.equal(new URL(page.url()).searchParams.get('tab'), 'food');
          assert.equal(await page.locator('#feed-heading').textContent(), 'Food posts');
          if (javaScriptEnabled) {
            assert.ok(
              await page
                .locator('.discover-feed .tabs')
                .evaluate((tabs) => tabs.scrollLeft > 0 || tabs.scrollWidth <= tabs.clientWidth),
            );
            assert.equal(await page.evaluate(() => window.scrollY), 0);
            assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BODY');
          }
          assert.equal(
            await page.locator('.discover-feed .post-card').count(),
            handle === 'jason0ust' || handle === 'wing0cuhk' ? 1 : 2,
          );
          await page.keyboard.press('Tab');
          const focus = await page.evaluate(() => {
            const active = document.activeElement;
            const style = getComputedStyle(active);
            return { tag: active.tagName, outline: style.outlineStyle, width: style.outlineWidth };
          });
          assert.equal(focus.tag, 'A');
          assert.notEqual(focus.outline, 'none');
          assert.notEqual(focus.width, '0px');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    }
  }
  return results;
};
