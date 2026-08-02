# FillScore PreToolUse guard.
# Reads the hook payload as JSON on stdin. Exit 2 = block the tool call and tell the agent why.
# Exit 0 = allow. Anything printed to stderr on exit 2 is shown to the agent as the reason.
#
# This encodes three incidents that actually happened, so they cannot happen again by instruction
# drift: unauthorized commits, a leaked .env, and a destructive reseed of the locked demo data.

$ErrorActionPreference = 'Stop'

try {
    $raw     = [Console]::In.ReadToEnd()
    $payload = $raw | ConvertFrom-Json
} catch {
    exit 0   # never block on a parse failure
}

$toolName = $payload.tool_name
$cmd      = ''
$path     = ''

if ($payload.tool_input) {
    if ($payload.tool_input.command)    { $cmd  = [string]$payload.tool_input.command }
    if ($payload.tool_input.file_path)  { $path = [string]$payload.tool_input.file_path }
    if ($payload.tool_input.path)       { $path = [string]$payload.tool_input.path }
}

function Deny($reason) {
    [Console]::Error.WriteLine("BLOCKED by FillScore guard: $reason")
    exit 2
}

# --- 1. Never read or print secrets -------------------------------------------------------------
if ($path -match '(^|[\\/])\.env($|\.)') {
    Deny ".env is off limits. Confirm environment variables by key name or a non-empty check instead."
}
if ($cmd -match '(cat|type|Get-Content|gc|more|Select-String|sls)\s+[^\|;]*\.env') {
    Deny "This would print .env contents. Check env vars by key name or non-empty check only."
}

# --- 2. Never commit or push without explicit authorization -------------------------------------
if ($cmd -match '\bgit\s+(commit|push)\b') {
    Deny "Commits and pushes require explicit per-task authorization from Deepanshu. Stage nothing, print the diff, and ask."
}
if ($cmd -match '\bgit\s+add\s+(\.|\*|:/|-A|--all|-u)(\s|$)') {
    Deny "Blanket staging is forbidden. Stage an explicit file list."
}

# --- 3. Never run destructive data scripts ------------------------------------------------------
if ($cmd -match '(npm\s+run\s+seed|seedDemo|generateSyntheticTrades|purgeStale|dropDatabase|deleteMany\(\{\}\))') {
    Deny "Destructive against the locked demo dataset. This needs explicit written permission and a backup first."
}
if ($cmd -match '--apply\b') {
    Deny "Migration --apply is gated on review. Run the dry run, show the output, and wait."
}

# --- 4. Guard the eval timing constant ----------------------------------------------------------
if ($cmd -match 'run_consistency_eval' -and $cmd -match '(sleep|--sleep)\s*=?\s*([0-9]|[1-5][0-9])\b') {
    Deny "Inter-run sleep below 65s causes 429 contamination. Keep it at 65."
}

exit 0
