import { buildHouseholdTaxFactContract } from '../planning/tax/buildHouseholdTaxFactContract.js';
import { createHouseholdWizard } from '../../ui/householdWizard.js';
import { escHtml } from '../../ui/dom.js';
import { hhAllAccounts, hhAgeFromYear, hhInitial, hhSelect } from '../../ui/household.js';
import { getWizardAccountTypes } from './accountTypes.js';
import { buildCurrentIncomeTaxSummary } from '../planning/tax/buildCurrentIncomeTaxSummary.js';

const $ = selector => document.querySelector(selector);

export const HOUSEHOLD_WIZARD_ACCOUNT_TYPES = getWizardAccountTypes();

const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['DC','District of Columbia'],
];

export function createHouseholdWizardController({
  getPlan,
  renderField,
  getHouseholdsDb,
  getActiveHouseholdId,
  isStorageBlocked,
  renderBlockedRecoverySurfaces,
  syncRecoveryControls,
  onSwitchHousehold,
  onNewHousehold,
  onLoadDemoHousehold,
  onSaveHouseholdAs,
  onRenameHousehold,
}){
  let step = 1;
  let accountFormOwner = null;
  let addingKey = null;
  let draftLabel = '';
  let draftAmount = '';
  let taxDetailsOpen = false;
  let wizard;

  const uiState = {
    get hhAcctFormOwner(){ return accountFormOwner; },
    set hhAcctFormOwner(value){ accountFormOwner = value; },
    get hhAddingKey(){ return addingKey; },
    set hhAddingKey(value){ addingKey = value; },
    get hhDraftLabel(){ return draftLabel; },
    set hhDraftLabel(value){ draftLabel = value; },
    get hhDraftAmount(){ return draftAmount; },
    set hhDraftAmount(value){ draftAmount = value; },
    get hhTaxDetailsOpen(){ return taxDetailsOpen; },
    set hhTaxDetailsOpen(value){ taxDetailsOpen = value; },
    get hhStep(){ return step; },
    set hhStep(value){ step = value; },
  };

  function defaultStep(){
    const plan = getPlan();
    const hasAccounts = (plan.portfolio.extraAccounts || []).length > 0;
    const hasIncome = !!((plan.income.socialSecurity.primary && plan.income.socialSecurity.primary.pia) ||
                         (plan.income.socialSecurity.spouse && plan.income.socialSecurity.spouse.pia));
    return (hasAccounts || hasIncome) ? 4 : 1;
  }

  function ensureWizard(){
    if(wizard) return wizard;
    wizard = createHouseholdWizard({
      get plan(){ return getPlan(); },
      uiState,
      field: (path, type, extra) => renderField(path, type, extra),
      select: (path, value, opts, kind) => hhSelect(path, value, opts, kind),
      initial: hhInitial,
      ageFromYear: hhAgeFromYear,
      allAccounts: () => hhAllAccounts(getPlan()),
      taxFactContract: () => buildHouseholdTaxFactContract(getPlan()),
      incomeTaxSummary: () => buildCurrentIncomeTaxSummary(getPlan()),
      accountTypes: HOUSEHOLD_WIZARD_ACCOUNT_TYPES,
      states: STATES,
    });
    return wizard;
  }

  function resetForPlan(){
    step = defaultStep();
    accountFormOwner = null;
    addingKey = null;
    draftLabel = '';
    draftAmount = '';
    taxDetailsOpen = false;
  }

  function updateHouseholdControls(){
    const sel = $('#hh-switch');
    if(!sel) return;
    const householdsDb = getHouseholdsDb();
    const activeHouseholdId = getActiveHouseholdId();
    sel.innerHTML = Object.keys(householdsDb).map(id => {
      const household = householdsDb[id] || {};
      const meta = household.meta || {};
      const name = meta.name || meta.primaryName || 'Household';
      return `<option value="${escHtml(id)}" ${id===activeHouseholdId?'selected':''}>${escHtml(name)}</option>`;
    }).join('');
    sel.value = activeHouseholdId;
  }

  function sync(){
    const view = $('#hh-view');
    if(!view) return;
    if(isStorageBlocked()){
      renderBlockedRecoverySurfaces();
      return;
    }
    const plan = getPlan();
    const name = $('#hh-rail-name');
    if(name){
      const primaryName = plan.meta.primaryName || 'Client';
      const spouseName = plan.meta.spouseName || 'Co-Client';
      name.textContent = plan.household.spouse ? `${primaryName} & ${spouseName}` : primaryName;
    }
    if($('#hh-avatar-c')) $('#hh-avatar-c').textContent = hhInitial(plan.meta.primaryName, 'C');
    if($('#hh-avatar-s')) $('#hh-avatar-s').textContent =
      (!plan.meta.spouseName || plan.meta.spouseName === 'Co-Client') ? 'CC' : hhInitial(plan.meta.spouseName, 'CC');
    const householdWizard = ensureWizard();
    const renderStep = householdWizard.steps[step] || householdWizard.steps[1];
    view.innerHTML = `<div class="hh-wstep${step === 4 ? ' hh-wstep--bp' : ''}">${renderStep()}</div>`;
    const footer = $('#hh-wiz-footer');
    if(footer) footer.innerHTML = householdWizard.footer(step);
    const wizardRoot = document.querySelector('.hh-wizard');
    if(wizardRoot){
      wizardRoot.dataset.wizardRev = '8';
      wizardRoot.dataset.wizardStep = String(step);
    }
    for(let i = 1; i <= 4; i++){
      const element = $('#hh-step-' + i);
      if(!element) continue;
      const number = element.querySelector('.hh-step__num');
      element.classList.toggle('is-current', i === step);
      element.classList.toggle('is-done', i < step);
      if(number) number.textContent = i < step ? '✓' : String(i);
      element.setAttribute('aria-selected', i === step ? 'true' : 'false');
    }
    document.querySelectorAll('.hh-stepper .hh-step__conn').forEach((connector, index) =>
      connector.classList.toggle('is-done', index < step - 1));
    syncRecoveryControls();
  }

  function bindRail(){
    document.querySelectorAll('.hh-stepper .hh-step').forEach(button =>
      button.addEventListener('click', () => {
        step = +button.dataset.step || 1;
        addingKey = null;
        accountFormOwner = null;
        sync();
      }));
    const menuButton = $('#hh-menu-btn');
    const menu = $('#hh-menu-pop');
    if(menuButton && menu){
      menuButton.addEventListener('click', event => {
        event.stopPropagation();
        const open = menu.hidden;
        menu.hidden = !open;
        menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', event => {
        if(!menu.hidden && !menu.contains(event.target) && event.target !== menuButton){
          menu.hidden = true;
          menuButton.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const switcher = $('#hh-switch');
    const saveAsButton = $('#hh-save-as');
    const renameButton = $('#hh-rename');
    const newButton = $('#hh-new');
    const loadDemoButton = $('#hh-load-demo');
    const closeMenu = () => {
      if(menu){
        menu.hidden = true;
        menuButton?.setAttribute('aria-expanded', 'false');
      }
    };
    if(switcher) switcher.addEventListener('change', event => onSwitchHousehold(event.target.value));
    if(saveAsButton) saveAsButton.addEventListener('click', () => {
      closeMenu();
      const plan = getPlan();
      const current = (plan?.meta?.name || '').trim();
      const suggestion = (!current || current === 'New Household' || current === 'Demo Household')
        ? 'Test household'
        : `${current} copy`;
      const name = window.prompt('Save household as:', suggestion);
      if(name != null) onSaveHouseholdAs?.(name);
    });
    if(renameButton) renameButton.addEventListener('click', () => {
      closeMenu();
      const plan = getPlan();
      const current = (plan?.meta?.name || 'Household').trim() || 'Household';
      const name = window.prompt('Rename household:', current);
      if(name != null) onRenameHousehold?.(name);
    });
    if(newButton) newButton.addEventListener('click', () => onNewHousehold());
    if(loadDemoButton) loadDemoButton.addEventListener('click', () => onLoadDemoHousehold());
    step = defaultStep();
    updateHouseholdControls();
  }

  return {
    uiState,
    resetForPlan,
    sync,
    updateHouseholdControls,
    bindRail,
  };
}
