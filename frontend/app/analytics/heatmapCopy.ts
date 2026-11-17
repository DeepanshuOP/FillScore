/** Heatmap sentences on the analytics page. They describe the account's own past fills (v1 per-fill scores) and give no guidance.
 *  The rules behind them (analytics/page.tsx): best and worst consider hours with at least 2 fills; the weak hour is one whose average
 *  score is below 50 over at least 3 fills. The sentences say so. */
interface Cell { day: number; hour: number }

const when = (days: string[], c: Cell) => `${days[c.day]} ${c.hour.toString().padStart(2, '0')}:00 UTC`;

export const bestHourLabel = (days: string[], c: Cell) => `Highest-scoring hour of your past fills (hours with at least 2 fills): ${when(days, c)}`;
export const worstHourLabel = (days: string[], c: Cell) => `Lowest-scoring hour of your past fills (hours with at least 2 fills): ${when(days, c)}`;
export const weakHourLabel = (days: string[], c: Cell) => `Your past fills during ${when(days, c)} averaged a score below 50 (at least 3 fills)`;
