// Display threshold for the fee-drag note below. It is a reading aid, not a computed benchmark.
export const MAKER_TARGET_PCT = 80;

/**
 * One line of context under the maker-ratio tile. It only ever restates the measured
 * ratio, and only suggests a change when the measured ratio is under the threshold.
 */
export function makerRatioNote(makerRatioPct: number): string {
  if (!Number.isFinite(makerRatioPct)) {
    return 'Maker ratio is not available for this account yet.';
  }
  const shown = Math.round(makerRatioPct);
  if (makerRatioPct >= MAKER_TARGET_PCT) {
    return `${shown}% of your fills were maker — nothing to change on order type here.`;
  }
  return `${shown}% of your fills were maker. Where a venue charges less for maker fills, moving more orders to limit orders cuts fee drag; ${MAKER_TARGET_PCT}% is the level this panel treats as healthy.`;
}
