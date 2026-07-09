/**
 * LeadLens Hotfix: LeadLock ZIP Acquisition UX
 *
 * What this does:
 *  1. Blocks photo capture until a ZIP has been resolved (button disabled +
 *     defensive guard in handleTakePhoto, in case disabled is bypassed).
 *  2. Replaces the small corner "Acquiring ZIP..." indicator with a large,
 *     centered overlay card ("Location Acquisition in Progress") with a
 *     pulsing dot + spinner, a brief "Location Confirmed" transition once
 *     resolved, and a manual retry option if resolution stalls past 18s.
 *
 * Usage:
 *   node fix-leadlock-zip-ux.js --dry-run   # preview only, no writes
 *   node fix-leadlock-zip-ux.js             # apply for real (writes .bak first)
 *
 * Safe to re-run: each patch checks whether it's already applied and skips.
 * File uses Windows CRLF line endings — this script normalizes to LF for
 * matching/replacing, then restores CRLF on write if the original had it.
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
  console.log('  LeadLens Hotfix: LeadLock ZIP Acquisition UX');
  console.log('====================================================================\n');

  if (!fs.existsSync(TARGET_FILE)) {
    console.log('  \u274c Target file not found:');
    console.log('     ' + TARGET_FILE);
    console.log('  Make sure you are running this script from the project root.');
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(TARGET_FILE, 'utf8');
  const hadCRLF = raw.includes('\r\n');
  let content = raw.replace(/\r\n/g, '\n'); // normalize for matching

  const patches = [
    {
      name: 'Add Animated import',
      alreadyApplied: () => /\bAnimated,/.test(content.split('from \'react-native\'')[0]),
      find: `import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Image,
  useWindowDimensions,
  Linking,
} from 'react-native';`,
      replace: `import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Image,
  useWindowDimensions,
  Linking,
  Animated,
} from 'react-native';`,
    },
    {
      name: 'Add ZIP UX state',
      alreadyApplied: () => content.includes('zipJustAcquired'),
      find: `  const placesApiHealthCheckedRef = useRef(false);`,
      replace: `  const placesApiHealthCheckedRef = useRef(false);

  // ZIP acquisition UX state (LeadLock centered overlay + capture gating)
  const [zipJustAcquired, setZipJustAcquired] = useState(false);
  const [zipTimedOut, setZipTimedOut] = useState(false);
  const zipPulseAnim = useRef(new Animated.Value(1)).current;
  const prevHasZipRef = useRef(false);
  const zipRetryTickRef = useRef(0);
  const [zipRetryTick, setZipRetryTick] = useState(0);`,
    },
    {
      name: 'Add pulse/confirmation/timeout effects + retry handler',
      alreadyApplied: () => content.includes('handleRetryLocation'),
      find: `  // Request camera permission
  if (!permission) {`,
      replace: `  // Pulse animation while ZIP is being acquired
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
  }, [location?.zip]);

  // Transient "ZIP acquired" confirmation shown once, right after resolution
  useEffect(() => {
    const hasZip = !!location?.zip;
    if (hasZip && !prevHasZipRef.current) {
      setZipJustAcquired(true);
      setZipTimedOut(false);
      const t = setTimeout(() => setZipJustAcquired(false), 1400);
      prevHasZipRef.current = true;
      return () => clearTimeout(t);
    }
    prevHasZipRef.current = hasZip;
  }, [location?.zip]);

  // Timeout fallback if GPS/ZIP resolution stalls (offers manual retry)
  useEffect(() => {
    if (location?.zip) {
      setZipTimedOut(false);
      return;
    }
    const t = setTimeout(() => {
      if (!location?.zip && mountedRef.current) setZipTimedOut(true);
    }, 18000);
    return () => clearTimeout(t);
  }, [location?.zip, zipRetryTick]);

  const handleRetryLocation = () => {
    setZipTimedOut(false);
    zipRetryTickRef.current += 1;
    setZipRetryTick(zipRetryTickRef.current);
    initLocation();
  };

  // Request camera permission
  if (!permission) {`,
    },
    {
      name: 'Guard handleTakePhoto against missing ZIP',
      alreadyApplied: () => content.includes('Still acquiring your location'),
      find: `  const handleTakePhoto = async () => {
    try {
      if (!cameraRef.current) return;

      // Do NOT request base64 directly from raw high-res photo to prevent OOM`,
      replace: `  const handleTakePhoto = async () => {
    try {
      if (!cameraRef.current) return;
      if (!location?.zip) {
        showToast('Still acquiring your location \u2014 please wait a moment.', 'error');
        return;
      }

      // Do NOT request base64 directly from raw high-res photo to prevent OOM`,
    },
    {
      name: 'Replace corner ZIP indicator with centered overlay + gate capture button',
      alreadyApplied: () => content.includes('zipOverlayContainer'),
      find: `          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={s.headerText}>\u2190</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>LeadLock Camera</Text>
            <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
            {/* Zip capture status \u2014 visible before shooting */}
            <View style={s.zipIndicatorRow}>
              <Text style={[s.zipIndicatorDot, { color: location?.zip ? '#51CF66' : '#FFA94D' }]}>\u25cf</Text>
              <Text style={s.zipIndicatorText}>
                {location?.zip ? \`ZIP \${location.zip}\` : 'Acquiring ZIP...'}
              </Text>
            </View>
          </View>

          {/* Capture button */}
          <View style={[s.footer, { bottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={s.captureBtn}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <View style={s.captureBtnInner} />
            </TouchableOpacity>
            <Text style={s.captureLabel}>Tap to Capture</Text>
          </View>
        </CameraView>`,
      replace: `          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={s.headerText}>\u2190</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>LeadLock Camera</Text>
            <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
          </View>

          {/* Centered ZIP acquisition overlay */}
          {(!location?.zip || zipJustAcquired) && (
            <View style={s.zipOverlayContainer} pointerEvents="box-none">
              <View style={s.zipOverlayCard}>
                {location?.zip ? (
                  <>
                    <Text style={s.zipOverlayCheckmark}>\u2713</Text>
                    <Text style={s.zipOverlayTitle}>Location Confirmed</Text>
                    <Text style={s.zipOverlaySubtitle}>ZIP {location.zip} \u2014 ready to capture</Text>
                  </>
                ) : (
                  <>
                    <Animated.View style={[s.zipPulseDot, { transform: [{ scale: zipPulseAnim }] }]} />
                    <ActivityIndicator size="large" color={COLORS_THEME.accent} style={s.zipOverlaySpinner} />
                    <Text style={s.zipOverlayTitle}>Location Acquisition in Progress</Text>
                    <Text style={s.zipOverlaySubtitle}>
                      {zipTimedOut
                        ? 'Taking longer than usual \u2014 check GPS signal'
                        : 'Pinpointing your position for accurate prospect data'}
                    </Text>
                    {zipTimedOut && (
                      <TouchableOpacity style={s.zipRetryBtn} onPress={handleRetryLocation}>
                        <Text style={s.zipRetryBtnText}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>
          )}

          {/* Capture button */}
          <View style={[s.footer, { bottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[s.captureBtn, !location?.zip && s.captureBtnDisabled]}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
              disabled={!location?.zip}
            >
              <View style={s.captureBtnInner} />
            </TouchableOpacity>
            <Text style={s.captureLabel}>
              {location?.zip ? 'Tap to Capture' : 'Waiting for location...'}
            </Text>
          </View>
        </CameraView>`,
    },
    {
      name: 'Add new styles (overlay card, pulse dot, retry button, disabled capture)',
      alreadyApplied: () => content.includes('zipOverlayCard:'),
      find: `  zipIndicatorText: {
    color: COLORS_THEME.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});`,
      replace: `  zipIndicatorText: {
    color: COLORS_THEME.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  zipOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  zipOverlayCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(17,19,24,0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS_THEME.accent,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  zipOverlaySpinner: {
    marginTop: 4,
    marginBottom: 14,
  },
  zipPulseDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS_THEME.accent,
    marginBottom: 10,
  },
  zipOverlayTitle: {
    color: COLORS_THEME.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  zipOverlaySubtitle: {
    color: COLORS_THEME.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  zipOverlayCheckmark: {
    color: '#51CF66',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 6,
  },
  zipRetryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS_THEME.accent,
  },
  zipRetryBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  captureBtnDisabled: {
    opacity: 0.4,
  },
});`,
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
  console.log('\n  Next: rebuild/reload the app and test LeadLock capture with location off/on.');
}

main();
