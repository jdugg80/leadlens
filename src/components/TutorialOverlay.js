import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Animated, Dimensions,
} from 'react-native';
import { COLORS } from '../constants';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Step shape ─────────────────────────────────────────────────────
// {
//   title:    string
//   body:     string
//   region:   { top, left, width, height } — all as 0-1 fractions of screen
//   arrow:    'up' | 'down' | 'none'
// }

export default function TutorialOverlay({ visible, steps, onDone }) {
  const [stepIdx, setStepIdx] = useState(0);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const step = steps?.[stepIdx];
  const isLast = stepIdx === (steps?.length ?? 1) - 1;

  // Fade in on open
  useEffect(() => {
    if (visible) {
      setStepIdx(0);
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const advanceStep = () => {
    if (isLast) {
      onDone?.();
      return;
    }
    // Animate step transition
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -12, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start(() => setStepIdx(i => i + 1));
  };

  if (!step) return null;

  // Compute highlight region in absolute pixels
  const reg = step.region || { top: 0.3, left: 0.05, width: 0.9, height: 0.2 };
  const hilTop    = reg.top    * SH;
  const hilLeft   = reg.left   * SW;
  const hilWidth  = reg.width  * SW;
  const hilHeight = reg.height * SH;
  const hilBottom = hilTop + hilHeight;

  // Tooltip goes above or below highlight
  const tooltipAbove = step.arrow === 'down' || hilBottom > SH * 0.7;
  const tooltipTop   = tooltipAbove ? hilTop - 160 : hilBottom + 16;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDone}>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>

        {/* Dark backdrop — 4 rectangles around the highlight */}
        {/* Top */}
        <View style={[s.shade, { top: 0, left: 0, right: 0, height: hilTop }]} />
        {/* Bottom */}
        <View style={[s.shade, { top: hilBottom, left: 0, right: 0, bottom: 0 }]} />
        {/* Left */}
        <View style={[s.shade, { top: hilTop, left: 0, width: hilLeft, height: hilHeight }]} />
        {/* Right */}
        <View style={[s.shade, { top: hilTop, left: hilLeft + hilWidth, right: 0, height: hilHeight }]} />

        {/* Highlight ring */}
        <View style={[s.highlight, {
          top:    hilTop    - 6,
          left:   hilLeft   - 6,
          width:  hilWidth  + 12,
          height: hilHeight + 12,
        }]} />

        {/* Tooltip card */}
        <Animated.View style={[
          s.tooltip,
          { top: tooltipTop, transform: [{ translateY: slideAnim }] },
        ]}>
          {/* Arrow pointing at highlight */}
          {step.arrow !== 'none' && (
            <View style={[
              s.arrow,
              tooltipAbove ? s.arrowDown : s.arrowUp,
            ]} />
          )}

          {/* Step counter */}
          <View style={s.stepRow}>
            {steps.map((_, i) => (
              <View key={i} style={[s.dot, i === stepIdx && s.dotActive]} />
            ))}
          </View>

          <Text style={s.tipTitle}>{step.title}</Text>
          <Text style={s.tipBody}>{step.body}</Text>

          <View style={s.btnRow}>
            <TouchableOpacity style={s.skipBtn} onPress={onDone}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.nextBtn} onPress={advanceStep}>
              <Text style={s.nextText}>{isLast ? 'Got it ✓' : 'Next →'}</Text>
              {/* Purple/red accent line */}
              <View style={s.nextAccent}>
                <View style={s.nextAccentL} /><View style={s.nextAccentR} />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  shade: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  highlight: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.accent,
    // Glow effect
    shadowColor: COLORS.accent,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  tooltip: {
    position: 'absolute',
    left: SW * 0.05,
    width: SW * 0.9,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  arrow: {
    position: 'absolute',
    left: '50%',
    width: 0, height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowUp: {
    top: -10,
    borderBottomWidth: 10,
    borderBottomColor: COLORS.borderLit,
  },
  arrowDown: {
    bottom: -10,
    borderTopWidth: 10,
    borderTopColor: COLORS.borderLit,
  },
  stepRow: {
    flexDirection: 'row', gap: 5,
    marginBottom: 12,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
    width: 16,
  },
  tipTitle: {
    color: COLORS.text, fontSize: 16,
    fontWeight: '800', marginBottom: 8, letterSpacing: 0.3,
  },
  tipBody: {
    color: COLORS.textDim, fontSize: 13,
    lineHeight: 20, marginBottom: 16,
  },
  btnRow: {
    flexDirection: 'row', gap: 10,
  },
  skipBtn: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.border,
  },
  skipText: { color: COLORS.muted, fontWeight: '600', fontSize: 13 },
  nextBtn: {
    flex: 1, paddingVertical: 10,
    alignItems: 'center', borderRadius: 10,
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.borderLit,
    overflow: 'hidden',
  },
  nextText: { color: COLORS.text, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  nextAccent: {
    position: 'absolute', bottom: 0,
    left: 0, right: 0, height: 2, flexDirection: 'row',
  },
  nextAccentL: { flex: 1, backgroundColor: COLORS.purple },
  nextAccentR: { flex: 1, backgroundColor: COLORS.accent2 },
});
