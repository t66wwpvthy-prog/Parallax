import { pathReplay, savePathReplay } from '../src/state.js';

import { fmtM, cfMoney, cfRetPct, cfGain } from './formatters.js';

import { CHART_LAYOUT } from './chartLayout.js';



export function selectedPathIndex(res, findSimByTerminalBalance){
  if(!res || !Array.isArray(res.sims) || !res.sims.length) return 0;
  if(pathReplay.mode === 'typical'){
    return (res.paths && res.paths.p50 && res.paths.p50.simIndex != null) ? res.paths.p50.simIndex : 0;
  }
  if(pathReplay.mode === 'stressed'){
    return res.terminal && Number.isFinite(res.terminal.p10) ? findSimByTerminalBalance(res, res.terminal.p10) : 0;
  }
  if(pathReplay.mode === 'favorable'){
    return res.terminal && Number.isFinite(res.terminal.p90) ? findSimByTerminalBalance(res, res.terminal.p90) : 0;
  }
  if(pathReplay.mode === 'sequence-stress'){
    return (res.paths && res.paths.p10 && res.paths.p10.simIndex != null) ? res.paths.p10.simIndex : 0;
  }
  return 0;
}

export function pathModeLabel(){
  return ({
    typical:'Typical path',
    stressed:'Stressed path',
    favorable:'Favorable path',
    'sequence-stress':'Sequence Stress'
  })[pathReplay.mode] || 'Typical path';
}

export function pathOutcomeText(sim){
  if(!sim) return '';
  return sim.failed
    ? `Ran dry at age ${sim.depletionAge || 'n/a'}`
    : `Survived with ${cfMoney(sim.terminalBalance || 0)}`;
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

export function normalizePlaybackStrategy(strategy, playbackStrategies){
  return playbackStrategies.some(([k])=>k===strategy) ? strategy : 'taxable-first';
}

export function renderPlayback({
  el, seqContext, playbackYear, pbDetailOpen, sequenceYears, playbackStrategies,
  runHistoricalPath, pathDigest, eraFor, setPlaybackYear, togglePlaybackDetail, rerender,
}){
  if(!el) return;
  if(!seqContext){ el.innerHTML=''; return; }
  const {rp, ov2}=seqContext;
  const strat=normalizePlaybackStrategy(seqContext.strat, playbackStrategies);
  const years=sequenceYears.map(m=>m.y);
  if(!years.includes(playbackYear)){
    playbackYear=years[0];
    setPlaybackYear(playbackYear);
  }
  const runs=playbackStrategies
    .map(([k,label])=>({k,label,res:runHistoricalPath(rp,playbackYear,k,undefined,ov2)}))
    .filter(r=>r.res && r.res.rows.length);
  if(!runs.length){ el.innerHTML=''; return; }
  const main=runs.find(r=>r.k===strat)||runs[0];
  const d=pathDigest(main.res);
  const verdict = d.failed
    ? `${playbackYear} breaks the plan at age ${d.depletionAge}.`
    : `The plan survives ${playbackYear}.`;
  const sub = d.failed
    ? `Retire ${playbackYear} and the portfolio is exhausted at age ${d.depletionAge} — the sequence, not the average, does the damage.`
    : `${main.res.actualYears} historical years — retire ${playbackYear}, plan through ${main.res.endYear} — end with <b>${fmtM(d.endBalance)}</b> in today's dollars.`;
  const picks=years.map(y=>`<button class="${y===playbackYear?'on':''}" data-pb-year="${y}">${y}</button>`).join('');
  const stratRows=runs.map(r=>{
    const rd=pathDigest(r.res);
    const isPlan=r.k===strat;
    const delta=isPlan?'baseline':cfGain(r.res.lifetimeTax-main.res.lifetimeTax);
    const out=rd.failed?`Depleted · age ${rd.depletionAge}`:'Survived';
    return `<tr class="${isPlan?'plan':''}">
      <td class="l">${r.label}${isPlan?' — the plan’s strategy':''}</td>
      <td class="l">${out}</td>
      <td class="end">${fmtM(rd.endBalance)}</td>
      <td>${(rd.realCagr*100).toFixed(1)}%</td>
      <td>${fmtM(r.res.lifetimeTax)}</td>
      <td>${delta}</td></tr>`;
  }).join('');
  const real=main.res.rows.filter(r=>r.source!=null);
  const yearRows=real.map(r=>{
    const neg=r.returnRate<0;
    return `<tr>
      <td class="l" style="width:34px">${r.year}</td>
      <td>${r.age}</td>
      <td class="era l">${r.source} · ${eraFor(r.source)}</td>
      <td class="${neg?'neg':''}">${cfRetPct(r.returnRate)}</td>
      <td>${fmtM(r.startBalance)}</td>
      <td class="${r.returnDollars<0?'neg':''}">${cfGain(r.returnDollars)}</td>
      <td>${cfMoney(r.withdrawal)}</td>
      <td class="${(r.balance-r.startBalance)<0?'neg':''}">${cfGain(r.balance-r.startBalance)}</td>
      <td class="end">${fmtM(r.balance)}</td></tr>`;
  }).join('');
  const detail = pbDetailOpen ? `
    <div class="story-chart-l" style="margin-top:26px">Year by year · retire ${playbackYear} · engine rows, era labels for context only</div>
    <table class="stmt" id="pb-table">
      <tr><th class="l">Yr</th><th>Age</th><th class="l">Era</th><th>Return</th><th>Start</th><th>Return $</th><th>Drawn</th><th>Net</th><th>End</th></tr>
      ${yearRows}
    </table>` : '';
  el.innerHTML=`
    <div class="story-sec"><span>Playback · same plan, real markets</span></div>
    <div class="story-pick"><span class="pk-l">Retire in:</span>${picks}</div>
    <div class="pb-verdict" id="pb-verdict">${verdict}</div>
    <div class="pb-sub">${sub}</div>
    <hr class="story-rule">
    <div class="story-chart-l">Same ${playbackYear} sequence, three sourcing orders</div>
    <table class="stmt" id="pb-strats">
      <tr><th class="l"></th><th class="l">Outcome</th><th>Terminal</th><th>Real CAGR</th><th>Lifetime taxes</th><th>vs plan</th></tr>
      ${stratRows}
    </table>
    <button class="pb-detail-btn" id="pb-detail-btn">${pbDetailOpen?'hide advisor detail ▴':'advisor detail · year by year ▾'}</button>
    ${detail}`;
  el.querySelectorAll('[data-pb-year]').forEach(b=>b.onclick=()=>{
    setPlaybackYear(parseInt(b.dataset.pbYear,10)); rerender();
  });
  el.querySelector('#pb-detail-btn').onclick=()=>{ togglePlaybackDetail(); rerender(); };
}

export function syncPathControls(){
  const mode=document.querySelector('#path-mode');
  if(mode) mode.value = pathReplay.mode;
}

export function updatePathReplayMode(mode){
  pathReplay.mode=mode;
  savePathReplay();
}

