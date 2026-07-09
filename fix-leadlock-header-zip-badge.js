/**
 * LeadLens Hotfix: LeadLock Header ZIP Badge Restore
 *
 * Restores a small "ZIP xxxxx" badge in the LeadLock camera header, shown
 * once the ZIP has been resolved — reusing the original zipIndicatorRow/
 * zipIndicatorDot/zipIndicatorText styles that were left in place (but
 * unused) after the centered overlay patch replaced the old corner
 * indicator. Only shows post-acquisition; the centered overlay already
 * communicates the "acquiring" state, so this avoids duplicating that.
 *
 * Must run AFTER fix-leadlock-camera-overlay-structure.js has already
 * been applied (targets the sibling-header JSX it produces).
 *
 * Usage:
 *   node fix-leadlock-header-zip-badge.js --dry-run
 *   node fix-leadlock-header-zip-badge.js
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
  console.log('  LeadLens Hotfix: LeadLock Header ZIP Badge Restore');
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

  if (!content.includes('headerAbsolute')) {
    console.log('  \u274c This file does not have the camera overlay structure fix applied yet.');
    console.log('  Run fix-leadlock-camera-overlay-structure.js first, then run this script.');
    process.exitCode = 1;
    return;
  }

  const patches = [
    {
      name: 'Add ZIP badge back into the header, shown once resolved',
      alreadyApplied: () => content.includes('zipIndicatorRow') && content.includes('<Text style={s.headerSubtitle}>Multi-Business Detection</Text>\n          {location?.zip'),
      find: `          <Text style={s.headerTitle}>LeadLock Camera</Text>
          <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
        </View>`,
      replace: `          <Text style={s.headerTitle}>LeadLock Camera</Text>
          <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
          {location?.zip && (
            <View style={s.zipIndicatorRow}>
              <Text style={[s.zipIndicatorDot, { color: '#51CF66' }]}>\u25cf</Text>
              <Text style={s.zipIndicatorText}>ZIP {location.zip}</Text>
            </View>
          )}
        </View>`,
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
  console.log('\n  Next: rebuild/reload the app and check the LeadLock header once ZIP resolves.');
}

main();
