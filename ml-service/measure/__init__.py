"""Measurement layer v2: market data -> benchmarks -> metrics. No scoring and no I/O in the metric functions.

Layers (each imports only the ones before it):
  data/         public aggTrades loaders, cache, price step
  benchmarks.py quote proxies, mid, interval VWAP/TWAP
  metrics.py    pure metric functions, registered in registry.REGISTRY
"""
