"""M3 plan §2: expected cost of an order, as a past-tense benchmark ("similar orders in this market usually cost ...").

`impact.py`: the square-root impact model, fitted by least squares through the origin (numpy only).
`conformal.py`: split-conformal intervals (numpy only). Nothing here predicts a future trade: it describes what orders of
the same size, in the same market conditions, cost on the calibration days.
"""
