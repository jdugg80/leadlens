# DIAGNOSIS: TerritoryMapScreen Filter UI — Three Symptoms

## Files

| What | File | Lines |
|------|------|-------|
| FAB stack container | `src/screens/TerritoryMapScreen.js` | 1682-1708 (JSX), 1978-2011 (styles) |
| Filter button | `src/screens/TerritoryMapScreen.js` | 1692-1705 (JSX), 1988-2001 (styles) |
| Filter modal invocation | `src/screens/TerritoryMapScreen.js` | 1890 |
| Filter bottom sheet component | `src/components/LeadFiltersBottomSheet.js` | 1-832 (entire file) |
| Filter option constants | `src/constants/index.js` | 130-147 |

---

## Symptom 1: FAB Stack Mispositioned

**Root cause: Intentional layout, not a bug — but visually asymmetric by design.**

The container `bottomActions` (line 1978) is styled `{ position: 'absolute', right: 16, ... }`. All four buttons share this container, so their **right edges** are aligned at `right: 16`.

The problem is that the filter button (`filterBtn`, lines 1988-1995) is styled as a wide pill:
```js
filterBtn: {
  flexDirection: 'row', alignItems: 'center',
  minHeight: 48, paddingVertical: 10, paddingHorizontal: 14,
  borderRadius: 24, gap: 8,
}
```

While the other three buttons (`actionBtn`, lines 1979-1983) are 44×44 circles:
```js
actionBtn: {
  width: 44, height: 44, borderRadius: 22, ...
}
```

The filter button renders as icon (16px) + gap (8px) + text "Prospect filters" (~100px) + padding (28px) ≈ **152px wide**. The other buttons are **44px wide**. Since all right-align to `right: 16`, the filter button extends ~108px further left than the other buttons, creating the visual impression of misalignment.

**Verdict:** Not a bug. The filter button is intentionally wider than the icon-only buttons. The "shifted left" appearance is the natural consequence of right-aligning a wide element in a column of narrow elements. If this needs correction, the fix would be to either make the filter button icon-only (matching the others) or adjust the container to center-align instead of right-align.

---

## Symptom 2: "Prospect Filters" Button Renders Expanded

**Root cause: Intentional design — this button is always rendered as icon+label.**

The filter button JSX (lines 1692-1705):
```jsx
<TouchableOpacity style={[s.filterBtn, ...]}>
  <Text style={s.filterBtnIcon}>{ICON_GEAR}</Text>
  <Text style={s.filterBtnText}>Prospect filters</Text>
  {activeFilterCount > 0 && <View style={s.filterBadge}>...</View>}
</TouchableOpacity>
```

There is **no collapsed/expanded state**. The button always renders as icon + text label. This is different from the other three buttons in the stack, which are icon-only circles.

This is **not** a copy of the ProspectQueueScreen "Collapsible filter panel toggle" pattern — that screen uses a different component with a toggle state. The TerritoryMapScreen filter button is a static pill by design.

**Verdict:** Intentional. The button is designed to be a labeled pill, not an icon-only circle. If consistency with the other buttons is desired, the fix would be to remove the `<Text>` label and change `filterBtn` styles to match `actionBtn` (44×44 circle). But this is a design decision, not a bug.

---

## Symptom 3: Filter Modal Body Empty (PRIORITY)

**Root cause: UNCERTAIN — likely Android ScrollView rendering issue, NOT a schema mismatch or missing data.**

### What I confirmed:
1. The `LeadFiltersBottomSheet` component (lines 244-652) renders a ScrollView containing **all** filter sections unconditionally: Prospect Type toggle, Prospect Status chips, Distance/Radius, Business Type, Rating, Contact Completeness, Last Activity, Signals, Match Strength, and (in residential mode) Home Value, SqFt, Occupancy, Property Type.

2. The filter option constants (`PROSPECT_STATUS_OPTIONS`, `LEAD_SOURCE_OPTIONS`, `SERVICE_TYPE_OPTIONS`) at `constants/index.js:130-147` are **populated** with real data — not empty arrays.

3. The `filters` prop is passed correctly from TerritoryMapScreen (line 1890): `filters={filters || DEFAULT_FILTERS}`. The `DEFAULT_FILTERS` object (lines 178-204) has all required fields.

4. There is **no conditional rendering** that would hide the filter body. The Prospect Type toggle, Distance/Radius chips, and universal filter sections render regardless of `isBusiness` state.

5. There is **no data fetch** in the filter modal — all data is hardcoded constants and props. No Supabase query, no schema dependency, no `targetlens_permits` reference. This is **not** the previously-reverted schema mismatch issue.

6. There is **no error boundary** or try/catch in the render path that would silently swallow a rendering error.

### Most likely cause:
An **Android-specific ScrollView layout issue** where the ScrollView content doesn't render or is visually clipped. Possible mechanisms:
- The `Animated.View` wrapper with `translateY` interpolation (lines 254-266) combined with `overflow: 'hidden'` on the sheet (line 667) may clip ScrollView content on certain Android versions
- The `maxHeight: '90%'` on the sheet (line 665) combined with `flex: 1` on the ScrollView (line 687) may not properly calculate height on Android when the parent is an `Animated.View` with transform
- A React Native ScrollView rendering regression specific to the Android platform

### What this is NOT:
- NOT a schema mismatch (no database queries in the filter modal)
- NOT a silent data-fetch failure (no fetch calls in the filter modal)
- NOT leftover incomplete rebuild code (the filter body JSX is complete and functional)
- NOT a missing import or undefined constant (all verified populated)

---

## Shared Root Cause?

**No — the three symptoms are independent:**

1. **FAB positioning** → intentional right-align + wide filter button (style issue)
2. **Expanded filter button** → intentional icon+label design (design decision)
3. **Empty filter body** → Android ScrollView rendering issue (platform bug)

Symptoms 1 and 2 are cosmetic/design choices. Symptom 3 is the only functional bug.

---

## Recommended Fix Approach

| Symptom | Scope | Approach |
|---------|-------|----------|
| 1. FAB positioning | Style fix (5 min) | Either: (a) make `filterBtn` icon-only to match others, or (b) accept the asymmetry as intentional |
| 2. Expanded button | Design decision (5 min) | Either: (a) remove text label, make it a 44×44 circle, or (b) leave as-is (intentional pill) |
| 3. Empty modal body | Investigation needed (30-60 min) | Add `console.log` in `LeadFiltersBottomSheet` render to confirm JSX executes; test on multiple Android devices; check if `ScrollView` content renders but is visually clipped by `overflow: 'hidden'` + transform; try replacing `Animated.View` transform with `LayoutAnimation` or removing `overflow: 'hidden'` temporarily to isolate |

**For symptom 3 specifically:** The most productive next step is to add a `console.log('[LeadFiltersBottomSheet] render, sections:', ...)` at the top of the component render function and check Metro logs when the modal opens. If the log fires and shows the expected section count, the issue is purely visual (clipping/layout). If the log doesn't fire, there's a React rendering issue upstream.
