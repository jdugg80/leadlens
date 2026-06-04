import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

const COLORS_THEME = {
  accent: '#00C9FF',
  accent2: '#CC1040',
  purple: '#7B3FBE',
};

/**
 * CameraBoundingBoxOverlay
 * Displays a centered bounding box with corner guides and grid overlay
 * for camera scanning: business cards, general photos, or storefront photos
 */
export default function CameraBoundingBoxOverlay({
  mode = 'portrait',
  showGrid = true,
  // Legacy static padding (fallback)
  padding = 40,
  // Dynamic props passed from parent's onLayout
  viewWidth = null,
  viewHeight = null,
  paddingHorizontal = null,
  paddingVertical = null,
  cornerLength = 30,
  cornerWidth = 3,
}) {
  const [layout, setLayout] = useState(null);

  // Prefer parent-supplied dimensions; fall back to internal onLayout
  const effectiveLayout = (viewWidth && viewHeight)
    ? { width: viewWidth, height: viewHeight }
    : layout;

  // Resolve padding: prefer explicit H/V props, fall back to uniform padding
  const pH = paddingHorizontal ?? padding;
  const pV = paddingVertical ?? padding;

  const boundingBox = useMemo(() => {
    if (!effectiveLayout) return null;

    let aspectRatio = 3 / 4;
    if (mode === 'landscape') aspectRatio = 16 / 9;
    if (mode === 'square') aspectRatio = 1;

    const maxWidth = effectiveLayout.width - pH * 2;
    const maxHeight = effectiveLayout.height - pV * 2;

    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    const left = (effectiveLayout.width - width) / 2;
    const top = (effectiveLayout.height - height) / 2;

    return { left, top, width, height };
  }, [effectiveLayout, mode, pH, pV]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setLayout(e.nativeEvent.layout)}
    >
      {effectiveLayout && boundingBox && (
        <>
          {/* Dimmed outside areas */}
          <View style={[s.dimArea, { top: 0, left: 0, right: 0, height: boundingBox.top }]} />
          <View style={[s.dimArea, { bottom: 0, left: 0, right: 0, height: effectiveLayout.height - (boundingBox.top + boundingBox.height) }]} />
          <View style={[s.dimArea, { top: boundingBox.top, left: 0, width: boundingBox.left, height: boundingBox.height }]} />
          <View style={[s.dimArea, { top: boundingBox.top, right: 0, width: effectiveLayout.width - (boundingBox.left + boundingBox.width), height: boundingBox.height }]} />

          {/* Main bounding box */}
          <View
            style={[
              s.boundingBox,
              {
                left: boundingBox.left,
                top: boundingBox.top,
                width: boundingBox.width,
                height: boundingBox.height,
              },
            ]}
          >
            {/* Grid overlay */}
            {showGrid && (
              <>
                {/* Vertical grid lines */}
                <View
                  style={[
                    s.gridLine,
                    s.verticalLine,
                    {
                      left: `${33.33}%`,
                    },
                  ]}
                />
                <View
                  style={[
                    s.gridLine,
                    s.verticalLine,
                    {
                      left: `${66.66}%`,
                    },
                  ]}
                />

                {/* Horizontal grid lines */}
                <View
                  style={[
                    s.gridLine,
                    s.horizontalLine,
                    {
                      top: `${33.33}%`,
                    },
                  ]}
                />
                <View
                  style={[
                    s.gridLine,
                    s.horizontalLine,
                    {
                      top: `${66.66}%`,
                    },
                  ]}
                />
              </>
            )}

            {/* Corner indicators - Top Left */}
            <View
              style={[
                s.cornerBracket,
                {
                  top: 0,
                  left: 0,
                  borderTopColor: COLORS_THEME.accent,
                  borderLeftColor: COLORS_THEME.accent,
                  borderTopWidth: cornerWidth,
                  borderLeftWidth: cornerWidth,
                  width: cornerLength,
                  height: cornerLength,
                },
              ]}
            />

            {/* Corner indicators - Top Right */}
            <View
              style={[
                s.cornerBracket,
                {
                  top: 0,
                  right: 0,
                  borderTopColor: COLORS_THEME.accent,
                  borderRightColor: COLORS_THEME.accent,
                  borderTopWidth: cornerWidth,
                  borderRightWidth: cornerWidth,
                  width: cornerLength,
                  height: cornerLength,
                },
              ]}
            />

            {/* Corner indicators - Bottom Left */}
            <View
              style={[
                s.cornerBracket,
                {
                  bottom: 0,
                  left: 0,
                  borderBottomColor: COLORS_THEME.accent,
                  borderLeftColor: COLORS_THEME.accent,
                  borderBottomWidth: cornerWidth,
                  borderLeftWidth: cornerWidth,
                  width: cornerLength,
                  height: cornerLength,
                },
              ]}
            />

            {/* Corner indicators - Bottom Right */}
            <View
              style={[
                s.cornerBracket,
                {
                  bottom: 0,
                  right: 0,
                  borderBottomColor: COLORS_THEME.accent,
                  borderRightColor: COLORS_THEME.accent,
                  borderBottomWidth: cornerWidth,
                  borderRightWidth: cornerWidth,
                  width: cornerLength,
                  height: cornerLength,
                },
              ]}
            />

            {/* Center crosshair */}
            <View style={s.centerCrosshair}>
              <View style={[s.crosshairLine, s.horizontalCrosshair]} />
              <View style={[s.crosshairLine, s.verticalCrosshair]} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  dimArea: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00C9FF',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 201, 255, 0.2)',
  },
  verticalLine: {
    width: 1,
    height: '100%',
  },
  horizontalLine: {
    height: 1,
    width: '100%',
  },
  centerCrosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 30,
    height: 30,
    marginTop: -15,
    marginLeft: -15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crosshairLine: {
    position: 'absolute',
    backgroundColor: '#00C9FF',
  },
  horizontalCrosshair: {
    width: 20,
    height: 1,
  },
  verticalCrosshair: {
    width: 1,
    height: 20,
  },
});
