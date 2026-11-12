# Market fixtures: provenance

Real public data from data.binance.vision (Binance spot daily aggTrades). Each fixture is a verbatim
2-minute slice (14:00:00–14:02:00 UTC) of one daily file. Built by `ml-service/scripts/build_market_fixtures.py`,
which verifies each zip against its published `.CHECKSUM` first. Columns (no header): aggregate trade id,
price, quantity, first trade id, last trade id, timestamp, is-buyer-maker, best-match.

| Fixture | Source zip | Zip SHA-256 | Rows in zip | Slice | Timestamp unit | Rows in slice | First row | Last row |
|---|---|---|---|---|---|---|---|---|
| `BTCUSDT-aggTrades-2024-01-15_1400-1402.csv.gz` | https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2024-01-15.zip | `4b4ee84e3dec847499fd4bd9d3ea34aa5fff6ff9db825da4c8507b1107718a2b` | 1,364,603 | 1705327200000–1705327320000 ms (end exclusive) | ms | 2,100 | `2830845776,42852.55000000,0.00245000,3374054546,3374054546,1705327200001,False,True` | `2830847875,42824.72000000,0.00253000,3374057167,3374057167,1705327319998,False,True` |
| `BNBUSDT-aggTrades-2024-01-15_1400-1402.csv.gz` | https://data.binance.vision/data/spot/daily/aggTrades/BNBUSDT/BNBUSDT-aggTrades-2024-01-15.zip | `dde821f1a59567413acbe5188bfc4d319322a81e8875dedea67420d098a1c348` | 269,432 | 1705327200000–1705327320000 ms (end exclusive) | ms | 691 | `518231179,318.80000000,0.15700000,702966416,702966416,1705327200213,True,True` | `518231869,318.40000000,1.21500000,702967343,702967343,1705327319635,True,True` |
| `BTCUSDT-aggTrades-2025-03-04_1400-1402.csv.gz` | https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2025-03-04.zip | `65f296c975b16118774c230e4485e82d7ba5718886d513aab1b23953ad2ae279` | 4,091,509 | 1741096800000–1741096920000 ms (end exclusive) | us | 7,407 | `3468694434,82804.00000000,0.00041000,4650928009,4650928011,1741096800014630,False,True` | `3468701840,82887.14000000,0.00013000,4650946241,4650946241,1741096919990096,True,True` |

## Bybit (M2)

Real public data from public.bybit.com (Bybit spot daily trades). Bybit publishes **no checksum**, so the hash below
is our own SHA-256 of the downloaded file (2026-11-12); provenance is weaker than for the Binance files. The slice
keeps the header row `id,timestamp,price,volume,side` and the rows with 1705327200000 <= timestamp < 1705327320000
(14:00:00-14:02:00 UTC), cut with `awk` and recompressed with `gzip -n -9`. One row is one trade (not an aggregate).

| Fixture | Source file | File SHA-256 (ours) | Rows in file | Timestamp unit | Rows in slice | First row | Last row | Fixture SHA-256 |
|---|---|---|---|---|---|---|---|---|
| `bybit-BTCUSDT-2024-01-15_1400-1402.csv.gz` | https://public.bybit.com/spot/BTCUSDT/BTCUSDT_2024-01-15.csv.gz | `ad4c8b873f3c1823bbac3d9311a9c2fec5eaa7f50fce87cc3b8d0314825140ee` | 250,936 (136,070 buy, 114,866 sell) | ms | 329 | `118107,1705327200336,42851.44,0.189509,sell` | `118435,1705327319491,42827.11,0.000234,sell` | `0c670c81d1f1bee3f6d4f79ac26185f6618a4c46a230cdf3ada25bfd42a0ff1e` |
