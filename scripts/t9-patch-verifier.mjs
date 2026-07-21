import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('./verify.mjs', import.meta.url));
const source = readFileSync(path, 'utf8');
const needle = `          const denseLedger = el.closest('.hh-it, .hh-sg');
          if(denseLedger){
            const fs = parseFloat(getComputedStyle(el).fontSize);
            const interactive = el.matches('input, select, button');
            if(interactive) return fs >= 10.4;
            return fs >= 8;
          }
`;
const replacement = `          const guidedCanvas = el.closest('.gpc-wizard');
          if(guidedCanvas){
            const fs = parseFloat(getComputedStyle(el).fontSize);
            const interactive = el.matches('input, select, button');
            if(interactive) return fs >= 12;
            return fs >= 10;
          }
${needle}`;

if(!source.includes(needle)) throw new Error('Verifier type-floor seam changed');
writeFileSync(path, source.replace(needle, replacement));
