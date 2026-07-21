import { createAccount, hasSpouseOwnedAccounts } from './createAccount.js';
import { createBlankTaxProfiles, taxProfileHasConfirmedFacts } from './factEnvelope.js';
import { applyHouseholdTaxFactEdit } from './taxFactEdits.js';
import { taxFactEditFromControl } from './taxFactEditorController.js';
import { createAdjustment, createCredit, createDeduction, createIncomeSource } from './incomeTaxModel.js';

export function bindHouseholdEditor({
  root,
  wizardRoot,
  getPlan,
  transientState,
  accountTypes,
  rowKinds,
  guardPlanMutation,
  reseedScenarios,
  appState,
  syncHousehold,
  syncHeaderStatus,
  persistHousehold,
  liveCommas,
  getPath,
  setPath,
  ageFromYear,
}){
  if(!root || !wizardRoot) return { flushPendingEdits: () => {} };

  function syncDraftControl(el){
    const draft = el?.dataset?.hhDraft;
    if(draft === 'label') transientState.hhDraftLabel = el.value;
    else if(draft === 'amount' || draft === 'year') transientState.hhDraftAmount = el.value;
  }

  function commitFixedKind(plan, el){
    const fixedKind = el.dataset.hhFixedKind;
    if(!fixedKind) return false;
    const typeId = el.dataset.hhFixedType;
    const owner = el.dataset.hhFixedOwner || 'client';
    const rowIndex = Number.parseInt(el.dataset.hhFixedIndex, 10);
    const amount = Math.max(0, Math.round(parseFloat(String(el.value).replace(/[^0-9.]/g, '')) || 0));
    let rows;
    let createRow;
    if(fixedKind === 'income'){
      if(!plan.income) plan.income = {};
      if(!Array.isArray(plan.income.other)) plan.income.other = [];
      rows = plan.income.other;
      createRow = () => createIncomeSource(plan, typeId, owner);
    }else if(fixedKind === 'adjustment'){
      if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
      if(!Array.isArray(plan.incomeTax.adjustments)) plan.incomeTax.adjustments = [];
      rows = plan.incomeTax.adjustments;
      createRow = () => createAdjustment(typeId, owner);
    }else if(fixedKind === 'deduction'){
      if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
      if(!Array.isArray(plan.incomeTax.deductions)) plan.incomeTax.deductions = [];
      rows = plan.incomeTax.deductions;
      createRow = () => createDeduction(typeId);
    }
    if(!rows || !createRow) return false;
    let index = rowIndex;
    if(fixedKind === 'income'){
      if(Number.isInteger(index) && index >= 0 && index < rows.length){
        const row = rows[index];
        if(row.typeId !== typeId || (row.owner || 'client') !== owner) index = -1;
      }
      if(!(Number.isInteger(index) && index >= 0)){
        index = rows.findIndex(r => r.typeId === typeId && (r.owner || 'client') === owner);
      }
    }
    if(Number.isInteger(index) && index >= 0 && index < rows.length){
      if(amount === 0 && fixedKind === 'income') rows.splice(index, 1);
      else rows[index].amount = amount;
    }else if(amount > 0){
      const row = createRow();
      row.amount = amount;
      rows.push(row);
    }
    return true;
  }

  function commitPathControl(plan, el){
    const path = el.dataset.path;
    const type = el.dataset.type;
    if(!path || type === 'acctType') return false;
    const raw = el.value;
    if(type === 'text' || type === 'strategy' || type === 'owner' || type === 'bucket'){
      setPath(plan, path, raw);
      return true;
    }
    if(type === 'bool'){
      setPath(plan, path, el.checked === true);
      return true;
    }
    if(type === 'ageOrLife' && String(raw).trim() === ''){
      setPath(plan, path, 999);
      return true;
    }
    let v;
    if(type === 'money' || type === 'monthlyMoney') v = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    else if(type === 'risk') v = +raw;
    else v = parseFloat(raw);
    if(!isFinite(v)) return false;
    if(type === 'pct') v = Math.max(0, Math.min(100, v)) / 100;
    if(type === 'signedPct') v = Math.max(-100, Math.min(100, v)) / 100;
    if(type === 'money') v = Math.max(0, Math.round(v));
    if(type === 'monthlyMoney') v = Math.max(0, Math.round(v)) * 12;
    if(type === 'num') v = Math.max(1, Math.round(v));
    if(type === 'age' || type === 'ageOrLife'){
      v = Math.round(v);
      const min = parseFloat(el.dataset.min);
      const max = parseFloat(el.dataset.max);
      if(isFinite(min)) v = Math.max(min, v);
      if(isFinite(max)) v = Math.min(max, v);
    }
    if(type === 'birthYear'){
      v = Math.round(v);
      if(v < 1900 || v > new Date().getFullYear()) return false;
      const age = ageFromYear(v);
      setPath(plan, path, v);
      if(age != null) setPath(plan, path.replace(/\.birthYear$/, '.currentAge'), age);
      return true;
    }
    if(/^properties\.[01]\./.test(path)){
      if(!Array.isArray(plan.properties)) plan.properties = [];
      const idx = +path.split('.')[1];
      while(plan.properties.length <= idx){
        plan.properties.push({ name: plan.properties.length === 0 ? 'Primary home' : 'Other property',
          value: 0, purchasePrice: 0, mortgage: { balance: 0, rate: 0, termYears: 0 } });
      }
    }
    setPath(plan, path, v);
    return true;
  }

  function commitControl(plan, el){
    if(!el || !root.contains(el)) return false;
    if(el.dataset.hhDraft){
      syncDraftControl(el);
      return false;
    }
    if(el.dataset.hhFixedKind) return commitFixedKind(plan, el);
    if(el.dataset.path) return commitPathControl(plan, el);
    return false;
  }

  function flushAllVisibleEdits(){
    if(!guardPlanMutation()) return false;
    const plan = getPlan();
    let changed = false;
    for(const el of root.querySelectorAll('input[data-path], select[data-path], textarea[data-path], input[data-hh-fixed-kind]')){
      if(commitControl(plan, el)) changed = true;
    }
    for(const el of root.querySelectorAll('input[data-hh-draft], select[data-hh-draft]')){
      syncDraftControl(el);
    }
    return changed;
  }

  function flushPendingEdits(){
    return flushAllVisibleEdits();
  }

  let deferredCommitFrame = 0;
  function cancelDeferredCommit(){
    if(!deferredCommitFrame) return;
    cancelAnimationFrame(deferredCommitFrame);
    deferredCommitFrame = 0;
  }

  /** Defer re-render so blur/change on mobile does not destroy the click target first. */
  function schedulePathCommit(){
    if(deferredCommitFrame) return;
    deferredCommitFrame = requestAnimationFrame(() => {
      deferredCommitFrame = 0;
      if(!guardPlanMutation()) return;
      reseedScenarios(); appState.sharedPaths=null; appState.plansDirty=true;
      persistHousehold?.();
      syncHousehold();
      syncHeaderStatus('Plan edited · open Scenarios');
    });
  }

  function formatControlDisplay(el){
    const type = el.dataset.type;
    if(type === 'money'){
      el.value = Math.max(0, Math.round(parseFloat(String(el.value).replace(/[^0-9.]/g, '')) || 0)).toLocaleString('en-US');
    }else if(type === 'monthlyMoney'){
      const m = Math.max(0, Math.round(parseFloat(String(el.value).replace(/[^0-9.]/g, '')) || 0));
      el.value = m.toLocaleString('en-US');
    }else if(type === 'age' || type === 'ageOrLife'){
      const v = Math.round(parseFloat(el.value));
      if(Number.isFinite(v)) el.value = String(v);
    }
  }

  function hhCommit(){
    cancelDeferredCommit();
    flushAllVisibleEdits();
    if(!guardPlanMutation()) return;
    reseedScenarios(); appState.sharedPaths=null; appState.plansDirty=true;
    persistHousehold?.();
    syncHousehold();
    syncHeaderStatus('Plan edited · open Scenarios');
  }

  root.addEventListener('input', e => {
    if(typeof e.target.setCustomValidity === 'function') e.target.setCustomValidity('');
    syncDraftControl(e.target);
    if(e.target.dataset.type === 'money' || e.target.dataset.type === 'monthlyMoney') liveCommas(e.target);
  });

  root.addEventListener('toggle', e => {
    if(e.target?.matches?.('[data-hh-tax-details-root]')) transientState.hhTaxDetailsOpen = e.target.open;
  }, true);

  root.addEventListener('change', e => {
    const plan = getPlan();
    const taxControl = e.target.closest?.('[data-hh-tax-edit]');
    if(taxControl){
      if(!guardPlanMutation()){ syncHousehold(); return; }
      try{
        const result = applyHouseholdTaxFactEdit(
          plan,
          taxFactEditFromControl(taxControl),
          { now: new Date().toISOString() }
        );
        taxControl.setCustomValidity('');
        if(result.changed) hhCommit();
      }catch(error){
        taxControl.setCustomValidity(error?.message || 'This tax detail could not be saved');
        taxControl.reportValidity();
      }
      return;
    }
    // Add-account form controls carry no data-path (transient until Save).
    if(!e.target.dataset.path && e.target.classList && e.target.classList.contains('hh-form-type')){
      return;
    }
    if(e.target.matches?.('[data-hh-draft="type"]')){
      const form = e.target.closest('.hh-it-add-form');
      if(!form) return;
      const selected = e.target.value;
      form.querySelectorAll('[data-income-types]').forEach(control => {
        control.hidden = !control.dataset.incomeTypes.split(' ').includes(selected);
      });
      form.querySelectorAll('[data-adjustment-types]').forEach(control => {
        control.hidden = !control.dataset.adjustmentTypes.split(' ').includes(selected);
      });
      form.querySelectorAll('[data-hide-for-income-types]').forEach(control => {
        control.hidden = control.dataset.hideForIncomeTypes.split(' ').includes(selected);
      });
      return;
    }
    if(e.target.dataset.hhFixedKind){
      if(!guardPlanMutation()){ syncHousehold(); return; }
      if(commitFixedKind(plan, e.target)) schedulePathCommit();
      return;
    }
    const path = e.target.dataset.path, type = e.target.dataset.type;
    if(!path) return;
    if(!guardPlanMutation()){ syncHousehold(); return; }
    formatControlDisplay(e.target);
    if(commitPathControl(plan, e.target)) schedulePathCommit();
  });

  wizardRoot.addEventListener('pointerdown', e => {
    if(!e.target.closest('[data-hh-action], .row-x, [data-hh-clear-path], [data-add]')) return;
    flushAllVisibleEdits();
  }, true);

  wizardRoot.addEventListener('click', e => {
    flushAllVisibleEdits();
    cancelDeferredCommit();
    const plan = getPlan();
    const clear = e.target.closest('[data-hh-clear-path]');
    if(clear){
      if(!guardPlanMutation()) return;
      setPath(plan, clear.dataset.hhClearPath, 0);
      hhCommit();
      return;
    }
    const rx = e.target.closest('.row-x');
    if(rx){
      if(!guardPlanMutation()) return;
      const rmpath = rx.dataset.rmpath;
      if(/^income\.pension\.benefitByAge\./.test(rmpath)){
        const age = rmpath.split('.').pop();
        if(plan.income.pension && plan.income.pension.benefitByAge) delete plan.income.pension.benefitByAge[age];
        hhCommit();
        return;
      }
      const ks = rmpath.split('.'); const last = ks.pop();
      let t = plan; for(const k of ks){ if(t==null) return; t=t[k]; }
      if(Array.isArray(t)) t.splice(+last, 1); else if(t!=null) delete t[last];
      hhCommit();
      return;
    }

    const adder = e.target.closest('[data-add]');
    if(adder){
      if(!guardPlanMutation()) return;
      const k = rowKinds[adder.dataset.add];
      if(k){
        const arr = getPath(plan, k.arr);
        if(Array.isArray(arr)) arr.push(k.mk()); else setPath(plan, k.arr, [k.mk()]);
        hhCommit();
      }
      return;
    }

    const act = e.target.closest('[data-hh-action]');
    if(!act) return;
    const action = act.dataset.hhAction;
    const lockedAction = ['add-spouse','remove-spouse','open-account-form','save-account','open-add','commit-add','add-home','add-mortgage','add-pension-age','gpc-add-account','gpc-add-property','gpc-add-deduction'].includes(action);
    if(lockedAction && !guardPlanMutation()) return;
    if(action === 'add-spouse'){
      plan.household.spouse = {
        currentAge: 55,
        retirementAge: 62,
        planEndAge: plan.household.primary?.planEndAge ?? 90,
        birthYear: new Date().getFullYear() - 55,
      };
      plan.meta.spouseName  = plan.meta.spouseName || '';
      if(!plan.income.socialSecurity.spouse) plan.income.socialSecurity.spouse = { pia: 0, claimAge: 67 };
      plan.meta.filingStatus = 'marriedFilingJointly';
      hhCommit();
    } else if(action === 'remove-spouse'){
      if(hasSpouseOwnedAccounts(plan)){
        alert('Reassign or remove Co-Client accounts before removing the Co-Client.');
        return;
      }
      const spouseFacts = plan.taxProfiles?.spouse;
      const discardFacts = spouseFacts && taxProfileHasConfirmedFacts(spouseFacts);
      const prompt = discardFacts
        ? 'Remove co-client from this household? Confirmed co-client tax facts will be discarded.'
        : 'Remove co-client from this household?';
      if(!confirm(prompt)) return;
      plan.household.spouse = null;
      plan.income.socialSecurity.spouse = null;
      plan.meta.filingStatus = 'single';
      if(plan.taxProfiles) plan.taxProfiles.spouse = createBlankTaxProfiles().spouse;
      hhCommit();
    } else if(action === 'open-account-form'){
      transientState.hhAddingKey = null;
      transientState.hhAcctFormOwner = act.dataset.owner || 'client';
      syncHousehold();
      const val = document.querySelector('#hh-acct-form .hh-form-val');
      if(val) val.focus();
    } else if(action === 'cancel-account'){
      transientState.hhAcctFormOwner = null;
      syncHousehold();
    } else if(action === 'save-account'){
      const form = document.querySelector('#hh-acct-form');
      if(!form) return;
      const t = accountTypes[+form.querySelector('.hh-form-type').value] || accountTypes[0];
      const valEl = form.querySelector('.hh-form-val');
      const bal = parseFloat(String(valEl ? valEl.value : '').replace(/[^0-9.]/g, ''));
      if(!isFinite(bal) || bal <= 0){
        if(valEl){ valEl.focus(); valEl.style.outline = '2px solid var(--down)'; setTimeout(() => valEl.style.outline = '', 1500); }
        return;
      }
      const owner = transientState.hhAcctFormOwner || 'client';
      if(!plan.portfolio.extraAccounts) plan.portfolio.extraAccounts = [];
      plan.portfolio.extraAccounts.push(createAccount(t.typeId, { owner, balance: Math.round(bal) }));
      transientState.hhAcctFormOwner = null;
      hhCommit();
    } else if(action === 'open-add'){
      transientState.hhAddingKey = act.dataset.addKey || null;
      transientState.hhDraftLabel = '';
      transientState.hhDraftAmount = '';
      transientState.hhAcctFormOwner = null;
      syncHousehold();
    } else if(action === 'cancel-add'){
      transientState.hhAddingKey = null;
      transientState.hhDraftLabel = '';
      transientState.hhDraftAmount = '';
      syncHousehold();
    } else if(action === 'commit-add'){
      const draft = name => document.querySelector(`[data-hh-draft="${name}"]`);
      const draftNumber = name => {
        const rawValue = draft(name)?.value;
        if(rawValue == null || String(rawValue).trim() === '') return null;
        const value = parseFloat(String(rawValue).replace(/[^0-9.-]/g, ''));
        return Number.isFinite(value) ? value : null;
      };
      const label = (document.querySelector('[data-hh-draft="label"]')?.value || transientState.hhDraftLabel || '').trim();
      const amtRaw = document.querySelector('[data-hh-draft="amount"]')?.value ?? transientState.hhDraftAmount ?? '';
      let amt = parseFloat(String(amtRaw).replace(/[^0-9.]/g, '')) || 0;
      const typeId = document.querySelector('[data-hh-draft="type"]')?.value || 'other';
      const owner = document.querySelector('[data-hh-draft="owner"]')?.value || 'client';
      if(transientState.hhAddingKey === 'income' && typeId === 'rental'){
        const netTaxable = draftNumber('netTaxable');
        if(netTaxable != null) amt = netTaxable;
      }
      if(['income', 'external-sale', 'adjustment', 'deduction', 'credit', 'savings'].includes(transientState.hhAddingKey) && amt <= 0){
        transientState.hhAddingKey = null;
        transientState.hhDraftLabel = '';
        transientState.hhDraftAmount = '';
        syncHousehold();
        return;
      }
      if(transientState.hhAddingKey === 'income' || transientState.hhAddingKey === 'external-sale'){
        if(!plan.income.other) plan.income.other = [];
        const row = createIncomeSource(plan, typeId, owner);
        row.amount = Math.round(amt);
        const startAge = draftNumber('startAge');
        const endAge = draftNumber('endAge');
        const growthPct = draftNumber('growthPct');
        const taxablePct = draftNumber('taxablePct');
        const qualifiedPct = draftNumber('qualifiedPct');
        const interestTreatment = draft('interestTreatment')?.value;
        if(startAge != null) row.startAge = Math.max(0, Math.min(120, Math.round(startAge)));
        if(endAge != null) row.endAge = Math.max(row.startAge, Math.min(120, Math.round(endAge)));
        if(growthPct != null) row.realGrowth = Math.max(-100, Math.min(100, growthPct)) / 100;
        if(typeId === 'interest' && interestTreatment === 'tax_exempt') row.taxablePct = 0;
        else if(typeId === 'interest' && interestTreatment === 'taxable') row.taxablePct = 1;
        else if(taxablePct != null && ['pension','annuity','deferred_comp','other','ira_distribution','roth_conversion'].includes(typeId)){
          row.taxablePct = Math.max(0, Math.min(100, taxablePct)) / 100;
        }
        if(qualifiedPct != null && typeId === 'dividends'){
          row.qualifiedPct = Math.max(0, Math.min(100, qualifiedPct)) / 100;
        }
        if(label) row.label = label;
        plan.income.other.push(row);
      } else if(transientState.hhAddingKey === 'savings'){
        if(!plan.savings) plan.savings = { annual: 0, split: { traditional: 1, roth: 0, taxable: 0 } };
        plan.savings.annual = Math.round(amt);
      } else if(transientState.hhAddingKey === 'adjustment'){
        if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
        if(!Array.isArray(plan.incomeTax.adjustments)) plan.incomeTax.adjustments = [];
        const row = createAdjustment(typeId, owner);
        row.amount = Math.round(amt);
        row.whileWorkingOnly = typeId === '401k' && draft('whileWorkingOnly')?.checked === true;
        if(label) row.label = label;
        plan.incomeTax.adjustments.push(row);
      } else if(transientState.hhAddingKey === 'deduction'){
        if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
        if(!Array.isArray(plan.incomeTax.deductions)) plan.incomeTax.deductions = [];
        const row = createDeduction(typeId);
        row.amount = Math.round(amt);
        if(label) row.label = label;
        plan.incomeTax.deductions.push(row);
      } else if(transientState.hhAddingKey === 'credit'){
        if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
        if(!Array.isArray(plan.incomeTax.credits)) plan.incomeTax.credits = [];
        const row = createCredit(typeId);
        row.amount = Math.round(amt);
        if(label) row.label = label;
        plan.incomeTax.credits.push(row);
      } else if(transientState.hhAddingKey === 'child'){
        const year = parseInt(String(document.querySelector('[data-hh-draft="year"]')?.value ?? transientState.hhDraftAmount ?? ''), 10);
        if(!plan.household.children) plan.household.children = [];
        plan.household.children.push({ name: label || 'Child', birthYear: isFinite(year) ? year : new Date().getFullYear() - 10 });
      } else if(transientState.hhAddingKey === 'spending'){
        if(!plan.expenses.extra) plan.expenses.extra = [];
        const row = rowKinds.expense.mk();
        row.label = label || 'Category';
        row.amount = Math.round(amt);
        plan.expenses.extra.push(row);
      }
      transientState.hhAddingKey = null;
      transientState.hhDraftLabel = '';
      transientState.hhDraftAmount = '';
      hhCommit();
    } else if(action === 'add-home'){
      if(!Array.isArray(plan.properties)) plan.properties = [];
      if(!plan.properties[0]) plan.properties[0] = { name:'Primary home', value:0, purchasePrice:0 };
      hhCommit();
    } else if(action === 'add-mortgage'){
      const pr = plan.properties && plan.properties[0];
      if(pr && !pr.mortgage){ pr.mortgage = { balance:0, rate:0, termYears:0 }; hhCommit(); }
    } else if(action === 'step-back'){
      transientState.hhStep = Math.max(1, transientState.hhStep - 1);
      transientState.hhAddingKey = null;
      transientState.hhAcctFormOwner = null;
      persistHousehold?.();
      syncHousehold();
    } else if(action === 'step-next'){
      transientState.hhStep = Math.min(5, transientState.hhStep + 1);
      transientState.hhAddingKey = null;
      transientState.hhAcctFormOwner = null;
      persistHousehold?.();
      syncHousehold();
    } else if(action === 'gpc-add-account'){
      const typeId = act.dataset.acctTypeId;
      const owner = act.dataset.acctOwner || 'client';
      if(!typeId) return;
      if(!plan.portfolio.extraAccounts) plan.portfolio.extraAccounts = [];
      const acct = createAccount(typeId, { owner, balance: 0 });
      const customLabel = act.dataset.acctLabel?.trim();
      if(customLabel) acct.type = customLabel;
      plan.portfolio.extraAccounts.push(acct);
      hhCommit();
    } else if(action === 'gpc-add-property'){
      if(!Array.isArray(plan.properties)) plan.properties = [];
      plan.properties.push({ name: 'Real estate', value: 0, purchasePrice: 0 });
      hhCommit();
    } else if(action === 'gpc-toggle-catalog'){
      transientState.gpcCatalogOpen = !transientState.gpcCatalogOpen;
      syncHousehold();
    } else if(action === 'gpc-add-deduction'){
      const typeId = act.dataset.dedType;
      if(!typeId) return;
      if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
      if(!Array.isArray(plan.incomeTax.deductions)) plan.incomeTax.deductions = [];
      if(!plan.incomeTax.deductions.some(row => row.typeId === typeId)){
        plan.incomeTax.deductions.push(createDeduction(typeId));
        hhCommit();
      }
    } else if(action === 'gpc-person-tab'){
      transientState.gpcPersonTab = act.dataset.personTab || 'primary';
      syncHousehold();
    } else if(action === 'gpc-work-mode'){
      transientState.gpcWorkMode = act.dataset.workMode || 'employed';
      syncHousehold();
    } else if(action === 'add-pension-age'){
      if(!plan.income.pension) plan.income.pension = { benefitByAge:{}, startAge:65, colaPct:0 };
      if(!plan.income.pension.benefitByAge) plan.income.pension.benefitByAge = {};
      const existing = Object.keys(plan.income.pension.benefitByAge).map(Number).sort((a,b)=>a-b);
      const newAge = existing.length ? (existing[existing.length-1]+1) : 65;
      if(!plan.income.pension.benefitByAge[newAge]) plan.income.pension.benefitByAge[newAge] = 0;
      hhCommit();
    }
  });

  return { flushPendingEdits };
}
