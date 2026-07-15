const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze({ ...row })));

export const INCOME_SOURCE_TYPES = freezeRows([
  { id: 'wages', label: 'Wages or salary', timing: 'working', taxablePct: 1 },
  { id: 'bonus', label: 'Bonus', timing: 'working', taxablePct: 1 },
  { id: 'self_employment', label: 'Self-employment', timing: 'working', taxablePct: 1 },
  { id: 'social_security', label: 'Social Security', timing: 'retirement', taxablePct: null },
  { id: 'pension', label: 'Pension', timing: 'retirement', taxablePct: 1 },
  { id: 'annuity', label: 'Annuity', timing: 'retirement', taxablePct: 1 },
  { id: 'rental', label: 'Rental net income', timing: 'ongoing', taxablePct: 1 },
  { id: 'interest', label: 'Interest', timing: 'ongoing', taxablePct: 1 },
  { id: 'dividends', label: 'Dividends', timing: 'ongoing', taxablePct: 1 },
  { id: 'deferred_comp', label: 'Deferred compensation', timing: 'retirement', taxablePct: 1 },
  { id: 'other', label: 'Other income', timing: 'ongoing', taxablePct: 1 },
]);

export const ADJUSTMENT_TYPES = freezeRows([
  { id: '401k', label: '401(k) contribution', note: 'pre-tax · while working' },
  { id: 'hsa', label: 'HSA contribution', note: 'reduces AGI' },
  { id: 'ira_deduction', label: 'Deductible IRA contribution', note: 'deductibility requires tax facts' },
  { id: 'other', label: 'Other adjustment', note: 'reduces AGI' },
]);

export const DEDUCTION_TYPES = freezeRows([
  { id: 'medical', label: 'Medical expenses', note: 'AGI floor not yet calculated' },
  { id: 'charitable', label: 'Charitable contributions', note: '' },
  { id: 'mortgage_interest', label: 'Mortgage interest', note: '' },
  { id: 'salt', label: 'State & local taxes', note: 'cap not yet calculated' },
  { id: 'other', label: 'Other itemized deduction', note: '' },
]);

const byId = (rows, id, fallback = 'other') =>
  rows.find(row => row.id === id) || rows.find(row => row.id === fallback) || rows[0];

export const incomeType = id => byId(INCOME_SOURCE_TYPES, id);
export const adjustmentType = id => byId(ADJUSTMENT_TYPES, id);
export const deductionType = id => byId(DEDUCTION_TYPES, id);

export function createIncomeTaxInputs(){
  return {
    adjustments: [],
    deductions: [],
    deductionMode: 'auto',
  };
}

export function currentAgeForOwner(plan, owner){
  if(owner === 'spouse' && plan.household?.spouse?.currentAge != null){
    return plan.household.spouse.currentAge;
  }
  return plan.household?.primary?.currentAge ?? 0;
}

export function retirementAgeForOwner(plan, owner){
  if(owner === 'spouse' && plan.household?.spouse?.retirementAge != null){
    return plan.household.spouse.retirementAge;
  }
  return plan.household?.primary?.retirementAge ?? currentAgeForOwner(plan, owner);
}

export function ownerLabel(plan, owner){
  if(owner === 'joint') return 'Joint';
  if(owner === 'spouse') return plan.meta?.spouseName || 'Client 2';
  return plan.meta?.primaryName || 'Client 1';
}

export function normalizedIncomeSource(plan, source = {}){
  const type = incomeType(source.typeId || source.type || 'other');
  const owner = source.owner === 'spouse' || source.owner === 'joint' ? source.owner : 'client';
  const currentAge = currentAgeForOwner(plan, owner);
  const retirementAge = retirementAgeForOwner(plan, owner);
  return {
    ...source,
    typeId: type.id,
    label: source.label || type.label,
    owner,
    amount: Math.max(0, Number(source.amount) || 0),
    startAge: source.startAge ?? currentAge,
    endAge: source.endAge ?? (type.timing === 'working' ? retirementAge - 1 : 999),
    realGrowth: Number(source.realGrowth) || 0,
    taxablePct: source.taxablePct == null ? type.taxablePct : source.taxablePct,
    qualifiedPct: source.qualifiedPct == null ? 0 : source.qualifiedPct,
    timing: type.timing,
  };
}

export function isSourceActiveNow(plan, source){
  const row = normalizedIncomeSource(plan, source);
  const age = currentAgeForOwner(plan, row.owner);
  return age >= row.startAge && age <= row.endAge;
}

export function incomeSourceGroups(plan){
  const sources = (plan.income?.other || []).map(source => normalizedIncomeSource(plan, source));
  return {
    working: sources.filter(source => source.timing !== 'retirement'),
    retirement: sources.filter(source => source.timing === 'retirement'),
  };
}

export function enteredIncomeTotal(plan){
  return (plan.income?.other || [])
    .filter(source => isSourceActiveNow(plan, source))
    .reduce((sum, source) => sum + (Number(source.amount) || 0), 0);
}

export function enteredAdjustmentTotal(plan){
  return (plan.incomeTax?.adjustments || [])
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function enteredDeductionTotal(plan){
  return (plan.incomeTax?.deductions || [])
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function createIncomeSource(plan, typeId = 'wages', owner = 'client'){
  const type = incomeType(typeId);
  const currentAge = currentAgeForOwner(plan, owner);
  const retirementAge = retirementAgeForOwner(plan, owner);
  return {
    typeId: type.id,
    label: type.label,
    owner,
    amount: 0,
    startAge: currentAge,
    endAge: type.timing === 'working' ? Math.max(currentAge, retirementAge - 1) : 999,
    realGrowth: 0,
    taxablePct: type.taxablePct,
    qualifiedPct: type.id === 'dividends' ? 0 : undefined,
  };
}

export function createAdjustment(typeId = '401k', owner = 'client'){
  const type = adjustmentType(typeId);
  return { typeId: type.id, label: type.label, owner, amount: 0 };
}

export function createDeduction(typeId = 'charitable'){
  const type = deductionType(typeId);
  return { typeId: type.id, label: type.label, amount: 0 };
}
