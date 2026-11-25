/**
 * The two numbers that the Comparisons copy states: the level of the interval and the fewest orders a group needs. They are the
 * backend's own constants (`RANK_LEVEL` and `MIN_GROUP_N` in backend/src/services/rankWithNoise.ts, which the rankings route serves as
 * `level` and `minOrders`). A page that has the served body prints the served values; copy that is written before any body is loaded
 * (page descriptions, the method sheet) prints these, and `rankConstants.test.ts` fails if they ever differ from the backend's.
 */
export const RANK_LEVEL = 0.9
export const RANK_MIN_ORDERS = 20

/** "90%": the interval level as a percent, from the constant. */
export const RANK_LEVEL_PERCENT = `${Math.round(RANK_LEVEL * 100)}%`
