export type TraderProfile = {
    id: string;
    name: string;
    marketOrderRatio: number;     // 0-1, probability of using market order 
    preferredHours: number[];     // UTC hours they typically trade 
    avgTradeUSD: number;          // average trade size in USD 
    tradesPerDay: number;         // avg number of trades per day 
    slippageMult: number;         // multiplier on base slippage (aggressive = higher) 
};

export const profiles: TraderProfile[] = [
    {
        id: 'aggressive',
        name: 'Aggressive Trader',
        marketOrderRatio: 0.70,
        preferredHours: [22, 23, 0, 1, 2, 3, 4, 5, 6], // night hours
        avgTradeUSD: 2500,
        tradesPerDay: 15,
        slippageMult: 2.0
    },
    {
        id: 'moderate',
        name: 'Moderate Trader',
        marketOrderRatio: 0.50,
        preferredHours: [0, 1, 6, 7, 8, 12, 13, 18, 19, 20, 21], // mixed
        avgTradeUSD: 1000,
        tradesPerDay: 8,
        slippageMult: 1.0
    },
    {
        id: 'disciplined',
        name: 'Disciplined Trader',
        marketOrderRatio: 0.20,
        preferredHours: [8, 9, 10, 11, 12, 13, 14, 15, 16], // 08-16 UTC
        avgTradeUSD: 500,
        tradesPerDay: 5,
        slippageMult: 0.4
    }
];
