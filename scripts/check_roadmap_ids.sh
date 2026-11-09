#!/usr/bin/env bash
# Asserts docs/ROADMAP.md carries every task ID from the pre-merge ROADMAP.md and every v5 feature ID.
# Read-only. Usage: bash scripts/check_roadmap_ids.sh [<git-ref-of-old-roadmap>]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
REF="${1:-$(git log --format=%H --diff-filter=M -1 -- ROADMAP.md)^}"
OLD_IDS='\b(T[1-6]\.[0-9]+|AC-[0-9]+|R5-[A-Z]+[0-9]+|R6-[A-Z]+[0-9]+(\.[0-9]+)?)\b'
V5_IDS='\b[A-H][0-9]+\b'
missing=0
check() { # $1 = id list, $2 = label
  while read -r id; do
    [ -z "$id" ] && continue
    if ! grep -qw -- "$id" docs/ROADMAP.md; then echo "MISSING ($2): $id"; missing=$((missing+1)); fi
  done <<< "$1"
}
check "$(git show "$REF:ROADMAP.md" | grep -oE "$OLD_IDS" | sort -u)" "old ROADMAP.md"
if [ -f .work/FillScore_Roadmap_v5.md ]; then
  check "$(grep -oE "$V5_IDS" .work/FillScore_Roadmap_v5.md | sort -u)" "v5"
fi
if [ "$missing" -eq 0 ]; then echo "OK: all roadmap IDs present"; else echo "FAIL: $missing missing"; exit 1; fi
