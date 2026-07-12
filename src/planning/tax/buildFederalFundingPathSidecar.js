import { resolveInputs } from '../../../engine.js';
import { resolvePortfolioAccounts } from '../../household/resolvePortfolioAccounts.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { buildHouseholdTaxFactContract } from './buildHouseholdTaxFactContract.js';
import { buildWithdrawalTaxCounterfactualContext } from './buildWithdrawalTaxCounterfactualContext.js';
import { runWithdrawalTaxCounterfactual } from './runWithdrawalTaxCounterfactual.js';

const PATH_KEYS = Object.freeze(['p10', 'p25', 'p50', 'p75', 'p90']);
const BUCKET_KEYS = Object.freeze(['taxable', 'traditional', 'roth']);
const RECONCILIATION_TOLERANCE = 0.01;

const SEMANTICS = Object.freeze({
  taxSource: 'federal-form-1040-line-24',
  fundingMethod: 'single-pass-positive-delta',
  phaseScope: 'retirement-only',
  lowerTaxTreatment: 'no-refund-or-redeposit',
  convergence: 'not-converged',
  pathSelection: 'shortcut-selected-anchors',
  attachmentScope: 'parent-analysis-sim-index',
  balanceTiming: 'row-opening-and-row-ending',
  withdrawals: 'gross-by-bucket-rmd-forced-and-required-separate',
  withdrawalTaxCounterfactuals: 'eight-coalition-line-24-shapley-not-converged',
});

function assertPlainObject(value, path){
  if(value === null || typeof value !== 'object' || Array.isArray(value)){
    throw new TaxInputError(`${path} must be a plain object`);
  }
  return value;
}

function assertFiniteNonNegative(value, path){
  if(typeof value !== 'number' || !Number.isFinite(value) || value < 0){
    throw new TaxInputError(`${path} must be a finite non-negative number`);
  }
  return value;
}

function assertNonNegativeInteger(value, path){
  if(!Number.isInteger(value) || value < 0){
    throw new TaxInputError(`${path} must be a non-negative integer`);
  }
  return value;
}

function assertClose(actual, expected, path){
  if(Math.abs(actual - expected) > RECONCILIATION_TOLERANCE){
    throw new TaxInputError(`${path} does not reconcile`);
  }
}

function freezeBuckets(record, path){
  assertPlainObject(record, path);
  return Object.freeze(Object.fromEntries(BUCKET_KEYS.map((bucket) => [
    bucket,
    assertFiniteNonNegative(record[bucket], `${path}.${bucket}`),
  ])));
}

function sumBuckets(record){
  return BUCKET_KEYS.reduce((sum, bucket) => sum + record[bucket], 0);
}

function assertAnalysis(analysis, path){
  assertPlainObject(analysis, path);
  assertPlainObject(analysis.params, `${path}.params`);
  if(!Array.isArray(analysis.sims) || analysis.sims.length === 0){
    throw new TaxInputError(`${path}.sims is required`);
  }
}

function assertMatchingParams(shortcutAnalysis, federalAnalysis){
  if(JSON.stringify(shortcutAnalysis.params) !== JSON.stringify(federalAnalysis.params)){
    throw new TaxInputError('federalAnalysis.params must match shortcutAnalysis.params');
  }
}

function assertPlanMatchesAnalysis(plan, overrides, params){
  assertPlainObject(overrides, 'overrides');
  let resolved;
  try{
    resolved = resolveInputs(plan, overrides);
  }catch(error){
    throw new TaxInputError(`plan and overrides could not be resolved: ${error.message}`);
  }
  if(JSON.stringify(resolved) !== JSON.stringify(params)){
    throw new TaxInputError('plan and overrides must match shortcutAnalysis.params');
  }
}

function indexCoherentSims(shortcutAnalysis, federalAnalysis){
  if(federalAnalysis.sims.length !== shortcutAnalysis.sims.length){
    throw new TaxInputError('federalAnalysis.sims must match shortcutAnalysis.sims length');
  }

  const shortcutByIndex = new Map();
  shortcutAnalysis.sims.forEach((sim, index) => {
    assertPlainObject(sim, `shortcutAnalysis.sims[${index}]`);
    assertNonNegativeInteger(sim.simIndex, `shortcutAnalysis.sims[${index}].simIndex`);
    if(!Array.isArray(sim.returnPath)){
      throw new TaxInputError(`shortcutAnalysis.sims[${index}].returnPath is required`);
    }
    if(shortcutByIndex.has(sim.simIndex)){
      throw new TaxInputError(`shortcutAnalysis.sims has duplicate simIndex ${sim.simIndex}`);
    }
    shortcutByIndex.set(sim.simIndex, sim);
  });

  const federalByIndex = new Map();
  federalAnalysis.sims.forEach((sim, index) => {
    assertPlainObject(sim, `federalAnalysis.sims[${index}]`);
    assertNonNegativeInteger(sim.simIndex, `federalAnalysis.sims[${index}].simIndex`);
    if(!Array.isArray(sim.returnPath)){
      throw new TaxInputError(`federalAnalysis.sims[${index}].returnPath is required`);
    }
    if(federalByIndex.has(sim.simIndex)){
      throw new TaxInputError(`federalAnalysis.sims has duplicate simIndex ${sim.simIndex}`);
    }
    const shortcutSim = shortcutByIndex.get(sim.simIndex);
    if(!shortcutSim || sim.returnPath !== shortcutSim.returnPath){
      throw new TaxInputError(
        `federalAnalysis.sims[${index}] must preserve shortcut simIndex and returnPath identity`
      );
    }
    federalByIndex.set(sim.simIndex, sim);
  });

  return { shortcutByIndex, federalByIndex };
}

function rowPhase(row, path){
  if(Object.prototype.hasOwnProperty.call(row, 'phase') && row.phase !== 'accum'){
    throw new TaxInputError(`${path}.phase is invalid`);
  }
  if(row.phase === 'accum') return 'accumulation';
  if(row.failed === true && row.source === null) return 'depleted';
  return 'retirement';
}

function compactRow(row, expectedSourceYear, path, previous, counterfactualContext){
  assertPlainObject(row, path);
  const year = assertNonNegativeInteger(row.year, `${path}.year`);
  if(year === 0) throw new TaxInputError(`${path}.year must be positive`);
  const age = assertFiniteNonNegative(row.age, `${path}.age`);
  if(typeof row.failed !== 'boolean'){
    throw new TaxInputError(`${path}.failed must be boolean`);
  }
  if(previous){
    if(year !== previous.year + 1 || age !== previous.age + 1){
      throw new TaxInputError(`${path} must advance exactly one year and age`);
    }
  }

  const endingBuckets = freezeBuckets(row.accountBalances, `${path}.accountBalances`);
  const withdrawalBuckets = freezeBuckets(row.accountBreakdown, `${path}.accountBreakdown`);
  const endingTotal = assertFiniteNonNegative(row.balance, `${path}.balance`);
  const grossWithdrawal = assertFiniteNonNegative(row.withdrawal ?? 0, `${path}.withdrawal`);
  const rmdForced = assertFiniteNonNegative(row.rmd ?? 0, `${path}.rmd`);
  assertClose(sumBuckets(endingBuckets), endingTotal, `${path}.accountBalances`);
  assertClose(sumBuckets(withdrawalBuckets), grossWithdrawal, `${path}.accountBreakdown`);

  const phase = rowPhase(row, path);
  let sourceYear = null;
  if(row.source !== null && row.source !== undefined){
    if(!Number.isInteger(row.source)){
      throw new TaxInputError(`${path}.source must be an integer year or null`);
    }
    sourceYear = row.source;
  }
  if(phase === 'depleted'){
    if(sourceYear !== null){
      throw new TaxInputError(`${path} depleted filler must have a null source`);
    }
  }else{
    if(!Number.isInteger(expectedSourceYear) || sourceYear !== expectedSourceYear){
      throw new TaxInputError(`${path}.source must match the funded return path`);
    }
  }
  if(phase === 'accumulation' && (grossWithdrawal !== 0 || rmdForced !== 0)){
    throw new TaxInputError(`${path} accumulation funding must be zero`);
  }
  if(phase === 'depleted' && (
    endingTotal !== 0
    || grossWithdrawal !== 0
    || sumBuckets(endingBuckets) !== 0
    || sumBuckets(withdrawalBuckets) !== 0
  )){
    throw new TaxInputError(`${path} depleted filler must be zero`);
  }

  const onePassFederalTax = phase === 'retirement'
    ? assertFiniteNonNegative(row.taxes, `${path}.taxes`)
    : null;
  let startingBalances = null;
  let taxableStartingBasis = null;
  let taxableCapitalGain = null;
  let rmdRequired = 0;
  let preTaxDeltaWithdrawalBuckets = null;
  let withdrawalTaxCounterfactual = null;
  if(phase === 'retirement'){
    preTaxDeltaWithdrawalBuckets = freezeBuckets(
      row.preTaxDeltaAccountBreakdown,
      `${path}.preTaxDeltaAccountBreakdown`
    );
    startingBalances = freezeBuckets(
      row.accountStartingBalances,
      `${path}.accountStartingBalances`
    );
    const startingTotal = assertFiniteNonNegative(row.startBalance, `${path}.startBalance`);
    assertClose(sumBuckets(startingBalances), startingTotal, `${path}.accountStartingBalances`);
    taxableStartingBasis = assertFiniteNonNegative(
      row.taxableStartingBasis,
      `${path}.taxableStartingBasis`
    );
    taxableCapitalGain = assertFiniteNonNegative(
      row.taxableCapitalGain,
      `${path}.taxableCapitalGain`
    );
    if(taxableCapitalGain > withdrawalBuckets.taxable + RECONCILIATION_TOLERANCE){
      throw new TaxInputError(`${path}.taxableCapitalGain exceeds taxable withdrawals`);
    }
    rmdRequired = assertFiniteNonNegative(row.rmdRequired, `${path}.rmdRequired`);
    for(const bucket of BUCKET_KEYS){
      if(preTaxDeltaWithdrawalBuckets[bucket]
        > withdrawalBuckets[bucket] + RECONCILIATION_TOLERANCE){
        throw new TaxInputError(
          `${path}.preTaxDeltaAccountBreakdown.${bucket} exceeds final funding`
        );
      }
    }
    const maximumRmdForced = Math.max(
      0,
      rmdRequired - preTaxDeltaWithdrawalBuckets.traditional
    );
    if(rmdForced > maximumRmdForced + RECONCILIATION_TOLERANCE){
      throw new TaxInputError(`${path}.rmd exceeds the pre-tax-delta forced amount`);
    }
    withdrawalTaxCounterfactual = runWithdrawalTaxCounterfactual(
      row,
      counterfactualContext
    );
  }

  return Object.freeze({
    year,
    age,
    phase,
    sourceYear,
    failed: row.failed,
    onePassFederalTax,
    grossWithdrawal,
    grossWithdrawalsByBucket: withdrawalBuckets,
    ...(phase === 'retirement' ? {
      rmdForced,
      rmdRequired,
      preTaxDeltaGrossWithdrawalsByBucket: preTaxDeltaWithdrawalBuckets,
      startingBalances,
      taxableStartingBasis,
      taxableCapitalGain,
      withdrawalTaxCounterfactual,
    } : {}),
    endingBalances: Object.freeze({
      ...endingBuckets,
      total: endingTotal,
    }),
  });
}

function compactPath(sim, shortcutAnchor, path, counterfactualContext){
  if(!Array.isArray(sim.rows) || sim.rows.length === 0){
    throw new TaxInputError(`${path}.rows is required`);
  }
  if(!Array.isArray(shortcutAnchor.rows) || shortcutAnchor.rows.length !== sim.rows.length){
    throw new TaxInputError(`${path}.rows must match the shortcut anchor horizon`);
  }

  const rows = [];
  sim.rows.forEach((row, index) => {
    rows.push(compactRow(
      row,
      sim.returnPath[index]?.y,
      `${path}.rows[${index}]`,
      rows[index - 1],
      counterfactualContext
    ));
  });
  const terminalBalance = assertFiniteNonNegative(sim.terminalBalance, `${path}.terminalBalance`);
  assertClose(rows.at(-1).endingBalances.total, terminalBalance, `${path}.terminalBalance`);
  if(typeof sim.failed !== 'boolean'){
    throw new TaxInputError(`${path}.failed must be boolean`);
  }
  if(rows.at(-1).failed !== sim.failed){
    throw new TaxInputError(`${path}.failed must match the final row`);
  }
  if(sim.depletionAge !== null){
    assertFiniteNonNegative(sim.depletionAge, `${path}.depletionAge`);
  }
  if((sim.failed && sim.depletionAge === null) || (!sim.failed && sim.depletionAge !== null)){
    throw new TaxInputError(`${path}.depletionAge is inconsistent with failed`);
  }
  const realFailureIndex = rows.findIndex(row => row.failed && row.phase !== 'depleted');
  if(sim.failed){
    if(realFailureIndex < 0 || sim.depletionAge !== rows[realFailureIndex].age){
      throw new TaxInputError(`${path}.depletionAge must match the first real failure row`);
    }
    if(rows.slice(0, realFailureIndex).some(row => row.failed)){
      throw new TaxInputError(`${path} has a failed row before depletion`);
    }
    if(rows.slice(realFailureIndex + 1).some(row => row.phase !== 'depleted')){
      throw new TaxInputError(`${path} rows after failure must be depleted fillers`);
    }
  }else if(rows.some(row => row.failed)){
    throw new TaxInputError(`${path} surviving path cannot contain failed rows`);
  }

  return Object.freeze({
    simIndex: sim.simIndex,
    failed: sim.failed,
    depletionAge: sim.depletionAge,
    terminalBalance,
    rows: Object.freeze(rows),
  });
}

function buildStartingBalances(params){
  const accounts = assertPlainObject(params.accounts, 'shortcutAnalysis.params.accounts');
  const taxable = assertFiniteNonNegative(accounts.taxable?.balance, 'shortcutAnalysis.params.accounts.taxable.balance');
  const traditional = assertFiniteNonNegative(accounts.traditional?.balance, 'shortcutAnalysis.params.accounts.traditional.balance');
  const roth = assertFiniteNonNegative(accounts.roth?.balance, 'shortcutAnalysis.params.accounts.roth.balance');
  return Object.freeze({
    source: 'shortcut-analysis-resolved-engine-accounts',
    accountScope: 'engine-compatible',
    taxable,
    traditional,
    roth,
    total: taxable + traditional + roth,
  });
}

function freezeScopeAccount(account){
  return Object.freeze({
    id: account.id,
    typeId: account.typeId,
    balance: account.balance,
    engineBucket: account.engineBucket,
  });
}

function buildProjectionScope(plan){
  const fold = resolvePortfolioAccounts(plan);
  const modeledIds = new Set(BUCKET_KEYS.flatMap(
    bucket => fold.engineBuckets[bucket].accountIds
  ));
  const currentOnlyAccounts = fold.pendingStrategyAccounts
    .filter(account => account.balance > 0)
    .map(freezeScopeAccount);
  const outsideTaxBucketsButModeled = fold.accounts
    .filter(account => account.balance > 0 && !account.taxBucketGroup && modeledIds.has(account.id))
    .map(freezeScopeAccount);
  const hasDifference = currentOnlyAccounts.length > 0 || outsideTaxBucketsButModeled.length > 0;
  const householdIssues = Object.freeze([...fold.issues]);

  return Object.freeze({
    status: householdIssues.length
      ? 'blocked-household-issues'
      : hasDifference ? 'ready-with-scope-difference' : 'ready',
    balanceScope: hasDifference ? 'scope-difference' : 'aligned',
    currentOnlyRulesPendingAccounts: Object.freeze(currentOnlyAccounts),
    outsideTaxBucketsButModeledAccounts: Object.freeze(outsideTaxBucketsButModeled),
    householdIssues,
  });
}

/**
 * Compact, immutable evidence from the existing one-pass federal funding run.
 * Paths remain anchored to the shortcut analysis so later comparisons use the
 * same market sequence. This module creates no tax or projection math.
 */
export function buildFederalFundingPathSidecar(
  shortcutAnalysis,
  federalAnalysis,
  plan,
  overrides = {},
  taxOptions = {}
){
  assertAnalysis(shortcutAnalysis, 'shortcutAnalysis');
  assertAnalysis(federalAnalysis, 'federalAnalysis');
  assertMatchingParams(shortcutAnalysis, federalAnalysis);
  assertPlanMatchesAnalysis(plan, overrides, shortcutAnalysis.params);
  const { shortcutByIndex, federalByIndex } = indexCoherentSims(
    shortcutAnalysis,
    federalAnalysis
  );
  const taxFacts = buildHouseholdTaxFactContract(plan);
  const counterfactualContext = buildWithdrawalTaxCounterfactualContext(
    plan,
    shortcutAnalysis.params,
    taxOptions,
    { taxFacts }
  );

  const total = assertNonNegativeInteger(federalAnalysis.total, 'federalAnalysis.total');
  const survived = assertNonNegativeInteger(federalAnalysis.survived, 'federalAnalysis.survived');
  const successRate = assertFiniteNonNegative(
    federalAnalysis.successRate,
    'federalAnalysis.successRate'
  );
  if(total === 0 || total !== federalAnalysis.sims.length || survived > total || successRate > 100){
    throw new TaxInputError('federalAnalysis success summary is inconsistent');
  }
  assertClose(successRate, total ? (survived / total) * 100 : 0, 'federalAnalysis.successRate');

  const paths = {};
  const compactBySimIndex = new Map();
  for(const pathKey of PATH_KEYS){
    const anchor = shortcutAnalysis.paths?.[pathKey];
    assertPlainObject(anchor, `shortcutAnalysis.paths.${pathKey}`);
    assertNonNegativeInteger(anchor.simIndex, `shortcutAnalysis.paths.${pathKey}.simIndex`);
    if(!Array.isArray(anchor.returnPath)){
      throw new TaxInputError(`shortcutAnalysis.paths.${pathKey}.returnPath is required`);
    }
    const shortcutSim = shortcutByIndex.get(anchor.simIndex);
    if(!shortcutSim || shortcutSim.returnPath !== anchor.returnPath){
      throw new TaxInputError(
        `shortcutAnalysis.paths.${pathKey} must reference shortcutAnalysis.sims`
      );
    }
    let compact = compactBySimIndex.get(anchor.simIndex);
    if(!compact){
      compact = compactPath(
        federalByIndex.get(anchor.simIndex),
        anchor,
        `federalAnalysis.paths.${pathKey}`,
        counterfactualContext
      );
      compactBySimIndex.set(anchor.simIndex, compact);
    }
    paths[pathKey] = compact;
  }

  return Object.freeze({
    schemaVersion: 2,
    successRate,
    survived,
    total,
    semantics: SEMANTICS,
    startingBalances: buildStartingBalances(shortcutAnalysis.params),
    projectionScope: buildProjectionScope(plan),
    taxFacts,
    paths: Object.freeze(paths),
  });
}

export { PATH_KEYS as FEDERAL_FUNDING_PATH_KEYS };
