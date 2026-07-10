import { goalSelected, goalAreaOpen, goalAreaTiming, uiState } from '../src/state.js';

import { GOAL_AREAS, GOAL_AREA_LBL } from './goalPalette.js';

import { fmtMoney } from './formatters.js';

import { CHART_LAYOUT } from './chartLayout.js';

import { escHtml } from './dom.js';



export function goalsView(plan){
  const list = (Array.isArray(plan.goals)?plan.goals:[]).map((g,i)=>({
    i, name:g.name||'', amount:g.amount||0,
    once:g.startAge===g.endAge, startAge:g.startAge, endAge:g.endAge,
    area:g.area||null, unpriced:!(g.amount>0),
  }));
  return {
    list,
    recurring: list.filter(g=>!g.once).reduce((s,g)=>s+g.amount,0),
    oneTime:   list.filter(g=> g.once).reduce((s,g)=>s+g.amount,0),
  };
}

export function droppedGoals(plan, goalDropKey){
  try{
    const s=JSON.parse(localStorage.getItem(goalDropKey)||'null');
    if(s && s.n===(plan.goals||[]).length && Array.isArray(s.dropped))
      return new Set(s.dropped.filter(i=>i>=0 && i<plan.goals.length));
  }catch{}
  return new Set();
}

export function goalAreaAges(plan, timing){
  const p=plan.household.primary, cur=p.currentAge, end=p.planEndAge;
  const r0=Math.max(cur, Math.min(p.retirementAge||cur, end));
  const clamp=v=>Math.min(end, Math.max(Math.min(cur+1,end), Math.round(v)));
  if(timing==='ongoing') return { startAge:r0, endAge:end };
  const at = timing==='soon' ? r0
           : timing==='mid'  ? (r0+end)/2
           :                    r0+0.8*(end-r0);
  const a=clamp(at);
  return { startAge:a, endAge:a };
}

export function goalAreaChipsHTML(plan){
  const have=new Set((plan.goals||[]).map(g=>g.area).filter(Boolean));
  const chips=GOAL_AREAS.map(([key,lbl])=>
    `<button class="ga-chip${have.has(key)?' lit':''}${goalAreaOpen===key?' open':''}" data-area="${key}">${lbl}</button>`).join('');
  let intake='';
  if(goalAreaOpen){
    const presets=[['soon','soon'],['mid','mid-retirement'],['later','later'],['ongoing','ongoing']].map(([k,lbl])=>
      `<button class="ga-preset${goalAreaTiming===k?' sel':''}" data-preset="${k}">${lbl}</button>`).join('');
    intake=`<div class="ga-intake">
      <input class="er-name" id="ga-name" type="text" placeholder="Describe it in your own words">
      <span class="ga-presets">${presets}</span>
      <button class="ga-go" id="ga-go">Add</button>
    </div>`;
  }
  return `<div class="ga-chips">${chips}</div>${intake}`;
}

export function goalsThreadSVG(plan, view, dropped){
  const a0=plan.household.primary.currentAge;
  const a1=plan.household.primary.planEndAge;
  if(!(a1>a0) || !view.list.length) return '';
  const retAge=plan.household.primary.retirementAge;
  // Clamp legacy 0/999 windows for GEOMETRY only — the row inputs keep
  // showing the stored values; the engine clamps the same way by age loop.
  const clampAge=v=>Math.max(a0, Math.min(a1, v||0));
  const rec=view.list.filter(g=>!g.once)
    .map(g=>({...g, sa:clampAge(g.startAge), ea:Math.max(clampAge(g.startAge), clampAge(g.endAge))}))
    .sort((p,q)=>(p.sa-q.sa)||(p.i-q.i));
  const once=view.list.filter(g=>g.once).map(g=>({...g, sa:clampAge(g.startAge)}));
  const { width:W, padLeft:padL, padRight:padR, threadY } = CHART_LAYOUT.goalThread;
  const H=Math.max(190, threadY+44+rec.length*30+44);
  const x=age=>padL+(W-padL-padR)*(age-a0)/(a1-a0);
  // Ribbon widths: kept PRICED recurring goals share a ~12px bundle ∝ amount.
  // Unpriced goals have no width to claim — they ride outside the bundle as
  // dashed lanes, like dropped ghosts but visually distinct.
  const keptRec=rec.filter(g=>!dropped.has(g.i) && !g.unpriced);
  const keptSum=keptRec.reduce((s,g)=>s+g.amount,0)||1;
  const wOf=g=>Math.max(2, Math.min(10, 12*g.amount/keptSum));
  // Stack: the LAST goal to peel rides closest to the spine, so peels never
  // cross. Offsets accumulate from the spine downward in reverse peel order.
  let off=2.0; const yOf=new Map();
  for(let j=keptRec.length-1;j>=0;j--){ const w=wOf(keptRec[j]); yOf.set(keptRec[j].i, threadY+off+w/2); off+=w; }
  let s='', hits='', labels='';
  const axisY=H-10;
  for(let a=Math.ceil(a0/5)*5; a<=a1; a+=5){
    s+=`<text class="gt-tick" x="${x(a).toFixed(1)}" y="${axisY}" text-anchor="middle">${a}</text>`;
  }
  if(retAge>a0 && retAge<a1){
    s+=`<line class="gt-ret" x1="${x(retAge).toFixed(1)}" y1="16" x2="${x(retAge).toFixed(1)}" y2="${axisY-12}"/>`;
    s+=`<text class="gt-tick" x="${x(retAge).toFixed(1)}" y="11" text-anchor="middle">${retAge}</text>`;
  }
  const laneIdx=new Map(rec.map((g,k)=>[g.i,k]));
  let lastPeelX=-99;
  for(const g of rec){
    const isDrop=dropped.has(g.i), isUn=g.unpriced;
    let px=x(g.sa); if(px-lastPeelX<6) px=lastPeelX+6; lastPeelX=px;
    const laneY=threadY+34+laneIdx.get(g.i)*30;
    const ex=Math.max(x(g.ea), px+70);
    const peel=yr=>`${px.toFixed(1)} ${yr.toFixed(1)} C ${(px+26).toFixed(1)} ${yr.toFixed(1)}, ${(px+26).toFixed(1)} ${laneY}, ${(px+52).toFixed(1)} ${laneY} L ${ex.toFixed(1)} ${laneY}`;
    // Kept ribbons travel inside the bundle from the left edge, then peel;
    // dropped ghosts and unpriced lanes have no place in the bundle — they
    // only mark the lane.
    const d=(isDrop||isUn) ? `M ${peel(threadY)}` : `M ${padL} ${yOf.get(g.i).toFixed(1)} L ${peel(yOf.get(g.i))}`;
    const cls=isUn?' unpriced':isDrop?' ghost':'';
    s+=`<path class="gt-flow${cls}${g.i===goalSelected?' on':''}" data-goal-i="${g.i}" d="${d}" stroke-width="${(isDrop||isUn)?1.5:wOf(g).toFixed(1)}"/>`;
    hits+=`<path class="gt-hit" data-goal-i="${g.i}" d="${d}" stroke-width="22"/>`;
    labels+=`<text class="gt-lbl${isUn?' unpriced':''}${g.i===goalSelected?' on':''}" data-goal-i="${g.i}" x="${(px+58).toFixed(1)}" y="${laneY-7}">${escHtml(g.name||'Goal')} · ${isUn?'unpriced':fmtMoney(g.amount)+'/yr'}</text>`;
  }
  s+=`<line class="gt-spine" x1="${padL}" y1="${threadY}" x2="${W-padR}" y2="${threadY}"/>`;
  for(const g of once){
    const isDrop=dropped.has(g.i), isUn=g.unpriced;
    const cx=x(g.sa), r=isUn?6:Math.max(5, Math.min(11, 4+Math.sqrt(g.amount||0)/40));
    const cls=isUn?' unpriced':isDrop?' ghost':'';
    s+=`<rect class="gt-once${cls}${g.i===goalSelected?' on':''}" data-goal-i="${g.i}" x="${(cx-r).toFixed(1)}" y="${(threadY-r).toFixed(1)}" width="${(2*r).toFixed(1)}" height="${(2*r).toFixed(1)}" transform="rotate(45 ${cx.toFixed(1)} ${threadY})"/>`;
    hits+=`<circle class="gt-hit dot" data-goal-i="${g.i}" cx="${cx.toFixed(1)}" cy="${threadY}" r="16"/>`;
    labels+=`<text class="gt-lbl${isUn?' unpriced':''}${g.i===goalSelected?' on':''}" data-goal-i="${g.i}" x="${cx.toFixed(1)}" y="${threadY-16}" text-anchor="middle">${escHtml(g.name||'One-time')} · ${isUn?'unpriced':fmtMoney(g.amount)} · ${g.startAge}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Goal spending, ages ${a0} to ${a1}">${s}${labels}${hits}</svg>`;
}

export function goalRowHTML(plan, g, isDropped, { name, money, rmX }){
  const base=`goals.${g.i}`;
  const win=g.once
    ? `<span class="gl-win">once at <input class="er-num" type="number" step="1" data-path="${base}.startAge" data-sync="${base}.endAge" data-type="num" value="${g.startAge}"></span>`
    : `<span class="gl-win">/yr · age <input class="er-num" type="number" step="1" data-path="${base}.startAge" data-type="num" value="${g.startAge}">–<input class="er-num" type="number" step="1" data-path="${base}.endAge" data-type="num" value="${g.endAge}"></span>`;
  const tag=g.area?`<span class="ga-tag">${escHtml(GOAL_AREA_LBL[g.area]||g.area)}</span>`:'';
  // Unpriced: same money binding, rendered empty — typing a number prices it.
  // No keep/drop toggle ($0 has nothing to drop); an empty slot keeps columns aligned.
  const amt=g.unpriced
    ? `<span class="er-amt unpriced"><span class="pre">$</span><input type="text" inputmode="numeric" data-path="${base}.amount" data-type="money" value="" placeholder="price later"></span>`
    : money(plan,base,'amount');
  const keep=g.unpriced
    ? `<span class="gl-keep-slot"></span>`
    : `<button class="gl-keep" data-drop="${g.i}" title="What-if only — scenarios still fund every goal">${isDropped?'dropped':'kept'}</button>`;
  return `<div class="erow gl-row${isDropped&&!g.unpriced?' dropped':''}${g.i===goalSelected?' sel':''}" data-gl-row="${g.i}">
    ${name(plan,base,'name', g.once?'One-time goal':'Goal')}${tag}
    <span class="gl-dots"></span>
    ${amt}${win}
    ${keep}
    <span class="gl-cost${g.unpriced?' unpriced-cell':''}" data-cost-i="${g.i}">${g.unpriced?'unpriced':'—'}</span>
    ${rmX(base)}
  </div>`;
}

export function renderGoalsPage(plan, fieldHelpers, goalDropKey){
  const view=goalsView(plan), dropped=droppedGoals(plan, goalDropKey);
  if(goalSelected!=null && !(plan.goals||[])[goalSelected]) uiState.goalSelected=null;
  const facts=[`<b>${fmtMoney(view.recurring)}</b>/yr recurring`];
  if(view.oneTime>0) facts.push(`<b>${fmtMoney(view.oneTime)}</b> one-time`);
  facts.push('today’s dollars');
  const rows=view.list.map(g=>goalRowHTML(plan, g, dropped.has(g.i), fieldHelpers)).join('');
  return `<div class="gl-wrap">
    ${goalAreaChipsHTML(plan)}
    <div id="goal-thread" class="gt-scroll">${goalsThreadSVG(plan, view, dropped)}</div>
    <div class="gl-facts">${facts.join(' · ')}</div>
    <div class="gl-rows">${rows||'<div class="gl-none">No goals entered.</div>'}</div>
    <div class="gl-adds"><span class="hp-add" data-add="goalRec">+ add a recurring goal</span><span class="hp-add" data-add="goalOnce">+ add a one-time goal</span></div>
    <div class="gl-runs" id="gl-runs"></div>
  </div>`;
}

export function syncGoalSelection(np){
  np.querySelectorAll('.gl-row').forEach(r=>r.classList.toggle('sel', +r.dataset.glRow===goalSelected));
  np.querySelectorAll('.gt-flow,.gt-once,.gt-lbl').forEach(p=>{
    if(p.dataset.goalI!=null) p.classList.toggle('on', +p.dataset.goalI===goalSelected);
  });
}

