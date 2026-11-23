"""The fixed question set of the Ask comparison (seventh order, B3, 2026-11-23): 12 questions over demo-moderate.

Written and committed BEFORE any live call of Part B, so the set cannot be chosen to flatter a path. The first four are the Home chips
(`scripts/record_ask_fixture.py` QUESTIONS, the questions of the recorded answers); the other eight were written for this comparison.
Every question is about the account's past measured executions, so each needs at least one of the four Ask tools (score, costs, costliest,
cost_vs_expected). No question asks for advice or a prediction: a refused question would test the planner, not the answerer.
"""
from __future__ import annotations

HOME_QUESTIONS = [
    "Which orders cost the most?",
    "What did my orders cost in total?",
    "How did my market orders compare with the modelled cost?",
    "What score did my execution get?",
]

NEW_QUESTIONS = [
    "What was the range of my score?",
    "How much did I pay in fees in total?",
    "What was my median execution cost per order?",
    "What did my five costliest orders cost?",
    "Give me an overview of how well my orders were executed.",
    "Did my market orders cost more than the model said they would?",
    "How many orders were measured and what did they cost in total?",
    "Which single order cost the most, and how much was it?",
]

QUESTIONS = HOME_QUESTIONS + NEW_QUESTIONS
assert len(QUESTIONS) == 12 and len(set(QUESTIONS)) == 12
