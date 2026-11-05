export interface SyncStatus {
  state: 'idle' | 'running' | 'done' | 'partial' | 'needs_attention' | 'failed';
  symbolsDone: number;
  symbolsTotal: number;
  tradesAdded: number;
  lookbackDays?: number;
  partialReason?: string;
  partialMessage?: string;
  error?: string;
  result?: {
    tradesIngested?: number; tradesScored?: number; fillScore?: number; grade?: string;
    noTrades?: boolean; invalidSymbols?: string[]; error?: string; disable?: string[]; enable?: string[];
  };
}

export const POLL_INTERVAL_MS = 3000;

/** Polls until the job leaves `running`. Calls onUpdate with every status. Rejects after maxPolls. */
export async function pollSyncStatus(opts: {
  fetchStatus: () => Promise<SyncStatus>;
  onUpdate?: (s: SyncStatus) => void;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxPolls?: number;
}): Promise<SyncStatus> {
  const sleep = opts.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const max = opts.maxPolls ?? 400; // 400 x 3 s = 20 min, longer than the server's 15 min lease
  for (let i = 0; i < max; i++) {
    const s = await opts.fetchStatus();
    opts.onUpdate?.(s);
    if (s.state !== 'running') return s;
    await sleep(interval);
  }
  throw new Error('sync_poll_timeout');
}

export function progressText(s: SyncStatus): string {
  if (s.symbolsTotal > 0) {
    return `Fetched ${s.symbolsDone} of ${s.symbolsTotal} markets, ${s.tradesAdded} trades so far...`;
  }
  return 'Looking up the markets you have traded...';
}
