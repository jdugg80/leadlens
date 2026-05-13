import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';

const TARGET_SIZES = {
  small: { width: 120, height: 90, label: 'Small' },
  medium: { width: 180, height: 130, label: 'Medium' },
  large: { width: 260, height: 180, label: 'Large' },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function LeadLockTargetOverlay({
  targetBox,
  targetSize = 'medium',
  onTargetBoxChange,
  onTargetSizeChange,
  onClearTarget,
}) {
  const [layout, setLayout] = useState(null);
  const size = TARGET_SIZES[targetSize] || TARGET_SIZES.medium;

  const handlePress = (event) => {
    if (!layout?.width || !layout?.height) return;

    const { locationX, locationY } = event.nativeEvent;
    const width = Math.min(size.width, layout.width - 24);
    const height = Math.min(size.height, layout.height - 200);
    const x = clamp(locationX - width / 2, 12, layout.width - width - 12);
    const y = clamp(locationY - height / 2, 110, layout.height - height - 160);

    const box = {
      x,
      y,
      width,
      height,
      previewWidth: layout.width,
      previewHeight: layout.height,
      normalizedX: x / layout.width,
      normalizedY: y / layout.height,
      normalizedWidth: width / layout.width,
      normalizedHeight: height / layout.height,
      normalizedCenterX: (x + width / 2) / layout.width,
      normalizedCenterY: (y + height / 2) / layout.height,
      targetSize,
    };

    onTargetBoxChange?.(box);
  };

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setLayout(event.nativeEvent.layout)}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={handlePress}>
        {!!targetBox && (
          <View
            pointerEvents="none"
            style={[
              s.targetBox,
              {
                left: targetBox.x,
                top: targetBox.y,
                width: targetBox.width,
                height: targetBox.height,
              },
            ]}
          >
            <Text style={s.targetLabel}>TARGET LOCKED</Text>
            <View style={s.cornerTL} />
            <View style={s.cornerTR} />
            <View style={s.cornerBL} />
            <View style={s.cornerBR} />
          </View>
        )}
      </Pressable>

      <View pointerEvents="box-none" style={s.controlsWrap}>
        <View style={s.sizeRow}>
          {Object.entries(TARGET_SIZES).map(([key, item]) => (
            <TouchableOpacity
              key={key}
              style={[s.sizeBtn, targetSize === key && s.sizeBtnActive]}
              onPress={() => onTargetSizeChange?.(key)}
            >
              <Text style={[s.sizeText, targetSize === key && s.sizeTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          {!!targetBox && (
            <TouchableOpacity style={s.clearBtn} onPress={onClearTarget}>
              <Text style={s.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.helperText}>Tap storefront, sign, suite #, or card to lock target</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  targetBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00E5A0',
    borderRadius: 14,
    backgroundColor: 'rgba(0,229,160,0.09)',
    shadowColor: '#00E5A0',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  targetLabel: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    color: '#00E5A0',
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cornerTL: { position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#fff' },
  cornerTR: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#fff' },
  cornerBL: { position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#fff' },
  cornerBR: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#fff' },
  controlsWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 158,
    alignItems: 'center',
  },
  sizeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sizeBtnActive: {
    backgroundColor: 'rgba(0,229,160,0.18)',
    borderColor: '#00E5A0',
  },
  sizeText: { color: 'rgba(255,255,255,0.76)', fontSize: 11, fontWeight: '800' },
  sizeTextActive: { color: '#00E5A0' },
  clearBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,107,43,0.18)',
    borderWidth: 1,
    borderColor: '#FF6B2B',
  },
  clearText: { color: '#FFB38A', fontSize: 11, fontWeight: '900' },
  helperText: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    marginTop: 7,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
