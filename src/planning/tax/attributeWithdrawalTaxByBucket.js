import { TaxInputError } from '../../tax/core/errors.js';

export const WITHDRAWAL_BUCKETS = Object.freeze(['taxable', 'traditional', 'roth']);

export const WITHDRAWAL_TAX_COALITIONS = Object.freeze([
  Object.freeze({ id: 'none', buckets: Object.freeze([]) }),
  Object.freeze({ id: 'taxable', buckets: Object.freeze(['taxable']) }),
  Object.freeze({ id: 'traditional', buckets: Object.freeze(['traditional']) }),
  Object.freeze({ id: 'roth', buckets: Object.freeze(['roth']) }),
  Object.freeze({ id: 'taxable+traditional', buckets: Object.freeze(['taxable', 'traditional']) }),
  Object.freeze({ id: 'taxable+roth', buckets: Object.freeze(['taxable', 'roth']) }),
  Object.freeze({ id: 'traditional+roth', buckets: Object.freeze(['traditional', 'roth']) }),
  Object.freeze({
    id: 'taxable+traditional+roth',
    buckets: Object.freeze(['taxable', 'traditional', 'roth']),
  }),
]);

const COALITION_ID_BY_MASK = new Map(WITHDRAWAL_TAX_COALITIONS.map((coalition) => {
  const mask = WITHDRAWAL_BUCKETS.reduce(
    (value, bucket, index) => value | (coalition.buckets.includes(bucket) ? (1 << index) : 0),
    0
  );
  return [mask, coalition.id];
}));

function toCents(value, path){
  if(typeof value !== 'number' || !Number.isFinite(value) || value < 0){
    throw new TaxInputError(`${path} must be a finite non-negative number`);
  }
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value){
  return value / 100;
}

function fromSixthCents(value){
  return value / 600;
}

function normalizeCoalitionTaxes(coalitionTaxes){
  if(coalitionTaxes === null || typeof coalitionTaxes !== 'object' || Array.isArray(coalitionTaxes)){
    throw new TaxInputError('coalitionTaxes must be a plain object');
  }
  const centsById = new Map();
  for(const coalition of WITHDRAWAL_TAX_COALITIONS){
    if(!Object.prototype.hasOwnProperty.call(coalitionTaxes, coalition.id)){
      throw new TaxInputError(`coalitionTaxes.${coalition.id} is required`);
    }
    centsById.set(
      coalition.id,
      toCents(coalitionTaxes[coalition.id], `coalitionTaxes.${coalition.id}`)
    );
  }
  return centsById;
}

function roundSixthCentsToDisplayCents(value){
  return Math.sign(value) * Math.round(Math.abs(value) / 6);
}

/**
 * Order-independent three-bucket Shapley attribution over Form 1040 line 24.
 * All tax values are normalized to integer cents. Three-player Shapley weights
 * have denominator six, so each exact allocation is retained as an integer
 * count of one-sixth-cent units. Display cents are a separate, non-authoritative
 * rounding layer and never alter the exact attribution.
 */
export function attributeWithdrawalTaxByBucket(coalitionTaxes){
  const centsById = normalizeCoalitionTaxes(coalitionTaxes);
  const valueForMask = (mask) => centsById.get(COALITION_ID_BY_MASK.get(mask));
  const fullMask = (1 << WITHDRAWAL_BUCKETS.length) - 1;
  const baselineCents = valueForMask(0);
  const fullCents = valueForMask(fullMask);
  const incrementalCents = fullCents - baselineCents;

  // Multiply every Shapley weight by six: subset sizes 0 and 2 have coefficient
  // two; subset size 1 has coefficient one. The resulting integer is an exact
  // count of one-sixth-cent units.
  const exactSixthCents = WITHDRAWAL_BUCKETS.map((_, playerIndex) => {
    let units = 0;
    for(let mask = 0; mask <= fullMask; mask++){
      if(mask & (1 << playerIndex)) continue;
      const subsetSize = WITHDRAWAL_BUCKETS.reduce(
        (count, __, index) => count + (mask & (1 << index) ? 1 : 0),
        0
      );
      const coefficient = subsetSize === 1 ? 1 : 2;
      units += coefficient
        * (valueForMask(mask | (1 << playerIndex)) - valueForMask(mask));
    }
    return units;
  });

  const exactSixthCentsByBucket = Object.freeze(Object.fromEntries(
    WITHDRAWAL_BUCKETS.map((bucket, index) => [bucket, exactSixthCents[index]])
  ));
  const byBucket = Object.freeze(Object.fromEntries(
    WITHDRAWAL_BUCKETS.map((bucket, index) => [bucket, fromSixthCents(exactSixthCents[index])])
  ));
  const displayCents = exactSixthCents.map(roundSixthCentsToDisplayCents);
  const displayByBucket = Object.freeze(Object.fromEntries(
    WITHDRAWAL_BUCKETS.map((bucket, index) => [bucket, fromCents(displayCents[index])])
  ));
  const attributedSixthCents = exactSixthCents.reduce((sum, value) => sum + value, 0);
  const incrementalSixthCents = incrementalCents * 6;
  const displayAttributedCents = displayCents.reduce((sum, value) => sum + value, 0);

  return Object.freeze({
    method: 'three-bucket-shapley-line-24',
    baselineTax: fromCents(baselineCents),
    fullCoalitionTax: fromCents(fullCents),
    incrementalTax: fromCents(incrementalCents),
    byBucket,
    exactSixthCentsByBucket,
    displayByBucket,
    reconciliation: Object.freeze({
      unit: 'one-sixth-cent',
      incrementalSixthCents,
      attributedSixthCents,
      differenceSixthCents: incrementalSixthCents - attributedSixthCents,
      attributedTax: fromSixthCents(attributedSixthCents),
      difference: fromSixthCents(incrementalSixthCents - attributedSixthCents),
    }),
    displayReconciliation: Object.freeze({
      attributedTax: fromCents(displayAttributedCents),
      difference: fromCents(incrementalCents - displayAttributedCents),
    }),
  });
}
