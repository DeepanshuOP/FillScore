/**
 * A small in-memory cache with a time limit and a size limit (M5). For answers that cost a database read and a signature.
 * Keys must carry the account id (callers build `${accountId}:...`), so one account never reads another's entry. Memory only:
 * with several instances each has its own copy, which is fine for a short limit (see config/budget.py for the same remark).
 */
export class TtlCache<V> {
    private map = new Map<string, { v: V; at: number }>();
    constructor(private ttlMs: number, private max = 500, private now: () => number = Date.now) {}

    get(key: string): V | undefined {
        const e = this.map.get(key);
        if (!e) return undefined;
        if (this.now() - e.at >= this.ttlMs) { this.map.delete(key); return undefined; }
        return e.v;
    }

    set(key: string, v: V): void {
        this.map.delete(key);                                  // a re-set moves the key to the end and restarts its time
        this.map.set(key, { v, at: this.now() });
        while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);   // oldest first
    }

    delete(key: string): void { this.map.delete(key); }
    deleteByPrefix(prefix: string): void { for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k); }
    clear(): void { this.map.clear(); }
    size(): number { return this.map.size; }
}
