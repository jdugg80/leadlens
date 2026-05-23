import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, Animated } from 'react-native';
import { COLORS } from '../constants';

const ASPECT_RATIO = 3 / 4;

export const TAG_TYPES = [
  { id: 'business_name', label: 'Name', icon: '🏢' },
  { id: 'business_sign', label: 'Sign', icon: '🪧' },
  { id: 'phone', label: 'Phone', icon: '📞' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'address', label: 'Address', icon: '📍' },
  { id: 'contact_name', label: 'Contact', icon: '👤' },
  { id: 'suite_or_door_number', label: 'Suite', icon: '#️⃣' },
  { id: 'business_card', label: 'Card', icon: '📇' },
  { id: 'window_decal', label: 'Decal', icon: '🖼️' },
  { id: 'license_or_permit', label: 'Permit', icon: '📜' },
];

export default function LeadLockCameraOverlay({
  tags = [],
  onAddTag,
  onRemoveTag,
  activeTagType,
  onTagTypeChange,
  onWindowLayout,
}) {
  const [layout, setLayout] = useState(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastVisible, setToastVisible] = useState(false);

  const windowBox = useMemo(() => {
    if (!layout) return null;
    const w = Math.min(layout.width * 0.85, layout.height * 0.6);
    const h = w / ASPECT_RATIO;
    const box = {
      width: w,
      height: h,
      left: (layout.width - w) / 2,
      top: (layout.height - h) / 2,
      previewWidth: layout.width,
      previewHeight: layout.height,
    };

    // Notify parent
    setTimeout(() => {
      onWindowLayout?.({
        ...box,
        normalizedLeft: box.left / layout.width,
        normalizedTop: box.top / layout.height,
        normalizedWidth: box.width / layout.width,
        normalizedHeight: box.height / layout.height,
      });
    }, 0);

    return box;
  }, [layout, onWindowLayout]);

  const showToast = () => {
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const handlePress = (evt) => {
    if (!layout || !windowBox) return;
    const { locationX, locationY } = evt.nativeEvent;

    // Check if press is inside windowBox
    if (
      locationX >= windowBox.left &&
      locationX <= windowBox.left + windowBox.width &&
      locationY >= windowBox.top &&
      locationY <= windowBox.top + windowBox.height
    ) {
      const tagX = locationX - windowBox.left;
      const tagY = locationY - windowBox.top;

      onAddTag({
        id: `tag_${Date.now()}`,
        tagType: activeTagType || 'unknown',
        x: tagX,
        y: tagY,
        normalizedX: tagX / windowBox.width,
        normalizedY: tagY / windowBox.height,
        width: 110,
        height: 70,
        normalizedTo: 'targetWindow',
        createdAt: new Date().toISOString(),
      });
    } else {
      showToast();
    }
  };

  return (
    <View
      style={styles.container}
      onLayout={(e) => setLayout(e.nativeEvent.layout)}
      onStartShouldSetResponder={() => true}
      onResponderRelease={handlePress}
      pointerEvents="box-none"
    >
      {layout && windowBox && (
        <>
          {/* Dimmed background outside window */}
          <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: windowBox.top }]} />
          <View pointerEvents="none" style={[styles.dim, { bottom: 0, left: 0, right: 0, height: layout.height - (windowBox.top + windowBox.height) }]} />
          <View pointerEvents="none" style={[styles.dim, { top: windowBox.top, left: 0, width: windowBox.left, height: windowBox.height }]} />
          <View pointerEvents="none" style={[styles.dim, { top: windowBox.top, right: 0, width: layout.width - (windowBox.left + windowBox.width), height: windowBox.height }]} />

          {/* Targeting Window */}
          <View style={[styles.window, windowBox]} pointerEvents="none">
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />

            <View style={styles.centerGuide}>
              <View style={styles.hLine} />
              <View style={styles.vLine} />
            </View>

            <Text style={styles.windowLabel}>3:4 SCAN WINDOW</Text>
          </View>

          {/* Tags */}
          {tags.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.tag,
                {
                  left: windowBox.left + tag.x - tag.width / 2,
                  top: windowBox.top + tag.y - tag.height / 2,
                  width: tag.width,
                  height: tag.height,
                },
              ]}
              onPress={() => onRemoveTag(tag.id)}
            >
              <View style={styles.tagContent}>
                <Text style={styles.tagIcon}>
                  {TAG_TYPES.find(t => t.id === tag.tagType)?.icon || '❓'}
                </Text>
                <Text style={styles.tagLabel}>
                  {TAG_TYPES.find(t => t.id === tag.tagType)?.label || 'Unknown'}
                </Text>
              </View>
              <View style={styles.tagClose}>
                <Text style={styles.tagCloseText}>✕</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Toast */}
      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastAnim }]}>
          <Text style={styles.toastText}>Place target inside scan window</Text>
        </Animated.View>
      )}

      {/* Tag Type Selector */}
      <View
        style={[
          styles.selectorWrap,
          windowBox ? { top: windowBox.top - 85 } : { top: 110 }
        ]}
        pointerEvents="box-none"
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorContent}>
          {TAG_TYPES.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeBtn, activeTagType === type.id && styles.typeBtnActive]}
              onPress={() => onTagTypeChange(type.id)}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <Text style={[styles.typeLabel, activeTagType === type.id && styles.typeLabelActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  window: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
  },
  windowLabel: {
    position: 'absolute',
    bottom: -24,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: COLORS.accent,
  },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4 },
  centerGuide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.15,
  },
  hLine: { width: 40, height: 1, backgroundColor: '#fff' },
  vLine: { width: 1, height: 40, backgroundColor: '#fff' },
  tag: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.25)',
    borderRadius: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  tagContent: {
    alignItems: 'center',
  },
  tagIcon: { fontSize: 18 },
  tagLabel: { color: '#fff', fontSize: 9, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  tagClose: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#FF3B5C',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  tagCloseText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  selectorWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 70,
    zIndex: 20,
  },
  selectorContent: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    minWidth: 70,
  },
  typeBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.2)',
  },
  typeIcon: { fontSize: 18 },
  typeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', marginTop: 4 },
  typeLabelActive: { color: COLORS.accent },
  toast: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,59,92,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
