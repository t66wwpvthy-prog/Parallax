import { getAccountTypeById } from './accountTypes.js';
import { validateBasisEnvelope } from './factEnvelope.js';
import { resolvePortfolioAccounts } from './resolvePortfolioAccounts.js';

const GAP_AFFECTS = 'taxable-withdrawal-gain';

function freezeGap(code, account, path, kind = 'missing-fact'){
  return Object.freeze({
    code,
    kind,
    accountId: account?.id ?? null,
    path,
    affects: GAP_AFFECTS,
  });
}

function freezeRecord(account, disposition, basisAmount, reason, raw = null){
  return Object.freeze({
    accountId: account.id,
    typeId: account.typeId,
    taxCharacter: account.taxCharacter,
    balance: account.balance,
    disposition,
    basisAmount,
    basisStatus: raw?.basis?.status ?? account.basis?.status ?? null,
    source: raw?.basis?.source ?? account.basis?.source ?? null,
    confirmedAt: raw?.basis?.confirmedAt ?? account.basis?.confirmedAt ?? null,
    reason,
  });
}

function freezeReportingSnapshot(reporting){
  return Object.freeze({
    inclusion: reporting.inclusion,
    reportingTaxpayer: reporting.reportingTaxpayer,
    householdReturnShare: reporting.householdReturnShare,
  });
}

export function resolveAccountTaxReportingGap(raw, account, plan){
  const reporting = raw?.taxReporting;
  const path = `portfolio.extraAccounts.${account.sourceIndex}.taxReporting`;
  if(!reporting || typeof reporting !== 'object' || Array.isArray(reporting)){
    return freezeGap('TAX_REPORTING_MISSING', account, path, 'reporting');
  }
  if(reporting.inclusion !== 'household-return'){
    return freezeGap(
      reporting.inclusion === 'unknown'
        ? 'TAX_REPORTING_INCLUSION_UNKNOWN'
        : 'TAX_REPORTING_OUTSIDE_HOUSEHOLD_RETURN',
      account,
      `${path}.inclusion`,
      'reporting'
    );
  }
  if(reporting.householdReturnShare !== 1){
    return freezeGap(
      reporting.householdReturnShare == null
        ? 'TAX_REPORTING_SHARE_UNKNOWN'
        : 'TAX_REPORTING_FRACTIONAL_SHARE_UNSUPPORTED',
      account,
      `${path}.householdReturnShare`,
      'reporting'
    );
  }
  if(plan?.meta?.filingStatus === 'marriedFilingSeparately'){
    return freezeGap('MFS_ACCOUNT_ATTRIBUTION_UNSUPPORTED', account, path, 'reporting');
  }
  if(account.owner === 'spouse'
    && (plan?.meta?.filingStatus === 'single'
      || plan?.meta?.filingStatus === 'headOfHousehold')){
    return freezeGap(
      'FILING_STATUS_ACCOUNT_OWNER_MISMATCH',
      account,
      path,
      'reporting'
    );
  }

  const taxpayer = reporting.reportingTaxpayer;
  const owner = account.owner;
  const consistent = owner === 'client' || owner === 'spouse'
    ? taxpayer === owner || taxpayer === 'return-level'
    : taxpayer === 'return-level';
  if(!consistent){
    return freezeGap(
      'TAX_REPORTING_OWNER_MISMATCH',
      account,
      `${path}.reportingTaxpayer`,
      'reporting'
    );
  }
  return null;
}

function capitalAssetEvidence(account, raw, plan){
  const path = `portfolio.extraAccounts.${account.sourceIndex}`;
  const entry = getAccountTypeById(account.typeId);
  if(!entry?.supportedForTax){
    return {
      record: freezeRecord(account, 'readiness-only', null, 'unsupported-tax-treatment', raw),
      gap: freezeGap(
        'TAXABLE_ACCOUNT_TAX_TREATMENT_UNSUPPORTED',
        account,
        `${path}.typeId`,
        'scope'
      ),
    };
  }

  const reportGap = resolveAccountTaxReportingGap(raw, account, plan);
  if(reportGap){
    return {
      record: freezeRecord(account, 'readiness-only', null, 'reporting-not-ready', raw),
      gap: reportGap,
    };
  }

  try{
    validateBasisEnvelope(raw?.basis, `${path}.basis`);
  }catch{
    return {
      record: freezeRecord(account, 'readiness-only', null, 'invalid-basis-envelope', raw),
      gap: freezeGap('TAXABLE_BASIS_ENVELOPE_INVALID', account, `${path}.basis`, 'invalid'),
    };
  }

  if(raw.basis.status !== 'confirmed'){
    return {
      record: freezeRecord(
        account,
        'readiness-only',
        null,
        raw.basis.status === 'assumed' ? 'assumed-basis' : 'unknown-basis',
        raw
      ),
      gap: freezeGap(
        raw.basis.status === 'assumed' ? 'TAXABLE_BASIS_ASSUMED' : 'TAXABLE_BASIS_UNKNOWN',
        account,
        `${path}.basis`,
        raw.basis.status === 'assumed' ? 'assumption' : 'missing-fact'
      ),
    };
  }
  if(raw.basis.method !== 'reported-cost-basis'){
    return {
      record: freezeRecord(account, 'readiness-only', null, 'unsupported-basis-method', raw),
      gap: freezeGap(
        'TAXABLE_BASIS_METHOD_UNSUPPORTED',
        account,
        `${path}.basis.method`,
        'rules-pending'
      ),
    };
  }

  return {
    record: freezeRecord(account, 'calculation', raw.basis.amount, null, raw),
    gap: null,
  };
}

/**
 * Resolve the only Household tax fact the current engine can consume directly:
 * a complete starting basis for its aggregated taxable sleeve.
 *
 * Confirmed typed-account facts override the legacy percentage only when the
 * entire material taxable sleeve is covered. Otherwise the existing basisPct
 * behavior remains explicit and unchanged while readiness gaps are returned.
 */
export function resolveTaxableStartingBasis(plan, suppliedFold = null){
  const fold = suppliedFold ?? resolvePortfolioAccounts(plan);
  const modeledTaxableIds = new Set(fold.engineBuckets.taxable.accountIds);
  const accounts = fold.accounts.filter(
    account => modeledTaxableIds.has(account.id) && account.balance > 0
  );
  const records = [];
  const gaps = [];
  const evidence = [];
  const accountIds = [];
  let completeBasis = 0;
  let hasLegacyAssumption = false;

  for(const account of accounts){
    accountIds.push(account.id);
    if(account.sourceKind === 'legacy-base'){
      hasLegacyAssumption = true;
      records.push(freezeRecord(
        account,
        'legacy-assumption',
        account.basis?.amount ?? null,
        'legacy-basis-percent'
      ));
      gaps.push(freezeGap(
        'LEGACY_TAXABLE_BASIS_ASSUMPTION',
        account,
        'portfolio.accounts.taxable.basisPct',
        'assumption'
      ));
      continue;
    }

    const raw = plan?.portfolio?.extraAccounts?.[account.sourceIndex];
    if(account.owner === 'spouse' && !plan?.household?.spouse){
      records.push(freezeRecord(account, 'readiness-only', null, 'owner-without-spouse', raw));
      gaps.push(freezeGap(
        'ACCOUNT_OWNER_WITHOUT_SPOUSE',
        account,
        `portfolio.extraAccounts.${account.sourceIndex}.owner`,
        'household'
      ));
      continue;
    }
    if(account.owner === 'trust'){
      records.push(freezeRecord(account, 'readiness-only', null, 'trust-treatment-unsupported', raw));
      gaps.push(freezeGap(
        'TRUST_ACCOUNT_TAX_TREATMENT_UNSUPPORTED',
        account,
        `portfolio.extraAccounts.${account.sourceIndex}.owner`,
        'scope'
      ));
      continue;
    }
    if(account.taxCharacter === 'taxable_cash'){
      const reportGap = resolveAccountTaxReportingGap(raw, account, plan);
      if(reportGap){
        records.push(freezeRecord(account, 'readiness-only', null, 'reporting-not-ready', raw));
        gaps.push(reportGap);
        continue;
      }
      completeBasis += account.balance;
      records.push(freezeRecord(account, 'structural-principal', account.balance, null, raw));
      evidence.push(Object.freeze({
        accountId: account.id,
        amount: account.balance,
        method: 'principal',
        status: 'structural',
        source: null,
        confirmedAt: null,
        reporting: freezeReportingSnapshot(raw.taxReporting),
      }));
      continue;
    }
    if(account.taxCharacter === 'capital_asset'){
      const result = capitalAssetEvidence(account, raw, plan);
      records.push(result.record);
      if(result.gap){
        gaps.push(result.gap);
      }else{
        completeBasis += result.record.basisAmount;
        evidence.push(Object.freeze({
          accountId: account.id,
          amount: result.record.basisAmount,
          method: raw.basis.method,
          status: raw.basis.status,
          source: result.record.source,
          confirmedAt: result.record.confirmedAt,
          reporting: freezeReportingSnapshot(raw.taxReporting),
        }));
      }
      continue;
    }

    records.push(freezeRecord(account, 'readiness-only', null, 'unclassified-taxable-treatment', raw));
    gaps.push(freezeGap(
      'TAXABLE_ACCOUNT_CLASSIFICATION_UNSUPPORTED',
      account,
      `portfolio.extraAccounts.${account.sourceIndex}`,
      'scope'
    ));
  }

  for(const issue of fold.issues){
    gaps.unshift(Object.freeze({
      code: `HOUSEHOLD_${issue}`,
      kind: 'household',
      accountId: null,
      path: 'portfolio',
      affects: GAP_AFFECTS,
    }));
  }

  const taxableBalance = fold.engineBuckets.taxable.balance;
  const legacyFallbackBasis = taxableBalance * plan.portfolio.accounts.taxable.basisPct;
  const blocked = fold.issues.length > 0;
  const completeConfirmed = !blocked && !hasLegacyAssumption && gaps.length === 0;
  const lossTreatmentPending = taxableBalance > 0
    && completeConfirmed
    && completeBasis > taxableBalance;
  if(lossTreatmentPending){
    gaps.push(freezeGap(
      'TAXABLE_LOSS_TREATMENT_PENDING',
      null,
      'portfolio.extraAccounts',
      'rules-pending'
    ));
  }
  const basisOverride = taxableBalance === 0
    ? 0
    : completeConfirmed && !lossTreatmentPending ? completeBasis : null;
  const resolvedRecords = lossTreatmentPending
    ? records.map(record => (
        record.disposition === 'calculation' || record.disposition === 'structural-principal'
          ? Object.freeze({
              ...record,
              disposition: 'readiness-only',
              reason: 'loss-treatment-pending',
            })
          : record
      ))
    : records;
  const status = blocked
    ? 'blocked'
    : taxableBalance === 0
      ? 'not-applicable'
      : lossTreatmentPending
        ? 'rules-pending'
      : completeConfirmed
        ? 'confirmed'
        : hasLegacyAssumption && gaps.length === 1
          ? 'legacy-assumption'
          : 'incomplete';

  return Object.freeze({
    status,
    taxableBalance,
    basisOverride,
    legacyFallbackBasis,
    appliedBasis: basisOverride ?? legacyFallbackBasis,
    appliedMode: basisOverride === null ? 'legacy-basis-percent' : 'confirmed-or-structural',
    accountIds: Object.freeze(accountIds),
    evidence: Object.freeze(evidence),
    records: Object.freeze(resolvedRecords),
    gaps: Object.freeze(gaps),
  });
}
