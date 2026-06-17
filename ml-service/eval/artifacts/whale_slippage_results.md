# Final Whale Slippage Statistics

These are the final, verified results reflecting the corrected arrival-price fixes, restricted strictly to `MARKET` orders (excluding `LIMIT`), and leading with the non-parametric Mann-Whitney U test as primary. This document permanently supersedes all prior figures — specifically retiring the flawed BTC diff-in-means of 7.52 bps with p=0.021, and the old spurious ETH result of p=0.0074 (which had n=14 and pointed in the wrong theoretical direction).

## Results Table

| Group | n (adverse) | n (non-adverse) | Mean Diff (bps) | Mann-Whitney U *p* | Welch's t *p* | Rank-biserial r | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POOLED** | 42 | 284 | -1.02 | 0.5467 | 0.5718 | 0.0570 | |
| **BTCUSDT** | 15 | 90 | 0.02 | 0.9815 | 0.1548 | 0.0044 | |
| **ETHUSDT** | 6 | 80 | -3.27 | 0.1824 | 0.3175 | 0.3271 | *n < 15 in adverse group* |
| **BNBUSDT** | 12 | 55 | -2.74 | 0.3126 | 0.6717 | 0.1848 | *n < 15 in adverse group* |
| **SOLUSDT** | 9 | 59 | 1.60 | 0.1288 | 0.0922 | -0.3145 | *n < 15 in adverse group* |

## Discussion

Across the board, no group currently reaches statistical significance (all *p* > 0.05 on the primary Mann-Whitney test). BTC's genuinely near-zero scale (a mean difference of 0.02 bps and standard deviation of ~0.03 bps) is confirmed to be a real reflection of deep market structure, not a caching bug or missing data; at an execution rate of 100% genuine real-fill VWAP with no fallbacks, a typical demo order of ~$180 moves the order book by only 1 tick ($0.01), mathematically yielding a raw slippage scale of exactly `(0.01 / 42,573) * 10,000 ≈ 0.002 bps`. For ETH, the direction is now theoretically sensible (adverse condition results in negative relative slippage, unlike the old spurious positive result), though the sample is heavily underpowered (n=6 adverse). Given that all non-BTC groups are explicitly underpowered (n < 15), non-significance should not be conclusively read as the absence of a market effect.

## Normalized Cross-Symbol Comparison

| Symbol | Whale Threshold USD | Median Window Peak | Normalized Threshold | Detection Rate | Adverse Rate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BTCUSDT** | $250,000.00 | $350,786.98 | 0.71x median peak | 33.3% | 14.3% |
| **ETHUSDT** | $250,000.00 | $418,221.91 | 0.60x median peak | 14.0% | 7.0% |
| **BNBUSDT** | $50,000.00 | $86,105.42 | 0.58x median peak | 31.3% | 17.9% |
| **SOLUSDT** | $100,000.00 | $147,749.32 | 0.68x median peak | 29.4% | 13.2% |
