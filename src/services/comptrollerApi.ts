import { supabase } from "../lib/supabase";

export type ComptrollerLookupMode =
  | "sales_location_zip"
  | "sales_location_name"
  | "sales_taxpayer_name"
  | "sales_taxpayer_id"
  | "franchise_name"
  | "franchise_taxpayer_id";

type LookupParams = {
  mode: ComptrollerLookupMode;
  zip?: string;
  locationName?: string;
  businessName?: string;
  taxpayerId?: string;
  name?: string;
  page?: number;
  pageSize?: number;
};

export async function lookupComptroller(params: LookupParams) {
  const query = new URLSearchParams();

  query.set("mode", params.mode);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 100));

  if (params.zip) query.set("zip", params.zip);
  if (params.locationName) query.set("locationName", params.locationName);
  if (params.businessName) query.set("businessName", params.businessName);
  if (params.taxpayerId) query.set("taxpayerId", params.taxpayerId);
  if (params.name) query.set("name", params.name);

  const { data, error } = await supabase.functions.invoke(
    `comptroller-lookup?${query.toString()}`,
    {
      method: "GET",
    }
  );

  if (error) {
    throw new Error(error.message || "Texas Comptroller lookup failed");
  }

  return data;
}

export async function lookupComptrollerByZip(zip: string) {
  return lookupComptroller({
    mode: "sales_location_zip",
    zip,
    page: 1,
    pageSize: 100,
  });
}

export async function lookupComptrollerByLocationName(locationName: string) {
  return lookupComptroller({
    mode: "sales_location_name",
    locationName,
    page: 1,
    pageSize: 50,
  });
}

export async function lookupComptrollerByBusinessName(businessName: string) {
  return lookupComptroller({
    mode: "sales_taxpayer_name",
    businessName,
    page: 1,
    pageSize: 25,
  });
}

export async function lookupSalesTaxpayerById(taxpayerId: string) {
  return lookupComptroller({
    mode: "sales_taxpayer_id",
    taxpayerId,
  });
}

export async function lookupFranchiseByName(name: string) {
  return lookupComptroller({
    mode: "franchise_name",
    name,
    page: 1,
    pageSize: 25,
  });
}

export async function lookupFranchiseByTaxpayerId(taxpayerId: string) {
  return lookupComptroller({
    mode: "franchise_taxpayer_id",
    taxpayerId,
  });
}
