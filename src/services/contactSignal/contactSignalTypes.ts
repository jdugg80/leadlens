export type ContactRoleType =
  | "owner"
  | "registered_agent"
  | "license_holder"
  | "permit_applicant"
  | "operator"
  | "property_owner"
  | "manager"
  | "unknown";

export type ContactSource =
  | "texas_sos"
  | "county_dba"
  | "tabc"
  | "health_permit"
  | "certificate_of_occupancy"
  | "building_permit"
  | "property_record"
  | "business_website"
  | "manual";

export type ContactConfidence = "verified" | "strong" | "possible" | "weak";

export type EnrichedContact = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  roleType: ContactRoleType;
  companyName?: string;
  phone?: string;
  email?: string;
  mailingAddress?: string;
  source: ContactSource;
  sourceUrl?: string;
  sourceRecordId?: string;
  confidence: ContactConfidence;
  matchedBy: {
    nameMatch: boolean;
    addressMatch: boolean;
    phoneMatch?: boolean;
    licenseMatch?: boolean;
    entityMatch?: boolean;
  };
  lastCheckedAt: string;
};

export interface ContactSignalEnrichment {
  contactSignal: boolean;
  contactSignalConfidence?: ContactConfidence;
  contactSignalSources?: string[];
  contacts: EnrichedContact[];
  primaryContactId?: string;
}
