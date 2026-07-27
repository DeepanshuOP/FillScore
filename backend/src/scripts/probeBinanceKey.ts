import crypto from 'crypto';

const apiKey = process.env.BINANCE_PROBE_KEY;
const apiSecret = process.env.BINANCE_PROBE_SECRET;

if (!apiKey || !apiSecret) {
    console.error('Missing BINANCE_PROBE_KEY or BINANCE_PROBE_SECRET in environment variables.');
    process.exit(1);
}

function buildSignature(queryString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function probeMyTradesConstraint(
    label: string,
    params: Record<string, string | number>,
    printWeightHeader: boolean = false
): Promise<void> {
    const timestamp = Date.now();
    const queryParams = { ...params, timestamp };
    const queryString = Object.entries(queryParams)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&');
    const signature = buildSignature(queryString, apiSecret!);
    const fullQuery = `${queryString}&signature=${signature}`;

    try {
        const res = await fetch(`https://api.binance.com/api/v3/myTrades?${fullQuery}`, {
            headers: {
                'X-MBX-APIKEY': apiKey!
            }
        });

        console.log(`\n--- ${label} ---`);
        console.log(`HTTP Status: ${res.status}`);

        if (printWeightHeader) {
            const usedWeight = res.headers.get('x-mbx-used-weight-1m') || res.headers.get('X-MBX-USED-WEIGHT-1M') || 'not-returned';
            console.log(`x-mbx-used-weight-1m: ${usedWeight}`);
        }

        if (!res.ok) {
            let errorData: any;
            try {
                errorData = await res.json();
            } catch (e) {
                errorData = { code: 'unknown', msg: 'Could not parse error response' };
            }
            console.log(`Error Code: ${errorData.code}, Msg: ${errorData.msg}`);
            console.log(`Rows returned: N/A (request failed)`);
        } else {
            const data = await res.json();
            console.log(`Error Code: none, Msg: none`);
            console.log(`Rows returned: ${Array.isArray(data) ? data.length : 0}`);
        }
    } catch (error: any) {
        console.error(`--- ${label} ---`);
        console.error(`Execution Error: ${error.message}`);
    }
}

async function probe() {
    try {
        console.log('=== STEP 1: Probing Account Information ===');
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = buildSignature(queryString, apiSecret!);
        
        const accountRes = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
            headers: {
                'X-MBX-APIKEY': apiKey!
            }
        });

        if (!accountRes.ok) {
            let errorData;
            try {
                errorData = await accountRes.json();
            } catch (e) {
                errorData = { code: 'unknown', msg: 'Could not parse error response' };
            }
            console.error(`Account API Failed! Status: ${accountRes.status}`);
            console.error(`Code: ${errorData.code}, Msg: ${errorData.msg}`);
        } else {
            const data = await accountRes.json();
            console.log('Account API Succeeded. Permissions & Profile:');
            console.log(`canTrade: ${data.canTrade}`);
            console.log(`canWithdraw: ${data.canWithdraw}`);
            console.log(`canDeposit: ${data.canDeposit}`);
            console.log(`accountType: ${data.accountType}`);
            if (data.permissions) {
                console.log(`permissions: ${data.permissions.join(', ')}`);
            }
            console.log(`Count of balances: ${Array.isArray(data.balances) ? data.balances.length : 0}`);
        }

        console.log('\n=== STEP 1.5: Probing API Restrictions ===');
        const restrictionsQueryString = `timestamp=${Date.now()}`;
        const restrictionsSignature = buildSignature(restrictionsQueryString, apiSecret!);
        
        const restrictionsRes = await fetch(`https://api.binance.com/sapi/v1/account/apiRestrictions?${restrictionsQueryString}&signature=${restrictionsSignature}`, {
            headers: {
                'X-MBX-APIKEY': apiKey!
            }
        });

        if (!restrictionsRes.ok) {
            let errorData;
            try {
                errorData = await restrictionsRes.json();
            } catch (e) {
                errorData = { code: 'unknown', msg: 'Could not parse error response' };
            }
            console.error(`API Restrictions Failed! Status: ${restrictionsRes.status}`);
            console.error(`Code: ${errorData.code}, Msg: ${errorData.msg}`);
        } else {
            const restrictionsData = await restrictionsRes.json();
            console.log('API Restrictions Succeeded. Full Response:');
            console.log(JSON.stringify(restrictionsData, null, 2));
        }

        console.log('\n=== STEP 2: Probing BTCUSDT Trade History ===');
        const tradeQueryString = `symbol=BTCUSDT&timestamp=${Date.now()}`;
        const tradeSignature = buildSignature(tradeQueryString, apiSecret!);

        const tradeRes = await fetch(`https://api.binance.com/api/v3/myTrades?${tradeQueryString}&signature=${tradeSignature}`, {
            headers: {
                'X-MBX-APIKEY': apiKey!
            }
        });

        if (!tradeRes.ok) {
            let errorData;
            try {
                errorData = await tradeRes.json();
            } catch (e) {
                errorData = { code: 'unknown', msg: 'Could not parse error response' };
            }
            console.error(`Trades API Failed! Status: ${tradeRes.status}`);
            console.error(`Code: ${errorData.code}, Msg: ${errorData.msg}`);
        } else {
            const tradeData = await tradeRes.json();
            console.log(`Trades API Succeeded. Status: ${tradeRes.status}`);
            console.log(`Count of returned trades: ${Array.isArray(tradeData) ? tradeData.length : 0}`);
        }

        console.log('\n=== STEP 3: myTrades CONSTRAINTS ===');
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        await probeMyTradesConstraint('3a. NO time params at all (symbol=BTCUSDT, limit=1000)', {
            symbol: 'BTCUSDT',
            limit: 1000
        }, true);

        await probeMyTradesConstraint('3b. 30-DAY window (startTime=now-30d, endTime=now)', {
            symbol: 'BTCUSDT',
            startTime: now - (30 * DAY_MS),
            endTime: now,
            limit: 1000
        });

        await probeMyTradesConstraint('3c. 7-DAY window (startTime=now-7d, endTime=now)', {
            symbol: 'BTCUSDT',
            startTime: now - (7 * DAY_MS),
            endTime: now,
            limit: 1000
        });

        await probeMyTradesConstraint('3d. 24-HOUR window (startTime=now-24h, endTime=now)', {
            symbol: 'BTCUSDT',
            startTime: now - DAY_MS,
            endTime: now,
            limit: 1000
        });

        await probeMyTradesConstraint('3e. fromId pagination (symbol=BTCUSDT, fromId=0, limit=1000)', {
            symbol: 'BTCUSDT',
            fromId: 0,
            limit: 1000
        });

        await probeMyTradesConstraint('3f. fromId + startTime together (fromId=0, startTime=now-30d, limit=1000)', {
            symbol: 'BTCUSDT',
            fromId: 0,
            startTime: now - (30 * DAY_MS),
            limit: 1000
        });
    } catch (error: any) {
        console.error(`Network or Execution Error: ${error.message}`);
    }
}

probe();
