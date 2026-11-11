"""Scoring v2 ("measured"): a versioned score beside the frozen v1 ("rule-based") score. Spec §6, M1 plan Part C.

v1 (backend/src/scoring/) is never changed. Every v2 result names its ScoringVersion file
(scoring_v2/versions/<id>.json) and carries an integrity hash that anyone can recompute.
"""
