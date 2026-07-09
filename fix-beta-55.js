#!/usr/bin/env node

/**
 * One-off fix: backfills the correct BETA-55 changelog text into Scarlett,
 * since the original release run wrote the "Bug fixes and improvements."
 * fallback due to the CRLF parsing bug (now fixed in release.js).
 *
 * Usage:
 *   node fix-beta-55.js            — apply the fix
 *   node fix-beta-55.js --dry-run  — preview what would be sent, no writes
 *
 * Reads the same .env as release.js (SCARLETT_SERVICE_ROLE_KEY required).
 * Re-parses CHANGELOG.md with the corrected regex so the text is pulled
 * live, not pasted by hand.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT     = __dirname;
const CHANGELOG_PATH   = path.join(PROJECT_ROOT, 'CHANGELOG.md');
const SCARLETT_URL      = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
const DRY_RUN            = process.argv.includes('--dry-run');
const TARGET_BUILD_NUM   = 55; // change if you need to patch a different build

function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
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

function parseBuildSection(buildNum) {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf-8').replace(/\r\n/g, '\n');

  const headerRe = new RegExp(`##\\s+BETA-${buildNum}\\s*\\|\\s*(\\d{4}-\\d{2}-\\d{2})`);
  const headerMatch = content.match(headerRe);
  if (!headerMatch) throw new Error(`Could not find "## BETA-${buildNum}" header in CHANGELOG.md`);
  const buildDate = headerMatch[1];

  const sectionRe = new RegExp(`##\\s+BETA-${buildNum}.*?\\n([\\s\\S]*?)(?=\\n##\\s+BETA-\\d+|$)`);
  const sectionMatch = content.match(sectionRe);
  const changesText = sectionMatch
    ? sectionMatch[1].trim().replace(/\n?-{3,}\s*$/, '').trim()
    : '';

  if (!changesText) throw new Error(`Parsed empty content for BETA-${buildNum} — check CHANGELOG.md formatting`);

  return { buildNumber: buildNum, buildDate, changesText };
}

async function patchAppConfig(buildInfo) {
  console.log('\nPatching app_config.update_message ...');
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would PATCH ${SCARLETT_URL}/rest/v1/app_config?current_build=eq.${buildInfo.buildNumber}`);
    console.log(`   update_message preview:\n${buildInfo.changesText.slice(0, 200)}...`);
    return;
  }

  const serviceKey = process.env.SCARLETT_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SCARLETT_SERVICE_ROLE_KEY not found in .env');

  // Only patch if the row's current_build still matches the target build,
  // so we don't overwrite a newer release's notes by accident.
  const res = await fetch(`${SCARLETT_URL}/rest/v1/app_config?id=eq.1&current_build=eq.${buildInfo.buildNumber}`, {
    method: 'PATCH',
    headers: {
      apikey:        serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
    },
    body: JSON.stringify({
      update_message: buildInfo.changesText,
      updated_at:     new Date().toISOString(),
    }),
  });

  if (!res.ok) throw new Error(`app_config patch failed: HTTP ${res.status} — ${await res.text()}`);
  const rows = await res.json();
  if (rows.length === 0) {
    console.log(`   Skipped — app_config.current_build is no longer ${buildInfo.buildNumber} (a newer release already ran)`);
  } else {
    console.log('   app_config updated');
  }
}

async function patchBetaReleases(buildInfo) {
  console.log('\nPatching beta_releases.changelog ...');
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would PATCH ${SCARLETT_URL}/rest/v1/beta_releases?build_number=eq.${buildInfo.buildNumber}`);
    return;
  }

  const serviceKey = process.env.SCARLETT_SERVICE_ROLE_KEY;

  const res = await fetch(`${SCARLETT_URL}/rest/v1/beta_releases?build_number=eq.${buildInfo.buildNumber}`, {
    method: 'PATCH',
    headers: {
      apikey:        serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
    },
    body: JSON.stringify({
      changelog: buildInfo.changesText,
    }),
  });

  if (!res.ok) throw new Error(`beta_releases patch failed: HTTP ${res.status} — ${await res.text()}`);
  const rows = await res.json();
  if (rows.length === 0) {
    console.log('   No matching beta_releases row found — nothing to patch');
  } else {
    console.log('   beta_releases updated');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log(`Backfilling BETA-${TARGET_BUILD_NUM} release notes${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const buildInfo = parseBuildSection(TARGET_BUILD_NUM);
  console.log(`\nParsed ${buildInfo.changesText.length} chars for BETA-${buildInfo.buildNumber} (${buildInfo.buildDate})`);

  await patchAppConfig(buildInfo);
  await patchBetaReleases(buildInfo);

  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
