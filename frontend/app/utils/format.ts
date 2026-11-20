import { formatUsd as formatUsdRule } from '../ui/format';

/**
 * USD for the screens that still read "—" for a missing value (trades, part 2). The number rule is the one in
 * app/ui/format.ts (two decimals, true minus, "<$0.01" for a real value below a cent); only the missing-value text differs.
 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatUsdRule(value);
}
