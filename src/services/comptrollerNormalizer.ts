export type NormalizedComptrollerBusiness = {
  source: "texas_comptroller";
  signalType: string;
  taxpayerId?: string;
  locationNumber?: string;
  businessName?: string;
  locationName?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  permitStartDate?: string;
  permitEndDate?: string;
  permitStatus?: string;
  latitude?: number;
  longitude?: number;
  badge?: string;
  priority?: "low" | "medium" | "high";
  rawPayload: unknown;
};

export function normalizeComptrollerRecord(
  raw: any,
  mode: string
): NormalizedComptrollerBusiness {
  const permitStartDate = raw.PERMIT_START_DT || null;

  let badge = "Active Sales Tax Permit";
  let priority: "low" | "medium" | "high" = "low";

  if (permitStartDate) {
    const start = new Date(permitStartDate);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= 30) {
      badge = "Opening Signal";
      priority = "high";
    } else if (diffDays <= 90) {
      badge = "Recent Sales Tax Permit";
      priority = "medium";
    }
  }

  if (mode.startsWith("franchise")) {
    badge = "Franchise Match";
    priority = "medium";
  }

  return {
    source: "texas_comptroller",
    signalType: mode,
    taxpayerId: raw.TAXPAYER_ID,
    locationNumber: raw.LOCATION_NUMBER,
    businessName: raw.BUSINESS_NAME,
    locationName: raw.LOCATION_NAME,
    street: raw.STREET,
    city: raw.CITY,
    state: raw.STATE,
    zip: raw.ZIPCODE,
    permitStartDate,
    permitEndDate: raw.PERMIT_END_DT,
    permitStatus: raw.STATUS,
    latitude: raw.LATITUDE ? Number(raw.LATITUDE) : undefined,
    longitude: raw.LONGITUDE ? Number(raw.LONGITUDE) : undefined,
    badge,
    priority,
    rawPayload: raw,
  };
}

export function normalizeComptrollerResults(
  data: any
): NormalizedComptrollerBusiness[] {
  if (!data || !data.result) return [];

  const mode = data.mode;
  const results = Array.isArray(data.result) ? data.result : [data.result];

  return results.map((r: any) => normalizeComptrollerRecord(r, mode));
}
