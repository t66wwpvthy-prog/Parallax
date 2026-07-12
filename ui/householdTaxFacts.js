import { getAccountTypeById } from '../src/household/accountTypes.js';
import {
  MAX_TAX_FACT_YEAR,
  MIN_TAX_FACT_YEAR,
} from '../src/household/taxFactDefinitions.js';
import { escHtml } from './dom.js';

const TRADITIONAL_IRA_FIELDS = Object.freeze([
  Object.freeze({
    key: 'priorYearCarryforwardBasis',
    label: 'Prior-year nondeductible basis',
    helper: 'Use the carryforward basis from the latest filed Form 8606.',
    semantic: 'nonnegative-number',
    money: true,
  }),
  Object.freeze({
    key: 'currentYearNondeductibleContributions',
    label: 'Current-year nondeductible contributions',
    semantic: 'nonnegative-number',
    money: true,
  }),
  Object.freeze({
    key: 'yearEndAggregateValueOverride',
    label: 'Year-end aggregate IRA value override',
    helper: 'Optional total across this person\'s Traditional, SEP, and SIMPLE IRAs.',
    semantic: 'nonnegative-number',
    money: true,
  }),
  Object.freeze({
    key: 'outstandingRolloversAtYearEnd',
    label: 'Outstanding rollovers at year-end',
    semantic: 'nonnegative-number',
    money: true,
  }),
  Object.freeze({
    key: 'otherForm8606Adjustments',
    label: 'Other Form 8606 adjustments',
    helper: 'Enter a negative amount when the adjustment reduces basis.',
    semantic: 'finite-number',
  }),
]);

const ROTH_IRA_FIELDS = Object.freeze([
  Object.freeze({
    key: 'firstContributionYear',
    label: 'First Roth IRA contribution year',
    semantic: 'year',
  }),
  Object.freeze({
    key: 'contributionBasis',
    label: 'Roth IRA contribution basis',
    semantic: 'nonnegative-number',
    money: true,
  }),
]);

const EMPLOYER_PLAN_FIELDS = Object.freeze([
  Object.freeze({
    key: 'afterTaxContributionBasis',
    label: 'After-tax contribution basis',
    semantic: 'nonnegative-number',
    money: true,
  }),
  Object.freeze({
    key: 'planSubtypeConfirmed',
    label: 'Plan type confirmed?',
    helper: 'Confirm that the account type shown above matches the plan statement.',
    semantic: 'boolean',
  }),
]);

const DESIGNATED_ROTH_FIELDS = Object.freeze([
  Object.freeze({
    key: 'firstContributionYear',
    label: 'First designated Roth contribution year',
    semantic: 'year',
  }),
  Object.freeze({
    key: 'contributionBasis',
    label: 'Designated Roth contribution basis',
    semantic: 'nonnegative-number',
    money: true,
  }),
]);

function safeId(value){
  return Array.from(String(value || 'unknown'))
    .map(char => char.codePointAt(0).toString(16))
    .join('-');
}

function displayValue(value, { money = false } = {}){
  if(value === null || value === undefined || value === '') return '';
  if(money && typeof value === 'number' && Number.isFinite(value)){
    return Math.round(value).toLocaleString('en-US');
  }
  return String(value);
}

function factValue(fact, spec){
  if(!fact || fact.status === 'unknown') return '';
  return displayValue(fact.value, spec);
}

function accountName(account, entry){
  return account.type || entry?.label || 'Account';
}

function ownerName(plan, owner){
  if(owner === 'spouse') return plan.meta?.spouseName || 'Co-Client';
  return plan.meta?.primaryName || 'Client';
}

function ownerRole(owner){
  if(owner === 'spouse') return 'Co-Client';
  if(owner === 'joint') return 'Joint';
  if(owner === 'trust') return 'Trust';
  return 'Client';
}

function attributeString(attributes){
  return Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => `${name}="${escHtml(value)}"`)
    .join(' ');
}

function renderFactControl({ id, label, helper, value, semantic, money = false, attributes }){
  const helpId = helper ? `${id}-help` : null;
  const common = attributeString({
    id,
    class: 'hh-tax-input',
    ...attributes,
    'data-hh-tax-semantic': semantic,
    'aria-describedby': helpId,
  });
  let control;
  if(semantic === 'boolean'){
    control = `<select ${common}>
      <option value=""${value === '' ? ' selected' : ''}>Not provided</option>
      <option value="true"${value === true || value === 'true' ? ' selected' : ''}>Yes</option>
      <option value="false"${value === false || value === 'false' ? ' selected' : ''}>No</option>
    </select>`;
  }else if(semantic === 'year'){
    control = `<input ${common} type="number" inputmode="numeric" min="${MIN_TAX_FACT_YEAR}" max="${MAX_TAX_FACT_YEAR}" step="1" value="${escHtml(value)}">`;
  }else if(money){
    control = `<span class="hh-tax-money"><span aria-hidden="true">$</span><input ${common} type="text" inputmode="decimal" data-type="money" value="${escHtml(value)}"></span>`;
  }else{
    control = `<input ${common} type="number" inputmode="decimal" step="1" value="${escHtml(value)}">`;
  }
  return `<div class="hh-tax-field">
    <label for="${escHtml(id)}">${escHtml(label)}</label>
    ${control}
    ${helper ? `<div class="hh-tax-field__help hh-tax-microcopy" id="${escHtml(helpId)}">${escHtml(helper)}</div>` : ''}
  </div>`;
}

function renderFieldset({ title, eyebrow, badge, badgeTone = 'later', helper, fields, className = '' }){
  return `<fieldset class="hh-tax-fieldset${className ? ` ${className}` : ''}">
    <legend>
      ${eyebrow ? `<span class="hh-tax-fieldset__eyebrow">${escHtml(eyebrow)}</span>` : ''}
      <span class="hh-tax-fieldset__title">${escHtml(title)}</span>
      ${badge ? `<span class="hh-tax-badge hh-tax-badge--${escHtml(badgeTone)}">${escHtml(badge)}</span>` : ''}
    </legend>
    ${helper ? `<p class="hh-tax-fieldset__help hh-tax-microcopy">${escHtml(helper)}</p>` : ''}
    <div class="hh-tax-fields">${fields}</div>
  </fieldset>`;
}

function basisStatus(account, taxFactContract, record){
  const confirmed = account.basis?.status === 'confirmed';
  const usedNow = confirmed
    && taxFactContract?.calculationInputs?.taxableBasisOverride !== null
    && record?.disposition === 'calculation';
  if(usedNow){
    return { label: 'Confirmed · used in current calculation', tone: 'current' };
  }
  if(confirmed){
    return { label: 'Confirmed · not currently used', tone: 'waiting' };
  }
  if(account.basis?.status === 'assumed'){
    return { label: 'Estimate saved · not currently used', tone: 'waiting' };
  }
  return { label: 'Not entered · current fallback remains', tone: 'neutral' };
}

function renderBrokerage(account, entry, taxFactContract, basisRecords){
  const id = safeId(account.id);
  const status = basisStatus(account, taxFactContract, basisRecords.get(account.id));
  const basis = renderFactControl({
    id: `hh-tax-basis-${id}`,
    label: 'Cost basis',
    helper: 'Use the total cost basis shown on the account statement. Blank clears the saved basis.',
    value: account.basis?.status === 'unknown'
      ? ''
      : displayValue(account.basis?.amount, { money: true }),
    semantic: 'nonnegative-number',
    money: true,
    attributes: {
      'data-hh-tax-edit': 'basis',
      'data-hh-tax-account-id': account.id,
    },
  });
  const savedInclusion = account.taxReporting?.inclusion;
  const inclusion = savedInclusion === 'household-return' || savedInclusion === 'separate-return'
    ? savedInclusion
    : '';
  const reportingId = `hh-tax-reporting-${id}`;
  const reportingHelpId = `${reportingId}-help`;
  const reporting = `<div class="hh-tax-field">
    <label for="${reportingId}">Included on this household return?</label>
    <select id="${reportingId}" class="hh-tax-input"
      data-hh-tax-edit="reporting"
      data-hh-tax-account-id="${escHtml(account.id)}"
      data-hh-tax-semantic="reporting-inclusion"
      aria-describedby="${reportingHelpId}">
      <option value=""${inclusion === '' ? ' selected' : ''}>Not confirmed</option>
      <option value="household-return"${inclusion === 'household-return' ? ' selected' : ''}>Yes — 100%</option>
      <option value="separate-return"${inclusion === 'separate-return' ? ' selected' : ''}>No — separate return</option>
    </select>
    <div class="hh-tax-field__help hh-tax-microcopy" id="${reportingHelpId}">Partial-return attribution is not modeled.</div>
  </div>`;
  return renderFieldset({
    eyebrow: `${ownerRole(account.owner)} · Taxable account`,
    title: accountName(account, entry),
    badge: status.label,
    badgeTone: status.tone,
    helper: 'A complete confirmed basis across taxable accounts is used by the current federal calculation.',
    fields: basis + reporting,
  });
}

function renderOwnerFacts(plan, owner, group, specs, title){
  const profile = plan.taxProfiles?.[owner]?.[group] || {};
  const fields = specs.map(spec => renderFactControl({
    id: `hh-tax-owner-${safeId(owner)}-${safeId(group)}-${safeId(spec.key)}`,
    label: spec.label,
    helper: spec.helper,
    value: factValue(profile[spec.key], spec),
    semantic: spec.semantic,
    money: spec.money,
    attributes: {
      'data-hh-tax-edit': 'owner-fact',
      'data-hh-tax-owner': owner,
      'data-hh-tax-group': group,
      'data-hh-tax-key': spec.key,
    },
  })).join('');
  return renderFieldset({
    eyebrow: ownerRole(owner),
    title: `${ownerName(plan, owner)}’s ${title}`,
    badge: 'Saved for later',
    helper: group === 'traditionalIra'
      ? 'These values apply across this person’s Traditional, rollover, SEP, and SIMPLE IRAs. They do not change current results yet.'
      : 'These owner-level Roth IRA values are stored for later distribution rules and do not change current results yet.',
    fields,
  });
}

function renderAccountFacts(account, entry, group, specs, title, extraHelper = ''){
  const facts = account[group] || {};
  const fields = specs.map(spec => renderFactControl({
    id: `hh-tax-account-${safeId(account.id)}-${safeId(group)}-${safeId(spec.key)}`,
    label: spec.label,
    helper: spec.helper,
    value: factValue(facts[spec.key], spec),
    semantic: spec.semantic,
    money: spec.money,
    attributes: {
      'data-hh-tax-edit': 'account-fact',
      'data-hh-tax-account-id': account.id,
      'data-hh-tax-group': group,
      'data-hh-tax-key': spec.key,
    },
  })).join('');
  const helper = `These facts are saved with the household for later distribution rules and do not change current results yet.${extraHelper ? ` ${extraHelper}` : ''}`;
  return renderFieldset({
    eyebrow: `${ownerRole(account.owner)} · ${title}`,
    title: accountName(account, entry),
    badge: 'Saved for later',
    helper,
    fields,
  });
}

function limitationText(account, entry){
  if(account.owner === 'trust'){
    return 'Trust-return attribution is not modeled yet, so tax details remain read-only.';
  }
  if(entry.taxCharacter === 'taxable_cash'){
    return 'Bank principal is already treated as basis. Bank-interest tax rules are not modeled yet.';
  }
  if(entry.taxCharacter === 'inherited_traditional_ira'
    || entry.taxCharacter === 'inherited_roth_ira'){
    return 'Inherited-account distribution rules are not active yet; no tax details are used.';
  }
  if(entry.taxCharacter === 'hsa'){
    return 'HSA tax treatment is outside this phase; no tax details are used.';
  }
  if(!entry.supportedForTax){
    return 'This account’s tax treatment is outside the current modeling scope.';
  }
  return null;
}

function renderLimitation(account, entry){
  const copy = limitationText(account, entry);
  if(!copy) return '';
  return `<div class="hh-tax-limit" role="note">
    <div><span class="hh-tax-limit__eyebrow">${escHtml(ownerRole(account.owner))}</span><strong>${escHtml(accountName(account, entry))}</strong></div>
    <p class="hh-tax-microcopy">${escHtml(copy)}</p>
  </div>`;
}

/**
 * Render the Household-owned tax facts used by current and future tax planning.
 * This module is display-only: data attributes describe edits for main.js.
 */
export function renderHouseholdTaxFacts(plan, deps){
  const accounts = (plan.portfolio?.extraAccounts || []).filter(account => (
    account
    && typeof account.typeId === 'string'
    && typeof account.balance === 'number'
    && account.balance > 0
    && getAccountTypeById(account.typeId)
  ));
  if(accounts.length === 0) return '';

  let taxFactContract = null;
  try{
    taxFactContract = typeof deps?.taxFactContract === 'function'
      ? deps.taxFactContract()
      : null;
  }catch{
    // The contract layer owns malformed records; the view remains render-safe.
  }
  const basisRecords = new Map((taxFactContract?.factRecords || [])
    .filter(record => record.scope === 'account' && String(record.path || '').endsWith('.basis'))
    .map(record => [record.accountId, record]));
  const editable = [];
  const limitations = [];
  const ownerCharacters = new Map([
    ['client', new Set()],
    ['spouse', new Set()],
  ]);

  for(const account of accounts){
    const entry = getAccountTypeById(account.typeId);
    const limitation = limitationText(account, entry);
    if(limitation){
      limitations.push(renderLimitation(account, entry));
      continue;
    }
    if((account.owner === 'client' || account.owner === 'spouse')
      && ownerCharacters.has(account.owner)){
      ownerCharacters.get(account.owner).add(entry.taxCharacter);
    }
    if(entry.taxCharacter === 'capital_asset'){
      editable.push(renderBrokerage(account, entry, taxFactContract, basisRecords));
    }else if(entry.taxCharacter === 'employer_pretax'){
      editable.push(renderAccountFacts(
        account,
        entry,
        'employerPlanFacts',
        EMPLOYER_PLAN_FIELDS,
        'Employer plan'
      ));
    }else if(entry.taxCharacter === 'designated_roth'){
      editable.push(renderAccountFacts(
        account,
        entry,
        'designatedRothFacts',
        DESIGNATED_ROTH_FIELDS,
        'Designated Roth',
        'In-plan rollover cohorts are intentionally not collected in this phase.'
      ));
    }
  }

  for(const owner of ['client', 'spouse']){
    if(owner === 'spouse' && !plan.household?.spouse) continue;
    const characters = ownerCharacters.get(owner);
    if(characters.has('traditional_ira')){
      editable.push(renderOwnerFacts(
        plan,
        owner,
        'traditionalIra',
        TRADITIONAL_IRA_FIELDS,
        'Traditional IRA tax details'
      ));
    }
    if(characters.has('roth_ira')){
      editable.push(renderOwnerFacts(
        plan,
        owner,
        'rothIra',
        ROTH_IRA_FIELDS,
        'Roth IRA tax details'
      ));
    }
  }

  if(editable.length === 0 && limitations.length === 0) return '';
  const open = deps?.uiState?.hhTaxDetailsOpen ? ' open' : '';
  return `<details class="hh-tax-details" data-hh-tax-details-root${open}>
    <summary>
      <span><strong>Tax details</strong><small class="hh-tax-microcopy">Basis and account facts used for distribution tax modeling</small></span>
      <span class="hh-tax-details__state" aria-hidden="true">Details</span>
    </summary>
    <div class="hh-tax-details__body">
      ${editable.length ? `<div class="hh-tax-grid">${editable.join('')}</div>` : ''}
      ${limitations.length ? `<div class="hh-tax-limitations" aria-label="Tax modeling limitations">${limitations.join('')}</div>` : ''}
    </div>
  </details>`;
}
