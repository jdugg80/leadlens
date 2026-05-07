export type JurisdictionType = 'city' | 'county' | 'state' | 'regional';
export type QueryMethod = 'api' | 'socrata' | 'arcgis' | 'csv' | 'scrape-safe' | 'manual-link';
export type SignalType = 'compliance' | 'opening';

export interface LensSignalSource {
  id: string;
  jurisdictionName: string;
  jurisdictionType: JurisdictionType;
  state: string;
  county?: string;
  city?: string;
  signalTypes: SignalType[];
  sourceName: string;
  sourceUrl: string;
  queryMethod: QueryMethod;
  enabled: boolean;
  refreshDays: number;
  apiConfig?: any;
}

export const LENS_SIGNAL_SOURCES: LensSignalSource[] = [
  {
    id: 'tx-harris-compliance',
    jurisdictionName: 'Harris County',
    jurisdictionType: 'county',
    state: 'TX',
    county: 'Harris',
    signalTypes: ['compliance'],
    sourceName: 'Harris County Public Health',
    sourceUrl: 'https://onlinereports.harriscountytx.gov/public/inspections',
    queryMethod: 'api',
    enabled: true,
    refreshDays: 7,
  },
  {
    id: 'tx-houston-compliance',
    jurisdictionName: 'City of Houston',
    jurisdictionType: 'city',
    state: 'TX',
    county: 'Harris',
    city: 'Houston',
    signalTypes: ['compliance'],
    sourceName: 'Houston Health Department',
    sourceUrl: 'http://houston-tx.healthinspections.us/',
    queryMethod: 'api',
    enabled: true,
    refreshDays: 7,
  },
  {
    id: 'tx-fortbend-compliance',
    jurisdictionName: 'Fort Bend County',
    jurisdictionType: 'county',
    state: 'TX',
    county: 'Fort Bend',
    signalTypes: ['compliance'],
    sourceName: 'Fort Bend Health & Human Services',
    sourceUrl: 'https://www.fortbendcountytx.gov/government/departments/health-and-human-services',
    queryMethod: 'api',
    enabled: true,
    refreshDays: 14,
  },
  {
    id: 'tx-harris-permits',
    jurisdictionName: 'Harris County',
    jurisdictionType: 'county',
    state: 'TX',
    county: 'Harris',
    signalTypes: ['opening'],
    sourceName: 'Harris County Engineering Department',
    sourceUrl: 'https://eng.harriscountytx.gov/',
    queryMethod: 'api',
    enabled: true,
    refreshDays: 3,
  },
  {
    id: 'tx-houston-coo',
    jurisdictionName: 'City of Houston',
    jurisdictionType: 'city',
    state: 'TX',
    county: 'Harris',
    city: 'Houston',
    signalTypes: ['opening'],
    sourceName: 'Houston Permitting Center',
    sourceUrl: 'https://www.houstonpermittingcenter.org/',
    queryMethod: 'api',
    enabled: true,
    refreshDays: 3,
  }
];

export function getSourcesForJurisdiction(params: {
  city?: string;
  county?: string;
  state?: string;
}) {
  return LENS_SIGNAL_SOURCES.filter(source => {
    if (!source.enabled) return false;

    if (source.state !== params.state) return false;

    if (source.jurisdictionType === 'county') {
      return source.county === params.county;
    }

    if (source.jurisdictionType === 'city') {
      return source.city === params.city;
    }

    if (source.jurisdictionType === 'state') {
      return true;
    }

    return false;
  });
}
