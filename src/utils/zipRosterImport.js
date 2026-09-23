// ─────────────────────────────────────────────────────────────────────
// ZIP ROSTER IMPORT
// Parses a headerless, multi-block roster file where ZIP codes and rep
// first names are arranged in repeating two-column pairs across the
// sheet (a print-layout style export), e.g.:
//
//   77002  John    77034  Tim     77072  Del   ...
//   77003  Tim     77035  Kash    77074  Del   ...
//
// Each (ZIP-column, name-column) pair is detected by content, not by
// header text — this file has no headers at all, and the same shape
// repeats an arbitrary number of times horizontally with blank
// separator columns in between.
// ─────────────────────────────────────────────────────────────────────

/**
 * Normalizes a cell value to a 5-digit ZIP string, or null if it doesn't
 * look like one. Accepts plain 5-digit values and 9-digit ZIP+4 values
 * (collapsed to the first 5).
 */
export function normalizeZipCandidate(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length === 9) return digits.slice(0, 5);
  return null;
}

/**
 * Samples a column across the sheet and decides whether it's predominantly
 * ZIP-shaped data. Requires a minimum sample size and a strong majority
 * match so that a mostly-empty or mixed column isn't misidentified.
 */
function isLikelyZipColumn(aoa, colIndex, sampleSize = 30) {
  let checked = 0;
  let matched = 0;
  for (let r = 0; r < aoa.length && checked < sampleSize; r++) {
    const cell = aoa[r]?.[colIndex];
    if (cell === undefined || cell === null || String(cell).trim() === '') continue;
    checked += 1;
    if (normalizeZipCandidate(cell)) matched += 1;
  }
  return checked >= 3 && matched / checked >= 0.8;
}

/**
 * Walks a raw array-of-arrays sheet (no headers) and extracts every
 * (zip, repName) pair from every detected two-column block, left to
 * right. Blank separator columns naturally fail the ZIP-column test and
 * are skipped. Returns a flat list — order and duplicates preserved;
 * de-duplication happens later against the rep's existing ZIP list.
 */
export function parseZipRosterAOA(aoa) {
  if (!Array.isArray(aoa) || !aoa.length) return [];

  const maxCols = aoa.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const entries = [];
  const usedCols = new Set();

  for (let c = 0; c < maxCols; c++) {
    if (usedCols.has(c)) continue;
    if (!isLikelyZipColumn(aoa, c)) continue;

    const nameCol = c + 1;
    usedCols.add(c);
    usedCols.add(nameCol);

    for (let r = 0; r < aoa.length; r++) {
      const zip = normalizeZipCandidate(aoa[r]?.[c]);
      const repName = String(aoa[r]?.[nameCol] ?? '').trim();
      if (zip && repName) {
        entries.push({ zip, repName });
      }
    }
  }

  return entries;
}

/**
 * Returns the distinct rep names found in the parsed roster, in the
 * order first seen — used to show "did you mean...?" options if the
 * logged-in rep's name doesn't match anything exactly.
 */
export function getDistinctRepNames(entries = []) {
  const seen = new Set();
  const names = [];
  for (const e of entries) {
    const key = e.repName.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      names.push(e.repName.trim());
    }
  }
  return names;
}

/**
 * Matches parsed roster entries against a rep's first name.
 * Tries an exact case-insensitive match first; if nothing matches,
 * falls back to a "starts with" match (handles trailing initials or
 * minor punctuation in the roster) so a near-miss still surfaces
 * something for the confirmation screen rather than silently finding
 * nothing.
 */
export function matchRepZips(entries = [], repFirstName = '') {
  const target = String(repFirstName || '').trim().toLowerCase();
  if (!target) return { matched: [], matchType: 'none' };

  const exact = entries.filter((e) => e.repName.trim().toLowerCase() === target);
  if (exact.length) return { matched: exact, matchType: 'exact' };

  const loose = entries.filter((e) => e.repName.trim().toLowerCase().startsWith(target));
  if (loose.length) return { matched: loose, matchType: 'loose' };

  return { matched: [], matchType: 'none' };
}
