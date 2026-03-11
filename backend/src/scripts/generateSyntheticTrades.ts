import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface TraderProfile {
    id: string;
    name: string;
    marketOrderRatio: number;
    preferredHours: number[];
    avgTradeUSD: number;
    tradesPerDay: number;
    slippageMult: number;
    symbolWeights: Record<string, number>;
}

export const profiles: TraderProfile[] = [
    {
        id: 'aggressive',
        name: 'Aggressive Portfolio Manager',
        symbolWeights: {
            BTCUSDT: 0.30,
            ETHUSDT: 0.25,
            BNBUSDT: 0.20,
            SOLUSDT: 0.25
        },
        marketOrderRatio: 0.75,
        preferredHours: [21, 22, 23, 0, 1, 2, 3],
        avgTradeUSD: 800,
        tradesPerDay: 6,
        slippageMult: 2.2
    },
    {
        id: 'moderate',
        name: 'Moderate Portfolio Manager',
        symbolWeights: {
            BTCUSDT: 0.45,
            ETHUSDT: 0.35,
            BNBUSDT: 0.10,
            SOLUSDT: 0.10
        },
        marketOrderRatio: 0.50,
        preferredHours: [8, 9, 10, 11, 14, 15, 16, 17, 19, 20],
        avgTradeUSD: 500,
        tradesPerDay: 4,
        slippageMult: 1.0
    },
    {
        id: 'disciplined',
        name: 'Disciplined Portfolio Manager',
        symbolWeights: {
            BTCUSDT: 0.55,
            ETHUSDT: 0.30,
            BNBUSDT: 0.10,
            SOLUSDT: 0.05
        },
        marketOrderRatio: 0.18,
        preferredHours: [8, 9, 10, 11, 12, 13, 14, 15],
        avgTradeUSD: 600,
        tradesPerDay: 3,
        slippageMult: 0.35
    }
];

export interface SyntheticTrade {
    userId: string;
    exchange: "binance";
    symbol: string;
    tradeId: string;
    orderId: string;
    side: "BUY" | "SELL";
    orderType: "MARKET" | "LIMIT";
    isMaker: boolean;
    executionPrice: number;
    quantity: number;
    notional: number;
    fee: number;
    feeAsset: string;
    executedAt: string;
}

export async function generateSyntheticTradesForAll() {
    const marketDir = path.join(__dirname, '../../src/data/market');
    const outDir = path.join(__dirname, '../../src/data/synthetic');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

    const tradesByProfile: Record<string, SyntheticTrade[]> = {
        'aggressive': [],
        'moderate': [],
        'disciplined': []
    };

    for (const symbol of symbols) {
        const csvPath = path.join(marketDir, `${symbol}-1m-2024-01.csv`);
        if (!fs.existsSync(csvPath)) {
            console.error(`Missing market data for ${symbol}. Please run download:data first.`);
            continue;
        }

        const fileStream = fs.createReadStream(csvPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const prevCloses: number[] = [];

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
            const volatility = (high - low) / open;

            prevCloses.push(close);
            if (prevCloses.length > 4) {
                prevCloses.shift();
            }

            for (const profile of profiles) {
                if (!profile.preferredHours.includes(hour)) continue;

                let probability = (profile.tradesPerDay / 1440) * profile.symbolWeights[symbol] * 4;
                if (volatility > 0.002) probability *= 1.5;

                if (Math.random() < probability) {
                    let side: 'BUY' | 'SELL' = 'BUY';
                    if (profile.id === 'aggressive') {
                        side = Math.random() < 0.70 ? 'BUY' : 'SELL';
                    } else if (profile.id === 'disciplined') {
                        if (prevCloses.length >= 3) {
                            const trendingUp = prevCloses[prevCloses.length - 1] > prevCloses[prevCloses.length - 3];
                            side = trendingUp ? 'BUY' : 'SELL';
                        } else {
                            side = Math.random() < 0.5 ? 'BUY' : 'SELL';
                        }
                    } else {
                        // moderate
                        if (prevCloses.length >= 3) {
                            const trendingUp = prevCloses[prevCloses.length - 1] > prevCloses[prevCloses.length - 3];
                            if (trendingUp) {
                                side = Math.random() < 0.65 ? 'BUY' : 'SELL';
                            } else {
                                side = Math.random() < 0.65 ? 'SELL' : 'BUY';
                            }
                        } else {
                            side = Math.random() < 0.5 ? 'BUY' : 'SELL';
                        }
                    }

                    const baseUSD = profile.avgTradeUSD * profile.symbolWeights[symbol] * (0.6 + Math.random() * 0.8);
                    const quantity = baseUSD / open;

                    const isMarket = Math.random() < profile.marketOrderRatio;
                    const isMaker = !isMarket;
                    const direction = side === 'BUY' ? 1 : -1;
                    
                    let execPrice = 0;
                    if (isMarket) {
                        const slippage = (0.0002 + Math.random() * 0.0018) * profile.slippageMult;
                        let spreadMult = 1.0;
                        if (symbol === 'ETHUSDT') spreadMult = 1.2;
                        if (symbol === 'BNBUSDT') spreadMult = 1.5;
                        if (symbol === 'SOLUSDT') spreadMult = 2.0;
                        
                        execPrice = open * (1 + direction * (slippage * spreadMult));
                    } else {
                        const slippage = (0.00005 + Math.random() * 0.0001);
                        execPrice = open * (1 + direction * slippage);
                    }

                    const notional = quantity * execPrice;
                    const fee = notional * (isMaker ? 0.0002 : 0.001);
                    const executedAtMs = openTime + Math.floor(Math.random() * 59000);

                    const trade: SyntheticTrade = {
                        userId: `demo-${profile.id}`,
                        exchange: 'binance',
                        symbol,
                        tradeId: `syn-${profile.id}-${symbol}-${Math.floor(Math.random() * 1000000)}`,
                        orderId: `ord-${profile.id}-${symbol}-${Math.floor(Math.random() * 1000000)}`,
                        side,
                        orderType: isMarket ? 'MARKET' : 'LIMIT',
                        isMaker,
                        executionPrice: execPrice,
                        quantity,
                        notional,
                        fee,
                        feeAsset: 'USDT',
                        executedAt: new Date(executedAtMs).toISOString()
                    };

                    tradesByProfile[profile.id].push(trade);
                }
            }
        }
    }

    return tradesByProfile;
}

if (require.main === module) {
    generateSyntheticTradesForAll().then(tradesByProfile => {
        const outDir = path.join(__dirname, '../../src/data/synthetic');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        
        for (const [profileId, trades] of Object.entries(tradesByProfile)) {
            const outPath = path.join(outDir, `${profileId}-trades.json`);
            fs.writeFileSync(outPath, JSON.stringify(trades, null, 2));
            
            const symbolCounts: Record<string, number> = {};
            for (const t of trades) {
                symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
            }
            const breakdown = Object.entries(symbolCounts).map(([sym, count]) => `${count} ${sym}`).join(', ');
            console.log(`demo-${profileId}: ${breakdown} = ${trades.length} total`);
        }
    }).catch(console.error);
}
