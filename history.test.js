/* Guards for the History module — the cross-era reference analytics.
   Informational surface only, but the numbers must still be exact reads
   of the record. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert';
import { RETURN_DATA, weightedAssetReturn } from './engine.js';
import {
  MACRO_TAGS, HC_BLOCKS, HC_EQUITY_WEIGHTS,
  hcClassifyShape, hcBlockGmr, profileThroughWeights,
  hcDistance, hcSymmetry, hcFindMatches, hcNextReturn,
  hcEnvironmentLabel, hcReferenceSet
} from './history.js';

test('every return year carries a macro tag', () => {
  for(const r of RETURN_DATA){
    const m = MACRO_TAGS[r.y];
    assert.ok(m && m.phase && m.inflation && m.fed, `macro tag missing for ${r.y}`);
  }
});

test('blocks tile the record', () => {
  assert.strictEqual(HC_BLOCKS.length, RETURN_DATA.length - 2);
  assert.strictEqual(HC_BLOCKS[0].start, RETURN_DATA[0].y);
  assert.strictEqual(HC_BLOCKS[HC_BLOCKS.length-1].end, RETURN_DATA[RETURN_DATA.length-1].y);
});

test('block GMR is the exact compound of the equity-lens years', () => {
  const b = hcBlockGmr(1991);
  const rows = RETURN_DATA.filter(r => r.y >= 1991 && r.y <= 1993);
  const prod = rows.reduce((p, r) => p * (1 + weightedAssetReturn(r, HC_EQUITY_WEIGHTS)), 1);
  assert.ok(Math.abs(b.gmr - (Math.pow(prod, 1/3) - 1)) < 1e-12);
});

test('shape classifier fixed cases', () => {
  assert.strictEqual(hcClassifyShape([0.12, 0.15, 0.11]), 'sustained-strong');
  assert.strictEqual(hcClassifyShape([0.02, 0.04, 0.01]), 'sustained-up');
  assert.strictEqual(hcClassifyShape([-0.05, -0.02, -0.10]), 'sustained-down');
  assert.strictEqual(hcClassifyShape([-0.15, 0.02, 0.20]), 'V-recovery');
  assert.strictEqual(hcClassifyShape([0.18, 0.03, -0.06]), 'rollover');
  assert.strictEqual(hcClassifyShape([0.02, -0.01, 0.03]), 'mixed');
});

test('a block matches itself perfectly', () => {
  const b = hcBlockGmr(1982);
  assert.strictEqual(hcDistance(b, b), 0);
  const sym = hcSymmetry(b, b);
  assert.strictEqual(sym.score, 100);
  for(const v of Object.values(sym.checks)) assert.strictEqual(v, 1.0);
});

test('distance is symmetric', () => {
  const a = hcBlockGmr(1973), b = hcBlockGmr(2000);
  assert.ok(Math.abs(hcDistance(a, b) - hcDistance(b, a)) < 1e-12);
});

test('matches respect the separation window', () => {
  const target = HC_BLOCKS[HC_BLOCKS.length-1];
  for(const m of hcFindMatches(target, 10)){
    assert.ok(Math.abs(m.block.start - target.start) >= 15, `${m.block.label} too close to ${target.label}`);
  }
});

test('what happened next is read from the record, never extrapolated', () => {
  assert.strictEqual(hcNextReturn(HC_BLOCKS[HC_BLOCKS.length-1]), null,
    'the present block has no next-3-years yet');
  const past = hcBlockGmr(1991);
  const next = hcNextReturn(past);
  const check = hcBlockGmr(1994);
  assert.strictEqual(next, check.gmr, 'next-3 equals the 1994–1996 block');
});

test('reference set: same broad environment first, all with a full aftermath', () => {
  const target = HC_BLOCKS[HC_BLOCKS.length-1];
  const refs = hcReferenceSet(target, 5);
  assert.strictEqual(refs.length, 5);
  const env = hcEnvironmentLabel(target);
  let seenNonEnv = false;
  for(const r of refs){
    assert.ok(Math.abs(r.block.start - target.start) >= 10);
    assert.notStrictEqual(hcNextReturn(r.block), null, `${r.block.label} lacks an aftermath`);
    if(!r.envMatch) seenNonEnv = true;
    else assert.ok(!seenNonEnv, 'environment matches must come before fallbacks');
    assert.strictEqual(r.envMatch, hcEnvironmentLabel(r.block) === env);
  }
});

test('profileThroughWeights with a single-asset weight equals that asset compound', () => {
  const w = { usLarge:1, usSmall:0, intlDev:0, emerging:0, usBonds:0, cash:0, reit:0, gold:0 };
  const got = profileThroughWeights(1995, w);
  const rows = RETURN_DATA.filter(r => r.y >= 1995 && r.y <= 1997);
  const prod = rows.reduce((p, r) => p * (1 + r.usLarge), 1);
  assert.ok(Math.abs(got - (Math.pow(prod, 1/3) - 1)) < 1e-12);
});
