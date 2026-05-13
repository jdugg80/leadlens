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

export function getTerritoryActivityColors(activityLevel) {
  const level = normalizeActivityLevel(activityLevel);

  switch (level) {
    case 'high':
      return {
        level,
        fillColor: 'rgba(255, 48, 96, 0.36)',
        strokeColor: 'rgba(255, 48, 96, 0.88)',
        label: 'High Activity',
      };

    case 'medium':
      return {
        level,
        fillColor: 'rgba(255, 180, 40, 0.30)',
        strokeColor: 'rgba(255, 180, 40, 0.82)',
        label: 'Medium Activity',
      };

    case 'low':
      return {
        level,
        fillColor: 'rgba(0, 180, 255, 0.24)',
        strokeColor: 'rgba(0, 180, 255, 0.76)',
        label: 'Low Activity',
      };

    default:
      return {
        level: 'none',
        fillColor: 'rgba(255, 255, 255, 0.065)',
        strokeColor: 'rgba(255, 255, 255, 0.22)',
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
