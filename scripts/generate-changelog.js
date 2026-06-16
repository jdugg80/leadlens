// generate-changelog.js
// Location: C:\Projects\03-BusinessApps\leadlens\scripts\generate-changelog.js
//
// Called by ota-release.ps1 and rebuild.ps1
// Usage: node scripts/generate-changelog.js <beta> <version> <mode>
// Example: node scripts/generate-changelog.js BETA-51 2.0.51 ota
//
// Reads git diff, sends to Claude API, writes formatted entry to CHANGELOG.md
// Fetches Claude API key from Supabase app_config at runtime

const https        = require('https')
const { execSync } = require('child_process')
const fs           = require('fs')
const path         = require('path')

const SUPABASE_URL  = process.env.LEADLENS_SUPABASE_URL  || 'https://qkbvwryucaakkkqaqvka.supabase.co'
const SERVICE_KEY   = process.env.LEADLENS_SERVICE_ROLE_KEY
const CHANGELOG     = path.join(__dirname, '..', 'CHANGELOG.md')

const [,, BETA_VERSION, VERSION_STRING, MODE] = process.argv

if (!BETA_VERSION || !VERSION_STRING || !MODE) {
  console.error('[changelog] Usage: node generate-changelog.js <beta> <version> <mode>')
  process.exit(1)
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, body: d }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path)
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve(JSON.parse(d)) }
        catch { resolve(d) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ─── Fetch Claude API key from Supabase ───────────────────────────────────────

async function getClaudeApiKey() {
  if (process.env.CLAUDE_API_KEY) return process.env.CLAUDE_API_KEY
  if (!SERVICE_KEY) throw new Error('LEADLENS_SERVICE_ROLE_KEY not set and CLAUDE_API_KEY not set')
  const rows = await supabaseGet('/rest/v1/app_config?select=claude_api_key&limit=1')
  if (!Array.isArray(rows) || !rows[0]?.claude_api_key) throw new Error('claude_api_key not found in app_config')
  return rows[0].claude_api_key
}

// ─── Get git diff ─────────────────────────────────────────────────────────────

function getGitDiff() {
  try {
    // Staged diff (before commit)
    let diff = execSync('git diff --staged', { encoding: 'utf8' })
    if (!diff.trim()) {
      // Fall back to diff vs last commit (post-commit scenario)
      diff = execSync('git diff HEAD~1 HEAD', { encoding: 'utf8' })
    }
    // Truncate to ~8000 chars to stay within token limits
    return diff.length > 8000 ? diff.substring(0, 8000) + '\n... (truncated)' : diff
  } catch {
    return ''
  }
}

// ─── Get changed file list ────────────────────────────────────────────────────

function getChangedFiles() {
  try {
    const staged = execSync('git diff --staged --name-only', { encoding: 'utf8' }).trim()
    if (staged) return staged
    return execSync('git diff HEAD~1 HEAD --name-only', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// ─── Call Claude API ──────────────────────────────────────────────────────────

async function generateEntry(apiKey, diff, files) {
  const today = new Date().toISOString().split('T')[0]
  const modeLabel = MODE === 'rebuild' ? 'Full Rebuild' : 'OTA Update'

  const systemPrompt = `You are a technical changelog writer for LeadLens, a React Native field sales prospecting app for pest control reps built on Expo SDK 51.

You write changelog entries that exactly match this established format:

---
## BETA-XX | YYYY-MM-DD

> Released via Project Scarlett — LeadLens_vX.X.XX-BETA.XX.apk

### Section Emoji Title
- Feature Name: Brief description of what changed and why it matters to the user or developer

### Another Section
- Another Feature: Description
---

SECTION RULES:
- Use only these section headers (include emoji exactly as shown), and only include sections that are relevant:
  ### New Features
  ### Territory Map
  ### Core App  
  ### Infrastructure
  ### Build
  ### Known Issues

- Each bullet: "- Feature Name: description" — Feature Name is bold-style label, colon, then plain description
- Descriptions are concise, specific, and technical but readable — mention file names when relevant
- Group related changes under the correct section
- Known Issues section only if there are actual known problems in the diff
- Do NOT invent features not present in the diff
- Do NOT include the "Released via" line for OTA updates — only for rebuilds
- Return ONLY the changelog entry, no preamble, no explanation, no markdown fences`

  const userPrompt = `Generate a changelog entry for:
- Version: ${BETA_VERSION} | ${VERSION_STRING}
- Date: ${today}
- Type: ${modeLabel}

Changed files:
${files}

Git diff:
${diff || '(no diff available — summarize based on changed file names only)'}`

  const res = await httpsPost('api.anthropic.com', '/v1/messages', {
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
  }, {
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  if (!res.body?.content?.[0]?.text) {
    throw new Error(`Claude API error: ${JSON.stringify(res.body)}`)
  }

  return res.body.content[0].text.trim()
}

// ─── Prepend to CHANGELOG.md ──────────────────────────────────────────────────

function prependChangelog(entry) {
  const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : ''
  const divider  = existing.trim() ? '\n\n---\n\n' : ''
  fs.writeFileSync(CHANGELOG, entry + divider + existing, 'utf8')
  console.log('[changelog] CHANGELOG.md updated.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[changelog] Generating entry for ${BETA_VERSION}...`)

  const diff  = getGitDiff()
  const files = getChangedFiles()

  if (!diff && !files) {
    console.warn('[changelog] No git diff found — changelog entry may be limited.')
  }

  const apiKey = await getClaudeApiKey()
  const entry  = await generateEntry(apiKey, diff, files)

  console.log('\n[changelog] Generated entry:\n')
  console.log(entry)
  console.log('')

  prependChangelog(entry)
}

main().catch(err => {
  console.error('[changelog] ERROR:', err.message)
  process.exit(1)
})
