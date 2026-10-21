// Shared by the contract tests: every module's routes, with sample values for their parameters,
// and the route table of docs/team/WORK_DIVISION.md §3.
const fs = require('fs');
const path = require('path');
const { loadModules, routesOf } = require('../../core/modules');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE = { id: '600001', handle: 'mandy0hku', type: 'post' };

const fill = (p) =>
  p
    .replace(/[{}]/g, '')
    .replace(/\*\w*/g, 'x')
    .replace(/:(\w+)/g, (_, k) => SAMPLE[k] ?? '1');

function moduleRoutes() {
  return loadModules().flatMap((m) =>
    routesOf(m.router).map((r) => ({ ...r, module: m.name, url: fill(r.path) })),
  );
}

// { identity: Set(['/auth/register', ...]), content: Set([...]), ... } from WORK_DIVISION.md §3.
function routeTable() {
  const md = fs.readFileSync(path.join(ROOT, 'docs/team/WORK_DIVISION.md'), 'utf8');
  const section = md.slice(md.indexOf('## 3.'), md.indexOf('## 4.'));
  const table = {};
  let current = null;
  for (const line of section.split('\n')) {
    const heading = /^### (\w+)/.exec(line);
    if (heading) {
      current = heading[1].toLowerCase() === 'backbone' ? 'core' : heading[1].toLowerCase();
      table[current] = new Set();
      continue;
    }
    if (!current || !line.startsWith('|')) continue;
    const cell = line.split(/(?<!\\)\|/)[2] || ''; // `\|` inside a cell is not a column break
    for (const [, code] of cell.matchAll(/`([^`]+)`/g)) {
      const p = code.split('?')[0].trim();
      if (p.startsWith('/')) table[current].add(p);
    }
  }
  return table;
}

module.exports = { moduleRoutes, routeTable, fill, loadModules };
