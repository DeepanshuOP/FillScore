#!/usr/bin/env bash
# FillScore PreToolUse guard (bash + jq port of guard.ps1, for the WSL/Linux checkout).
# Reads the hook payload as JSON on stdin. Exit 2 = block the tool call; stderr is shown to the
# agent as the reason. Exit 0 = allow.
#
# Encodes incidents that actually happened (unauthorized commits, a leaked .env, a destructive
# reseed of the locked demo data) so they cannot recur through instruction drift.

raw="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0                       # never block on a missing jq
tool="$(printf '%s' "$raw" | jq -r '.tool_name // ""' 2>/dev/null)" || exit 0   # parse failure: allow
cmd="$(printf '%s' "$raw"  | jq -r '.tool_input.command // ""' 2>/dev/null)"
path="$(printf '%s' "$raw" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // ""' 2>/dev/null)"

deny() {
  printf 'BLOCKED by FillScore guard: %s\n' "$1" >&2
  exit 2
}

# Regexes live in variables: bash [[ =~ ]] mis-parses many metacharacters when written inline.
SEP='(^|[[:space:];|&(`])'                                     # start of a command word
RE_ENV_PATH='(^|[\/])\.env($|\.)'
RE_ENV_READ="${SEP}(cat|tac|less|more|head|tail|bat|batcat|nl|od|xxd|hexdump|strings|grep|egrep|fgrep|rg|sed|awk|cut|sort|uniq|diff|cp|mv|source|\.|type|Get-Content|gc|Select-String|sls|base64|tee|vi|vim|nano|code)[[:space:]][^|;&]*\.env"
RE_ENV_REDIRECT='<[[:space:]]*[^[:space:]|;&]*\.env'
RE_ENV_SCRIPTED='(open\(|readFile|read_text|fs\.|Path\().{0,40}\.env'
RE_GIT_COMMIT_PUSH='(^|[[:space:];|&(`/])git([[:space:]]+[^;|&]*)?[[:space:]](commit|push)([[:space:];|&]|$)'
RE_GIT_ADD_BLANKET='(^|[[:space:];|&(`/])git[[:space:]]+(add|stage)([[:space:]]+[^;|&]*)?[[:space:]](\.|\./|[^[:space:];|&]*/\.|\*|:/|-A|--all|-u|--update)([[:space:];|&]|$)'
RE_GIT_ADD_GLOB='(^|[[:space:];|&(`/])git[[:space:]]+(add|stage)[[:space:]][^;|&]*[*?]'
RE_SEED='npm([[:space:]]+[^;|&]*)?[[:space:]](run|run-script)[[:space:]]+seed'
RE_DESTRUCTIVE='(seedDatabase|seedAudit|seedDemo|generateSyntheticTrades|purgeStale|fixUserIndex|fixConnectionIndex|backfillAccountId|backfillDataSource|freezeDemoAudits|dropDatabase|deleteMany\(\{\}\))'
RE_WHALE_SCRIPT='(^|[[:space:]/\.])(enrich|regen_fills)(\.py)?([[:space:];|&]|$)'
RE_PYTHON_RUN="${SEP}([^[:space:];|&]*python[0-9.]*|uv[[:space:]]+run)[[:space:]]"
RE_APPLY='--apply([[:space:]]|$)'
RE_SLEEP_LOW='(sleep|--sleep)[[:space:]]*=?[[:space:]]*([0-9]|[1-5][0-9]|6[0-4])([^0-9]|$)'

# --- 1. Never read or print secrets --------------------------------------------------------------
[[ "$path" =~ $RE_ENV_PATH ]] && deny ".env is off limits. Confirm environment variables by key name or a non-empty check instead."
[[ "$cmd" =~ $RE_ENV_READ ]] && deny "This would read or print .env contents. Check env vars by key name or non-empty check only."
[[ "$cmd" =~ $RE_ENV_SCRIPTED ]] && deny "Reading .env from a script one-liner is still a read of secrets."
[[ "$cmd" =~ $RE_ENV_REDIRECT ]] && deny "Redirecting .env into a command is a read of secrets."

# --- 2. No commits or pushes; Deepanshu commits after review -------------------------------------
[[ "$cmd" =~ $RE_GIT_COMMIT_PUSH ]] && deny "git commit / git push are reserved for Deepanshu after review."
[[ "$cmd" =~ $RE_GIT_ADD_BLANKET ]] && deny "Blanket staging is forbidden. Stage an explicit file list."
[[ "$cmd" =~ $RE_GIT_ADD_GLOB ]] && deny "Glob staging is forbidden. Stage an explicit file list."

# --- 3. Never run destructive data scripts --------------------------------------------------------
[[ "$cmd" =~ $RE_SEED || "$cmd" =~ $RE_DESTRUCTIVE ]] && deny "Destructive against the locked demo dataset. This needs explicit written permission and a backup first."
[[ "$cmd" =~ $RE_WHALE_SCRIPT && "$cmd" =~ $RE_PYTHON_RUN ]] && deny "whale enrich.py / regen_fills.py write to MongoDB Atlas. Not without explicit written permission."
[[ "$cmd" =~ $RE_APPLY ]] && deny "Migration --apply is gated on review. Run the dry run, show the output, and wait."

# --- 4. Guard the eval timing constant ------------------------------------------------------------
[[ "$cmd" =~ run_consistency_eval && "$cmd" =~ $RE_SLEEP_LOW ]] && deny "Inter-run sleep below 65s causes 429 contamination. Keep it at 65."

exit 0
