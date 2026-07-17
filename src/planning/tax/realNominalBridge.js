/**
 * Real ↔ nominal conversion for the tax boundary.
 * See docs/tax/real-vs-nominal-tax-contract.md.
 *
 * Projection stays in today’s dollars. Tax law stays nominal.
 * Inflate year facts → run Form 1040 → deflate liability back to real.
 *
 * Default inflation matches engine.js `LONGRUN_INFLATION` (pinned by test).
 */

/** Keep in sync with engine.js LONGRUN_INFLATION. */
export const BRIDGE_INFLATION = 0.025;

export function inflationFactor(lagYears, inflationRate = BRIDGE_INFLATION){
  const k = Number(lagYears);
  const r = Number(inflationRate);
  if(!Number.isFinite(k) || k < 0){
    throw new TypeError('lagYears must be a finite number >= 0');
  }
  if(!Number.isFinite(r) || r <= -1){
    throw new TypeError('inflationRate must be finite and > -1');
  }
  return Math.pow(1 + r, k);
}

export function toNominal(realAmount, lagYears, inflationRate = BRIDGE_INFLATION){
  const amount = Number(realAmount);
  if(!Number.isFinite(amount)) throw new TypeError('realAmount must be finite');
  return amount * inflationFactor(lagYears, inflationRate);
}

export function toReal(nominalAmount, lagYears, inflationRate = BRIDGE_INFLATION){
  const amount = Number(nominalAmount);
  if(!Number.isFinite(amount)) throw new TypeError('nominalAmount must be finite');
  return amount / inflationFactor(lagYears, inflationRate);
}

/** Calendar years from as-of year to the modeled tax year (0 = current). */
export function projectionLagYears(asOfYear, taxYear){
  const asOf = Number(asOfYear);
  const year = Number(taxYear);
  if(!Number.isFinite(asOf) || !Number.isFinite(year)){
    throw new TypeError('asOfYear and taxYear must be finite');
  }
  return Math.max(0, year - asOf);
}

/**
 * Round-trip identity: for a pure rate tax, real tax equals rate × real base
 * (inflate and deflate cancel). Progressive brackets break this identity —
 * that is why the bridge exists.
 */
export function realTaxFromNominalRate(realBase, lagYears, nominalRate, inflationRate = BRIDGE_INFLATION){
  const nominalBase = toNominal(realBase, lagYears, inflationRate);
  const nominalTax = nominalBase * nominalRate;
  return toReal(nominalTax, lagYears, inflationRate);
}
