const clonePristinePlan = pristinePlan => JSON.parse(JSON.stringify(pristinePlan));

/* Demo Household: Client 1 (64) and Client 2 (63), 2026, VA, MFJ.
   Matches blueprint wizard handoff demo data. */
export function createDemoHousehold(pristinePlan){
  const p = clonePristinePlan(pristinePlan);
  p.meta.householdId = 'demo';
  p.meta.name        = 'Demo Household';
  p.meta.isDemo      = true;
  p.meta.primaryName = 'Client 1';
  p.meta.spouseName  = 'Client 2';
  p.meta.filingStatus = 'marriedFilingJointly';
  p.meta.state       = 'VA';
  p.household.primary = { currentAge: 64, retirementAge: 66, planEndAge: 95, birthYear: 1962 };
  p.household.spouse  = { currentAge: 63, retirementAge: 65, birthYear: 1963 };
  p.household.children = [];
  p.portfolio.accounts.taxable     = { balance: 0, basisPct: 0.55 };
  p.portfolio.accounts.traditional = { balance: 0 };
  p.portfolio.accounts.roth        = { balance: 0 };
  p.portfolio.extraAccounts = [
    { type:'Traditional IRA',     bucket:'traditional', owner:'client', balance: 1600000 },
    { type:'Brokerage (taxable)', bucket:'taxable',     owner:'spouse', balance:  800000 },
    { type:'Roth IRA',            bucket:'roth',        owner:'spouse', balance:  400000 },
  ];
  p.properties  = [];
  p.liabilities = [];
  p.expenses.living              = 38000;
  p.expenses.healthcare          = 18000;
  p.expenses.healthcareRealGrowth = 0.02;
  p.expenses.extra = [
    { label:'Housing', amount: 34000, startAge: 64, endAge: 95 },
  ];
  p.savings.annual        = 0;
  p.income.workingIncome  = 0;
  p.income.socialSecurity.primary = { pia: 34000, claimAge: 66 };
  p.income.socialSecurity.spouse  = { pia: 28000, claimAge: 65 };
  p.income.pension = { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 };
  p.income.other   = [
    { label:'Client 1 · wages', amount: 120000, startAge: 64, endAge: 66, realGrowth: 0, taxablePct: 1 },
    { label:'Client 2 · wages', amount:  60000, startAge: 63, endAge: 65, realGrowth: 0, taxablePct: 1 },
  ];
  p.goals = [
    { name:'Travel & leisure', amount: 30000, startAge: 66, endAge: 81 },
  ];
  p.simulation.iterations = 1000;
  return p;
}

/* Empty household record with nondeterministic inputs supplied by the caller. */
export function createBlankHousehold(pristinePlan, householdId, currentYear){
  const p = clonePristinePlan(pristinePlan);
  p.meta.householdId = householdId;
  p.meta.name        = 'New Household';
  p.meta.isDemo      = false;
  p.meta.primaryName = '';
  p.meta.spouseName  = '';
  p.meta.filingStatus = 'single';
  p.meta.state       = 'VA';
  p.household.primary = { currentAge: 60, retirementAge: 65, planEndAge: 90, birthYear: currentYear - 60 };
  p.household.spouse  = null;
  p.household.children = [];
  p.portfolio.accounts.taxable     = { balance: 0, basisPct: 1.0 };
  p.portfolio.accounts.traditional = { balance: 0 };
  p.portfolio.accounts.roth        = { balance: 0 };
  p.portfolio.extraAccounts = [];
  p.properties  = [];
  p.liabilities = [];
  p.expenses.living              = 0;
  p.expenses.healthcare          = 0;
  p.expenses.healthcareRealGrowth = 0.02;
  p.expenses.extra = [];
  p.savings.annual        = 0;
  p.income.workingIncome  = 0;
  p.income.socialSecurity.primary = { pia: 0, claimAge: 67 };
  p.income.socialSecurity.spouse  = null;
  p.income.pension = { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 };
  p.income.other   = [];
  p.goals = [];
  p.simulation.iterations = 1000;
  return p;
}
