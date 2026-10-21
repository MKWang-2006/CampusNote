// npm run load-test: adds 20,000 posts to the DEVELOPMENT database, then times every module's
// smoke pages as mandy0hku (PRODUCT_SPEC §7: every page under 300 ms). `npm run db:reset`
// removes the extra posts again.
//   npm run load-test                 add 20,000 posts, then time the pages
//   npm run load-test -- --pages      only time the pages
//   npm run load-test -- --posts 5000 a different number of posts
const request = require('supertest');
const config = require('../core/config');
const db = require('../core/db');
const { createApp } = require('../app');
const { loadModules } = require('../core/modules');

const args = process.argv.slice(2);
const COUNT = Number(args[args.indexOf('--posts') + 1]) || 20000;
const BATCH = 1000;
const LIMIT_MS = 300;

const WORDS = [
  'library', 'exam', 'midterm', 'canteen', 'lecture', 'tutorial', 'professor', 'hall', 'MTR',
  'internship', 'deadline', 'project', 'group', 'coffee', 'rain', 'typhoon', 'dorm', 'bus',
  'database', 'SQL', 'notes', 'quiz', 'assignment', 'friend', 'weekend', 'hike', 'film',
  '圖書館', '考試', '飯堂', '功課', '宿舍', '咖啡', '颱風', '實習', '朋友', '周末', '電影',
]; // prettier-ignore

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sentence = () =>
  Array.from({ length: 6 + Math.floor(Math.random() * 30) }, () => pick(WORDS)).join(' ');

async function addPosts() {
  const users = (await db.q('SELECT user_id FROM users')).map((u) => u.user_id);
  const topics = (await db.q('SELECT topic_id FROM topics')).map((t) => t.topic_id);
  const started = Date.now();
  for (let done = 0; done < COUNT; done += BATCH) {
    const n = Math.min(BATCH, COUNT - done);
    await db.tx(async (t) => {
      const rows = Array.from({ length: n }, () => [
        pick(users),
        pick(topics),
        sentence(),
        Math.random() < 0.8 ? 1 : 0,
        Math.random() < 0.5 ? 'all' : 'university',
        pick(['cat', 'fox', 'panda', 'owl', 'whale']),
        // spread over the last 60 days, so Hot (7 days) and the feeds both have plenty
        new Date(Date.now() - Math.random() * 60 * 24 * 3600e3),
      ]);
      const res = await t.q(
        `INSERT INTO posts (author_id, topic_id, body, is_anonymous, visibility, avatar_code, created_at)
         VALUES ?`,
        [rows],
      );
      // The author's Host row (alias 0) for each new post, as content's publish does.
      await t.q(
        `INSERT INTO post_participants (post_id, user_id, alias_no, joined_at)
         SELECT post_id, author_id, 0, created_at FROM posts WHERE post_id >= ? AND post_id < ?`,
        [res.insertId, res.insertId + n],
      );
    });
    process.stdout.write(`\r${done + n} / ${COUNT} posts`);
  }
  await db.q('ANALYZE TABLE posts, post_participants');
  console.log(` added in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

async function timePages() {
  const agent = request.agent(createApp());
  const login = await agent.get('/dev/login-as/mandy0hku');
  if (login.status !== 303) throw new Error('could not log in as mandy0hku (is this development?)');
  const pages = [...new Set(loadModules().flatMap((m) => m.smoke))];
  let slow = 0;
  console.log(`\nPage timings as mandy0hku (median of 5, limit ${LIMIT_MS} ms):`);
  for (const url of pages) {
    const times = [];
    let status = 0;
    for (let i = 0; i < 5; i += 1) {
      const t0 = process.hrtime.bigint();
      status = (await agent.get(url)).status;
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const median = times.sort((a, b) => a - b)[2];
    if (median > LIMIT_MS) slow += 1;
    console.log(
      `${median > LIMIT_MS ? 'SLOW' : 'ok  '} ${median.toFixed(0).padStart(5)} ms  ${status}  ${url}`,
    );
  }
  console.log(slow ? `\n${slow} page(s) over ${LIMIT_MS} ms.` : '\nEvery page is under the limit.');
}

async function main() {
  if (!config.isDev) throw new Error('load-test runs against the development database only');
  console.log(`Database: ${config.db.database}`);
  if (!args.includes('--pages')) await addPosts();
  await timePages();
}

main()
  .catch((err) => {
    console.error(`load-test failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
