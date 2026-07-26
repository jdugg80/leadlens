# DIAGNOSIS: Beta Feedback Button Snaps to Top-Left on Release

## Verdict: BROKEN SNAP-TO-CORNER — `findSafeCorner` always returns `topLeft`

The button is **intended** to snap to the nearest corner on release (line 207-223 of `useFeedbackButtonPosition.js`). This is working as coded. The bug is that `findSafeCorner` always evaluates to `topLeft` because it iterates corners in a fixed array order and returns the **first non-overlapping** corner — not the **nearest** to the drop position.

---

## File & Line References

| What | File | Line(s) |
|------|------|---------|
| Drag handler (PanResponder) | `src/hooks/useFeedbackButtonPosition.js` | 181-225 |
| Release / snap logic | `src/hooks/useFeedbackButtonPosition.js` | 203-224 |
| Corner detection | `src/hooks/useFeedbackButtonPosition.js` | `getCurrentCorner` (77-82) |
| Safe corner selection (BUG) | `src/hooks/useFeedbackButtonPosition.js` | `findSafeCorner` (48-75) |
| FAB component | `src/components/BetaFeedbackFAB.js` | 29, 47-58 |

---

## Root Cause

### The snap logic (lines 207-223)

```js
onPanResponderRelease: (_, gestureState) => {
  posAnim.flattenOffset();
  const corner = getCurrentCorner(currentPos.current.x, currentPos.current.y);
  const safe = findSafeCorner(currentPos.current.x, currentPos.current.y, keyboardHeight, protectedZones);
  if (corner !== safe.key) {
    // Animate to safe corner
  }
}
```

This is a snap-to-nearest-corner feature. The user drags, on release the code determines which corner the button is closest to (`getCurrentCorner`), then finds the "safe" corner (`findSafeCorner`). If they differ, it springs to the safe corner.

### The bug: `findSafeCorner` (lines 48-75)

```js
function findSafeCorner(currentX, currentY, keyboardHeight, protectedZones) {
  const candidateCorners = [
    { key: 'topLeft',     ...CORNERS.topLeft },      // ← checked FIRST
    { key: 'topRight',    ...CORNERS.topRight },
    { key: 'bottomLeft',  ...CORNERS.bottomLeft },
    { key: 'bottomRight', ...CORNERS.bottomRight },
  ];
  for (const corner of candidateCorners) {
    // height check...
    const overlaps = protectedZones.some(zone => rectsOverlap(testRect, zone));
    if (!overlaps) return corner;  // ← returns FIRST non-overlapping corner
  }
}
```

Two compounding problems:

1. **`protectedZones` is always `[]`** — `BetaFeedbackFAB.js:29` calls `useFeedbackButtonPosition()` with no arguments, so `protectedZones` defaults to `[]` (line 84). `protectedZones.some(...)` always returns `false`. No corner is ever rejected for overlap.

2. **Fixed iteration order, first-match wins** — The loop always checks `topLeft` first. With no overlap rejections, `topLeft` always passes both the height check and the overlap check. The function always returns `topLeft` regardless of `currentX`/`currentY`.

### The result

No matter where the user drags the button:
- `getCurrentCorner` correctly identifies the actual nearest corner (e.g., `bottomRight`)
- `findSafeCorner` always returns `topLeft`
- `corner !== safe.key` is always `true` (unless the button happens to already be in `topLeft`)
- The button springs to `topLeft`

---

## Why "instantly" on release

The spring animation (lines 211-219) uses `tension: 65, friction: 9`, which is fast but not instant. However, the user perceives it as instant because:
1. The button was just at the drop position
2. It immediately starts moving to `topLeft` (far away from most drop positions)
3. The spring tension is high enough that the travel completes in ~200-300ms

The "instant snap" is the intended spring behavior — it's working correctly, just targeting the wrong corner.

---

## Recommended Fix Approach

**Option A (minimal):** Change `findSafeCorner` to return the nearest corner to the drop position instead of the first non-overlapping corner. Replace the fixed-order loop with a distance-sorted evaluation:

```js
function findSafeCorner(currentX, currentY, keyboardHeight, protectedZones) {
  const availableHeight = SCREEN_HEIGHT - keyboardHeight;
  const candidates = Object.entries(CORNERS)
    .map(([key, pos]) => ({ key, ...pos }))
    .filter(c => c.y + BUTTON_SIZE <= availableHeight)
    .filter(c => !protectedZones.some(z => rectsOverlap(
      { x: c.x, y: c.y, width: BUTTON_SIZE, height: BUTTON_SIZE }, z
    )));
  
  if (candidates.length === 0) return CORNERS[DEFAULT_CORNER];
  
  // Pick the candidate closest to the drop position
  return candidates.reduce((best, c) => {
    const dist = Math.hypot(c.x - currentX, c.y - currentY);
    const bestDist = Math.hypot(best.x - currentX, best.y - currentY);
    return dist < bestDist ? c : best;
  });
}
```

**Option B (simpler, if snap-to-corner is unwanted):** Remove the snap logic entirely from `onPanResponderRelease`. Just keep the button where it was dropped, start the reset timer, and let the 3-second auto-reset handle repositioning. This eliminates the snap behavior without touching `findSafeCorner`.

Option A preserves the intended snap-to-nearest-corner UX. Option B is simpler if the snap behavior isn't valued.
