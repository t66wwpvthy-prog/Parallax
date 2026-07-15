import { createAccount, hasSpouseOwnedAccounts } from './createAccount.js';
import { createBlankTaxProfiles, taxProfileHasConfirmedFacts } from './factEnvelope.js';
import { applyHouseholdTaxFactEdit } from './taxFactEdits.js';
import { taxFactEditFromControl } from './taxFactEditorController.js';
import { createAdjustment, createDeduction, createIncomeSource, retagIncomeSource } from './incomeTaxModel.js';

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
  liveCommas,
  getPath,
  setPath,
  ageFromYear,
}){
  if(!root || !wizardRoot) return;

  function hhCommit(){
    if(!guardPlanMutation()) return;
    reseedScenarios(); appState.sharedPaths=null; appState.plansDirty=true;
    syncHousehold();
    syncHeaderStatus('Plan edited · open Scenarios');
  }

  function refreshIncomeDraft(form, resetDefaults = false){
    if(!form || form.dataset.hhAddForm !== 'income') return;
    const typeId = form.querySelector('[data-hh-draft="type"]')?.value || 'wages';
    const ownerControl = form.querySelector('[data-hh-draft="owner"]');
    if(ownerControl){
      const joint = [...ownerControl.options].find(option => option.value === 'joint');
      if(joint) joint.disabled = typeId === 'social_security';
      if(typeId === 'social_security' && ownerControl.value === 'joint') ownerControl.value = 'client';
    }
    form.querySelectorAll('[data-visible-for]').forEach(field => {
      field.hidden = !field.dataset.visibleFor.split(/\s+/).includes(typeId);
    });
    if(!resetDefaults) return;
    const plan = getPlan();
    const owner = ownerControl?.value || 'client';
    const row = createIncomeSource(plan, typeId, owner);
    const start = form.querySelector('[data-hh-draft="startAge"]');
    const end = form.querySelector('[data-hh-draft="endAge"]');
    if(start) start.value = String(row.startAge);
    if(end) end.value = row.endAge === 999 ? '' : String(row.endAge);
  }

  root.addEventListener('input', e => {
    if(typeof e.target.setCustomValidity === 'function') e.target.setCustomValidity('');
    if(e.target.dataset.type === 'money' || e.target.dataset.type === 'monthlyMoney') liveCommas(e.target);
  });

  root.addEventListener('toggle', e => {
    if(e.target?.matches?.('[data-hh-tax-details-root]')) transientState.hhTaxDetailsOpen = e.target.open;
  }, true);

  root.addEventListener('change', e => {
    const plan = getPlan();
    const draftKey = e.target.dataset.hhDraft;
    if(draftKey === 'type' || draftKey === 'owner'){
      const draftForm = e.target.closest('[data-hh-add-form="income"]');
      if(draftForm){
        refreshIncomeDraft(draftForm, true);
        return;
      }
    }
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
    const path = e.target.dataset.path, type = e.target.dataset.type;
    if(!path) return;
    if(!guardPlanMutation()){ syncHousehold(); return; }
    const raw = e.target.value;
    if(type === 'incomeType'){
      const match = /^income\.other\.(\d+)\.typeId$/.exec(path);
      const index = match ? Number(match[1]) : -1;
      if(index < 0 || !plan.income?.other?.[index]) return;
      plan.income.other[index] = retagIncomeSource(plan, plan.income.other[index], raw);
      hhCommit();
      return;
    }
    if(type==='text' || type==='strategy' || type==='owner' || type==='bucket'){
      setPath(plan, path, raw);
      hhCommit();
      return;
    }
    if(type==='bool'){
      setPath(plan, path, e.target.checked === true);
      hhCommit();
      return;
    }
    if(type==='acctType') return;
    let v;
    if(type==='money' || type==='monthlyMoney') v = parseFloat(String(raw).replace(/[^0-9.]/g,''));
    else if(type==='risk') v = +raw;
    else                   v = parseFloat(raw);
    if(!isFinite(v)) return;
    if(type==='pct')  v = Math.max(0, Math.min(100, v))/100;
    if(type==='signedPct') v = Math.max(-100, Math.min(100, v))/100;
    if(type==='money'){ v = Math.max(0, Math.round(v)); e.target.value = v.toLocaleString('en-US'); }
    if(type==='monthlyMoney'){ const m = Math.max(0, Math.round(v)); v = m*12; e.target.value = m.toLocaleString('en-US'); }
    if(type==='num')  v = Math.max(1, Math.round(v));
    if(type==='age'){
      v = Math.round(v);
      const min = parseFloat(e.target.dataset.min);
      const max = parseFloat(e.target.dataset.max);
      if(isFinite(min)) v = Math.max(min, v);
      if(isFinite(max)) v = Math.min(max, v);
      e.target.value = String(v);
    }
    if(type==='birthYear'){
      v = Math.round(v);
      if(v < 1900 || v > new Date().getFullYear()) return;
      const age = ageFromYear(v);
      setPath(plan, path, v);
      if(age != null) setPath(plan, path.replace(/\.birthYear$/, '.currentAge'), age);
      hhCommit();
      return;
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
    hhCommit();
  });

  wizardRoot.addEventListener('click', e => {
    const plan = getPlan();
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
    const lockedAction = ['add-spouse','remove-spouse','open-account-form','save-account','open-add','commit-add','remove-annual-savings','add-home','add-mortgage','add-pension-age'].includes(action);
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
      if(t.owners && !t.owners.includes(owner)) return;
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
      refreshIncomeDraft(document.querySelector('[data-hh-add-form="income"]'));
    } else if(action === 'cancel-add'){
      transientState.hhAddingKey = null;
      transientState.hhDraftLabel = '';
      transientState.hhDraftAmount = '';
      syncHousehold();
    } else if(action === 'commit-add'){
      const form = act.closest('[data-hh-add-form]') || wizardRoot;
      const control = key => form.querySelector(`[data-hh-draft="${key}"]`);
      const number = key => parseFloat(String(control(key)?.value ?? '').replace(/[^0-9.-]/g, ''));
      const label = (control('label')?.value || transientState.hhDraftLabel || '').trim();
      const amtRaw = control('amount')?.value ?? transientState.hhDraftAmount ?? '';
      const amt = parseFloat(String(amtRaw).replace(/[^0-9.]/g, '')) || 0;
      const typeId = control('type')?.value || 'other';
      const owner = control('owner')?.value || 'client';
      if(transientState.hhAddingKey === 'savings'){
        const amountControl = control('amount');
        if(!(amt > 0)){
          amountControl?.setCustomValidity('Enter annual savings greater than zero');
          amountControl?.reportValidity();
          return;
        }
        if(!plan.savings) plan.savings = { annual:0, split:{ traditional:1, roth:0, taxable:0 } };
        plan.savings.annual = Math.round(amt);
      } else if(transientState.hhAddingKey === 'income'){
        const amountControl = control('amount');
        if(!(amt > 0)){
          amountControl?.setCustomValidity('Enter an annual amount greater than zero');
          amountControl?.reportValidity();
          return;
        }
        const startAge = number('startAge');
        const endAgeRaw = number('endAge');
        const endAge = isFinite(endAgeRaw) ? Math.round(endAgeRaw) : 999;
        if(isFinite(startAge) && endAge !== 999 && endAge < startAge){
          control('endAge')?.setCustomValidity('End age must be the same as or later than start age');
          control('endAge')?.reportValidity();
          return;
        }
        if(typeId === 'social_security'){
          const key = owner === 'spouse' ? 'spouse' : 'primary';
          if(owner === 'spouse' && !plan.household?.spouse) return;
          if(!plan.income.socialSecurity) plan.income.socialSecurity = {};
          plan.income.socialSecurity[key] = {
            pia: Math.round(amt),
            claimAge: isFinite(startAge) ? Math.max(62, Math.min(70, Math.round(startAge))) : 67,
          };
        }else{
          if(!plan.income.other) plan.income.other = [];
          const row = createIncomeSource(plan, typeId, owner);
          row.amount = Math.round(amt);
          row.startAge = isFinite(startAge) ? Math.round(startAge) : row.startAge;
          row.endAge = endAge;
          row.realGrowth = Math.max(-1, Math.min(1, (number('growthPct') || 0) / 100));
          if(typeId === 'interest') row.taxablePct = control('interestTreatment')?.value === 'tax_exempt' ? 0 : 1;
          if(typeId === 'dividends') row.qualifiedPct = Math.max(0, Math.min(1, (number('qualifiedPct') || 0) / 100));
          if(['pension','annuity','deferred_comp','other'].includes(typeId)){
            row.taxablePct = Math.max(0, Math.min(1, (number('taxablePct') || 0) / 100));
          }
          if(typeId === 'rental'){
            row.netTaxable = Math.max(0, Math.round(number('netTaxable') || 0));
            row.taxablePct = row.amount > 0 ? Math.min(1, row.netTaxable / row.amount) : 0;
          }
          if(label) row.label = label;
          plan.income.other.push(row);
        }
      } else if(transientState.hhAddingKey === 'adjustment'){
        if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], deductionMode: 'auto' };
        if(!Array.isArray(plan.incomeTax.adjustments)) plan.incomeTax.adjustments = [];
        const row = createAdjustment(typeId, owner);
        row.amount = Math.round(amt);
        row.whileWorkingOnly = control('whileWorkingOnly')?.checked === true;
        if(label) row.label = label;
        plan.incomeTax.adjustments.push(row);
      } else if(transientState.hhAddingKey === 'deduction'){
        if(!plan.incomeTax) plan.incomeTax = { adjustments: [], deductions: [], deductionMode: 'auto' };
        if(!Array.isArray(plan.incomeTax.deductions)) plan.incomeTax.deductions = [];
        const row = createDeduction(typeId);
        row.amount = Math.round(amt);
        if(label) row.label = label;
        plan.incomeTax.deductions.push(row);
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
      } else if(transientState.hhAddingKey === 'goal'){
        if(!Array.isArray(plan.goals)) plan.goals = [];
        const retirementAge = Math.max(
          plan.household?.primary?.retirementAge || plan.household?.primary?.currentAge || 0,
          plan.household?.spouse?.retirementAge || 0
        );
        plan.goals.push({
          name: label || 'Goal',
          amount: Math.round(amt),
          startAge: retirementAge,
          endAge: retirementAge,
          fundFromPortfolioBeforeRetirement: false,
        });
      }
      transientState.hhAddingKey = null;
      transientState.hhDraftLabel = '';
      transientState.hhDraftAmount = '';
      hhCommit();
    } else if(action === 'remove-annual-savings'){
      if(!plan.savings) plan.savings = { annual:0, split:{ traditional:1, roth:0, taxable:0 } };
      plan.savings.annual = 0;
      transientState.hhAddingKey = null;
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
      syncHousehold();
    } else if(action === 'step-next'){
      transientState.hhStep = Math.min(5, transientState.hhStep + 1);
      transientState.hhAddingKey = null;
      transientState.hhAcctFormOwner = null;
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
}
