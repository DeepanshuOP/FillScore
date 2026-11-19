"""env_report: scripts load env values themselves and print NAMES only, never values.

Hand-computed: ml file sets A and B, backend file sets B and C, nothing in the real environment.
Precedence (config/env_loader.py): ml wins for B, so B = "ml". Loaded names = {A, B, C} (3 names).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import env_report  # noqa: E402


def _files(tmp_path, ml: str, be: str):
    a, b = tmp_path / "ml.env", tmp_path / "be.env"
    a.write_text(ml)
    b.write_text(be)
    return str(a), str(b)


def test_loads_both_files_and_returns_names_only(tmp_path, capsys):
    ml, be = _files(tmp_path, "A=secret-a\nB=ml\n", "B=backend\nC=secret-c\n")
    env: dict[str, str] = {}
    names = env_report.load_and_report(["A", "C", "MISSING"], ml, be, environ=env)
    out = capsys.readouterr().out
    assert sorted(names["loaded"]) == ["A", "B", "C"]
    assert env["B"] == "ml"
    assert names["present"] == {"A": True, "C": True, "MISSING": False}
    assert "secret-a" not in out and "secret-c" not in out
    assert "A" in out and "MISSING" in out


def test_an_unquoted_ampersand_uri_is_read_whole_and_not_printed(tmp_path, capsys):
    # The 2026-11 leak: an unquoted URI split at "&" when a shell sourced the file. python-dotenv reads it whole.
    ml, be = _files(tmp_path, 'MONGODB_URI="mongodb://u:pw@h/db?retryWrites=true&w=majority"\n', "")
    env: dict[str, str] = {}
    env_report.load_and_report(["MONGODB_URI"], ml, be, environ=env)
    assert env["MONGODB_URI"].endswith("&w=majority")
    assert "pw" not in capsys.readouterr().out


def test_mongo_alias_is_mapped_by_name_only(tmp_path, capsys):
    ml, be = _files(tmp_path, "", "")
    env = {"MONGO_URI": "mongodb://x:y@h/db"}
    res = env_report.load_and_report(["MONGODB_URI"], ml, be, environ=env)
    assert env["MONGODB_URI"] == "mongodb://x:y@h/db"
    assert res["present"] == {"MONGODB_URI": True}
    out = capsys.readouterr().out
    assert "MONGO_URI" in out and "x:y" not in out


def test_empty_value_counts_as_absent(tmp_path):
    ml, be = _files(tmp_path, "A=\n", "")
    res = env_report.load_and_report(["A"], ml, be, environ={})
    assert res["present"] == {"A": False}
