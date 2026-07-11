/* Planning-owned bridge: completed engine row -> federal Form 1040 line 24. */

import { buildPlanMetaFromEngineParams, buildRowPlanMetaFromOptions } from './buildPlanMetaFromEngineParams.js';
import { runTaxForScenarioPath } from './runTaxForScenarioPath.js';
import { buildRowTaxableGainPlanMeta } from './taxableBasisTracker.js';
import { TaxInputError } from '../../tax/core/errors.js';

/**
 * Create the synchronous tax-policy callback accepted by engine.runSinglePath.
 *
 * The engine remains unaware of federal modules. This planning-layer resolver
 * consumes only the completed annual row facts and returns Form 1040 line 24.
 * It is intentionally opt-in and used only for selected single paths.
 */
export function createFederalTaxResolver(params, options = {}){
  const planMeta = buildPlanMetaFromEngineParams(params, options);
  const baseRowPlanMeta = buildRowPlanMetaFromOptions(options);
  const rowPlanMeta = options.taxableGainFraction !== undefined
    ? baseRowPlanMeta
    : buildRowTaxableGainPlanMeta(baseRowPlanMeta);
  const contextOverrides = {
    ...(options.contextOverrides ?? {}),
    scenarioId: options.scenarioId ?? 'engine_single_path',
  };

  return (row) => {
    const { results } = runTaxForScenarioPath([row], planMeta, {
      contextOverrides,
      rowPlanMeta,
    });
    const annual = results[0]?.annual1040Result;
    const line24 = annual?.lines?.line24?.value;
    if(!Number.isFinite(line24)){
      throw new TaxInputError('federal tax resolver did not produce Form 1040 line 24', {
        rowYear: row?.year ?? null,
      });
    }
    return line24;
  };
}
