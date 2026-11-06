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

echo "guard table: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
