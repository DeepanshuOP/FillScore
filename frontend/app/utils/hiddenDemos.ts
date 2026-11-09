// Mirrors HIDDEN_DEMO_IDS in backend/src/middleware/resolveAccount.ts (a test asserts equality).
export const HIDDEN_DEMO_IDS: readonly string[] = ['demo-bybit', 'demo-okx', 'demo-multi'];

export const isHiddenDemo = (id: unknown): boolean =>
  typeof id === 'string' && HIDDEN_DEMO_IDS.includes(id);

export const visibleDemoProfiles = <T extends { id: string }>(profiles: readonly T[]): T[] =>
  profiles.filter((p) => !isHiddenDemo(p.id));

export const MULTI_VENUE_UNAVAILABLE = 'Multi-venue demo temporarily unavailable';

/** Comparison-card notice for a hidden demo id; null otherwise. */
export const multiVenueNotice = (id: unknown): string | null =>
  isHiddenDemo(id) ? MULTI_VENUE_UNAVAILABLE : null;
