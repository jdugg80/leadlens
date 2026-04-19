export function withNamePlaceholders(lead) {
  return {
    ...lead,
    pocFirst: String(lead?.pocFirst || '').trim() || '.',
    pocLast: String(lead?.pocLast || '').trim() || '.',
  };
}

export function splitStreetAddress(address = '') {
  const cleaned = String(address).trim();
  if (!cleaned) return { streetNumber: '', streetName: '' };
  const match = cleaned.match(/^(\d+[A-Za-z\-]*)\s+(.*)$/);
  if (!match) return { streetNumber: '', streetName: cleaned };
  return {
    streetNumber: match[1],
    streetName: match[2],
  };
}

export function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
