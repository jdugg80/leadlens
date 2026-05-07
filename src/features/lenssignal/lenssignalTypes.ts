export type SignalLayer = 'Compliance Signal' | 'Opening Signal';
export type AlertLevel = 'green' | 'yellow' | 'red' | 'Priority Review' | 'Warning' | 'Good Standing' | 'Opportunity';

export interface LensSignal {
  id: string;
  signal_layer: SignalLayer;
  establishment_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude: number;
  longitude: number;
  score?: number;
  grade?: string;
  violation_text?: string;
  pest_indicator: boolean;
  pest_terms?: string[];
  opening_status?: string;
  permit_type?: string;
  permit_date?: string;
  alert_level: AlertLevel;
  source_name?: string;
  source_record_url?: string;
  distance_miles?: number;
}

export interface UserPreferences {
  enable_compliance_alerts: boolean;
  enable_opening_alerts: boolean;
  min_alert_level: string;
  radius_miles: number;
  preferences: any;
}
