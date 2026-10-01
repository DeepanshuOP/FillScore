import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app';
import { listRoutes } from '../utils/listRoutes';

const routes = listRoutes(createApp());
const has = (method: string, p: string) => routes.some(r => r.method === method && r.path === p);

describe('listRoutes', () => {
    it('expands mounted routers to their full paths', () => {
        expect(has('GET', '/api/audit/score')).toBe(true);
        expect(has('POST', '/api/audit/run')).toBe(true);
        expect(has('POST', '/api/auth/oauth/exchange')).toBe(true);
        expect(has('POST', '/api/onboarding/connect')).toBe(true);
        expect(has('GET', '/api/preflight/exchanges')).toBe(true);
    });

    it('expands routes declared with several paths', () => {
        expect(has('GET', '/health')).toBe(true);
        expect(has('GET', '/api/health')).toBe(true);
    });

    it('does not expose the audit routes anywhere else', () => {
        expect(has('GET', '/api/score')).toBe(false);
        expect(has('POST', '/api/run')).toBe(false);
        expect(has('GET', '/api/trades')).toBe(false);
    });

    it('lists each method and path once', () => {
        const keys = routes.map(r => `${r.method} ${r.path}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('ARCHITECTURE.md', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, '../../../ARCHITECTURE.md'), 'utf8');

    it('documents every route the backend actually serves', () => {
        const missing = routes
            .filter(r => !doc.includes(`| ${r.method} | \`${r.path}\` |`))
            .map(r => `${r.method} ${r.path}`);
        expect(missing).toEqual([]);
    });

    it('documents no route the backend does not serve', () => {
        // only the backend section: the ml-service has its own table further down
        const start = doc.indexOf('### API surface');
        const end = doc.indexOf('## 3.');
        const backendSection = doc.slice(start, end);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const documented = [...backendSection.matchAll(/^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/gm)].map(m => `${m[1]} ${m[2]}`);
        expect(documented.length).toBeGreaterThan(30);
        const served = new Set(routes.map(r => `${r.method} ${r.path}`));
        const stale = documented.filter(d => !served.has(d));
        expect(stale).toEqual([]);
    });

    it('does not carry the retired demo grade set', () => {
        expect(doc).not.toMatch(/95\.675|84\.570|60\.771/);
    });
});
