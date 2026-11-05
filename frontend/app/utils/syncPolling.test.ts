import { describe, it, expect } from 'vitest';
import { pollSyncStatus, progressText, SyncStatus } from './syncPolling';

const st = (state: SyncStatus['state'], extra: Partial<SyncStatus> = {}): SyncStatus => ({ state, symbolsDone: 0, symbolsTotal: 0, tradesAdded: 0, ...extra });

describe('pollSyncStatus', () => {
  it('polls every interval while running, reports each status, and stops at done', async () => {
    const seq = [st('running', { symbolsDone: 1, symbolsTotal: 4 }), st('running', { symbolsDone: 3, symbolsTotal: 4 }), st('done')];
    let i = 0; const sleeps: number[] = []; const seen: string[] = [];
    const out = await pollSyncStatus({ fetchStatus: async () => seq[i++], sleep: async ms => { sleeps.push(ms); }, onUpdate: s => seen.push(s.state) });
    expect(out.state).toBe('done');
    expect(i).toBe(3);               // 3 fetches
    expect(sleeps).toEqual([3000, 3000]); // 2 waits of 3 s between them
    expect(seen).toEqual(['running', 'running', 'done']);
  });
  it('stops on partial, needs_attention and failed too', async () => {
    for (const s of ['partial', 'needs_attention', 'failed'] as const) {
      expect((await pollSyncStatus({ fetchStatus: async () => st(s), sleep: async () => {} })).state).toBe(s);
    }
  });
  it('gives up after maxPolls', async () => {
    await expect(pollSyncStatus({ fetchStatus: async () => st('running'), sleep: async () => {}, maxPolls: 3 })).rejects.toThrow('sync_poll_timeout');
  });
  it('progress text uses done/total/trades', () => {
    expect(progressText(st('running', { symbolsDone: 2, symbolsTotal: 5, tradesAdded: 40 }))).toBe('Fetched 2 of 5 markets, 40 trades so far...');
    expect(progressText(st('running'))).toContain('Looking up');
  });
});
