// Build a single self-contained HTML file Nathan can just double-click.
// Inlines engine.js into parallax_v2.html so there's no ES-module import
// (file:// browsers block module imports — that's why opening the split
// version locally appears dead).
// Output: parallax.html
import { readFileSync, writeFileSync } from 'fs';

const html   = readFileSync('parallax_v2.html', 'utf8');
let   engine = readFileSync('engine.js', 'utf8');

// Strip the engine's export block; we're not loading it as a module anymore.
engine = engine.replace(/export\s*\{[\s\S]*?\};?\s*$/m, '');

// Replace the HTML's `import { ... } from "./engine.js";` line with the
// engine source itself. Everything the UI imports becomes a top-level
// binding inside the same module scope.
const out = html.replace(
  /import\s*\{[\s\S]*?\}\s*from\s*["']\.\/engine\.js["'];?/,
  // The engine already declares `plan` (exported as defaultPlan); the UI uses
  // that same binding, so no aliasing line is needed.
  `/* ── engine.js inlined for single-file use ── */\n${engine}\n/* ── end engine ── */`
);

writeFileSync('parallax.html', out);
console.log('wrote parallax.html (' + out.length + ' bytes)');
