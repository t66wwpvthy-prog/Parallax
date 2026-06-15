// Pure formatters: value → string display
// Zero dependencies on global state, plan, scenarios, or DOM.

export const fmtMoney = v => '$'+(v||0).toLocaleString('en-US');

export function fmtM(v){
  if(!isFinite(v)||v<=0) return '$0';
  if(v>=1e6) return '$'+(v/1e6).toFixed(1)+'M';
  if(v>=1e3) return '$'+Math.round(v/1e3)+'K';
  return '$'+Math.round(v);
}

export function fmtMDelta(v){
  return (v>=0?'+':'−')+fmtM(Math.abs(v));
}

export function fmtPts(v){
  return (v>=0?'+':'−')+Math.abs(v).toFixed(1)+' pts';
}

export function cfMoney(v){
  if(!isFinite(v)) return '—';
  const n = Math.round(v);
  if(n === 0) return '$0';
  return '$' + Math.abs(n).toLocaleString('en-US');
}

export function cfRetPct(r){
  if(!isFinite(r)) return '—';
  const p = r*100;
  return (p>=0?'+':'−') + Math.abs(p).toFixed(1) + '%';
}

export function cfGain(v){
  if(!isFinite(v) || Math.round(v)===0) return '$0';
  return (v<0?'−':'+') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
}
