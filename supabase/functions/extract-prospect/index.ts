const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanBase64(input?: string | null) {
  if (!input) return null;
  return input.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const model =
      Deno.env.get("CLAUDE_API_MODEL") || "claude-haiku-4-5-20251001";

    if (!anthropicKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Missing ANTHROPIC_API_KEY in Supabase Edge Function secrets.",
        },
        500
      );
    }

    const body = await req.json();

    const {
      imageBase64,
      mimeType = "image/jpeg",
      text,
      mode = "leadlock",
      context = "",
    } = body;

    const content: any[] = [];

    const cleanedImage = cleanBase64(imageBase64);

    if (cleanedImage) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: cleanedImage,
        },
      });
    }

    let systemPrompt = "";

    if (mode === "multi-business") {
      systemPrompt = `
Analyze this photo and identify ALL visible businesses/storefronts.

Context: ${context}

For each business visible, extract:
1. Business name/signage (or description if sign unclear)
2. Visible address (street number, street name)
3. Business type (restaurant, retail, office, medical, etc.)
4. Approximate position in photo (left, center, right, top, bottom)
5. Confidence level (high, medium, low)
6. Any visible indicators of pest risk (dumpsters, loading areas, visible damage, etc.)

Return ONLY valid JSON with this structure (no markdown, no preamble):
{
  "businesses": [
    {
      "name": "string",
      "signage": "string (what the sign says)",
      "address": "string (street only, no city)",
      "businessType": "string",
      "position": "string",
      "confidence": "string (high/medium/low)",
      "pestIndicators": ["string array"],
      "notes": "string"
    }
  ],
  "totalDetected": number,
  "analysisNotes": "string"
}
`.trim();
    } else {
      systemPrompt = `
You are extracting sales prospect information for LeadLens.

Mode: ${mode}
Context: ${context}

Extract any available business/prospect data.

Return ONLY valid JSON with this structure:
{
  "businessName": "",
  "firstName": "",
  "lastName": "",
  "phone": "",
  "email": "",
  "website": "",
  "streetNumber": "",
  "streetName": "",
  "addressLine2": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": 0,
  "notes": ""
}

Rules:
- Do not guess.
- Leave unknown fields blank.
- Split street number and street name correctly.
- Put suite/unit/building in addressLine2.
- Use confidence from 0 to 100.
- No markdown.
- No explanations.

Raw text, if available:
${text || ""}
`.trim();
    }

    content.push({
      type: "text",
      text: systemPrompt,
    });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: "You are a helpful sales lead extraction assistant.",
        messages: [
          {
            role: "user",
            content: content,
          },
        ],
      }),
    });

    const claudeJson = await claudeRes.json();

    if (!claudeRes.ok) {
      return jsonResponse(
        {
          ok: false,
          error: "Claude API error",
          status: claudeRes.status,
          details: claudeJson,
        },
        claudeRes.status
      );
    }

    const outputText =
      claudeJson?.content?.find((part: any) => part.type === "text")?.text ||
      "";

    let parsed;

    try {
      parsed = JSON.parse(
        outputText
          .replace(/^```json/i, "")
          .replace(/^```/i, "")
          .replace(/```$/i, "")
          .trim()
      );
    } catch (_err) {
      return jsonResponse({
        ok: true,
        result: null,
        raw: outputText,
        warning: "Claude responded, but JSON parsing failed.",
      });
    }

    return jsonResponse({
      ok: true,
      result: parsed,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});