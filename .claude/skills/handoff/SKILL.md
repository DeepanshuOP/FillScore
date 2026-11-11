---
name: handoff
description: Updates docs/PROGRESS.md and docs/HANDOFF.md so a fresh session can continue the current work without re-reading history. Use before /clear, before compacting a long session, when a usage limit is near, or when asked to hand off.
---

The resume files are tracked in the repo, so they survive across sessions and machines.

1. Update `docs/PROGRESS.md`:
   - the current milestone and step, and the next concrete action as numbered steps;
   - what is done, with commit hashes;
   - "Waiting for Deepanshu": each item with its exact command or steps, and what it unblocks;
   - decisions taken since the last report, one line each with the reason;
   - known problems;
   - uncommitted files (`git status --short`) and the latest test summary line per suite.
2. Update the "Now" and "Next" sections of `docs/HANDOFF.md` only if the state they describe changed. Keep it under about 60 lines.

Then reply with one line: "Start a new session with: read docs/agent/MASTER_BRIEF.md, then continue from docs/PROGRESS.md".
