# Agent Briefing: LeadLens Full Audit & Integrity Sweep

## Role
You are performing a **read-only audit**. Do not modify, fix, refactor, or delete
anything in this pass. The only file you create is the report itself. If you
notice something that looks "easy to fix," do NOT fix it — just log it in the
report with enough detail that it can be fixed in a follow-up task.

## Goal
Produce a single comprehensive markdown report at:
`C:\Projects\03-BusinessApps\leadlens\AUDIT-REPORT-{YYYY-MM-DD}.md`

Use today's actual date for `{YYYY-MM-DD}`.

---

## Scope

### 1. Repo & File Structure Inventory
- Full directory tree (exclude `node_modules`, `.git`, build artifacts).
- Flag orphaned/dead files: components not imported anywhere, screens not
  referenced in navigation, duplicate-named files (e.g. `*-BETA42.js` copies
  left alongside the active version), `.bak`/`.old`/`.tmp` files.
- Flag any file referencing the trademarked term "IntelliVision" — must not
  appear anywhere in code, comments, or strings.
- Confirm no `Modal` components exist anywhere in the app (known Android
  camera conflict). Search for `import.*Modal` and `<Modal`.
- Confirm no direct `AsyncStorage` or `MMKV` calls bypass `storageBridge`
  outside of `storageBridge.js` itself. List every offending file/line.

### 2. Dependency Audit
- Run `npm outdated` and `npm audit` (or yarn equivalents — check which
  lockfile is present) in both root and `web/`.
- List all dependencies with known high/critical vulnerabilities.
- Flag any dependency in `package.json` that doesn't appear to be imported
  anywhere in source (candidate for removal).
- Confirm Expo SDK version, React Native version, and check for mismatches
  against `app.json` / `eas.json` expectations.
- Check `package.json`, `package-lock.json`, and `app.json` are consistent
  with each other (no drift between declared and locked versions).

### 3. Security & Config Review
- Search entire repo (tracked files only) for hardcoded secrets: API keys,
  Supabase service role keys, Claude API keys, Resend keys. Pattern-match on
  common key prefixes (`sk-`, `eyJ`, `re_`, etc.) and flag any matches with
  file + line number, but do NOT print the actual secret value in the report
  — redact to first/last 4 characters only.
- Confirm `.env`, `.env.local`, and any credentials files are present in
  `.gitignore` and are NOT tracked by git (`git ls-files | grep env`).
- Review Supabase RLS policies referenced or scripted anywhere in the repo
  (migrations, SQL files, setup scripts) — flag any table where RLS appears
  disabled or policy is missing, and flag the known "allow all" pattern
  (`using (true) with check (true)`) as a security note (intentional
  workaround per project history, but worth restating explicitly in report).
- Confirm Project Scarlett (`dlntgyhfxxbcwwcxaorn`) credentials/references
  are fully isolated from LeadLens (`qkbvwryucaakkkqaqvka`) — flag any file
  that references both projects' connection strings/keys together.
- Check Google Maps/Places API key usage in source — confirm it's not
  hardcoded client-side without restriction notes (full restriction is a
  known pending task, just confirm current exposure level).
- List all Edge Functions and confirm none reference deprecated model
  strings (e.g. `claude-3-haiku-20240307`).

### 4. Database / Schema Sanity Check
- If Supabase CLI/migrations are present locally, list all tables, and flag:
  - Tables referenced in code that don't appear in migrations (or vice versa).
  - Confirm `feature_requests.update_type` column status (may already be
    added — just report current state, do not add it).
  - JSON columns (`affected_screens`, `dependencies`, `task_breakdown`) —
    confirm all code paths that `.map()` over them guard with
    `typeof x === 'string' ? JSON.parse(x) : x`. List any that don't.

### 5. Known-Issue Regression Check
For each known issue below, search the current codebase and report current
status (fixed / still present / partially present), with file references:
- `getCurrentCoords()` GPS calls not raced against a timeout.
- `MapView` receiving both `initialRegion` and `region` props simultaneously.
- `Circle` components (react-native-maps) with an `onPress` handler attached.
- `launchCameraAsync` usage anywhere a `Modal` is also mounted in the same
  screen tree.
- `ImagePicker.requestCameraPermissionsAsync()` — confirm it's still called
  and still a known hang risk (no fix expected, just confirm presence).
- All new permission requests route through `permissionManager.js`.

### 6. Build & Release Pipeline Integrity
- Confirm `ota-release.ps1` native-file guard logic is intact (hard stop on
  `app.json`/`package.json`/`package-lock.json` changes).
- Confirm `eas.json` build profiles match what's documented/expected
  (Android-primary, bare workflow).
- Check for the known EAS JSON parsing fix — confirm whether it's present in
  the codebase and whether it's been deployed (check recent OTA branch /
  build history if accessible).
- Confirm git status is clean or list uncommitted changes (since EAS builds
  from git, not local disk — uncommitted work here is a real risk to flag
  prominently).

### 7. Web Admin Portal (`web/`)
- Confirm Vercel Root Directory config file/setting reference matches `web/`.
- Confirm no stale references to the old misconfigured build path remain.
- Run the same secret-scan and outdated-dependency checks against `web/`
  independently.

### 8. Code Quality Pass (lightweight, non-blocking)
- Flag console.log/debugger statements left in production code paths.
- Flag obviously duplicated logic across screens (copy-pasted blocks >20
  lines appearing in 2+ files).
- Flag any TODO/FIXME/HACK comments — list them grouped by file.

---

## Report Format

Structure `AUDIT-REPORT-{date}.md` with these sections, in this order:

```markdown
# LeadLens Audit Report — {date}

## Executive Summary
(5-10 bullets max: the most important findings, ranked by severity/risk.
This is the part Joe reads first — be blunt and specific.)

## 1. File Structure & Dead Code
## 2. Dependencies
## 3. Security & Config
## 4. Database / Schema
## 5. Known-Issue Regression Status
## 6. Build & Release Pipeline
## 7. Web Admin Portal
## 8. Code Quality Notes

## Full Findings Table
| Severity | Area | File(s) | Description | Recommended Action |
|----------|------|---------|--------------|---------------------|
(Critical / High / Medium / Low / Info)

## Appendix: Commands Run
(list every command executed during the audit, for reproducibility)
```

Severity guide:
- **Critical**: secret exposure, RLS hole exposing user data, uncommitted
  code that would silently break next EAS build.
- **High**: known regression reintroduced, dependency with critical CVE.
- **Medium**: dead code, drift between docs/config and reality.
- **Low**: console.logs, minor duplication.
- **Info**: confirmations that something is fine (briefly note these too —
  Joe should know what was checked even when it passed).

---

## Constraints
- Read-only. No file edits, no `npm install`/`npm audit fix`, no git commits.
- If a check requires a command that would alter state (e.g. `npm audit fix`,
  `expo install --check` with auto-fix), run only the dry/report-mode
  equivalent.
- If something can't be checked (e.g. no access to live Supabase dashboard
  for RLS — only local SQL/migration files), say so explicitly in that
  section rather than skipping it silently.
- Do not print full secret values anywhere, even redacted-looking ones that
  are still mostly intact. Redact to first 4 + last 4 characters max.

## After Completion
- Do NOT run `ota-release.ps1` or any git commands beyond `git status` /
  `git ls-files` / `git log` (read-only).
- Output the full path to the generated report file as your final message.
