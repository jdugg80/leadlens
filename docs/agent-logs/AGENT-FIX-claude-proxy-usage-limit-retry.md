# AGENT-FIX: claude-proxy usage-limit retry gap

## Concern (single issue only)
`callClaudeWithFailover` in the `claude-proxy` Edge Function does not fall
through to the secondary API key when the primary key returns a 400 with a
"usage limit" error. This was confirmed live: primary key hit its usage cap,
returned 400, and the function failed fast without attempting the secondary
key, because 400 is not in `RETRYABLE_STATUSES`.

## File to modify
`claude-proxy/index.ts` (Supabase Edge Function, LeadLens project
`qkbvwryucaakkkqaqvka` — NOT Project Scarlett).

## Required change
Locate the existing `callClaudeWithFailover` function and replace it with
the version below. Only this function changes — `getApiKeys`,
`RETRYABLE_STATUSES`, the `serve()` handler, CORS headers, and imports all
stay exactly as they are.

```typescript
async function callClaudeWithFailover(payload: any) {
  const keys = await getApiKeys();
  let lastResponse: Response | null = null;

  for (let i = 0; i < keys.length; i++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${keys[i]}`,
        "x-api-key": keys[i],
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: payload.model || "claude-haiku-4-5-20251001",
        max_tokens: payload.max_tokens || 1500,
        system: payload.system,
        messages: payload.messages,
      }),
    });

    if (response.ok) {
      if (i > 0) console.log(`claude-proxy: succeeded on fallback key ${i}`);
      return response;
    }

    lastResponse = response;

    if (RETRYABLE_STATUSES.includes(response.status)) {
      continue;
    }

    if (response.status === 400) {
      const cloned = response.clone();
      const errBody = await cloned.json().catch(() => null);
      if (errBody?.error?.message?.toLowerCase().includes("usage limit")) {
        console.log(`claude-proxy: key ${i} hit usage limit, trying next`);
        continue;
      }
    }

    break;
  }

  return lastResponse!;
}
```

## Non-actions (explicit)
- Do NOT touch `getApiKeys`, `RETRYABLE_STATUSES`, the CORS headers, the
  `serve()` request handler, or the Vault/RPC logic.
- Do NOT add 401/403 to `RETRYABLE_STATUSES` — that was discussed but not
  decided on; leave it out of scope for this fix.
- Do NOT change the model default, max_tokens default, or any other
  request-building logic outside the retry/status-check block.
- Do NOT touch any other Edge Function or file in the project.

## Verification before applying
- Timestamped `.bak` of `claude-proxy/index.ts` before edit.
- Babel/TS syntax validation on the modified file.
- Confirm the replaced function is syntactically identical in signature
  (`async function callClaudeWithFailover(payload: any)`) so nothing else
  in the file needs to change.

## Post-fix manual step (not part of this briefing — flag to user)
After OpenCode applies this and it's reviewed, the user still needs to run
`supabase functions deploy claude-proxy` themselves from PowerShell — do
not attempt to deploy as part of this fix.
