---
name: handoff
description: Writes .work/HANDOFF.md so a fresh session can continue the current work without re-reading history. Use before /clear, before compacting a long session, when a usage limit is near, or when asked to hand off.
---

Write `.work/HANDOFF.md` (overwrite it) with at most 60 lines:
1. Current brief and checklist file paths, and the status of each item
2. Decisions made this session, and why (one line each)
3. Files changed so far (git status --short)
4. The latest test summary line per tier
5. Exactly what to do next, as numbered steps
6. Open questions and blockers

Then reply with one line: the path, and "Start a new session with: continue from .work/HANDOFF.md".
