/* global document, window, innerWidth */
// Run through a Playwright page supplied by the CLI; no browser dependency is added to the app.
// A fresh development seed is required. This checks the real UI and creates two local test posts.
module.exports = async function checkContentBrowser(page, options = {}) {
  const base = options.baseURL || 'http://127.0.0.1:3000';
  const directory = options.screenshotDir;
  const results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const browser = page.context().browser();
  const sizes = [
    [390, 844],
    [768, 1024],
    [1440, 900],
    [320, 720],
  ];
  async function layout(p, label) {
    const metrics = await p.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    check(metrics.document <= metrics.width, label + ': horizontal document overflow');
    const short = await p
      .locator('main .btn, main .chip-choice span, main .toggle')
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44,
          )
          .map((n) => n.textContent),
      );
    check(short.length === 0, label + ': short touch targets ' + short.join(','));
    results.push({ label, ...metrics });
  }
  async function shot(p, file) {
    if (directory)
      await p.screenshot({
        path: directory + '/' + file + '.png',
        fullPage: !file.startsWith('viewer-'),
      });
  }
  for (const javaScriptEnabled of [true, false]) {
    for (const handle of ['mandy0hku', 'kelvin0hk', 'wing0cuhk', 'newbie0hk']) {
      const ctx = await browser.newContext({ javaScriptEnabled });
      const p = await ctx.newPage();
      await p.goto(base + '/dev/login-as/' + handle + '?next=/compose');
      for (const [width, height] of sizes) {
        await p.setViewportSize({ width, height });
        for (const [route, name] of [
          ['/compose', 'compose'],
          ['/posts/600012', 'post'],
          ['/me/comments', 'my-comments'],
        ]) {
          await p.goto(base + route);
          check((await p.locator('main').count()) === 1, name + ' missing');
          await layout(p, handle + '/' + name + '/' + width + '/js=' + javaScriptEnabled);
          if (width >= 1024)
            check(await p.locator('.desktop-sidebar').isVisible(), 'desktop nav missing');
          else {
            check(
              !(await p.locator('.desktop-sidebar').isVisible()),
              'phone/tablet sidebar visible',
            );
            if (name !== 'compose')
              check(await p.locator('.tabbar').isVisible(), 'compact nav missing');
          }
          if (name === 'my-comments' && handle === 'newbie0hk')
            check(
              await p
                .getByText('You have not commented on anything yet.', { exact: true })
                .isVisible(),
              'empty state missing',
            );
          if (javaScriptEnabled && handle === 'mandy0hku' && width !== 320)
            await shot(p, name + '-' + width);
        }
        await p.goto(base + '/compose');
        await p.getByRole('button', { name: 'Publish', exact: true }).click();
        check(
          await p.getByText('Your post cannot be blank', { exact: true }).isVisible(),
          'validation missing',
        );
        await layout(p, handle + '/error/' + width + '/js=' + javaScriptEnabled);
        if (javaScriptEnabled && handle === 'mandy0hku' && width !== 320)
          await shot(p, 'compose-error-' + width);
      }
      await ctx.close();
    }
  }
  // Ordinary forms still publish, reply, like, watch and delete when scripts are unavailable.
  for (const javaScriptEnabled of [true, false]) {
    const ctx = await browser.newContext({
      javaScriptEnabled,
      viewport: { width: 390, height: 844 },
    });
    const p = await ctx.newPage();
    await p.goto(base + '/dev/login-as/newbie0hk?next=/compose');
    await p.getByLabel('Your post', { exact: true }).fill('LongText'.repeat(90));
    await p.getByText('Trade', { exact: true }).click();
    await p.getByRole('button', { name: 'Publish', exact: true }).click();
    await p.waitForURL(/posts\/\d+$/);
    const post = p.url();
    await layout(p, 'long-unbroken-post/js=' + javaScriptEnabled);
    await p.getByLabel('Your comment', { exact: true }).fill('First comment');
    await p.getByRole('button', { name: 'Send', exact: true }).click();
    await p.waitForURL(/#c\d+$/);
    check((await p.locator('.content-alias').last().innerText()) === 'Host', 'Host missing');
    await p.getByRole('link', { name: 'Reply', exact: true }).last().click();
    check(
      await p.getByText('Replying to Host', { exact: true }).isVisible(),
      'reply target missing',
    );
    await p.getByLabel('Your comment', { exact: true }).fill('Reply to Host');
    await p.getByRole('button', { name: 'Send', exact: true }).click();
    await p.waitForURL(/#c\d+$/);
    check(
      await p.locator('.comment').last().getByText('replying to Host', { exact: true }).isVisible(),
      'reply not stored',
    );
    await p.getByRole('button', { name: /^Like/ }).click();
    await p.waitForFunction(
      () => document.querySelector('.like').getAttribute('aria-pressed') === 'true',
    );
    await p.getByRole('button', { name: /^Watch/ }).click();
    await p.waitForFunction(
      () => document.querySelector('.watch').getAttribute('aria-pressed') === 'true',
    );
    await p.locator('.comment').last().getByRole('button', { name: 'Delete', exact: true }).click();
    if (javaScriptEnabled)
      await p.locator('dialog.confirm').getByRole('button', { name: 'OK', exact: true }).click();
    await p.waitForFunction(() =>
      document.querySelector('.comment:last-child').textContent.includes('[deleted]'),
    );
    await p.getByRole('button', { name: 'Delete post', exact: true }).click();
    if (javaScriptEnabled)
      await p.locator('dialog.confirm').getByRole('button', { name: 'OK', exact: true }).click();
    await p.waitForURL('**/feed');
    check((await p.goto(post)).status() === 404, 'deleted post remained visible');
    results.push({
      flow: 'publish/comment/reply/like/watch/delete',
      javaScriptEnabled,
      passed: true,
    });
    await ctx.close();
  }
  // Full viewer: first/last bounds, keyboard, focus trap, Escape/close, scroll restoration.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(base + '/dev/login-as/mandy0hku?next=/posts/600005');
  const images = p.locator('[data-content-image]');
  await images.first().scrollIntoViewIfNeeded();
  const scroll = await p.evaluate(() => window.scrollY);
  await images.first().click();
  const viewer = p.getByRole('dialog', { name: 'Post image viewer' });
  check(await viewer.isVisible(), 'viewer did not open');
  check(await p.getByRole('button', { name: 'Previous image' }).isDisabled(), 'first-image bound');
  await p.keyboard.press('ArrowRight');
  check(
    (await p.locator('[data-viewer-count]').innerText()) === 'Image 2 of 2',
    'right navigation',
  );
  check(await p.getByRole('button', { name: 'Next image' }).isDisabled(), 'last-image bound');
  await p.keyboard.press('ArrowRight');
  check(
    (await p.locator('[data-viewer-count]').innerText()) === 'Image 2 of 2',
    'last boundary moved',
  );
  await p.keyboard.press('ArrowLeft');
  for (const key of ['Tab', 'Shift+Tab'])
    for (let i = 0; i < 8; i++) {
      await p.keyboard.press(key);
      check(
        await p.evaluate(() =>
          document.querySelector('.content-viewer').contains(document.activeElement),
        ),
        'focus escaped viewer',
      );
    }
  await shot(p, 'viewer-phone');
  await p.keyboard.press('Escape');
  check(!(await viewer.isVisible()), 'Escape did not close');
  check(await images.first().evaluate((el) => el === document.activeElement), 'focus not restored');
  check(Math.abs((await p.evaluate(() => window.scrollY)) - scroll) < 2, 'scroll not restored');
  await images.first().click();
  // Chromium touch events exercise real pointer dispatch, rather than calling the viewer code.
  const touchChecked = browser.browserType().name() === 'chromium';
  if (touchChecked) {
    const cdp = await ctx.newCDPSession(p);
    const box = await p.locator('[data-viewer-stage]').boundingBox();
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 300, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(
      (await p.locator('[data-viewer-count]').innerText()) === 'Image 2 of 2',
      'touch swipe failed',
    );
    await cdp.detach();
  }
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  await p.goto(base + '/posts/600006');
  await p.locator('[data-content-image]').click();
  check(
    await p.getByRole('button', { name: 'Previous image' }).isDisabled(),
    'single previous enabled',
  );
  check(await p.getByRole('button', { name: 'Next image' }).isDisabled(), 'single next enabled');
  await p.setViewportSize({ width: 1440, height: 900 });
  await shot(p, 'viewer-desktop');
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  check(!(await viewer.isVisible()), 'close button did not close');
  const source = await p.locator('[data-content-image]').getAttribute('href');
  await p.route('**' + source, (route) => route.abort());
  await p.reload();
  await p.locator('[data-content-image]').click();
  await p.locator('[data-viewer-error]').waitFor({ state: 'visible' });
  check(
    (await p.getByRole('link', { name: 'Open original' }).getAttribute('href')).endsWith(source),
    'failed image lost original link',
  );
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  check(!(await viewer.isVisible()), 'failed image trapped viewer');
  results.push({
    viewer: 'single/multiple/keyboard/edges/focus/scroll/close/load-error',
    touchChecked,
    passed: true,
  });
  await ctx.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const n = await nojs.newPage();
  await n.goto(base + '/dev/login-as/mandy0hku?next=/posts/600005');
  await n.locator('[data-content-image]').first().click();
  check(n.url().endsWith('/static/seed/textbook-1.svg'), 'no-JS original link failed');
  await nojs.close();
  results.push({ noJavaScriptImageLink: true });
  return results;
};
