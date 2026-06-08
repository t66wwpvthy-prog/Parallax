// Build a single self-contained HTML file that can be opened directly.
// Inlines engine.js into parallax_v2.html so file:// browsers do not need
// to load a separate ES module.
import { readFileSync, writeFileSync } from 'fs';

const html = readFileSync('parallax_v2.html', 'utf8');
let engine = readFileSync('engine.js', 'utf8');

const exportBlockPattern = /export\s*\{[\s\S]*?\};?\s*$/m;
const exportBlocks = engine.match(exportBlockPattern) || [];
if (exportBlocks.length !== 1) {
  throw new Error(`Expected exactly one engine export block, found ${exportBlocks.length}.`);
}

engine = engine.replace(exportBlockPattern, '');
if (/\bexport\s*\{/.test(engine)) {
  throw new Error('Engine still contains an export block after inlining cleanup.');
}

const engineImportPattern = /import\s*\{[\s\S]*?\}\s*from\s*["']\.\/engine\.js["'];?/;
const engineImports = html.match(engineImportPattern) || [];
if (engineImports.length !== 1) {
  throw new Error(`Expected exactly one ./engine.js import in parallax_v2.html, found ${engineImports.length}.`);
}

const out = html.replace(
  engineImportPattern,
  `/* engine.js inlined for single-file use */\n${engine}\n/* end engine */`
);
if (out === html || /from\s*["']\.\/engine\.js["']/.test(out)) {
  throw new Error('Standalone build did not inline the engine import.');
}
if (/\bexport\s*\{/.test(out)) {
  throw new Error('Standalone build still contains an engine export block.');
}

writeFileSync('parallax.html', out);
writeFileSync('index.html', out);
console.log('wrote parallax.html + index.html (' + out.length + ' bytes)');
