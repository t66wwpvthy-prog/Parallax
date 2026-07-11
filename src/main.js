import { runSimulation, runHistoricalPath, generateReturnPath, resetSeed, annualMortgagePayment, LONGRUN_INFLATION, pathDigest, assessPlan, RISK_PROFILES, defaultPlan as plan } from '../engine.js';
import { attachPathFederalTax } from './planning/tax/attachTypicalPathFederalTax.js';
import { rerunTypicalPathWithFederalTax } from './planning/tax/rerunTypicalPathWithFederalTax.js';
import { runHistoricalPathWithFederalTax } from './planning/tax/runHistoricalPathWithFederalTax.js';
import { fmtM, fmtMoney, fmtMDelta, fmtPts, cfMoney, cfRetPct, cfGain } from '../ui/formatters.js';
import { storyChart, seqChartSvg } from '../ui/charts.js?v=2';
import { escHtml } from '../ui/dom.js';
import { CHART_LAYOUT } from '../ui/chartLayout.js';
import { GOAL_AREAS, GOAL_AREA_LBL, GOAL_ICONS_SVG, GOAL_COLOR_MAP } from '../ui/goalPalette.js';
import { createDemoHousehold, createBlankHousehold } from '../ui/householdFactories.js';
import { droppedGoals, goalAreaAges, renderGoalsPage, syncGoalSelection } from '../ui/goals.js';
import { pathModeLabel, pathOutcomeText, drawSeqChart, renderPrints, normalizePlaybackStrategy, renderPlayback, syncPathControls, updatePathReplayMode } from '../ui/sequencing.js';
import { buildPathRows, buildCashSummary, renderCashflow } from '../ui/cashflow.js';
import { toneForProb, toneGlow, wdColor, ring, num as scenarioNum, renderCompare, renderFocus } from '../ui/scenarios.js';
import { solvePanelHTML, goalParamsHtml, comboPillValue } from '../ui/solver.js';
import { createHouseholdWizard } from '../ui/householdWizard.js';
import {
  investableTotal, realAssetsTotal, hhAllAccounts, hhDebtTotal, hhNetWorthTotal,
  hhAgeFromYear, hhInitial, hhMoney, hhShort, hhSelect, wizField,
} from '../ui/household.js';
import {
  scenarios, sharedPaths, plansDirty, baseSnapshot,
  solverResults, solverSearching, comboResults, comboOpen, comboSearching, solverFormOpen, solving,
  goalSelected, goalAreaOpen, goalAreaTiming,
  pathReplay, uiState, scenariosUiState as state,
} from './state.js';
/* ╔══════════════════════════════════════════════════════════════╗
   ║  PARALLAX V2 — UI WIRING (calls the engine above)             ║
   ╚══════════════════════════════════════════════════════════════╝ */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
/* ── Household model: pure factories + multi-household persistence ──────────
   The app boots with one blank Demo Household slot. The advisor can create and
   switch households; persisted values remain authoritative across reloads.

   `plan` is the engine's default plan object (imported live). It cannot be
   reassigned (const import binding), so hydratePlan() mutates it in place —
   preserving the object identity the engine reads internally. */

// Pristine engine default, captured BEFORE any mutation. Both factories clone
// this so they start from the exact engine schema (forward-compatible: new
// engine fields flow through automatically).
const PRISTINE_PLAN = JSON.parse(JSON.stringify(plan));
const newHouseholdId = () => 'hh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Replace the live engine plan's contents with a household record. Mutates the
   imported `plan` in place (it can't be reassigned) so the engine — which reads
   the same object reference internally — sees the hydrated household. */
function hydratePlan(src){
  const clone = JSON.parse(JSON.stringify(src));
  Object.keys(plan).forEach(k => { delete plan[k]; });
  Object.assign(plan, clone);
}

/* ── Household persistence: records-by-id + an active pointer ────────────────
   MVP/DEMO PERSISTENCE ONLY (localStorage — single-browser, unencrypted). A
   real backend seam replaces these later. Households are stored by id under
   HHDB_KEY; ACTIVE_KEY names the one currently loaded. Scenarios are scoped
   per household (scenKey) so demo and custom scenario sets never collide. */
const HHDB_KEY   = 'parallax.households.v1';
const ACTIVE_KEY = 'parallax.activeHouseholdId';
let householdsDb = {};
let activeHouseholdId = null;

function loadHouseholdsDb(){
  try{
    const o = JSON.parse(localStorage.getItem(HHDB_KEY));
    if(o && typeof o === 'object' && !Array.isArray(o)) return o;
  }catch(e){/* corrupt/blocked → caller reseeds demo */}
  return null;
}
function persistHouseholdsDb(){ try{ localStorage.setItem(HHDB_KEY, JSON.stringify(householdsDb)); return true; }catch(e){ return false; } }
function persistActiveId(){ try{ localStorage.setItem(ACTIVE_KEY, activeHouseholdId); }catch(e){} }
// Snapshot the live plan back into its household record, then persist the store.
function saveActiveHousehold(){
  if(activeHouseholdId && plan && plan.meta){
    householdsDb[activeHouseholdId] = JSON.parse(JSON.stringify(plan));
    return persistHouseholdsDb();
  }
  return false;
}
function mergeMissingSchema(saved, defaults){
  const merged = JSON.parse(JSON.stringify(saved));
  const fill = (target, source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      if(!(key in target)){
        target[key] = JSON.parse(JSON.stringify(value));
      } else if(
        target[key] && value
        && typeof target[key] === 'object' && !Array.isArray(target[key])
        && typeof value === 'object' && !Array.isArray(value)
      ){
        fill(target[key], value);
      }
    });
  };
  fill(merged, defaults);
  return merged;
}

function mergeHouseholdSchema(record, id){
  const year = new Date().getFullYear();
  const defaults = id === 'demo'
    ? createDemoHousehold(PRISTINE_PLAN, year)
    : createBlankHousehold(PRISTINE_PLAN, id, year);
  return mergeMissingSchema(record, defaults);
}

function ensureDemoRecord(){
  if(!householdsDb.demo){
    householdsDb.demo = createDemoHousehold(PRISTINE_PLAN, new Date().getFullYear());
    persistHouseholdsDb();
  }
  return householdsDb.demo;
}
// First-load seed + reload hydrate + corruption recovery, all in one pass.
function bootstrapHouseholds(){
  let db = loadHouseholdsDb();
  let id = null; try{ id = localStorage.getItem(ACTIVE_KEY); }catch(e){}
  // No store yet → create the single blank demo slot.
  if(!db || !Object.keys(db).length){
    const demo = createDemoHousehold(PRISTINE_PLAN, new Date().getFullYear());
    db = { [demo.meta.householdId]: demo };
    id = demo.meta.householdId;
  } else {
    db = Object.fromEntries(Object.entries(db)
      .filter(([, record]) => record && typeof record === 'object' && !Array.isArray(record))
      .map(([recordId, record]) => [recordId, mergeHouseholdSchema(record, recordId)]));
  }
  // Missing/dangling active pointer → fall back to any household (or a new demo).
  if(!id || !db[id]){
    id = Object.keys(db)[0] || null;
    if(!id){
      const demo = createDemoHousehold(PRISTINE_PLAN, new Date().getFullYear());
      db[demo.meta.householdId] = demo;
      id = demo.meta.householdId;
    }
  }
  householdsDb = db;
  activeHouseholdId = id;
  persistHouseholdsDb();
  persistActiveId();
  hydratePlan(householdsDb[activeHouseholdId]);
}

// Scenario accent palette (SCEN_PALETTE / colorFor / BASE_ACCENT / scenAccent)
// was removed with the old band + cash-flow grid renderers that consumed it. The
// redesign keys scenario tone off engine success probability (toneForProb in the
// ScenariosUI view layer), not a fixed identity palette.
const MAX_SCENARIOS=5;
/* The three scenario columns. Each holds lever values + its last engine result.
   lever values are the ACTUAL planning values (age, $, etc.), not slider ticks. */
const RISK_LABELS={1:'30 / 70',2:'45 / 55',3:'60 / 40',4:'75 / 25',5:'90 / 10'};
function defaultLevers(){
  const L={
    retireAge:  plan.household.primary.retirementAge,
    ssAge:      plan.income.socialSecurity.primary.claimAge,
    spend:      plan.expenses.living,
    eventAmt:   0, eventAge: 70,
    risk:       plan.portfolio.riskProfile,
    savings:    plan.savings.annual,
    // pensionAge tracks retirement by DEFAULT (most people switch on a pension
    // when they retire — no reason to take taxable fixed income while still
    // earning). pensionAuto stays true until the advisor grabs the pension
    // slider, which frees it to hold any quoted age independently.
    pensionAuto: true,
    pensionAge: (plan.income.pension && plan.income.pension.startAge) || 65,
    // Earmarked-asset sale. Off sentinel = currentAge−1 (renders "Keep"); any
    // value ≥ currentAge is a sale age. Targets the first property.
    sellAge: plan.household.primary.currentAge - 1
  };
  syncPension(L);
  return L;
}
// If pension is still auto-linked, snap its claim age to the retirement age,
// clamped into the household's quoted pension range. No-op once the advisor has
// taken manual control of the pension lever (pensionAuto=false).
function syncPension(L){
  if(!L.pensionAuto) return;
  const a=pensionAges();
  const lo = a.length ? a[0] : 62, hi = a.length ? a[a.length-1] : 65;
  L.pensionAge = Math.max(lo, Math.min(hi, L.retireAge));
}
// ── Scenario persistence (browser localStorage) ──────────────────────────
// Scenarios are SCOPED PER HOUSEHOLD (parallax.scenarios.<householdId>.v1) so a
// custom household's scenarios never collide with the demo's. We save only the
// durable parts (name/base/lev) — never res (recomputed on Run). Wrapped in
// try/catch so a corrupt/blocked store never breaks the app.
const SCEN_PREFIX='parallax.scenarios.';
const scenKey=id=>SCEN_PREFIX + (id || activeHouseholdId || 'demo') + '.v1';
function saveScenarios(){
  try{
    const slim=scenarios.map(s=>({name:s.name, base:!!s.base, lev:s.lev}));
    localStorage.setItem(scenKey(), JSON.stringify(slim));
  }catch(e){/* storage full/blocked — stay in-memory, no crash */}
}
function loadScenarios(id){
  try{
    const raw=localStorage.getItem(scenKey(id));
    if(!raw) return null;
    const arr=JSON.parse(raw);
    if(!Array.isArray(arr) || !arr.length || !arr[0].base) return null;  // sanity
    // Backfill any lever keys added since the save (forward-compat) so old saves
    // don't break when defaultLevers() grows new fields.
    const proto=defaultLevers();
    const hasProperty = !!(plan.properties && plan.properties.length);
    return arr.map(s=>{
      const lev={...proto, ...s.lev};
      let name=String(s.name||'Scenario');
      if(!hasProperty){
        lev.sellAge = proto.sellAge;
        if(/sell\s*home|allocation\s*tilt/i.test(name)) name = 'Risk tilt';
      }
      return { name, base:!!s.base, lev, res:null };
    });
  }catch(e){ return null; }
}
// Wipe the ACTIVE household's saved scenarios and return to its first-run set.
function resetScenarios(){
  try{ localStorage.removeItem(scenKey()); }catch(e){}
  uiState.scenarios=demoScenarios(); uiState.baseSnapshot=defaultLevers();
  uiState.plansDirty=true; runAll();
}

/* ── Plan persistence (browser localStorage) ──────────────────────────────
   MVP/DEMO PERSISTENCE ONLY. localStorage is a single-browser, unencrypted
   store — fine for prototype/demo work, NOT long-term production persistence
   for client data (no sync, no auth, ~5MB quota, cleared with site data).
   A real backend seam replaces this later.

   The plan is persisted THROUGH the household store: SAVE snapshots the live
   plan into its household record (saveActiveHousehold). Every edit still
   auto-commits to the in-memory `plan`; SAVE writes the durable record.
   planSaveDirty = "working plan differs from the last saved snapshot".
   (Distinct from plansDirty, which means "scenario RESULTS are stale".)

   KNOWN INCONSISTENCY (accepted this pass): scenario names/levers still
   auto-save eagerly via saveScenarios() on every scenario action — they do
   NOT wait for SAVE and do NOT arm the SAVE button. SAVE also rewrites them
   so a manual save always captures the full current input state. */
let planSaveDirty=false;
let saveFailed=false;
// SAVE writes the live plan into its household record (see saveActiveHousehold).
function savePlan(){ return saveActiveHousehold(); }
function syncSaveBtn(state){
  const b=$('#save-btn'); if(!b) return;
  if(state==='confirm'){ b.disabled=true; b.textContent='Saved \u2713'; b.classList.remove('save-btn--dirty','save-btn--failed'); return; }
  if(saveFailed){ b.disabled=false; b.textContent='Retry save'; b.classList.add('save-btn--failed'); b.classList.remove('save-btn--dirty'); return; }
  b.disabled=!planSaveDirty;
  b.textContent=planSaveDirty?'Save':'Saved';
  b.classList.toggle('save-btn--dirty', planSaveDirty);
  b.classList.remove('save-btn--failed');
}
// Add a new scenario (clones the current baseline's levers so it starts as a
// neutral copy the advisor then adjusts). Capped at MAX_SCENARIOS.
function addScenario(){
  if(scenarios.length>=MAX_SCENARIOS) return;
  const baseLev=scenarios.find(s=>s.base)?.lev || defaultLevers();
  const n=scenarios.filter(s=>!s.base).length;
  uiState.addScenario({ name:`Scenario ${String.fromCharCode(66+n)}`, base:false,
                   lev:JSON.parse(JSON.stringify(baseLev)), res:null });
  saveScenarios(); uiState.plansDirty=true; runAll();
}
// Remove a non-baseline scenario by index.
function removeScenario(ci){
  if(ci<=0 || ci>=scenarios.length || scenarios[ci].base) return;
  uiState.removeScenarioAt(ci);
  saveScenarios(); uiState.plansDirty=true; runAll();
}

// ── Solver ──────────────────────────────────────────────────────────────
// Run the engine for one trial set of levers and return the success %.
// Reuses sharedPaths (the cached return-path bundle) so every trial sees the
// same markets — apples-to-apples, deterministic with our seeded RNG.
function trySuccess(L){
  const p = planForScenario(L);
  const ov = leversToOverrides(L);
  return runSimulation(p, ov, sharedPaths).successRate;
}
// Probability (0–100) of ending with at least `goal` dollars — the legacy score.
function tryLegacyProb(L, goal){
  const p = planForScenario(L);
  const ov = leversToOverrides(L);
  const res = runSimulation(p, ov, sharedPaths);
  const n = res.sims.length || 1;
  return 100 * res.sims.filter(s => s.terminalBalance >= goal).length / n;
}
// Solve ONE lever: holding all others at `baseLev`, find the value of `key`
// closest to its baseline that achieves >= targetPct. Returns { value,
// reachedPct, capped }. capped=true means even the lever's most-aggressive
// extreme can't reach the target — we return that extreme + the % it hit.
//
// Two strategies by range size:
//  • SMALL range (≤12 steps, e.g. Allocation's 5 risk levels, SS age's 9): scan
//    EVERY value. Allocation is NOT monotonic — more equity lifts expected
//    return but adds volatility drag, so success can rise then fall. Bisection
//    (which assumes monotonicity) would silently return a wrong level. An
//    exhaustive scan is correct for any shape and cheap at this count.
//  • LARGE range (spending, savings): bisect. These ARE monotonic in success
//    and have hundreds of steps, so a full scan would be needlessly slow.
// `score(L)` returns the metric to clear (0–100); defaults to plan success %,
// but legacy goals pass a "% chance of leaving ≥ $X" scorer. Everything else
// (closest-to-baseline, scan vs bisection, capped handling) is unchanged.
function solveLeverFor(baseLev, key, targetPct, score = trySuccess, band = null){
  const cfg = LEVCFG.find(c=>c.key===key);
  if(!cfg) return null;
  const r = band || levRange(cfg);
  const lo = r.min, hi = r.max, step = r.step;
  if(lo === hi) return { value: lo, reachedPct: score({...baseLev,[key]:lo}), capped:false };
  const pctAt = v => score({...baseLev, [key]: v});
  const nSteps = Math.round((hi - lo) / step);

  if(nSteps <= 12){
    // Exhaustive scan. Pick the value closest to the lever's current (baseline)
    // setting that meets target; if none meet, return the best-achievable value
    // (capped). Direction-agnostic — works for non-monotonic levers.
    const baseV = baseLev[key];
    let passVal = null, passPct = -1, bestVal = lo, bestPct = -Infinity;
    for(let i = 0; i <= nSteps; i++){
      const v = lo + i * step;
      const pct = pctAt(v);
      if(pct > bestPct){ bestPct = pct; bestVal = v; }
      if(pct >= targetPct &&
         (passVal === null || Math.abs(v - baseV) < Math.abs(passVal - baseV))){
        passVal = v; passPct = pct;
      }
    }
    return passVal !== null
      ? { value: passVal, reachedPct: passPct, capped: false }
      : { value: bestVal, reachedPct: bestPct, capped: true };
  }

  // Large monotonic range → bisection (detect direction from the endpoints).
  const pctLo = pctAt(lo), pctHi = pctAt(hi);
  const increases = pctHi >= pctLo;                  // success rises with higher value?
  const best      = Math.max(pctLo, pctHi);
  const bestVal   = (pctHi >= pctLo) ? hi : lo;
  if(best < targetPct){ return { value: bestVal, reachedPct: best, capped: true }; }
  // Bisect for the value closest to baseline that meets target. We track the
  // smallest "passing" value on the side of monotonicity.
  let a = lo, b = hi;
  for(let i = 0; i < 9; i++){
    const mid = Math.max(lo, Math.min(hi, Math.round(((a+b)/2) / step) * step));
    if(mid === a || mid === b) break;
    const pct = pctAt(mid);
    const meets = pct >= targetPct;
    // For positive direction (success rises with value): we want SMALLEST value
    // that meets. For inverse: we want LARGEST value that meets.
    if(increases){ if(meets) b = mid; else a = mid; }
    else         { if(meets) a = mid; else b = mid; }
  }
  const value = increases ? b : a;
  return { value, reachedPct: pctAt(value), capped: false };
}
// ── Solver (selectable goal · solo per-lever answers) ───────────────────────
// The advisor picks a GOAL the client actually wants (retire early, afford a big
// purchase, gift to family, leave a legacy, or just hit a confidence bar), then
// for every controllable lever we show what it ALONE would need to be to reach
// that goal — holding all else at today's plan. Neutral: no weighting, no
// bundling. The advisor reads each contribution and surmises any blend.
// Combo solver state. The fold-down is opened on demand (the search is heavy),
// so comboResults stays null until the advisor opens it for a given solve; it's
// cleared whenever the underlying solo solve changes.

// Levers that get a solo answer. Some goals PIN one (excluded from the list).
// Allocation/risk is intentionally OUT — "take more risk to hit a goal" isn't a
// clean planning recommendation (parked in the idea bank). SS stays, though it's
// a weak % mover for high-spend households (its value is lifetime dollars).
const SOLVE_KEYS = ['retireAge','spend','savings','ssAge','pensionAge'];

// ── Combo solver tuning (all adjustable — refine with use) ──────────────────
// "Least disruptive" blends the three active product rules:
//   1. minimize the BIGGEST single lever stretch (each move normalized to its
//      own realistic band), so no one lever carries the whole load;
//   2. weight spending CUTS heavier — protect lifestyle, so combos lean to
//      save-more / claim-SS-later before they cut spend;
//   3. break ties by the smallest TOTAL move.
const COMBO_SPEND_CUT_W = 1.6;                 // penalty multiplier on a spend cut
const COMBO_A_FRACTIONS = [0.3, 0.55, 0.8];    // PARTIAL pushes of lever A (never the full solo move) so B genuinely shares the load
const COMBO_MAX_CARDS   = 3;                    // cards shown
const COMBO_MAX_LEVERS  = 3;                    // candidate levers searched (caps cost)
// Short labels for the combo pills (the lever names are too long for a pill).
const COMBO_SHORT = { retireAge:'Retire', ssAge:'SS at', spend:'Spend', savings:'Save', pensionAge:'Pension' };

// Realistic search band per lever (relative to baseline) so a solo answer can't
// suggest something absurd ($73k/yr savings off a $30k base). Not limiting: if a
// lever can't reach the goal within its band it truthfully reports "best hits X%".
function solveBand(key, baseLev){
  const cfg = LEVCFG.find(c=>c.key===key);
  const r   = levRange(cfg);
  const cur = plan.household.primary.currentAge;
  let min = r.min, max = r.max;
  if(key==='spend'){        min = Math.round(baseLev.spend*0.70/100)*100; max = Math.round(baseLev.spend*1.30/100)*100; }
  else if(key==='savings'){ min = 0; max = Math.max(baseLev.savings*2, baseLev.savings+25000); }
  else if(key==='retireAge'){ min = Math.max(cur+1, baseLev.retireAge-5); max = baseLev.retireAge+5; }
  // ssAge (62–70) and pensionAge (quoted range) are already tight — leave full.
  return { min: Math.max(r.min, min), max: Math.min(r.max, max), step: r.step };
}

// Goal registry. Each goal: how it reads, the param fields it needs, which lever
// (if any) it pins, and (legacy) a custom scorer. `bar` = label for the % box.
const GOALS = {
  confidence: { label:'Reach a confidence level',          bar:'confidence', params:[] },
  retire:     { label:'Retire by an age',                  bar:'confidence', params:['age'],          pin:'retireAge' },
  purchase:   { label:'Afford a big one-time goal',        bar:'confidence', params:['amount','age'] },
  gift:       { label:'Gift / fund education yearly',      bar:'confidence', params:['amount','toAge'] },
  legacy:     { label:'Leave a legacy',                    bar:'chance',     params:['amount'] },
};

// One solved lever → a clean "was → needs to be (delta)" descriptor.


// The goal-dependent parameter fields + the % bar, rendered together so the
// whole strip swaps when the goal dropdown changes.


function renderSolvePanel(){
  const el = $('#solve-panel');
  if(!el) return;
  el.innerHTML = solvePanelHTML({
    solverFormOpen, scenarios, defaultLevers, goals:GOALS,
    currentAge:plan.household.primary.currentAge,
    solverResults, solverSearching, comboOpen, comboSearching, comboResults,
    levCfg:LEVCFG, comboShort:COMBO_SHORT, escHtml,
  });
}

// Solve toward a chosen GOAL. Build soloBase = today's plan + the wish applied,
// pick the scorer (success %, or legacy "% chance of ≥ $X"), then for each
// controllable lever find what it ALONE would need within a realistic band —
// holding all else at soloBase. Neutral: no weighting, no bundling. The advisor
// reads each lever's required move and surmises any blend.
async function runSolve(goalType, params){
  if(solving) return;
  uiState.solving = true; uiState.solverFormOpen = false; uiState.solverSearching = true; uiState.solverResults = null;
  renderSolvePanel();

  if(!sharedPaths){
    resetSeed();
    const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
  uiState.sharedPaths = [];
  for(let i=0; i<plan.simulation.iterations; i++) uiState.appendSharedPath(generateReturnPath(horizon));
  }

  const baseLev  = JSON.parse(JSON.stringify(scenarios.find(s=>s.base)?.lev || defaultLevers()));
  const soloBase = JSON.parse(JSON.stringify(baseLev));
  let pinned = null, score = trySuccess;
  if(goalType==='retire'){        soloBase.retireAge = params.age; pinned = 'retireAge'; }
  else if(goalType==='purchase'){ soloBase.eventAmt = params.amount; soloBase.eventAge = params.age; }
  else if(goalType==='gift'){     soloBase.giftAmt = params.amount; soloBase.giftEndAge = params.toAge; }
  else if(goalType==='legacy'){   score = (L)=>tryLegacyProb(L, params.amount); }
  syncPension(soloBase);

  const keys = SOLVE_KEYS.filter(k => k !== pinned);
  const rows = [];
  for(const k of keys){
    await new Promise(r => setTimeout(r, 0));      // yield so the spinner paints
    const band = solveBand(k, soloBase);
    const res  = solveLeverFor(soloBase, k, params.pct, score, band);
    if(res) rows.push({ key:k, value:res.value, reachedPct:res.reachedPct, capped:res.capped });
  }

  // Gift injects a liability with no column/lever to display, so its solos
  // can't be loaded as a scenario faithfully — read-only. Everything else loads.
  uiState.solverResults  = { goalType, params, targetPct: params.pct, soloBase, rows, canLoad: goalType!=='gift' };
  uiState.solverSearching = false;
  uiState.solving = false;
  // A fresh solo solve invalidates any combos computed for the previous one.
  uiState.comboResults = null; uiState.comboOpen = false; uiState.comboSearching = false;
  renderSolvePanel();
}

// ── Combo solver ────────────────────────────────────────────────────────────
// When no SINGLE lever reaches the goal, the advisor opens the fold-down and we
// search PAIRS of the remaining levers (the goal's pinned lever is held fixed).
// For each pair we push lever A partway toward its helpful end, then solve B to
// the gentlest value that still clears the target — tracing the trade-off line.
// Every % is the real engine on the shared market paths (apples-to-apples). We
// then rank the passing combos by the blended "least-disruptive" score and show
// the gentlest one per distinct lever-pair. No new math in the engine — this is
// pure search over engine outputs.

// One combo pill's value text: deltas for the dollar levers (reads like "spend
// $850/mo less"), absolute for the age levers ("SS at 70").

// The anchor pill describing the (held-fixed) goal, shown first on every card.

// Build a combo record from a set of [key,value] moves: pill text + the blended
// disruption score (rule 1 = biggest weighted stretch; rule 3 = total move).
function makeCombo(soloBase, moves, pct, basePct, meta){
  const items = moves.map(([k,v])=>{
    const span = (meta[k].band.max - meta[k].band.min) || 1;
    const norm = Math.abs(v - soloBase[k]) / span;
    const cut  = (k==='spend' && v < soloBase[k]);     // the one move that hurts lifestyle
    return { key:k, val:v, pv:comboPillValue(k, soloBase[k], v), cut,
             wnorm: norm*(cut?COMBO_SPEND_CUT_W:1), norm };
  });
  return {
    items, pct, deltaPts: pct - basePct,
    disruption: Math.max(...items.map(m=>m.wnorm)),    // minimize the biggest stretch
    spread:     items.reduce((s,m)=>s+m.norm,0),       // tie-break: least total move
    pairKey:    moves.map(m=>m[0]).sort().join('+'),
  };
}

async function runComboSolve(){
  if(!solverResults || comboSearching) return;
  uiState.comboSearching = true; uiState.comboResults = null; renderSolvePanel();
  await new Promise(r=>setTimeout(r,0));     // let the spinner paint

  // sharedPaths is already built by the solo solve, but guard anyway.
  if(!sharedPaths){
    resetSeed();
    const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
  uiState.sharedPaths = [];
  for(let i=0;i<plan.simulation.iterations;i++) uiState.appendSharedPath(generateReturnPath(horizon));
  }

  const R = solverResults;
  const target   = R.targetPct;
  const soloBase = JSON.parse(JSON.stringify(R.soloBase));
  const score    = R.goalType==='legacy' ? (L)=>tryLegacyProb(L, R.params.amount) : trySuccess;
  const pinned   = R.goalType==='retire' ? 'retireAge' : null;
  const basePct  = score(soloBase);

  // Candidate levers = solvable set minus the pinned one, pruned to those whose
  // solo move actually helped, then capped to the most-promising few (cost).
  let cand = SOLVE_KEYS.filter(k => k!==pinned);
  const helpful = cand.filter(k=>{
    const row = R.rows.find(r=>r.key===k);
    return row && row.reachedPct > basePct + 0.3;
  });
  if(helpful.length >= 2) cand = helpful;
  if(cand.length > COMBO_MAX_LEVERS){
    cand = cand.slice().sort((a,b)=>
      (R.rows.find(r=>r.key===b)?.reachedPct ?? 0) - (R.rows.find(r=>r.key===a)?.reachedPct ?? 0)
    ).slice(0, COMBO_MAX_LEVERS);
  }

  // Per-candidate band + helpful direction (one pair of evals each).
  const meta = {};
  for(const k of cand){
    await new Promise(r=>setTimeout(r,0));
    const band  = solveBand(k, soloBase);
    const baseV = soloBase[k];
    const pLo = score({...soloBase,[k]:band.min});
    const pHi = score({...soloBase,[k]:band.max});
    meta[k] = { band, baseV, end: (pHi>=pLo) ? band.max : band.min };
  }

  // Sweep A toward its helpful end; at each step solve B to the gentlest value
  // that clears target. Keep combos where BOTH levers actually moved.
  // Ordered pairs: sweeping A→solve-B and B→solve-A trace different points on the
  // same trade-off line, so we try both and keep the gentlest per unordered pair.
  const combos = [];
  for(let i=0;i<cand.length;i++){
    for(let j=0;j<cand.length;j++){
      if(i===j) continue;
      const A=cand[i], B=cand[j], ma=meta[A], mb=meta[B], step=ma.band.step;
      // Restrict B to its HELPFUL half (baseline → helpful end) so a solve can
      // never push B backward to "make room" for A — both levers only ever help.
      const bBand = mb.end >= mb.baseV
        ? { min: mb.baseV, max: mb.band.max, step: mb.band.step }
        : { min: mb.band.min, max: mb.baseV, step: mb.band.step };
      for(const f of COMBO_A_FRACTIONS){
        await new Promise(r=>setTimeout(r,0));
        let aVal = Math.round((ma.baseV + f*(ma.end - ma.baseV))/step)*step;
        aVal = Math.max(ma.band.min, Math.min(ma.band.max, aVal));
        if(aVal === ma.baseV) continue;                         // A didn't move
        if(score({...soloBase,[A]:aVal}) >= target) continue;   // A alone already clears it → not a real pairing
        const res = solveLeverFor({...soloBase,[A]:aVal}, B, target, score, bBand);
        if(!res || res.capped) continue;                        // pair can't reach target
        if(res.value === mb.baseV) continue;                    // B didn't move → solo-A
        combos.push(makeCombo(soloBase, [[A,aVal],[B,res.value]], res.reachedPct, basePct, meta));
      }
    }
  }
  // Gentlest first; keep one (the gentlest) per distinct lever-pair, top N.
  combos.sort((x,y)=> x.disruption - y.disruption || x.spread - y.spread);
  const seen = new Set(), top = [];
  for(const c of combos){
    if(seen.has(c.pairKey)) continue;
    seen.add(c.pairKey); top.push(c);
    if(top.length >= COMBO_MAX_CARDS) break;
  }
  uiState.comboResults = { goalType:R.goalType, params:R.params, target, basePct, soloBase,
                   canLoad: R.canLoad, combos: top };
  uiState.comboSearching = false;
  renderSolvePanel();
}



// Scenarios are NAMED, SAVEABLE objects (the household-centric data root). They
// start identical; the advisor moves levers to show each decision's effect, and
// can rename / add / remove them. Both tabs read this shared set.
// The first-run scenario set tells a story: B delays the plan's retirement
// (drawdown) age 2 years, C goes aggressive (wealth line jumps, success does
// NOT — volatility drag). Deltas are relative to the ACTIVE household's base
// levers so the set is meaningful for any household, not just the demo.
function demoScenarios(){
  const s=[
    {name:'Baseline',   base:true,  lev:defaultLevers(), res:null},
    {name:'Scenario B', base:false, lev:defaultLevers(), res:null},
    {name:'Aggressive', base:false, lev:defaultLevers(), res:null},
  ];
  // Scenario B contrast. Pre-retirement: "retire 2 years later" (the core lever
  // when we're solving for a feasible retirement date). Already retired: that
  // lever is inert, so contrast on allocation instead (de-risk one notch).
  if(hhAlreadyRetired()){
    s[1].lev.risk = Math.max(1, ((plan.portfolio && plan.portfolio.riskProfile) || 3) - 1);
  } else {
    const baseRetire = (plan.household && plan.household.primary && plan.household.primary.retirementAge) || 65;
    s[1].lev.retireAge = baseRetire + 2;
  }
  s[2].lev.risk = 5;
  return s;
}
// Seed/hydrate the active household BEFORE scenarios seed, so lever defaults and
// reseeding see the active household's inputs (never the demo, unless it IS the
// active household). First load seeds a blank Demo Household; reloads hydrate whatever
// household was active; a corrupt store safely recreates the demo.
bootstrapHouseholds();
uiState.scenarios = loadScenarios() || demoScenarios();
// Solver UI state. solverFormOpen toggles the inline "Solve…" form in the band
// gutter; solving guards against re-entry while a solve is in flight.

/* A household is ALREADY RETIRED when every principal is at or past their own
   retirement age — there is no future retirement transition to plan for. In that
   state retirement age is a satisfied input: it may still show in the banner, but
   it must not drive any lever or engine result (like a one-time goal that has
   already happened). Retirement age stays a LIVE lever whenever anyone is still
   pre-retirement (the household retires when the LAST earner does). */
function hhAlreadyRetired(){
  const pr = plan.household && plan.household.primary;
  if(!pr || pr.currentAge == null || pr.retirementAge == null) return false;
  if(pr.currentAge < pr.retirementAge) return false;      // primary still working
  const sp = plan.household && plan.household.spouse;
  if(sp){
    if(sp.currentAge == null || sp.retirementAge == null) return false;
    if(sp.currentAge < sp.retirementAge) return false;    // co-client still working
  }
  return true;
}

/* Map a scenario's levers -> engine override object. */
function leversToOverrides(L){
  const ov={};
  const baseRetire = plan.household.primary.retirementAge;
  const baseSs     = plan.income.socialSecurity.primary.claimAge;
  // Retirement age is inert once the household is already retired — never emit a
  // retire delay in that case (a positive delay would wrongly re-open accumulation).
  if(!hhAlreadyRetired() && L.retireAge !== baseRetire) ov.retireDelay = L.retireAge - baseRetire;
  if(L.ssAge !== baseSs)         ov.ssDelayYears = L.ssAge - baseSs;
  // spend vs plan.expenses.living. The engine takes INCREASES via spendBump and
  // CUTS via spendCut — a negative spendBump is ignored (engine clamps it to 0).
  // So we MUST split by direction or lowering the spend lever silently no-ops.
  const baseSpend = plan.expenses.living;
  const spendFrac = (L.spend - baseSpend)/baseSpend;
  if(spendFrac > 0)      ov.spendBump = spendFrac;
  else if(spendFrac < 0) ov.spendCut  = -spendFrac;   // engine caps the cut at 50%
  if(L.eventAmt>0){ ov.lumpSum = L.eventAmt; ov.lumpSumYear = Math.max(0, L.eventAge - plan.household.primary.currentAge); }
  if(L.savings !== plan.savings.annual) ov.savingsBump = (L.savings - plan.savings.annual)/Math.max(1,plan.savings.annual);
  // Pension: always pass the chosen age as an absolute override so the engine
  // looks up the entered benefit for THAT exact age (or pays 0 if no entry).
  ov.pensionStartAge = L.pensionAge;
  // Earmarked-asset sale — emitted ONLY when an age is chosen (≥ currentAge), so
  // the Baseline (sellAge = off) carries no sale and stays clean.
  if(plan.properties && plan.properties.length && L.sellAge != null && L.sellAge >= plan.household.primary.currentAge){
    ov.assetSale = { asset: 0, age: L.sellAge };
  }
  return ov;
}
/* Risk lever changes the profile -> needs a plan clone, not an override.
   A gift/education goal injects a time-limited recurring outflow (a liability
   with start/end age). colaPct = inflation so it stays real-constant — the
   advisor enters today's dollars. No-op for normal scenarios (no giftAmt). */
function planForScenario(L){
  const p=JSON.parse(JSON.stringify(plan));
  p.portfolio.riskProfile = L.risk;
  // Per-scenario goal overrides (Compare-editable): amount / startAge / endAge keyed
  // by the goal's index in the base inventory. Applied to the CLONE only, so the base
  // plan.goals (Goals-page source of truth) and every other scenario are untouched.
  if(L.goalOv && Array.isArray(p.goals)){
    p.goals = p.goals.map((g,i)=>{
      const ov = L.goalOv[i];
      if(!ov) return g;
      return {
        ...g,
        amount:   (ov.amount   != null) ? ov.amount   : g.amount,
        startAge: (ov.startAge != null) ? ov.startAge : g.startAge,
        endAge:   (ov.endAge   != null) ? ov.endAge   : g.endAge,
      };
    });
  }
  if(L.giftAmt > 0 && L.giftEndAge){
    p.liabilities = (p.liabilities || []).concat([{
      amount: L.giftAmt,
      startAge: plan.household.primary.currentAge,
      endAge: L.giftEndAge,
      colaPct: LONGRUN_INFLATION * 100
    }]);
  }
  return p;
}

/* ── Inputs tab: edit the base plan (household data root) ──────────────────
   `plan` is the single source. Scenarios draw their baseline from it; each
   scenario then carries its own adjustment. Editing a base input re-seeds
   every column from the NEW base while PRESERVING each scenario's delta (its
   decision) — so "draw from base, then adjust" holds automatically. */
if(!plan.income.socialSecurity.spouse) plan.income.socialSecurity.spouse={pia:0,claimAge:67};

const RISK_NAMES={1:'Conservative',2:'Mod-Cons',3:'Moderate',4:'Mod-Agg',5:'Aggressive'};

/* ── Sub-page registry ─────────────────────────────────────────────
   Four sub-pages live under the Net Worth tab. Balance Sheet uses the
   STATEMENT layout (leader-dot rows under thin accent section heads).
   Inflows / Outflows / Goals use the HYBRID layout (left-gutter identity
   block + two facing columns split by a single vertical hairline).
   Each hybrid page's gutter computes its own running total from the live
   plan values — same place on every page so the eye knows where to land. */
const SUB_PAGES = {
  'cashflow':      { label:'Cash Flow', layout:'hybrid', totLabel:'Annual income' },
  'goals':         { label:'Goals',     layout:'goals',  totLabel:'Annual goal spend' },
  'snapshot':      { label:'Snapshot',  layout:'snapshot' },
};

/* ── Household / Plan input sections ───────────────────────────────
   One calm planning-input page. The engine still supports more detailed real
   assets, liabilities, and tax data; those controls stay out of this prototype
   surface until the core advisor flow is clean. */
const BALANCE_SHEET = [
  { head:'Household', col:'left', fields:[
    {path:'meta.primaryName',               label:'Client name',    type:'text'},
    {path:'meta.spouseName',                label:'Spouse name',    type:'text'},
    {path:'household.primary.currentAge',    label:'Client age',     type:'age'},
    {path:'household.spouse.currentAge',     label:'Spouse age',     type:'age'},
    {path:'household.primary.retirementAge', label:'Client retirement age', type:'age'},
    {path:'household.spouse.retirementAge',  label:'Spouse retirement age', type:'age'},
    {path:'household.primary.planEndAge',    label:'Plan end age',   type:'age'},
  ]},
  { head:'Investment accounts', col:'left', subtotal:'invest', fields:[
    {path:'portfolio.accounts.taxable.balance',     label:'Taxable',     type:'money'},
    {path:'portfolio.accounts.traditional.balance', label:'Traditional', type:'money'},
    {path:'portfolio.accounts.roth.balance',        label:'Roth',        type:'money'},
  ]},
  { head:'Cash flow', col:'right', fields:[
    {path:'savings.annual',                         label:'Annual savings',    type:'money'},
    {path:'expenses.living',                        label:'Monthly spending',  type:'monthlyMoney'},
    {path:'income.workingIncome',                   label:'Working income',    type:'money'},
    {path:'income.socialSecurity.primary.pia',      label:'Client Social Security', type:'money'},
    {path:'income.socialSecurity.primary.claimAge', label:'Client SS age',     type:'age'},
    {path:'income.socialSecurity.spouse.pia',       label:'Spouse Social Security', type:'money'},
    {path:'income.socialSecurity.spouse.claimAge',  label:'Spouse SS age',     type:'age'},
    {path:'income.pension.benefitByAge.65',         label:'Pension',           type:'money'},
    {path:'income.pension.startAge',                label:'Pension age',       type:'age'},
    {path:'expenses.healthcare',                    label:'Healthcare',        type:'money'},
  ]},
  { head:'Assumptions', col:'right', fields:[
    {path:'portfolio.riskProfile',        label:'Risk profile',        type:'risk'},
    {path:'portfolio.withdrawalStrategy', label:'Withdrawal strategy', type:'strategy'},
    {path:'simulation.iterations',        label:'Simulation paths',    type:'num', min:100, step:100},
  ]},
];
const STRATEGY_NAMES = {
  'taxable-first':'Taxable first',
  'traditional-first':'Traditional first',
  proportional:'Proportional'
};

/* ── Hybrid columns: each sub-page has a LEFT and a RIGHT column.
   Each item carries name + path + type, and an optional meta() that draws
   from the live plan (e.g. "claim at 67" reads the actual claim age). */
const HYBRID = {
  // Income and expenses live on ONE page (Cash Flow). Income = Fixed (SS, pension)
  // + Variable. Expenses = Essential only — discretionary spending is modeled as
  // Goals, so it isn't duplicated here.
  'cashflow': {
    left:  { head:'Income', groups:[
      { head:'Fixed income', items:[
        {path:'income.socialSecurity.primary.pia', name:'Social Security · Primary', type:'money', meta:()=>`Claim at age ${plan.income.socialSecurity.primary.claimAge}`},
        {path:'income.socialSecurity.spouse.pia',  name:'Social Security · Co-Client',  type:'money', meta:()=>plan.income.socialSecurity.spouse?`Claim at age ${plan.income.socialSecurity.spouse.claimAge}`:''},
      ], dynamic:'pension' },
      { head:'Variable', section:{ arr:'income.other', kind:'income', nameKey:'label', ph:'Source', add:'+ add a variable income source' } },
    ]},
    right: { head:'Expenses', groups:[
      { head:'Essential', items:[
        {path:'expenses.living',     name:'Lifestyle',  type:'money', meta:()=>'Housing, utilities, food, transport'},
        {path:'expenses.healthcare', name:'Healthcare', type:'money', meta:()=>'Premiums + out-of-pocket'},
        {path:'expenses.healthcareRealGrowth', name:'Healthcare inflation', type:'pct', meta:()=>'Annual growth above CPI (default 2%)'},
      ] },
    ]},
  },
};

/* Active sub-page for the net-worth page. The Goals sub-view lives here.
   Household is its own editable data-page="household" console (the 5-step
   wizard: renderWizHousehold/Accounts/Income/Retirement/Blueprint via
   syncHousehold). */
const SUB_KEY = 'parallax.netWorth.sub';
let activeSub = 'goals';
const getPath=(o,p)=>p.split('.').reduce((a,k)=>a&&a[k],o);
const setPath=(o,p,v)=>{const ks=p.split('.');const last=ks.pop();let t=o;for(const k of ks){if(t==null)return;t=t[k];}if(t!=null)t[last]=v;};

// Live comma formatting for money inputs. Reformats on every keystroke and
// preserves the caret's LOGICAL position (after the same number of digits)
// so typing left-to-right feels natural — no caret-jumping-to-end weirdness.
function liveCommas(el){
  const old = el.value;
  const caret = el.selectionStart ?? old.length;
  const digitsBefore = (old.slice(0, caret).match(/\d/g) || []).length;
  const digits = old.replace(/[^0-9]/g, '');
  if(!digits){ el.value = ''; return; }
  const formatted = parseInt(digits, 10).toLocaleString('en-US');
  el.value = formatted;
  let pos = 0, seen = 0;
  while(pos < formatted.length && seen < digitsBefore){
    if(/\d/.test(formatted[pos])) seen++;
    pos++;
  }
  el.setSelectionRange(pos, pos);
}

uiState.baseSnapshot=defaultLevers();   // base lever values; used to preserve deltas

// Re-seed scenarios from the current base, keeping each scenario's adjustment.
// Every plan edit funnels through here — the one hook that arms SAVE.
function reseedScenarios(){
  planSaveDirty=true; saveFailed=false; syncSaveBtn();
  const nb=defaultLevers();
  const LINKED=['retireAge','ssAge','spend','savings','pensionAge'];   // base-linked levers
  scenarios.forEach(s=>{
    Object.keys(nb).forEach(k=>{
      if(s.base){ s.lev[k]=nb[k]; return; }   // baseline always mirrors the base
      if(!LINKED.includes(k)) return;         // allocation / one-time event stay as set
      const cfg=LEVCFG.find(c=>c.key===k);
      let v=nb[k]+(s.lev[k]-baseSnapshot[k]);  // new base + this scenario's delta
      if(cfg){ const r=levRange(cfg); v=Math.max(r.min,Math.min(r.max,v)); }
      s.lev[k]=v;
    });
    syncPension(s.lev);   // auto-linked pension follows the (possibly new) retire age
  });
  uiState.baseSnapshot=nb;
}

// Build the Pension group's fields fresh on every render so any new
// age entered via the Scenarios inline input shows up here as its own row.
function pensionFields(){
  const m=(plan.income.pension && plan.income.pension.benefitByAge) || {};
  return Object.keys(m).map(Number).sort((a,b)=>a-b).map(age=>(
    {path:`income.pension.benefitByAge.${age}`, label:`Benefit if claimed @ ${age}`, type:'money'}
  ));
}
/* ── Derived totals (pure aggregation of typed inputs, NOT engine output) ──
   These read the live plan and feed the gutter on each sub-page. The gutter
   is the same shape on every page — a big number + breakdown rows — so the
   eye lands in the same place. Useful information, not descriptions. */
// Typed investment accounts → tax sleeve. Workplace + IRA plans are pre-tax;
// the bucket is what the engine consumes (extraAccounts fold into the totals).
const ACCT_TYPES = [
  {label:'Traditional IRA', bucket:'traditional'}, {label:'401(k)', bucket:'traditional'},
  {label:'403(b)', bucket:'traditional'}, {label:'457', bucket:'traditional'},
  {label:'401(a)', bucket:'traditional'}, {label:'SEP IRA', bucket:'traditional'},
  {label:'SIMPLE IRA', bucket:'traditional'}, {label:'Solo 401(k)', bucket:'traditional'},
  {label:'Roth IRA', bucket:'roth'}, {label:'Brokerage', bucket:'taxable'},
];
let acctSel = null;   // type currently armed in the add picker
// Post-edit refresh (mirrors the balance-sheet field commit, minus setPath).
function commitPlanEdit(){
  reseedScenarios(); uiState.sharedPaths=null; uiState.plansDirty=true; renderInputs();
  $('#status').textContent='Plan edited · open Scenarios';
}
// Real assets are current balance-sheet values. The Household module keeps
// recurring payment streams out of strict net-worth liability totals.

/* ═══════════════════════════════════════════════════════════════════════════
   HOUSEHOLD — the editable plan-input console (Demographics / Net Worth / Cash
   Flow), rendered as the Folio/glass document. EVERY core input is editable
   inline at all times: each value slot is a renderField() data-path control, and
   the #hh-view delegated handler writes back to `plan` and reseeds/dirties
   scenarios EXACTLY like the rest of the input layer (setPath → reseedScenarios →
   retired lever renderer → plansDirty=true). Money TRUTH (balances) is typed by the advisor;
   the OWNER of an account is a LABEL placing it in the Client / Spouse pillar or
   the joint holdings — derived displays (net-worth total, per-owner investable,
   ownership %, beam) recompute read-only on every sync, never faked.
   ═══════════════════════════════════════════════════════════════════════════ */
// Ownership is a UI label; data keys stay 'spouse' etc. Visible label is Co-Client.
const HH_OWNERS  = [['client','Client'],['spouse','Co-Client'],['joint','Joint'],['trust','Trust']];
/* Account Type Bank — every addable account type and the engine tax sleeve it
   maps into. The engine consumes ONLY the three buckets (taxable / traditional /
   roth); the type is advisor-facing detail. */
const HH_WIZARD_ACCOUNT_TYPES = [
  { label:'Traditional IRA',     bucket:'traditional' },
  { label:'Roth IRA',            bucket:'roth' },
  { label:'Brokerage (taxable)', bucket:'taxable' },
  { label:'401(k)',              bucket:'traditional' },
  { label:'HSA',                 bucket:'roth' },
];
const HH_ACCOUNT_TYPES = [
  { label:'Checking',            bucket:'taxable' },
  { label:'Savings',             bucket:'taxable' },
  { label:'Money Market',        bucket:'taxable' },
  { label:'CD',                  bucket:'taxable' },
  { label:'Brokerage (taxable)', bucket:'taxable' },
  { label:'Joint brokerage',     bucket:'taxable', owner:'joint' },
  { label:'Trust brokerage',     bucket:'taxable', owner:'trust' },
  { label:'Traditional IRA',     bucket:'traditional' },
  { label:'Rollover IRA',        bucket:'traditional' },
  { label:'Roth IRA',            bucket:'roth' },
  { label:'401(k)',              bucket:'traditional' },
  { label:'Roth 401(k)',         bucket:'roth' },
  { label:'403(b)',              bucket:'traditional' },
  { label:'457',                 bucket:'traditional' },
  { label:'SEP IRA',             bucket:'traditional' },
  { label:'SIMPLE IRA',          bucket:'traditional' },
  { label:'Solo 401(k)',         bucket:'traditional' },
  { label:'Qualified Plan',      bucket:'traditional' },
];
const hhBucketForType = t => (
  HH_WIZARD_ACCOUNT_TYPES.find(x => x.label === t) ||
  HH_ACCOUNT_TYPES.find(x => x.label === t) ||
  {}
).bucket || 'taxable';
const HH_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['DC','District of Columbia'],
];
/* Wizard step state: 1 People & Timeline · 2 Balance Sheet · 3 Cash Flow ·
   4 Blueprint. A filled household lands on Blueprint; a blank one starts at 1. */
let hhStep = 1;
function hhDefaultStep(){
  const hasAccounts = (plan.portfolio.extraAccounts || []).length > 0;
  const hasIncome = !!((plan.income.socialSecurity.primary && plan.income.socialSecurity.primary.pia) ||
                       (plan.income.socialSecurity.spouse && plan.income.socialSecurity.spouse.pia));
  return (hasAccounts || hasIncome) ? 4 : 1;
}
let hhAcctFormOwner = null;
let hhAddingKey = null;
let hhDraftLabel = '';
let hhDraftAmount = '';
let hhBlueprintRan = false;
const hhUiState = {
  get hhAcctFormOwner(){ return hhAcctFormOwner; },
  get hhAddingKey(){ return hhAddingKey; },
  get hhDraftLabel(){ return hhDraftLabel; },
  get hhDraftAmount(){ return hhDraftAmount; },
  get hhBlueprintRan(){ return hhBlueprintRan; },
};
let householdWizard;
function ensureHouseholdWizard(){
  if(householdWizard) return householdWizard;
  householdWizard = createHouseholdWizard({
    get plan(){ return plan; },
    uiState: hhUiState,
    field: (path, type, extra) => hhField(path, type, extra),
    select: (path, value, opts, kind) => hhSelect(path, value, opts, kind),
    initial: hhInitial,
    ageFromYear: hhAgeFromYear,
    allAccounts: () => hhAllAccounts(plan),
    accountTypes: HH_WIZARD_ACCOUNT_TYPES,
    states: HH_STATES,
  });
  return householdWizard;
}

/* Editable controls bound by data-path (handled by the #hh-view delegate). */
function hhField(path, type, extra){ return renderField(Object.assign({ path, type }, extra||{})); }

/* ── Wizard chrome (4-step blueprint wizard via ui/householdWizard.js) ─ */
const HH_STEPS = () => ensureHouseholdWizard().steps;
function wizFooter(){ return ensureHouseholdWizard().footer(hhStep); }


/* ── Household lifecycle helpers ───────────────────────────────────────────
   All of these hydrate the live `plan`, re-scope scenarios to the active
   household, persist, and re-render through the full reseed/dirty/run flow.
     hhLoadRecord(rec, status)  → shared tail: hydrate + scenarios + render.
     loadDemoHousehold() → ensures and loads the persistent blank demo slot.
     newHousehold()    → creates a blank household, makes it active.
     switchHousehold() → loads another saved household by id. */
function hhLoadRecord(status){
  planSaveDirty = false; saveFailed = false; syncSaveBtn();
  uiState.baseSnapshot = defaultLevers();
  hhStep = hhDefaultStep();
  hhAcctFormOwner = null;
  hhAddingKey = null;
  hhDraftLabel = '';
  hhDraftAmount = '';
  hhBlueprintRan = false;
  uiState.plansDirty = true; uiState.sharedPaths = null;
  syncHousehold();
  updateHouseholdControls();
  renderInputs();
  runAll();
  if(status) $('#status').textContent = status;
}
// Open the persistent demo slot. Create it blank only when it is missing.
function loadDemoHousehold(){
  ensureDemoRecord();
  if(activeHouseholdId === 'demo'){
    updateHouseholdControls();
    $('#status').textContent = 'Loaded Demo Household';
    return;
  }
  switchHousehold('demo');
}
// Create a brand-new blank household, persist it, and make it active with its
// own fresh scenario set.
function newHousehold(){
  saveActiveHousehold();                 // snapshot the outgoing household first
  saveScenarios();                       // …and persist its scoped scenarios
  const blank = createBlankHousehold(PRISTINE_PLAN, newHouseholdId(), new Date().getFullYear());
  householdsDb[blank.meta.householdId] = blank;
  activeHouseholdId = blank.meta.householdId;
  persistHouseholdsDb(); persistActiveId();
  hydratePlan(blank);
  uiState.scenarios = demoScenarios();
  saveScenarios();
  hhLoadRecord('New household created');
}
// Switch to another saved household by id (persists the outgoing one first, and
// loads the incoming household's own scoped scenarios).
function switchHousehold(id){
  if(!householdsDb[id] || id === activeHouseholdId) return;
  saveActiveHousehold();
  saveScenarios();                       // persist the outgoing household's scenarios
  activeHouseholdId = id;
  persistActiveId();
  hydratePlan(householdsDb[id]);
  uiState.scenarios = loadScenarios(id) || demoScenarios();
  saveScenarios();
  hhLoadRecord('Loaded ' + ((plan.meta && plan.meta.name) || 'household'));
}
// Populate the saved-household switcher.
function updateHouseholdControls(){
  const sel = $('#hh-switch');
  if(sel){
    const ids = Object.keys(householdsDb);
    sel.innerHTML = ids.map(id => {
      const h = householdsDb[id] || {};
      const m = h.meta || {};
      const nm = m.name || m.primaryName || 'Household';
      return `<option value="${escHtml(id)}" ${id===activeHouseholdId?'selected':''}>${escHtml(nm)}</option>`;
    }).join('');
    sel.value = activeHouseholdId;
  }
}

/* One authoritative Household sync: fill wizard identity, render the active
   STEP into #hh-view + the live "Plan so far" rail, and reflect step state on
   the stepper. Called at boot, on tab show, and after every edit (the #hh-view
   delegate re-renders through here). */
function syncHousehold(){
  const view = $('#hh-view'); if(!view) return;
  const nm = $('#hh-rail-name');
  if(nm){
    const pn = plan.meta.primaryName||'Client';
    const sn = plan.meta.spouseName||'Co-Client';
    nm.textContent = plan.household.spouse ? (pn + ' & ' + sn) : pn;
  }
  if($('#hh-avatar-c')) $('#hh-avatar-c').textContent = hhInitial(plan.meta.primaryName,'C');
  if($('#hh-avatar-s')) $('#hh-avatar-s').textContent =
    (!plan.meta.spouseName || plan.meta.spouseName === 'Co-Client') ? 'CC' : hhInitial(plan.meta.spouseName,'CC');
  const steps = HH_STEPS();
  const renderStep = steps[hhStep] || steps[1];
  view.innerHTML = `<div class="hh-wstep${hhStep === 4 ? ' hh-wstep--bp' : ''}">${renderStep()}</div>`;
  const foot = $('#hh-wiz-footer');
  if(foot) foot.innerHTML = wizFooter();
  const wiz = document.querySelector('.hh-wizard');
  if(wiz) wiz.dataset.wizardRev = '7';
  for(let i = 1; i <= 4; i++){
    const el = $('#hh-step-'+i); if(!el) continue;
    const num = el.querySelector('.hh-step__num');
    el.classList.toggle('is-current', i === hhStep);
    el.classList.toggle('is-done',    i <  hhStep);
    if(num) num.textContent = i < hhStep ? '✓' : String(i);
    el.setAttribute('aria-selected', i === hhStep ? 'true' : 'false');
  }
  document.querySelectorAll('.hh-stepper .hh-step__conn').forEach((c,i) =>
    c.classList.toggle('is-done', i < hhStep - 1));
}
/* Stepper + household-menu chrome = the view switch. Bound once at boot. */
function bindHouseholdRailOnce(){
  document.querySelectorAll('.hh-stepper .hh-step').forEach(btn =>
    btn.addEventListener('click', () => {
      hhStep = +btn.dataset.step || 1;
      hhAddingKey = null;
      hhAcctFormOwner = null;
      hhBlueprintRan = false;
      syncHousehold();
    }));
  // Tucked household menu (⋯): Open / New / Load demo.
  const menuBtn = $('#hh-menu-btn'), pop = $('#hh-menu-pop');
  if(menuBtn && pop){
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = pop.hidden;
      pop.hidden = !open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => {
      if(!pop.hidden && !pop.contains(e.target) && e.target !== menuBtn){
        pop.hidden = true; menuBtn.setAttribute('aria-expanded','false');
      }
    });
  }
  // Household selector + New Household + persistent blank demo slot.
  const switchSel = $('#hh-switch');
  const newBtn    = $('#hh-new');
  const loadDemoBtn = $('#hh-load-demo');
  if(switchSel) switchSel.addEventListener('change', e => switchHousehold(e.target.value));
  if(newBtn)    newBtn.addEventListener('click', () => newHousehold());
  if(loadDemoBtn) loadDemoBtn.addEventListener('click', () => loadDemoHousehold());
  hhStep = hhDefaultStep();   // land on Blueprint when the household has data
  updateHouseholdControls();
}

// Column subtotals — sums every group in HYBRID[page].left / .right (a column may
// be one or more groups). Dynamic-pension items are included automatically.
function groupSum(g){
  let s = 0;
  (g.items||[]).forEach(it => { s += (getPath(plan, it.path)||0); });
  if(g.dynamic==='pension'){
    const m=(plan.income.pension&&plan.income.pension.benefitByAge)||{};
    const pStart=(plan.income.pension&&plan.income.pension.startAge);   // pays ONE amount
    s += (pStart && m[pStart]) || 0;
  }
  if(g.section){ (getPath(plan, g.section.arr)||[]).forEach(r => { s += (r.amount||0); }); }
  return s;
}
function colSum(page, side){
  const col = HYBRID[page] && HYBRID[page][side];
  if(!col) return 0;
  return (col.groups || [col]).reduce((s,g)=>s+groupSum(g), 0);
}
function hybridTotal(page){ return colSum(page,'left') + colSum(page,'right'); }

// Page-specific gutter HTML. Same shape on every page — title row + big
// number + a breakdown of the parts. No descriptions; the structure IS the
// description. Net Worth shows assets / liabilities / net; the three hybrid
// pages show the left-column total / right-column total / overall.
function renderGutter(pageKey){
  const sp = SUB_PAGES[pageKey];
  if(pageKey === 'balance-sheet'){
    const goalsAnnual = (plan.goals||[])
      .filter(g => g.startAge !== g.endAge)
      .reduce((s,g)=>s+(g.amount||0),0);
    return `<div class="np-gutter">
      <div class="lbl">Household</div>
        <div class="big-num">${fmtMoney(investableTotal(plan))}</div>
      <hr class="gut-rule"/>
      <div class="row"><span>Savings / yr</span><b>${fmtMoney(plan.savings.annual||0)}</b></div>
      <div class="row"><span>Spending / mo</span><b>${fmtMoney(Math.round((plan.expenses.living||0)/12))}</b></div>
      <div class="row"><span>Goals / yr</span><b>${fmtMoney(goalsAnnual)}</b></div>
    </div>`;
  }
  const def = HYBRID[pageKey];
  // Cash Flow: headline = annual income; breakdown = income composition + expenses.
  if(pageKey === 'cashflow'){
    const income   = colSum(pageKey,'left');
    const expenses = colSum(pageKey,'right');
    const groupRows = (def.left.groups||[]).map(g =>
      `<div class="row"><span>${g.head}</span><b>${fmtMoney(groupSum(g))}</b></div>`).join('');
    return `<div class="np-gutter">
      <div class="lbl">${sp.totLabel}</div>
      <div class="big-num">${fmtMoney(income)}</div>
      <div class="big-sub">per year · today's dollars</div>
      <hr class="gut-rule"/>
      ${groupRows}
      <div class="row"><span>Expenses</span><b>${fmtMoney(expenses)}</b></div>
    </div>`;
  }
  const total = hybridTotal(pageKey);
  return `<div class="np-gutter">
    <div class="lbl">${sp.totLabel}</div>
    <div class="big-num">${fmtMoney(total)}</div>
    <div class="big-sub">per year · today's dollars</div>
    <hr class="gut-rule"/>
    <div class="row"><span>${def.left.head}</span><b>${fmtMoney(colSum(pageKey,'left'))}</b></div>
    <div class="row"><span>${def.right.head}</span><b>${fmtMoney(colSum(pageKey,'right'))}</b></div>
  </div>`;
}

/* ── Field renderer — one input element, shared by both layouts ──── */
function renderField(f, klass){
  const v = getPath(plan, f.path);
  if(f.type==='risk'){
    const opts = Object.keys(RISK_NAMES).map(k =>
      `<option value="${k}" ${+k===+v?'selected':''}>${RISK_NAMES[k]} · ${RISK_LABELS[k]}</option>`).join('');
    return `<select data-path="${f.path}" data-type="risk">${opts}</select>`;
  }
  if(f.type==='strategy'){
    const opts = Object.entries(STRATEGY_NAMES).map(([k,label]) =>
      `<option value="${k}" ${k===v?'selected':''}>${label}</option>`).join('');
    return `<select data-path="${f.path}" data-type="strategy">${opts}</select>`;
  }
  if(f.type==='text'){
    return `<input type="text" data-path="${f.path}" data-type="text" value="${escHtml(v||'')}" placeholder="${f.ph||''}">`;
  }
  if(f.type==='date'){
    return `<input type="date" data-path="${f.path}" data-type="text" value="${escHtml(v||'')}">`;
  }
  if(f.type==='money'){
    const dv = (v||0).toLocaleString('en-US');
    return `<span class="pre">$</span><input type="text" inputmode="numeric" data-path="${f.path}" data-type="money" value="${dv}">`;
  }
  if(f.type==='monthlyMoney'){
    const dv = Math.round((v||0)/12).toLocaleString('en-US');
    return `<span class="pre">$</span><input type="text" inputmode="numeric" data-path="${f.path}" data-type="monthlyMoney" value="${dv}">`;
  }
  if(f.type==='pct'){
    const dv = Math.round((v||0)*100);
    return `<input type="number" data-path="${f.path}" data-type="pct" value="${dv}" step="1"><span class="pre">%</span>`;
  }
  /* pctPoints: user enters whole percentage points (0–100), plan stores as-is.
     Use for fields where the engine itself divides by 100 (e.g. colaPct → engine does colaPct/100).
     Contrast with 'pct': user enters 55, plan stores 0.55, engine reads 0.55 directly. */
  if(f.type==='pctPoints'){
    const dv = (v||0);
    return `<input type="number" data-path="${f.path}" data-type="pctPoints" value="${dv}" step="0.5" min="0">`;
  }
  if(f.type==='num'){
    return `<input type="number" data-path="${f.path}" data-type="num" value="${v}" min="${f.min||0}" step="${f.step||1}">`;
  }
  /* rate: a float percentage (e.g. mortgage 6.25%) stored as-is. The #hh-view
     delegate writes the raw parsed float — unlike 'num' it must NOT round. */
  if(f.type==='rate'){
    return `<input type="number" data-path="${f.path}" data-type="rate" value="${v||0}" min="0" step="0.1">`;
  }
  // age
  const min = f.min != null ? ` min="${f.min}" data-min="${f.min}"` : '';
  const max = f.max != null ? ` max="${f.max}" data-max="${f.max}"` : '';
  return `<input type="number" data-path="${f.path}" data-type="${f.type}" value="${v}" step="1"${min}${max}>`;
}

/* ── Add-row sections ─────────────────────────────────────────────
   Schema-driven editable rows backed by a plan array. The SAME data-path
   binding + change handler that drives every other input writes these, so
   "add a row" is just pushing a default object and re-rendering, and "remove"
   is an array splice. Each kind names its backing array + a factory for a new
   row's defaults. (Goals share one array; recurring vs one-time is decided by
   the window: a one-time goal is a single-year window, startAge===endAge.) */
const ROW_KINDS = {
  income:    { arr:'income.other',   mk:()=>({ label:'', amount:0, startAge:65, endAge:75, realGrowth:0, taxablePct:1 }) },
  expense:   { arr:'expenses.extra', mk:()=>({ label:'', amount:0, startAge:65, endAge:80 }) },
  liability: { arr:'liabilities',    mk:()=>({ label:'', amount:0, startAge:65, endAge:75, colaPct:0 }) },
  goalRec:   { arr:'goals',          mk:()=>({ name:'',  amount:0, startAge:plan.household.primary.retirementAge, endAge:plan.household.primary.planEndAge }) },
  goalOnce:  { arr:'goals',          mk:()=>({ name:'',  amount:0, startAge:70, endAge:70 }) },
  property:  { arr:'properties',     mk:()=>({ name:'',  value:0, purchasePrice:0, mortgage:{ balance:0, rate:0, termYears:0 } }) },
  account:   { arr:'portfolio.extraAccounts', mk:()=>({ type:'New account', bucket:'taxable', owner:'joint', balance:0 }) },
  // Wizard Step 1 children: advisor context, engine-inert (name + birth year).
  child:     { arr:'household.children', mk:()=>({ name:'', birthYear: new Date().getFullYear() - 10 }) },
};
const money = (p,base,k)=>`<span class="er-amt"><span class="pre">$</span><input type="text" inputmode="numeric" data-path="${base}.${k}" data-type="money" value="${(getPath(plan,base+'.'+k)||0).toLocaleString('en-US')}"></span>`;
const num   = (p,base,k,step)=>`<input class="er-num" type="number" step="${step||1}" data-path="${base}.${k}" data-type="num" value="${getPath(plan,base+'.'+k)}">`;
const name  = (p,base,k,ph)=>`<input class="er-name" type="text" data-path="${base}.${k}" data-type="text" value="${escHtml(getPath(plan,base+'.'+k)||'')}" placeholder="${ph}">`;
const rmX   = base=>`<button class="row-x" data-rmpath="${base}" title="Remove this row">×</button>`;

// A flow row (income / expense / liability): name · amount · from–to ages.
function flowRow(arr, i, nameKey, ph){
  const base = `${arr}.${i}`;
  return `<div class="erow">${name(plan,base,nameKey,ph)}${money(plan,base,'amount')}
    <span class="er-ages">age ${num(plan,base,'startAge')}<span class="er-dash">–</span>${num(plan,base,'endAge')}</span>${rmX(base)}</div>`;
}
// An income row = the flow row PLUS a compact second line for the two per-stream
// controls: real growth/yr (signed — negative phases the stream down) and the
// share taxed at the ordinary rate. gpct stores a signed fraction; pct a 0–1 one.
function incomeRow(arr, i){
  const base = `${arr}.${i}`;
  const g = Math.round((getPath(plan, base+'.realGrowth')||0)*100);
  const tRaw = getPath(plan, base+'.taxablePct');
  const t = Math.round((tRaw==null?1:tRaw)*100);
  const main = `<div class="erow">${name(plan,base,'label','Source')}${money(plan,base,'amount')}
    <span class="er-ages">age ${num(plan,base,'startAge')}<span class="er-dash">–</span>${num(plan,base,'endAge')}</span>${rmX(base)}</div>`;
  const extra = `<div class="er-extra">
      <span class="er-xk">grows</span><input class="er-num er-gw" type="number" step="1" data-path="${base}.realGrowth" data-type="gpct" value="${g}"><span class="er-xs">%/yr real</span>
      <span class="er-xsep">·</span>
      <input class="er-num" type="number" step="1" data-path="${base}.taxablePct" data-type="pct" value="${t}"><span class="er-xs">% taxable</span>
    </div>`;
  return `<div class="erow-wrap">${main}${extra}</div>`;
}
// A property card: name · value · purchase price · optional mortgage. The
// payment + payoff shown is the ENGINE's amortization (truth), not UI math.
function propRow(i){
  const base = `properties.${i}`, m = `${base}.mortgage`;
  const M = getPath(plan, m) || {};
  const pay = annualMortgagePayment(M.balance, M.rate, M.termYears);
  const start = plan.household.primary.currentAge;
  const meta = pay > 0
    ? `Engine: ${fmtMoney(Math.round(pay))}/yr · paid off at age ${start + (M.termYears||0)}`
    : `No mortgage — value & purchase price are captured for a future sale`;
  return `<div class="prop">
    <div class="prop-top">${name(plan,base,'name','Property')}${rmX(base)}</div>
    <div class="prop-grid">
      <label class="prop-f"><span class="er-k">Value</span>${money(plan,base,'value')}</label>
      <label class="prop-f"><span class="er-k">Purchase price</span>${money(plan,base,'purchasePrice')}</label>
    </div>
    <div class="prop-mort">
      <span class="er-k">Mortgage</span>
      <label class="prop-f"><span class="er-sub">Balance</span>${money(plan,m,'balance')}</label>
      <label class="prop-f narrow"><span class="er-sub">Rate</span>${num(plan,m,'rate',0.1)}<span class="er-suf">%</span></label>
      <label class="prop-f narrow"><span class="er-sub">Term</span>${num(plan,m,'termYears')}<span class="er-suf">yr</span></label>
    </div>
    <div class="prop-meta">${meta}</div>
  </div>`;
}
// Render every row of a flow kind backed by `arr`, with the trailing "+ add".
function flowSection(arr, nameKey, ph, kind, addLabel){
  const list = getPath(plan, arr) || [];
  const rowFn = (kind==='income') ? (i=>incomeRow(arr,i)) : (i=>flowRow(arr,i,nameKey,ph));
  let h = list.map((_,i)=>rowFn(i)).join('');
  h += `<div class="hp-add" data-add="${kind}">${addLabel}</div>`;
  return h;
}

/* The old Balance-Sheet statement / Map editor (renderHouseholdStatement) was
   retired, and the two-chapter console (Net Worth equilibrium / Cash Flow)
   after it. Household is now the 5-step setup wizard (renderWizHousehold /
   renderWizAccounts / renderWizIncome / renderWizRetirement / renderWizBlueprint),
   rendered by syncHousehold() and backed by the #hh-view delegated handlers. */

/* ── Hybrid layout (Inflows / Outflows / Goals) ───────────────────
   200px gutter (title + description + running total) + two facing columns
   split by a single vertical hairline. Each item: name on the left, boxless
   input on the right, meta line below the name in ink-mute. */
function renderHybrid(pageKey){
  const def = HYBRID[pageKey];
  // A "group" = one labelled block (head + fixed items + optional pension +
  // optional editable section/goals). A column is one or more groups stacked, so
  // the combined Cash Flow page can show Fixed income + Variable under Income.
  const renderGroup = g => {
    let h = g.head ? `<h4>${g.head}</h4>` : '';
    const items = (g.items||[]).slice();
    if(g.dynamic==='pension'){
      // ONE summary row — the benefit at the chosen start age. The full
      // benefit-by-age schedule and which age to claim is decided at the
      // Scenario level (the pension slider), not here.
      const pen = plan.income.pension || {};
      const pstart = pen.startAge;
      const ages = Object.keys(pen.benefitByAge||{}).map(Number).sort((a,b)=>a-b);
      const age = (pstart!=null && (pen.benefitByAge||{})[pstart]!=null) ? pstart
                : (ages.length ? ages[0] : null);
      if(age!=null){
        items.push({ path:`income.pension.benefitByAge.${age}`, name:'Pension', type:'money', meta:()=>`Begins at age ${age}` });
      }
    }
    items.forEach(it => {
      const xBtn = it.removable ? `<button class="row-x" title="Remove this row" data-rmpath="${it.path}">×</button>` : '';
      h += `<div class="hp-item"><div class="ti"><span class="nm">${it.name}</span><span class="field">${renderField(it)}${xBtn}</span></div>`;
      const m = it.meta ? it.meta() : '';
      if(m) h += `<div class="meta">${m}</div>`;
      h += `</div>`;
    });
    // Array-backed editable rows: a flow section (variable income) …
    if(g.section){
      const s = g.section;
      h += `<div class="erows">${flowSection(s.arr, s.nameKey, s.ph, s.kind, s.add)}</div>`;
    }
    // … or the goals array, split by window into recurring vs one-time columns.
    if(g.add && !g.section) h += `<div class="hp-add">${g.add}</div>`;
    return h;
  };
  const colHtml = colDef => {
    const groups = colDef.groups || [colDef];   // ungrouped pages: the column IS one group
    return `<div class="hp-col">${groups.map(renderGroup).join('')}</div>`;
  };
  return `<div class="np-page">
    ${renderGutter(pageKey)}
    <div class="hp-body">
      ${colHtml(def.left)}
      <div class="hp-rule"></div>
      ${colHtml(def.right)}
    </div>
  </div>`;
}

/* ── Snapshot (the diagnosis) ──────────────────────────────────────
   Three diagnostic gauges, each a RELATIONSHIP between numbers already
   entered — not engine projections. These are static rules-of-thumb (like a
   balance-sheet ratio): the income floor, the year-one withdrawal rate, and
   the tax-location mix. The engine still owns the real probability (Scenarios);
   this page is the at-a-glance condition of the household TODAY. Neutrality:
   the same gauges read green when the news is good and red when it isn't —
   the tool has no thesis, it just shows what's there. */
function snapshotMetrics(){
  const a = plan.portfolio.accounts;
  const taxable = a.taxable.balance||0, trad = a.traditional.balance||0, roth = a.roth.balance||0;
  const invest = taxable + trad + roth;
  // Guaranteed-for-life income at retirement: both SS benefits + pension at its
  // chosen start age (today's-dollar values straight off the inputs).
  const ssP = plan.income.socialSecurity.primary.pia||0;
  const ssS = (plan.income.socialSecurity.spouse && plan.income.socialSecurity.spouse.pia)||0;
  const pen = plan.income.pension||{};
  const penAmt = (pen.benefitByAge && pen.startAge!=null) ? (pen.benefitByAge[pen.startAge]||0) : 0;
  const guaranteed = ssP + ssS + penAmt;
  const essentials = (plan.expenses.living||0) + (plan.expenses.healthcare||0);
  const goals = (Array.isArray(plan.goals) ? plan.goals : []).reduce((s,g)=>s+(g.amount||0),0);
  const totalSpend = essentials + goals;
  const floorPct = essentials>0 ? guaranteed/essentials : 0;
  const fromPortfolioEssential = Math.max(0, essentials - guaranteed);
  const gap = Math.max(0, totalSpend - guaranteed);
  const wr = invest>0 ? gap/invest : 0;
  // Replacement ratio: GUARANTEED retirement income (SS + pension) as a share of
  // gross working income. Portfolio withdrawals are NOT income — they're spending
  // the portfolio funds — so they're deliberately excluded here. (A "sustainable
  // withdrawal amount" would need a solve, and would be framed as exactly that.)
  const workingIncome = plan.income.workingIncome || 0;
  const replacement = workingIncome>0 ? guaranteed/workingIncome : null;
  return { taxable, trad, roth, invest, guaranteed, essentials, goals, totalSpend,
           floorPct, fromPortfolioEssential, gap, wr, workingIncome, replacement };
}
function renderSnapshot(){
  const m = snapshotMetrics();
  const pct = v => (v*100);
  const pct1 = v => (v*100).toFixed(1)+'%';
  const pct0 = v => Math.round(v*100)+'%';

  // 1 · Income floor — floating stats (no bar: bar implied a grade, this is a fact).
  const incomeFloor = `
    <div class="metric">
      <div>
        <div class="m-eye">Income Floor</div>
        <div class="m-hero">${pct0(m.floorPct)}</div>
        <div class="m-sub">of essential spending is covered for life by guaranteed income</div>
      </div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-lbl">Guaranteed for life</div><div class="stat-val">${fmtMoney(m.guaranteed)}</div></div>
        <div class="stat-item"><div class="stat-lbl">Drawn from portfolio</div><div class="stat-val">${fmtMoney(m.fromPortfolioEssential)}</div></div>
        <div class="stat-item"><div class="stat-lbl">Essential spending</div><div class="stat-val">${fmtMoney(m.essentials)}</div></div>
      </div>
    </div>`;

  // 2 · Withdrawal rate — neutral metric, no grading. Shown for reference and
  // as a starting point for advisor conversation, not a verdict.
  const withdrawal = `
    <div class="metric">
      <div>
        <div class="m-eye">Withdrawal Rate · Year One</div>
        <div class="m-hero">${pct1(m.wr)}</div>
        <div class="m-sub">of the portfolio drawn the first year of retirement</div>
      </div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-lbl">Portfolio draws / yr</div><div class="stat-val">${fmtMoney(m.gap)}</div></div>
        <div class="stat-item"><div class="stat-lbl">From invested</div><div class="stat-val">${fmtMoney(m.invest)}</div></div>
        <div class="stat-item"><div class="stat-lbl">Total retirement spend</div><div class="stat-val">${fmtMoney(m.totalSpend)}</div></div>
      </div>
    </div>`;

  // 3 · Tax location — segmented proportion bar. Hero = the tax-deferred share
  // (the future-tax exposure). Labels hidden on slivers too thin to hold text.
  const tP = m.invest>0 ? m.taxable/m.invest : 0;
  const dP = m.invest>0 ? m.trad/m.invest : 0;
  const rP = m.invest>0 ? m.roth/m.invest : 0;
  const segLbl = (p) => pct(p)>=8 ? pct0(p) : '';
  const taxLocation = `
    <div class="metric">
      <div>
        <div class="m-eye">Tax Location</div>
        <div class="m-hero">${pct0(dP)}</div>
        <div class="m-sub">sits in tax-deferred accounts — taxed as income when withdrawn</div>
      </div>
      <div>
        <div class="seg">
          <div class="s-tax" style="width:${(tP*100).toFixed(1)}%">${segLbl(tP)}</div>
          <div class="s-def" style="width:${(dP*100).toFixed(1)}%">${segLbl(dP)}</div>
          <div class="s-roth" style="width:${(rP*100).toFixed(1)}%">${segLbl(rP)}</div>
        </div>
        <div class="seg-legend">
          <span class="k"><span class="sw" style="background:var(--accent)"></span>Taxable<b>${fmtMoney(m.taxable)}</b></span>
          <span class="k"><span class="sw" style="background:var(--accent-deep)"></span>Tax-deferred<b>${fmtMoney(m.trad)}</b></span>
          <span class="k"><span class="sw" style="background:var(--accent-secondary)"></span>Tax-free · Roth<b>${fmtMoney(m.roth)}</b></span>
        </div>
      </div>
    </div>`;

  // 4 · Replacement ratio — retirement income as a share of working income.
  // NEUTRAL by design: no safety zones, because a higher ratio isn't worse —
  // it's the upside (live as well or better than today). Reference ticks only:
  // a faint "typical ~75%" heuristic and a solid "100% = working income" line.
  // Scale runs 0–120% so over-100% (spending up in retirement) still shows.
  let replacement;
  if(m.replacement == null){
    replacement = `
      <div class="metric">
        <div>
          <div class="m-eye">Replacement Ratio</div>
          <div class="m-hero">—</div>
          <div class="m-sub">add working income on the Balance Sheet to compare retirement to life today</div>
        </div>
        <div></div>
      </div>`;
  } else {
    // Coverage bar — same language as the income floor. The full track = working
    // income; the filled portion = the share retirement income replaces. No vertical
    // ticks cutting through text. Caps at the track; over-100% (spending more in
    // retirement) shows full + the true % in the hero.
    const fillPct = Math.min(100, m.replacement*100);
    replacement = `
      <div class="metric">
        <div>
          <div class="m-eye">Replacement Ratio</div>
          <div class="m-hero">${pct0(m.replacement)}</div>
          <div class="m-sub">of working income, replaced by guaranteed retirement income</div>
        </div>
        <div>
          <div class="cov"><div class="fill" style="width:${fillPct.toFixed(1)}%">Guaranteed&nbsp;·&nbsp;${fmtMoney(m.guaranteed)}</div></div>
          <div class="cov-legend">
            <span class="k"><span class="sw" style="background:var(--accent)"></span>Guaranteed income<b>${fmtMoney(m.guaranteed)}</b></span>
            <span class="k"><span class="sw" style="background:#e3d9c5"></span>Working income<b>${fmtMoney(m.workingIncome)}</b></span>
          </div>
        </div>
      </div>`;
  }

  return `<div class="snap">${incomeFloor}${withdrawal}${taxLocation}${replacement}</div>`;
}

/* ── Goals board (the approved prioritisation surface) ─────────────
   The Goals sub-tab is NOT the ledger — it's a board. Each card is a VIEW of a
   plan.goals entry: recurring goals (startAge≠endAge) carry a /yr tag; one-time
   goals (startAge===endAge) get a highlighted card + ONE-TIME tag. The hero sums the
   recurring goals (annual goal spend) and notes any one-time total. Drag a card
   onto a ghost slot to rank it (absorb + accent flash; swap, not bounce). The
   ranking is a planning/conversation surface — it adds NO engine math. */

/* ── Goals — tributaries ──────────────────────────────────────────────────
   A picture of the plan's goal spending: one gold thread across the plan's
   ages, one ribbon per kept recurring goal (width ∝ its annual amount)
   peeling off at its start age, one-time goals as diamonds on the spine.
   Statement rows below edit plan.goals through the same delegated data-path
   change handler every ledger page uses.
   The keep/drop toggle is WHAT-IF ONLY: it never touches plan.goals
   (Scenarios keep funding every goal — that sameness is the truth); it only
   changes which engine runs this page composes. Per-goal cost cells are
   differences of runSimulation outputs — no UI math. */
const GOAL_DROP_KEY='parallax.goals.dropped';

function saveDroppedGoals(set){
  try{ localStorage.setItem(GOAL_DROP_KEY, JSON.stringify({n:(plan.goals||[]).length, dropped:[...set]})); }catch{}
}

/* ── Goals — life-area intake ─────────────────────────────────────────────
   A row of dimmed life-area chips. Clicking one glows it open and shows an
   intake strip: the client names the goal IN THEIR OWN WORDS (the tool never
   suggests content — areas are empty structure), picks rough timing, and the
   goal lands in plan.goals with amount 0 — "price later". Amount 0 is
   engine-inert (goals add via goalsA += g.amount), so an unpriced goal can
   sit in the picture without inventing a number. Timing presets are input
   defaulting from household ages, not financial math; the row's age inputs
   stay the source of truth. */
let glhFilter = 'all'; // persists across re-renders; reset by filter pill clicks










function initGoalsPage(){
  const np=$('#np-content');
  // Life-area chips: toggle open (re-render shows/hides the intake strip).
  np.querySelectorAll('.ga-chip').forEach(b=>b.onclick=()=>{
    const k=b.dataset.area;
    uiState.goalAreaOpen = goalAreaOpen===k ? null : k;
    renderInputs();
    const inp=$('#ga-name'); if(inp) inp.focus();
  });
  // Timing presets: class swap only — no re-render, typed text survives.
  np.querySelectorAll('.ga-preset').forEach(b=>b.onclick=()=>{
    uiState.goalAreaTiming=b.dataset.preset;
    np.querySelectorAll('.ga-preset').forEach(x=>x.classList.toggle('sel', x===b));
  });
  const addAreaGoal=()=>{
    const inp=$('#ga-name'), nm=((inp&&inp.value)||'').trim();
    if(!nm){ if(inp) inp.focus(); return; }
    if(!Array.isArray(plan.goals)) plan.goals=[];
    plan.goals.push({ name:nm, amount:0, area:goalAreaOpen, ...goalAreaAges(plan, goalAreaTiming) });
    commitPlanEdit();   // re-render keeps the chip open (and now lit) for the next one
    const again=$('#ga-name'); if(again) again.focus();
  };
  const go=$('#ga-go');
  if(go){
    go.onclick=addAreaGoal;
    const inp=$('#ga-name');
    if(inp) inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addAreaGoal(); } });
  }
  np.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.drop, set=droppedGoals(plan, GOAL_DROP_KEY);
    if(set.has(i)) set.delete(i); else set.add(i);
    saveDroppedGoals(set);
    renderInputs();             // redraw thread + rows; plan.goals untouched
  });
  np.querySelectorAll('.gt-hit').forEach(p=>p.onclick=()=>{
    uiState.goalSelected = goalSelected===+p.dataset.goalI ? null : +p.dataset.goalI;
    syncGoalSelection(np);
  });
  np.querySelectorAll('.gl-row').forEach(r=>r.addEventListener('click', e=>{
    if(e.target.closest('input,button')) return;
    uiState.goalSelected = goalSelected===+r.dataset.glRow ? null : +r.dataset.glRow;
    syncGoalSelection(np);
  }));
  scheduleGoalCosts();
}
/* Engine-measured per-goal cost. Composes runSimulation over plan clones on
   the SAME seeded path bundle the scenarios use: baseline (kept goals), one
   run per goal (kept minus it — or, for a dropped goal, kept plus it), and
   all-goals-off. Every figure painted below is an engine output or a
   difference of two engine outputs; the UI adds no math. Async with a token
   so a stale run set never paints over a newer page state. */
let goalCostCache=null, goalCostToken=0;
function goalCostKey(dropped){
  return JSON.stringify([plan.goals, [...dropped].sort((a,b)=>a-b), pathReplay.seed, plan.simulation.iterations]);
}
function scheduleGoalCosts(){
  if(!$('#gl-runs')) return;                       // not on the goals page
  const dropped=droppedGoals(plan, GOAL_DROP_KEY);
  const key=goalCostKey(dropped);
  if(goalCostCache && goalCostCache.key===key){ paintGoalCosts(goalCostCache); return; }
  const token=++goalCostToken;
  setTimeout(()=>{                                  // paint first, run after
    if(token!==goalCostToken || !$('#gl-runs')) return;
    const paths=ensureSharedPaths();
    if(!paths) return;
    const goals=plan.goals||[];
    const keptIdx=goals.map((g,i)=>i).filter(i=>!dropped.has(i));
    const runFor=idx=>{
      const clone=structuredClone(plan);
      clone.goals=idx.map(i=>goals[i]);
      const r=runSimulation(clone, {}, paths);
      return { success:r.successRate, median:r.terminal.p50 };
    };
    try{
      const base=runFor(keptIdx);
      const allOff=runFor([]);
      const per={};
      for(let i=0;i<goals.length;i++){
        if(token!==goalCostToken) return;
        if(!(goals[i].amount>0)) continue;          // unpriced: $0 is inert — no runs to make
        per[i]=dropped.has(i)
          ? runFor([...keptIdx, i].sort((a,b)=>a-b))   // what keeping it back would do
          : runFor(keptIdx.filter(j=>j!==i));          // what dropping it would free
      }
      goalCostCache={ key, base, allOff, per, dropped:[...dropped] };
      if(token===goalCostToken) paintGoalCosts(goalCostCache);
    }catch(err){ console.error('goal cost runs failed', err); }
  }, 20);
}
function paintGoalCosts(c){
  const dropped=new Set(c.dropped);
  $$('#np-content .gl-cost').forEach(el=>{
    const i=+el.dataset.costI, r=c.per[i];
    if(!r){ el.textContent=el.classList.contains('unpriced-cell')?'unpriced':'—'; return; }
    if(dropped.has(i)){
      el.innerHTML=`if kept: <b>${fmtPts(r.success-c.base.success)}</b> · ${fmtMDelta(r.median-c.base.median)} median`;
    }else{
      el.innerHTML=`if dropped: <b>${fmtPts(r.success-c.base.success)}</b> · ${fmtMDelta(r.median-c.base.median)} median`;
    }
  });
  const runs=$('#gl-runs');
  if(runs) runs.innerHTML=`
    <span>kept goals: <b>${c.base.success.toFixed(1)}%</b> success · <b>${fmtM(c.base.median)}</b> median end</span>
    <span>all goals off: <b>${c.allOff.success.toFixed(1)}%</b> · <b>${fmtM(c.allOff.median)}</b></span>`;
}

/* ================================================================
   Goals · Ledger view — the live Goals sub-page
   ----------------------------------------------------------------
   One always-editable sheet over the flat plan.goals store
   ({ name, amount, startAge, endAge }) — one goal = one row, every
   field permanently visible and directly editable. No edit modes,
   no popovers, no composers. Replaces the Life Chapters view
   (chapter cards + two composers + inline row editors), removed.

   - ONE-TIME = startAge === endAge (the engine's own convention);
     the Every year / One-time toggle is UI sugar over the ages —
     no cadence field is ever stored.
   - CHAPTERS are a UI-only derivation (floor-thirds over the
     resolved [retirement, planEnd] span). Row chips are coarse
     presets over the exact age boxes; the footer sums entered
     inputs per chapter — labelled "sum of entered goals", never an
     engine output, never an invented confidence number.
   - WRITE-THROUGH: every edit mutates plan.goals[i], arms SAVE
     (planSaveDirty via reseedScenarios) and marks scenario results
     stale (plansDirty). Typing never re-renders the row — focus
     survives the keystroke; footer sums repaint in place.
   ================================================================ */

/* ── PROD seam — every production symbol the view touches ─────── */
const GL_PROD = {
  goals:     () => { if (!Array.isArray(plan.goals)) plan.goals = []; return plan.goals; },
  household: () => plan.household,
  commit:    () => commitPlanEdit(),            // reseed + re-render + status
  // Write-through for typing: everything commitPlanEdit does EXCEPT the
  // re-render (renderInputs) — the focused field must survive the keystroke.
  arm: () => {
  reseedScenarios(); uiState.sharedPaths = null; uiState.plansDirty = true;
    $('#status').textContent = 'Plan edited \u00b7 open Scenarios';
  },
  esc:     (s) => escHtml(s),
  compact: (n) => fmtM(n),                      // $120K / $1.2M
};

/* View state that survives the commit re-render */
let glFlashGi = null;   // goal index whose new row flashes gold after an add
let glFocusGi = null;   // goal index whose name field takes focus after an add

/* ── Resolved span + derived chapters — never hardcoded ─────────
   lo = resolved retirement age: the LATER working spouse mapped
   onto the primary timeline (mirrors engine resolveInputs);
   hi = planEndAge. The demo household resolves 66→95, so the
   derived chapters are 66–75 / 76–85 / 86–95. */
function glSpan() {
  const hh = GL_PROD.household(), pr = hh.primary || {};
  let ret = +pr.retirementAge;
  if (!isFinite(ret)) ret = isFinite(+pr.currentAge) ? +pr.currentAge : 65;
  const sp = hh.spouse;
  if (sp && sp.retirementAge != null && sp.currentAge != null && pr.currentAge != null) {
    ret = Math.max(ret, +pr.currentAge + (+sp.retirementAge - +sp.currentAge));
  }
  const end = isFinite(+pr.planEndAge) ? +pr.planEndAge : 95;
  const lo = Math.min(ret, end);
  return { lo, hi: Math.max(lo + 2, end) };
}

/* Floor-thirds split; Chapter III absorbs the remainder years. */
function glChapters() {
  const { lo, hi } = glSpan();
  const a = Math.max(1, Math.floor((hi - lo + 1) / 3));
  return [
    { i: 0, roman: 'I',   lo,             hi: lo + a - 1 },
    { i: 1, roman: 'II',  lo: lo + a,     hi: lo + 2 * a - 1 },
    { i: 2, roman: 'III', lo: lo + 2 * a, hi },
  ];
}

/* Row dot color — presentation only, never stored. Area-keyed when the
   goal carries one; otherwise a stable palette cycle by row index. */
const GL_DOT_KEYS = ['travel', 'home', 'family', 'health', 'purpose', 'other'];
function glDotRGB(g, gi) {
  const k = g.area && GOAL_COLOR_MAP[g.area] ? g.area : GL_DOT_KEYS[gi % GL_DOT_KEYS.length];
  return GOAL_COLOR_MAP[k].rgb;   // "R,G,B"
}

/* Quick-add seeds — ages derived from the resolved plan at click time,
   never constants. Ordinary rows once added: fully editable, deletable. */
function glQuickAdds() {
  const { lo, hi } = glSpan();
  const ch = glChapters();
  const onceAt = Math.min(lo + 2, hi);
  return [
    { name: 'Travel',            amount: 12000,  area: 'travel', startAge: lo,     endAge: hi },
    { name: 'Home improvements', amount: 5000,   area: 'home',   startAge: lo,     endAge: ch[1].hi },
    { name: 'Gifts',             amount: 5000,   area: 'family', startAge: lo,     endAge: hi },
    { name: 'Second home',       amount: 150000, area: 'other',  startAge: onceAt, endAge: onceAt },
  ];
}

/* Per-chapter input sums (amount × overlap years). Edge chapters extend
   outward so spending entered outside [retirement, planEnd] is still
   attributed — Lifetime always equals the true sum of entered goals. */
function glChapterSums(ch) {
  const sums = [0, 0, 0];
  GL_PROD.goals().forEach(g => {
    const sa = +g.startAge, ea = +g.endAge, amt = +g.amount || 0;
    ch.forEach(c => {
      const lo = c.i === 0 ? -Infinity : c.lo;
      const hi = c.i === 2 ?  Infinity : c.hi;
      const years = Math.min(ea, hi) - Math.max(sa, lo) + 1;
      if (years > 0) sums[c.i] += amt * years;
    });
  });
  return sums;
}

/* ── Render ───────────────────────────────────────────────────── */

function glRowHTML(g, gi, ch) {
  const once = +g.startAge === +g.endAge;
  const rgb  = glDotRGB(g, gi);
  const amt  = +g.amount || 0;
  const chips = ch.map(c => {
    const full = +g.startAge <= c.lo && +g.endAge >= c.hi;
    const part = !full && Math.min(+g.endAge, c.hi) >= Math.max(+g.startAge, c.lo);
    const cls  = full ? ' glx-chip--on' : part ? ' glx-chip--part' : '';
    return `<span class="glx-chip${cls}" data-act="chip" data-i="${gi}" data-ch="${c.i}">${c.roman} \u00b7 ${c.lo}\u2013${c.hi}</span>`;
  }).join('');
  const whenYr = `
      <div class="glx-when"${once ? ' hidden' : ''}>${chips}
        <span class="glx-agepair">
          <input class="glx-ain" data-t="s" data-i="${gi}" inputmode="numeric" value="${+g.startAge}">
          <span class="glx-dash">\u2013</span>
          <input class="glx-ain" data-t="e" data-i="${gi}" inputmode="numeric" value="${+g.endAge}">
        </span>
      </div>`;
  const whenOnce = `
      <div class="glx-agewrap"${once ? '' : ' hidden'}>
        <span class="glx-agelbl">at age</span>
        <span class="glx-step glx-step--sm" data-act="age-minus" data-i="${gi}">\u2212</span>
        <span class="glx-ageval">${+g.startAge}</span>
        <span class="glx-step glx-step--sm" data-act="age-plus" data-i="${gi}">+</span>
      </div>`;
  return `
    <div class="glx-row${gi === glFlashGi ? ' glx-row--flash' : ''}" data-row="${gi}">
      <span class="glx-dot" style="background:rgb(${rgb});box-shadow:0 0 10px rgba(${rgb},0.5)"></span>
      <input class="glx-name" data-i="${gi}" value="${GL_PROD.esc(g.name || '')}">
      <div class="glx-amtcell">
        <span class="glx-step" data-act="minus" data-i="${gi}">\u2212</span>
        <span class="glx-amtwrap"><span class="glx-dollar">$</span><input class="glx-amt" data-i="${gi}" inputmode="numeric" value="${amt ? amt.toLocaleString('en-US') : ''}"></span>
        <span class="glx-step" data-act="plus" data-i="${gi}">+</span>
      </div>
      <div class="glx-seggroup">
        <span class="glx-seg${once ? '' : ' glx-seg--on'}" data-act="cad-yr" data-i="${gi}">Every year</span>
        <span class="glx-seg${once ? ' glx-seg--on' : ''}" data-act="cad-once" data-i="${gi}">One-time</span>
      </div>
      <div>${whenYr}${whenOnce}</div>
      <span class="glx-del" data-act="del" data-i="${gi}" title="Delete this goal">\u00d7</span>
    </div>`;
}

function glFooterHTML(ch, sums) {
  const life = sums[0] + sums[1] + sums[2];
  return `<span class="glx-f-cap">CHAPTERS</span>` +
    ch.map((c, i) =>
      (i ? '<span class="glx-f-dot">\u00b7</span>' : '') +
      `<span class="glx-f-lbl">${c.roman} \u00b7 ${c.lo}\u2013${c.hi}</span>` +
      `<span class="glx-f-val" data-fsum="${c.i}">${GL_PROD.compact(sums[c.i])}</span>`
    ).join('') +
    `<span class="glx-f-space"></span>` +
    `<span class="glx-f-lbl">Lifetime</span><span class="glx-f-life" id="glx-life">${GL_PROD.compact(life)}</span>` +
    `<span class="glx-f-note">\u2014 sum of entered goals</span>`;
}

function renderGoalsLedger() {
  const ch = glChapters();
  const goals = GL_PROD.goals();
  const sums = glChapterSums(ch);
  const rows = goals.map((g, gi) => glRowHTML(g, gi, ch)).join('');
  glFlashGi = null;
  const quicks = glQuickAdds().map((q, qi) => {
    const rgb = GOAL_COLOR_MAP[q.area].rgb;
    return `<button class="glx-qa" type="button" data-q="${qi}">` +
      `<span class="glx-qa-dot" style="background:rgb(${rgb});box-shadow:0 0 8px rgba(${rgb},0.5)"></span>` +
      `<span class="glx-qa-name">${q.name}</span></button>`;
  }).join('');
  return `
    <div class="gl-ledger" id="gl-ledger">
      <h1 class="glx-h1">Lifestyle Goals</h1>
      <div class="glx-sheet">
        <div class="glx-cols"${goals.length ? '' : ' style="display:none"'}>
          <div></div>
          <div class="glx-cap">GOAL</div>
          <div class="glx-cap">AMOUNT</div>
          <div class="glx-cap">HOW OFTEN</div>
          <div class="glx-cap">WHICH YEARS</div>
          <div></div>
        </div>
        <div class="glx-rows" id="glx-rows">${rows}</div>
        <div class="glx-adds">
          <button class="glx-add-btn" id="glx-add" type="button"><span class="glx-add-plus">+</span>Add a goal</button>
          <div class="glx-adds-sep"></div>
          <div class="glx-f-cap">QUICK ADD</div>
          ${quicks}
        </div>
        <div class="glx-footer" id="glx-footer">${glFooterHTML(ch, sums)}</div>
      </div>
    </div>`;
}

/* ── Init (bindings; runs after every render) ─────────────────── */

function initGoalsLedger() {
  const wrap = document.getElementById('gl-ledger');
  if (!wrap) return;
  const ch = glChapters();
  const { lo: LO, hi: HI } = glSpan();
  const clampAge = v => Math.max(LO, Math.min(HI, v));
  const goals = GL_PROD.goals();

  // Footer repaint in place — used by amount typing (no row re-render).
  const repaintFooter = () => {
    const sums = glChapterSums(ch);
    wrap.querySelectorAll('[data-fsum]').forEach(el =>
      el.textContent = GL_PROD.compact(sums[+el.dataset.fsum]));
    const life = document.getElementById('glx-life');
    if (life) life.textContent = GL_PROD.compact(sums[0] + sums[1] + sums[2]);
  };

  const addGoal = g => {
    goals.push(g);
    glFlashGi = glFocusGi = goals.length - 1;
    GL_PROD.commit();
  };

  // Clicks: adds, steppers, cadence, chips, one-time age, delete.
  wrap.addEventListener('click', e => {
    const qa = e.target.closest('.glx-qa');
    if (qa) {
      const q = glQuickAdds()[+qa.dataset.q];
      if (q) addGoal({ name: q.name, amount: q.amount, area: q.area, startAge: q.startAge, endAge: q.endAge });
      return;
    }
    if (e.target.closest('#glx-add')) {
      addGoal({ name: 'New goal', amount: 5000, startAge: ch[0].lo, endAge: ch[0].hi });
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const i = +el.dataset.i, g = goals[i];
    if (!g) return;
    const once = +g.startAge === +g.endAge;
    const act = el.dataset.act;
    if (act === 'minus' || act === 'plus') {
      const step = once ? 5000 : 1000;               // ±$5K one-time · ±$1K recurring
      g.amount = Math.max(0, (+g.amount || 0) + (act === 'plus' ? step : -step));
      GL_PROD.commit();
    } else if (act === 'cad-once') {
      if (!once) { g.endAge = g.startAge; GL_PROD.commit(); }
    } else if (act === 'cad-yr') {
      if (once) { g.endAge = Math.min(+g.startAge + 9, HI); GL_PROD.commit(); }
    } else if (act === 'chip') {
      // Chips are coarse presets over the age boxes. New range = min..max of
      // the lit set (engine model is a single contiguous range); clicking a
      // partial chip lights it fully; the set can never be emptied.
      const ci = +el.dataset.ch;
      const lit = ch.filter(c => +g.startAge <= c.lo && +g.endAge >= c.hi).map(c => c.i);
      let set;
      if (lit.includes(ci)) { set = lit.filter(j => j !== ci); if (!set.length) return; }
      else set = lit.concat([ci]);
      g.startAge = ch[Math.min(...set)].lo;
      g.endAge   = ch[Math.max(...set)].hi;
      GL_PROD.commit();
    } else if (act === 'age-minus' || act === 'age-plus') {
      const a = clampAge(+g.startAge + (act === 'age-plus' ? 1 : -1));
      g.startAge = a; g.endAge = a;
      GL_PROD.commit();
    } else if (act === 'del') {
      goals.splice(i, 1);
      GL_PROD.commit();
    }
  });

  // Typing writes through WITHOUT a re-render — focus never leaves the field.
  // Amount keystrokes reformat commas in place and repaint the footer sums.
  wrap.addEventListener('input', e => {
    const t = e.target, i = +t.dataset.i, g = goals[i];
    if (!g) return;
    if (t.classList.contains('glx-name')) {
      g.name = t.value;
      GL_PROD.arm();
    } else if (t.classList.contains('glx-amt')) {
      liveCommas(t);
      g.amount = parseInt(t.value.replace(/[^0-9]/g, ''), 10) || 0;   // blank = unpriced ($0, engine-inert)
      GL_PROD.arm();
      repaintFooter();
    }
  });

  // Exact age boxes commit on change (blur/Enter): clamp to the resolved
  // span and keep start ≤ end, dragging the other bound along.
  wrap.addEventListener('change', e => {
    const t = e.target;
    if (!t.classList.contains('glx-ain')) return;
    const g = goals[+t.dataset.i];
    if (!g) return;
    let v = parseInt(t.value.replace(/[^0-9]/g, ''), 10);
    if (!isFinite(v)) v = t.dataset.t === 's' ? +g.startAge : +g.endAge;
    v = clampAge(v);
    if (t.dataset.t === 's') { g.startAge = v; if (+g.endAge < v) g.endAge = v; }
    else                     { g.endAge = v;   if (+g.startAge > v) g.startAge = v; }
    GL_PROD.commit();
  });

  // A just-added row takes focus on its name, selected so typing replaces it.
  if (glFocusGi != null) {
    const el = wrap.querySelector(`.glx-name[data-i="${glFocusGi}"]`);
    glFocusGi = null;
    if (el) { el.focus(); el.select(); }
  }
}

/* ── Sub-page render + wiring ─────────────────────────────────────
   One renderInputs() drives whichever sub-page is active. Re-renders on
   sub-nav click, on field change, and on row delete — same wiring pattern
   as before so live-commas / scenario re-seeding / plansDirty all still
   work without per-layout duplication. */
function renderInputs(){
  // sub-nav active state
  $$('#np-subnav .stab').forEach(b => b.classList.toggle('on', b.dataset.sub===activeSub));
  const layout = SUB_PAGES[activeSub].layout;
  const np = $('#np-content');
  // Snapshot is its own diagnostic page again — embedding it on the Net Worth
  // page made that page too busy to read.
  const html = layout==='snapshot'  ? `<div class="np-snapshot-page">${renderSnapshot()}</div>`
             : layout==='goals'     ? renderGoalsLedger()   // Goals Ledger view
             :                        renderHybrid(activeSub);
  np.innerHTML = html;
  if(layout==='goals') initGoalsLedger();
}
// ── Net Worth input bindings — delegated on the stable #np-content ────────────
// Input listeners are set once here so re-renders via renderInputs() (which
// replaces #np-content children) never accumulate orphaned listeners.

// ── All Net Worth interactions — delegated on the stable #np-content ─────────
$('#np-content').addEventListener('click', e => {
  // (The old Map / Net-Worth toggle was retired with the Household editor.)
  // Row delete (×)
  const rx = e.target.closest('.row-x');
  if(rx){
    const path = rx.dataset.rmpath;
    const ks = path.split('.'); const last = ks.pop();
    let t = plan; for(const k of ks){ if(t==null) return; t=t[k]; }
    // Array rows splice (no holes); object keys delete.
    if(Array.isArray(t)) t.splice(+last, 1);
    else if(t!=null) delete t[last];
    reseedScenarios(); 
  uiState.sharedPaths = null; uiState.plansDirty = true;
    renderInputs();
    $('#status').textContent='Plan edited · open Scenarios';
    return;
  }
  // "+ add …" — push a default row onto the backing array, then re-render.
  const adder = e.target.closest('[data-add]');
  if(adder){
    const kind = adder.dataset.add;
    const k = ROW_KINDS[kind];
    if(k){
      const arr = getPath(plan, k.arr);
      if(Array.isArray(arr)) arr.push(k.mk());
      else setPath(plan, k.arr, [k.mk()]);
      commitPlanEdit();
    }
    return;
  }
  // Account type chip
  const chip = e.target.closest('.acct-chip');
  if(chip){
    acctSel = { label: chip.dataset.label, bucket: chip.dataset.bucket };
    $$('#np-content .acct-chip').forEach(c => c.classList.toggle('sel', c === chip));
    const btn = $('#np-content .acct-add');
    if(btn){ btn.disabled = false; btn.textContent = 'Add ' + acctSel.label; }
    return;
  }
  if(e.target.closest('.acct-add')){
    if(!acctSel) return;
    const amtEl = $('#np-content .acct-amt');
    const bal = parseFloat(String(amtEl ? amtEl.value : '').replace(/[^0-9.]/g, ''));
    if(!isFinite(bal) || bal <= 0){
      if(amtEl){ amtEl.focus(); amtEl.style.outline='2px solid var(--negative)'; setTimeout(()=>amtEl.style.outline='',1500); }
      return;
    }
    if(!plan.portfolio.extraAccounts) plan.portfolio.extraAccounts = [];
    plan.portfolio.extraAccounts.push({ type: acctSel.label, bucket: acctSel.bucket, balance: Math.round(bal) });
    acctSel = null;
    commitPlanEdit();
    return;
  }
  const rm = e.target.closest('.acct-x');
  if(rm){
    const i = +rm.dataset.acctidx;
    if(plan.portfolio.extraAccounts) plan.portfolio.extraAccounts.splice(i, 1);
    commitPlanEdit();
  }
});
// Live commas on money fields.
$('#np-content').addEventListener('input', e => {
  if(e.target.dataset.type === 'money' || e.target.dataset.type === 'monthlyMoney') liveCommas(e.target);
});
$('#np-content').addEventListener('change', e => {
  // Field edits (data-path bindings)
  const path = e.target.dataset.path, type = e.target.dataset.type;
  if(path){
    const raw = e.target.value;
    if(type==='text' || type==='strategy'){            // free-text row labels or select values
      setPath(plan, path, raw);
  reseedScenarios(); uiState.sharedPaths=null; uiState.plansDirty=true; renderInputs();
      $('#status').textContent='Plan edited · open Scenarios';
      return;
    }
    let v;
    if(type==='money' || type==='monthlyMoney') v = parseFloat(String(raw).replace(/[^0-9.]/g,''));
    else if(type==='risk')  v = +raw;
    else                    v = parseFloat(raw);
    // Blanking a goal amount returns the goal to unpriced ($0 is engine-inert).
    if(!isFinite(v)){
      if(type==='money' && String(raw).trim()==='' && /^goals\.\d+\.amount$/.test(path)) v=0;
      else return;
    }
    if(type==='pct')   v = Math.max(0, Math.min(100, v))/100;
    if(type==='gpct')  v = Math.max(-20, Math.min(20, v))/100;   // signed growth %/yr
    if(type==='money'){ v = Math.max(0, Math.round(v)); e.target.value = v.toLocaleString('en-US'); }
    if(type==='monthlyMoney'){
      const monthly = Math.max(0, Math.round(v));
      v = monthly * 12;
      e.target.value = monthly.toLocaleString('en-US');
    }
    if(type==='num') v = Math.max(1, Math.round(v));
    setPath(plan, path, v);
    // A one-time goal edits a single "at age": mirror it into endAge so the
    // engine's window is exactly that year.
    if(e.target.dataset.sync) setPath(plan, e.target.dataset.sync, v);
    reseedScenarios();
    
    uiState.sharedPaths = null;
    uiState.plansDirty = true;
    renderInputs();
    $('#status').textContent='Plan edited · open Scenarios';
    return;
  }
  // Extra-account balance edit
  const bal = e.target.closest('.acct-bal');
  if(!bal) return;
  const i = +bal.dataset.acctidx;
  const v = Math.max(0, Math.round(parseFloat(String(bal.value).replace(/[^0-9.]/g, '')) || 0));
  if(plan.portfolio.extraAccounts && plan.portfolio.extraAccounts[i]){
    plan.portfolio.extraAccounts[i].balance = v;
    commitPlanEdit();
  }
});

/* ── Household input bindings — delegated on the stable #hh-view ───────────────
   The Household page is an EDITABLE input console. These mirror the #np-content
   handlers above (same setPath write-back + reseed/dirty/plansDirty sequence), but
   re-render the Folio chapters via syncHousehold(). Kept as a separate, isolated
   binding so the Goals/#np-content flow is untouched. `owner`/`bucket` are string
   selects (account labels); everything else matches the shared field types. */
function hhCommit(){
  reseedScenarios(); uiState.sharedPaths=null; uiState.plansDirty=true;
  syncHousehold();
  $('#status').textContent='Plan edited · open Scenarios';
}
$('#hh-view').addEventListener('input', e => {
  if(e.target.dataset.type === 'money' || e.target.dataset.type === 'monthlyMoney') liveCommas(e.target);
});
$('#hh-view').addEventListener('change', e => {
  // Add-account form controls carry no data-path (transient until Save).
  if(!e.target.dataset.path && e.target.classList && e.target.classList.contains('hh-form-type')){
    // Choosing a type prefills the form's ownership from the bank's default
    // (Joint brokerage → Joint, Trust brokerage → Trust) without a re-render.
    const t = HH_ACCOUNT_TYPES[+e.target.value];
    const ownerSel = document.querySelector('#hh-acct-form .hh-form-owner');
    if(t && t.owner && ownerSel) ownerSel.value = t.owner;
    return;
  }
  const path = e.target.dataset.path, type = e.target.dataset.type;
  if(!path) return;
  const raw = e.target.value;
  if(type==='text' || type==='strategy' || type==='owner' || type==='bucket'){   // string writes
    setPath(plan, path, raw);
    hhCommit();
    return;
  }
  // Changing an account's TYPE re-derives its tax bucket from the bank (the
  // bucket is what the engine folds into taxable/traditional/roth).
  if(type==='acctType'){
    setPath(plan, path, raw);
    setPath(plan, path.replace(/\.type$/, '.bucket'), hhBucketForType(raw));
    hhCommit();
    return;
  }
  let v;
  if(type==='money' || type==='monthlyMoney') v = parseFloat(String(raw).replace(/[^0-9.]/g,''));
  else if(type==='risk') v = +raw;
  else                   v = parseFloat(raw);
  if(!isFinite(v)) return;                                   // blank/garbage → no-op
  if(type==='pct')  v = Math.max(0, Math.min(100, v))/100;
  // signedPct: fraction that may be NEGATIVE (e.g. other-income realGrowth —
  // a part-time wind-down phases DOWN in real terms).
  if(type==='signedPct') v = Math.max(-100, Math.min(100, v))/100;
  if(type==='money'){ v = Math.max(0, Math.round(v)); e.target.value = v.toLocaleString('en-US'); }
  if(type==='monthlyMoney'){ const m = Math.max(0, Math.round(v)); v = m*12; e.target.value = m.toLocaleString('en-US'); }
  if(type==='num')  v = Math.max(1, Math.round(v));
  if(type==='age'){
    v = Math.round(v);
    const min = parseFloat(e.target.dataset.min);
    const max = parseFloat(e.target.dataset.max);
    if(isFinite(min)) v = Math.max(min, v);
    if(isFinite(max)) v = Math.min(max, v);
    e.target.value = String(v);
  }
  // BORN (birth year): writes the year AND derives the person's current age —
  // the engine's actual input. 4-digit sanity clamp; age recomputed whole-year.
  if(type==='birthYear'){
    v = Math.round(v);
    if(v < 1900 || v > new Date().getFullYear()) return;
    const age = hhAgeFromYear(v);
    setPath(plan, path, v);
    if(age != null) setPath(plan, path.replace(/\.birthYear$/, '.currentAge'), age);
    hhCommit();
    return;
  }
  // Tangible-asset / mortgage rows write into plan.properties[0|1]; create the
  // slots on first edit so a cleared plan doesn't need preloaded property rows.
  if(/^properties\.[01]\./.test(path)){
    if(!Array.isArray(plan.properties)) plan.properties = [];
    const idx = +path.split('.')[1];
    while(plan.properties.length <= idx){
      plan.properties.push({ name: plan.properties.length === 0 ? 'Primary home' : 'Other property',
        value: 0, purchasePrice: 0, mortgage: { balance: 0, rate: 0, termYears: 0 } });
    }
  }
  setPath(plan, path, v);
  hhCommit();
});
document.querySelector('.page[data-page="household"] .hh-wizard')?.addEventListener('click', e => {
  // Remove an account / asset / liability / income row.
  const rx = e.target.closest('.row-x');
  if(rx){
    const rmpath = rx.dataset.rmpath;
    // Special case: pension benefitByAge key deletion (e.g. "income.pension.benefitByAge.65")
    if(/^income\.pension\.benefitByAge\./.test(rmpath)){
      const age = rmpath.split('.').pop();
      if(plan.income.pension && plan.income.pension.benefitByAge) delete plan.income.pension.benefitByAge[age];
      hhCommit();
      return;
    }
    const ks = rmpath.split('.'); const last = ks.pop();
    let t = plan; for(const k of ks){ if(t==null) return; t=t[k]; }
    if(Array.isArray(t)) t.splice(+last, 1); else if(t!=null) delete t[last];
    hhCommit();
    return;
  }
  // "+ Account / Real asset / Liability / Income source" — push a default row.
  const adder = e.target.closest('[data-add]');
  if(adder){
    const k = ROW_KINDS[adder.dataset.add];
    if(k){
      const arr = getPath(plan, k.arr);
      if(Array.isArray(arr)) arr.push(k.mk()); else setPath(plan, k.arr, [k.mk()]);
      hhCommit();
    }
    return;
  }
  // Household-level actions (co-client toggle, pension ages, account-bank form)
  const act = e.target.closest('[data-hh-action]');
  if(act){
    const action = act.dataset.hhAction;
    if(action === 'add-spouse'){
      plan.household.spouse = { currentAge: 55, retirementAge: 62, birthYear: new Date().getFullYear() - 55 };
      plan.meta.spouseName  = plan.meta.spouseName || '';
      if(!plan.income.socialSecurity.spouse) plan.income.socialSecurity.spouse = { pia: 0, claimAge: 67 };
      plan.meta.filingStatus = 'marriedFilingJointly';
      hhCommit();
    } else if(action === 'remove-spouse'){
      if(!confirm('Remove co-client from this household?')) return;
      plan.household.spouse = null;
      plan.income.socialSecurity.spouse = null;
      plan.meta.filingStatus = 'single';
      hhCommit();
    } else if(action === 'open-account-form'){
      hhAddingKey = null;
      hhAcctFormOwner = act.dataset.owner || 'client';
      syncHousehold();
      const val = document.querySelector('#hh-acct-form .hh-form-val');
      if(val) val.focus();
    } else if(action === 'cancel-account'){
      hhAcctFormOwner = null;
      syncHousehold();
    } else if(action === 'save-account'){
      const form = document.querySelector('#hh-acct-form');
      if(!form) return;
      const t = HH_WIZARD_ACCOUNT_TYPES[+form.querySelector('.hh-form-type').value] || HH_WIZARD_ACCOUNT_TYPES[0];
      const valEl = form.querySelector('.hh-form-val');
      const bal = parseFloat(String(valEl ? valEl.value : '').replace(/[^0-9.]/g, ''));
      if(!isFinite(bal) || bal <= 0){
        if(valEl){ valEl.focus(); valEl.style.outline = '2px solid var(--down)'; setTimeout(() => valEl.style.outline = '', 1500); }
        return;
      }
      const owner = hhAcctFormOwner || 'client';
      if(!plan.portfolio.extraAccounts) plan.portfolio.extraAccounts = [];
      plan.portfolio.extraAccounts.push({ type: t.label, bucket: t.bucket, owner, balance: Math.round(bal) });
      hhAcctFormOwner = null;
      hhCommit();
    } else if(action === 'open-add'){
      hhAddingKey = act.dataset.addKey || null;
      hhDraftLabel = '';
      hhDraftAmount = '';
      hhAcctFormOwner = null;
      syncHousehold();
    } else if(action === 'cancel-add'){
      hhAddingKey = null;
      hhDraftLabel = '';
      hhDraftAmount = '';
      syncHousehold();
    } else if(action === 'commit-add'){
      const label = (document.querySelector('[data-hh-draft="label"]')?.value || hhDraftLabel || '').trim();
      const amtRaw = document.querySelector('[data-hh-draft="amount"]')?.value ?? hhDraftAmount ?? '';
      const amt = parseFloat(String(amtRaw).replace(/[^0-9.]/g, '')) || 0;
      if(hhAddingKey === 'income'){
        if(!plan.income.other) plan.income.other = [];
        plan.income.other.push({ label: label || 'Income', amount: Math.round(amt), startAge: plan.household.primary.retirementAge, endAge: plan.household.primary.planEndAge, realGrowth: 0, taxablePct: 1 });
      } else if(hhAddingKey === 'spending'){
        if(!plan.expenses.extra) plan.expenses.extra = [];
        plan.expenses.extra.push({ label: label || 'Expense', amount: Math.round(amt), startAge: plan.household.primary.retirementAge, endAge: plan.household.primary.planEndAge });
      } else if(hhAddingKey === 'goal'){
        if(!plan.goals) plan.goals = [];
        plan.goals.push({ name: label || 'Goal', amount: 0, startAge: plan.household.primary.retirementAge, endAge: plan.household.primary.planEndAge });
      } else if(hhAddingKey === 'child'){
        const year = parseInt(String(document.querySelector('[data-hh-draft="year"]')?.value ?? hhDraftAmount ?? ''), 10);
        if(!plan.household.children) plan.household.children = [];
        plan.household.children.push({ name: label || 'Child', birthYear: isFinite(year) ? year : new Date().getFullYear() - 10 });
      }
      hhAddingKey = null;
      hhDraftLabel = '';
      hhDraftAmount = '';
      hhCommit();
    } else if(action === 'run-blueprint'){
      hhBlueprintRan = true;
      syncHousehold();
    } else if(action === 'add-home'){
      // Primary home slot: created WITHOUT a mortgage — the mortgage is its own
      // nested add so wizHome() can key its render off structural presence.
      if(!Array.isArray(plan.properties)) plan.properties = [];
      if(!plan.properties[0]) plan.properties[0] = { name:'Primary home', value:0, purchasePrice:0 };
      hhCommit();
    } else if(action === 'add-mortgage'){
      const pr = plan.properties && plan.properties[0];
      if(pr && !pr.mortgage){ pr.mortgage = { balance:0, rate:0, termYears:0 }; hhCommit(); }
    } else if(action === 'step-back'){
      hhStep = Math.max(1, hhStep - 1);
      hhAddingKey = null;
      hhAcctFormOwner = null;
      hhBlueprintRan = false;
      syncHousehold();
    } else if(action === 'step-next'){
      hhStep = Math.min(4, hhStep + 1);
      hhAddingKey = null;
      hhAcctFormOwner = null;
      hhBlueprintRan = false;
      syncHousehold();
    } else if(action === 'goto-planning'){
      const tab = document.querySelector('.htab[data-page="scenarios"]');
      if(tab) tab.click();
    } else if(action === 'add-pension-age'){
      if(!plan.income.pension) plan.income.pension = { benefitByAge:{}, startAge:65, colaPct:0 };
      if(!plan.income.pension.benefitByAge) plan.income.pension.benefitByAge = {};
      const existing = Object.keys(plan.income.pension.benefitByAge).map(Number).sort((a,b)=>a-b);
      const newAge = existing.length ? (existing[existing.length-1]+1) : 65;
      if(!plan.income.pension.benefitByAge[newAge]) plan.income.pension.benefitByAge[newAge] = 0;
      hhCommit();
    }
  }
});

// Pension slider range is PER-HOUSEHOLD: it spans only the ages the advisor has
// actually quoted a benefit for (the keys of benefitByAge). This means the
// slider can never wander onto an age with no number — so it can't silently pay
// $0. Enter a new quote (e.g. age 67) and the slider grows to include it on the
// next render. Falls back to a sane window if nothing is entered yet.
function pensionAges(){
  const m=(plan.income.pension && plan.income.pension.benefitByAge) || {};
  return Object.keys(m).map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
}
// Effective slider range for a lever. Pension is dynamic; everything else is
// the static min/max declared in LEVCFG.
function levRange(cfg){
  if(cfg.key==='pensionAge'){
    const a=pensionAges();
    if(a.length) return { min:a[0], max:a[a.length-1], step:1 };
    return { min:62, max:65, step:1 };
  }
  // Sale lever: min = currentAge−1 (the "Keep" / off state), max = plan end.
  if(cfg.key==='sellAge'){
    const c=plan.household.primary.currentAge, e=plan.household.primary.planEndAge;
    return { min:c-1, max:e, step:1 };
  }
  return { min:cfg.min, max:cfg.max, step:cfg.step };
}

/* ── lever display config (label, formatter, slider range→value & back) ── */
const LEVCFG=[
  {key:'retireAge', name:'Retirement Age', min:55,max:72,step:1, fmt:v=>[v,'']},
  {key:'ssAge',     name:'SS Start Age',   min:62,max:70,step:1, fmt:v=>[v,'']},
  // All dollar levers render full digits with comma grouping — no abbreviations.
  // The advisor wants to see the exact number they're proposing, not a rounded
  // shorthand. Step values stay round so the slider snaps cleanly.
  // Spending is stored ANNUAL (the engine's unit) but shown/edited MONTHLY —
  // clients know their monthly number off-hand. edit:'monthly' wires the box.
  {key:'spend',     name:'Lifestyle Spending',min:80000,max:360000,step:1200, edit:'monthly', fmt:v=>['$'+Math.round(v/12).toLocaleString('en-US'),'/mo']},
  // One-time event carries BOTH an amount and an age; edit:'event' renders the
  // two type-in boxes (amount + age) alongside the amount slider.
  {key:'eventAmt',  name:'One-Time Event', min:0,max:500000,step:5000, edit:'event', fmt:(v,L)=>['$'+(v||0).toLocaleString('en-US'),'@ '+L.eventAge]},
  {key:'risk',      name:'Allocation',     min:1,max:5,step:1, fmt:v=>[RISK_LABELS[v],'']},
  {key:'savings',   name:'Savings / yr',   min:0,max:200000,step:1000, edit:'money', fmt:v=>['$'+v.toLocaleString('en-US'),'/yr']},
  // Pension snaps between the ages that actually have entered amounts (62, 65).
  // Label shows the dollar value the engine will pay for that age — if no entry
  // exists for that age, it shows "—" (and the engine pays 0).
  // Pension claim age. Range spans the realistic window; the displayed dollar
  // amount comes from whatever the advisor has entered for that exact age.
  // No entry yet → the value spot becomes an inline input (handled in
  // the Scenarios view layer, not here). This is the truth-source contract surfacing
  // naturally as a UI affordance: "we don't have a number for this age, give
  // us one." Not an error — just the next input.
  {key:'pensionAge', name:'Pension',       min:55,max:70,step:1, fmt:v=>{
    const m=(plan.income.pension && plan.income.pension.benefitByAge) || {};
    const amt=m[v]; return (amt && amt>0) ? ['$'+amt.toLocaleString('en-US'),'@ '+v] : ['__needs__', v];
  }},
];
// Earmarked-asset sale lever — only shown when there's a property to sell. A
// discrete stepper: "Keep" (off) → a sale age. Net proceeds (value − mortgage −
// commission − cap-gains) flow into the portfolio via the assetSale override, so
// you can stand a "sell at 72" column next to a "keep" Baseline. (See engine.js.)
if(plan.properties && plan.properties.length && plan.properties[0]){
  LEVCFG.push({
    key:'sellAge', name:'Sell '+(plan.properties[0].name||'asset'),
    min:0, max:120, step:1,                              // real range is dynamic (levRange)
    fmt:v => (v <= plan.household.primary.currentAge-1) ? ['Keep',''] : ['age '+v,'']
  });
}

let running=false;
// Cached market bundle. Generated once, reused across Runs so that hitting Run
// twice with no changes yields the EXACT same numbers (sampling noise was
// causing the % to drift between identical clicks). Invalidated to null
// whenever the plan changes in the Inputs tab.

/* ── run the engine for all three columns (shared nothing; each its own MC) ── */
// ONE seeded bundle of return paths, shared by every surface that compares
// runs (scenario columns, the goals page's per-goal cost runs). Identical
// markets across runs make any difference a pure decision-effect, and the
// fixed seed keeps an unchanged plan at an identical % between Runs.
function ensureSharedPaths(){
  const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
  if(!(horizon > 0)) return null;
  const iters = plan.simulation.iterations;
  if(!sharedPaths || sharedPaths.length !== iters || sharedPaths[0].length !== horizon){
    resetSeed(pathReplay.seed);
    uiState.sharedPaths = [];
    for(let i=0;i<iters;i++) uiState.appendSharedPath(generateReturnPath(horizon));
  }
  return sharedPaths;
}
/* ── Historical Stress (Focus rail) ───────────────────────────────────────
   Five canonical sequence-of-returns eras (design handoff → Focus → Historical
   Stress). Each scenario is sequenced through an era the SAME way the
   Sequencing tab does it: stand the household at its retirement age with the
   median projected balance (retireNowClone), then replay the real historical
   series from that start year (the engine WRAPS past 2025 so recent eras still
   get a full retirement horizon). `y` is the real start year fed to the engine;
   `year` is the display label — the late-70s high-inflation shock is shown as
   the decade "1970s" but sequenced from a concrete 1977 start. */
const STRESS_ERAS = [
  { y: 1966, year: '1966',  name: 'Stagflation' },
  { y: 1973, year: '1973',  name: 'Oil shock' },
  { y: 2000, year: '2000',  name: 'Dot-com' },
  { y: 2008, year: '2008',  name: 'Global Financial Crisis' },
  { y: 1977, year: '1970s', name: 'High inflation' },
];
// Pass vs Marginal for ONE historical sequence — fully engine-derived (Engine
// Truth: the card never invents an outcome). Pass = the plan funded the entire
// horizon (never depleted) AND cleared the sequence-risk window with non-negative
// real growth across the first retirement decade, where sequence risk lives.
// A depletion or a negative first decade reads as Marginal; the design has no
// "Fail" tier, so Marginal is the most severe state the card shows.
function eraPasses(h){
  if(!h || h.failed) return false;
  if(h.first10Supports === false) return false;
  return true;
}
// Sequence one scenario (plan clone + overrides) through every era. Reuses the
// scenario's freshly-computed envelope so the retirement entry balance matches
// the Scenarios / Sequencing tabs exactly (one shared-path truth, not a re-roll).
function computeHistoricalStress(s, p, ov){
  const curAge     = plan.household.primary.currentAge;
  const retAge     = (s.lev.retireAge != null) ? s.lev.retireAge : p.household.primary.retirementAge;
  const accumYears = Math.max(0, retAge - curAge);
  const rp    = retireNowClone(p, ov, curAge, retAge, accumYears, s.res && s.res.envelope);
  // Guard: ensure rp has a valid risk profile so resolveInputs doesn't throw on
  // RISK_PROFILES[undefined].eq. A stale localStorage save can carry an invalid
  // risk lever; fall back to the base plan's profile (or Moderate = 3).
  if (!RISK_PROFILES[rp.portfolio.riskProfile]) {
    rp.portfolio.riskProfile = (p.portfolio.riskProfile in RISK_PROFILES)
      ? p.portfolio.riskProfile : 3;
  }
  const strat = normalizePlaybackStrategy(p.portfolio.withdrawalStrategy, PB_STRATS);
  const ov2   = { ...ov, retireDelay: 0 };   // retirement age is baked into the clone
  // Wrap each era individually: a single failing era must not blank the whole card.
  // null entries are filtered out; if any eras succeed the card renders those rows.
  const results = STRESS_ERAS.map(e => {
    try {
      const h = runHistoricalPath(rp, e.y, strat, undefined, ov2);
      return { year: e.year, name: e.name, pass: eraPasses(h) };
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
  return results;
}
function runAll(){
  if(running) return; running=true;
  const btn=$('#run-btn'); btn.disabled=true; $('#status').textContent='Running…';
  setTimeout(()=>{
    try{
      // SHARED PATHS: one bundle of return paths, reused across scenarios AND
      // across Runs. Within a Run, every column sees the SAME markets (any
      // difference between columns is the DECISION). Across Runs, the bundle
      // is cached so identical inputs give an identical % — no noise drift.
      const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
      const iters = plan.simulation.iterations;
      // Degenerate plan guard: a non-positive horizon (plan-end age at/below
      // current age) can't be simulated. Surface a clear reason and bail
      // WITHOUT nuking the last good results, so the views don't go blank.
      if(!(horizon > 0)){
        $('#status').textContent='Check plan: end age must be after current age';
        btn.disabled=false; running=false; return;
      }
      ensureSharedPaths();
      // Isolate each scenario: one bad column (e.g. an out-of-range saved lever)
      // must not abort the whole Run and blank every other column + the cash
      // flow drawer. Failed scenarios get res=null and are skipped downstream.
      let failed=0;
      const baseTaxYear = new Date().getFullYear();
      scenarios.forEach(s=>{
        try{
          const p=planForScenario(s.lev);
          const ov=leversToOverrides(s.lev);
          s.res=runSimulation(p, ov, sharedPaths);
          // Re-run only the selected p10/p50/p90 story paths with federal row
          // taxes, then attach auditable summaries. MC aggregates stay shortcut.
          try{
            const taxOptions = {
              baseTaxYear,
              scenarioId: s.name,
              filingStatus: p.meta?.filingStatus,
            };
            const federalResult = rerunTypicalPathWithFederalTax(s.res, taxOptions);
            federalResult.pathFederalTax = Object.fromEntries(
              ['p10', 'p50', 'p90'].map((pathKey) => [
                pathKey,
                attachPathFederalTax(federalResult, pathKey, taxOptions),
              ])
            );
            federalResult.typicalPathFederalTax = federalResult.pathFederalTax.p50;
            s.res = federalResult;
          }catch(taxErr){
            s.res.typicalPathFederalTax = null;
            s.res.pathFederalTax = null;
            console.warn('Federal story-path rerun failed:', s.name, taxErr);
          }
          // Historical Stress (Focus rail): engine-derived per-scenario eras.
          // Isolated so a stress hiccup never blanks the scenario's main result.
          try{ s.res.stress = computeHistoricalStress(s, p, ov); }
          catch(stressErr){ s.res.stress = []; console.warn('Historical stress failed:', s.name, stressErr); }
        }catch(err){ s.res=null; failed++; console.error('Scenario failed:', s.name, err); }
      });
      renderSolvePanel(); buildSeqSelect(); runSeq();
      if(window.ScenariosUI) window.ScenariosUI.sync();   // one authoritative Scenarios renderer
      $('#status').textContent = failed ? `Complete · ${failed} scenario${failed>1?'s':''} could not run` : 'Complete';
    }catch(e){ $('#status').textContent='Error'; console.error(e); }
    btn.disabled=false; running=false;
  },20);
}

// ScenariosUI toolbar to the existing addScenario() and solver (renderSolvePanel)
// seams. Per-scenario rename/remove returns via the new view's menu in a later pass.
// removeScenario() / resetScenarios() remain available for that wiring.
// Solver goal form lives in #solve-panel (full-width). Live commas on $ boxes;
// changing the pin dropdown re-renders its value input (age box vs $ box).
$('#solve-panel').addEventListener('input', e=>{
  if(e.target.classList?.contains('sf-money')) liveCommas(e.target);
});
$('#solve-panel').addEventListener('change', e=>{
  if(e.target.id === 'sf-goal'){
    const baseLev = scenarios.find(s=>s.base)?.lev || defaultLevers();
    const baseSucc = scenarios.find(s=>s.base)?.res?.successRate || 85;
    const defPct = Math.min(95, Math.ceil((baseSucc+1)/5)*5);
    const wrap = $('#sf-params');
    if(wrap) wrap.innerHTML = goalParamsHtml(e.target.value, baseLev, defPct, { goals:GOALS, currentAge:plan.household.primary.currentAge });
  }
});
$('#solve-panel').addEventListener('submit', e=>{
  const f = e.target.closest('#solver-form');
  if(!f) return;
  e.preventDefault();
  const pct = parseFloat($('#sf-pct')?.value);
  if(!isFinite(pct) || pct<50 || pct>99) return;
  const goalType = $('#sf-goal')?.value || 'confidence';
  const num = id => parseInt(($(id)?.value||'').replace(/[^0-9]/g,''), 10);
  const params = { pct };
  const {currentAge, planEndAge} = plan.household.primary;
  const flashAge = id => { const el=$(id); if(el){ el.style.outline='2px solid var(--negative)'; el.focus(); setTimeout(()=>el.style.outline='',1500); } };
  if(goalType==='retire'){
    params.age = num('#sf-p-age');
    if(!isFinite(params.age)) return;
    if(params.age <= currentAge || params.age > planEndAge){ flashAge('#sf-p-age'); return; }
  } else if(goalType==='purchase'){
    params.amount = num('#sf-p-amount'); params.age = num('#sf-p-age');
    if(!isFinite(params.amount)||!isFinite(params.age)) return;
    if(params.age <= currentAge || params.age > planEndAge){ flashAge('#sf-p-age'); return; }
  } else if(goalType==='gift'){
    params.amount = num('#sf-p-amount'); params.toAge = num('#sf-p-toage');
    if(!isFinite(params.amount)||!isFinite(params.toAge)) return;
    if(params.toAge <= currentAge || params.toAge > planEndAge){ flashAge('#sf-p-toage'); return; }
  } else if(goalType==='legacy'){
    params.amount = num('#sf-p-amount'); if(!isFinite(params.amount)) return;
  }
  runSolve(goalType, params);
});
// Solver panel: Cancel (form), Clear (results), and per-lever "Load" actions.
document.addEventListener('click', e=>{
  if(e.target.closest('#sf-cancel')){
    uiState.solverFormOpen = false; renderSolvePanel(); return;
  }
  if(e.target.closest('#solve-clear-btn')){
    uiState.solverResults = null; uiState.solverSearching = false;
    uiState.comboResults = null; uiState.comboOpen = false; uiState.comboSearching = false;
    renderSolvePanel(); return;
  }
  // Fold-down: open runs the (heavy) combo search once and caches it; toggle off
  // just collapses. The cache is reused on re-open until the solo solve changes.
  if(e.target.closest('#combo-toggle')){
    uiState.comboOpen = !comboOpen;
    if(comboOpen && !comboResults && !comboSearching) runComboSolve();  // renders itself
    else renderSolvePanel();
    return;
  }
  const loadBtn = e.target.closest('.solve-load');
  if(loadBtn && solverResults && solverResults.rows){
    if(scenarios.length >= MAX_SCENARIOS) return;
    const idx = +loadBtn.dataset.soloIdx;
    const row = solverResults.rows[idx];
    if(!row) return;
    // Scenario = the pinned soloBase with this one lever set to its solo answer.
    const lev = JSON.parse(JSON.stringify(solverResults.soloBase));
    lev[row.key] = row.value;
    syncPension(lev);
    const cfg = LEVCFG.find(c=>c.key===row.key);
    uiState.addScenario({ name: `${cfg.name} solve`, base:false, lev, res:null });
    uiState.solverResults = null; uiState.solverSearching = false;
    uiState.comboResults = null; uiState.comboOpen = false;
    saveScenarios(); renderSolvePanel(); uiState.plansDirty=true; runAll();
  }
  // Load a COMBO: the held-fixed soloBase with both lever moves applied.
  const cLoadBtn = e.target.closest('.cc-load');
  if(cLoadBtn && comboResults && comboResults.combos){
    if(scenarios.length >= MAX_SCENARIOS) return;
    const c = comboResults.combos[+cLoadBtn.dataset.comboIdx];
    if(!c) return;
    const lev = JSON.parse(JSON.stringify(comboResults.soloBase));
    c.items.forEach(m => lev[m.key] = m.val);
    syncPension(lev);
    const nm = comboResults.goalType==='retire' ? `Retire ${comboResults.params.age}`
             : c.items.map(m=>COMBO_SHORT[m.key]).join(' + ');
    uiState.addScenario({ name: nm.slice(0,28), base:false, lev, res:null });
    uiState.solverResults = null; uiState.solverSearching = false;
    uiState.comboResults = null; uiState.comboOpen = false;
    saveScenarios(); renderSolvePanel(); uiState.plansDirty=true; runAll();
  }
});
const GRID='var(--grid)', AXIS_INK='var(--axis)';
function simByIndex(res, idx){
  if(!res || !Array.isArray(res.sims)) return null;
  return res.sims.find(s => s.simIndex === idx) || res.sims[idx] || null;
}
function baselineResult(){
  return (scenarios.find(s=>s.base) || scenarios[0] || {}).res || null;
}




/* ── Path Story ───────────────────────────────────────────────────────────
   The baseline run's selected coherent path, told as a statement. The same
   selected sim the cash-flow drawer replays (selectedPathIndex), digested by
   the engine (pathDigest) — the prose here and the table below are two views
   of one path. Pure formatting of engine fields; no UI math. */
const TAX_SOURCE_LABELS = {
  socialSecurity:'Social Security', otherIncome:'other income',
  traditional:'Traditional withdrawals', taxable:'capital gains'
};
function renderStory(){
  const el = $('#story-panel'); if(!el) return;
  const res = baselineResult();
  if(!res || !Array.isArray(res.sims) || !res.sims.length){ el.innerHTML=''; return; }
  const sim = simByIndex(res, selectedPathIndex());
  if(!sim){ el.innerHTML=''; return; }
  const d = pathDigest(sim);
  const pc = v => (v>=0?'+':'−') + Math.abs(v*100).toFixed(1) + '%';
  const endAge = sim.rows.length ? sim.rows[sim.rows.length-1].age : '';
  const endStat = d.failed
    ? `<b>${fmtM(0)}</b><i>depleted at age ${d.depletionAge}</i>`
    : `<b>${fmtM(d.endBalance)}</b><i>ends at age ${endAge}</i>`;
  const picks = [['stressed','Stressed'],['typical','Median'],['favorable','Favorable']]
    .map(([m,l]) => `<button class="${pathReplay.mode===m?'on':''}" data-story-mode="${m}">${l}</button>`).join('');
  const verb = d.first10Supports ? 'cooperate' : 'push back';
  const reads = [
    [pc(d.first10Cagr), 'Market sequence',
     `The first 10 years ${d.first10Supports?'support':'work against'} the plan. ${d.negEarlyYears} of the first ${d.earlyWindowYears} ${d.negEarlyYears===1?'year is':'years are'} negative.`],
    [d.avgWdRate.toFixed(1)+'%', 'Spending pressure',
     `Average withdrawal pressure is ${d.avgWdRate.toFixed(1)}% across ${d.withdrawalYears} withdrawal years${d.peakWdAge!=null?` — the peak year touches ${d.peakWdRate.toFixed(1)}% at age ${d.peakWdAge}`:''}.`],
    [fmtM(d.avgTax)+'/yr', 'Tax + sourcing',
     `${TAX_SOURCE_LABELS[d.dominantTaxSource]||'Withdrawals'} drive ${Math.round(d.dominantTaxShare*100)}% of the ${fmtM(d.lifetimeTax)} lifetime tax bill.`]
  ].map(([b,h,t]) => `<div class="story-read"><b>${b}</b><div><span class="rd-h">${h}</span><span class="rd-b">${t}</span></div></div>`).join('');
  el.innerHTML = `
    <div class="story-sec"><span>Path Story · ${escHtml((scenarios.find(s=>s.base)||scenarios[0]||{}).name||'Base plan')}</span></div>
    <div class="story-pick"><span class="pk-l">Path:</span>${picks}
      <span class="pk-note">selected from ${res.sims.length.toLocaleString('en-US')} simulated paths · not a forecast</span></div>
    <div class="story-head">${(d.realCagr*100).toFixed(1)}% real growth, year over year, along this path.</div>
    <div class="story-sub">Return timing matters most while withdrawals are active — and these first ten years ${verb}.</div>
    <div class="story-stats">
      <div class="story-stat"><b>${fmtM(d.startBalance)}</b><i>starts the plan</i></div>
      <div class="story-stat">${endStat}</div>
      <div class="story-stat"><b>${pc(d.first10Cagr)}</b><i>first decade, real</i></div>
      <div class="story-stat"><b>${d.avgWdRate.toFixed(1)}%</b><i>avg withdrawal · peak ${d.peakWdRate.toFixed(1)}%</i></div>
      <div class="story-stat"><b>${fmtM(d.avgTax)}</b><i>tax per year, avg</i></div>
    </div>
    <hr class="story-rule">
    <div class="story-chart-l">Balance path · ${pathModeLabel().toUpperCase()} · ages ${sim.rows.length?sim.rows[0].age:''}–${endAge}</div>
    <div class="story-chart">${storyChart(sim.rows,{ layout: CHART_LAYOUT.storyPath, fmtM })}</div>
    <div class="story-sec"><span>What shapes this outcome</span></div>
    ${reads}`;
  el.querySelectorAll('[data-story-mode]').forEach(b => b.onclick = () => {
    pathReplay.mode = b.dataset.storyMode;
    savePathReplay(); syncPathControls(); if(window.ScenariosUI) window.ScenariosUI.sync(); renderStory();
  });
}

/* ── Plan Assessment ──────────────────────────────────────────────────────
   assessPlan() ids + figures mapped to fixed, factual sentences in a
   two-column ledger. The engine decides what applies; the UI only words it. */
function renderAssess(){
  const el = $('#assess-panel'); if(!el) return;
  const res = baselineResult();
  if(!res || !res.paths){ el.innerHTML=''; return; }
  const a = assessPlan(res);
  const pct1 = v => (v*100).toFixed(1)+'%';
  const SENT = {
    'low-fixed-spending':       v => ['Low fixed spending — core spend vs starting assets', pct1(v)],
    'tax-diversified':          v => ['Tax-diversified mix — account types carrying weight', `${v} of 3`],
    'high-success':             v => ['High success rate — paths lasting the full horizon', Math.round(v)+'%'],
    'withdrawal-load':          v => [`Withdrawal load — average ${v.avg.toFixed(1)}%, peak at age ${v.age}`, v.peak.toFixed(1)+'%'],
    'portfolio-funded-spending':v => ['Portfolio-funded spending — guaranteed income covers', pct1(v)],
    'return-timing':            v => [`Return timing — stressed path depletes${v.stressedDepletionAge?` at age ${v.stressedDepletionAge}`:''}, median survives`, 'path-dependent']
  };
  const row = it => {
    const [label, val] = (SENT[it.id] || (x=>[it.id, '']))(it.value);
    return `<div class="led-row"><span>${label}</span><span class="dots"></span><b>${val}</b></div>`;
  };
  const left  = a.strengths.map(row).join('') || `<div class="led-none">Nothing clears the bar on this run.</div>`;
  const right = [...a.pressures, ...a.tossups].map(row).join('') || `<div class="led-none">No pressure points on this run.</div>`;
  el.innerHTML = `
    <div class="story-sec"><span>Plan Assessment · what the engine sees</span></div>
    <div class="ledger">
      <div><h5>Working for the plan</h5>${left}</div>
      <div><h5>Working against it</h5>${right}</div>
    </div>`;
}

// REMOVED the original multi-scenario renderCashflow grid (superseded below by
// the cf-mode override, and now by the single ScenariosUI Cash Flow renderer).

/* ── SEQUENCING tab — same returns, different ORDER ──────────────────────────
   The tab's single job: isolate the ORDER of returns. We take one REAL
   historical return stream and run the SAME plan through it forward vs exactly
   reversed (identical returns, opposite sequence). Any difference is pure
   sequence-of-returns risk. Every number on this tab is a direct read of the
   engine's single-path result; the UI computes no balances or metrics. */
// The Sequencing tab holds ONE plan fixed and runs it through several REAL
// retirement markets — never a reversed/counterfactual timeline. The lesson is
// the truth a client actually faces: retire into a brutal market vs a kind one,
// same plan, and watch the spread. A LIBRARY of real markets the advisor can
// toggle on/off as lines (`on` = shown by default). Euphoric bulls (1982/85) are
// deliberately omitted — a 10-20x winner crushes the scale and hides the
// downside, which is the whole point of a sequence-risk view.
// Distinct but DEEP, desaturated editorial tones — each line identifiable, none
// candy-bright. Picked to be maximally distinct from each other on the ground.
const SEQ_YEARS=[
  {y:1929, tag:'Great Depression',  c:'#c6a662', on:false},
  {y:1966, tag:'the lost decade',   c:'#8b94a8', on:true },
  {y:1973, tag:'stagflation',       c:'#cd9a52', on:true },
  {y:1987, tag:'Black Monday',      c:'#b08f4e', on:false},
  {y:1995, tag:'the 90s boom',      c:'#8fa57e', on:true },
  {y:2000, tag:'dot-com crash',     c:'#c0795f', on:true },
  {y:2008, tag:'financial crisis',  c:'#9a8fb0', on:false},
  {y:2009, tag:'the recovery bull', c:'#d8c084', on:false},
];

// REMOVED the cf-mode renderCashflow override — the renderer that showed the
// engine-vs-federal diagnostic tax columns. The single authoritative Cash Flow
// renderer now lives in the ScenariosUI view layer (one renderCashflow), with the
// advisor-facing Tax column mapping the federal sidecar (typical path) or the
// engine row tax — no diagnostic comparison columns.

function buildSeqSelect(){
  const sel=$('#seq-select'), cur=sel.value;
  sel.innerHTML=scenarios.map(s=>`<option>${escHtml(s.name)}</option>`).join('');
  if(cur && scenarios.some(s=>s.name===cur)) sel.value=cur;
  sel.onchange=runSeq;
  buildSeqChips();
}
// Market chips double as the selector AND the legend: lit = shown as a line.
function buildSeqChips(){
  const box=$('#seq-chips'); if(!box) return;
  box.innerHTML=SEQ_YEARS.map((m,i)=>
    `<button class="seq-chip${m.on?' on':''}" data-i="${i}"><span class="cdot" style="background:${m.c}"></span>${m.y} · ${m.tag}</button>`).join('');
  box.querySelectorAll('.seq-chip').forEach(btn=>btn.onclick=()=>{
    const m=SEQ_YEARS[+btn.dataset.i];
    if(m.on && SEQ_YEARS.filter(x=>x.on).length<=1) return;   // keep at least one line
    m.on=!m.on; buildSeqChips(); runSeq();
  });
}
// Build a "retire-now" clone: the household standing at its retirement age with
// the plan's MEDIAN projected balance (read from the engine envelope, not
// invented). Every real market then runs from this ONE shared starting point, so
// the only thing differing between lines is the market — not the entry balance.
function retireNowClone(p, ov, curAge, retAge, accumYears, envelope){
  // `envelope` is the chosen scenario's already-computed envelope, passed in
  // from runSeq. Reusing it (a) keeps the sequencing entry balance IDENTICAL to
  // the Scenarios tab — both read the same shared-path run — and (b) avoids
  // re-running a full Monte Carlo on every chip toggle. Fall back to a
  // shared-path run only if the scenario hasn't been computed yet.
  const env = envelope || (runSimulation(p, ov, sharedPaths) || {}).envelope;
  const accs=p.portfolio.accounts;
  const tot=accs.taxable.balance+accs.traditional.balance+accs.roth.balance;
  const entry=(env && env[accumYears] && env[accumYears].p50!=null) ? env[accumYears].p50 : tot;
  const rp=JSON.parse(JSON.stringify(p));
  const ra=rp.portfolio.accounts;
  if(tot>0){ const f=entry/tot; ra.taxable.balance*=f; ra.traditional.balance*=f; ra.roth.balance*=f; }
  else { ra.taxable.balance=entry; }
  rp.household.primary.currentAge=retAge;          // standing at retirement → no accumulation phase
  rp.household.primary.retirementAge=retAge;
  if(rp.household.spouse && rp.household.spouse.currentAge!=null)
    rp.household.spouse.currentAge += (retAge-curAge);
  return rp;
}
function runSeq(){
  const sel=$('#seq-select'); const s=scenarios.find(x=>x.name===sel.value)||scenarios[0];
  // Sequence the chosen scenario FAITHFULLY: allocation via the plan clone, every
  // other lever via the same overrides mapping the Scenarios tab uses.
  const p=planForScenario(s.lev);
  const ov=leversToOverrides(s.lev);
  const strat=normalizePlaybackStrategy(p.portfolio.withdrawalStrategy, PB_STRATS);
  const curAge=plan.household.primary.currentAge;
  const retAge=(s.lev.retireAge!=null?s.lev.retireAge:p.household.primary.retirementAge);
  const accumYears=Math.max(0, retAge-curAge);
  const rp=retireNowClone(p, ov, curAge, retAge, accumYears, s.res && s.res.envelope);
  const ov2={...ov, retireDelay:0};                // retirement age is baked into the clone now
  const historicalTaxOptions={
    baseTaxYear:new Date().getFullYear(),
    filingStatus:rp.meta?.filingStatus,
    scenarioId:`sequencing_${s.name}`,
  };
  const runs=SEQ_YEARS.filter(m=>m.on)
                      .map(m=>({m, res:runHistoricalPathWithFederalTax(rp, m.y, strat, undefined, ov2, historicalTaxOptions)}))
                      .filter(r=>r.res && r.res.rows.length);
  if(!runs.length){ $('#seq-svg').innerHTML=''; $('#seq-prints').innerHTML=''; return; }
  drawSeqChart($('#seq-svg'), runs, retAge, seqChartSvg, { grid:GRID, axisInk:AXIS_INK });
  renderPrints($('#seq-prints'), runs, pathDigest);
  seqContext={rp, strat, ov2, historicalTaxOptions};
  renderPlaybackCurrent();
  const n=runs.length;
  $('#seq-sub').textContent='Same plan, real markets';
}

// Path fingerprint — facts read straight off the engine result. One card per real
// market: the first-decade return (the sequence-risk cause), the lowest the
// portfolio fell, and the outcome. No invented composite "score".


/* ── Playback ─────────────────────────────────────────────────────────────
   One retirement start year, replayed against the real record. The verdict
   is a sentence; the comparison runs the SAME return sequence through the
   three sourcing orders (only the order varies — an allowed comparison);
   the year-by-year table is the engine's rows, behind an advisor toggle.
   Era labels are a static lookup for context only — no math. */
const ERA_LABELS=[
  [1928,1932,'crash & depression'],[1933,1945,'depression & war'],
  [1946,1965,'postwar boom'],[1966,1972,'stagnation sets in'],
  [1973,1974,'oil shock'],[1975,1981,'stagflation'],
  [1982,1999,'the long bull'],[2000,2002,'dot-com bust'],
  [2003,2007,'mid-cycle expansion'],[2008,2009,'financial crisis'],
  [2010,2019,'recovery bull'],[2020,2020,'pandemic'],
  [2021,2021,'reopening'],[2022,2022,'rate shock'],[2023,2025,'late-cycle bull']
];
const eraFor=y=>{ const e=ERA_LABELS.find(([a,b])=>y>=a&&y<=b); return e?e[2]:''; };
const PB_STRATS=[['taxable-first','Taxable first'],['proportional','Proportional'],['traditional-first','Traditional first']];

let playbackYear=1973, pbDetailOpen=false, seqContext=null;
function renderPlaybackCurrent(){
  renderPlayback({
    el:$('#playback-panel'), seqContext, playbackYear, pbDetailOpen,
    sequenceYears:SEQ_YEARS, playbackStrategies:PB_STRATS,
    runHistoricalPath:(...args)=>runHistoricalPathWithFederalTax(...args, seqContext?.historicalTaxOptions), pathDigest, eraFor,
    setPlaybackYear:value=>{ playbackYear=value; },
    togglePlaybackDetail:()=>{ pbDetailOpen=!pbDetailOpen; },
    rerender:renderPlaybackCurrent,
  });
}


/* ── tab switch + boot ── */
$$('.htab').forEach(t=>t.onclick=()=>{
  $$('.htab').forEach(x=>x.classList.remove('on'));
  $$('.page').forEach(x=>x.classList.remove('on'));
  if(t.dataset.subTarget){
    activeSub = t.dataset.subTarget;
    try { localStorage.setItem(SUB_KEY, activeSub); } catch {}
  }
  t.classList.add('on'); $(`.page[data-page="${t.dataset.page}"]`).classList.add('on');
  document.body.classList.toggle('scn-active', t.dataset.page==='scenarios');
  // Returning to Scenarios after a base-plan edit re-runs the engine so the
  // columns reflect the new source; otherwise just redraw.
  if(t.dataset.page==='scenarios'){ if(plansDirty){ uiState.plansDirty=false; runAll(); } }
  if(t.dataset.page==='sequencing') runSeq();
  if(t.dataset.page==='net-worth') renderInputs();
  if(t.dataset.page==='household') syncHousehold();
});
// Net Worth sub-nav: switch the active sub-page, persist, re-render.
$$('#np-subnav .stab').forEach(b => b.onclick = () => {
  activeSub = b.dataset.sub;
  try { localStorage.setItem(SUB_KEY, activeSub); } catch {}
  renderInputs();
});
$('#run-btn').onclick=runAll;
// Manual SAVE: persist the FULL current input state (plan snapshot + the
// scenario levers, which also self-save eagerly). Confirmation is real —
// a failed storage write shows a retry state, never a fake "saved".
let saveConfirmTimer=null;
$('#save-btn').onclick=()=>{
  const ok=savePlan();
  saveScenarios();
  if(!ok){ saveFailed=true; syncSaveBtn(); $('#status').textContent='Save failed \u00b7 storage blocked or full'; return; }
  saveFailed=false; planSaveDirty=false;
  syncSaveBtn('confirm');
  $('#status').textContent='Plan saved';
  clearTimeout(saveConfirmTimer);
  saveConfirmTimer=setTimeout(syncSaveBtn, 1400);
};

$('#path-mode').onchange=e=>{
  updatePathReplayMode(e.target.value);
  syncPathControls();
  if(window.ScenariosUI) window.ScenariosUI.sync();
};
// Cash Flow is now an explicit view inside the ScenariosUI view layer (the
// Compare/Focus/Cash-Flow renderer at the end of this script). The old
// cf-mode sidebar (cfMode / cfPrimary / cfCompare / renderCfSidebar / setCfMode
// + #cf-mode-btn) was removed with its markup; the toolbar's Cash Flow chip and
// the per-view scenario selector replace it.

/* ===========================================================================
   ScenariosUI — the single Scenarios view layer (Compare / Focus / Cash Flow).
   Presentation only: it formats and selects numbers PRODUCTION already produced
   (scenarios, s.res, s.lev, path replay, s.res.pathFederalTax). It never
   computes a planning/projection/RMD/withdrawal/success-rate/tax number.
   The PROD object is the only coupling to production; it reads module symbols
   directly (this IIFE shares the module scope).
   =========================================================================== */
(function () {
  'use strict';

  function openSolver(){
    uiState.solverFormOpen = true;
    renderSolvePanel();
    const p = document.getElementById('solve-panel');
    if(p) p.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  let _selectedId = null;

  const PROD = {
    scenarios:    () => scenarios,
    getSelectedId:() => _selectedId,
    setSelectedId:(id) => { _selectedId = id; },
    addScenario:  () => { addScenario(); },
    solve:        () => openSolver(),
    afterEngineAction: () => {},      // addScenario already runs runAll()→sync; solver opens a form
    isTypicalPath:() => pathReplay.mode === 'typical',
    id:        (s) => String(scenarios.indexOf(s)),
    name:      (s) => s.name,
    prob:      (s) => s.res && s.res.successRate,
    median:    (s) => { const e = s.res && s.res.envelope; return (e && e.length) ? e[e.length - 1].p50 : null; },
    range:     (s) => {
      const t = s.res && s.res.terminal; if(!t) return null;
      const e = s.res.envelope, p50 = (e && e.length) ? e[e.length - 1].p50 : (t.p50 != null ? t.p50 : null);
      const lo = t.p10, hi = t.p90;
      const medianPct = (lo != null && hi != null && hi > lo && p50 != null)
        ? Math.max(0, Math.min(100, (p50 - lo) / (hi - lo) * 100)) : 50;
      return { lo, hi, medianPct };
    },
    viability: (s) => viabilityString(s),
    isBaseline:(s) => !!s.base,
    levers:    (s) => leversFor(s),
    goals:     (s) => goalsVM(s),
    stress:    (s) => (s.res && s.res.stress) || [],   // populated by computeHistoricalStress in runAll (engine-derived)
    pathRows:  (s) => buildPathRows(s, {
      simByIndex, baselineResult, plan,
      currentYear: new Date().getFullYear(),
    }),
    cashSummary: (s) => buildCashSummary(s, {
      simByIndex, baselineResult, pathDigest,
    }),
    typicalPathFederalTax: (s) => s.res && s.res.typicalPathFederalTax,
    pathFederalTax: (s) => {
      const pathKey = pathReplay.mode === 'favorable' ? 'p90'
        : pathReplay.mode === 'typical' ? 'p50'
        : (pathReplay.mode === 'stressed' || pathReplay.mode === 'sequence-stress') ? 'p10'
        : null;
      return pathKey ? s.res?.pathFederalTax?.[pathKey] : null;
    },
    householdName: () => (plan.meta && (plan.meta.primaryName || plan.meta.household)) || '',
  };

  /* ---- presentation helpers (formatting + color only) --------------------- */

  
  
  function fmtMoney(n) {
    if (n == null || n <= 0) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  
  
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  
  // Cash-flow table WD column: slate under 5%, then coral/rust only — no amber
  // or gold tones (those compete with accent gold elsewhere in the UI).
  
  
  const CHECK = (sw, s) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 15 15" fill="none"><path d="M3 7.5 L6 10.5 L12 4" stroke="#8fa57e" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  const DOWN_TRI = '<svg width="8" height="8" viewBox="0 0 9 9" fill="#c0795f"><path d="M4.5 8 L0.5 2 L8.5 2 Z"></path></svg>';

  // Age-specific viability string per the design spec:
  //   "Funds last to age X"     — plan survives the median path
  //   "Shortfall risk after age X" — median path depletes before plan end
  // Reads the typical (p50) path from the scenario's already-computed results.
  // Pure presentation: no engine math, no re-simulation.
  function viabilityString(s) {
    if (!s.res) return '';
    const planEnd = plan.household.primary.planEndAge;
    // Use the p50 (typical) path index from the scenario's own result set so
    // the viability string is consistent with the rest of the Focus panel.
    const p50Idx = (s.res.paths && s.res.paths.p50 && s.res.paths.p50.simIndex != null)
      ? s.res.paths.p50.simIndex : 0;
    const sim = (Array.isArray(s.res.sims) ? s.res.sims.find(x => x.simIndex === p50Idx) : null)
             || (Array.isArray(s.res.sims) ? s.res.sims[0] : null);
    if (!sim) return '';
    if (sim.failed && sim.depletionAge) {
      return 'Shortfall risk after age ' + sim.depletionAge;
    }
    return 'Funds last to age ' + planEnd;
  }

  /* ---- adapter helpers (production shapes → view-models) ------------------- */
  // Lever keys shown, in a stable order across all scenarios (so Compare aligns).
  function activeLeverKeys() {
    const anyEvent = (scenarios || []).some((s) => s.lev && s.lev.eventAmt > 0);
    // Pension is removed from the Scenarios lever rows (per product ruling). The
    // engine still honors pension data from the plan; it is just not an editable
    // Scenarios lever. The one-time event row only appears when an event is set.
    // Retirement age drops out once the household is already retired — it is no
    // longer a lever we can pull (the retirement decision is behind them).
    const retired = hhAlreadyRetired();
    return LEVCFG.map((c) => c.key).filter((k) =>
      k !== 'pensionAge'
      && (k !== 'eventAmt' || anyEvent)
      && (k !== 'retireAge' || !retired));
  }
  function leverDeltaText(cfg, lev, baseLev) {
    if (!baseLev || lev === baseLev || cfg.key === 'sellAge') return null;
    const d = (lev[cfg.key] || 0) - (baseLev[cfg.key] || 0);
    if (!d) return null;
    const sign = d > 0 ? '+' : '−', a = Math.abs(d);
    if (cfg.key === 'spend')   return sign + '$' + Math.round(a / 12).toLocaleString('en-US') + '/mo';
    if (cfg.key === 'savings' || cfg.key === 'eventAmt') return sign + '$' + a.toLocaleString('en-US');
    if (cfg.key === 'risk')    return sign + a + ' lvl';
    return sign + a + ' yr';
  }
  // Derive the prefilled input string for a dollar lever (no $ or unit).
  function editInputVal(cfg, lev) {
    if (cfg.edit === 'monthly') return Math.round((lev[cfg.key] || 0) / 12).toLocaleString('en-US');
    if (cfg.edit === 'event')   return (lev.eventAmt || 0).toLocaleString('en-US');
    if (cfg.edit === 'money')   return (lev[cfg.key] || 0).toLocaleString('en-US');
    return null;
  }
  function leversFor(s) {
    const base = (scenarios.find((x) => x.base) || {}).lev;
    return activeLeverKeys().map((k) => {
      const cfg = LEVCFG.find((c) => c.key === k); if (!cfg) return null;
      const fv = cfg.fmt(s.lev[k], s.lev), val = fv[0], unit = fv[1];
      const value = (val === '__needs__') ? ('— @ ' + unit) : (val + (unit ? (' ' + unit) : ''));
      return {
        key: k, label: cfg.name, value: value, delta: leverDeltaText(cfg, s.lev, base),
        editType: cfg.edit || null,
        inputVal: editInputVal(cfg, s.lev),
        unitStr: unit || '',
        eventAge: (cfg.edit === 'event') ? (s.lev.eventAge != null ? s.lev.eventAge : '') : null,
      };
    }).filter(Boolean);
  }
  // Effective goal (base value with this scenario's override applied) — the Goals
  // page defines the base inventory; each scenario carries amount/startAge/endAge
  // overrides only. `idx` is the goal's index in the base inventory (the override key).
  function effGoal(baseGoal, ov) {
    return {
      amount:   (ov && ov.amount   != null) ? ov.amount   : (baseGoal.amount || 0),
      startAge: (ov && ov.startAge != null) ? ov.startAge : baseGoal.startAge,
      endAge:   (ov && ov.endAge   != null) ? ov.endAge   : baseGoal.endAge,
    };
  }
  // Compare goal rows = base goals with a base amount > 0, keeping their original
  // index so overrides and engine goals stay aligned.
  function goalRowsBase() {
    return (Array.isArray(plan.goals) ? plan.goals : [])
      .map((g, i) => ({ g: g, i: i }))
      .filter((r) => (r.g.amount || 0) > 0);
  }
  // Per-scenario goals view-model: effective values + override/baseline-delta info.
  function goalsVM(s) {
    const ovMap = (s && s.lev && s.lev.goalOv) || {};
    const baseScn = scenarios.find((x) => x.base);
    const baseOvMap = (baseScn && baseScn.lev && baseScn.lev.goalOv) || {};
    return goalRowsBase().map(({ g, i }) => {
      const e = effGoal(g, ovMap[i]);
      const once = (e.startAge === e.endAge);
      const ov = ovMap[i];
      const overridden = !!(ov && (ov.amount != null || ov.startAge != null || ov.endAge != null));
      // Δ vs the baseline scenario's effective values for this goal.
      const be = effGoal(g, baseOvMap[i]);
      const aDelta = (e.amount || 0) - (be.amount || 0);
      const sameAsBase = (e.amount === be.amount && e.startAge === be.startAge && e.endAge === be.endAge);
      return {
        idx: i,
        name: g.name || 'Goal',
        meta: once ? ('at age ' + e.startAge) : ('age ' + e.startAge + '–' + e.endAge),
        amount: e.amount || 0, startAge: e.startAge, endAge: e.endAge,
        cadence: once ? 'one-time' : '/yr', once: once,
        on: (e.amount || 0) > 0, added: false,
        overridden: overridden,
        amountDelta: aDelta, sameAsBase: sameAsBase,
      };
    });
  }
  
  // Cash-flow rows = the selected path's engine rows from CURRENT AGE forward,
  // formatted. Working (accum) years are included so the ledger starts today,
  // not at retirement; they carry an `accum` flag so the renderer can dash the
  // spending/draw columns (the engine assumes salary covers costs while working).
  // r.wdRate is the engine's own per-row withdrawal rate (percent); r.taxes the
  // engine row tax — no UI-side math here.
  
  

  // Lever step: reuses the EXISTING production mutation (LEVCFG/levRange/syncPension)
  // and the existing manual Run flow ("Adjusted · Run to update"). No auto-run.
  function stepFocusLever(ci, key, dir) {
    const cfg = LEVCFG.find((c) => c.key === key); if (!cfg) return;
    const sc = scenarios[ci]; if (!sc || !sc.lev) return;
    const r = levRange(cfg), L = sc.lev;
    L[key] = Math.max(r.min, Math.min(r.max, (L[key] != null ? L[key] : r.min) + dir * r.step));
    if (key === 'pensionAge') L.pensionAuto = false;
    if (key === 'retireAge' && L.pensionAuto) syncPension(L);
    saveScenarios();
    const st = document.getElementById('status'); if (st) st.textContent = 'Adjusted · Run to update';
  }
  // Commit a typed value from a .cmp-lev-in input in the Compare view.
  // Mirrors the parse/clamp logic from the scenario lever edit contract.
  function commitCmpInput(inp) {
    const ci = parseInt(inp.dataset.scnId, 10);
    const sc = scenarios[ci]; if (!sc || !sc.lev) return;
    const L = sc.lev;
    const edit = inp.dataset.edit;
    const raw = parseFloat(String(inp.value).replace(/[^0-9.]/g, ''));
    if (!isFinite(raw) || raw < 0) return;
    if (edit === 'monthly') {
      L.spend = Math.round(raw * 12);
    } else if (edit === 'money') {
      const cfg = LEVCFG.find((c) => c.key === inp.dataset.key);
      const r = cfg ? levRange(cfg) : null;
      const v = Math.round(raw);
      L[inp.dataset.key] = r ? Math.max(r.min, Math.min(r.max, v)) : v;
    } else if (edit === 'eventAmt') {
      L.eventAmt = raw > 0 ? Math.round(raw) : 0;
    } else if (edit === 'eventAge') {
      const lo = plan.household.primary.currentAge, hi = plan.household.primary.planEndAge;
      const a = Math.round(raw);
      if (isFinite(a)) L.eventAge = Math.max(lo, Math.min(hi, a));
    }
    saveScenarios();
    const st = document.getElementById('status'); if (st) st.textContent = 'Adjusted · Run to update';
    syncScenariosView();
  }
  // Commit a typed per-scenario GOAL override (amount / startAge / endAge / onceAge).
  // Writes into scenarios[ci].lev.goalOv[idx] — the base plan and other scenarios are
  // never touched. Fields equal to the base value are dropped so overrides stay minimal
  // and "same as Baseline" stays accurate.
  function commitGoalInput(inp) {
    const ci = parseInt(inp.dataset.scnId, 10);
    const idx = parseInt(inp.dataset.goalIdx, 10);
    const field = inp.dataset.goalField;
    const sc = scenarios[ci]; if (!sc || !sc.lev) return;
    const base = (Array.isArray(plan.goals) ? plan.goals : [])[idx]; if (!base) return;
    const raw = parseFloat(String(inp.value).replace(/[^0-9.]/g, ''));
    if (!isFinite(raw) || raw < 0) return;
    const lo = plan.household.primary.currentAge, hi = plan.household.primary.planEndAge;
    if (!sc.lev.goalOv) sc.lev.goalOv = {};
    const ov = sc.lev.goalOv[idx] || (sc.lev.goalOv[idx] = {});
    if (field === 'amount') {
      ov.amount = Math.round(raw);
    } else if (field === 'onceAge') {
      const v = Math.max(lo, Math.min(hi, Math.round(raw)));
      ov.startAge = v; ov.endAge = v;
    } else if (field === 'startAge') {
      let v = Math.max(lo, Math.min(hi, Math.round(raw)));
      const curEnd = (ov.endAge != null) ? ov.endAge : base.endAge;
      if (v > curEnd) v = curEnd;
      ov.startAge = v;
    } else if (field === 'endAge') {
      let v = Math.max(lo, Math.min(hi, Math.round(raw)));
      const curStart = (ov.startAge != null) ? ov.startAge : base.startAge;
      if (v < curStart) v = curStart;
      ov.endAge = v;
    }
    // Minimize the override: drop any field that matches the base, and drop the
    // whole entry (and map) when nothing differs — keeps deltas/"same as base" honest.
    ['amount', 'startAge', 'endAge'].forEach((f) => { if (ov[f] != null && ov[f] === base[f]) delete ov[f]; });
    if (ov.amount == null && ov.startAge == null && ov.endAge == null) delete sc.lev.goalOv[idx];
    if (sc.lev.goalOv && Object.keys(sc.lev.goalOv).length === 0) delete sc.lev.goalOv;
    saveScenarios();
    const st = document.getElementById('status'); if (st) st.textContent = 'Adjusted · Run to update';
    syncScenariosView();
  }

  /* ---- TAX MAPPING (selection over existing production data, not a tax engine) */
  
  

  /* ---- adapter: production scenario → view-model -------------------------- */
  function vmScenario(s) {
    const prob = PROD.prob(s);
    return {
      id: PROD.id(s), name: PROD.name(s), prob: prob,
      probStr: (prob == null ? '—' : scenarioNum(prob, 1)),
      tone: toneForProb(prob), median: fmtMoney(PROD.median(s)),
      isBaseline: PROD.isBaseline(s), levers: PROD.levers(s), goals: PROD.goals(s),
      range: PROD.range(s), viability: PROD.viability(s), stress: PROD.stress(s), raw: s,
    };
  }
  

  /* ---- COMPARE ----------------------------------------------------------- */
  function renderCompareView(scns, baseline) {
    return renderCompare(scns, baseline, {
      plan, goalsExpandedState: state.goalsExpanded, esc, downTri: DOWN_TRI,
    });
  }

  /* ---- FOCUS ------------------------------------------------------------- */
  
  function renderFocusView(scns, baseline, focusedId, showRange) {
    return renderFocus(scns, baseline, focusedId, showRange, {
      esc, fmtMoney, checkIcon: CHECK, stressEraCount: STRESS_ERAS.length,
    });
  }

  /* ---- CASH FLOW --------------------------------------------------------- */
  // Visible columns, exactly and in order. No Engine-tax / Federal-tax columns.
  const CF_COLS = ['Year', 'Age', 'Income', 'RMD', 'Essential', 'Goals', 'Tax', 'Draw', 'Return', 'WD Rate', 'Ending'];

  function renderCashflowView(scn, allScns) {
    return renderCashflow(scn, allScns, {
      pathRows: PROD.pathRows,
      cashSummary: PROD.cashSummary,
      cashFromRetirement: state.cashFromRetirement,
      isTypicalPath: PROD.isTypicalPath,
      typicalPathFederalTax: PROD.typicalPathFederalTax,
      pathFederalTax: PROD.pathFederalTax,
      toneGlow, ring, wdColor, num:scenarioNum, esc, fmtMoney, cfCols: CF_COLS,
    });
  }

  // Group rows into bands (presentation only — alternating shade at RMD age).
  

  /* ---- STATE + ONE AUTHORITATIVE SYNC ------------------------------------ */
  const $id = (id) => document.getElementById(id);

  function buildScenarios() {
    const list = (PROD.scenarios() || []).map(vmScenario);
    const baseline = list.find((s) => s.isBaseline) || list[0] || null;
    if (state.focusedId == null || !list.some((s) => s.id === state.focusedId)) {
      state.focusedId = (PROD.getSelectedId() || (list[0] && list[0].id) || null);
    }
    return { list: list, baseline: baseline };
  }

  function syncScenariosView() {
    const view = $id('scn-view');
    if (!view) return;
    const built = buildScenarios(), list = built.list, baseline = built.baseline;

    const sub = $id('scn-subtitle');
    if (sub) {
      const hh = PROD.householdName();
      sub.textContent = (hh ? hh + ' · ' : '') + list.length + ' plan' + (list.length === 1 ? '' : 's');
    }

    if (state.cashActive) {
      const scn = list.find((s) => s.id === state.focusedId) || baseline || list[0];
      view.innerHTML = scn ? renderCashflowView(scn, list) : '';
      mountPathControls();
    } else if (state.view === 'focus') {
      view.innerHTML = renderFocusView(list, baseline, state.focusedId, state.showRange);
    } else {
      view.innerHTML = renderCompareView(list, baseline);
    }
    syncToolbar();
    bindViewEvents();
  }

  function syncToolbar() {
    const inCash = state.cashActive;
    const segC = $id('scn-seg-compare'), segF = $id('scn-seg-focus'), chip = $id('scn-cash-toggle');
    if (segC) { const on = !inCash && state.view === 'compare'; segC.classList.toggle('is-active', on); segC.setAttribute('aria-selected', on ? 'true' : 'false'); }
    if (segF) { const on = !inCash && state.view === 'focus';   segF.classList.toggle('is-active', on); segF.setAttribute('aria-selected', on ? 'true' : 'false'); }
    if (chip) { chip.classList.toggle('is-on', inCash); chip.setAttribute('aria-checked', inCash ? 'true' : 'false'); }
  }

  // Relocate production's existing path-replay controls into the Cash Flow slot.
  // We move the node — never recreate it — so its bindings/state survive.
  function mountPathControls() {
    const slot = $id('scn-cf-path-controls');
    if (slot && window.scnPathControlsEl) slot.appendChild(window.scnPathControlsEl);
  }

  function bindViewEvents() {
    const view = $id('scn-view'); if (!view) return;
    view.querySelectorAll('[data-pick]').forEach((el) => {
      el.addEventListener('click', () => { state.focusedId = el.dataset.pick; PROD.setSelectedId(state.focusedId); syncScenariosView(); });
    });
    view.querySelectorAll('[data-cash-pick]').forEach((el) => {
      el.addEventListener('click', () => { state.focusedId = el.dataset.cashPick; PROD.setSelectedId(state.focusedId); syncScenariosView(); });
    });
    // "Start at retirement" — hide the working (accum) years in the cash-flow ledger.
    const retStart = view.querySelector('[data-cash-retstart]');
    if (retStart) retStart.addEventListener('click', () => { state.cashFromRetirement = !state.cashFromRetirement; syncScenariosView(); });
    // Always-visible +/- buttons in Compare (discrete levers) and Focus (all levers).
    // data-lever-key + data-dir + optional data-scn-id → stepFocusLever.
    view.querySelectorAll('[data-lever-key]').forEach((el) => {
      el.addEventListener('click', () => {
        const ci = (el.dataset.scnId != null && el.dataset.scnId !== '')
          ? parseInt(el.dataset.scnId, 10) : parseInt(state.focusedId, 10);
        stepFocusLever(ci, el.dataset.leverKey, +el.dataset.dir);
        syncScenariosView();
      });
    });
    // Type-in inputs for dollar levers in Compare view.
    view.querySelectorAll('.cmp-lev-in').forEach((inp) => {
      inp.addEventListener('change', () => commitCmpInput(inp));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      if (!inp.classList.contains('cmp-lev-in--age')) {
        inp.addEventListener('input', () => liveCommas(inp));
      }
    });
    // Per-scenario goal override inputs (amount / start / end) in expanded Compare.
    view.querySelectorAll('.cmp-goal-in').forEach((inp) => {
      inp.addEventListener('change', () => commitGoalInput(inp));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      if (!inp.classList.contains('cmp-goal-in--age')) {
        inp.addEventListener('input', () => liveCommas(inp));
      }
    });
    // Goals section expand/collapse toggle (visible, stable chevron control).
    const goalsToggle = view.querySelector('[data-goals-toggle]');
    if (goalsToggle) {
      goalsToggle.addEventListener('click', () => { state.goalsExpanded = !state.goalsExpanded; syncScenariosView(); });
      goalsToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.goalsExpanded = !state.goalsExpanded; syncScenariosView(); }
      });
    }
    // Per-scenario ⋯ menu in Compare heads: Rename (inline input) / Delete.
    // This is the "later pass" wiring promised when the old #scn-band grid was
    // retired — it drives the kept removeScenario() seam and saveScenarios().
    view.querySelectorAll('.scol__menu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const head = btn.closest('.scol__head--menu'); if (!head) return;
        const wasOpen = !!head.querySelector('.scol__pop');
        closeScnMenus();
        if (wasOpen) return;                       // second click toggles closed
        const ci = parseInt(btn.dataset.scnId, 10);
        const s = scenarios[ci]; if (!s || s.base) return;
        const pop = document.createElement('div');
        pop.className = 'scol__pop';
        pop.innerHTML =
          '<button class="scol__pop-item" type="button" data-act="rename">Rename</button>' +
          '<button class="scol__pop-item scol__pop-item--danger" type="button" data-act="delete">Delete plan</button>';
        head.appendChild(pop);
        pop.addEventListener('pointerdown', (pe) => pe.stopPropagation());
        pop.querySelector('[data-act="rename"]').addEventListener('click', (pe) => {
          pe.stopPropagation();
          closeScnMenus();
          startScnRename(head, ci);
        });
        pop.querySelector('[data-act="delete"]').addEventListener('click', (pe) => {
          pe.stopPropagation();
          const cur = scenarios[ci]; if (!cur || cur.base) { closeScnMenus(); return; }
          if (!confirm('Delete "' + cur.name + '"? Its levers and per-plan edits are removed.')) { closeScnMenus(); return; }
          closeScnMenus();
          removeScenario(ci);   // splice + saveScenarios + runAll → sync re-renders
        });
      });
    });
  }

  function closeScnMenus() {
    document.querySelectorAll('.scol__pop').forEach((p) => p.remove());
  }

  // Inline rename: the name span becomes an input in place. Enter/blur commit
  // (trimmed, non-empty), Escape cancels; either way the view re-syncs.
  function startScnRename(head, ci) {
    const nameEl = head.querySelector('.scol__name');
    const s = scenarios[ci];
    if (!nameEl || !s) return;
    const inp = document.createElement('input');
    inp.className = 'scol__rename';
    inp.type = 'text';
    inp.maxLength = 40;
    inp.value = s.name;
    inp.setAttribute('aria-label', 'Rename ' + s.name);
    nameEl.replaceWith(inp);
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (v && v !== s.name) { s.name = v; saveScenarios(); }
      syncScenariosView();
    };
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => {
      // Commit directly (not via blur() — blur is inert in unfocused tabs).
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); done = true; syncScenariosView(); }
    });
    inp.focus();
    inp.select();
  }

  function bindToolbarOnce() {
    const segC = $id('scn-seg-compare'), segF = $id('scn-seg-focus'), chip = $id('scn-cash-toggle');
    if (segC) segC.addEventListener('click', () => { state.cashActive = false; state.view = 'compare'; syncScenariosView(); });
    if (segF) segF.addEventListener('click', () => { state.cashActive = false; state.view = 'focus'; syncScenariosView(); });
    if (chip) chip.addEventListener('click', () => { state.cashActive = !state.cashActive; syncScenariosView(); });
    const add = $id('scn-add'), solve = $id('scn-solve');
    if (add)   add.addEventListener('click',   () => { PROD.addScenario(); PROD.afterEngineAction(); });
    if (solve) solve.addEventListener('click', () => { PROD.solve();       PROD.afterEngineAction(); });
  }

  function init() {
    if (!document.getElementById('scn-view')) return;
    const src = document.querySelector('#scn-path-replay');
    if (src) window.scnPathControlsEl = src;
    bindToolbarOnce();
    // One document-level closer for the ⋯ menus (bound once — init runs once).
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest && (e.target.closest('.scol__pop') || e.target.closest('.scol__menu'))) return;
      closeScnMenus();
    });
    syncScenariosView();
  }

  window.ScenariosUI = { sync: syncScenariosView, renderCompare: renderCompareView, renderFocus: renderFocusView, renderCashflow: renderCashflowView };
  init();
})();

renderSolvePanel();
syncPathControls();
renderInputs();
bindHouseholdRailOnce();   // chapter rail (Demographics / Net Worth / Cash Flow) view switch
syncHousehold();           // render the editable landing Household page from `plan`
document.body.classList.toggle('scn-active', document.querySelector('.page.on')?.dataset.page==='scenarios');
runAll();   // first iteration runs immediately so the tool opens populated

// ── STICKY NOTES OVERLAY ─────────────────────────────────────────────────────
(function(){
  const STORE_KEY = 'px_sticky_notes_v1';
  let active = false;
  let notes = [];
  let dragging = null, dragOX = 0, dragOY = 0;

  function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(notes)); }catch{} }
  function load(){ try{ const d=localStorage.getItem(STORE_KEY); if(d) notes=JSON.parse(d); }catch{} }

  function makeNoteEl(note){
    const el = document.createElement('div');
    el.className = 'sn-note';
    el.dataset.id = note.id;
    el.style.cssText = `left:${note.x}px;top:${note.y}px`;
    el.innerHTML = `<div class="sn-handle"><span class="sn-num">${note.num}</span><button class="sn-del" title="Remove">×</button></div><textarea class="sn-text" placeholder="Type note…">${note.text}</textarea>`;
    // drag via handle
    const handle = el.querySelector('.sn-handle');
    handle.addEventListener('mousedown', e => {
      if(e.target.classList.contains('sn-del')) return;
      dragging = el;
      const r = el.getBoundingClientRect();
      dragOX = e.clientX - r.left;
      dragOY = e.clientY - r.top;
      el.style.zIndex = 10001;
      e.preventDefault();
    });
    // delete
    el.querySelector('.sn-del').addEventListener('click', () => {
      notes = notes.filter(n => n.id !== note.id);
      save();
      el.remove();
    });
    // text update
    el.querySelector('.sn-text').addEventListener('input', e => {
      const n = notes.find(n => n.id === note.id);
      if(n){ n.text = e.target.value; save(); }
    });
    return el;
  }

  function placeNote(x, y){
    // keep the (now wider) note fully on screen wherever it's dropped
    const W = 360;
    x = Math.max(8, Math.min(x, window.innerWidth - W - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - 120));
    const num = notes.length ? Math.max(...notes.map(n=>n.num)) + 1 : 1;
    const note = { id: Date.now(), num, x, y, text: '' };
    notes.push(note);
    save();
    const el = makeNoteEl(note);
    document.body.appendChild(el);
    el.querySelector('.sn-text').focus();
  }

  function setActive(on){
    active = on;
    document.body.classList.toggle('sn-mode', on);
    btn.classList.toggle('sn-btn-on', on);
    btn.title = on ? 'Exit notes mode (click anywhere to add a note)' : 'Add sticky notes';
    overlay.style.display = on ? 'block' : 'none';
  }

  // overlay intercepts clicks for note placement
  const overlay = document.createElement('div');
  overlay.className = 'sn-overlay';
  overlay.addEventListener('click', e => {
    placeNote(e.clientX - 12, e.clientY - 12);
  });
  document.body.appendChild(overlay);

  // drag on document
  document.addEventListener('mousemove', e => {
    if(!dragging) return;
    const n = notes.find(n => n.id === +dragging.dataset.id);
    const x = e.clientX - dragOX, y = e.clientY - dragOY;
    dragging.style.left = x + 'px';
    dragging.style.top  = y + 'px';
    if(n){ n.x = x; n.y = y; }
  });
  document.addEventListener('mouseup', () => {
    if(dragging){ save(); dragging.style.zIndex=''; dragging=null; }
  });

  // toggle button
  const btn = document.createElement('button');
  btn.className = 'sn-btn';
  btn.textContent = '✎';
  btn.title = 'Add sticky notes';
  btn.addEventListener('click', () => setActive(!active));
  document.body.appendChild(btn);

  // clear button (only visible in active mode)
  const clearBtn = document.createElement('button');
  clearBtn.className = 'sn-clear';
  clearBtn.textContent = 'Clear all';
  clearBtn.title = 'Remove all sticky notes';
  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    notes = [];
    save();
    document.querySelectorAll('.sn-note').forEach(el => el.remove());
  });
  document.body.appendChild(clearBtn);

  // copy button — the "send to you" path: gathers every note into clean,
  // numbered text and drops it on the clipboard so it can be pasted straight
  // into chat. Static site, no backend — clipboard is the handoff.
  const copyBtn = document.createElement('button');
  copyBtn.className = 'sn-copy';
  copyBtn.textContent = 'Copy notes';
  copyBtn.title = 'Copy all notes to clipboard (paste them to send)';
  copyBtn.addEventListener('click', async e => {
    e.stopPropagation();
    const filled = [...notes].sort((a,b)=>a.num-b.num).filter(n => n.text.trim());
    if(!filled.length){
      copyBtn.textContent = 'No notes yet';
      setTimeout(() => { copyBtn.textContent = 'Copy notes'; }, 1400);
      return;
    }
    const text = filled.map(n => `${n.num}. ${n.text.trim()}`).join('\n\n');
    try{
      await navigator.clipboard.writeText(text);
    }catch{
      // fallback for older / non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch{}
      ta.remove();
    }
    copyBtn.textContent = `Copied ${filled.length} note${filled.length>1?'s':''}!`;
    copyBtn.classList.add('sn-copied');
    setTimeout(() => { copyBtn.textContent = 'Copy notes'; copyBtn.classList.remove('sn-copied'); }, 1600);
  });
  document.body.appendChild(copyBtn);

  // restore persisted notes
  load();
  notes.forEach(n => document.body.appendChild(makeNoteEl(n)));
})();
