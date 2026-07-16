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
  { id: 'tax_exempt_interest', label: 'Tax-exempt interest', timing: 'current', taxablePct: 0 },
  { id: 'dividends', label: 'Dividends', timing: 'ongoing', taxablePct: 1 },
  { id: 'ira_distribution', label: 'IRA distributions', timing: 'current', taxablePct: 1 },
  { id: 'roth_conversion', label: 'Roth conversions', timing: 'current', taxablePct: 1 },
  { id: 'short_term_capital_gain', label: 'Short-term capital gains', timing: 'current', taxablePct: 1 },
  { id: 'long_term_capital_gain', label: 'Long-term capital gains', timing: 'current', taxablePct: 0 },
  { id: 'deferred_comp', label: 'Deferred compensation', timing: 'retirement', taxablePct: 1 },
  { id: 'other', label: 'Other income', timing: 'ongoing', taxablePct: 1 },
]);

export const ADJUSTMENT_TYPES = freezeRows([
  { id: '401k', label: '401(k) contribution', note: 'pre-tax · while working' },
  { id: 'hsa', label: 'HSA contribution', note: 'reduces AGI' },
  { id: 'ira_deduction', label: 'Deductible IRA contributions', note: 'deductibility requires tax facts' },
  { id: 'other', label: 'Other adjustment', note: 'reduces AGI' },
]);

export const DEDUCTION_TYPES = freezeRows([
  { id: 'medical', label: 'Medical expenses', note: 'AGI floor not yet calculated' },
  { id: 'charitable', label: 'Charitable contributions', note: '' },
  { id: 'mortgage_interest', label: 'Mortgage interest', note: '' },
  { id: 'real_estate_tax', label: 'Real-estate taxes', note: 'SALT cap rule not yet calculated' },
  { id: 'personal_property_tax', label: 'Personal-property taxes', note: 'SALT cap rule not yet calculated' },
  { id: 'salt', label: 'State & local taxes', note: 'cap not yet calculated' },
  { id: 'other', label: 'Other itemized deduction', note: '' },
]);

export const CREDIT_TYPES = freezeRows([
  { id: 'premium_tax_credit', label: 'Premium Tax Credit', note: 'applied as entered on Form 1040 line 20' },
]);

export const REQUIRED_INCOME_SOURCE_TYPE_IDS = Object.freeze([
  'tax_exempt_interest',
  'ira_distribution',
  'roth_conversion',
  'short_term_capital_gain',
  'long_term_capital_gain',
]);
export const REQUIRED_ADJUSTMENT_TYPE_IDS = Object.freeze(['ira_deduction']);
export const REQUIRED_DEDUCTION_TYPE_IDS = Object.freeze(['real_estate_tax', 'personal_property_tax']);
export const REQUIRED_CREDIT_TYPE_IDS = Object.freeze(['premium_tax_credit']);

const byId = (rows, id, fallback = 'other') =>
  rows.find(row => row.id === id) || rows.find(row => row.id === fallback) || rows[0];

export const incomeType = id => byId(INCOME_SOURCE_TYPES, id);
export const adjustmentType = id => byId(ADJUSTMENT_TYPES, id);
export const deductionType = id => byId(DEDUCTION_TYPES, id);
export const creditType = id => byId(CREDIT_TYPES, id, 'premium_tax_credit');

export function createIncomeTaxInputs(){
  return {
    adjustments: [],
    deductions: [],
    credits: [],
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

function retirementAgeForSource(plan, owner){
  if(owner !== 'joint') return retirementAgeForOwner(plan, owner);
  return Math.max(
    retirementAgeForOwner(plan, 'client'),
    plan.household?.spouse ? retirementAgeForOwner(plan, 'spouse') : 0,
  );
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
    endAge: source.endAge ?? (type.timing === 'working'
      ? retirementAge - 1
      : type.timing === 'current' ? currentAge : 999),
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

export function incomePhase(plan, source){
  const row = normalizedIncomeSource(plan, source);
  return row.startAge >= retirementAgeForSource(plan, row.owner) ? 'retirement' : 'working';
}

export function incomeSourceGroups(plan){
  const sources = (plan.income?.other || []).map(source => normalizedIncomeSource(plan, source));
  return {
    working: sources.filter(source => incomePhase(plan, source) === 'working'),
    retirement: sources.filter(source => incomePhase(plan, source) === 'retirement'),
  };
}

export function enteredIncomeTotal(plan){
  return (plan.income?.other || [])
    .filter(source => isSourceActiveNow(plan, source))
    .reduce((sum, source) => sum + (Number(source.amount) || 0), 0);
}

export function enteredAdjustmentTotal(plan){
  return (plan.incomeTax?.adjustments || [])
    .filter(row => isAdjustmentActiveNow(plan, row))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function isAdjustmentActiveNow(plan, row = {}){
  const type = adjustmentType(row.typeId);
  const whileWorkingOnly = row.whileWorkingOnly == null
    ? type.id === '401k'
    : row.whileWorkingOnly === true;
  if(!whileWorkingOnly) return true;
  if(row.owner === 'joint'){
    return currentAgeForOwner(plan, 'client') < retirementAgeForOwner(plan, 'client')
      || (plan.household?.spouse
        && currentAgeForOwner(plan, 'spouse') < retirementAgeForOwner(plan, 'spouse'));
  }
  const owner = row.owner === 'spouse' ? 'spouse' : 'client';
  return currentAgeForOwner(plan, owner) < retirementAgeForOwner(plan, owner);
}

export function enteredDeductionTotal(plan){
  return (plan.incomeTax?.deductions || [])
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function enteredCreditTotal(plan){
  return (plan.incomeTax?.credits || [])
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
    endAge: type.timing === 'working'
      ? Math.max(currentAge, retirementAge - 1)
      : type.timing === 'current' ? currentAge : 999,
    realGrowth: 0,
    taxablePct: type.taxablePct,
    qualifiedPct: type.id === 'dividends' ? 0 : undefined,
  };
}

export function createAdjustment(typeId = '401k', owner = 'client'){
  const type = adjustmentType(typeId);
  return {
    typeId: type.id,
    label: type.label,
    owner,
    amount: 0,
    whileWorkingOnly: type.id === '401k',
  };
}

export function createDeduction(typeId = 'charitable'){
  const type = deductionType(typeId);
  return { typeId: type.id, label: type.label, amount: 0 };
}

export function createCredit(typeId = 'premium_tax_credit'){
  const type = creditType(typeId);
  return { typeId: type.id, label: type.label, amount: 0 };
}

export function ensureRequiredIncomeTaxInputs(plan){
  if(!plan.income) plan.income = {};
  if(!Array.isArray(plan.income.other)) plan.income.other = [];
  if(!plan.incomeTax) plan.incomeTax = createIncomeTaxInputs();
  if(!Array.isArray(plan.incomeTax.adjustments)) plan.incomeTax.adjustments = [];
  if(!Array.isArray(plan.incomeTax.deductions)) plan.incomeTax.deductions = [];
  if(!Array.isArray(plan.incomeTax.credits)) plan.incomeTax.credits = [];

  for(const typeId of REQUIRED_INCOME_SOURCE_TYPE_IDS){
    if(!plan.income.other.some(row => row.typeId === typeId)){
      plan.income.other.push(createIncomeSource(plan, typeId, 'client'));
    }
  }
  for(const typeId of REQUIRED_ADJUSTMENT_TYPE_IDS){
    if(!plan.incomeTax.adjustments.some(row => row.typeId === typeId)){
      plan.incomeTax.adjustments.push(createAdjustment(typeId, 'client'));
    }
  }
  for(const typeId of REQUIRED_DEDUCTION_TYPE_IDS){
    if(!plan.incomeTax.deductions.some(row => row.typeId === typeId)){
      plan.incomeTax.deductions.push(createDeduction(typeId));
    }
  }
  for(const typeId of REQUIRED_CREDIT_TYPE_IDS){
    if(!plan.incomeTax.credits.some(row => row.typeId === typeId)){
      plan.incomeTax.credits.push(createCredit(typeId));
    }
  }
  return plan;
}
