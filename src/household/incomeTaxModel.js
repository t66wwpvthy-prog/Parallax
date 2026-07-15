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
  { id: 'short_term_capital_gains', label: 'Legacy external short-term gain', timing: 'ongoing', taxablePct: 1, projectionEnabled: false },
  { id: 'long_term_capital_gains', label: 'Legacy external long-term gain', timing: 'ongoing', taxablePct: 1, projectionEnabled: false },
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
  { id: 'medical', label: 'Medical expenses', note: 'AGI-floor rule support required' },
  { id: 'charitable', label: 'Charitable contributions', note: '' },
  { id: 'mortgage_interest', label: 'Mortgage interest', note: '' },
  { id: 'investment_interest', label: 'Investment interest', note: '' },
  { id: 'state_local_income_tax', label: 'State & local income taxes', note: 'SALT-cap rule support required' },
  { id: 'real_estate_tax', label: 'Real-estate taxes', note: 'SALT-cap rule support required' },
  { id: 'personal_property_tax', label: 'Personal-property taxes', note: 'SALT-cap rule support required' },
  { id: 'salt', label: 'Other state & local taxes', note: 'SALT-cap rule support required' },
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
    realizedGains: { shortTerm: 0, longTerm: 0 },
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
  const amount = Math.max(0, Number(source.amount) || 0);
  const netTaxable = source.netTaxable == null ? null : Math.max(0, Number(source.netTaxable) || 0);
  const taxablePct = type.id === 'rental' && netTaxable != null && amount > 0
    ? Math.max(0, Math.min(1, netTaxable / amount))
    : Math.max(0, Math.min(1, Number(source.taxablePct == null ? type.taxablePct : source.taxablePct) || 0));
  return {
    ...source,
    typeId: type.id,
    label: source.label || type.label,
    owner,
    amount,
    startAge: source.startAge ?? currentAge,
    endAge: source.endAge ?? (type.timing === 'working' ? retirementAge - 1 : 999),
    realGrowth: Number(source.realGrowth) || 0,
    taxablePct,
    qualifiedPct: Math.max(0, Math.min(1, Number(source.qualifiedPct) || 0)),
    netTaxable,
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
    working: sources.filter(source => source.startAge < retirementAgeForOwner(plan, source.owner)),
    retirement: sources.filter(source => source.startAge >= retirementAgeForOwner(plan, source.owner)),
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
    netTaxable: type.id === 'rental' ? 0 : undefined,
  };
}

export function retagIncomeSource(plan, source, typeId){
  const previous = incomeType(source?.typeId);
  const next = createIncomeSource(plan, typeId, source?.owner || 'client');
  const keepCustomLabel = source?.label && source.label !== previous.label;
  return {
    ...source,
    typeId: next.typeId,
    label: keepCustomLabel ? source.label : next.label,
    taxablePct: next.taxablePct,
    qualifiedPct: next.qualifiedPct,
    netTaxable: next.netTaxable,
  };
}

export function createAdjustment(typeId = '401k', owner = 'client'){
  const type = adjustmentType(typeId);
  return { typeId: type.id, label: type.label, owner, amount: 0, whileWorkingOnly: type.id === '401k' };
}

export function createDeduction(typeId = 'charitable'){
  const type = deductionType(typeId);
  return { typeId: type.id, label: type.label, amount: 0 };
}
