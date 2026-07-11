/**
 * Promote the tax-funded Monte Carlo success rate into the single probability
 * field consumed by Scenarios UI surfaces. Shortcut aggregates remain attached
 * to the analysis, but shortcut successRate is never a display fallback.
 */
export function promoteTaxFundedProbability(analysis){
  if(analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)){
    throw new TypeError('analysis must be a plain object');
  }
  const fundedRate = analysis.federalSuccessRate;
  return {
    ...analysis,
    successRate: Number.isFinite(fundedRate) ? fundedRate : null,
  };
}
