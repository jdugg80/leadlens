#!/usr/bin/env node
/**
 * LeadLens Release Script
 *
 * Usage:
 *   node release.js                  — bump CHANGELOG date, build production APK, update Scarlett
 *   node release.js --preview        — same but preview profile
 *   node release.js --apk "path"     — skip build, upload existing APK to GitHub + update Scarlett
 *   node release.js --download-only  — download latest EAS build artifact, no new build
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Works whether script lives in project root OR a scripts/ subfolder
const ROOT = fs.existsSync(path.join(__dirname, 'app.json'))
  ? __dirname
  : path.resolve(__dirname, '..');

// ── Console helpers ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m',  cyan: '\x1b[36m',  bold: '\x1b[1m', dim: '\x1b[2m',
};
const ok   = s => console.log(`${c.green}✅ ${s}${c.reset}`);
const warn = s => console.log(`${c.yellow}⚠️  ${s}${c.reset}`);
const fail = s => console.log(`${c.red}❌ ${s}${c.reset}`);
const info = s => console.log(`${c.dim}   ${s}${c.reset}`);
const step = s => console.log(`\n${c.bold}${c.cyan}${s}${c.reset}`);
const hr   = () => console.log(c.dim + '─'.repeat(60) + c.reset);

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) env[k] = v;
  }
  return env;
}

// ── Parse CHANGELOG ──────────────────────────────────────────────────────────
function parseChangelog() {
  const p = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(p)) throw new Error('CHANGELOG.md not found');

  const content  = fs.readFileSync(p, 'utf8');
  const sections = content.split(/^## /m).slice(1);
  if (!sections.length) throw new Error('No ## BETA-X entries in CHANGELOG');

  const latest = sections[0];
  const header = latest.match(/^BETA-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (!header) throw new Error('Invalid CHANGELOG format — expected: ## BETA-X | YYYY-MM-DD');

  const buildNum = parseInt(header[1], 10);
  const date     = header[2];
  const notes    = latest
    .split('\n').slice(1)
    .filter(l => /^\s*[-•*]/.test(l))
    .map(l => l.trim().replace(/^[-•*]\s*/, '• '))
    .join('\n');

  return { buildNum, date, notes, content };
}

// ── Stamp today's date into CHANGELOG if it's a placeholder ─────────────────
function stampChangelogDate(content) {
  const today    = new Date().toISOString().slice(0, 10);
  const updated  = content.replace(
    /^(## BETA-\d+\s*\|\s*)(\d{4}-\d{2}-\d{2})/m,
    (_, prefix, date) => date === today ? `${prefix}${date}` : `${prefix}${today}`
  );
  if (updated !== content) {
    fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), updated, 'utf8');
    ok(`CHANGELOG.md date stamped: ${today}`);
  }
  return updated;
}

// ── Bump app.json ────────────────────────────────────────────────────────────
function bumpAppJson(buildNum) {
  const p    = path.join(ROOT, 'app.json');
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const root = json.expo || json;

  const baseVersion = (root.version || '2.0.1').replace(/-BETA.*$/i, '').trim();
  root.version = baseVersion;

  if (!root.extra)   root.extra   = {};
  if (!root.android) root.android = {};
  root.extra.betaBuild      = buildNum;
  root.android.versionCode  = buildNum;

  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
  ok(`app.json → version=${baseVersion}, versionCode=${buildNum}, betaBuild=${buildNum}`);
}

// ── EAS build ────────────────────────────────────────────────────────────────
function runEasBuild(profile) {
  info(`Starting EAS build [${profile}]...`);
  try {
    execSync(`eas build --platform android --profile ${profile} --non-interactive`, {
      cwd: ROOT, stdio: 'inherit',
    });
    ok('EAS build completed');
  } catch (err) {
    throw new Error(`EAS build failed: ${err.message}`);
  }
}

// ── Download latest EAS artifact ─────────────────────────────────────────────
function downloadLatestBuild(buildNum) {
  const outDir  = path.join(ROOT, 'builds');
  const outFile = path.join(outDir, `app-release-${buildNum}.apk`);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  info('Downloading latest build artifact from EAS...');
  try {
    // Get latest build ID
    const listJson = execSync(
      `eas build:list --platform android --limit 1 --json --non-interactive`,
      { cwd: ROOT, encoding: 'utf8' }
    );
    const builds = JSON.parse(listJson);
    const buildId = builds?.[0]?.id;
    if (!buildId) {
      warn('No EAS builds found');
      return null;
    }
    info(`Latest build ID: ${buildId}`);
    // eas build:download saves to EAS cache dir
    execSync(
      `eas build:download --build-id ${buildId} --non-interactive`,
      { cwd: outDir, stdio: 'inherit' }
    );
    // Find the downloaded .apk in EAS cache
    const easCache = path.join(require('os').tmpdir(), 'eas-cli-nodejs', 'eas-build-run-cache');
    if (fs.existsSync(easCache)) {
      const apk = fs.readdirSync(easCache).find(f => f.endsWith('.apk'));
      if (apk) {
        const src = path.join(easCache, apk);
        fs.copyFileSync(src, outFile);
        fs.unlinkSync(src);
      }
    }
    if (fs.existsSync(outFile)) {
      ok(`APK downloaded: ${outFile}`);
      return outFile;
    }
  } catch (err) {
    warn(`eas build:download failed: ${err.message}`);
  }
  return null;
}

// ── GitHub release upload ─────────────────────────────────────────────────────
async function uploadToGitHub(apkPath, buildNum, token) {
  const owner    = 'jdugg80';
  const repo     = 'leadlens-beta-releases';
  const tagName  = `beta-${buildNum}`;
  const fileName = `app-release-${buildNum}.apk`;

  info(`Creating GitHub release ${tagName}...`);
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      tag_name:   tagName,
      name:       `LeadLens BETA-${buildNum}`,
      body:       `LeadLens BETA-${buildNum} release`,
      draft:      false,
      prerelease: true,
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    // If release already exists, fetch it instead
    if (createRes.status === 422 && body.includes('already_exists')) {
      warn('Release tag already exists — fetching existing release');
      const getRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`,
        { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
      );
      if (!getRes.ok) throw new Error(`Could not fetch existing release: ${await getRes.text()}`);
      const existing = await getRes.json();
      return existing.assets?.find(a => a.name === fileName)?.browser_download_url
        || existing.html_url;
    }
    throw new Error(`GitHub release creation failed: ${body}`);
  }

  const release   = await createRes.json();
  const fileBytes = fs.readFileSync(apkPath);

  info('Uploading APK asset...');
  const uploadRes = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type':  'application/vnd.android.package-archive',
      },
      body: fileBytes,
    }
  );

  if (!uploadRes.ok) throw new Error(`APK upload failed: ${await uploadRes.text()}`);

  const asset = await uploadRes.json();
  ok(`GitHub release: ${release.html_url}`);
  return asset.browser_download_url;
}

// ── Update Scarlett app_config ────────────────────────────────────────────────
async function updateAppConfig(serviceKey, supabaseUrl, buildNum, apkUrl, notes) {
  const res = await fetch(`${supabaseUrl}/rest/v1/app_config?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      current_build:  buildNum,
      version_name:   `v2.0.1-BETA.${buildNum}`,
      apk_url:        apkUrl,
      update_message: notes,
      force_update:   true,
      updated_at:     new Date().toISOString(),
    }),
  });

  if (!res.ok) throw new Error(`app_config update failed: ${await res.text()}`);
  ok('Scarlett app_config updated');
}

// ── Notify beta testers via push ──────────────────────────────────────────────
async function notifyTesters(serviceKey, supabaseUrl, buildNum, notes) {
  try {
    // Fetch all registered push tokens from LeadLens Supabase
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?select=token&is_active=eq.true`,
      {
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!tokenRes.ok) {
      warn(`Could not fetch push tokens: ${await tokenRes.text()}`);
      return;
    }

    const rows   = await tokenRes.json();
    const tokens = rows.map(r => r.token).filter(Boolean);

    if (!tokens.length) {
      info('No registered push tokens — skipping notifications');
      return;
    }

    // Build Expo push messages
    const firstNote = notes?.split('\n')?.[0]?.replace('• ', '') || 'New features and fixes';
    const messages  = tokens.map(to => ({
      to,
      title: `🚀 LeadLens BETA-${buildNum} is live!`,
      body:  firstNote,
      data:  { buildNum, type: 'new_build' },
      sound: 'default',
      priority: 'high',
    }));

    // Expo Push API allows 100 per request
    const CHUNK = 100;
    let sent = 0;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (pushRes.ok) sent += chunk.length;
    }

    ok(`Push notifications sent to ${sent}/${tokens.length} testers`);
  } catch (err) {
    warn(`Push notification failed: ${err.message}`);
  }
}


// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args         = process.argv.slice(2);
  const isPreview    = args.includes('--preview');
  const dlOnly       = args.includes('--download-only');
  const apkArgIdx    = args.indexOf('--apk');
  const apkPath      = apkArgIdx !== -1 ? args[apkArgIdx + 1] : null;
  const profile      = isPreview ? 'preview' : 'production';

  const env         = loadEnv();
  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  const SERVICE_KEY  = env.SCARLETT_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const SCARLETT_URL = env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
  const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';

  if (!SERVICE_KEY) {
    fail('SCARLETT_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) not set in .env');
    process.exit(1);
  }

  hr();
  step(`LeadLens Release — BETA [${profile.toUpperCase()}]`);
  hr();

  // ── Parse + stamp CHANGELOG ──
  step('1/4 Reading CHANGELOG.md');
  let { buildNum, date, notes, content } = parseChangelog();
  stampChangelogDate(content);
  ok(`BETA-${buildNum} | ${new Date().toISOString().slice(0, 10)}`);
  if (notes) { info('Release notes:'); notes.split('\n').forEach(l => info('  ' + l)); }

  // ── --apk mode: upload existing APK ──
  if (apkPath) {
    if (!fs.existsSync(apkPath)) { fail(`APK not found: ${apkPath}`); process.exit(1); }
    if (!GITHUB_TOKEN)            { fail('GITHUB_TOKEN required for --apk upload'); process.exit(1); }

    step('Uploading APK to GitHub');
    const apkUrl = await uploadToGitHub(apkPath, buildNum, GITHUB_TOKEN);

    step('Updating Scarlett + Notifying Testers');
    await updateAppConfig(SERVICE_KEY, SCARLETT_URL, buildNum, apkUrl, notes);
    await notifyTesters(SERVICE_KEY, SUPABASE_URL, buildNum, notes);

    hr();
    ok(`BETA-${buildNum} released!`);
    console.log(`\n  APK: ${apkUrl}\n`);
    return;
  }

  // ── --download-only: grab latest artifact ──
  if (dlOnly) {
    step('Downloading latest EAS artifact');
    const downloaded = downloadLatestBuild(buildNum);
    if (downloaded) {
      console.log(`\n${c.yellow}Next:${c.reset}`);
      console.log(`  adb install -r "${downloaded}"`);
      console.log(`  node release.js --apk "${downloaded}"\n`);
    }
    return;
  }

  // ── Normal build flow ──
  if (!GITHUB_TOKEN) warn('GITHUB_TOKEN not set — GitHub upload will be skipped after build');

  // 2. Bump app.json
  step('2/4 Updating app.json');
  bumpAppJson(buildNum);

  // 3. EAS build
  step(`3/4 Building APK with EAS [${profile}]`);
  runEasBuild(profile);

  // 4. Auto-download APK
  step('4/5 Downloading APK artifact');
  const downloaded = downloadLatestBuild(buildNum);

  // 5. Upload to GitHub + update Scarlett
  if (downloaded && GITHUB_TOKEN) {
    step('5/5 Uploading to GitHub + updating Scarlett');
    try {
      const apkUrl = await uploadToGitHub(downloaded, buildNum, GITHUB_TOKEN);
      await updateAppConfig(SERVICE_KEY, SCARLETT_URL, buildNum, apkUrl, notes);
    await notifyTesters(env.LEADLENS_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, buildNum, notes);
      hr();
      console.log(`\n${c.green}${c.bold}✅ BETA-${buildNum} fully released! [${profile}]${c.reset}\n`);
      console.log(`  APK:     ${apkUrl}`);
      console.log(`  Install: adb install -r "${downloaded}"\n`);
    } catch (err) {
      warn(`GitHub/Scarlett update failed: ${err.message}`);
      console.log(`  APK saved at: ${downloaded}`);
      console.log(`  Re-run:  node release.js --apk "${downloaded}"\n`);
    }
  } else if (downloaded) {
    step('5/5 Updating Scarlett (no GitHub token)');
    const placeholderUrl = `https://github.com/jdugg80/leadlens-beta-releases/releases/download/beta-${buildNum}/app-release-${buildNum}.apk`;
    try { await updateAppConfig(SERVICE_KEY, SCARLETT_URL, buildNum, placeholderUrl, notes); }
    catch (err) { warn(`Scarlett update failed: ${err.message}`); }
    hr();
    console.log(`\n${c.green}${c.bold}✅ BETA-${buildNum} built! [${profile}]${c.reset}\n`);
    console.log(`  To publish: node release.js --apk "${downloaded}"\n`);
  } else {
    step('5/5 Updating Scarlett (download failed — placeholder URL)');
    const placeholderUrl = `https://github.com/jdugg80/leadlens-beta-releases/releases/download/beta-${buildNum}/app-release-${buildNum}.apk`;
    try { await updateAppConfig(SERVICE_KEY, SCARLETT_URL, buildNum, placeholderUrl, notes); }
    catch (err) { warn(`Scarlett update failed: ${err.message}`); }
    hr();
    warn('APK auto-download failed. Grab it manually:');
    console.log(`  https://expo.dev/accounts/jdugg80/projects/leadlens/builds`);
    console.log(`  Then: node release.js --apk "path\\to\\apk"\n`);
  }
}

main().catch(err => {
  fail(`Release failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
