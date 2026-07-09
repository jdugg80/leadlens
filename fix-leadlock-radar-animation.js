/**
 * LeadLens Hotfix: LeadLock Dual Orbit Arcs Animation
 *
 * Replaces the pulsing dot + default ActivityIndicator spinner in the ZIP
 * acquisition overlay with a custom "dual orbit arcs" animation — two arcs
 * (cyan accent, purple secondary) rotating in opposite directions at
 * different speeds, built with plain Animated + border-color tricks
 * (no new dependencies, no native module changes, OTA-safe).
 *
 * Must run AFTER fix-leadlock-zip-ux.js and
 * fix-leadlock-camera-overlay-structure.js have already been applied.
 *
 * Usage:
 *   node fix-leadlock-radar-animation.js --dry-run
 *   node fix-leadlock-radar-animation.js
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
  console.log('  LeadLens Hotfix: LeadLock Dual Orbit Arcs Animation');
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
      name: 'Replace zipPulseAnim with dual arc animated values',
      alreadyApplied: () => content.includes('zipArcAAnim'),
      find: `  const [zipTimedOut, setZipTimedOut] = useState(false);
  const zipPulseAnim = useRef(new Animated.Value(1)).current;
  const prevHasZipRef = useRef(false);`,
      replace: `  const [zipTimedOut, setZipTimedOut] = useState(false);
  const zipArcAAnim = useRef(new Animated.Value(0)).current;
  const zipArcBAnim = useRef(new Animated.Value(0)).current;
  const prevHasZipRef = useRef(false);`,
    },
    {
      name: 'Replace pulse effect with dual arc rotation loops',
      alreadyApplied: () => content.includes('Dual orbit arcs while ZIP is being acquired'),
      find: `  // Pulse animation while ZIP is being acquired
  useEffect(() => {
    if (location?.zip) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zipPulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(zipPulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [location?.zip]);`,
      replace: `  // Dual orbit arcs while ZIP is being acquired
  useEffect(() => {
    if (location?.zip) return;
    zipArcAAnim.setValue(0);
    zipArcBAnim.setValue(0);
    const loopA = Animated.loop(
      Animated.timing(zipArcAAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    const loopB = Animated.loop(
      Animated.timing(zipArcBAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true })
    );
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [location?.zip]);`,
    },
    {
      name: 'Add Easing import',
      alreadyApplied: () => /\bEasing,/.test(content.split('from \'react-native\'')[0]),
      find: `  Linking,
  Animated,
} from 'react-native';`,
      replace: `  Linking,
  Animated,
  Easing,
} from 'react-native';`,
    },
    {
      name: 'Swap pulse dot + spinner JSX for dual orbit arcs',
      alreadyApplied: () => content.includes('zipOrbitArcOuter'),
      find: `                <>
                  <Animated.View style={[s.zipPulseDot, { transform: [{ scale: zipPulseAnim }] }]} />
                  <ActivityIndicator size="large" color={COLORS_THEME.accent} style={s.zipOverlaySpinner} />
                  <Text style={s.zipOverlayTitle}>Location Acquisition in Progress</Text>`,
      replace: `                <>
                  <View style={s.zipOrbitWrap}>
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
                  </View>
                  <Text style={s.zipOverlayTitle}>Location Acquisition in Progress</Text>`,
    },
    {
      name: 'Replace zipOverlaySpinner/zipPulseDot styles with orbit arc styles',
      alreadyApplied: () => content.includes('zipOrbitArcOuter:'),
      find: `  zipOverlaySpinner: {
    marginTop: 4,
    marginBottom: 14,
  },
  zipPulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS_THEME.accent,
    marginBottom: 10,
  },`,
      replace: `  zipOrbitWrap: {
    width: 56,
    height: 56,
    marginTop: 4,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zipOrbitArcOuter: {
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
