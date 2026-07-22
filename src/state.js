export let scenarios;
export let sharedPaths = null;
export let plansDirty = false;
export let baseSnapshot;

export let solverResults = null;
export let solverSearching = false;
export let comboResults = null;
export let comboOpen = false;
export let comboSearching = false;
export let solverFormOpen = false;
export let solving = false;

export const uiState = {
  get scenarios(){ return scenarios; },
  set scenarios(value){ scenarios = value; },
  addScenario(value){ scenarios.push(value); },
  removeScenarioAt(index){ scenarios.splice(index, 1); },

  get sharedPaths(){ return sharedPaths; },
  set sharedPaths(value){ sharedPaths = value; },
  appendSharedPath(value){ sharedPaths.push(value); },

  get plansDirty(){ return plansDirty; },
  set plansDirty(value){ plansDirty = value; },
  get baseSnapshot(){ return baseSnapshot; },
  set baseSnapshot(value){ baseSnapshot = value; },

  get solverResults(){ return solverResults; },
  set solverResults(value){ solverResults = value; },
  get solverSearching(){ return solverSearching; },
  set solverSearching(value){ solverSearching = value; },
  get comboResults(){ return comboResults; },
  set comboResults(value){ comboResults = value; },
  get comboOpen(){ return comboOpen; },
  set comboOpen(value){ comboOpen = value; },
  get comboSearching(){ return comboSearching; },
  set comboSearching(value){ comboSearching = value; },
  get solverFormOpen(){ return solverFormOpen; },
  set solverFormOpen(value){ solverFormOpen = value; },
  get solving(){ return solving; },
  set solving(value){ solving = value; },
};

const PATH_KEY = 'parallax.pathReplay.v1';
const DEFAULT_PATH_SEED = 20260609;
const replayValues = (() => {
  try{
    const saved = JSON.parse(localStorage.getItem(PATH_KEY) || '{}');
    return {
      seed: Math.max(1, parseInt(saved.seed, 10) || DEFAULT_PATH_SEED),
    };
  }catch{
    return { seed:DEFAULT_PATH_SEED };
  }
})();

/** Session-only Cash Flow path; resets to typical when Cash Flow closes. */
let cashFlowPathMode = 'typical';
let cashFlowRandomSimIndex = null;

export const pathReplay = {
  get mode(){ return cashFlowPathMode; },
  set mode(value){ cashFlowPathMode = value; },
  get seed(){ return replayValues.seed; },
  set seed(value){ replayValues.seed = value; },
  get randomSimIndex(){ return cashFlowRandomSimIndex; },
  set randomSimIndex(value){ cashFlowRandomSimIndex = value; },
};

export function resetCashFlowPathToTypical(){
  cashFlowPathMode = 'typical';
  cashFlowRandomSimIndex = null;
}

export function savePathReplay(){
  try{ localStorage.setItem(PATH_KEY, JSON.stringify({ seed: pathReplay.seed })); }catch{}
}

const scenariosUiValues = {
  view: 'compare',
  cashActive: false,
  focusedId: null,
  showRange: true,
  goalsExpanded: false,
  cashFromRetirement: false,
};

export const scenariosUiState = {
  get view(){ return scenariosUiValues.view; },
  set view(value){ scenariosUiValues.view = value; },
  get cashActive(){ return scenariosUiValues.cashActive; },
  set cashActive(value){ scenariosUiValues.cashActive = value; },
  get focusedId(){ return scenariosUiValues.focusedId; },
  set focusedId(value){ scenariosUiValues.focusedId = value; },
  get showRange(){ return scenariosUiValues.showRange; },
  set showRange(value){ scenariosUiValues.showRange = value; },
  get goalsExpanded(){ return scenariosUiValues.goalsExpanded; },
  set goalsExpanded(value){ scenariosUiValues.goalsExpanded = value; },
  get cashFromRetirement(){ return scenariosUiValues.cashFromRetirement; },
  set cashFromRetirement(value){ scenariosUiValues.cashFromRetirement = value; },
};
