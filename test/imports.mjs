/**
 * Module-graph check.
 *
 * A missing named export is a *fatal* ES module linking error, and it fails in the
 * worst possible way: silently. The browser aborts the entire import graph, so
 * every top-level statement in the entry module never runs — no console error
 * attributable to the page, no partial render, just an empty element.
 *
 * That happened here once (`caseLabel` imported but not re-exported), and it was
 * only visible by loading the deployed site in a real browser. This check makes
 * the class of bug catchable in CI instead.
 *
 * Strategy: parse each local module for its `import { ... } from './x.js'`
 * statements, resolve the target, and confirm every named import appears in the
 * target's `export` statements or in an `export { ... } from` re-export.
 *
 * Run with: node test/imports.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';

/** Directories to audit. `runtime/` is vendored third-party code, left alone. */
const ROOTS = ['game', 'actions'];
const ENTRY = ['game/app.js'];

/** Collect every .js file under the given roots plus the entries. */
async function collect(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(resolve(dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Extract `import { a, b as c } from './x.js'` specs. */
function parseImports(source) {
  const specs = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    if (names.length) specs.push({ names, from: m[2] });
  }
  return specs;
}

/** Extract every name a module exports, including re-exports. */
function parseExports(source) {
  const names = new Set();

  // export function/const/let/class Name
  for (const m of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }

  // export { a, b as c }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }

  // export default
  if (/export\s+default\b/.test(source)) names.add('default');

  // export * from './x.js' — resolves to whatever that exports; treated as opaque.
  if (/export\s*\*\s*from/.test(source)) names.add('*');

  return names;
}

let problems = 0;

async function audit(files) {
  // Cache exports per resolved path.
  const exportCache = new Map();
  async function exportsOf(path) {
    if (!exportCache.has(path)) {
      let src;
      try {
        src = await readFile(path, 'utf8');
      } catch {
        exportCache.set(path, null);
        return null;
      }
      exportCache.set(path, parseExports(src));
    }
    return exportCache.get(path);
  }

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const spec of parseImports(source)) {
      // Only audit local relative modules.
      if (!spec.from.startsWith('.')) continue;
      const target = resolve(dirname(file), spec.from);
      const exports = await exportsOf(target);
      if (!exports) {
        problems++;
        console.log(`  FAIL  ${file}\n        imports missing file ${spec.from}`);
        continue;
      }
      if (exports.has('*')) continue; // opaque re-export, skip
      for (const name of spec.names) {
        if (!exports.has(name)) {
          problems++;
          console.log(
            `  FAIL  ${file}\n        imports '${name}' from ${spec.from}, which does not export it`
          );
        }
      }
    }
  }
}

const files = new Set([...ENTRY]);
for (const root of ROOTS) {
  for (const f of await collect(root)) files.add(f);
}

console.log(`\nAuditing ${files.size} local modules for broken named imports…\n`);
await audit([...files].sort());

if (problems === 0) {
  console.log('\nAll named imports resolve. No linking errors.\n');
} else {
  console.log(`\n${problems} broken import(s). These abort the whole module graph.\n`);
}
process.exit(problems === 0 ? 0 : 1);
