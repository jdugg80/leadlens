export function normalizeActivityLevel(activityLevel) {
  if (typeof activityLevel === 'number') {
    if (activityLevel >= 67) return 'high';
    if (activityLevel >= 34) return 'medium';
    if (activityLevel > 0) return 'low';
    return 'none';
  }

  const value = String(activityLevel || '').trim().toLowerCase();

  if (['high', 'hot', 'strong', 'heavy', 'busy'].includes(value)) return 'high';
  if (['medium', 'med', 'moderate', 'warm'].includes(value)) return 'medium';
  if (['low', 'light', 'cool'].includes(value)) return 'low';
  if (['none', 'no activity', 'inactive', 'unknown', ''].includes(value)) return 'none';

  return 'none';
}

/**
 * REVERSED HEAT MAP COLORS:
 * - high activity (many prospects) = BLUE/GREEN (cold colors)
 * - medium activity = CYAN/YELLOW
 * - low activity = ORANGE
 * - no activity = RED
 * 
 * This makes sense visually: green = go, red = stop/warning
 */
export function getTerritoryActivityColors(activityLevel) {
  const level = normalizeActivityLevel(activityLevel);

  switch (level) {
    case 'high':
      return {
        level,
        fillColor: 'rgba(34, 197, 94, 0.28)',    // Green fill
        strokeColor: 'rgba(34, 197, 94, 0.85)',  // Green stroke
        label: 'High Activity',
      };

    case 'medium':
      return {
        level,
        fillColor: 'rgba(0, 201, 255, 0.24)',    // Cyan fill
        strokeColor: 'rgba(0, 201, 255, 0.76)',  // Cyan stroke
        label: 'Medium Activity',
      };

    case 'low':
      return {
        level,
        fillColor: 'rgba(255, 140, 0, 0.20)',    // Orange fill
        strokeColor: 'rgba(255, 140, 0, 0.75)',  // Orange stroke
        label: 'Low Activity',
      };

    default:
      return {
        level: 'none',
        fillColor: 'rgba(239, 68, 68, 0.15)',    // Red fill
        strokeColor: 'rgba(239, 68, 68, 0.65)',  // Red stroke
        label: 'No Activity',
      };
  }
}

export function getTerritoryActivityFillColor(activityLevel) {
  return getTerritoryActivityColors(activityLevel).fillColor;
}

export function getTerritoryActivityStrokeColor(activityLevel) {
  return getTerritoryActivityColors(activityLevel).strokeColor;
}

export function getStaticTerritoryPolygonStyle(activityLevel) {
  const colors = getTerritoryActivityColors(activityLevel);

  return {
    fillColor: colors.fillColor,
    strokeColor: colors.strokeColor,
    strokeWidth: colors.level === 'none' ? 1 : 2,
  };
}
