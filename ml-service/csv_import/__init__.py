"""M6 §1: read a broker's trade-history export and compare each fill with the public market price at the same second.

`kraken.py`: the Kraken Trades CSV (built from Kraken's official field definitions; LOG §S). `check.py`: the comparison, using the same
measurement function as the account measurement job (measure.enrich_fill). Nothing here stores anything or predicts anything.
"""
