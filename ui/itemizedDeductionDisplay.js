const SALT_TYPE_IDS = new Set(['salt', 'real_estate_tax', 'personal_property_tax']);
const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');

/** Pure copy helper so deduction limitations stay display-only in the UI. */
export function itemizedDeductionLimitCopy(summary, typeId){
  if(summary?.status !== 'ready') return '';
  const breakdown = summary.itemizedDeductionBreakdown;
  if(!breakdown) return '';

  if(typeId === 'medical'){
    const medical = breakdown.medical;
    if(!medical || !(medical.enteredAmount > medical.appliedAmount)) return '';
    if(!(medical.appliedAmount > 0)){
      return `below 7.5% AGI floor — ${money(medical.appliedAmount)} applied`;
    }
    return `${money(medical.enteredAmount)} entered — ${money(medical.appliedAmount)} applied after 7.5% AGI floor`;
  }

  if(SALT_TYPE_IDS.has(typeId)){
    const salt = breakdown.salt;
    if(!salt || !(salt.enteredAmount > salt.appliedAmount)) return '';
    return `${money(salt.enteredAmount)} entered — capped at ${money(salt.capAmount)}`;
  }

  return '';
}

function typeIdFromLabel(input){
  const label = (input.getAttribute('aria-label') || '').toLowerCase();
  if(label.includes('medical')) return 'medical';
  if(label.includes('real-estate')) return 'real_estate_tax';
  if(label.includes('personal-property')) return 'personal_property_tax';
  if(label.includes('state & local') || label.includes('salt')) return 'salt';
  return '';
}

function typeIdForInput(input, deductions){
  if(input.dataset.hhFixedType) return input.dataset.hhFixedType;
  const match = /^incomeTax\.deductions\.(\d+)\.amount$/.exec(input.dataset.path || '');
  return (match ? deductions[Number(match[1])]?.typeId : '') || typeIdFromLabel(input);
}

/** Attach entered-vs-applied copy to the already-rendered GPC deduction rows. */
export function applyItemizedDeductionDisplay(root, summary, deductions = []){
  if(!root || summary?.status !== 'ready') return;
  let saltShown = false;
  const inputs = root.querySelectorAll(
    '[data-hh-fixed-kind="deduction"], input[data-path^="incomeTax.deductions."][data-path$=".amount"]'
  );
  for(const input of inputs){
    const typeId = typeIdForInput(input, deductions);
    if(SALT_TYPE_IDS.has(typeId)){
      if(saltShown) continue;
      saltShown = true;
    }
    const copy = itemizedDeductionLimitCopy(summary, typeId);
    if(!copy) continue;
    const label = input.closest('.gpc-field-row')?.querySelector('.gpc-field-row__lbl');
    if(!label || label.querySelector('[data-gpc-deduction-limit]')) continue;
    const note = document.createElement('em');
    note.dataset.gpcDeductionLimit = '';
    note.textContent = ` · ${copy}`;
    label.append(note);
  }
}
