/* global document, getComputedStyle */
// Existing Playwright browser + fresh development seed; no application dependency or fixture writes.
const assert = require('node:assert/strict');

module.exports = async function checkUserPages(browser, { baseURL, screenshotDir }) {
  const results = [];
  for (const javaScriptEnabled of [true, false]) {
    for (const viewer of ['mandy0hku', 'wing0cuhk', 'jason0ust', 'newbie0hk', 'admin0000']) {
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
          await page.goto(`${baseURL}/dev/login-as/${viewer}`);
          // The existing Content author link is a real entrance to this Discover page.
          await page.goto(baseURL + '/posts/600004');
          await page.getByRole('link', { name: 'jason0ust', exact: true }).first().click();
          assert.equal(new URL(page.url()).pathname, '/u/jason0ust');
          for (const handle of ['mandy0hku', 'filmsoc00', 'kelvin0hk', 'newbie0hk']) {
            const path = '/u/' + handle;
            assert.equal((await page.goto(baseURL + path)).status(), 200);
            const expected =
              handle === 'filmsoc00'
                ? 1
                : handle === 'mandy0hku' && !['wing0cuhk', 'jason0ust'].includes(viewer)
                  ? 1
                  : 0;
            assert.equal(await page.locator('.discover-user .post-card').count(), expected);
            assert.equal(await page.locator('.topbar-back').getAttribute('href'), '/feed');
            assert.equal(await page.locator('.desktop-sidebar').isVisible(), width >= 1024);
            assert.equal(await page.locator('.tabbar').isVisible(), width < 1024);
            assert.equal(await page.locator('.tabbar [aria-current=page]').count(), 0);
            assert.equal(await page.locator('.user-summary a').count(), viewer === handle ? 0 : 1);
            assert.equal(await page.locator('.own-page-note').count(), viewer === handle ? 1 : 0);
            const layout = await page.evaluate(() => ({
              documentWidth: document.documentElement.scrollWidth,
              targets: [...document.querySelectorAll('.topbar-back, .discover-user a')].map(
                (a) => a.getBoundingClientRect().height,
              ),
              imagesLoaded: [...document.querySelectorAll('.user-summary img')].every(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            }));
            assert.ok(layout.documentWidth <= width, `${viewer} ${path} ${width}: overflow`);
            assert.ok(
              layout.targets.every((height) => height >= 44),
              '44 px targets',
            );
            assert.ok(layout.imagesLoaded);
            if (!expected)
              assert.equal(
                await page.locator('.discover-user .empty p').textContent(),
                'No public posts yet.',
              );
            if (
              screenshotDir &&
              javaScriptEnabled &&
              viewer === 'mandy0hku' &&
              width !== 320 &&
              ['mandy0hku', 'filmsoc00', 'newbie0hk'].includes(handle)
            ) {
              const kind =
                handle === 'filmsoc00' ? 'org' : handle === 'newbie0hk' ? 'empty' : 'own';
              await page.screenshot({
                path: `${screenshotDir}/user-${kind}-${width}.png`,
                fullPage: width >= 1024,
              });
            }
            results.push({ viewer, handle, width, javaScriptEnabled, ...layout });
            if (expected) {
              const backTo = page.url();
              await page.locator('.discover-user .post-card').first().click();
              assert.match(new URL(page.url()).pathname, /^\/posts\/\d+$/);
              await page.goBack();
              assert.equal(page.url(), backTo);
            }
          }
          await page.goto(`${baseURL}/u/${viewer}`);
          assert.equal(
            await page.locator('.own-page-note').textContent(),
            'Only posts that show your handle appear here.',
          );
          assert.equal(await page.locator('.user-summary a').count(), 0);
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
          await page.keyboard.press('Tab');
          await page.getByRole('link', { name: 'Back', exact: true }).click();
          assert.equal(new URL(page.url()).pathname, '/feed');
          await page.goto(baseURL + '/u/filmsoc00');
          await page.getByRole('link', { name: 'Message', exact: true }).click();
          assert.equal(new URL(page.url()).pathname, '/messages/new');
          assert.equal(new URL(page.url()).searchParams.get('to'), 'filmsoc00');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    }
  }
  return results;
};
