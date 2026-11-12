/**
 * Scoring v2 grades of the three Binance demos rebuilt from real January 2024 prints (M2), copied from
 * ml-service/demo_v2/out/grades_v2.json (built by ml-service/scripts/build_demo_v2.py through the production
 * measurement job and scorer, offline). GET /api/audit/v2 serves them for a demo account only once its rebuilt orders
 * are in the database. A test (routes/__tests__/auditV2.test.ts) fails when this copy differs from the build output.
 * Every number here comes from deterministic code; nothing is typed by hand.
 */
export const DEMO_V2_GRADES = {
    'demo-aggressive': {
        integrityHash: '7f84fe13f73e0753ee67a5e470c457d2c6cc5d6feef791e7802d6a4fb508e976',
        measureVersion: '1.0.0', measured: 721, orders: 311,
        result: {
            band: [77.3108380304442, 79.18252979180266],
            components: {
                fees: { measured: 721, reason: null, score: 100.0, unmeasured: 0 },
                slippage: { measured: 702, reason: null, score: 76.28305029304894, unmeasured: 19 },
                spread: { measured: 712, reason: null, score: 90.54916556506288, unmeasured: 9 },
                timing: { measured: 721, reason: null, score: 51.91932097852902, unmeasured: 0 },
            },
            composite: 78.26127268195881, fills: 721, grade: 'B', orders: 309, reason: null,
        },
        scoringVersion: 'v2.1.0', skipped: {}, unmeasuredFills: 9,
        versionFileSha256: '63e20f1dc10b62e34bb43afdf0c875aee336b12145e4d750f2bef9e6fc0a57b0',
    },
    'demo-disciplined': {
        integrityHash: '991a081e91f58e001ed8ba1e70f819e7b0d2431d59754fa8817f2a80b89b74d7',
        measureVersion: '1.0.0', measured: 385, orders: 144,
        result: {
            band: [71.65173492782165, 74.55542740259152],
            components: {
                fees: { measured: 385, reason: null, score: 100.00000000000007, unmeasured: 0 },
                slippage: { measured: 385, reason: null, score: 75.02966282809359, unmeasured: 0 },
                spread: { measured: 385, reason: null, score: 91.98931795363181, unmeasured: 0 },
                timing: { measured: 385, reason: null, score: 32.01413401594112, unmeasured: 0 },
            },
            composite: 73.06231318686282, fills: 385, grade: 'C', orders: 138, reason: null,
        },
        scoringVersion: 'v2.1.0', skipped: {}, unmeasuredFills: 0,
        versionFileSha256: '63e20f1dc10b62e34bb43afdf0c875aee336b12145e4d750f2bef9e6fc0a57b0',
    },
    'demo-moderate': {
        integrityHash: '3d0213e6acf621fe60423046136c708d96b314018b8c83262b150fe66d924e60',
        measureVersion: '1.0.0', measured: 607, orders: 245,
        result: {
            band: [75.19182086484594, 77.54572363572287],
            components: {
                fees: { measured: 607, reason: null, score: 100.00000000000016, unmeasured: 0 },
                slippage: { measured: 607, reason: null, score: 76.87753630263151, unmeasured: 0 },
                spread: { measured: 607, reason: null, score: 90.48197668533663, unmeasured: 0 },
                timing: { measured: 607, reason: null, score: 43.52543847871633, unmeasured: 0 },
            },
            composite: 76.36079382840065, fills: 607, grade: 'B', orders: 234, reason: null,
        },
        scoringVersion: 'v2.1.0', skipped: {}, unmeasuredFills: 0,
        versionFileSha256: '63e20f1dc10b62e34bb43afdf0c875aee336b12145e4d750f2bef9e6fc0a57b0',
    },
} as const;

export type RebuiltDemoId = keyof typeof DEMO_V2_GRADES;
