/**
 * LeadLens Hotfix: LeadLock Orbit Arc Native Driver Fix
 *
 * The dual orbit arcs (added by fix-leadlock-radar-animation.js) were
 * invisible for the full ~5s acquisition window on device. Likely cause:
 * this project runs with newArchEnabled=false (old React Native
 * architecture on Android), which has a documented rendering bug where a
 * view combining borderRadius (used here for the circular arc shape) with
 * a useNativeDriver:true rotation can fail to render entirely, rather
 * than just glitching visually.
 *
 * Fix: switch the two arc rotation animations to run on the JS thread
 * (useNativeDriver: false) instead of the native thread. Negligible
 * performance cost for a small decorative spinner; avoids the native
 * rendering bug outright.
 *
 * Must run AFTER fix-leadlock-radar-animation.js has already been applied.
 *
 * Usage:
 *   node fix-leadlock-orbit-arc-native-driver.js --dry-run
 *   node fix-leadlock-orbit-arc-native-driver.js
 *
 * Safe to re-run — skips if already applied. CRLF-safe.
 */

const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(process.cwd(), 'src', 'screens', 'LeadLockCameraScreen.js');
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) {
  console.log(msg);
}

function main() {
  console.log('====================================================================');
  console.log('  LeadLens Hotfix: LeadLock Orbit Arc Native Driver Fix');
  console.log('====================================================================\n');

  if (!fs.existsSync(TARGET_FILE)) {
    console.log('  \u274c Target file not found:');
    console.log('     ' + TARGET_FILE);
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(TARGET_FILE, 'utf8');
  const hadCRLF = raw.includes('\r\n');
  let content = raw.replace(/\r\n/g, '\n');

  if (!content.includes('zipArcAAnim') || !content.includes('zipOrbitArcOuter:')) {
    console.log('  \u274c This file does not have the dual orbit arcs animation applied yet.');
    console.log('  Run fix-leadlock-radar-animation.js first, then run this script.');
    process.exitCode = 1;
    return;
  }

  const patches = [
    {
      name: 'Switch outer arc (zipArcAAnim) to JS-driven animation',
      alreadyApplied: () => content.includes(`Animated.timing(zipArcAAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false })`),
      find: `Animated.timing(zipArcAAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })`,
      replace: `Animated.timing(zipArcAAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false })`,
    },
    {
      name: 'Switch inner arc (zipArcBAnim) to JS-driven animation',
      alreadyApplied: () => content.includes(`Animated.timing(zipArcBAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: false })`),
      find: `Animated.timing(zipArcBAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true })`,
      replace: `Animated.timing(zipArcBAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: false })`,
    },
  ];

  let appliedCount = 0;
  let skippedCount = 0;

  for (const patch of patches) {
    if (patch.alreadyApplied()) {
      log(`  \u2713 Already applied \u2014 skipping: ${patch.name}`);
      skippedCount++;
      continue;
    }
    if (!content.includes(patch.find)) {
      log(`  \u26a0 Could not find anchor for: ${patch.name}`);
      log(`    This patch was skipped. File may have changed since this script was written.`);
      continue;
    }
    content = content.replace(patch.find, patch.replace);
    log(`  \u2705 Patched: ${patch.name}`);
    appliedCount++;
  }

  console.log('');
  console.log(`  Summary: ${appliedCount} patch(es) applied, ${skippedCount} already present.`);

  if (appliedCount === 0) {
    console.log('\n  Nothing to do.');
    return;
  }

  const output = hadCRLF ? content.replace(/\n/g, '\r\n') : content;

  if (DRY_RUN) {
    console.log('\n  \u2014 DRY RUN \u2014 no files were written.');
    console.log('  Run again without --dry-run to apply.');
    return;
  }

  const backupPath = TARGET_FILE + '.bak-' + Date.now();
  fs.writeFileSync(backupPath, raw, 'utf8');
  console.log(`\n  \ud83d\udcbe Backup saved: ${backupPath}`);

  fs.writeFileSync(TARGET_FILE, output, 'utf8');
  console.log(`  \u2705 Written: ${TARGET_FILE}`);
  console.log('\n  Next: rebuild/reload the app and check the LeadLock acquisition overlay.');
}

main();
