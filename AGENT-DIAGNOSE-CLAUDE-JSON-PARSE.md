# DIAGNOSIS: JSON Parse Error in HealthService + PropertyService

## Root Cause (confirmed)

Both `healthDepartmentService.js:96-97` and `propertyRecordsService.js:91-92` had **identical** parsing code:

```js
const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
return JSON.parse(raw);
```

This regex only strips markdown code fences (` ```json ` / ` ``` `). It does **not** strip leading bullet characters (`*`, `-`) or other markdown prefixes that Claude Haiku may prepend to its response. When Claude returns something like:

```
* {"riskScore":75, ...}
```

...the `*` character passes through to `JSON.parse()`, which throws `"Unexpected character: *"`. The error is caught silently — HealthService falls back to rules-based scoring, PropertyService returns nothing — so this has been broken without user-visible symptoms.

Neither system prompt explicitly instructed Claude to return raw JSON without markdown formatting.

## Fix Applied (3 layers, identical in both files)

### 1. Prompt-level fix (primary)
Added explicit instruction to both Claude Haiku system prompts:
> "Return ONLY valid JSON — no markdown, no code fences, no commentary, no bullet points before or after. Just the raw JSON object: ..."

This prevents the issue at the source.

### 2. Robust stripping (safety net)
Replaced the narrow regex with a multi-step strip:
```js
const clean = text
  .replace(/^```(?:json)?\s*/i, '')   // opening code fence
  .replace(/\s*```\s*$/i, '')         // closing code fence
  .replace(/^[\s]*[-*]\s*/gm, '')     // leading bullets on any line
  .trim();
```

### 3. Nested try/catch (graceful degradation)
Wrapped `JSON.parse(clean)` in its own try/catch that logs the raw response (first 200 chars) and re-throws with a descriptive message. The outer catch already handles this gracefully by falling back to rules/no-estimate.

## Files Changed
- `src/utils/healthDepartmentService.js` — lines 84-85 (prompt), lines 96-105 (parse)
- `src/utils/propertyRecordsService.js` — line 84 (prompt), lines 90-100 (parse)
