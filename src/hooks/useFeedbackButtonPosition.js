/**
 * useFeedbackButtonPosition.js
 *
 * Smart positioning hook for a floating action button that:
 * 1. Moves above the keyboard when active (iOS/Android)
 * 2. Avoids overlapping protected UI zones (buttons, interactive elements)
 * 3. Supports drag-to-reposition by the user
 * 4. Auto-resets to the smart default position after 3 seconds of inactivity
 *
 * Uses React Native Animated API for smooth transitions.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  PanResponder,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BUTTON_SIZE = 58;
const EDGE_MARGIN = 16;
const TOP_MARGIN = 60;
const AUTO_RESET_DELAY = 3000;
const DRAG_THRESHOLD = 10;

const CORNERS = {
  topLeft:     { x: EDGE_MARGIN,              y: TOP_MARGIN },
  topRight:    { x: SCREEN_WIDTH - BUTTON_SIZE - EDGE_MARGIN, y: TOP_MARGIN },
  bottomLeft:  { x: EDGE_MARGIN,              y: SCREEN_HEIGHT - BUTTON_SIZE - 90 },
  bottomRight: { x: SCREEN_WIDTH - BUTTON_SIZE - EDGE_MARGIN, y: SCREEN_HEIGHT - BUTTON_SIZE - 90 },
};

const DEFAULT_CORNER = 'bottomRight';

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function findSafeCorner(currentX, currentY, keyboardHeight, protectedZones) {
  const buttonRect = {
    x: currentX,
    y: currentY,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  };

  const availableHeight = SCREEN_HEIGHT - keyboardHeight;
  const candidateCorners = [
    { key: 'topLeft',     ...CORNERS.topLeft },
    { key: 'topRight',    ...CORNERS.topRight },
    { key: 'bottomLeft',  ...CORNERS.bottomLeft },
    { key: 'bottomRight', ...CORNERS.bottomRight },
  ];

  for (const corner of candidateCorners) {
    const testRect = { x: corner.x, y: corner.y, width: BUTTON_SIZE, height: BUTTON_SIZE };

    if (testRect.y + testRect.height > availableHeight) continue;

    const overlaps = protectedZones.some(zone => rectsOverlap(testRect, zone));
    if (!overlaps) return corner;
  }

  const fallback = keyboardHeight > 0 ? candidateCorners[0] : candidateCorners.find(c => c.key === DEFAULT_CORNER);
  return fallback;
}

function getCurrentCorner(x, y) {
  if (x < SCREEN_WIDTH / 2) {
    return y < SCREEN_HEIGHT / 2 ? 'topLeft' : 'bottomLeft';
  }
  return y < SCREEN_HEIGHT / 2 ? 'topRight' : 'bottomRight';
}

export default function useFeedbackButtonPosition({ protectedZones = [], buttonSize = BUTTON_SIZE } = {}) {
  const posAnim = useRef(new Animated.ValueXY({
    x: CORNERS[DEFAULT_CORNER].x,
    y: CORNERS[DEFAULT_CORNER].y,
  })).current;

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const currentPos = useRef({ x: CORNERS[DEFAULT_CORNER].x, y: CORNERS[DEFAULT_CORNER].y });
  const resetTimer = useRef(null);
  const isResetting = useRef(false);

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  const startResetTimer = useCallback(() => {
    clearResetTimer();
    resetTimer.current = setTimeout(() => {
      if (!isDragging && !isResetting.current) {
        repositionToSmartDefault();
      }
    }, AUTO_RESET_DELAY);
  }, [clearResetTimer, isDragging]);

  const repositionToSmartDefault = useCallback(() => {
    const safe = findSafeCorner(currentPos.current.x, currentPos.current.y, keyboardHeight, protectedZones);
    isResetting.current = true;
    Animated.spring(posAnim, {
      toValue: { x: safe.x, y: safe.y },
      useNativeDriver: false,
      tension: 65,
      friction: 9,
    }).start(() => {
      currentPos.current = { x: safe.x, y: safe.y };
      isResetting.current = false;
      startResetTimer();
    });
  }, [keyboardHeight, protectedZones, posAnim, startResetTimer]);

  const moveAboveKeyboard = useCallback((kbHeight) => {
    if (kbHeight > 0) {
      const targetY = SCREEN_HEIGHT - kbHeight - buttonSize - 20;
      const targetX = currentPos.current.x;
      const clampedX = Math.max(EDGE_MARGIN, Math.min(SCREEN_WIDTH - buttonSize - EDGE_MARGIN, targetX));
      isResetting.current = true;
      Animated.spring(posAnim, {
        toValue: { x: clampedX, y: targetY },
        useNativeDriver: false,
        tension: 65,
        friction: 9,
      }).start(() => {
        currentPos.current = { x: clampedX, y: targetY };
        isResetting.current = false;
      });
    } else {
      repositionToSmartDefault();
    }
  }, [buttonSize, posAnim, repositionToSmartDefault]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const height = e?.endCoordinates?.height || 0;
      setKeyboardHeight(height);
      moveAboveKeyboard(height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      clearResetTimer();
    };
  }, [moveAboveKeyboard, clearResetTimer]);

  useEffect(() => {
    const xListener = posAnim.x.addListener(({ value }) => {
      currentPos.current.x = value;
    });
    const yListener = posAnim.y.addListener(({ value }) => {
      currentPos.current.y = value;
    });
    return () => {
      posAnim.x.removeListener(xListener);
      posAnim.y.removeListener(yListener);
    };
  }, [posAnim]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > DRAG_THRESHOLD || Math.abs(gestureState.dy) > DRAG_THRESHOLD;
    },
    onPanResponderGrant: () => {
      clearResetTimer();
      setIsDragging(true);
      posAnim.extractOffset();
    },
    onPanResponderMove: (_, gestureState) => {
      let newX = currentPos.current.x + gestureState.dx;
      let newY = currentPos.current.y + gestureState.dy;

      newX = Math.max(EDGE_MARGIN, Math.min(SCREEN_WIDTH - buttonSize - EDGE_MARGIN, newX));
      const maxY = keyboardHeight > 0
        ? SCREEN_HEIGHT - keyboardHeight - buttonSize - 10
        : SCREEN_HEIGHT - buttonSize - 90;
      newY = Math.max(TOP_MARGIN, Math.min(maxY, newY));

      posAnim.setValue({ x: newX, y: newY });
    },
    onPanResponderRelease: (_, gestureState) => {
      setIsDragging(false);
      posAnim.flattenOffset();

      const corner = getCurrentCorner(currentPos.current.x, currentPos.current.y);
      const safe = findSafeCorner(currentPos.current.x, currentPos.current.y, keyboardHeight, protectedZones);

      if (corner !== safe.key) {
        Animated.spring(posAnim, {
          toValue: { x: safe.x, y: safe.y },
          useNativeDriver: false,
          tension: 65,
          friction: 9,
        }).start(() => {
          currentPos.current = { x: safe.x, y: safe.y };
          startResetTimer();
        });
      } else {
        currentPos.current = { x: currentPos.current.x, y: currentPos.current.y };
        startResetTimer();
      }
    },
  }), [posAnim, buttonSize, keyboardHeight, protectedZones, clearResetTimer, startResetTimer]);

  return {
    position: posAnim,
    panHandlers: panResponder.panHandlers,
    isDragging,
    keyboardHeight,
    repositionToSmartDefault,
  };
}
