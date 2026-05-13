import { LensSignalRecord, LensSignalAlertLevel } from './lenssignalTypes';
import { storageBridge as AsyncStorage } from '../../utils/storage';
import { TARGET_LENS_PROFILES_KEY } from '../../constants';

export function getAlertColor(alertLevel?: LensSignalAlertLevel | null): string {
  switch (alertLevel) {
    case 'Good Standing':  return '#00E5A0';
    case 'Monitor':        return '#FFC800';
    case 'Opportunity':    return '#FF9500';
    case 'Priority Review': return '#CC1040';
    default:               return '#7B3FBE';
  }
}

// ─── Pest Icon System ─────────────────────────────────────────────────────────
// Maps pest_details / place types to specific pest icons

const RODENT_PATTERNS    = ['warehouse','distribution','storage','logistics','hotel','motel','inn','lodge','suites','rodent','mouse','mice','rat','droppings'];
const INSECT_PATTERNS    = ['restaurant','grill','bbq','cafe','kitchen','food','pizza','burger','taco','sushi','bakery','bar','brewery','grocery','market','convenience','deli','insect','roach','cockroach','fly','flies','pest'];
const BIRD_PATTERNS      = ['rooftop','parking','airport','dock','pier','marina','stadium','arena','bird','pigeon','droppings'];
const SANITATION_PATTERNS = ['hospital','clinic','medical','pharmacy','dental','healthcare','laundry','spa','sanitation','hygiene','dirty'];
const SCHOOL_PATTERNS    = ['school','daycare','academy','childcare','learning','preschool'];

export type PestIconType = 'rodent' | 'insect' | 'bird' | 'sanitation' | 'school' | 'general';

export function getPestIconType(signal: LensSignalRecord): PestIconType {
  const haystack = [
    signal.pest_details || '',
    signal.opening_status || '',
    signal.establishment_name || '',
    signal.signal_layer || '',
    signal.signal_type || '',
  ].join(' ').toLowerCase();

  if (haystack.includes('rodent') || haystack.includes('mouse') || haystack.includes('rat')) return 'rodent';
  if (haystack.includes('insect') || haystack.includes('roach') || haystack.includes('fly')) return 'insect';
  if (haystack.includes('bird') || haystack.includes('pigeon')) return 'bird';

  if (RODENT_PATTERNS.some(p => haystack.includes(p)))    return 'rodent';
  if (INSECT_PATTERNS.some(p => haystack.includes(p)))    return 'insect';
  if (BIRD_PATTERNS.some(p => haystack.includes(p)))      return 'bird';
  if (SANITATION_PATTERNS.some(p => haystack.includes(p))) return 'sanitation';
  if (SCHOOL_PATTERNS.some(p => haystack.includes(p)))    return 'school';
  return 'general';
}

export function getPestEmoji(type: PestIconType): string {
  switch (type) {
    case 'rodent':    return "\uD83D\uDC00";
    case 'insect':    return "\uD83E\uDEB2";
    case 'bird':      return "\uD83D\uDC26";
    case 'sanitation': return "\uD83E\uDDEB";
    case 'school':    return "\uD83C\uDFEB";
    default:          return "\u26A0\uFE0F";
  }
}

export function getSignalEmoji(signal: LensSignalRecord): string {
  const layer = signal.signal_layer || signal.signal_type || '';
  if (layer === 'Opening Signal') return "\uD83C\uDD95";
  if (signal.pest_indicator) return getPestEmoji(getPestIconType(signal));

  // TODO: Add support for active profile emoji once state is available here
  // For now we keep default alert emojis

  switch (signal.alert_level) {
    case 'Priority Review': return "\uD83D\uDD34";
    case 'Opportunity':     return "\uD83D\uDFE0";
    case 'Monitor':         return "\uD83D\uDFE1";
    case 'Good Standing':   return "\uD83D\uDFE2";
    default:                return "\uD83D\uDCCD";
  }
}

export function getSignalMarkerColor(signal: LensSignalRecord): string {
  const layer = signal.signal_layer || signal.signal_type || '';
  if (layer === 'Opening Signal') return '#00C9FF';
  if (signal.pest_indicator) {
    const type = getPestIconType(signal);
    switch (type) {
      case 'rodent':    return '#CC1040';
      case 'insect':    return '#FF6B2B';
      case 'bird':      return '#7B3FBE';
      case 'sanitation': return '#FF9500';
      default:          return '#FFC800';
    }
  }
  return getAlertColor(signal.alert_level);
}
