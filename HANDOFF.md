# HANDOFF — Goals priority-board mock (resume in new chat)

**Date:** 2026-06-04 · **Branch:** `claude/laughing-einstein-c6F33` (canonical; `main` = Pages deploy, push to BOTH).

## Where we are
Building the **Goals page redesign** (ROADMAP §K). Chosen direction = Nathan's
**priority board**: floating translucent glass cards the advisor + client drag
around a canvas; higher on the canvas = higher priority; a rank badge updates live
as cards move. (The other direction — a timeline of age-axis bars — was explored
and set aside.)

Iteration history (all screenshot-verified):
1. First cut rejected — read as a "ledger" (long full-width rows). Nathan: boxes
   should **float, fit their content, free-drag with space around them**.
2. Rebuilt as a free-drag canvas. Nathan: **bigger boxes** (middle ground between
   giant and tiny) and **more translucent — glassmorphism** (recurring ask: bias glassier).
3. Current state below: bigger cards, fill opacity ~.24, blur 28px + saturate(1.4),
   bright inset rim. **Awaiting Nathan's final OK on size/translucency.**

## Next step
1. Get Nathan's approval on the mock (screenshot it: see "Verify" below).
2. Once approved → wire the priority canvas into the **live Goals tab** in
   `parallax_v2.html`, replacing the current ledger Goals view.
3. Build (regenerates `index.html` + `parallax.html`) and **ship to both branches**
   (`/ship` or push to working branch AND `main`).

## Open decisions (unanswered)
- Priority by raw card height vs explicit zones/columns?
- Should the rank/order eventually FEED the engine (fund order), or stay advisory-only?
  (Currently the badge is cosmetic. Engine is sacred — no math changes without explicit OK.)

## Engine truth this VIEW reads (no new math)
- Goals = `plan.goals` entries; one-time goal ⇔ `startAge === endAge`.
- Engine already emits a per-year `goals` field (used by the Cash Flow Goals column,
  committed c42bd52). The board is a VIEW of these entries, not new computation.

## Verify (mock-first; LOOK at pixels before claiming done)
The mock is **gitignored + throwaway** by design. Recreate it from the embedded
source below, then screenshot headless:
```
# write goals_priority_mock.html from the block below, then:
node _shot_goals.mjs   # (recreate: puppeteer, chromium at
                       #  /opt/pw-browsers/chromium-1194/chrome-linux/chrome, --no-sandbox,
                       #  goto file://goals_priority_mock.html, viewport ~1400x900,
                       #  screenshot -> verify-out/goals-canvas-mock.png)
```

---

## Embedded mock source — `goals_priority_mock.html` (recreate verbatim)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Goals — priority canvas mock</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg-deep:#160F08; --bg:#1A130B;
  --surface:rgba(40,28,19,.44); --surface-2:rgba(255,255,255,.07); --surface-3:rgba(50,37,26,.38);
  --rule:rgba(255,255,255,.14); --rule-bright:rgba(255,255,255,.26); --rule-faint:rgba(255,255,255,.08);
  --ink:#E9DFD0; --ink-bright:#F4EDE1; --ink-mute:#B3A48F; --ink-faint:rgba(231,221,205,.50); --ink-ghost:rgba(231,221,205,.24);
  --gold:#D2943C; --gold-bright:#E6AE55; --gold-deep:#A9762C; --gold-glow:rgba(210,148,60,.24);
  --teal:#86A7C5; --teal-bright:#A3BFD8; --teal-deep:#6588A6; --teal-glow:rgba(134,167,197,.16);
  --positive:#7FB58F; --clay:#D87D6B; --negative:#CF7468;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:'Sora',sans-serif;color:var(--ink);font-size:14px;-webkit-font-smoothing:antialiased;
  background-color:#1A130B;background-image:
    radial-gradient(circle at 78% 7%, rgba(150,122,86,.55), transparent 48%),
    radial-gradient(circle at 33% 30%, rgba(103,84,64,.32), transparent 42%),
    radial-gradient(circle at 11% 88%, rgba(18,12,7,.55), transparent 34%),
    radial-gradient(circle at 90% 92%, rgba(18,12,7,.45), transparent 36%),
    linear-gradient(165deg,#2A2014,#221A11 45%,#1A130B 78%,#120C06);
  padding:30px 40px 44px;min-height:100vh;
}
.num{font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums}

.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute);font-weight:600}
h1{font-size:23px;font-weight:600;color:var(--ink-bright);margin:4px 0 0;letter-spacing:.01em}
.sub{color:var(--ink-faint);font-size:13px;margin-top:3px}
.head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px;max-width:1240px}
.totcard{background:var(--surface);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-radius:14px;padding:12px 20px;text-align:right;
  box-shadow:inset 0 1px 0 var(--rule-bright), inset 0 0 0 1px var(--rule-faint), 0 18px 40px -24px #000}
.totcard .k{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-mute);font-weight:600}
.totcard .v{font-size:26px;font-weight:600;color:var(--gold-bright);margin-top:2px}

/* ── the canvas — free space to drag cards around ──────────────────── */
.canvas{position:relative;max-width:1240px;height:700px;border-radius:20px;overflow:hidden;
  background:linear-gradient(180deg,rgba(60,44,28,.26),rgba(26,19,11,.18));
  box-shadow:inset 0 1px 0 var(--rule-faint), inset 0 0 0 1px var(--rule-faint), 0 30px 60px -34px #000}
/* a soft priority axis down the left — higher = matters more */
.axis{position:absolute;left:0;top:0;bottom:0;width:118px;pointer-events:none;
  background:linear-gradient(180deg,rgba(210,148,60,.12),transparent 60%)}
.axis .spine{position:absolute;left:30px;top:26px;bottom:26px;width:3px;border-radius:3px;
  background:linear-gradient(180deg,var(--gold-bright),var(--gold-deep) 50%,rgba(169,118,44,.12))}
.axis .cap{position:absolute;left:24px;width:80px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;line-height:1.3}
.axis .top{top:14px;color:var(--gold-bright)}
.axis .bot{bottom:14px;color:var(--ink-faint)}
.axis .arrow{position:absolute;left:24px;font-size:13px;color:var(--gold);opacity:.6}

/* a goal = a floating glass card, sized to its content (middle ground:
   bigger than a chip, far from the old ledger row). Real glassmorphism:
   low fill opacity, strong blur+saturate, a bright rim catching the light. */
.card{position:absolute;cursor:grab;user-select:none;width:max-content;max-width:288px;
  padding:17px 21px;border-radius:18px;
  background:linear-gradient(180deg,rgba(78,58,38,.26),rgba(40,30,19,.20));
  backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.32), inset 0 0 0 1px var(--rule-faint), 0 22px 44px -22px #000;
  transition:box-shadow .14s, transform .06s}
.card:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.36), inset 0 0 0 1px var(--rule), 0 28px 52px -22px #000}
.card.drag{cursor:grabbing;z-index:99;box-shadow:inset 0 1px 0 var(--gold-glow), inset 0 0 0 1px rgba(210,148,60,.42), 0 34px 60px -18px #000, 0 0 38px -10px var(--gold-glow);transform:scale(1.03)}
.card .top{display:flex;align-items:center;gap:10px}
.tagdot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
.cname{font-size:16.5px;color:var(--ink-bright);font-weight:600;white-space:nowrap}
.crank{margin-left:auto;font-family:'Inter';font-weight:700;font-size:12.5px;color:var(--gold-bright);
  background:rgba(210,148,60,.16);border-radius:7px;padding:2px 8px;min-width:24px;text-align:center}
.cfoot{display:flex;align-items:baseline;gap:10px;margin-top:11px}
.camt{font-family:'Inter';font-size:21px;font-weight:600;color:var(--ink-bright)}
.ckind{font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;padding:3px 9px;border-radius:7px}
.ckind.rec{background:rgba(210,148,60,.13);color:var(--gold-bright)}
.ckind.win{background:rgba(134,167,197,.14);color:var(--teal-bright)}
.ckind.once{background:rgba(216,125,107,.14);color:var(--clay)}

.legend{display:flex;gap:20px;margin-top:16px;max-width:1240px;font-size:11.5px;color:var(--ink-faint)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.legend i{width:9px;height:9px;border-radius:50%}
.add{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-mute);
  background:var(--surface-2);border:1px dashed var(--rule);border-radius:10px;padding:8px 15px;cursor:pointer}
.add:hover{border-color:var(--gold);color:var(--gold)}
.foot{max-width:1240px;margin-top:14px;font-size:11.5px;color:var(--ink-faint);font-style:italic;line-height:1.5}
.foot b{color:var(--ink-mute);font-style:normal}
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="eyebrow">Household · Goals</div>
      <h1>Lay the goals out — most important up top</h1>
      <div class="sub">Drag each card anywhere. Higher = matters more. Rank updates as you move them.</div>
    </div>
    <div class="totcard">
      <div class="k">Lifetime goal spend</div>
      <div class="v num" id="tot">—</div>
    </div>
  </div>

  <div class="canvas" id="canvas">
    <div class="axis">
      <div class="spine"></div>
      <div class="cap top">Must<br>fund ↑</div>
      <div class="cap bot">↓ If we<br>can</div>
    </div>
  </div>

  <div class="legend">
    <span><i style="background:var(--gold-bright)"></i>Lifelong</span>
    <span><i style="background:var(--teal-bright)"></i>Time-boxed</span>
    <span><i style="background:var(--clay)"></i>One-time</span>
    <div class="add">+ Add a goal</div>
  </div>
  <div class="foot"><b>The idea:</b> you and the client physically place every goal — drag the must-haves to the top, the
    nice-to-haves lower. The rank badge follows the height. (Mock — later this order is what the plan funds first.)</div>

<script>
const fmt=n=> n>=1000? '$'+(n/1000).toFixed(n%1000?1:0)+'k' : '$'+n;
const GOALS=[
  {name:'Healthcare top-up',  amount:12000, startAge:65, endAge:95},
  {name:'Stay in the house',  amount:5000,  startAge:65, endAge:95},
  {name:'Travel while able',  amount:18000, startAge:65, endAge:80},
  {name:"Daughter's wedding", amount:40000, startAge:68, endAge:68},
  {name:'Grandkids college',  amount:20000, startAge:72, endAge:78},
  {name:'New car',            amount:45000, startAge:70, endAge:70},
  {name:'Anniversary trip',   amount:25000, startAge:66, endAge:66},
];
function kindOf(g){
  if(g.startAge===g.endAge) return {k:'once',label:'One-time'};
  const yrs=g.endAge-g.startAge+1;
  if(yrs>=28) return {k:'rec',label:'Lifelong'};
  return {k:'win',label:yrs+' yrs'};
}
const DOT={rec:'var(--gold-bright)',win:'var(--teal-bright)',once:'var(--clay)'};
function totalOf(g){ const yrs=(g.startAge===g.endAge)?1:(g.endAge-g.startAge+1); return g.amount*yrs; }

const canvas=document.getElementById('canvas');
// scatter cards across the canvas so they read as free objects, not a stack
const startPos=[
  [180,44],[560,130],[210,250],[640,340],[250,470],[560,560],[860,60],
];
let lifetime=0;
const cards=[];
GOALS.forEach((g,i)=>{
  lifetime+=totalOf(g);
  const ki=kindOf(g);
  const el=document.createElement('div'); el.className='card';
  const [x,y]=startPos[i]||[160+i*40,40+i*40];
  el.style.left=x+'px'; el.style.top=y+'px';
  el.innerHTML=`
    <div class="top"><span class="tagdot" style="background:${DOT[ki.k]}"></span>
      <span class="cname">${g.name}</span><span class="crank num">–</span></div>
    <div class="cfoot"><span class="camt num">${fmt(g.amount)}</span>
      <span class="ckind ${ki.k}">${ki.label}</span></div>`;
  canvas.appendChild(el);
  cards.push(el);
});
document.getElementById('tot').textContent='$'+(lifetime/1e6).toFixed(2)+'M';

// rank = vertical order on the canvas (top of card center)
function rerank(){
  const sorted=[...cards].sort((a,b)=>(a.offsetTop+a.offsetHeight/2)-(b.offsetTop+b.offsetHeight/2));
  sorted.forEach((c,i)=> c.querySelector('.crank').textContent=i+1);
}
rerank();

// free pointer drag, clamped to the canvas
let active=null,offX=0,offY=0;
canvas.addEventListener('pointerdown',e=>{
  const c=e.target.closest('.card'); if(!c) return;
  active=c; c.classList.add('drag'); c.setPointerCapture(e.pointerId);
  offX=e.clientX-c.offsetLeft; offY=e.clientY-c.offsetTop;
});
canvas.addEventListener('pointermove',e=>{
  if(!active) return;
  const W=canvas.clientWidth,H=canvas.clientHeight;
  let nx=e.clientX-offX, ny=e.clientY-offY;
  nx=Math.max(124,Math.min(nx,W-active.offsetWidth-8));   // keep clear of the axis
  ny=Math.max(8,Math.min(ny,H-active.offsetHeight-8));
  active.style.left=nx+'px'; active.style.top=ny+'px';
  rerank();
});
canvas.addEventListener('pointerup',e=>{
  if(!active) return; active.classList.remove('drag'); active=null; rerank();
});
</script>
</body>
</html>
```
