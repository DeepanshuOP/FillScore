import { EnrichedTrade, TradeScores } from '../types';

const WEIGHTS = {
    slippage: 0.35,
    fee: 0.25,
    timing: 0.25,
    exchange: 0.15
} as const;

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
}

/**
 * Validates that a numeric input is a valid finite number.
 * @param value - the number to validate
 * @param name - the name of the variable (for error message)
 */
function assertValidNumber(value: number, name: string) {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        throw new Error(`Invalid input for ${name}: must be a finite number.`);
    }
}

/**
 * Computes Arrival Slippage in basis points (bps).
 * Slippage reflects execution quality relative to market price at the moment of arrival.
 * Positive = bad for BUY (paid more than market proxy), bad for SELL (received less than proxy).
 * Negative = price improvement.
 * 
 * @param execPrice - The actual price the trade executed at
 * @param arrivalPrice - The proxy arrival price (1m kline open)
 * @param side - Trade side: 'BUY' or 'SELL'
 * @returns Slippage in basis points
 */
export function computeArrivalSlippageBps(execPrice: number, arrivalPrice: number, side: 'BUY' | 'SELL'): number {
    assertValidNumber(execPrice, 'execPrice');
    assertValidNumber(arrivalPrice, 'arrivalPrice');

    if (arrivalPrice === 0) throw new Error("Division by zero: arrivalPrice cannot be 0");

    const rawDiff = side === 'BUY'
        ? execPrice - arrivalPrice
        : arrivalPrice - execPrice; // For SELLS, executing lower than arrival is bad

    return (rawDiff / arrivalPrice) * 10000;
}

/**
 * Computes VWAP (Volume Weighted Average Price) Slippage in basis points.
 * Measures execution quality against the 5-minute volume-weighted average price.
 * 
 * @param execPrice - The actual executed price
 * @param vwap - The calculated 5-min VWAP
 * @param side - Trade side: 'BUY' or 'SELL'
 * @returns VWAP Slippage in basis points
 */
export function computeVwapSlippageBps(execPrice: number, vwap: number, side: 'BUY' | 'SELL'): number {
    assertValidNumber(execPrice, 'execPrice');
    assertValidNumber(vwap, 'vwap');

    if (vwap === 0) throw new Error("Division by zero: vwap cannot be 0");

    const rawDiff = side === 'BUY'
        ? execPrice - vwap
        : vwap - execPrice;

    return (rawDiff / vwap) * 10000;
}

/**
 * Calculates the implied spread cost in USD.
 * Approximates how much value was lost purely to crossing the bid-ask spread.
 * 
 * @param execPrice - Executed price
 * @param bid - Best bid at execution time
 * @param ask - Best ask at execution time
 * @param quantity - The amount of asset traded
 * @returns Spread cost modeled in USD terms
 */
export function computeSpreadCostUSD(execPrice: number, bid: number, ask: number, quantity: number): number {
    assertValidNumber(execPrice, 'execPrice');
    assertValidNumber(bid, 'bid');
    assertValidNumber(ask, 'ask');
    assertValidNumber(quantity, 'quantity');

    const midPrice = (bid + ask) / 2;
    if (midPrice === 0) return 0; // Prevent divide/zero or nil spread computations mathematically if entirely zeroed

    return quantity * Math.abs(execPrice - midPrice);
}

/**
 * Calculates the percentage impact of trading fees in basis points.
 * 
 * @param fee - Nominal fee paid (must be normalized to USD or base quote equivalent if drag is exact, assuming normalized)
 * @param notional - Total notional value of trade
 * @returns Fee drag in basis points
 */
export function computeFeeDragBps(fee: number, notional: number): number {
    assertValidNumber(fee, 'fee');
    assertValidNumber(notional, 'notional');

    if (notional === 0) throw new Error("Division by zero: notional cannot be 0");

    return (fee / notional) * 10000;
}

/**
 * Translates raw arrival slippage (bps) into a 0-100 execution score.
 * Penalizes large deviations from arrival price.
 * 
 * - slippage < 5 bps → 100 
 * - slippage 5-15 bps → linear decay 100 - ((slippage - 5) × 6) 
 * - slippage > 15 bps → heavy decay max(0, 40 - (slippage - 15) × 2) 
 * 
 * @param slippageBps - Slippage in bps (Positive number indicating magnitude of slip)
 * @returns Score from 0 to 100
 */
export function scoreArrivalSlippage(slippageBps: number): number {
    assertValidNumber(slippageBps, 'slippageBps');

    if (slippageBps <= 0) return 100;
    const s = slippageBps;
    if (s < 5) return 100;
    if (s <= 15) return 100 - ((s - 5) * 6);
    return Math.max(0, 40 - ((s - 15) * 2));
}

/**
 * Generates an efficiency score based solely on whether the trade provided liquidity (Maker).
 * Takers pay higher fees, Makers pay lower/zero fees.
 * 
 * @param isMaker - Boolean indicating if the trade was a Maker order
 * @returns 100 if Maker, 0 if Taker
 */
export function scoreFeeEfficiency(isMaker: boolean): number {
    if (typeof isMaker !== 'boolean') throw new Error("Invalid input: isMaker must be a boolean");
    return isMaker ? 100 : 0;
}

/**
 * Evaluates execution timing against standard global market liquidity regimes (UTC).
 * High liquidity windows typically lead to better fills and less market impact.
 * 
 * @param executedAt - The absolute Date the trade executed
 * @returns An object containing the derived score and the designated liquidity window tag
 */
export function scoreTiming(executedAt: Date): { score: number; window: 'HIGH' | 'MEDIUM' | 'LOW' } {
    if (!(executedAt instanceof Date) || isNaN(executedAt.getTime())) {
        throw new Error("Invalid input: executedAt must be a valid Date object");
    }

    const hour = executedAt.getUTCHours();

    if (hour >= 7 && hour < 16) {
        return { score: 95, window: 'HIGH' };
    } else if (hour >= 16 && hour < 22) {
        return { score: 70, window: 'MEDIUM' };
    } else {
        return { score: 20, window: 'LOW' };
    }
}

/**
 * Scores the empirical execution spread condition.
 * Evaluates whether the user traded a highly liquid asset (tight spread) 
 * or illiquid alternative (wide spread drag).
 * 
 * @param spreadBps - Modelled spread in basis points
 * @returns Score from 0 to 100
 */
export function scoreExchange(spreadBps: number): number {
    assertValidNumber(spreadBps, 'spreadBps');

    if (spreadBps <= 1.5) {
        return 100;
    } else if (spreadBps > 1.5 && spreadBps <= 3.0) {
        return 75;
    } else {
        return 40;
    }
}

/**
 * Computes the final unified FillScore using configured weighted parameters.
 * 
 * @param slippageScore - Derived slippage score (35% weight)
 * @param feeScore - Derived fee efficiency score (25% weight)
 * @param timingScore - Derived execution timing score (25% weight)
 * @param exchangeScore - Derived exchange spread score (15% weight)
 * @returns Out-of-100 composite index
 */
export function computeFillScore(slippageScore: number, feeScore: number, timingScore: number, exchangeScore: number): number {
    assertValidNumber(slippageScore, 'slippageScore');
    assertValidNumber(feeScore, 'feeScore');
    assertValidNumber(timingScore, 'timingScore');
    assertValidNumber(exchangeScore, 'exchangeScore');

    const score = (slippageScore * WEIGHTS.slippage) +
        (feeScore * WEIGHTS.fee) +
        (timingScore * WEIGHTS.timing) +
        (exchangeScore * WEIGHTS.exchange);

    return clampScore(score);
}

/**
 * Maps the numeric out-of-100 composite FillScore to a human-readable Letter Grade.
 * 
 * @param score - Numeric calculated FillScore
 * @returns 'A' | 'B' | 'C' | 'D' | 'F'
 */
export function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    assertValidNumber(score, 'score');

    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

/**
 * The Master Engine Function.
 * Accepts a safely enriched trade, pushes all points through pure functions,
 * and compiles the total holistic TradeScores output required by the models.
 * 
 * @param trade - Fully Enriched Trade object 
 * @returns Fully mapped TradeScores object
 */
export function scoreTrade(trade: EnrichedTrade): TradeScores {
    if (!trade.arrivalPriceProxy) throw new Error("Cannot score trade: missing arrivalPriceProxy enrichment");
    if (trade.spreadBps == null) throw new Error("Cannot score trade: missing spreadBps enrichment");

    // 1. Calculate underlying raw metric (Slippage)
    const arrivalSlippageBps = computeArrivalSlippageBps(trade.executionPrice, trade.arrivalPriceProxy, trade.side);

    // 2. Drive functional scores
    const slippageScore = scoreArrivalSlippage(arrivalSlippageBps);
    const feeScore = scoreFeeEfficiency(trade.isMaker);
    const { score: timingScore } = scoreTiming(trade.executedAt);
    const exchangeScore = scoreExchange(trade.spreadBps);

    // 3. Composite math
    const fillScore = computeFillScore(slippageScore, feeScore, timingScore, exchangeScore);
    const fillGrade = gradeFromScore(fillScore);

    return {
        slippageScore,
        feeScore,
        timingScore,
        exchangeScore,
        fillScore,
        fillGrade
    };
}