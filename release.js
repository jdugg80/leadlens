#!/usr/bin/env node

/**
 * LeadLens Release Script v4.0
 * Merged from v3.1 (EAS polling, dry-run, .env auto-load) +
 *                   agent script (--apk manual mode, Expo push notifications, tag conflict handling)
 *
 * Usage:
 *   node release.js                     — full automated release
 *   node release.js --dry-run           — preview every step, nothing is changed
 *   node release.js --download-only <url>  — skip build trigger, use provided EAS artifact URL
 *   node release.js --download-only        — skip build trigger, prompt for EAS artifact URL
 *   node release.js --apk "path/to.apk" — skip build + download, upload existing APK directly
 *
 * .env keys used:
 *   EXPO_TOKEN                — EAS personal access token (expo.dev → Account Settings → Access Tokens)
 *   GITHUB_TOKEN              — GitHub personal access token (repo scope)
 *   SCARLETT_SERVICE_ROLE_KEY — Supabase service role key for Scarlett project
 *   RESEND_API_KEY            — Resend API key for tester emails (optional)
 *   LEADLENS_SERVICE_ROLE_KEY — LeadLens Supabase service role key (for push tokens)
 *
 * Optional env:
 *   TARGET_BUILD              — set to a specific build number to jump (e.g. TARGET_BUILD=50)
 *                               omit to always do current + 1
 */

'use strict';

const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const { execSync } = require('child_process');

// ─── Works whether script lives in root OR scripts/ subfolder ──────────────

const PROJECT_ROOT = fs.existsSync(path.join(__dirname, 'app.json'))
  ? __dirname
  : path.resolve(__dirname, '..');

// ─── Load .env ─────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️  No .env file found at project root — falling back to system env vars');
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf-8').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && val && !process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ─── Config ────────────────────────────────────────────────────────────────

const BUILD_DIR         = path.join(PROJECT_ROOT, 'builds');
const CHANGELOG_PATH    = path.join(PROJECT_ROOT, 'CHANGELOG.md');
const APP_JSON_PATH     = path.join(PROJECT_ROOT, 'app.json');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const BUILD_GRADLE_PATH = path.join(PROJECT_ROOT, 'android', 'app', 'build.gradle');

// Scarlett Supabase — hardcoded, never crosses with LeadLens project
const SCARLETT_URL    = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';

// LeadLens Supabase — for fetching push tokens
const LEADLENS_URL    = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';

// EAS GraphQL
const EAS_GRAPHQL_URL = 'https://api.expo.dev/graphql';

// Resend emails — sent via emailTesters() which queries Scarlett beta_testers dynamically

// ─── Flags ─────────────────────────────────────────────────────────────────

const DRY_RUN       = process.argv.includes('--dry-run');
const DOWNLOAD_ONLY = process.argv.includes('--download-only');
const DL_URL_IDX    = DOWNLOAD_ONLY ? process.argv.indexOf('--download-only') : -1;
const DL_URL_ARG    = DL_URL_IDX !== -1 && process.argv[DL_URL_IDX + 1] && !process.argv[DL_URL_IDX + 1].startsWith('--')
  ? process.argv[DL_URL_IDX + 1]
  : null;
const APK_ARG_IDX   = process.argv.indexOf('--apk');
const MANUAL_APK    = APK_ARG_IDX !== -1 ? process.argv[APK_ARG_IDX + 1] : null;

// ─── Console helpers ───────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  dim:    '\x1b[2m',
};

function ok(msg)   { console.log(`${c.green}✅ ${msg}${c.reset}`); }
function warn(msg) { console.log(`${c.yellow}⚠️  ${msg}${c.reset}`); }
function fail(msg) { console.error(`${c.red}❌ ${msg}${c.reset}`); }
function info(msg) { console.log(`${c.dim}   ${msg}${c.reset}`); }
function step(n, total, msg) {
  console.log(`\n${c.cyan}${c.bold}[${n}/${total}] ${msg}${c.reset}`);
}
function dryLog(msg) {
  if (DRY_RUN) console.log(`${c.gray}   [DRY RUN] ${msg}${c.reset}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── 1. Check env vars ─────────────────────────────────────────────────────

function checkEnv() {
  const required = [
    { key: 'EXPO_TOKEN',                hint: 'expo.dev → Account Settings → Access Tokens' },
    { key: 'GITHUB_TOKEN',              hint: 'already in your .env' },
    { key: 'SCARLETT_SERVICE_ROLE_KEY', hint: 'already in your .env' },
  ];

  // --apk mode doesn't need EXPO_TOKEN
  const needed = MANUAL_APK
    ? required.filter(r => r.key !== 'EXPO_TOKEN')
    : required;

  const missing = needed.filter(r => !process.env[r.key]);

  if (missing.length > 0) {
    fail('Missing required environment variables:');
    missing.forEach(r => console.log(`   ${r.key}  →  ${r.hint}`));
    console.log('\nAdd them to your .env file at the project root and re-run.');
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    warn('RESEND_API_KEY not in .env — tester emails will be skipped');
  }

  ok('Environment variables loaded from .env');
}

// ─── 2. Parse CHANGELOG ────────────────────────────────────────────────────

function parseChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error(`CHANGELOG.md not found at ${CHANGELOG_PATH}`);
  }

  // Keep the original (CRLF-intact) content separately — only the LF-normalized
  // copy below is used for regex matching, never written back to disk.
  const rawContent = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
  const content     = rawContent.replace(/\r\n/g, '\n');

  // Auto-stamp today's date if the top entry date differs
  const today   = new Date().toISOString().slice(0, 10);
  const stamped = content.replace(
    /^(## BETA-\d+\s*\|\s*)(\d{4}-\d{2}-\d{2})/m,
    (_, prefix, date) => {
      if (date !== today) {
        if (DRY_RUN) {
          dryLog(`Would stamp CHANGELOG date: ${date} → ${today}`);
        } else {
          // Swap only the date substring in the ORIGINAL CRLF content —
          // never write the LF-normalized `content` back to disk.
          fs.writeFileSync(CHANGELOG_PATH, rawContent.replace(date, today), 'utf-8');
          ok(`CHANGELOG date stamped: ${date} → ${today}`);
        }
        return `${prefix}${today}`;
      }
      return `${prefix}${date}`;
    }
  );

  const match = stamped.match(/##\s+BETA-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error('Invalid CHANGELOG format — expected: ## BETA-XX | YYYY-MM-DD');

  const buildNumber  = parseInt(match[1], 10);
  const buildDate    = match[2];

  // Extract bullet points for tidy release notes
  const sectionMatch = stamped.match(/##\s+BETA-\d+.*?\n([\s\S]*?)(?=\n##\s+BETA-\d+|$)/);
  const rawSection   = sectionMatch ? sectionMatch[1] : '';
  const changesText  = rawSection.trim().replace(/\n?-{3,}\s*$/, '').trim();

  // Bullet-only version for push notifications (first 5 lines)
  const bulletNotes = rawSection
    .split('\n')
    .filter(l => /^\s*[-•*]/.test(l))
    .slice(0, 5)
    .map(l => l.trim().replace(/^[-•*]\s*/, '• '))
    .join('\n');

  // Fallback: never write empty update_message to Scarlett
  const updateMessage = changesText || bulletNotes || 'Bug fixes and improvements.';

  return {
    buildNumber,
    buildDate,
    changesText,
    bulletNotes,
    updateMessage,
    version: `BETA-${buildNumber}`,
    tag:     `release-${buildNumber}`,
  };
}

// ─── 3. Bump versions ──────────────────────────────────────────────────────

function bumpVersions(buildNumber) {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'));

  // TARGET_BUILD env var overrides CHANGELOG build number
  const targetCode   = process.env.TARGET_BUILD
    ? parseInt(process.env.TARGET_BUILD, 10)
    : buildNumber;

  const currentCode  = appJson.expo.android.versionCode || 1;
  const [major, minor] = (appJson.expo.version || '2.0.1').split('.').map(Number);
  const newVersion   = `${major}.${minor}.${targetCode}`;

  if (targetCode < currentCode) {
    throw new Error(`Build number ${targetCode} must not be less than current versionCode ${currentCode}`);
  }

  if (DRY_RUN) {
    dryLog(`Would bump: ${appJson.expo.version} → ${newVersion} (versionCode ${currentCode} → ${targetCode})`);
    dryLog(`Would bump: runtimeVersion → ${newVersion}`);
    dryLog(`Would bump: extra.betaBuild → ${targetCode}`);
    return newVersion;
  }

  appJson.expo.version             = newVersion;
  appJson.expo.android.versionCode = targetCode;
  appJson.expo.runtimeVersion      = newVersion;
  if (!appJson.expo.extra) appJson.expo.extra = {};
  appJson.expo.extra.betaBuild     = targetCode;
  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n');

  const pkgJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  pkgJson.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2) + '\n');

  // Sync android/app/build.gradle versionCode/versionName
  const gradlePath = BUILD_GRADLE_PATH;
  let gradle = fs.readFileSync(gradlePath, 'utf-8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${targetCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
  fs.writeFileSync(gradlePath, gradle);

  // Validate: confirm app.json and build.gradle versions match
  const verifyApp = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8'));
  const verifyGradle = fs.readFileSync(gradlePath, 'utf-8');
  const gradleCode = verifyGradle.match(/versionCode\s+(\d+)/)?.[1];
  const gradleName = verifyGradle.match(/versionName\s+"([^"]+)"/)?.[1];
  if (verifyApp.expo.android.versionCode !== parseInt(gradleCode, 10) ||
      verifyApp.expo.version !== gradleName) {
    throw new Error(`Version mismatch after bump: app.json=${verifyApp.expo.version}/${verifyApp.expo.android.versionCode}, build.gradle=${gradleName}/${gradleCode}`);
  }

  ok(`Version bumped → v${newVersion} (versionCode ${currentCode} → ${targetCode})`);
  return newVersion;
}

// ─── 4. Git repo info ──────────────────────────────────────────────────────

function getGitRepoInfo() {
  const remoteUrl = execSync('git config --get remote.origin.url', {
    encoding: 'utf-8', cwd: PROJECT_ROOT,
  }).trim();
  const match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(\.git)?$/);
  if (!match) throw new Error(`Could not parse GitHub repo from: ${remoteUrl}`);
  return { owner: match[1], repo: match[2] };
}

// ─── 5. Trigger EAS build ──────────────────────────────────────────────────

function triggerEASBuild() {
  console.log('\n📦 Triggering EAS cloud build (Android)...');

  if (DRY_RUN) {
    dryLog('Would run: eas build --platform android --profile production --non-interactive --json');
    return 'dry-run-build-id-0000';
  }

  try {
    // Capture stdout only; EAS writes progress to stderr so they don't mix
    let output = '';
    try {
      output = execSync(
        'eas build --platform android --profile production --non-interactive --json',
        { encoding: 'utf-8', cwd: PROJECT_ROOT, stdio: ['inherit', 'pipe', 'inherit'] }
      );
    } catch (execErr) {
      // EAS sometimes exits non-zero even when build was queued — try to parse output anyway
      output = execErr.stdout || '';
      if (!output) throw execErr;
      warn('EAS exited with non-zero status — attempting to parse output anyway');
    }

    // Find the JSON array or object in the output, ignoring any leading non-JSON lines
    const lines = output.split('\n');
    let jsonStr = '';

    // Try to find a line that starts a JSON array or object
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        jsonStr = lines.slice(i).join('\n').trim();
        break;
      }
    }

    // Fallback: try regex extraction
    if (!jsonStr) {
      const jsonMatch = output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    if (!jsonStr) throw new Error('Could not find JSON in EAS output:\n' + output.slice(0, 500));

    // Strip any trailing non-JSON content after the closing bracket
    try {
      // Find the last ] or } and truncate there
      const lastBracket = Math.max(jsonStr.lastIndexOf(']'), jsonStr.lastIndexOf('}'));
      if (lastBracket !== -1) jsonStr = jsonStr.slice(0, lastBracket + 1);
    } catch {}

    const parsed  = JSON.parse(jsonStr);
    const build   = Array.isArray(parsed) ? parsed[0] : parsed;
    const buildId = build.id || build.buildId;

    if (!buildId) throw new Error('No build ID in EAS response: ' + JSON.stringify(build));

    ok(`EAS build queued — Build ID: ${buildId}`);
    return buildId;

  } catch (error) {
    fail('EAS build trigger failed: ' + error.message);
    throw error;
  }
}

// ─── 6. Poll EAS until FINISHED ────────────────────────────────────────────

async function waitForBuild(buildId) {
  console.log('\n⏳ Waiting for EAS build to finish (typically 10–20 min)...');

  if (DRY_RUN) {
    dryLog('Would poll EAS GraphQL every 30s until status = FINISHED');
    return 'https://example.com/dry-run-fake.apk';
  }

  const token = process.env.EXPO_TOKEN;
  const query = `
    query GetBuildById($buildId: ID!) {
      builds {
        byId(buildId: $buildId) {
          id
          status
          artifacts { buildUrl }
        }
      }
    }
  `;

  const pollInterval = 30_000;
  const maxWait      = 60 * 60_000;  // 60 minutes — builds with native modules + symbol upload can take 20+ min
  let elapsed        = 0;

  while (elapsed < maxWait) {
    await sleep(pollInterval);
    elapsed += pollInterval;

    const mins = Math.floor(elapsed / 60000);
    process.stdout.write(`\r   Elapsed: ${mins}m — checking...`);

    try {
      const res = await fetch(EAS_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables: { buildId } }),
      });

      if (!res.ok) { warn(`\nEAS poll HTTP ${res.status} — retrying`); continue; }

      const json  = await res.json();
      const build = json?.data?.builds?.byId;
      if (!build) { warn('\nUnexpected EAS response — retrying'); continue; }

      const status = build.status;

      if (status === 'FINISHED') {
        const apkUrl = build.artifacts?.buildUrl;
        if (!apkUrl) throw new Error('Build finished but no buildUrl in response');
        process.stdout.write('\n');
        ok('Build finished! Artifact URL obtained.');
        return apkUrl;
      }

      if (status === 'ERRORED' || status === 'CANCELLED') {
        process.stdout.write('\n');
        throw new Error(`EAS build ended with status: ${status}. Check expo.dev for logs.`);
      }

    } catch (err) {
      if (err.message.includes('EAS build ended')) throw err;
      warn(`\nPoll error (retrying): ${err.message}`);
    }
  }

  throw new Error('EAS build timed out after 60 minutes. Run "node poll-build.js <build-id>" to check status, then "node release.js --download-only <artifact-url>" to finish the release.');
}

// ─── 7. Download APK ───────────────────────────────────────────────────────

async function downloadAPK(apkUrl, buildNumber, newVersion) {
  console.log('\n⬇️  Downloading APK...');
  ensureDir(BUILD_DIR);

  const fileName = `LeadLens_v${newVersion}-BETA.${buildNumber}.apk`;
  const destPath = path.join(BUILD_DIR, fileName);

  if (DRY_RUN) {
    dryLog(`Would download APK to: ${destPath}`);
    return destPath;
  }

  return new Promise((resolve, reject) => {
    function doDownload(url, hops = 0) {
      if (hops > 5) return reject(new Error('Too many redirects'));
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          return doDownload(res.headers.location, hops + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const total    = parseInt(res.headers['content-length'] || '0', 10);
        let received   = 0;
        const file     = fs.createWriteStream(destPath);

        res.on('data', chunk => {
          received += chunk.length;
          if (total > 0) {
            const pct   = Math.round((received / total) * 100);
            const mb    = (received / 1024 / 1024).toFixed(1);
            const totMb = (total   / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r   ${pct}% (${mb} / ${totMb} MB)`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          ok(`APK saved: ${fileName}`);
          resolve(destPath);
        });
        file.on('error', err => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }).on('error', reject);
    }
    doDownload(apkUrl);
  });
}

// ─── 8. Create GitHub Release + upload APK ─────────────────────────────────

async function createGitHubRelease(buildInfo, apkPath, repoInfo, newVersion) {
  console.log('\n📤 Creating GitHub Release and uploading APK...');

  const token    = process.env.GITHUB_TOKEN;
  const fileName = path.basename(apkPath);

  if (DRY_RUN) {
    dryLog(`Would create release: ${buildInfo.tag} on ${repoInfo.owner}/${repoInfo.repo}`);
    dryLog(`Would upload: ${fileName}`);
    return {
      releaseUrl:     `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/tag/${buildInfo.tag}`,
      apkDownloadUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/download/${buildInfo.tag}/${fileName}`,
    };
  }

  // Create release — handle tag-already-exists gracefully
  const createRes = await fetch(
    `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases`,
    {
      method: 'POST',
      headers: {
        'Authorization':        `Bearer ${token}`,
        'Accept':               'application/vnd.github+json',
        'Content-Type':         'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        tag_name:   buildInfo.tag,
        name:       `LeadLens ${buildInfo.version} — ${buildInfo.buildDate}`,
        body:       buildInfo.changesText,
        draft:      false,
        prerelease: true,
      }),
    }
  );

  let release;

  if (!createRes.ok) {
    const body = await createRes.text();
    // Tag already exists — fetch existing release instead of failing
    if (createRes.status === 422 && body.includes('already_exists')) {
      warn('Release tag already exists — fetching existing release to upload APK');
      const getRes = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/tags/${buildInfo.tag}`,
        {
          headers: {
            'Authorization':        `Bearer ${token}`,
            'Accept':               'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
      if (!getRes.ok) throw new Error(`Could not fetch existing release: ${await getRes.text()}`);
      release = await getRes.json();
    } else {
      throw new Error(`GitHub release creation failed (${createRes.status}): ${body}`);
    }
  } else {
    release = await createRes.json();
  }

  ok(`GitHub Release: ${release.html_url}`);

  // Upload APK asset — handle existing asset gracefully
  const fileContent = fs.readFileSync(apkPath);
  const uploadUrl   = `https://uploads.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`;

  let uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization':        `Bearer ${token}`,
      'Accept':               'application/vnd.github+json',
      'Content-Type':         'application/octet-stream',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: fileContent,
  });

  let asset;

  // If asset already exists, delete it and re-upload
  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    if (uploadRes.status === 422 && errBody.includes('already_exists')) {
      warn('APK asset already exists — deleting and re-uploading');

      // List existing assets to find the one to delete
      const assetsRes = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/${release.id}/assets`,
        {
          headers: {
            'Authorization':        `Bearer ${token}`,
            'Accept':               'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (assetsRes.ok) {
        const existingAssets = await assetsRes.json();
        const existingAsset = existingAssets.find(a => a.name === fileName);

        if (existingAsset) {
          // Delete the existing asset
          await fetch(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/assets/${existingAsset.id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization':        `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
              },
            }
          );
          ok(`Deleted existing asset: ${fileName}`);

          // Re-upload
          uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization':        `Bearer ${token}`,
              'Accept':               'application/vnd.github+json',
              'Content-Type':         'application/octet-stream',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: fileContent,
          });

          if (!uploadRes.ok) {
            throw new Error(`APK re-upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
          }
        } else {
          throw new Error(`APK upload failed (${uploadRes.status}): ${errBody}`);
        }
      } else {
        throw new Error(`APK upload failed (${uploadRes.status}): ${errBody}`);
      }
    } else {
      throw new Error(`APK upload failed (${uploadRes.status}): ${errBody}`);
    }
  }

  asset = await uploadRes.json();
  ok(`APK uploaded: ${fileName}`);

  return {
    releaseUrl:     release.html_url,
    apkDownloadUrl: asset.browser_download_url,
  };
}

// ─── 9. Update Scarlett app_config ─────────────────────────────────────────

async function updateScarlett(buildInfo, newVersion, apkUrl) {
  console.log('\n🔄 Updating Scarlett app_config...');

  const serviceKey = process.env.SCARLETT_SERVICE_ROLE_KEY;

  if (DRY_RUN) {
    dryLog(`Would PATCH ${SCARLETT_URL}/rest/v1/app_config?id=eq.1`);
    dryLog(`  current_build=${buildInfo.buildNumber}, version_name=v${newVersion}-BETA.${buildInfo.buildNumber}`);
    return;
  }

  const res = await fetch(`${SCARLETT_URL}/rest/v1/app_config?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      current_build:  buildInfo.buildNumber,
      version_name:   `v${newVersion}-BETA.${buildInfo.buildNumber}`,
      apk_url:        apkUrl,
      update_message: buildInfo.updateMessage,
      force_update:   true,
      updated_at:     new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Scarlett update failed: HTTP ${res.status} — ${await res.text()}`);
  }

  ok('Scarlett app_config updated');
}

// ─── 9b. Insert beta_releases entry ───────────────────────────────────

async function insertBetaRelease(buildInfo) {
  console.log('\n🔄 Inserting beta_releases entry...');

  const serviceKey = process.env.SCARLETT_SERVICE_ROLE_KEY;

  if (DRY_RUN) {
    dryLog(`Would INSERT into ${SCARLETT_URL}/rest/v1/beta_releases`);
    dryLog(`  build_number=${buildInfo.buildNumber}, version_label=${buildInfo.version}`);
    return;
  }

  const res = await fetch(`${SCARLETT_URL}/rest/v1/beta_releases`, {
    method: 'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      build_number:    buildInfo.buildNumber,
      version_label:    buildInfo.version,
      changelog:       buildInfo.changesText || null,
      released_at:      new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    // 409 = already exists (idempotent)
    if (res.status !== 409) {
      throw new Error(`beta_releases insert failed: HTTP ${res.status} — ${await res.text()}`);
    }
    warn('beta_releases row already exists — skipping insert');
  } else {
    ok(`beta_releases inserted: ${buildInfo.version}`);
  }
}

// ─── 9b. Email beta testers via Resend ────────────────────────────────────

async function emailTesters({ buildInfo, newVersion, downloadUrl }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    warn('RESEND_API_KEY not set — skipping tester emails');
    return;
  }

  if (DRY_RUN) {
    dryLog('Would query Scarlett beta_testers and send release emails via Resend');
    return;
  }

  const SCARLETT_URL  = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
  const SERVICE_KEY   = process.env.SCARLETT_SERVICE_ROLE_KEY;
  const today         = buildInfo.buildDate || new Date().toISOString().slice(0, 10);

  // 1. Fetch approved testers from Scarlett
  let testers = [];
  try {
    const res = await fetch(
      `${SCARLETT_URL}/rest/v1/beta_testers?select=email,first_name&status=in.(approved,active)`,
      {
        headers: {
          'apikey':        SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    if (res.ok) testers = await res.json();
  } catch (err) {
    warn(`Could not fetch testers from Scarlett: ${err.message}`);
    return;
  }

  if (!testers.length) {
    info('No approved testers — skipping emails');
    return;
  }

  // 2. Build HTML email
  const bulletLines = (buildInfo.changesText || '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<li>${l.replace(/^[•\-]\s*/, '')}</li>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#080A0F;color:#E8EAF2;padding:24px;">
  <div style="max-width:520px;margin:0 auto;">
    <h1 style="color:#00C9FF;font-size:20px;margin-bottom:4px;">LeadLens ${buildInfo.version}</h1>
    <p style="color:#A0A8C0;font-size:13px;margin-top:0;">Ready for testing — ${today}</p>
    ${bulletLines ? `<ul style="color:#B8BDD0;font-size:14px;line-height:1.6;">${bulletLines}</ul>` : ''}
    <a href="${downloadUrl}"
       style="display:inline-block;background:#00C9FF;color:#000;font-weight:800;font-size:14px;
              padding:12px 28px;border-radius:10px;text-decoration:none;margin-top:16px;">
      Download APK
    </a>
    <p style="color:#5A6080;font-size:11px;margin-top:24px;">You received this because you're an approved LeadLens beta tester.</p>
  </div>
</body></html>`;

  // 3. Send to each tester
  let sent = 0, failed = 0;
  for (const t of testers) {
    if (!t.email) { failed++; continue; }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'LeadLens Updates <noreply@support.okayestmedia.com>',
          to:      [t.email],
          subject: `\u{1F680} LeadLens ${buildInfo.version} Ready for Testing`,
          html,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        const err = await res.text();
        warn(`Email to ${t.email} failed (${res.status}): ${err}`);
        failed++;
      }
    } catch (err) {
      warn(`Email to ${t.email} failed: ${err.message}`);
      failed++;
    }
  }

  if (sent) ok(`Tester emails sent: ${sent}/${testers.length}`);
  if (failed) warn(`Tester emails failed: ${failed}/${testers.length}`);
}

// ─── 10. Notify testers (Resend email + Expo push) ─────────────────────────

async function notifyTesters(buildInfo, newVersion, downloadUrl) {
  console.log('\n📧 Notifying testers...');

  // ── Resend emails (dynamic query from Scarlett beta_testers) ──
  await emailTesters({ buildInfo, newVersion, downloadUrl });

  // ── Expo push notifications to registered devices ──
  if (DRY_RUN) {
    dryLog('Would fetch push tokens from LeadLens Supabase and send Expo push notifications');
    return;
  }

  try {
    // LeadLens service key for user_push_tokens table (different project from Scarlett)
    const leadlensKey = process.env.LEADLENS_SERVICE_ROLE_KEY;
    if (!leadlensKey) {
      throw new Error('LEADLENS_SERVICE_ROLE_KEY not set in .env — required for push token lookup (do NOT use SCARLETT_SERVICE_ROLE_KEY here)');
    }
    const tokenRes   = await fetch(
      `${LEADLENS_URL}/rest/v1/user_push_tokens?select=push_token,user_id`,
      {
        headers: {
          'apikey':        leadlensKey,
          'Authorization': `Bearer ${leadlensKey}`,
        },
      }
    );

    if (!tokenRes.ok) {
      warn(`Could not fetch push tokens (${tokenRes.status}) — skipping push`);
      return;
    }

    const rows   = await tokenRes.json();
    const tokens = rows.map(r => r.push_token).filter(Boolean);

    if (!tokens.length) {
      info('No registered push tokens — skipping push notifications');
      return;
    }

    const firstNote = buildInfo.bulletNotes?.split('\n')?.[0]?.replace('• ', '') || 'New features and fixes';
    const messages  = tokens.map(to => ({
      to,
      title:    `🚀 LeadLens ${buildInfo.version} is live!`,
      body:     firstNote,
      data:     { buildNum: buildInfo.buildNumber, type: 'new_build' },
      sound:    'default',
      priority: 'high',
    }));

    // Expo allows 100 per request — parse per-ticket response for real success count
    let sent = 0;
    let failed = 0;
    const failedTokens = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk   = messages.slice(i, i + 100);
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(chunk),
      });

      if (!pushRes.ok) {
        warn(`Expo push HTTP ${pushRes.status} — skipping chunk`);
        failed += chunk.length;
        continue;
      }

      const pushBody = await pushRes.json().catch(() => null);
      const tickets = pushBody?.data || [];

      for (let t = 0; t < tickets.length; t++) {
        const ticket = tickets[t];
        if (ticket?.status === 'ok') {
          sent++;
        } else {
          failed++;
          const msg = ticket?.message || ticket?.details?.error || 'unknown';
          const tokenPreview = chunk[t]?.to
            ? chunk[t].to.slice(0, 24) + '...'
            : `index ${i + t}`;
          failedTokens.push({ token: tokenPreview, error: msg });
          if (msg === 'DeviceNotRegistered') {
            warn(`Stale token detected (${tokenPreview}) — tester must log out and back in to re-register`);
          }
        }
      }
    }

    if (failed > 0) {
      warn(`Push delivery partial: ${sent} delivered, ${failed} failed`);
      for (const f of failedTokens) {
        warn(`  ${f.token} → ${f.error}`);
      }
    } else {
      ok(`Push notifications delivered to ${sent}/${tokens.length} device(s)`);
    }
  } catch (err) {
    warn(`Push notification error (non-fatal): ${err.message}`);
  }
}

// ─── 11. Git commit + tag + push ───────────────────────────────────────────

function commitAndPush(buildInfo) {
  console.log('\n📝 Committing release to git...');

  if (DRY_RUN) {
    dryLog('Would: git add app.json package.json CHANGELOG.md android/app/build.gradle');
    dryLog(`Would: git commit -m "chore(release): ${buildInfo.version} — ${buildInfo.buildDate}"`);
    dryLog(`Would: git tag -a ${buildInfo.tag} -m "${buildInfo.version}"`);
    dryLog('Would: git push origin main --tags');
    return;
  }

  try {
    execSync('git add app.json package.json CHANGELOG.md android/app/build.gradle', { cwd: PROJECT_ROOT });
    execSync(
      `git commit -m "chore(release): ${buildInfo.version} — ${buildInfo.buildDate}"`,
      { cwd: PROJECT_ROOT }
    );
    ok('Changes committed');

    execSync(
      `git tag -a ${buildInfo.tag} -m "${buildInfo.version} — ${buildInfo.buildDate}"`,
      { cwd: PROJECT_ROOT }
    );
    ok(`Git tag created: ${buildInfo.tag}`);

    execSync('git push origin main --tags', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    ok('Pushed to GitHub');

  } catch (err) {
    warn('Git push failed: ' + err.message);
    warn('Push manually if needed: git push origin main --tags');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log(`${c.cyan}${c.bold}🚀 LeadLens Release Script v4.0${c.reset}`);
  if (DRY_RUN)    console.log(`${c.yellow}   MODE: DRY RUN — nothing will be changed${c.reset}`);
  if (MANUAL_APK) console.log(`${c.yellow}   MODE: MANUAL APK — skipping build + download${c.reset}`);
  if (DOWNLOAD_ONLY && !MANUAL_APK) console.log(`${c.yellow}   MODE: DOWNLOAD ONLY — skipping build trigger${c.reset}`);
  console.log('='.repeat(60));

  try {
    const TOTAL = 9;

    step(1, TOTAL, 'Checking environment');
    checkEnv();

    step(2, TOTAL, 'Reading CHANGELOG');
    const buildInfo = parseChangelog();
    console.log(`   Build:  ${buildInfo.version}`);
    console.log(`   Date:   ${buildInfo.buildDate}`);
    console.log(`   Tag:    ${buildInfo.tag}`);

    step(3, TOTAL, 'Bumping version numbers');
    // Always bump versions — even in --apk mode, app.json must reflect the correct build
    const newVersion = bumpVersions(buildInfo.buildNumber);

    step(4, TOTAL, 'Reading git repo info');
    const repoInfo = getGitRepoInfo();
    console.log(`\n   Repo: ${repoInfo.owner}/${repoInfo.repo}`);

    let apkPath;

    // ── Mode: --apk (manual APK provided) ──────────────────────────────────
    if (MANUAL_APK) {
      if (!fs.existsSync(MANUAL_APK)) {
        throw new Error(`APK not found at: ${MANUAL_APK}`);
      }
      apkPath = MANUAL_APK;
      ok(`Using provided APK: ${path.basename(apkPath)}`);

    // ── Mode: --download-only (paste URL or use argument) ────────────────────
    } else if (DOWNLOAD_ONLY) {
      step(5, TOTAL, 'DOWNLOAD ONLY — obtain EAS artifact URL');
      let apkUrl;
      if (DL_URL_ARG) {
        apkUrl = DL_URL_ARG;
        ok(`Using URL from argument: ${apkUrl}`);
      } else {
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        apkUrl = await new Promise(resolve => {
          rl.question('   Paste EAS artifact URL from expo.dev: ', ans => {
            rl.close();
            resolve(ans.trim());
          });
        });
      }
      step(7, TOTAL, 'Downloading APK');
      apkPath = await downloadAPK(apkUrl, buildInfo.buildNumber, newVersion);

    // ── Mode: normal full build ─────────────────────────────────────────────
    } else {
      step(5, TOTAL, 'Triggering EAS build');
      const buildId = triggerEASBuild();

      step(6, TOTAL, 'Waiting for build to complete');
      const apkUrl = await waitForBuild(buildId);

      step(7, TOTAL, 'Downloading APK');
      apkPath = await downloadAPK(apkUrl, buildInfo.buildNumber, newVersion);
    }

    step(8, TOTAL, 'Publishing — GitHub + Scarlett + testers');
    const { releaseUrl, apkDownloadUrl } = await createGitHubRelease(buildInfo, apkPath, repoInfo, newVersion);
    await updateScarlett(buildInfo, newVersion, apkDownloadUrl);
    await insertBetaRelease(buildInfo);
    await notifyTesters(buildInfo, newVersion, apkDownloadUrl);

    step(9, TOTAL, 'Committing and pushing to git');
    commitAndPush(buildInfo);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log(`${c.green}${c.bold}✅ RELEASE COMPLETE!${c.reset}`);
    console.log('='.repeat(60));
    console.log(`\n🎉 ${buildInfo.version} successfully released!\n`);
    console.log(`   Version:        v${newVersion}`);
    console.log(`   GitHub Release: ${releaseUrl}`);
    console.log(`   APK URL:        ${apkDownloadUrl}`);
    console.log(`   Scarlett:       ✅ updated`);
    console.log(`   Git tag:        ${buildInfo.tag}`);
    if (DRY_RUN) console.log(`\n${c.yellow}   ↑ DRY RUN — none of the above actually happened${c.reset}`);
    console.log();

  } catch (err) {
    fail('RELEASE FAILED: ' + err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
