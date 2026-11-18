/**
 * Condition-based waiting for tests: poll `check` until it returns a truthy value, then return that value.
 * Use it instead of `await sleep(N)` followed by an assertion: a fixed sleep passes on a fast machine and fails on a slow CI runner,
 * while this returns as soon as the condition holds and fails with a clear message only after `timeoutMs` (a generous bound, not a delay).
 */
export async function waitUntil<T>(check: () => T | Promise<T>, what = 'condition', timeoutMs = 10_000): Promise<NonNullable<T>> {
    const start = Date.now();
    for (;;) {
        const v = await check();
        if (v) return v as NonNullable<T>;
        if (Date.now() - start > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
        await new Promise(r => setTimeout(r, 5));
    }
}
