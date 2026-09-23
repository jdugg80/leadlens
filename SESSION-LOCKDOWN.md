# Session Lockdown Routine

Run this as the LAST step of every work session in this repo. Not optional,
not "if remembered" — every build doc's final step should point here.

## Steps

1. Confirm repo state fresh (never assume):
   ```
   git status
   git branch --show-current
   git remote -v
   ```

2. Locate the tracking files:
   - `docs/full-project-timeline.html`
   - `docs/session-timeline.html`
   - `CHANGELOG.md`

   **If any of these are missing, CREATE them — do not skip the step.**
   A missing file is not a reason to skip; it means this is the first
   lockdown for this repo. Use the default templates below, and for the
   FIRST run only, backfill full-project-timeline.html and
   session-timeline.html using the repo's entire commit history
   (`git log --reverse`), not just today's session — see "First-run
   backfill" below.

3. Update `full-project-timeline.html` (create if missing):
   - If it exists, View it first and match its structure exactly
   - If missing, create with this structure: `.era-divider` / `.phase` /
     `.rail` / `.entry`, entry classes `win`/`bug`/`decision`/`security`
   - Add a new numbered `.phase` with real `.entry` items for this session
   - Update stats bar — total commits (`git rev-list --count HEAD`), weeks,
     hours (90-min session gap method, +10 min padding per session), clients live
   - Never trim existing phases — this file accumulates permanently

4. Update `session-timeline.html` (create if missing):
   - If it exists, match its existing CSS palette and structure
   - If missing, create with: same palette as full-project-timeline.html,
     a summary stats bar, a `timelineData` array, and a "Phase Narratives" section
   - Append this session's commits to the `timelineData` array
   - REPLACE the Phase Narratives section with ONE rich narrative for
     this session only (not accumulated)

## First-run backfill (only when files were just created for the first time)

If Step 2 found the files missing and you just created them in Steps 3–4,
don't stop at today's session — backfill the FULL project history so the
files aren't misleadingly thin:
```
git log --format="%H %ai" --reverse      # full timestamp list, oldest first
git log --oneline --reverse                # full commit list, oldest first
git rev-list --count HEAD                  # total commit count
```
Group the full reverse-chronological history into logical phases (by feature
area or natural activity gaps) and populate `full-project-timeline.html`
with real `.phase`/`.entry` blocks covering the ENTIRE project, not just
today. Populate `timelineData` in `session-timeline.html` with every day of
real activity from the full log. Derive total hours using the 90-min gap
method across the full history, not just today's session. Report the
session groupings and derived numbers back for spot-check before committing.

5. Update `CHANGELOG.md` with real per-session content — no placeholders

6. Verify before committing:
   ```
   git diff docs/full-project-timeline.html docs/session-timeline.html CHANGELOG.md
   ```
   Review the diff. Do not commit until confirmed correct.

7. Commit and push:
   ```
   git add docs/full-project-timeline.html docs/session-timeline.html CHANGELOG.md
   git commit -m "docs: session close — [brief real summary]"
   git push
   ```

## Rules

- Never guess numeric stats — derive everything from `git log`
- No placeholder content — real decisions/bugs/features only
- Confirm repo/remote/branch fresh every time, never carry over from memory
