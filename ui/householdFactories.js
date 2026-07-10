const clonePristinePlan = pristinePlan => JSON.parse(JSON.stringify(pristinePlan));

/* Demo Household: Client 1 (64) and Client 2 (63), 2026, VA, MFJ.
   Returns a fresh, self-contained plan record. */
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
  // Sleeves are aggregation targets (engine folds extraAccounts into them by
  // bucket); the portfolio itself is TYPED accounts from the Account Type Bank.
  p.portfolio.accounts.taxable     = { balance: 0, basisPct: 0.55 };
  p.portfolio.accounts.traditional = { balance: 0 };
  p.portfolio.accounts.roth        = { balance: 0 };
  p.portfolio.extraAccounts = [
    { type:'Joint brokerage', bucket:'taxable',     owner:'joint',  balance:  501377 },
    { type:'Checking',        bucket:'taxable',     owner:'joint',  balance:   18727 },
    { type:'401(k)',          bucket:'traditional', owner:'client', balance:  494606 },
    { type:'Traditional IRA', bucket:'traditional', owner:'client', balance: 1213686 },
    { type:'401(k)',          bucket:'traditional', owner:'spouse', balance:  159928 },
    { type:'Roth IRA',        bucket:'roth',        owner:'spouse', balance:  139296 },
  ];
  p.properties  = [];
  p.liabilities = [];
  p.expenses.living              = 48000;
  p.expenses.healthcare          = 11418;
  p.expenses.healthcareRealGrowth = 0.02;
  p.savings.annual        = 30000;
  p.income.workingIncome  = 0;
  p.income.socialSecurity.primary = { pia: 55200, claimAge: 67 };
  p.income.socialSecurity.spouse  = { pia: 18000, claimAge: 67 };
  p.income.pension = { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 };
  p.income.other   = [];
  p.goals = [
    { name:'Glebe Fee',                                amount: 100092, startAge: 71, endAge: 95 },
    { name:'Lifestyle Vacation (Poland & California)', amount:  20000, startAge: 71, endAge: 95 },
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
