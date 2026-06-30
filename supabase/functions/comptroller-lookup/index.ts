const CPA_BASE_URL = "https://api.comptroller.texas.gov/public-data/v1/public";

type LookupMode =
  | "sales_location_zip"
  | "sales_location_name"
  | "sales_taxpayer_name"
  | "sales_taxpayer_id"
  | "franchise_name"
  | "franchise_taxpayer_id";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = Deno.env.get("TEXAS_COMPTROLLER_API_KEY");

    console.log("Texas Comptroller API key loaded:", Boolean(apiKey));

    if (!apiKey) {
      return jsonResponse(
        { error: "Missing Texas Comptroller API key in Supabase secrets" },
        500
      );
    }

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") as LookupMode | null;

    const page = safePage(url.searchParams.get("page"));
    const pageSize = safePageSize(url.searchParams.get("pageSize"));

    let endpoint = "";

    switch (mode) {
      case "sales_location_zip": {
        const zip = clean(url.searchParams.get("zip"));

        if (!zip || !/^\d{5}$/.test(zip)) {
          return jsonResponse({ error: "Valid 5-digit ZIP is required" }, 400);
        }

        endpoint =
          `/sales-tax-payer-location` +
          `?ZIPCODE=${encodeURIComponent(zip)}` +
          `&page=${page}` +
          `&pageSize=${pageSize}` +
          `&sortBy=PERMIT_START_DT` +
          `&sortOrder=DESC`;

        break;
      }

      case "sales_location_name": {
        const locationName = clean(url.searchParams.get("locationName"));

        if (!locationName || locationName.length < 2) {
          return jsonResponse({ error: "Location name is required" }, 400);
        }

        endpoint =
          `/sales-tax-payer-location` +
          `?LOCATION_NAME=${encodeURIComponent(locationName)}` +
          `&page=${page}` +
          `&pageSize=${pageSize}`;

        break;
      }

      case "sales_taxpayer_name": {
        const businessName = clean(url.searchParams.get("businessName"));

        if (!businessName || businessName.length < 2) {
          return jsonResponse({ error: "Business name is required" }, 400);
        }

        endpoint =
          `/sales-tax-payer` +
          `?searchType=legalName` +
          `&BUSINESS_NAME=${encodeURIComponent(businessName)}` +
          `&STATUS=ACTIVE` +
          `&page=${page}` +
          `&pageSize=${pageSize}`;

        break;
      }

      case "sales_taxpayer_id": {
        const taxpayerId = clean(url.searchParams.get("taxpayerId"));

        if (!taxpayerId || !/^\d{11}$/.test(taxpayerId)) {
          return jsonResponse(
            { error: "Valid 11-digit taxpayer ID is required" },
            400
          );
        }

        endpoint = `/sales-tax-payer/${encodeURIComponent(taxpayerId)}`;

        break;
      }

      case "franchise_name": {
        const name = clean(url.searchParams.get("name"));

        if (!name || name.length < 2 || name.length > 50 || /[<>]/.test(name)) {
          return jsonResponse(
            { error: "Entity name must be 2-50 characters and cannot contain < or >" },
            400
          );
        }

        endpoint = `/franchise-tax-list?name=${encodeURIComponent(name)}`;

        break;
      }

      case "franchise_taxpayer_id": {
        const taxpayerId = clean(url.searchParams.get("taxpayerId"));

        if (!taxpayerId || !/^\d{9}$|^\d{11}$/.test(taxpayerId)) {
          return jsonResponse(
            { error: "Valid 9-digit or 11-digit taxpayer ID is required" },
            400
          );
        }

        if (taxpayerId.length === 11) {
          endpoint = `/franchise-tax/${encodeURIComponent(taxpayerId)}`;
        } else {
          endpoint = `/franchise-tax-list?taxpayerId=${encodeURIComponent(
            taxpayerId
          )}`;
        }

        break;
      }

      default:
        return jsonResponse(
          {
            error: "Invalid lookup mode",
            validModes: [
              "sales_location_zip",
              "sales_location_name",
              "sales_taxpayer_name",
              "sales_taxpayer_id",
              "franchise_name",
              "franchise_taxpayer_id",
            ],
          },
          400
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    console.log("[comptroller-lookup] Calling CPA API", {
      mode,
      endpoint,
      keyLength: apiKey.length,
    });

    const cpaResponse = await fetch(`${CPA_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    let result: unknown = null;

    try {
      result = await cpaResponse.json();
    } catch {
      result = null;
    }

    if (!cpaResponse.ok) {
      console.error("[comptroller-lookup] CPA request failed", {
        mode,
        endpoint,
        status: cpaResponse.status,
        statusText: cpaResponse.statusText,
        result: truncateLogValue(result),
      });

      return jsonResponse(
        {
          error: "Texas Comptroller API request failed",
          status: cpaResponse.status,
          details: normalizeComptrollerError(cpaResponse.status),
          result,
        },
        cpaResponse.status
      );
    }

    return jsonResponse({
      source: "Texas Comptroller of Public Accounts",
      mode,
      status: cpaResponse.status,
      result,
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === "AbortError";

    console.error("[comptroller-lookup] Unhandled failure", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      isTimeout,
    });

    return jsonResponse(
      {
        error: isTimeout
          ? "Texas Comptroller API request timed out"
          : "Comptroller lookup failed",
        details: error instanceof Error ? error.message : String(error),
      },
      isTimeout ? 504 : 500
    );
  }
});

function clean(value: string | null): string | null {
  return value?.trim() || null;
}

function safePage(value: string | null): number {
  const parsed = Number(value ?? "1");

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function safePageSize(value: string | null): number {
  const parsed = Number(value ?? "100");

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }

  return Math.min(parsed, 100);
}

function normalizeComptrollerError(status: number): string {
  switch (status) {
    case 400:
      return "Bad request. Check the query parameters.";
    case 401:
      return "Unauthorized. Check the Texas Comptroller API key.";
    case 403:
      return "Forbidden. The API key may not have access.";
    case 404:
      return "No matching Comptroller record found.";
    case 413:
      return "Response too large. Narrow the query.";
    case 429:
      return "Rate limited by Texas Comptroller API.";
    case 500:
      return "Texas Comptroller API server error.";
    default:
      return "Unexpected Texas Comptroller API response.";
  }
}

function truncateLogValue(value: unknown): unknown {
  if (typeof value === "object") {
    const serialized = JSON.stringify(value);
    return serialized ? serialized.slice(0, 500) : String(value);
  }

  return typeof value === "string" ? value.slice(0, 500) : value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
  });
}
