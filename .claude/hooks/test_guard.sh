#!/usr/bin/env bash
# Table test for .claude/hooks/guard.sh. Each row: expected (allow|deny) and a Bash command.
# Run: bash .claude/hooks/test_guard.sh   (exit 1 on any mismatch)
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$here/guard.sh"
repo="$(cd "$here/../.." && pwd)"
pass=0; fail=0

check() { # expected, command
  local want="$1" cmd="$2" got
  printf '%s' "$(jq -n --arg c "$cmd" '{tool_name:"Bash",tool_input:{command:$c}}')" | bash "$guard" >/dev/null 2>&1
  if [[ $? -eq 2 ]]; then got=deny; else got=allow; fi
  if [[ "$got" == "$want" ]]; then pass=$((pass+1)); printf 'ok    %-5s %s\n' "$want" "${cmd//$'\n'/ ⏎ }"
  else fail=$((fail+1)); printf 'FAIL  want %-5s got %-5s %s\n' "$want" "$got" "${cmd//$'\n'/ ⏎ }"; fi
}

# --- must DENY: writing repo files by shell ---
check deny "cat >> ml-service/tests/test_claims.py <<'EOF'
def test_x(): pass
EOF"
check deny "sed -i 's/a/b/' render.yaml"
check deny "sed -i.bak 's/a/b/' render.yaml"
check deny "sed -ni 's/a/b/p' render.yaml"
check deny "sed --in-place 's/a/b/' render.yaml"
check deny "perl -pi -e 's/a/b/' backend/src/x.ts"
check deny "echo hi > backend/src/x.ts"
check deny "echo hi >> README.md"
check deny "echo hi >.work/notes.md"
check deny "printf x > $repo/frontend/a.ts"
check deny "cat > scripts/x.sh <<'EOF'
echo hi
EOF"
check deny "npm test > test-output.txt"
check deny "echo hi | tee backend/src/x.ts"
check deny "echo hi | tee -a README.md"
check deny "python3 -c \"open('a.py','w').write('x')\""
check deny "python -c \"from pathlib import Path; Path('a').write_text('x')\""
check deny "node -e \"require('fs').writeFileSync('a.js','x')\""
check deny "python3 - <<'PY'
open('a.txt', 'w').write('x')
PY"
check deny "echo hi &> out.log"
# --- must ALLOW: normal work ---
check allow "npm test > /tmp/out.txt"
check allow "npm test > /tmp/out.txt 2>&1"
check allow "npm run build 2>&1 | tail -20"
check allow "ls > /dev/null 2>&1"
check allow "echo hi >&2"
check allow "echo hi | tee /tmp/x.txt"
check allow "git diff > /tmp/d.patch"
check allow "git status --short"
check allow "git diff --stat"
check allow "cd backend && npm test"
check allow "cd frontend && npx tsc --noEmit"
check allow "grep -rn '=>' backend/src | head"
check allow "grep -n \"a > b\" frontend/app/page.tsx"
check allow "node -e \"console.log([1].map(x => x + 1))\""
check allow "python3 -c \"print(open('README.md').read()[:10])\""
check allow "sed -n '1,20p' README.md"
check allow "sed -e 's/a/b/' README.md"
check allow "echo hi > $HOME/elsewhere-outside-repo.txt"
check allow "cat <<'EOF' | jq .
{\"a\": 1} -> x > y
EOF"
# --- pre-existing rules still hold ---
check deny "git commit -m x"
check deny "git push"
check deny "git add -A"
check deny "cat backend/.env"
check deny "npm run seed"

# --- 4R-0: reading protected scripts / checking .env presence is allowed ---
check allow "cat backend/src/scripts/generateSyntheticTrades.ts"
check allow "grep -n prng backend/src/scripts/seedDatabase.ts"
check allow "wc -l ml-service/whale/enrich.py"
check allow "sed -n 1,80p ml-service/whale/regen_fills.py"
check allow "test -s ml-service/.env && echo set"
check allow ".venv/bin/python scripts/backfill_markouts.py --include-demo"
check allow ".venv/bin/python scripts/migrate_spread_estimates.py"
check allow ".venv/bin/python -m pytest tests/test_backfill_markouts.py"
check allow "git log --oneline -- backend/src/scripts/seedDatabase.ts"
# --- 4R-0: executing protected scripts, --apply, env dumps are blocked ---
check deny "npx ts-node backend/src/scripts/seedDatabase.ts"
check deny "node dist/scripts/generateSyntheticTrades.js"
check deny "python ml-service/whale/enrich.py"
check deny "python -m whale.regen_fills"
check deny ".venv/bin/python scripts/backfill_markouts.py --apply"
check deny ".venv/bin/python scripts/migrate_spread_estimates.py --apply"
check deny "cat ml-service/.env"
check deny "grep KEY .env"
check deny "source .env"
check deny "printenv"
check deny "env"
check deny "cat x && npm run seed"
check deny "grep a f; python ml-service/whale/enrich.py"
# --- 4R-0: bypass attempts hiding execution behind a read ---
check deny "cat x | xargs npx ts-node backend/src/scripts/seedDatabase.ts"
check deny "bash -c 'cat x; npm run seed'"
check deny "ls || node dist/scripts/purgeStaleAudits.js"
check deny "FOO=1 python ml-service/whale/regen_fills.py"
check deny "echo ok & python3 ml-service/whale/enrich.py"

# --- 4R-0b: nested execution behind a reader, abbreviations, quoting, indirection ---
check deny 'echo $(npx ts-node backend/src/scripts/seedDatabase.ts)'
check deny 'cat x `node dist/scripts/generateSyntheticTrades.js`'
check deny 'cat <(python ml-service/whale/enrich.py)'
check deny 'find . -exec python ml-service/whale/enrich.py \;'
check deny 'find . -execdir npm run seed \;'
check deny 'git rebase --exec "node dist/scripts/seedDatabase.js" HEAD~1'
check deny "git -c alias.x='!npm run seed' x"
check deny "awk 'BEGIN{system(\"npm run seed\")}'"
check deny 'x=seed; npm run $x'
check deny 'echo bnBtIHJ1biBzZWVk | base64 -d | sh'
check deny "python -c \"import runpy; runpy.run_path('scripts/backfill_markouts.py')\""
check deny '.venv/bin/python scripts/migrate_spread_estimates.py --ap'
check deny '.venv/bin/python scripts/backfill_markouts.py --app'
check deny '.venv/bin/python scripts/backfill_markouts.py --ap""ply'
check deny '.venv/bin/python scripts/backfill_markouts.py --apply=true'
check allow 'grep -n "a\|b" backend/src/scoring/engine.ts'
check allow 'printenv HOME'
check allow 'printenv NODE_ENV'
check deny 'printenv MONGODB_URI'
check deny 'printenv GROQ_API_KEY'
check deny 'node -e "require(\"./x\").main([\"--apply\"])"'
check allow 'bash .claude/hooks/test_guard.sh'
# --- 4R-0b review round: runtime args, quote/backslash obfuscation, |&, git -c hooks ---
check deny 'echo --apply | xargs python scripts/backfill_markouts.py'
check deny 'python scripts/migrate_spread_estimates.py $(echo --apply)'
check deny 'ARGS=--apply; python scripts/backfill_markouts.py $ARGS'
check deny 'python scripts/backfill_markouts.py --user-id x --ap\ply'
check deny 'npm run se""ed'
check deny '"npm" run seed'
check deny 'npm --prefix backend run se""ed'
check deny "git -c core.pager='npm run seed' log"
check deny 'echo x |& sh'
# --- 4R-0c B1: sed executes shell via the s///e flag or the e command ---
check deny "sed 's/a/b/e' f"
check deny "sed 's/a/b/ge' f"
check deny "sed 's|a|b|e' f"
check deny "sed -ne 's/a/b/e' f"
check deny "sed -e 's/a/b/' -e 'e id' f"
check deny "sed -e 'e cmd' f"
check deny "sed --expression='e id' f"
check deny "sed --expression 'e id' f"
check deny "sed -n '/x/e id' f"
check allow "sed -n 1,80p f"
check allow "sed 's/e/E/' f"
check allow "sed -n -e 1,5p f"
check allow "sed -e 's/x/y/g' f"
# --- 4R-0c B1 round 2: address forms, any s delimiter, -f/--file, wrappers, w/W file writes ---
check deny "sed '1e id' f"
check deny "sed '\$e id' f"
check deny "sed -n '1~2e id' f"
check deny "sed '2,+3e id' f"
check deny "sed 's+a+b+e' f"
check deny "sed 's_a_b_e' f"
check deny "sed 's.a.b.e' f"
check deny "sed 'sxaxbxe' f"
check deny "sed 's~a~b~e' f"
check deny "sed 's-a-b-e' f"
check deny "sed 's^a^b^e' f"
check deny "sed 's*a*b*e' f"
check deny "sed 's?a?b?e' f"
check deny "sed 's&a&b&e' f"
check deny "sed -s 1e f"
check deny "sed -f script.sed f"
check deny "sed --file=script.sed f"
check deny "echo x | command sed e"
check deny "env sed e"
check deny "nice sed e"
check deny "xargs sed e"
check deny "busybox sed e"
check deny "gsed e"
check deny "/usr/bin/sed e"
check deny "sed -n 'w backend/src/x.ts' f"
check deny "sed 's/a/b/w out' f"
check deny "sed -n 'W out' f"
check allow "sed 's/w/W/' f"
check allow "sed -n 1,80p backend/src/scoring/engine.ts"

echo "guard table: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
