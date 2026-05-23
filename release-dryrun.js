#!/usr/bin/env node

/**
 * LeadLens Release Dry-Run Script
 * Shows what the release script WOULD do without actually doing it
 * 
 * Usage: node release-dryrun.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname);
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'CHANGELOG.md');

/**
 * Parse CHANGELOG to extract BETA version and details
 */
function parseChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error(`CHANGELOG.md not found at ${CHANGELOG_PATH}`);
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
  
  // Match format: ## BETA-X | YYYY-MM-DD
  const versionMatch = content.match(/##\s+BETA-(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (!versionMatch) {
    throw new Error('Invalid CHANGELOG format - expected: ## BETA-X | YYYY-MM-DD');
  }

  const buildNumber = parseInt(versionMatch[1], 10);
  const buildDate = versionMatch[2];

  // Extract changes section
  const changesSectionMatch = content.match(/##\s+BETA-\d+.*?\n([\s\S]*?)(?=##|$)/);
  const changesText = changesSectionMatch ? changesSectionMatch[1].trim() : '';

  return {
    buildNumber,
    buildDate,
    changesText,
    version: `BETA-${buildNumber}`,
    versionName: `v2.0.1-BETA.${buildNumber}`,
    tag: `release-${buildNumber}`,
  };
}

/**
 * Get Git repository info
 */
function getGitRepoInfo() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
    }).trim();

    const match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+)(\.git)?$/);
    if (!match) {
      throw new Error('Could not parse GitHub repository from remote URL');
    }

    return {
      owner: match[1],
      repo: match[2],
      url: remoteUrl,
    };
  } catch (error) {
    console.error('Error getting git repo info:', error.message);
    process.exit(1);
  }
}

/**
 * Main dry-run flow
 */
function main() {
  try {
    console.log('🏃 DRY RUN - LeadLens Release Preview');
    console.log('====================================\n');

    // Parse changelog
    const buildInfo = parseChangelog();
    const repoInfo = getGitRepoInfo();

    console.log('📋 CHANGELOG Parsed:');
    console.log(`   Version: ${buildInfo.version}`);
    console.log(`   Date: ${buildInfo.buildDate}`);
    console.log(`   Version Name: ${buildInfo.versionName}\n`);

    console.log('📊 Repository Info:');
    console.log(`   Owner: ${repoInfo.owner}`);
    console.log(`   Repo: ${repoInfo.repo}`);
    console.log(`   URL: ${repoInfo.url}\n`);

    console.log('📝 Release Notes:');
    console.log(buildInfo.changesText);
    console.log('\n');

    console.log('🚀 What would happen when you run: node release.js\n');
    console.log('1️⃣  BUILD PHASE:');
    console.log('   ➜ eas build --platform android --non-interactive');
    console.log('   ➜ eas build:download --platform android --non-interactive');
    console.log(`   ➜ Output: build/app-release-${buildInfo.buildNumber}.apk\n`);

    console.log('2️⃣  GITHUB RELEASE PHASE:');
    console.log(`   ➜ Create GitHub Release: ${buildInfo.tag}`);
    console.log(`   ➜ Release Name: ${buildInfo.version} - ${buildInfo.buildDate}`);
    console.log(`   ➜ Upload APK to: github.com/${repoInfo.owner}/${repoInfo.repo}/releases`);
    console.log(`   ➜ Release Notes: ${buildInfo.changesText.split('\n')[0]}...\n`);

    console.log('3️⃣  SCARLETT UPDATE PHASE:');
    console.log(`   ➜ SUPABASE_URL: ${process.env.SUPABASE_URL || '(not set)'}`);
    console.log('   ➜ Update app_config table with:');
    console.log(`      - current_build: ${buildInfo.buildNumber}`);
    console.log(`      - version_name: ${buildInfo.versionName}`);
    console.log(`      - apk_url: (GitHub release download URL)`);
    console.log(`      - update_message: (release notes)\n`);

    console.log('4️⃣  GIT PHASE:');
    console.log('   ➜ git add CHANGELOG.md');
    console.log(`   ➜ git commit -m "chore: release ${buildInfo.version} - ${buildInfo.buildDate}"`);
    console.log(`   ➜ git tag -a ${buildInfo.tag} -m "${buildInfo.version} - ${buildInfo.buildDate}"`);
    console.log('   ➜ git push origin main --tags\n');

    console.log('=' * 50);
    console.log('✅ DRY RUN COMPLETE');
    console.log('=' * 50);
    console.log('\nAll systems ready! When you\'re confident, run:\n');
    console.log('   node release.js');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Dry-run failed:', error.message);
    process.exit(1);
  }
}

main();
