/**
 * dateFormatter.js
 * Centralized date and time formatting utilities for LeadLens.
 * All time displays use 12-hour format with AM/PM.
 */

/**
 * Formats a date/timestamp into 12-hour time string with AM/PM.
 * e.g. "2:35 PM"
 *
 * @param {Date|string|number} date - A Date object, ISO string, or Unix ms timestamp.
 * @returns {string} Formatted time string in 12-hour format.
 */
export function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a date/timestamp into a short date string.
 * e.g. "Jan 5, 2025"
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a date/timestamp into a combined date + 12-hour time string.
 * e.g. "Jan 5, 2025 at 2:35 PM"
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const datePart = formatDate(d);
  const timePart = formatTime(d);
  return `${datePart} at ${timePart}`;
}

/**
 * Returns a relative time label ("Today", "Yesterday", or formatted date)
 * combined with the 12-hour time.
 * e.g. "Today at 2:35 PM"
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatRelativeDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const timePart = formatTime(d);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (d >= startOfToday) {
    return `Today at ${timePart}`;
  } else if (d >= startOfYesterday) {
    return `Yesterday at ${timePart}`;
  } else {
    return `${formatDate(d)} at ${timePart}`;
  }
}

/**
 * Formats only hours and minutes in 12-hour format without seconds.
 * Alias for formatTime — exposed separately for explicit intent.
 *
 * @param {Date|string|number} date
 * @returns {string} e.g. "9:05 AM"
 */
export function formatTimeShort(date) {
  return formatTime(date);
}
