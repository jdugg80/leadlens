import { useState, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, TouchableOpacity } from 'react-native';

const TARGET_SIZES = {
  small: { width: 120, height: 90, label: 'Small' },
  medium: { width: 180, height: 130, label: 'Medium' },
  large: { width: 260, height: 180, label: 'Large' },
  custom: { width: 0, height: 0, label: 'Custom \u25EF' },
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
  const startPoint = useRef(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (!layout) return;
        const { locationX, locationY } = evt.nativeEvent;
        startPoint.current = { x: locationX, y: locationY };

        // If in fixed mode, just place the box immediately
        if (targetSize !== 'custom') {
          handleFixedPress(locationX, locationY);
        }
      },
      onPanResponderMove: (evt) => {
        if (targetSize === 'custom' && layout && startPoint.current) {
          const { locationX, locationY } = evt.nativeEvent;
          handleFreeDraw(locationX, locationY);
        }
      },
      onPanResponderRelease: () => {
        startPoint.current = null;
      },
    })
  ).current;

  const handleFixedPress = (locationX, locationY) => {
    const size = TARGET_SIZES[targetSize] || TARGET_SIZES.medium;
    const width = Math.min(size.width, layout.width - 24);
    const height = Math.min(size.height, layout.height - 200);
    const x = clamp(locationX - width / 2, 12, layout.width - width - 12);
    const y = clamp(locationY - height / 2, 110, layout.height - height - 160);
    updateBox(x, y, width, height, false);
  };

  const handleFreeDraw = (currentX, currentY) => {
    const start = startPoint.current;
    const radius = Math.sqrt(
      Math.pow(currentX - start.x, 2) + Math.pow(currentY - start.y, 2)
    );

    const width = radius * 2;
    const height = radius * 2;
    const x = start.x - radius;
    const y = start.y - radius;

    updateBox(x, y, width, height, true);
  };

  const updateBox = (x, y, width, height, isCircle) => {
    const box = {
      x,
      y,
      width,
      height,
      isCircle,
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
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
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
                borderRadius: targetBox.isCircle ? targetBox.width / 2 : 14,
              },
            ]}
          >
            <Text style={s.targetLabel}>{targetBox.isCircle ? 'CIRCLE LOCK' : 'TARGET LOCKED'}</Text>
            {!targetBox.isCircle && (
              <>
                <View style={s.cornerTL} />
                <View style={s.cornerTR} />
                <View style={s.cornerBL} />
                <View style={s.cornerBR} />
              </>
            )}
            {targetBox.isCircle && (
              <View style={s.centerDot} />
            )}
          </View>
        )}
      </View>

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
        <Text style={s.helperText}>
          {targetSize === 'custom'
            ? 'Drag finger to draw a circle around target'
            : 'Tap storefront, sign, or card to lock target'}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  targetBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00E5A0',
    backgroundColor: 'rgba(0,229,160,0.09)',
    shadowColor: '#00E5A0',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.5,
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
    top: 100, // MOVED TO TOP to avoid zoom window overlap
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
