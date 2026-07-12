function requiredDataset(control, key){
  const value = control?.dataset?.[key];
  if(typeof value !== 'string' || value.length === 0){
    throw new Error(`Tax detail control is missing ${key}`);
  }
  return value;
}

function parseFactValue(raw, semantic){
  if(raw === '') return null;
  if(semantic === 'boolean'){
    if(raw === 'true') return true;
    if(raw === 'false') return false;
    throw new Error('Choose Yes, No, or Unknown');
  }
  if(semantic === 'date') return raw;
  const number = Number(String(raw).replace(/[$,\s]/g, ''));
  if(!Number.isFinite(number)) throw new Error('Enter a valid number');
  if(semantic === 'year') return number;
  if(semantic === 'nonnegative-number' || semantic === 'finite-number') return number;
  throw new Error('Unsupported tax detail field');
}

/**
 * Translate one semantic Household tax-detail control into an allowlisted
 * domain edit. This module parses UI values only; taxFactEdits.js owns all
 * validation and mutations.
 */
export function taxFactEditFromControl(control){
  const edit = requiredDataset(control, 'hhTaxEdit');
  const raw = String(control.value ?? '').trim();

  if(edit === 'basis'){
    const accountId = requiredDataset(control, 'hhTaxAccountId');
    const value = parseFactValue(raw, 'nonnegative-number');
    return value === null
      ? { kind: 'clear-account-basis', accountId }
      : { kind: 'confirm-account-basis', accountId, value };
  }

  if(edit === 'reporting'){
    return {
      kind: 'set-account-tax-reporting',
      accountId: requiredDataset(control, 'hhTaxAccountId'),
      inclusion: raw || 'unknown',
    };
  }

  const semantic = requiredDataset(control, 'hhTaxSemantic');
  const value = parseFactValue(raw, semantic);
  const group = requiredDataset(control, 'hhTaxGroup');
  const key = requiredDataset(control, 'hhTaxKey');
  if(edit === 'owner-fact'){
    const owner = requiredDataset(control, 'hhTaxOwner');
    return value === null
      ? { kind: 'clear-owner-fact', owner, group, key }
      : { kind: 'confirm-owner-fact', owner, group, key, value };
  }
  if(edit === 'account-fact'){
    const accountId = requiredDataset(control, 'hhTaxAccountId');
    return value === null
      ? { kind: 'clear-account-fact', accountId, group, key }
      : { kind: 'confirm-account-fact', accountId, group, key, value };
  }
  throw new Error('Unsupported tax detail edit');
}
