import { AlertLevel } from './lenssignalTypes';

export const getAlertColor = (level: AlertLevel): string => {
  switch (level) {
    case 'red':
    case 'Priority Review':
      return '#ef4444';
    case 'yellow':
    case 'Warning':
      return '#f59e0b';
    case 'green':
    case 'Good Standing':
    case 'Opportunity':
      return '#10b981';
    default:
      return '#6b7280';
  }
};

export const getSignalIcon = (layer: string): string => {
  return layer === 'Opening Signal' ? '✨' : '📡';
};
