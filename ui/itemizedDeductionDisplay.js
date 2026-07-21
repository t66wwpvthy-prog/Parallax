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

/** Attach entered-vs-applied copy to the already-rendered GPC deduction rows. */
export function applyItemizedDeductionDisplay(root, summary){
  if(!root || summary?.status !== 'ready') return;
  let saltShown = false;
  for(const input of root.querySelectorAll('[data-hh-fixed-kind="deduction"]')){
    const typeId = input.dataset.hhFixedType;
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
