/* Consume engine row facts for taxable-account gain fraction (no basis replay). */

/**
 * Read start-of-year taxable gain fraction exposed on an engine row.
 * Returns undefined when the row has no taxable withdrawal.
 */
export function gainFractionFromRow(row){
  if(row?.taxableGainFraction !== undefined) return row.taxableGainFraction;
  return undefined;
}

/**
 * Merge per-row taxableGainFraction from engine rows into rowPlanMeta.
 */
export function buildRowTaxableGainPlanMeta(baseRowPlanMeta = null){
  return (row, index) => {
    const meta = baseRowPlanMeta ? { ...baseRowPlanMeta(row, index) } : {};
    const gainFraction = gainFractionFromRow(row);
    if(gainFraction !== undefined) meta.taxableGainFraction = gainFraction;
    return Object.keys(meta).length > 0 ? meta : null;
  };
}

/** @deprecated Use buildRowTaxableGainPlanMeta — kept for transitional imports. */
export const buildDynamicTaxableGainRowPlanMeta = buildRowTaxableGainPlanMeta;
