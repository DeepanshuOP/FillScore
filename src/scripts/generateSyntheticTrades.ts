import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { profiles, TraderProfile } from '../data/traderProfiles';

// We implement a standalone representation to allow JSON saving
interface SyntheticTrade {
    userId: string;
    exchange: "binance" | "bybit";
    symbol: string;
    tradeId: string;
    orderId: string;
    side: "BUY" | "SELL";
    orderType: "MARKET" | "LIMIT" | "UNKNOWN";
    isMaker: boolean;
    executionPrice: number;
    quantity: number;
    notional: number;
    fee: number;
    feeAsset: string;
    executedAt: string; // Will be parsed back to Date on seed
}

async function run() {
    const csvFile = process.argv[2];
    if (!csvFile) {
        console.error("Please provide a CSV file path as an argument. e.g., npx ts-node src/scripts/generateSyntheticTrades.ts path/to/BTCUSDT-1m.csv");
        process.exit(1);
    }

    const absPath = path.resolve(csvFile);
    if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
    }

    const tradesByProfile: Record<string, SyntheticTrade[]> = {
        'aggressive': [],
        'moderate': [],
        'disciplined': []
    };

    const fileStream = fs.createReadStream(absPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let prevCloses: number[] = [];

    // Parse Binance 1M Klines CSV
    // Format: openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume, ignore
    for await (const line of rl) {
        if (!line.trim()) continue;
        const parts = line.split(',');
        if (parts.length < 6) continue;

        const openTime = parseInt(parts[0], 10);
        const open = parseFloat(parts[1]);
        const high = parseFloat(parts[2]);
        const low = parseFloat(parts[3]);
        const close = parseFloat(parts[4]);

        if (isNaN(openTime) || isNaN(open)) continue;

        const date = new Date(openTime);
        const hour = date.getUTCHours();

        // Measure short term volatility spread 
        const volatility = (high - low) / open;

        // Scale probability of trading slightly if there's aggressive volatility
        const volMultiplier = 1 + (volatility * 10);

        prevCloses.push(close);
        if (prevCloses.length > 4) {
            prevCloses.shift();
        }

        for (const profile of profiles) {
            let hourFactor = profile.preferredHours.includes(hour) ? 1.0 : 0.05; // 95% penalty if trading outside preferred hours

            const baseProb = profile.tradesPerDay / 1440; // 1440 minutes in a day
            const prob = baseProb * volMultiplier * hourFactor;

            if (Math.random() < prob) {
                // Determine side based on 3-candle trend
                let side: 'BUY' | 'SELL' = 'BUY';
                if (prevCloses.length >= 3) {
                    const trendingUp = prevCloses[prevCloses.length - 1] > prevCloses[prevCloses.length - 3];
                    if (trendingUp) {
                        side = Math.random() < 0.70 ? 'BUY' : 'SELL';
                    } else {
                        side = Math.random() < 0.70 ? 'SELL' : 'BUY';
                    }
                } else {
                    side = Math.random() < 0.50 ? 'BUY' : 'SELL';
                }

                // Determine quantity with variance
                const quantity = (profile.avgTradeUSD / open) * (0.5 + Math.random());

                // Determine execution parameters
                const isMarket = Math.random() < profile.marketOrderRatio;
                const isMaker = !isMarket; // Only Limits are makers
                let execPrice = 0;

                if (isMarket) {
                    // market order → candle_open × (1 ± 0.0003 to 0.002 adjusted by slippage mult) 
                    const slip = (0.0003 + Math.random() * 0.0017) * profile.slippageMult;
                    execPrice = open * (1 + (side === 'BUY' ? 1 : -1) * slip);
                } else {
                    // limit order → candle_open × (1 ± 0.00005 to 0.00015)
                    const slip = 0.00005 + Math.random() * 0.0001;
                    execPrice = open * (1 + (side === 'BUY' ? 1 : -1) * slip);
                }

                // Compute fees
                const notional = quantity * execPrice;
                const fee = notional * (isMaker ? 0.0002 : 0.001);

                // Add random seconds to execution time so they aren't all exactly 00s
                const executedAtMs = openTime + Math.floor(Math.random() * 59000);

                const trade: SyntheticTrade = {
                    userId: `demo-${profile.id}`,
                    exchange: 'binance',
                    symbol: 'BTCUSDT',
                    tradeId: `syn-${profile.id}-${Math.floor(Math.random() * 1000000)}`,
                    orderId: `ord-${profile.id}-${Math.floor(Math.random() * 1000000)}`,
                    side,
                    orderType: isMarket ? 'MARKET' : 'LIMIT',
                    isMaker,
                    executionPrice: execPrice,
                    quantity: quantity,
                    notional: notional,
                    fee: fee,
                    feeAsset: 'USDT',
                    executedAt: new Date(executedAtMs).toISOString()
                };

                tradesByProfile[profile.id].push(trade);
            }
        }
    }

    const outDir = path.join(__dirname, '../../src/data/synthetic');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    for (const profile of profiles) {
        const outPath = path.join(outDir, `${profile.id}-trades.json`);
        fs.writeFileSync(outPath, JSON.stringify(tradesByProfile[profile.id], null, 2));
        console.log(`Generated ${tradesByProfile[profile.id].length} trades for ${profile.name}`);
    }
}

run().catch(console.error);
