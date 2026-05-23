export type LensSignalLayer =
  | "Compliance Signal"
  | "Opening Signal"
  | "Standard Discovery";

export type LensSignalAlertLevel =
  | "Good Standing"
  | "Monitor"
  | "Opportunity"
  | "Priority Review";

export type LensSignalRecord = {
  id: string;
  signal_layer?: LensSignalLayer | null;
  signal_type?: LensSignalLayer | null;
  establishment_name: string;
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  score?: number | null;
  grade?: string | null;
  alert_level?: LensSignalAlertLevel | null;
  pest_indicator?: boolean | null;
  pest_details?: string | null;
  opening_status?: string | null;
  source_name?: string | null;
  source_record_url?: string | null;
  distance_miles?: number | null;
  match_confidence?: number | null;
  match_method?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  raw_record?: any | null;
};

export interface UserPreferences {
  enable_compliance_alerts: boolean;
  enable_opening_alerts: boolean;
  min_alert_level: string;
  radius_miles: number;
  preferences: any;
}
