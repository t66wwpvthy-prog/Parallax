/* ============================================================================
   PARALLAX HISTORY — cross-era reference analytics. Informational only.
   Builds 3-year block profiles from the engine's RETURN_DATA (real returns,
   1928–2025), tags each block with its macro environment (a static, hand-
   checked lookup), and ranks the historical blocks that most resemble any
   reference block — including the present one — on both return profile and
   environment. "What happened next" is read straight from the record.

   This module feeds the History page: context for client conversations,
   NOT planning input. Nothing here flows into simulations, scenarios, or
   any planning surface. Same broad environment never implies same outcome.

   All return math here is composition of engine exports (weightedAssetReturn
   over RETURN_DATA); the macro tags are descriptive historical facts.
   ========================================================================== */
import { RETURN_DATA, ASSET_KEYS, weightedAssetReturn } from './engine.js';

const MACRO_TAGS = {
  1928:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'Roaring 20s peak; Fed warns on speculation'},
  1929:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'October crash; Depression begins'},
  1930:{phase:'contraction',inflation:'deflation',fed:'easing-slow',notes:'Banking panics; Smoot-Hawley tariffs'},
  1931:{phase:'contraction',inflation:'deflation',fed:'tightening',notes:'UK leaves gold standard; second banking panic'},
  1932:{phase:'contraction',inflation:'deflation',fed:'holding',notes:'Depression trough; Hoover lame duck'},
  1933:{phase:'recovery',inflation:'rising',fed:'easing',notes:'New Deal; bank holiday; gold standard suspended'},
  1934:{phase:'recovery',inflation:'rising',fed:'easing',notes:'Securities Exchange Act; recovery continues'},
  1935:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Social Security; recovery accelerating'},
  1936:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Fed doubles reserve requirements'},
  1937:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'Roosevelt recession; premature tightening'},
  1938:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Recovery from Roosevelt recession; rearmament begins'},
  1939:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'WWII begins in Europe; US neutral'},
  1940:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Defense spending ramps; Lend-Lease prep'},
  1941:{phase:'mid-expansion',inflation:'rising',fed:'easing',notes:'Pearl Harbor; US enters WWII'},
  1942:{phase:'wartime',inflation:'rising',fed:'pegged-low',notes:'Full war mobilization; price controls'},
  1943:{phase:'wartime',inflation:'rising',fed:'pegged-low',notes:'Industrial production peaks'},
  1944:{phase:'wartime',inflation:'low-stable',fed:'pegged-low',notes:'D-Day; Bretton Woods'},
  1945:{phase:'wartime',inflation:'low-stable',fed:'pegged-low',notes:'WWII ends; demobilization'},
  1946:{phase:'contraction',inflation:'shock',fed:'pegged-low',notes:'Price controls lifted; inflation spike'},
  1947:{phase:'recovery',inflation:'shock',fed:'pegged-low',notes:'Marshall Plan; cold war begins'},
  1948:{phase:'mid-expansion',inflation:'falling',fed:'tightening',notes:'Berlin Airlift; mild recession Q4'},
  1949:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Recovery from 48-49 recession; NATO formed'},
  1950:{phase:'mid-expansion',inflation:'rising',fed:'pegged-low',notes:'Korean War begins; defense spending'},
  1951:{phase:'mid-expansion',inflation:'rising',fed:'transition',notes:'Fed-Treasury Accord — Fed regains independence'},
  1952:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Korean War continues; Eisenhower elected'},
  1953:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'Korean War ends; brief recession'},
  1954:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Recovery from 53-54 recession; bull market launches'},
  1955:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Strong growth; consumer boom'},
  1956:{phase:'late-expansion',inflation:'rising',fed:'tightening',notes:'Suez crisis; mild slowdown'},
  1957:{phase:'contraction',inflation:'rising',fed:'easing-slow',notes:'57-58 recession; Sputnik'},
  1958:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Recovery from 57-58 recession'},
  1959:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Mild expansion; Cuban revolution'},
  1960:{phase:'contraction',inflation:'low-stable',fed:'easing',notes:'Mild recession; Kennedy elected'},
  1961:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Recovery; Berlin Wall; Bay of Pigs'},
  1962:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Cuban Missile Crisis; tax cut announced'},
  1963:{phase:'mid-expansion',inflation:'low-stable',fed:'holding',notes:'JFK assassination; civil rights'},
  1964:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Kennedy/Johnson tax cuts; Vietnam escalation begins'},
  1965:{phase:'mid-expansion',inflation:'rising',fed:'tightening',notes:'Medicare/Medicaid; Vietnam escalates'},
  1966:{phase:'late-expansion',inflation:'rising',fed:'tightening',notes:'Credit crunch; Vietnam War spending'},
  1967:{phase:'late-expansion',inflation:'rising',fed:'easing',notes:'Mini-recession; civil unrest'},
  1968:{phase:'late-expansion',inflation:'rising',fed:'easing-slow',notes:'Tet Offensive; King/RFK assassinations'},
  1969:{phase:'late-expansion',inflation:'high-stable',fed:'tightening',notes:'Vietnam peaks; market tops'},
  1970:{phase:'contraction',inflation:'rising',fed:'easing',notes:'Recession; Cambodia; Penn Central bankruptcy'},
  1971:{phase:'recovery',inflation:'rising',fed:'easing',notes:'Nixon ends gold standard; wage-price controls'},
  1972:{phase:'mid-expansion',inflation:'rising',fed:'easing',notes:'Nifty Fifty peak; Nixon landslide'},
  1973:{phase:'late-expansion',inflation:'shock',fed:'tightening',notes:'Oil shock; Watergate; bear market begins'},
  1974:{phase:'contraction',inflation:'shock',fed:'tightening',notes:'Oil shock continues; Nixon resigns; deep bear'},
  1975:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Recovery begins; NYC fiscal crisis'},
  1976:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Carter elected; modest recovery'},
  1977:{phase:'mid-expansion',inflation:'rising',fed:'tightening',notes:'Inflation reaccelerates'},
  1978:{phase:'late-expansion',inflation:'rising',fed:'tightening',notes:'Inflation surges; dollar crisis'},
  1979:{phase:'late-expansion',inflation:'shock',fed:'tightening',notes:'2nd oil shock; Iran revolution; Volcker arrives'},
  1980:{phase:'contraction',inflation:'shock',fed:'restrictive',notes:'Brief recession; Volcker fights inflation'},
  1981:{phase:'contraction',inflation:'falling',fed:'restrictive',notes:'Reagan elected; tax cuts; deep recession begins'},
  1982:{phase:'contraction',inflation:'falling',fed:'easing',notes:'Deep recession trough; Fed pivot; bull market launches'},
  1983:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Strong recovery from Volcker recession'},
  1984:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'GDP +7.2%; Reagan re-elected landslide'},
  1985:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Plaza Accord weakens dollar; bull market'},
  1986:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Tax Reform Act; oil price crash; strong stocks'},
  1987:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'Black Monday Oct 19; year still positive'},
  1988:{phase:'mid-expansion',inflation:'rising',fed:'tightening',notes:'Recovery from 87 crash; Bush elected'},
  1989:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'S&L crisis; Berlin Wall falls'},
  1990:{phase:'contraction',inflation:'rising',fed:'easing',notes:'Gulf War; oil spike; recession begins'},
  1991:{phase:'recovery',inflation:'falling',fed:'easing',notes:'Gulf War ends; recovery; USSR collapses'},
  1992:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Slow recovery; Clinton elected'},
  1993:{phase:'mid-expansion',inflation:'low-stable',fed:'holding',notes:'NAFTA debate; budget deal'},
  1994:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Bond crash; Mexican peso crisis'},
  1995:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Soft landing; Goldilocks era begins'},
  1996:{phase:'mid-expansion',inflation:'low-stable',fed:'holding',notes:'Internet ramps; "irrational exuberance"'},
  1997:{phase:'mid-expansion',inflation:'low-stable',fed:'holding',notes:'Asian financial crisis (limited US impact)'},
  1998:{phase:'late-expansion',inflation:'low-stable',fed:'easing',notes:'LTCM crisis; Russia default; Fed cuts'},
  1999:{phase:'late-expansion',inflation:'low-stable',fed:'tightening',notes:'Dot-com mania peak forming; Y2K prep'},
  2000:{phase:'late-expansion',inflation:'rising',fed:'tightening',notes:'Dot-com peaks Mar; nasdaq -39%; election deadlock'},
  2001:{phase:'contraction',inflation:'falling',fed:'easing',notes:'9/11; recession; Enron; Fed aggressive cuts'},
  2002:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Bear market trough; Iraq buildup'},
  2003:{phase:'recovery',inflation:'low-stable',fed:'easing',notes:'Iraq war; Bush tax cuts; bull resumes'},
  2004:{phase:'mid-expansion',inflation:'rising',fed:'tightening',notes:'Housing accelerates; oil prices climb'},
  2005:{phase:'mid-expansion',inflation:'rising',fed:'tightening',notes:'Katrina; housing peak; yield curve flattens'},
  2006:{phase:'late-expansion',inflation:'rising',fed:'holding-high',notes:'Housing tops; yield curve inverts'},
  2007:{phase:'late-expansion',inflation:'rising',fed:'easing',notes:'Subprime cracks; Bear Stearns funds collapse'},
  2008:{phase:'contraction',inflation:'shock',fed:'easing',notes:'GFC; Lehman; TARP; Fed to zero'},
  2009:{phase:'recovery',inflation:'deflation',fed:'easing',notes:'GFC trough Mar; QE1; recovery begins'},
  2010:{phase:'recovery',inflation:'low-stable',fed:'holding-low',notes:'QE2; Greek crisis; Flash Crash'},
  2011:{phase:'mid-expansion',inflation:'rising',fed:'holding-low',notes:'Eurozone crisis; debt ceiling; S&P downgrade'},
  2012:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'QE3; Draghi "whatever it takes"'},
  2013:{phase:'mid-expansion',inflation:'low-stable',fed:'holding-low',notes:'Taper tantrum; equities surge anyway'},
  2014:{phase:'mid-expansion',inflation:'low-stable',fed:'holding-low',notes:'QE ends; oil collapses; dollar surge; Crimea'},
  2015:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'First rate hike since 06; China devaluation'},
  2016:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'Brexit; Trump elected; reflation trade'},
  2017:{phase:'mid-expansion',inflation:'low-stable',fed:'tightening',notes:'TCJA tax cut; synchronized global growth'},
  2018:{phase:'late-expansion',inflation:'rising',fed:'tightening',notes:'Q4 selloff; trade war; Powell pivot'},
  2019:{phase:'late-expansion',inflation:'low-stable',fed:'easing',notes:'Repo crisis; Fed pivot; trade truce'},
  2020:{phase:'contraction',inflation:'low-stable',fed:'easing',notes:'COVID; fastest bear market ever; massive stimulus'},
  2021:{phase:'recovery',inflation:'rising',fed:'holding-low',notes:'Vaccine rollout; meme stocks; inflation begins'},
  2022:{phase:'late-expansion',inflation:'shock',fed:'tightening',notes:'Ukraine war; inflation peaks 9.1%; aggressive hikes'},
  2023:{phase:'recovery',inflation:'falling',fed:'tightening',notes:'Banking stress; AI boom begins; soft landing hopes'},
  2024:{phase:'mid-expansion',inflation:'falling',fed:'easing',notes:'Fed cuts begin; AI/tech leads; Trump elected'},
  2025:{phase:'mid-expansion',inflation:'low-stable',fed:'easing',notes:'Fed cuts continue; intl markets surge; dollar weakens; gold +65%'}
};

// 100%-equity lens for cross-era comparison — regime differences are most
// pronounced in equity. (The UI can additionally show a block through the
// client's own mix via profileThroughWeights.)
const HC_EQUITY_WEIGHTS = (() => {
  const w = {}; ASSET_KEYS.forEach(k => w[k] = 0);
  w.usLarge = 0.50; w.usSmall = 0.10; w.intlDev = 0.22;
  w.emerging = 0.08; w.reit = 0.10;
  return w;
})();

// Path-shape classifier — the year-by-year trajectory, not the average.
function hcClassifyShape(yrs){
  const n = yrs.length;
  if(yrs.every(r => r > 0.10)) return 'sustained-strong';
  if(yrs.every(r => r > 0)) return 'sustained-up';
  if(yrs.every(r => r < 0)) return 'sustained-down';
  if(yrs[0] < 0 && yrs[n-1] > 0.10) return 'V-recovery';
  if(yrs[0] > 0.10 && yrs[n-1] < 0) return 'rollover';
  return 'mixed';
}

// Full profile for one block of RETURN_DATA rows (typically 3 years).
function hcBlockProfile(blockRows){
  const yrs = blockRows.map(r => weightedAssetReturn(r, HC_EQUITY_WEIGHTS));
  const n = yrs.length;
  const prod = yrs.reduce((p, r) => p * (1 + r), 1);
  const gmr = Math.pow(prod, 1/n) - 1;
  const am = yrs.reduce((s, r) => s + r, 0) / n;
  const variance = yrs.reduce((s, r) => s + Math.pow(r - am, 2), 0) / Math.max(n-1, 1);
  const vol = Math.sqrt(variance);
  const minYr = Math.min(...yrs);
  const maxYr = Math.max(...yrs);
  const shape = hcClassifyShape(yrs);

  const assetReturns = {};
  ASSET_KEYS.forEach(k => {
    const valid = blockRows.filter(r => r[k] != null).map(r => r[k]);
    if(valid.length > 0){
      const aProd = valid.reduce((p, r) => p * (1 + r), 1);
      assetReturns[k] = Math.pow(aProd, 1/valid.length) - 1;
    }
  });
  const sorted = Object.entries(assetReturns).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0] || ['—', 0];

  const eqKeys = ['usLarge','usSmall','intlDev','emerging','reit'];
  const defKeys = ['usBonds','cash','gold'];
  const avgRet = ks => {
    const vals = ks.map(k => assetReturns[k]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((s,v) => s+v, 0) / vals.length : 0;
  };
  const equityGmr = avgRet(eqKeys);
  const defensiveGmr = avgRet(defKeys);

  return {
    start: blockRows[0].y,
    end: blockRows[n-1].y,
    label: `${blockRows[0].y}–${blockRows[n-1].y}`,
    n, gmr, am, vol, yrs, minYr, maxYr, shape,
    winnerAsset: winner[0], winnerReturn: winner[1],
    equityGmr, defensiveGmr,
    eqDefSpread: equityGmr - defensiveGmr
  };
}

// Every rolling 3-year block in the record, built once at module load.
function hcBuildBlocks(){
  const out = [];
  for(let i = 0; i <= RETURN_DATA.length - 3; i++){
    out.push(hcBlockProfile(RETURN_DATA.slice(i, i + 3)));
  }
  return out;
}
const HC_BLOCKS = hcBuildBlocks();

// A specific block by calendar start year (null if the record is short).
function hcBlockGmr(start, len = 3){
  const rows = RETURN_DATA.filter(r => r.y >= start && r.y < start + len);
  if(rows.length < len) return null;
  return hcBlockProfile(rows);
}

// The same block's annualized real return through an arbitrary weight set —
// lets the page state an era through the CLIENT's actual mix.
function profileThroughWeights(start, weights, len = 3){
  const rows = RETURN_DATA.filter(r => r.y >= start && r.y < start + len);
  if(rows.length < len) return null;
  const yrs = rows.map(r => weightedAssetReturn(r, weights));
  const prod = yrs.reduce((p, r) => p * (1 + r), 1);
  return Math.pow(prod, 1/rows.length) - 1;
}

// Distance metric — quantitative profile + macro environment; lower = closer.
function hcDistance(a, b){
  const dGmr = Math.abs(a.gmr - b.gmr) * 100;
  const dVol = Math.abs(a.vol - b.vol) * 70;
  const dShape = a.shape === b.shape ? 0 : 3;
  const dMin = Math.abs(a.minYr - b.minYr) * 50;
  const dMax = Math.abs(a.maxYr - b.maxYr) * 50;
  const dSpread = Math.abs(a.eqDefSpread - b.eqDefSpread) * 30;
  const ma = MACRO_TAGS[a.start] || {};
  const mb = MACRO_TAGS[b.start] || {};
  let mDist = 0;
  if(ma.phase !== mb.phase) mDist += 2;
  if(ma.inflation !== mb.inflation) mDist += 1.5;
  if(ma.fed !== mb.fed) mDist += 1;
  return dGmr + dVol + dShape + dMin + dMax + dSpread + mDist * 2;
}

// Per-dimension agreement (1 / 0.5 / 0 per dimension, 9 dimensions). The
// UI lists the dimensions as shared / close / different — facts, no score.
function hcSymmetry(a, b){
  const ma = MACRO_TAGS[a.start] || {};
  const mb = MACRO_TAGS[b.start] || {};
  const numTier = (av, bv, tight, loose) => {
    const diff = Math.abs(av - bv);
    if(diff <= tight) return 1.0;
    if(diff <= loose) return 0.5;
    return 0;
  };
  const checks = {
    gmr:        numTier(a.gmr, b.gmr, 0.015, 0.035),
    vol:        numTier(a.vol, b.vol, 0.025, 0.05),
    maxYr:      numTier(a.maxYr, b.maxYr, 0.05, 0.10),
    minYr:      numTier(a.minYr, b.minYr, 0.05, 0.10),
    shape:      a.shape === b.shape ? 1.0 : 0,
    winner:     a.winnerAsset === b.winnerAsset ? 1.0 : 0,
    phase:      ma.phase === mb.phase ? 1.0 : 0,
    inflation:  ma.inflation === mb.inflation ? 1.0 : 0,
    fed:        ma.fed === mb.fed ? 1.0 : 0
  };
  const total = Object.values(checks).reduce((s, v) => s + v, 0);
  return { score: Math.round((total / 9) * 100), checks };
}

// The N closest historical blocks to a target (minimum 15-year separation,
// and only blocks with a full next-3-years in the record when required).
function hcFindMatches(target, n = 5, requireNext = true){
  return HC_BLOCKS
    .filter(b => Math.abs(b.start - target.start) >= 15)
    .filter(b => !requireNext || hcBlockGmr(b.end + 1, 3) !== null)
    .map(b => ({ block: b, ...hcSymmetry(target, b), dist: hcDistance(target, b) }))
    .sort((a, b) => b.score - a.score || a.dist - b.dist)
    .slice(0, n);
}

// What the record says happened in the `years` after a block. Null at the
// edge of the record — the UI shows the absence, never extrapolates.
function hcNextReturn(block, years = 3){
  const next = hcBlockGmr(block.end + 1, years);
  return next ? next.gmr : null;
}

// Broad-environment label — a coarse, factual grouping of the start year's
// macro tags. Drives the reference-set ordering: same-environment blocks
// first (the comparison clients care about), then closest of the rest.
function hcEnvironmentLabel(block){
  const m = MACRO_TAGS[block.start] || {};
  const phase = m.phase || '';
  const infl = m.inflation || '';
  const fed = m.fed || '';
  if(infl === 'falling' && ['recovery','mid-expansion','contraction'].includes(phase) && ['easing','tightening','holding-low','easing-slow'].includes(fed)) return 'Disinflation Recovery';
  if(infl === 'shock' && ['tightening','restrictive'].includes(fed)) return 'Inflation Shock';
  if(phase === 'contraction' && ['deflation','shock','falling'].includes(infl)) return 'Crisis Reset';
  if(phase === 'late-expansion' && ['tightening','holding-high','restrictive'].includes(fed)) return 'Late-Cycle Tightening';
  if(phase === 'mid-expansion' && ['low-stable','falling'].includes(infl) && ['holding','holding-low','easing','tightening'].includes(fed)) return 'Low-Inflation Expansion';
  if(phase === 'recovery' && ['easing','holding-low'].includes(fed)) return 'Post-Shock Recovery';
  if(fed === 'easing' && ['late-expansion','mid-expansion','recovery'].includes(phase)) return 'Policy Pivot';
  if(infl === 'rising' && ['tightening','restrictive'].includes(fed)) return 'Rate Pressure';
  return 'Mixed Market Setup';
}

// The page's reference set: same broad environment first (>=10y separation),
// then the closest remaining blocks by distance. Only blocks with a full
// next-3-years in the record qualify — "what happened next" must be read,
// never extrapolated.
function hcReferenceSet(target, n = 5){
  const env = hcEnvironmentLabel(target);
  const ok = b => Math.abs(b.start - target.start) >= 10 && hcBlockGmr(b.end + 1, 3) !== null;
  const primary = HC_BLOCKS
    .filter(b => ok(b) && hcEnvironmentLabel(b) === env)
    .map(b => ({ block:b, dist:hcDistance(target,b), envMatch:true }));
  const fallback = HC_BLOCKS
    .filter(b => ok(b) && hcEnvironmentLabel(b) !== env)
    .map(b => ({ block:b, dist:hcDistance(target,b), envMatch:false }));
  return primary.concat(fallback).sort((a,b) => (b.envMatch - a.envMatch) || a.dist - b.dist).slice(0, n);
}

const HC_SHAPE_LABELS = {
  'sustained-strong': 'sustained strong',
  'sustained-up':     'sustained up',
  'sustained-down':   'sustained down',
  'V-recovery':       'V-recovery',
  'rollover':         'rollover',
  'mixed':            'mixed'
};
const HC_ASSET_LABELS = {
  usLarge:'US Large', usSmall:'US Small', intlDev:'Intl Dev', emerging:'Emerging',
  usBonds:'US Bonds', cash:'Cash', reit:'REIT', gold:'Gold'
};

export {
  MACRO_TAGS, HC_BLOCKS, HC_EQUITY_WEIGHTS, HC_SHAPE_LABELS, HC_ASSET_LABELS,
  hcClassifyShape, hcBlockProfile, hcBlockGmr, profileThroughWeights,
  hcDistance, hcSymmetry, hcFindMatches, hcNextReturn,
  hcEnvironmentLabel, hcReferenceSet
};
