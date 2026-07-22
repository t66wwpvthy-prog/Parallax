import { pathReplay, resetCashFlowPathToTypical } from '../src/state.js';
import {
  normalizeCashFlowPathMode,
  pathModeLabel as cashFlowPathModeLabel,
  pickRandomSimIndex,
  resolveCashFlowSim,
  selectedMcSimIndex,
} from '../src/planning/cashFlowPathReplay.js';

import { fmtM } from './formatters.js';

import { CHART_LAYOUT } from './chartLayout.js';

export { normalizeCashFlowPathMode, pickRandomSimIndex, resolveCashFlowSim, selectedMcSimIndex };


export function selectedPathIndex(res){
  return selectedMcSimIndex(res, pathReplay.mode, pathReplay.randomSimIndex);
}

export function pathModeLabel(){
  return cashFlowPathModeLabel(pathReplay.mode);
}

export function pathOutcomeText(sim){
  if(!sim) return '';
  return sim.failed
    ? `Ran dry at age ${sim.depletionAge || 'n/a'}`
    : `Survived with ${fmtM(sim.terminalBalance || 0)}`;
}

export function drawSeqChart(svg, runs, retAge, seqChartSvg, { grid, axisInk }){
  const W=1000,H=320;
  svg.innerHTML=seqChartSvg(runs, retAge,{
    width:W,
    height:H,
    layout:CHART_LAYOUT.scenarioPath,
    fmtM,
    grid:grid,
    axisInk:axisInk
  });
}

export function renderPrints(container, runs, pathDigest){
  // All three figures come straight from the engine's pathDigest: first-decade
  // CAGR, lowest balance, and the damage window (longest run of years the
  // cumulative return sat below its retirement-day level — a long '66/'73
  // grind hurts a withdrawing portfolio far more than a V-shaped '08 shock).
  const pct=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';
  const outcome=r=> r.depletionAge!=null
    ? {t:`Ran dry @ ${r.depletionAge}`, c:'var(--negative-bright)'}
    : {t:`Survived · ${fmtM(r.terminalBalance)}`, c:'var(--status-positive-bright)'};
  const card=(m,res)=>{
    const o=outcome(res);
    const d=pathDigest(res);
    // Only when there IS a drawdown — a good market never goes underwater, so the
    // row would just read "—". Show it where it tells a story; omit it otherwise.
    const dwBlock = d.underwaterSpellMax ? `
      <div class="pr-row" style="border-bottom:none"><span class="pr-k">Duration</span><span class="pr-v">${d.underwaterSpellMax} yr${d.underwaterSpellMax>1?'s':''}</span></div>
      <div class="dw-bar"><div class="dw-fill" style="width:${Math.min(100,d.underwaterSpellMax/12*100).toFixed(0)}%;background:#c0795f"></div></div>` : '';
    return `<div class="seq-print">
      <h4><span class="dot" style="border-color:${m.c}"></span>${m.y} · ${m.tag}</h4>
      <div class="pr-row"><span class="pr-k">First decade</span><span class="pr-v">${pct(d.first10Cagr)}</span></div>
      <div class="pr-row"><span class="pr-k">Lowest</span><span class="pr-v">${fmtM(d.minBalance)}</span></div>
      ${dwBlock}
      <div class="pr-row"><span class="pr-k">Outcome</span><span class="pr-v" style="color:${o.c}">${o.t}</span></div>
    </div>`;
  };
  container.innerHTML=runs.map(r=>card(r.m, r.res)).join('');
}

export function syncPathControls(){
  if(typeof document === 'undefined') return;
  const mode=document.querySelector('#path-mode');
  if(mode) mode.value = normalizeCashFlowPathMode(pathReplay.mode);
  const regen=document.querySelector('#path-regenerate');
  if(regen) regen.hidden = normalizeCashFlowPathMode(pathReplay.mode) !== 'random';
}

export function updatePathReplayMode(mode, baselineAnalysis = null){
  const next = normalizeCashFlowPathMode(mode);
  pathReplay.mode = next;
  if(next === 'random'){
    pathReplay.randomSimIndex = pickRandomSimIndex(baselineAnalysis, pathReplay.randomSimIndex);
  } else {
    pathReplay.randomSimIndex = null;
  }
}

export function regenerateRandomPath(baselineAnalysis){
  if(normalizeCashFlowPathMode(pathReplay.mode) !== 'random') return;
  pathReplay.randomSimIndex = pickRandomSimIndex(baselineAnalysis, pathReplay.randomSimIndex);
}

export function closeCashFlowPathReplay(){
  resetCashFlowPathToTypical();
  syncPathControls();
}
