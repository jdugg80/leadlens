/**
 * LeadLens Hotfix: LeadLock Orbit Dots Fallback (Replaces Border Arcs)
 *
 * Two attempts at the "dual orbit arcs" look (per-side border colors +
 * borderRadius, rotated) rendered fully blank on device, with and without
 * useNativeDriver. That combination — mixed border-side colors with
 * borderRadius — has a long history of unreliable rendering on Android
 * across RN versions, independent of native vs JS driver.
 *
 * This patch replaces that technique entirely: instead of rotating a
 * colored-arc ring, it rotates a small SOLID dot around a plain,
 * uniform-color static ring (same color on all sides — no per-side
 * border trick). Visually still two elements orbiting in opposite
 * directions at different speeds; the underlying components (plain
 * filled circles, uniform-color rings) are a much safer Android render
 * path.
 *
 * Must run AFTER fix-leadlock-orbit-arc-native-driver.js has already
 * been applied (targets the JSX/styles that exist at that point and
 * removes the arc styles entirely).
 *
 * Usage:
 *   node fix-leadlock-orbit-dots-fallback.js --dry-run
 *   node fix-leadlock-orbit-dots-fallback.js
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
  console.log('  LeadLens Hotfix: LeadLock Orbit Dots Fallback (Replaces Border Arcs)');
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

  const alreadyFullyApplied = content.includes('zipOrbitDotA') && content.includes('zipOrbitRingOuter:');

  if (!alreadyFullyApplied && !content.includes('zipOrbitArcOuter')) {
    console.log('  \u274c This file does not have the orbit arcs patch applied yet.');
    console.log('  Run fix-leadlock-orbit-arc-native-driver.js first, then run this script.');
    process.exitCode = 1;
    return;
  }

  const patches = [
    {
      name: 'Replace arc JSX with orbiting-dot JSX',
      alreadyApplied: () => content.includes('zipOrbitDotA'),
      find: `                  <View style={s.zipOrbitWrap}>
                    <Animated.View
                      style={[
                        s.zipOrbitArcOuter,
                        {
                          transform: [{
                            rotate: zipArcAAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                          }],
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        s.zipOrbitArcInner,
                        {
                          transform: [{
                            rotate: zipArcBAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }),
                          }],
                        },
                      ]}
                    />
                  </View>`,
      replace: `                  <View style={s.zipOrbitWrap}>
                    <View style={s.zipOrbitRingOuter} />
                    <View style={s.zipOrbitRingInner} />
                    <Animated.View
                      style={[
                        s.zipOrbitSpinOuter,
                        {
                          transform: [{
                            rotate: zipArcAAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                          }],
                        },
                      ]}
                    >
                      <View style={s.zipOrbitDotA} />
                    </Animated.View>
                    <Animated.View
                      style={[
                        s.zipOrbitSpinInner,
                        {
                          transform: [{
                            rotate: zipArcBAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }),
                          }],
                        },
                      ]}
                    >
                      <View style={s.zipOrbitDotB} />
                    </Animated.View>
                  </View>`,
    },
    {
      name: 'Replace arc styles with ring + orbiting-dot styles',
      alreadyApplied: () => content.includes('zipOrbitDotA:'),
      find: `  zipOrbitArcOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: COLORS_THEME.accent,
    borderRightColor: COLORS_THEME.accent,
  },
  zipOrbitArcInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: 'transparent',
    borderBottomColor: COLORS_THEME.purple,
    borderLeftColor: COLORS_THEME.purple,
  },`,
      replace: `  zipOrbitRingOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(0,201,255,0.25)',
  },
  zipOrbitRingInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(123,63,190,0.3)',
  },
  zipOrbitSpinOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
  },
  zipOrbitSpinInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    alignItems: 'center',
  },
  zipOrbitDotA: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS_THEME.accent,
    marginTop: -1,
  },
  zipOrbitDotB: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS_THEME.purple,
    marginTop: -1,
  },`,
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
