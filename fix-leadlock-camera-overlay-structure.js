/**
 * LeadLens Hotfix: LeadLock Camera Header/Overlay Rendering Fix
 *
 * Root cause theory: the ZIP overlay (and pre-existing header/footer) were
 * nested as CHILDREN of <CameraView>. Android's native camera view has a
 * known history of misbehaving with complex/overlapping React children
 * (same class of issue documented elsewhere in this project re: Modal +
 * camera conflicts). Symptom reported: header disappears, overlay renders
 * with an empty/blank card, camera feed and shutter remain visible.
 *
 * Fix: move header, ZIP overlay, and footer OUT of CameraView's children
 * and render them as absolutely-positioned siblings stacked on top of a
 * childless CameraView instead. This must run AFTER
 * fix-leadlock-zip-ux.js has already been applied.
 *
 * Usage:
 *   node fix-leadlock-camera-overlay-structure.js --dry-run
 *   node fix-leadlock-camera-overlay-structure.js
 *
 * Safe to re-run — skips if already applied. CRLF-safe (same approach as
 * fix-leadlock-zip-ux.js: normalize to LF for matching, restore CRLF on
 * write if the original file had it).
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
  console.log('  LeadLens Hotfix: LeadLock Camera Header/Overlay Rendering Fix');
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
  let content = raw.replace(/\r\n/g, '\n');

  if (!content.includes('zipOverlayContainer')) {
    console.log('  \u274c This file does not have the ZIP overlay patch applied yet.');
    console.log('  Run fix-leadlock-zip-ux.js first, then run this script.');
    process.exitCode = 1;
    return;
  }

  const patches = [
    {
      name: 'Move header/overlay/footer out of CameraView children (siblings instead)',
      alreadyApplied: () => content.includes('headerAbsolute'),
      find: `        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          zoom={zoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        >
          {/* Header */}
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
      replace: `        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          zoom={zoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        />

        {/* Header \u2014 sibling overlay, not a CameraView child (Android camera
            views can misrender complex nested children) */}
        <View style={[s.header, s.headerAbsolute, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.headerText}>\u2190</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>LeadLock Camera</Text>
          <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
        </View>

        {/* Centered ZIP acquisition overlay \u2014 sibling overlay */}
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

        {/* Capture button \u2014 sibling overlay (footer style is already absolute) */}
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
        </View>`,
    },
    {
      name: 'Add headerAbsolute style',
      alreadyApplied: () => content.includes('headerAbsolute:'),
      find: `  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },`,
      replace: `  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  headerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  console.log('\n  Next: rebuild/reload the app and retest the LeadLock camera screen.');
}

main();
