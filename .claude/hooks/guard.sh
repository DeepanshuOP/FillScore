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
RE_GIT_ADD_BLANKET='(^|[[:space:];|&(`/])git[[:space:]]+(add|stage)([[:space:]]+[^;|&]*)?[[:space:]](\.|\./|[^[:space:];|&]*/\.|\*|:/|-A|--all|-u|--update)([[:space:];|&]|$)'
RE_GIT_ADD_GLOB='(^|[[:space:];|&(`/])git[[:space:]]+(add|stage)[[:space:]][^;|&]*[*?]'
RE_SEED='npm([[:space:]]+[^;|&]*)?[[:space:]](run|run-script)[[:space:]]+seed'
RE_DESTRUCTIVE='(seedDatabase|seedAudit|seedDemo|generateSyntheticTrades|purgeStale|fixUserIndex|fixConnectionIndex|backfillAccountId|backfillDataSource|freezeDemoAudits|dropDatabase|deleteMany\(\{\}\))'
RE_WHALE_SCRIPT='(^|[[:space:]/\.])(enrich|regen_fills)(\.py)?([[:space:];|&]|$)'
RE_PYTHON_RUN="${SEP}([^[:space:];|&]*python[0-9.]*|uv[[:space:]]+run)[[:space:]]"
RE_APPLY='--apply([[:space:]]|$)'
RE_SLEEP_LOW='(sleep|--sleep)[[:space:]]*=?[[:space:]]*([0-9]|[1-5][0-9]|6[0-4])([^0-9]|$)'

# Heredoc bodies that are only *written to a file* are data, not a read, so they are stripped before
# the .env read checks. Deliberately narrow (Phase 1d.1 + review):
#   - backslash-newline continuations are joined first (a continued line is one command);
#   - a body is stripped only if its header line is EXACTLY `cat >[>] PATH <<D`, `cat <<D >[>] PATH`
#     or `tee [-a] PATH [>/dev/null] <<D` (PATH a plain path, not /dev or /proc; nothing else on the line);
#   - an unquoted-delimiter body containing `$(` or a backtick anywhere is kept (the shell expands it);
#   - if anything outside the stripped bodies could execute a file or text (bash, sh, source, ., ./,
#     python, node, chmod, exec, eval, xargs, ...), nothing is stripped at all.
# Everything else (headers, other heredocs, lines after the terminator) is checked exactly as before.
strip_written_heredocs() {
  awk '
    function strict(l,   P, D) {
      P = "[A-Za-z0-9_.~/-]+"; D = "(\047[A-Za-z_][A-Za-z0-9_]*\047|\"[A-Za-z_][A-Za-z0-9_]*\"|[A-Za-z_][A-Za-z0-9_]*)"
      t = l; gsub(/>[ \t]*\/dev\/null/, "", t); if (t ~ /\/dev\/|\/proc\//) return 0
      return (l ~ ("^[ \t]*cat[ \t]+>>?[ \t]*" P "[ \t]+<<-?[ \t]*" D "[ \t]*$")) ||
             (l ~ ("^[ \t]*cat[ \t]+<<-?[ \t]*" D "[ \t]+>>?[ \t]*" P "[ \t]*$")) ||
             (l ~ ("^[ \t]*tee[ \t]+(-a[ \t]+)?" P "([ \t]+>[ \t]*/dev/null)?[ \t]+<<-?[ \t]*" D "[ \t]*$"))
    }
    function flush(   k) { if (!drop || (!quoted && unsafe)) { for (k = 1; k <= nb; k++) print body[k] } nb = 0; unsafe = 0 }
    inbody {
      line = $0; if (dash) sub(/^\t+/, "", line)
      if (line == delim) { flush(); inbody = 0; print; next }
      body[++nb] = $0
      if ($0 ~ /\$\(/ || $0 ~ /`/) unsafe = 1
      next
    }
    {
      print
      if (match($0, /(^|[^<])<<-?[ \t]*["\047]?[A-Za-z_][A-Za-z0-9_]*["\047]?/)) {
        tok = substr($0, RSTART, RLENGTH); sub(/^[^<]/, "", tok)
        dash = (tok ~ /^<<-/); quoted = (tok ~ /["\047]/)
        sub(/^<<-?[ \t]*/, "", tok); gsub(/["\047]/, "", tok)
        delim = tok; inbody = 1; nb = 0; unsafe = 0
        drop = strict($0)
      }
    }
    END { if (inbody) flush() }
  ' <<<"$1"
}
NL=$'\n'
cmd_joined="${cmd//\\${NL}/}"
cmd_checked="$(strip_written_heredocs "$cmd_joined")"
RE_EXEC="(^|[[:space:];|&(\`])(bash|sh|zsh|ksh|dash|fish|csh|tcsh|source|\.|python[0-9.]*|py|node|nodejs|deno|bun|perl|ruby|php|lua|pwsh|powershell|exec|eval|xargs|chmod|env|nohup|timeout|watch|make|npx|uv)([[:space:];|&)]|$)|(^|[[:space:];|&(\`])\./|>\(|<\("
[[ "$cmd_checked" != "$cmd_joined" && "$cmd_checked" =~ $RE_EXEC ]] && cmd_checked="$cmd_joined"
RE_ENV_READ_LINE="${SEP}(cat|tac|less|more|head|tail|bat|batcat|nl|od|xxd|hexdump|strings|grep|egrep|fgrep|rg|sed|awk|cut|sort|uniq|diff|cp|mv|source|\.|type|Get-Content|gc|Select-String|sls|base64|tee|vi|vim|nano|code)[[:space:]][^|;&]*\.env"

# --- 1. Never read or print secrets --------------------------------------------------------------
[[ "$path" =~ $RE_ENV_PATH ]] && deny ".env is off limits. Confirm environment variables by key name or a non-empty check instead."
[[ "$cmd_checked" =~ $RE_ENV_READ_LINE ]] && deny "This would read or print .env contents. Check env vars by key name or non-empty check only."
[[ "$cmd_checked" =~ $RE_ENV_SCRIPTED ]] && deny "Reading .env from a script one-liner is still a read of secrets."
[[ "$cmd_checked" =~ $RE_ENV_REDIRECT ]] && deny "Redirecting .env into a command is a read of secrets."

# --- 2. Git: local commits are allowed; push, history rewrites and force operations are not --------
# Written permission (docs/agent/MASTER_BRIEF.md, 2026-11): `git add <explicit files>` and `git commit`
# are allowed so each milestone can be committed locally. Deepanshu still pushes himself, so everything
# that publishes, rewrites or deletes history stays blocked, and so does anything that would bypass the
# commit-msg hook or change the commit identity.
# GIT_PRE matches `git`, then any global options, up to the subcommand position. These whole-command
# checks also catch git behind a wrapper (bash -c, env, command, xargs). check_git below judges each
# plain git segment in detail, with quoted text (commit messages) removed first.
GIT_PRE='(^|[[:space:];|&(`/"'"'"'])git([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace|--exec-path)([[:space:]]+|=)[^[:space:]]+|[[:space:]]+-[^[:space:]]+)*[[:space:]]+'
GIT_END='([[:space:];|&)"'"'"']|$)'
MSG_GIT_PUSH="git push is reserved for Deepanshu. Commit locally and list the push in docs/PROGRESS.md."
MSG_GIT_HISTORY="This rewrites or deletes git history (or forces an operation). It needs Deepanshu's approval: record it in docs/PROGRESS.md."
[[ "$cmd_joined" =~ ${GIT_PRE}push${GIT_END} ]] && deny "$MSG_GIT_PUSH"
[[ "$cmd_joined" =~ ${GIT_PRE}(rebase|filter-branch|filter-repo|update-ref|replace)${GIT_END} ]] && deny "$MSG_GIT_HISTORY"
[[ "$cmd_joined" =~ ${GIT_PRE}reset([[:space:]]+[^\;\|\&]*)?[[:space:]]--(hard|soft|mixed|keep|merge)${GIT_END} ]] && deny "$MSG_GIT_HISTORY"
[[ "$cmd_joined" =~ ${GIT_PRE}commit([[:space:]]+[^\;\|\&]*)?[[:space:]]--amend${GIT_END} ]] && deny "$MSG_GIT_HISTORY"
[[ "$cmd_joined" =~ ${GIT_PRE}[a-z-]+([[:space:]]+[^\;\|\&]*)?[[:space:]]--no-verify${GIT_END} ]] && deny "--no-verify skips the commit-msg hook. Fix the message instead."
[[ "$cmd_joined" =~ GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL|DATE)= ]] && deny "Commits carry only Deepanshu's configured git identity."
[[ "$cmd" =~ $RE_GIT_ADD_BLANKET ]] && deny "Blanket staging is forbidden. Stage an explicit file list."
[[ "$cmd" =~ $RE_GIT_ADD_GLOB ]] && deny "Glob staging is forbidden. Stage an explicit file list."

# check_git SEGMENT: the detailed rules for one shell segment whose command word is git.
check_git() {
  local s w sub="" skip=0 seen=0 nargs=0 first_arg="" after_dd=0
  local -a args=()
  s="$(printf '%s' "$1" | sed -E "s/'[^']*'/ Q /g; s/\"([^\"\\\\]|\\\\.)*\"/ Q /g")"
  set -f
  for w in $s; do
    if (( ! seen )); then seen=1; continue; fi
    if [[ -z "$sub" ]]; then
      if (( skip )); then skip=0; continue; fi
      case "$w" in
        -C|-c|--git-dir|--work-tree|--namespace|--exec-path) skip=1 ;;
        -*) ;;
        *) sub="$w" ;;
      esac
      continue
    fi
    args+=("$w")
  done
  set +f
  for w in "${args[@]}"; do
    [[ "$w" == --force* ]] && deny "$MSG_GIT_HISTORY"
    [[ "$w" == --no-verify ]] && deny "--no-verify skips the commit-msg hook. Fix the message instead."
  done
  case "$sub" in
    push) deny "$MSG_GIT_PUSH" ;;
    rebase|filter-branch|filter-repo|update-ref|replace|gc|prune|clean) deny "$MSG_GIT_HISTORY" ;;
    reflog)
      for w in "${args[@]}"; do [[ "$w" =~ ^(expire|delete|drop)$ ]] && deny "$MSG_GIT_HISTORY"; done ;;
    stash)
      for w in "${args[@]}"; do [[ "$w" =~ ^(drop|clear)$ ]] && deny "git stash drop/clear deletes saved work. It needs Deepanshu's approval."; done ;;
    reset)
      # Only unstaging is allowed: `git reset`, `git reset [HEAD] [--] <files>`. Moving the branch is a history rewrite.
      for w in "${args[@]}"; do
        if [[ "$w" == -- ]]; then after_dd=1; break; fi
        [[ "$w" =~ ^--(hard|soft|mixed|keep|merge)$ ]] && deny "$MSG_GIT_HISTORY"
        [[ "$w" == -* ]] && continue
        nargs=$((nargs+1)); [[ $nargs -eq 1 ]] && first_arg="$w"
      done
      [[ $nargs -ge 1 && "$first_arg" != HEAD ]] && deny "git reset to another commit moves the branch (a history rewrite). To unstage, use: git restore --staged <file>." ;;
    commit)
      for w in "${args[@]}"; do
        [[ "$w" == --amend ]] && deny "$MSG_GIT_HISTORY"
        [[ "$w" == --all ]] && deny "git commit --all is blanket staging. Stage an explicit file list first."
        [[ "$w" == --author* ]] && deny "Commits carry only Deepanshu's configured git identity."
        [[ "$w" =~ ^-[a-zA-Z]*n[a-zA-Z]*$ ]] && deny "git commit -n skips the commit-msg hook. Fix the message instead."
        [[ "$w" =~ ^-[a-zA-Z]*a[a-zA-Z]*$ ]] && deny "git commit -a is blanket staging. Stage an explicit file list first."
      done ;;
    branch)
      for w in "${args[@]}"; do
        [[ "$w" == --delete || "$w" =~ ^-[a-zA-Z]*[dDfMC][a-zA-Z]*$ ]] && deny "$MSG_GIT_HISTORY"
      done ;;
    tag)
      for w in "${args[@]}"; do
        [[ "$w" == --delete || "$w" =~ ^-[a-zA-Z]*[df][a-zA-Z]*$ ]] && deny "$MSG_GIT_HISTORY"
      done ;;
    checkout|switch|worktree|fetch|pull|merge|rm|mv)
      for w in "${args[@]}"; do
        [[ "$w" == --discard-changes || "$w" =~ ^-[a-zA-Z]*[fBC][a-zA-Z]*$ ]] && deny "$MSG_GIT_HISTORY"
      done ;;
    add|stage)
      for w in "${args[@]}"; do
        [[ "$w" =~ ^-[a-zA-Z]*f[a-zA-Z]*$ ]] && deny "git add -f can stage ignored files such as .env."
        [[ "$w" =~ (^|/)\.env($|\.) && ! "$w" =~ \.env\.example$ ]] && deny ".env files are never staged."
      done ;;
    config)
      # Reading is allowed. Writing could repoint core.hooksPath, change the identity or add an alias.
      for w in "${args[@]}"; do
        [[ "$w" =~ ^(--unset|--unset-all|--add|--replace-all|--edit|-e|--remove-section|--rename-section|set|unset|edit|remove-section|rename-section)$ ]] && deny "git config writes can disable the commit-msg hook or change the commit identity."
        [[ "$w" == -* || "$w" =~ ^(get|list)$ ]] && continue
        nargs=$((nargs+1))
      done
      [[ $nargs -ge 2 ]] && deny "git config writes can disable the commit-msg hook or change the commit identity." ;;
  esac
  return 0
}

# --- 3. Never run destructive data scripts --------------------------------------------------------
# 4R-0: judge each shell segment (split on && || ; | & and newlines) on its own. A segment whose command word is a
# plain reader/searcher (cat, grep, sed, wc, ...) may MENTION a protected script (reading is allowed, spec D1); any
# other command (node, npx, ts-node, python, npm run, bash -c, xargs, ...) that mentions a protected script, or
# carries --apply, is an execution and is blocked. Bare `printenv` / `env` dump the environment and are blocked.
RE_P_SEED='(^|[^[:alnum:]_-])(npm|pnpm|yarn)([[:space:]]+[^;|&]*)?[[:space:]]+(run|run-script)[[:space:]]+seed([[:space:]"'"'"')]|$)'
RE_P_DESTRUCTIVE='(seedDatabase|seedAudit|seedDemo|generateSyntheticTrades|purgeStale|fixUserIndex|fixConnectionIndex|backfillAccountId|backfillDataSource|freezeDemoAudits|dropDatabase|deleteMany\(\{\}\))'
RE_P_WHALE='(^|[[:space:]/\.])(enrich|regen_fills)(\.py)?([[:space:]"'"'"';|&)]|$)'
RE_READER_CMD='^(cat|tac|less|more|head|tail|nl|grep|egrep|fgrep|rg|sed|awk|wc|ls|stat|file|diff|echo|printf|test|\[|find|sort|uniq|cut|tr|jq|git|cd|pwd|true|false|export|which|type)$'
RE_P_GUARDED='(backfill_markouts|migrate_spread_estimates|regen_fills|whale/enrich|runpy|run_path|main\(|--apply|seedDatabase|generateSyntheticTrades)'
# A reader segment is exempt only if nothing in it can execute something else.
RE_READER_DANGER='\$\(|`|<\(|>\(|-exec|-execdir|-ok|--exec|-c[[:space:]]+alias|system\('
# sed executes shell via the s///e flag (delimiter, optional flags, e, then end of script/space/quote) or via the
# `e` command (script or command start, or after ; { or an address like /x/ or 3, then e plus space or end).
RE_SED_EXEC_FLAG='[/|#,:@!%][gpiImM0-9]*e[gpiImM0-9]*(["'"'"'[:space:];}]|$)'
RE_SED_EXEC_CMD='([[:space:]"'"'"'=;{}]|/[gIM]*)e([[:space:]"'"'"';}]|$)'
RE_SECRET_NAME='KEY|SECRET|TOKEN|PASSWORD|URI|DSN'
# Quote-aware split on ; & | newline. A segment that follows a single pipe is prefixed with \001.
split_segments() {
  awk 'BEGIN { RS = "\001" } {
    n = length($0); q = ""; out = ""
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (q != "") {
        if (c == q) q = ""
        else if (c == "\\" && q == "\"") { out = out c substr($0, i + 1, 1); i++; continue }
        if (c == "\n") c = " "
        out = out c; continue
      }
      if (c == "\\") { out = out c substr($0, i + 1, 1); i++; continue }
      if (c == "\047" || c == "\"") { q = c; out = out c; continue }
      if (c == "|" && substr($0, i + 1, 1) == "&") { i++; out = out "\n\001"; continue }
      if (c == "|" && substr($0, i + 1, 1) != "|") { out = out "\n\001"; continue }
      if (c == "|" || c == ";" || c == "&" || c == "\n") { out = out "\n"; continue }
      out = out c
    }
    print out
  }' <<<"$1"
}
# Generic sed check. sed_command_args prints the text after the sed command word (skipping wrappers, options,
# VAR=val, numeric args and path prefixes; gsed counts as sed) and fails if the command word is not sed.
sed_command_args() {
  local t="$1" tok b
  while [[ -n "$t" ]]; do
    tok="${t%%[[:space:]]*}"; t="${t#"$tok"}"; t="${t#"${t%%[![:space:]]*}"}"
    tok="${tok//[\"\']/}"; b="${tok##*/}"
    case "$b" in
      env|command|nice|xargs|busybox|time|exec|nohup|-*|*=*|[0-9]*) continue ;;
      sed|gsed) printf '%s' "$t"; return 0 ;;
      *) return 1 ;;
    esac
  done
  return 1
}
# True (0) if the sed argument text could execute shell or write a file: -f/--file, an s command whose flags end
# in e or w (any delimiter, via backreference), or a bare e/w/W command after an optional address. Over-blocks on purpose.
RE_SED_FILE_OPT='[[:space:]](-[a-zA-Z]*f|--file)'
RE_SED_S_FLAG='(^|[[:space:]"'"'"';{}!/0-9$,+~])s(.).*\2[gpiImM0-9]*[ew]'
RE_SED_BARE_CMD='(^|[[:space:]"'"'"';{}!/0-9$,+~=])[ewW]([[:space:]"'"'"';}]|$)'
sed_unsafe() {
  local a=" $1"
  [[ "$a" =~ $RE_SED_FILE_OPT ]] && return 0
  [[ "$1" =~ $RE_SED_S_FLAG ]] && return 0
  [[ "$1" =~ $RE_SED_BARE_CMD ]] && return 0
  return 1
}
check_segments() {
  local text="$1" seg first base rest piped s3 a sed_args
  while IFS= read -r seg; do
    piped=0
    if [[ "$seg" == $'\001'* ]]; then piped=1; seg="${seg#$'\001'}"; fi
    seg="${seg#"${seg%%[![:space:]]*}"}"
    while [[ "$seg" =~ ^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+(.*)$ ]]; do seg="${BASH_REMATCH[1]}"; done
    seg="${seg#\(}"; seg="${seg#\{}"; seg="${seg#"${seg%%[![:space:]]*}"}"
    [[ -z "$seg" ]] && continue
    first="${seg%%[[:space:]]*}"; base="${first##*/}"; rest="${seg#"$first"}"; rest="${rest#"${rest%%[![:space:]]*}"}"
    if [[ "$base" == printenv ]]; then
      [[ -z "$rest" ]] && deny "bare printenv would print the environment, which can hold secrets. Name the variable, e.g. printenv HOME."
      for a in $rest; do
        a="${a//[\"\']/}"
        [[ "$a" =~ $RE_SECRET_NAME ]] && deny "printenv of a secret-looking variable ($a). Check env vars by key name or non-empty check only."
      done
      continue
    fi
    [[ "$base" == env && -z "$rest" ]] && deny "env would print the environment, which can hold secrets."
    [[ "$first" == \$* ]] && deny "A variable expansion in command position can hide a protected script. Spell the command out."
    if [[ $piped -eq 1 && "$base" =~ ^(sh|bash|zsh|dash|ksh|fish|csh)$ ]]; then
      deny "Piping into a shell executes text the guard cannot see."
    fi
    [[ "$base" == git ]] && check_git "$seg"
    [[ "$base" == git && "$seg" =~ [[:space:]]-c[[:space:]] ]] && deny "git -c can set hooks (core.pager, core.sshCommand, alias.*) that execute commands."
    if [[ "$base" == sed ]] && { [[ "$seg" =~ $RE_SED_EXEC_FLAG ]] || [[ "$seg" =~ $RE_SED_EXEC_CMD ]]; }; then
      deny "sed with the e flag or e command executes shell. Spell the work out with real commands."
    fi
    if sed_args="$(sed_command_args "$seg")"; then
      sed_unsafe "$sed_args" && deny "sed -f/--file, the e/w/W commands and the s///e and s///w flags execute shell or write files. Spell the work out with real commands and the Write/Edit tools."
    fi
    if [[ "$base" =~ $RE_READER_CMD && ! "$seg" =~ $RE_READER_DANGER ]]; then continue; fi
    if [[ "$seg" =~ (backfill_markouts|migrate_spread_estimates) && "$seg" =~ (\$|\`) ]]; then
      deny "Runtime-built arguments to a guarded script could carry --apply. Spell the arguments out."
    fi
    [[ "$base" == xargs && "$seg" =~ [[:space:]](python[0-9.]*|node|nodejs|npm|npx|uv)([[:space:]]|$) ]] && deny "xargs into an interpreter can run a guarded script with piped-in arguments."
    [[ "$seg" =~ (run|run-script)[[:space:]]+[\"\']?\$ ]] && deny "npm run with a variable script name can hide the seed script. Spell it out."
    local s2="${seg//[\"\'\\]/}"; s2="${s2//marketdata[.\/]enrich/}"       # ml-service/marketdata/enrich.py is a library module, not whale/enrich.py
    if [[ "$s2" =~ $RE_P_SEED || "$s2" =~ $RE_P_DESTRUCTIVE ]]; then
      deny "Destructive against the locked demo dataset: running this script needs explicit written permission and a backup first. (Reading it with cat/grep/sed/wc or the Read tool is allowed.)"
    fi
    [[ "$s2" =~ $RE_P_WHALE ]] && deny "whale enrich.py / regen_fills.py write to MongoDB Atlas: running them needs explicit written permission. (Reading them is allowed.)"
    s3="${seg//[\"\'\\]/}"
    [[ "$s3" =~ (^|[[:space:]])--apply([[:space:]=]|$) ]] && deny "Migration --apply is gated on review. Run the dry run, show the output, and wait."
    if [[ "$base" =~ ^(python[0-9.]*|py|uv)$ || "$s3" =~ \.py([[:space:]]|$) ]]; then
      [[ "$s3" =~ (^|[[:space:]])--a[a-z]*([[:space:]=]|$) ]] && deny "A --a* flag on a Python script may be an abbreviation of --apply (argparse accepts prefixes). Writes are gated on review."
    fi
    if [[ "$base" =~ ^(python[0-9.]*|py|node|nodejs)$ && "$seg" =~ [[:space:]](-[a-zA-Z]*[ce]|--eval)[[:space:]] && "$seg" =~ $RE_P_GUARDED ]]; then
      deny "An inline python/node one-liner that names a guarded script, runpy or main( could run an --apply path."
    fi
  done < <(split_segments "$text")
}
check_segments "$cmd_joined"

# --- 4. Guard the eval timing constant ------------------------------------------------------------
[[ "$cmd" =~ run_consistency_eval && "$cmd" =~ $RE_SLEEP_LOW ]] && deny "Inter-run sleep below 65s causes 429 contamination. Keep it at 65."

# --- 5. Repo files are written with the Write/Edit tools, never by shell (3a broke this twice) -----
# Allowed: redirection to /tmp, /dev/*, fd dups (2>&1) and absolute paths outside the repo.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)"
MSG_WRITE="Write files with the Write/Edit tools."

# Prints the first redirection target (>, >>, &>, >|) that points inside the repo. Quoted text and
# heredoc bodies are ignored, so '=>' in a node -e string or code in a heredoc is not a redirect.
repo_redirect_target() {
  awk -v root="$REPO_ROOT" '
    function allowed(t) {
      gsub(/^["\047]+|["\047]+$/, "", t)
      if (t == "") return 1
      if (t ~ /^\/tmp\// || t ~ /^\/dev\// || t ~ /^\$\{?TMPDIR/) return 1
      if (t ~ /^\//) return (index(t, root "/") != 1 && t != root)
      return 0
    }
    {
      if (inbody) { if ($0 == delim) inbody = 0; next }
      line = $0; out = ""; n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        if (q == "") {
          if (c == "\\") { out = out c substr(line, i + 1, 1); i++; continue }
          if (c == "\047" || c == "\"") q = c
          out = out c
        } else {
          if (c == q) { q = ""; out = out c }
          else if (c == ">" || c == "<" || c == "&" || c == "|" || c == ";") out = out "_"
          else out = out c
        }
      }
      s = out
      while (match(s, /[0-9&]?>>?\|?[ \t]*[^ \t;&|<>()]*/)) {
        tok = substr(s, RSTART, RLENGTH); pre = (RSTART > 1) ? substr(s, RSTART - 1, 1) : ""
        s = substr(s, RSTART + RLENGTH)
        if (pre == "-" || pre == "=") continue
        sub(/^[0-9&]?>>?\|?[ \t]*/, "", tok)
        if (!allowed(tok)) { print tok; exit }
      }
      if (match(out, /(^|[^<])<<-?[ \t]*["\047]?[A-Za-z_][A-Za-z0-9_]*["\047]?/)) {
        d = substr(out, RSTART, RLENGTH); sub(/^[^<]/, "", d); dash = (d ~ /^<<-/)
        sub(/^<<-?[ \t]*/, "", d); gsub(/["\047]/, "", d); delim = d; inbody = 1
      }
    }
  ' <<<"$1"
}

RE_SED_INPLACE="${SEP}sed[[:space:]]([^;|&]*[[:space:]])?(-[a-zA-Z]*i[^[:space:]]*|--in-place[^[:space:]]*)([[:space:]]|\$)"
RE_PERL_INPLACE="${SEP}perl[[:space:]]([^;|&]*[[:space:]])?-[a-zA-Z]*i[^[:space:]]*([[:space:]]|\$)"
RE_TEE="${SEP}tee[[:space:]]"
RE_SCRIPT_C="${SEP}([^[:space:];|&]*python[0-9.]*|node|nodejs)[[:space:]]+(-[a-zA-Z]*[ce]|--eval|-)([[:space:]]|\$)"
RE_SCRIPT_WRITE='(open\([^)]*,[[:space:]]*(mode[[:space:]]*=[[:space:]]*)?["'"'"'][wax+]|write_text|write_bytes|writeFile|appendFile|createWriteStream|fs\.write|openSync\([^)]*["'"'"'][wax])'

if [[ -n "$cmd" ]]; then
  [[ "$cmd_joined" =~ $RE_SED_INPLACE ]] && deny "sed -i edits a file by shell. $MSG_WRITE"
  [[ "$cmd_joined" =~ $RE_PERL_INPLACE ]] && deny "perl -i edits a file by shell. $MSG_WRITE"
  if [[ "$cmd_joined" =~ $RE_SCRIPT_C && "$cmd_joined" =~ $RE_SCRIPT_WRITE ]]; then
    deny "An inline python/node script that opens files for writing. $MSG_WRITE"
  fi
  if [[ "$cmd_joined" =~ $RE_TEE ]]; then
    tee_args="${cmd_joined#*tee }"; tee_args="${tee_args%%[;|&]*}"; tee_args="${tee_args%%<<*}"
    for a in $tee_args; do
      [[ "$a" == -* ]] && continue
      a="${a//[\"\']/}"
      case "$a" in /tmp/*|/dev/*|\$TMPDIR*|\$\{TMPDIR*) continue ;; /*) [[ "$a" == "$REPO_ROOT"/* ]] || continue ;; esac
      deny "tee into the repo. $MSG_WRITE"
    done
  fi
  bad="$(repo_redirect_target "$cmd_joined")"
  [[ -n "$bad" ]] && deny "Shell redirection into the repo ($bad). $MSG_WRITE"
fi

exit 0
