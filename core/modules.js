// Module discovery (ARCHITECTURE.md §5). Every folder in modules/ with an index.js is a module;
// app.js mounts them in alphabetical order, so adding a module never touches a shared file.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const MODULES_DIR = path.join(config.root, 'modules');

function loadModules(dir = MODULES_DIR) {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'index.js')))
    .map((d) => d.name)
    .sort();
  const modules = names.map((folder) => {
    const m = require(path.join(dir, folder, 'index.js'));
    check(m, folder);
    return {
      publicRoutes: [],
      smoke: [],
      ...m,
      dir: path.join(dir, folder),
    };
  });
  const clashes = duplicateRoutes(modules);
  if (clashes.length) {
    throw new Error(`Two modules register the same route: ${clashes.join('; ')}`);
  }
  return modules;
}

function check(m, folder) {
  const where = `modules/${folder}/index.js`;
  if (!m || m.name !== folder) throw new Error(`${where}: name must be '${folder}'`);
  if (typeof m.router !== 'function')
    throw new Error(`${where}: router must be an express.Router()`);
  for (const key of ['publicRoutes', 'smoke']) {
    if (
      m[key] !== undefined &&
      !(Array.isArray(m[key]) && m[key].every((p) => typeof p === 'string' && p.startsWith('/')))
    ) {
      throw new Error(`${where}: ${key} must be a list of paths starting with /`);
    }
  }
  if (m.locals !== undefined && typeof m.locals !== 'function') {
    throw new Error(`${where}: locals must be a function (req) => ({ ... })`);
  }
}

// [{ method, path }] for every route of an express.Router (full paths, as §5 requires).
function routesOf(router) {
  const out = [];
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const paths = [].concat(layer.route.path);
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all') continue;
      for (const p of paths) out.push({ method: method.toUpperCase(), path: String(p) });
    }
  }
  return out;
}

function duplicateRoutes(modules) {
  const seen = new Map();
  const clashes = [];
  for (const m of modules) {
    for (const r of routesOf(m.router)) {
      const key = `${r.method} ${r.path.toLowerCase()}`;
      const owner = seen.get(key);
      if (owner && owner !== m.name) clashes.push(`${key} (${owner} and ${m.name})`);
      else seen.set(key, m.name);
    }
  }
  return clashes;
}

// Exact public paths, compared without case or a trailing slash (Express routes ignore both).
function publicMatcher(modules) {
  const norm = (p) => p.toLowerCase().replace(/\/+$/, '') || '/';
  const paths = new Set(modules.flatMap((m) => m.publicRoutes).map(norm));
  return (p) => paths.has(norm(p));
}

module.exports = { loadModules, routesOf, duplicateRoutes, publicMatcher, MODULES_DIR };
