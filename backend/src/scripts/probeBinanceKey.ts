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
    } catch (error: any) {
        console.error(`Network or Execution Error: ${error.message}`);
    }
}

probe();
