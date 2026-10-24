/* global document, getComputedStyle */
// Supply an existing Playwright browser against fresh development seed data.
const assert = require('node:assert/strict');

module.exports = async function checkMyPostsBrowser(browser, { baseURL, screenshotDir }) {
  const results = [];
  for (const javaScriptEnabled of [true, false]) {
    for (const [handle, count] of [
      ['mandy0hku', 3],
      ['wing0cuhk', 2],
      ['jason0ust', 2],
      ['newbie0hk', 0],
      ['admin0000', 0],
    ]) {
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
          await page.goto(baseURL + '/me');
          await page.getByRole('link', { name: 'My posts', exact: true }).click();
          assert.equal(new URL(page.url()).pathname, '/me/posts');
          for (const path of ['/me/posts', '/me/posts?before=1']) {
            const response = await page.goto(baseURL + path);
            assert.equal(response.status(), 200);
            assert.equal(await page.locator('h1').textContent(), 'My posts');
            assert.equal(await page.locator('.topbar-back').getAttribute('href'), '/me');
            assert.equal(await page.locator('.desktop-sidebar').isVisible(), width >= 1024);
            assert.equal(await page.locator('.tabbar').isVisible(), width < 1024);
            const nav = width >= 1024 ? '.desktop-sidebar' : '.tabbar';
            assert.equal(
              await page.locator(`${nav} [aria-current=page]`).getAttribute('href'),
              '/me',
            );
            const layout = await page.evaluate(() => ({
              documentWidth: document.documentElement.scrollWidth,
              targets: [...document.querySelectorAll('.topbar-back, .discover-my-list a')].map(
                (a) => a.getBoundingClientRect().height,
              ),
              columns: document.querySelector('.post-list')
                ? getComputedStyle(document.querySelector('.post-list')).gridTemplateColumns.split(
                    ' ',
                  ).length
                : 0,
            }));
            assert.ok(layout.documentWidth <= width, `${handle} ${width}: overflow`);
            assert.ok(
              layout.targets.every((height) => height >= 44),
              '44 px touch targets',
            );
            const expected = path.endsWith('before=1') ? 0 : count;
            assert.equal(await page.locator('.discover-my-list .post-card').count(), expected);
            if (expected) assert.equal(layout.columns, width >= 768 ? 2 : 1);
            else {
              assert.equal(
                await page.locator('.discover-my-list .empty p').textContent(),
                'You have not posted yet.',
              );
              await page.getByRole('link', { name: 'Write a post', exact: true }).click();
              assert.equal(new URL(page.url()).pathname, '/compose');
              await page.goBack();
            }
            if (
              screenshotDir &&
              javaScriptEnabled &&
              width !== 320 &&
              ((handle === 'mandy0hku' && expected) ||
                (handle === 'newbie0hk' && path === '/me/posts'))
            ) {
              await page.screenshot({
                path: `${screenshotDir}/my-posts-${handle === 'newbie0hk' ? 'empty-' : ''}${width}.png`,
                fullPage: width >= 1024,
              });
            }
            results.push({ handle, width, javaScriptEnabled, path, ...layout });
          }
          await page.goto(baseURL + '/me/posts');
          await page.keyboard.press('Tab');
          const focus = await page.evaluate(() => {
            const style = getComputedStyle(document.activeElement);
            return {
              tag: document.activeElement.tagName,
              outline: style.outlineStyle,
              width: style.outlineWidth,
            };
          });
          assert.equal(focus.tag, 'A');
          assert.notEqual(focus.outline, 'none');
          assert.notEqual(focus.width, '0px');
          // Move past the focused shared skip link before switching back to mouse navigation.
          await page.keyboard.press('Tab');
          if (count) {
            await page.locator('.discover-my-list .post-card').first().click();
            assert.match(new URL(page.url()).pathname, /^\/posts\/\d+$/);
            await page.goBack();
            assert.equal(new URL(page.url()).pathname, '/me/posts');
          }
          await page.getByRole('link', { name: 'Back', exact: true }).click();
          assert.equal(new URL(page.url()).pathname, '/me');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    }
  }
  return results;
};
